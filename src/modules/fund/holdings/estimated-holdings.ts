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

  // 占比数据纯前端无法获取（F10 script 注入被 Referer 拒、公共代理全超时），推算全量无意义。
  // 直接走前十大（pingzhong stockCodesNew：有代码，名称由腾讯报价回填），跳过 F10 全量轮询
  // 避免 QUARTER_YEAR_OFFSET_MAX 年 × 4代理超时导致首屏数十秒卡顿。
  let top10: FundAllHoldings | null = await fetchTop10FromPingzhong(fundCode, preloaded)
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
