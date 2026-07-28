/**
 * 昨日收盘涨跌计算
 *
 * 从日K线数组计算各市场昨日收盘涨跌幅。Worker（腾讯日K主源）与主线程共用此口径。
 *
 * klines 格式：["date,open,close,high,low,vol,vol", ...]（腾讯/东财统一逗号串）。
 *
 * 昨日口径（按市场时区分流）：
 *   - A股/港股（与北京同时区）：用 previousClosedDay。已收盘时排除今日，取真正的"昨天"。
 *   - 美股（跨时区，比北京晚12h）：用 lastClosedDay（美东最近已收盘交易日）。
 *     避免美东7.7已收却取到7.6（previousClosedDay 会跳过刚收盘的7.7）。
 *
 * 休盘判定：klines 中不存在"昨日"bar → 该市场昨日休盘 → 返回 { closed: true }
 *   （UI 显示 --，加权跳过，loop 不丢 Yahoo 重试）。
 *
 * 副产品 realtimeRate：末根 bar 是今日（盘中/已收盘当日）时，今日收盘 vs 昨日收盘。
 *   实时涨跌主走腾讯报价链路，此处仅作日K内的副产品。
 */

import type { StockMarket } from '@/shared/types/common-types'
import { resolveMarketTradingDays } from '@/shared/market/trading-day'
import { stockMarketToTz } from '@/shared/market/market-classify'

/** 昨日收盘计算结果：正常涨跌 / 休盘 / 取数失败(null) */
export type PrevDayResult =
  | { changeRate: number; date: string; realtimeRate: number | null }
  | { closed: true }
  | null

/**
 * 从日K数组算昨日收盘涨跌。
 * @param klines 日K逗号串数组
 * @param market 股票市场（A/HK/US）
 */
export function calcPrevDayFromKlines(klines: string[], market: StockMarket): PrevDayResult {
  if (!klines || klines.length < 2) return null

  // 解析 klines → {date, close}[]
  const parsed: { date: string; close: number }[] = []
  for (const line of klines) {
    const parts = line.split(',')
    if (parts.length < 5) continue
    const date = parts[0].trim()
    const close = parseFloat(parts[2])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue
    parsed.push({ date, close })
  }
  if (parsed.length < 2) return null

  const tz = stockMarketToTz(market)
  // today 用各市场自己的当日（判定末根bar是否今日，用于realtimeRate）
  const { currentTradingDay: today } = resolveMarketTradingDays(tz)
  // 昨日统一锚定美股 lastClosedDay（全球基准日）：美股是最晚收盘的主要市场，
  // 美股收盘=全球交易日翻篇。所有市场昨日都取同一天，消除时差导致的不一致（如A股7.10/美股7.9）。
  // 美股未收盘时基准日维持前一收盘日；美股收盘后翻篇。realtime列显示当日涨跌，昨日列显示基准日涨跌。
  const yesterday = resolveMarketTradingDays('US').lastClosedDay

  // 找昨日 bar
  let yesterdayIdx = -1
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i].date === yesterday) { yesterdayIdx = i; break }
  }
  // 昨日 bar 不存在 → 该市场昨日休盘
  if (yesterdayIdx < 0) return { closed: true }

  // 昨日的前一交易日 bar（跳过休市日，取昨日之前最近的有 bar 的交易日）
  let prevIdx = -1
  for (let i = yesterdayIdx - 1; i >= 0; i--) {
    if (parsed[i].close > 0) { prevIdx = i; break }
  }
  if (prevIdx < 0) return null

  const yesterdayBar = parsed[yesterdayIdx]
  const prevDay = parsed[prevIdx]
  if (prevDay.close <= 0) return null
  const changeRate = Math.round((yesterdayBar.close - prevDay.close) / prevDay.close * 100 * 100) / 100

  // 今日实时涨跌：末根 bar 是今日时，今日收盘 vs 昨日收盘
  let realtimeRate: number | null = null
  const lastBar = parsed[parsed.length - 1]
  if (lastBar.date === today && yesterdayBar.close > 0) {
    realtimeRate = Math.round((lastBar.close - yesterdayBar.close) / yesterdayBar.close * 100 * 100) / 100
  }

  return { changeRate, date: yesterdayBar.date, realtimeRate }
}
