/**
 * T+2 持仓推算
 *
 * QDII/FOF 等 T+2 基金净值确认滞后 2 天，盘中需靠持仓股票涨跌加权推算估值。
 * 但季报只披露前十大，非前十大需推算。算法：
 *   1. 取最近季报前十大 + 最近全量报告（年报/半年报）；
 *   2. 比例缩放：非前十大从全量报告按比例推算，上限不超过前十大最小权重；
 *   3. 若持仓股有足够涨跌数据（≥门槛），用单日净值涨跌约束优化器反推权重；
 *   4. 后台异步拉取持仓股行情填充 stockQuoteMap（不阻塞持仓展示）。
 *
 * 已是全量报告（年报/半年报）则无需推算，直接返回。
 * 持仓股票行情取数通过 fetchStockQuotes 回调注入（由 service 层实现三档分流+Worker调度），
 * 本模块不硬依赖具体取数源。
 */

import type { EstimatedHoldings, EstimatedHoldingItem, FundAllHoldings, OptimizationMeta } from '@/modules/fund/fund-types'
import type { StockQuoteInfo } from '@/shared/types/common-types'
import { ESTIMATE_CONFIG } from '@/config/constants'
import { isValidFundCode } from '@/shared/utils/validation'
import { fetchFundAllHoldings, fetchFundTop10Holdings } from './f10-holdings-fetch'
import { fetchTop10FromPingzhong, type PingzhongPreloaded } from './pingzhong-holdings-fetch'
import { optimizeHoldings } from './holdings-optimizer'
import { fetchLatestNavChange } from '../valuation/nav-fetch'

/** 持仓股票行情取数回调（由 service 层注入：A/HK/US→腾讯Worker、其他→YahooWorker） */
export type FetchStockQuotes = (
  entries: { stockCode: string; emMarketCode?: string; stockName?: string }[],
  mode: 'close' | 'realtime',
) => Promise<Map<string, StockQuoteInfo>>

/** 默认行情取数（占位：返回空 Map，实际由 service 注入；防调用方未注入时静默降级） */
const noopFetchStockQuotes: FetchStockQuotes = async () => new Map()

/**
 * 推算完整持仓。
 * @param fundCode       基金代码
 * @param year           指定年份（空=当年）
 * @param fetchStockQuotes 持仓股票行情取数回调（注入），默认占位
 * @param preloaded      预加载的 pingzhong 数据（来自 getFundFullData 透出的 stockCodesNew），
 *                       传给 fetchTop10FromPingzhong 避免二次 script 注入
 */
