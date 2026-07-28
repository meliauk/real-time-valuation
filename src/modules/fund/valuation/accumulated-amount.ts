/**
 * 累计持有金额推算
 *
 * 从基金历史净值逐日累加涨跌，得到累计持有金额。
 * 纯涨跌累加（amount = amount × (1 + rate/100)），不涉及 shares × dwjz 的净值乘法，
 * 消除份额浮点来回传播的精度问题。
 *
 * 口径：
 *   - 从净值序列中找持仓日期之后的第一个净值点作为起点（amount = initialAmount）；
 *   - 之后每个交易日按 (curr/prev - 1) × 100 算当日涨跌，amount 累乘；
 *   - 最终 roundMoney 截2位。
 *   - 无足够净值序列或持仓日期之后无数据 → 返回 initialAmount（无法推算）。
 *
 * 数据源：东方财富 pingzhongdata（Data_netWorthTrend 净值序列）。
 */

import dayjs from 'dayjs'
import { API_URLS, LSJZ_CONFIG } from '@/config/constants'
import { loadScriptVar } from '@/shared/net/jsonp-main'
import { safeParseFloat, roundMoney } from '@/shared/utils/safe-math'
import { isValidFundCode } from '@/shared/utils/validation'

/** pingzhongdata 净值序列条目 */
interface NetWorthPoint {
  /** 时间戳（毫秒） */
  x: number
  /** 单位净值（可能为字符串或数字） */
  y: number | string
}

/**
 * 从基金历史净值推算累计持有金额。
 * @param fundCode      基金代码
 * @param holdingDate   持仓日期 YYYY-MM-DD
 * @param initialAmount 初始本金
 * @returns 累计持有金额（截2位），无法推算返回 initialAmount
 */
export async function computeAccumulatedAmountFromRates(
  fundCode: string,
  holdingDate: string,
  initialAmount: number,
): Promise<number> {
  if (initialAmount <= 0) return initialAmount
  if (!isValidFundCode(fundCode)) return initialAmount

  try {
    const data = await loadScriptVar<NetWorthPoint[]>(
      `${API_URLS.FUND_DETAIL}${fundCode}.js?rt=${Date.now()}`,
      'Data_netWorthTrend',
      LSJZ_CONFIG.TIMEOUT,
    )
    if (!Array.isArray(data) || data.length < 2) return initialAmount

    // 提取净值序列，按日期升序
    const navSeries = data
      .filter((d) => d && typeof d.x === 'number' && Number.isFinite(Number(d.y)))
      .map((d) => ({ date: dayjs(d.x).format('YYYY-MM-DD'), value: Number(d.y) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (navSeries.length < 2) return initialAmount

    // 找持仓日期之后的第一个净值点
    const startIdx = navSeries.findIndex((d) => d.date >= holdingDate)
    if (startIdx < 0) return initialAmount

    // 从持仓日起逐日按涨跌累加（保持完整精度）
    let amount = initialAmount
    for (let i = startIdx + 1; i < navSeries.length; i++) {
      const prev = navSeries[i - 1].value
      const curr = navSeries[i].value
      if (prev <= 0) continue
      const rate = (curr / prev - 1) * 100
      amount = amount * (1 + rate / 100)
    }

    return roundMoney(amount)
  } catch {
    return initialAmount
  }
}
