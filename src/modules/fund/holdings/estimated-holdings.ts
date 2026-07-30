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
import { fetchTop10FromMobileApi } from './f10-mobile-fetch'
import { fetchTop10FromPingzhong, enrichMarketCodeFromPingzhong, loadPingzhongHoldings, type PingzhongPreloaded } from './pingzhong-holdings-fetch'
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

  // 占比数据：优先东财移动端 API（FundMNInverstPosition，浏览器 fetch 可直连，含代码+名称+占比），
  // 失败回退 pingzhong stockCodesNew（仅代码、名称由腾讯报价回填、占比 0）。
  // 有了占比即可做持仓股票加权推算实时预测（computeEstimatedGszzlFromPrevDay 用 ratio×changeRate）。
  let top10: FundAllHoldings | null = await fetchTop10FromMobileApi(fundCode)
  let fallbackUsed = false
  if (!top10 || top10.holdings.length === 0) {
    top10 = await fetchTop10FromPingzhong(fundCode, preloaded)
    fallbackUsed = true
  }
  if (top10 && top10.holdings.length > 0) {
    // 是否有真实占比（移动端 API 成功）；pingzhong 兜底时 ratio=0，描述如实标注"无占比"
    const hasRatio = !fallbackUsed && top10.holdings.some(h => h.ratio > 0)

    // ===== 市场归属补全：用 pingzhong stockCodesNew 的权威 emMarketCode 覆盖 mobile 的猜测 =====
    // 缘由：mobile GPDM 是裸码，韩股 000660 会被 parseGpdm 误判深市 A 股 → 走东财腾讯取不到 → 涨跌缺失。
    // pingzhong 的 stockCodesNew 带 emCode 前缀（如 130.000660）是权威市场归属。
    //   - 详情页（有 preloaded）：同步补全（无 IO，复用预加载），补完即返回，首屏即正确。
    //   - 首页 bootstrap（无 preloaded）：立即返回未补全结果（首屏不阻塞），后台注入 script 补全，
    //     设 holdingsEnrichedReady 让 store 写回缓存 + 触发 recompute（韩股随后自愈）。
    // pingzhong 兜底路径（fallbackUsed）的 holdings 已自带正确 emCode，无需再补。
    let holdingsEnrichedReady: Promise<void> | undefined
    if (!fallbackUsed) {
      if (preloaded?.stockCodesNew != null) {
        // 同步：详情页预加载已在内存，直接补全
        const pz = await loadPingzhongHoldings(fundCode, preloaded)
        if (pz) enrichMarketCodeFromPingzhong(top10.holdings, pz)
      } else {
        // 异步：首页无预加载，先 resolve 占位结果，后台补全
        let resolveEnriched: () => void = () => {}
        holdingsEnrichedReady = new Promise<void>((r) => { resolveEnriched = r })
        void (async () => {
          try {
            const pz = await loadPingzhongHoldings(fundCode)
            if (pz) enrichMarketCodeFromPingzhong(top10!.holdings, pz)
          } catch { /* 静默，补全失败保留 mobile 猜测值 */ }
          resolveEnriched()
        })()
      }
    }

    return {
      fundCode,
      quarterReportDate: top10.reportDate,
      annualReportDate: '',
      description: hasRatio ? '前十大重仓及占比' : '前十大重仓（无占比，无法加权推算）',
      holdings: top10.holdings.map(h => ({ ...h, isEstimated: false })),
      optimizationMeta: { method: 'proportional-scaling', navDaysUsed: 0, stockCoverage: 0 },
      holdingsEnrichedReady,
    }
  }
  // pingzhong 也取不到（无 stockCodesNew）→ 真·无持仓数据
  return null
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
