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
 *   - 无足够净值序列或持仓日期之后无数据 → amount = initialAmount（无法推算）。
 *   - 同时返回净值序列最新日期（已确认口径），供调用方校准 lastConfirmedDate 自愈断链。
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

/** 累计金额重算结果：amount 为累计持有金额，lastConfirmedDate 为净值序列最新日期 */
export interface AccumulatedAmountResult {
  /** 累计持有金额（截2位） */
  amount: number
  /** 净值序列最新（已确认）日期 YYYY-MM-DD，取数失败为空串 */
  lastConfirmedDate: string
}

/**
 * 从基金历史净值推算累计持有金额（同时返回最新已确认日期）。
 * @param fundCode      基金代码
 * @param holdingDate   持仓日期 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss（自动取日期前缀）
 * @param initialAmount 初始本金
 * @returns { amount, lastConfirmedDate }，无法推算时 amount=initialAmount、lastConfirmedDate 视净值序列而定
 */
export async function computeAccumulatedAmountFromRatesWithDate(
  fundCode: string,
  holdingDate: string,
  initialAmount: number,
): Promise<AccumulatedAmountResult> {
  if (initialAmount <= 0) return { amount: initialAmount, lastConfirmedDate: '' }
  if (!isValidFundCode(fundCode)) return { amount: initialAmount, lastConfirmedDate: '' }

  try {
    const data = await loadScriptVar<NetWorthPoint[]>(
      `${API_URLS.FUND_DETAIL}${fundCode}.js?rt=${Date.now()}`,
      'Data_netWorthTrend',
      LSJZ_CONFIG.TIMEOUT,
    )
    if (!Array.isArray(data) || data.length < 2) return { amount: initialAmount, lastConfirmedDate: '' }

    // 提取净值序列，按日期升序
    const navSeries = data
      .filter((d) => d && typeof d.x === 'number' && Number.isFinite(Number(d.y)))
      .map((d) => ({ date: dayjs(d.x).format('YYYY-MM-DD'), value: Number(d.y) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (navSeries.length < 2) return { amount: initialAmount, lastConfirmedDate: '' }

    // holdingDate 可能带时分秒（addHoldingByAmount/addHoldingDirect 用 getNowStr() 写入
    // YYYY-MM-DD HH:mm:ss），与 navSeries 纯日期 YYYY-MM-DD 直接比较会因串长不同而误判。
    // 只取日期前缀，确保与净值序列口径一致。
    const holdingDateOnly = holdingDate.slice(0, 10)

    // 找持仓日期之后的第一个净值点
    const startIdx = navSeries.findIndex((d) => d.date >= holdingDateOnly)
    if (startIdx < 0) return { amount: initialAmount, lastConfirmedDate: navSeries[navSeries.length - 1].date }

    // 从持仓日起逐日按涨跌累加（保持完整精度）
    let amount = initialAmount
    for (let i = startIdx + 1; i < navSeries.length; i++) {
      const prev = navSeries[i - 1].value
      const curr = navSeries[i].value
      if (prev <= 0) continue
      const rate = (curr / prev - 1) * 100
      amount = amount * (1 + rate / 100)
    }

    // 同时返回最新已确认净值日期，供调用方校准 lastConfirmedDate。
    const lastConfirmedDate = navSeries[navSeries.length - 1].date
    return { amount: roundMoney(amount), lastConfirmedDate }
  } catch {
    return { amount: initialAmount, lastConfirmedDate: '' }
  }
}

/** 兼容入口：仅返回累计金额数值。 */
export async function computeAccumulatedAmountFromRates(
  fundCode: string,
  holdingDate: string,
  initialAmount: number,
): Promise<number> {
  const r = await computeAccumulatedAmountFromRatesWithDate(fundCode, holdingDate, initialAmount)
  return r.amount
}
