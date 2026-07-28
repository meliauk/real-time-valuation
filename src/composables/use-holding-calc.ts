/**
 * 持仓计算 Composable - 涨跌幅驱动模型
 * 今日盈亏 = 基数金额 × 涨跌幅/100
 * 累计盈亏 = 持有金额 - 投入本金（估算时含今日收益）
 */

import { computed } from 'vue'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { useFundStore } from '@/modules/fund/fund-store'
import { formatProfitWithColor } from '@/shared/utils/money-format'
import { roundMoney } from '@/shared/utils/safe-math'

export function useHoldingCalc(fundCode: () => string) {
  const holdingStore = useHoldingStore()
  const fundStore = useFundStore()

  /** 总份额 */
  const totalShares = computed(() => holdingStore.getTotalShares(fundCode()))

  /** 加权平均成本价 */
  const avgCostPrice = computed(() => holdingStore.getAvgCostPrice(fundCode()))

  /** 今日盈亏 = 基数金额 × 涨跌幅/100 */
  const todayProfit = computed(() => {
    if (totalShares.value <= 0) return 0
    const v = fundStore.getValuation(fundCode())
    const gszzl = v?.gszzl ?? 0
    const isEstimated = v?.isEstimated ?? true
    return holdingStore.calcFundTodayProfit(fundCode(), gszzl, v?.dwjz, gszzl, isEstimated)
  })

  /** 累计盈亏 = 持有金额 - 本金（复利累乘的精确结果）
   *  估算时不含今日收益，确认后才含 */
  const totalProfit = computed(() => {
    if (totalShares.value <= 0) return 0
    const v = fundStore.getValuation(fundCode())
    const gszzl = v?.gszzl ?? 0
    const isEstimated = v?.isEstimated ?? true
    const baseAmount = holdingStore.getFundHoldingAmount(fundCode(), v?.dwjz, gszzl, isEstimated)
    const principal = holdingStore.getPrincipal(fundCode())
    return roundMoney(baseAmount - principal)
  })

  /** 今日盈亏格式化 */
  const todayProfitFormatted = computed(() => formatProfitWithColor(todayProfit.value))

  /** 累计盈亏格式化 */
  const totalProfitFormatted = computed(() => formatProfitWithColor(totalProfit.value))

  /** 是否有持仓 */
  const hasHolding = computed(() => totalShares.value > 0)

  return {
    totalShares,
    avgCostPrice,
    todayProfit,
    totalProfit,
    todayProfitFormatted,
    totalProfitFormatted,
    hasHolding,
  }
}
