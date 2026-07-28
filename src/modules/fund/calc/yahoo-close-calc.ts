/**
 * Yahoo 收盘涨跌计算
 *
 * 从 Yahoo chart 收盘序列算「收盘列」的日涨跌（跳过今日 bar，取本地前一交易日 vs 其前日）。
 * 用于非 A/HK/US 市场（日韩台欧）的昨日收盘——这些市场腾讯日K无对应，走 Yahoo。
 *
 * 口径：与 prev-day-calc 的昨日收盘统一——跳过"该市场今日"那根 bar，
 *   取本地前一交易日收盘 vs 其前一交易日收盘。稳定无歧义，不受美股翻篇漂移影响。
 *   - 各市场 bar 按各自本地时区归日
 *   - 今日 = 该市场当日交易日，丢弃 day===今日 的 bar（盘中/收盘 bar 不算"昨日"）
 *   - 取剩余最后两个不同日：last=前一交易日收盘，prev=其前一交易日收盘 → 日涨跌
 */

import type { MarketTz } from '@/shared/types/common-types'
import { resolveMarketTradingDays, yahooBarToTradingDay } from '@/shared/market/trading-day'
import type { YahooChartResult } from './yahoo-types'

/** 收盘涨跌计算结果 */
export interface CloseRateResult {
  /** 日涨跌幅（百分比，2位小数），null=数据不足算不出 */
  rate: number | null
  /** 涨跌对应的交易日 YYYY-MM-DD，null=算不出 */
  date: string | null
}

/**
 * 从 Yahoo chart 收盘序列算收盘列日涨跌。
 * @param result Yahoo chart result（含 meta/timestamp/indicators）
 * @param market 市场时区
 */
export function calcCloseChangeRateByMarket(result: YahooChartResult, market: MarketTz): CloseRateResult {
  const closesRaw = result.indicators?.quote?.[0]?.close
  const ts = result.timestamp
  if (!closesRaw || closesRaw.length < 2 || !ts) return { rate: null, date: null }

  // 昨日统一锚定美股 lastClosedDay（全球基准日）：所有市场昨日都取同一天，
  // 消除时差不一致。跳过基准日之后的 bar（当日盘中/尚未确认），末根=基准日（昨日）。
  const yesterday = resolveMarketTradingDays('US').lastClosedDay

  type Pt = { ts: number; close: number; day: string }
  const pts: Pt[] = []
  for (let i = 0; i < closesRaw.length; i++) {
    const c = closesRaw[i]
    if (c == null || !Number.isFinite(c) || c <= 0) continue
    if (ts[i] == null) continue
    const day = yahooBarToTradingDay(ts[i], market)
    if (day > yesterday) continue // 丢弃基准日之后的 bar（当日盘中/未来）
    pts.push({ ts: ts[i], close: c, day })
  }
  if (pts.length < 2) return { rate: null, date: null }

  pts.sort((a, b) => a.ts - b.ts)
  // 去重同日（取当日最后一根=收盘）
  const byDay = new Map<string, number>()
  for (const p of pts) byDay.set(p.day, p.close) // 升序遍历，后写覆盖 → 当日最后值
  const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b))
  if (days.length < 2) return { rate: null, date: null }

  // 末根=基准日（昨日），前根=基准日前一交易日
  const [lastDay, lastClose] = days[days.length - 1]
  const [, prevClose] = days[days.length - 2]
  if (prevClose <= 0) return { rate: null, date: null }

  return {
    rate: Math.round((lastClose - prevClose) / prevClose * 100 * 100) / 100,
    date: lastDay,
  }
}