export async function fetchEstimatedHoldings(
  fundCode: string,
  year?: string,
  fetchStockQuotes: FetchStockQuotes = noopFetchStockQuotes,
  preloaded?: PingzhongPreloaded,
): Promise<EstimatedHoldings | null> {
  if (!isValidFundCode(fundCode)) return null

  const curYear = year || String(new Date().getFullYear())

  // 1. 取最近季报（从当年往前找，最多 QUARTER_YEAR_OFFSET_MAX 年）
  let quarterResult: FundAllHoldings | null = null
  for (let offset = 0; offset <= ESTIMATE_CONFIG.QUARTER_YEAR_OFFSET_MAX; offset++) {
    const y = String(Number(curYear) - offset)
    const r = await fetchFundAllHoldings(fundCode, { year: y, full: true })
    if (r && r.holdings.length > 0) { quarterResult = r; break }
  }
  // 季报全量都取不到（接口失败/新基金）→ 降级取十大重仓，保证至少展示十大，不空白
  // F10 持仓接口已失效 → 先试 F10 十大（保兼容），失败再用 pingzhong 的 stockCodesNew 兜底
  if (!quarterResult) {
    let top10: FundAllHoldings | null = await fetchFundTop10Holdings(fundCode)
    // F10 失效兜底：pingzhong stockCodesNew 取前十大（无比例无名称，比例显示--，名称由腾讯报价回填）
    if (!top10 || top10.holdings.length === 0) {
      top10 = await fetchTop10FromPingzhong(fundCode, preloaded)
    }
    if (top10 && top10.holdings.length > 0) {
      return {
        fundCode,
        quarterReportDate: top10.reportDate,
        annualReportDate: '',
        description: '无完整报告，仅显示前十大重仓',
        holdings: top10.holdings.map(h => ({ ...h, isEstimated: false })),
        optimizationMeta: { method: 'proportional-scaling', navDaysUsed: 0, stockCoverage: 0 },
      }
    }
    // 连十大都取不到才真正放弃
    return null
  }

  // 已是全量披露（年报/半年报），无需推算
  if (quarterResult.isFull) {
    return {
      fundCode,
      quarterReportDate: quarterResult.reportDate,
      annualReportDate: '',
      description: `${quarterResult.reportType}为全量披露，无需推算`,
      holdings: quarterResult.holdings.map(h => ({ ...h, isEstimated: false })),
      optimizationMeta: { method: 'proportional-scaling', navDaysUsed: 0, stockCoverage: 1 },
    }
  }

  // 2. 取最近全量报告（年报优先，从季报年份往前找，最多 ANNUAL_YEAR_OFFSET_MAX 年）
  let annual: FundAllHoldings | null = null
  const quarterYear = Number(quarterResult.reportDate.substring(0, 4))
  for (let offset = 1; offset <= ESTIMATE_CONFIG.ANNUAL_YEAR_OFFSET_MAX; offset++) {
    const y = String(quarterYear - offset)
    const ann = await fetchFundAllHoldings(fundCode, { year: y, full: true, month: '4' })
    if (ann && ann.isFull) { annual = ann; break }
    const semi = await fetchFundAllHoldings(fundCode, { year: y, full: true, month: '2' })
    if (semi && semi.isFull) { annual = semi; break }
  }

  if (!annual || !annual.isFull) {
    // 无全量报告：仅返回季报前十大
    return {
      fundCode,
      quarterReportDate: quarterResult.reportDate,
      annualReportDate: '',
      description: '无最近全量报告数据，仅显示季报持仓',
      holdings: quarterResult.holdings.map(h => ({ ...h, isEstimated: false })),
      optimizationMeta: { method: 'proportional-scaling', navDaysUsed: 0, stockCoverage: 0 },
    }
  }

  // 3. 比例缩放作基准（立即返回展示，不等行情取数）
  const baseline = estimateHoldings(fundCode, quarterResult, annual)

  // 后台行情填充（不阻塞）：拉取持仓股 close 涨跌，写入共享 stockQuoteMap
  const stockQuoteMap = new Map<string, StockQuoteInfo>()
  const stockQuotesReady = (async (): Promise<void> => {
    try {
      const fetched = await fetchStockQuotes(
        baseline.holdings.map(h => ({ stockCode: h.stockCode, emMarketCode: h.emMarketCode, stockName: h.stockName })),
        'close',
      )
      for (const [code, info] of fetched) {
        if (info.changeRate != null || info.closed) stockQuoteMap.set(code, info)
      }
      // 二次补拉首次未取到的
      const missing = baseline.holdings
        .filter(h => {
          const info = stockQuoteMap.get(h.stockCode)
          return !info || (info.changeRate == null && !info.closed)
        })
        .map(h => ({ stockCode: h.stockCode, emMarketCode: h.emMarketCode, stockName: h.stockName }))
      if (missing.length > 0) {
        const extra = await fetchStockQuotes(missing, 'close')
        for (const [code, info] of extra) {
          if (info.changeRate != null || info.closed) stockQuoteMap.set(code, info)
        }
      }
    } catch {
      // 静默：涨跌缺失降级为不参与加权，不影响持仓展示
    }
  })()

  // 等净值约束（国内接口，快），不等 Yahoo
  const navRecord = await fetchLatestNavChange(fundCode)
  if (!navRecord) {
    return {
      ...baseline,
      optimizationMeta: { method: 'proportional-scaling', navDaysUsed: 0, stockCoverage: 0 },
      stockQuoteMap, stockQuotesReady,
    }
  }

  // 4. 构建优化器输入
  const top10Codes = new Set(quarterResult.holdings.slice(0, 10).map(h => h.stockCode))
  const initialWeights = new Map<string, number>()
  const stockReturns = new Map<string, Map<string, number>>()
  let stocksWithData = 0
  let totalWeightWithData = 0

  for (const h of baseline.holdings) {
    initialWeights.set(h.stockCode, h.ratio)
    const info = stockQuoteMap.get(h.stockCode)
    if (info && info.changeRate != null) {
      const dateMap = new Map<string, number>()
      dateMap.set(navRecord.date, info.changeRate / 100)
      stockReturns.set(h.stockCode, dateMap)
      stocksWithData++
      totalWeightWithData += h.ratio
    }
  }
  const stockCoverage = baseline.holdings.length > 0 ? stocksWithData / baseline.holdings.length : 0

  // 数据不足门槛：用纯比例缩放，不优化
  if (stocksWithData < ESTIMATE_CONFIG.STOCKS_WITH_DATA_MIN || totalWeightWithData < ESTIMATE_CONFIG.WEIGHT_WITH_DATA_MIN) {
    return {
      ...baseline,
      optimizationMeta: { method: 'proportional-scaling', navDaysUsed: 1, stockCoverage },
      stockQuoteMap, stockQuotesReady,
    }
  }

  // 5. 优化器反推权重（前十大锁定，非十大可调）
  const minTop10Ratio = quarterResult.holdings.slice(0, 10).reduce((min, h) => Math.min(min, h.ratio), Infinity)
  const optResult = optimizeHoldings({
    fundDates: [navRecord.date],
    fundReturns: [navRecord.changeRate / 100],
    stockReturns,
    initialWeights,
    top10Codes,
    config: { ...ESTIMATE_CONFIG.OPTIMIZER, weightCap: minTop10Ratio },
  })

  // 6. 合并优化结果
  const holdings: EstimatedHoldingItem[] = []
  const droppedSet = new Set(optResult.droppedCodes)
  for (const h of baseline.holdings) {
    if (droppedSet.has(h.stockCode)) continue
    if (optResult.weights.has(h.stockCode)) {
      const w = optResult.weights.get(h.stockCode)!
      if (w <= 0) continue
      holdings.push({ ...h, ratio: w, isEstimated: !top10Codes.has(h.stockCode) })
    } else {
      if (h.ratio <= 0) continue
      holdings.push(h)
    }
  }
  holdings.sort((a, b) => b.ratio - a.ratio)

  const meta: OptimizationMeta = {
    method: 'optimization',
    navDaysUsed: 1,
    stockCoverage,
    droppedStocks: optResult.droppedCodes,
  }

  return {
    fundCode,
    quarterReportDate: quarterResult.reportDate,
    annualReportDate: annual.reportDate,
    description: `基于${quarterResult.reportType}结合${annual.reportDate.substring(0, 4)}年${annual.reportType}单日约束优化推算，共 ${holdings.length} 支`,
    holdings,
    optimizationMeta: meta,
    stockQuoteMap, stockQuotesReady,
  }
}

