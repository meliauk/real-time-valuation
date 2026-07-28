/**
 * 持仓权重加权算估值涨跌幅
 *
 * T+2 基金净值确认滞后，盘中靠持仓股票涨跌按占比加权推算估值涨跌（gszzl）。
 *
 * 公式：totalChange = Σ(ratio × changeRate / 100)，返回百分数形式（如 2 = 2%）。
 *   - ratio 为持仓占比（%），changeRate 为股票涨跌（%），两者都是百分数，除以100转小数后加权。
 *   - 只累加有 changeRate 的股票；至少一只有数据才算得出，否则返回 null（不覆盖已有估值）。
 *
 * 注意：涨跌 Map 按"持仓里的 stockCode 原样"取值（merge 时已双 key 写入：原始码 + 归一化码），
 * 故本函数不关心代码归一化，直接 get(h.stockCode)。
 */

import type { EstimatedHoldingItem, HoldingDetailItem } from '@/modules/fund/fund-types'
import type { StockQuoteInfo } from '@/shared/types/common-types'

type HoldingItem = EstimatedHoldingItem | HoldingDetailItem

/**
 * 从持仓列表和涨跌 Map 计算估值涨跌幅。
 * @param holdings    持仓列表（含 ratio）
 * @param quoteMap    股票涨跌 Map（key 与 holdings 的 stockCode 对齐）
 * @returns 加权涨跌（百分数形式，如 2 = 2%），null=无任何股票有数据
 *   单位说明：ratio（持仓占比 %）× changeRate（股票涨跌 %）÷ 100 = 百分数形式的加权涨跌；
 *   下游 gz = dwjz×(1+gszzl/100)、displayRate(gszzl) 均按百分数处理，勿当小数。
 */
export function computeEstimatedGszzlFromPrevDay(
  holdings: HoldingItem[],
  quoteMap: Map<string, StockQuoteInfo>,
): number | null {
  let totalChange = 0
  let hasData = false

  for (const h of holdings) {
    const info = quoteMap.get(h.stockCode)
    if (info && info.changeRate != null) {
      totalChange += h.ratio * info.changeRate / 100
      hasData = true
    }
  }

  return hasData ? totalChange : null
}