/**
 * 比例缩放核心算法 - 非前十大从全量报告按比例推算。
 * 前十大保留季报原值；非前十大从年报全量持仓按其在"非前十大总量"中的占比，
 * 分配到"剩余仓位"（100 - 前十大总量），单只上限不超过前十大最小权重。
 */
export function estimateHoldings(
  fundCode: string,
  quarter: FundAllHoldings,
  annual: FundAllHoldings,
): EstimatedHoldings {
  const qHoldings = quarter.holdings.slice(0, 10)
  const aHoldings = annual.holdings
  const qCodeSet = new Set(qHoldings.map(h => h.stockCode))
  const top10TotalRatio = qHoldings.reduce((sum, h) => sum + h.ratio, 0)
  const remainingRatio = 100 - top10TotalRatio
  const minTop10Ratio = qHoldings.length > 0
    ? qHoldings.reduce((min, h) => Math.min(min, h.ratio), Infinity)
    : 0

  // 年报中不在季报前十大的股票
  const nonTop10InAnnual = aHoldings.filter(h => !qCodeSet.has(h.stockCode))
  const annualNonTop10Total = nonTop10InAnnual.reduce((sum, h) => sum + h.ratio, 0)

  const results: EstimatedHoldingItem[] = []
  // 前十大原样保留
  for (const h of qHoldings) {
    results.push({ ...h, isEstimated: false })
  }

  if (annualNonTop10Total > 0 && remainingRatio > 0) {
    // 按占比分配剩余仓位
    const uncapped = nonTop10InAnnual.map(h => ({
      ...h,
      estimatedRatio: (h.ratio / annualNonTop10Total) * remainingRatio,
    }))

    // 单只上限 minTop10Ratio，四舍五入 2 位
    let cappedTotal = 0
    const cappedItems: EstimatedHoldingItem[] = []
    for (const h of uncapped) {
      const raw = Math.min(h.estimatedRatio, minTop10Ratio)
      const rounded = Math.round(raw * 100) / 100
      if (rounded <= 0) continue
      cappedTotal += rounded
      cappedItems.push({ ...h, ratio: rounded, isEstimated: true })
    }

    // 若超总仓位，按比例缩回
    if (cappedTotal > remainingRatio && cappedItems.length > 0) {
      const scale = remainingRatio / cappedTotal
      for (const item of cappedItems) {
        item.ratio = Math.round(Math.min(item.ratio * scale, minTop10Ratio) * 100) / 100
        if (item.ratio > 0) results.push(item)
      }
    } else {
      results.push(...cappedItems.filter(item => item.ratio > 0))
    }
  }

  results.sort((a, b) => b.ratio - a.ratio)

  return {
    fundCode,
    quarterReportDate: quarter.reportDate,
    annualReportDate: annual.reportDate,
    description: `基于${quarter.reportType}结合${annual.reportDate.substring(0, 4)}年${annual.reportType}持仓计算，共 ${results.length} 支`,
    holdings: results,
    optimizationMeta: { method: 'proportional-scaling', navDaysUsed: 0, stockCoverage: 0 },
  }
}
