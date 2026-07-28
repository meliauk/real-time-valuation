/**
 * 市场交易日判定 - 按股票所在市场本地时区判定交易日
 *
 * 目的：持仓股票的收盘/实时涨跌口径统一。
 * 之前 close 模式用 UTC 日期粗略丢弃"今日 bar"，在跨日边界会误删刚收盘的有效 bar
 * 或留下未完成 bar，导致涨跌算错或算不出。本模块按市场本地时区精确判定：
 *   - 当日交易日（trading day in progress / 已结束）
 *   - 上一已完成交易日（last fully closed trading day）
 *
 * 口径：周末非交易日；节假日暂不含（逻辑正确性优先，节假日可后续补，
 *       非交易日自动退化为最近交易日，最多影响极少数假期当天的"上一交易日"取值）。
 *
 * 所有时间运算基于 UTC 毫秒数 + 市场时区偏移，与 dayjs 无关，避免引入时区插件。
 */

import type { MarketTz } from '@/shared/types/common-types'

/** 各市场收盘时刻（市场本地时间 HH:mm，收盘后当日交易即视为完成） */
const MARKET_CLOSE_LOCAL: Record<MarketTz, string> = {
  A: '15:00', HK: '16:00', US: '16:00',
  JP: '15:00', KR: '15:30', TW: '13:30',
  DE: '17:30', FR: '17:30', UK: '16:30',
  unknown: '16:00',
}

/** 是否夏令时生效（3月第2个周日 ~ 11月第1个周日，美/欧适用） */
function isDST(year: number, month1: number, dom: number, dow: number): boolean {
  const marchSecondSunday = secondSunday(year, 3)
  const novFirstSunday = firstSunday(year, 11)
  const cur = month1 * 100 + dom
  const start = 3 * 100 + marchSecondSunday
  const end = 11 * 100 + novFirstSunday
  return cur >= start && cur < end
  void dow
}

function secondSunday(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month - 1, 1))
  const dow = d.getUTCDay()
  const offset = (7 - dow) % 7
  return 1 + offset + 7
}
function firstSunday(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month - 1, 1))
  const dow = d.getUTCDay()
  const offset = (7 - dow) % 7
  return 1 + offset
}

/** 各市场 UTC 偏移（分钟），考虑夏令时 */
function marketUtcOffsetMin(market: MarketTz, nowMs: number): number {
  const d = new Date(nowMs)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  const dom = d.getUTCDate()
  const dow = d.getUTCDay()
  const dst = isDST(year, month, dom, dow)
  switch (market) {
    case 'A': case 'HK': case 'TW': return 8 * 60
    case 'JP': case 'KR': return 9 * 60
    case 'US': return dst ? -4 * 60 : -5 * 60
    case 'DE': case 'FR': return dst ? 2 * 60 : 1 * 60
    case 'UK': return dst ? 1 * 60 : 0
    default: return 8 * 60
  }
}

/** 把 UTC 毫秒转成市场本地 {Y,M,D,hh,mm,dow} */
function toMarketLocal(market: MarketTz, nowMs: number): { y: number; mo: number; d: number; hh: number; mm: number; dow: number } {
  const offsetMin = marketUtcOffsetMin(market, nowMs)
  const localMs = nowMs + offsetMin * 60000
  const dt = new Date(localMs)
  return {
    y: dt.getUTCFullYear(),
    mo: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
    hh: dt.getUTCHours(),
    mm: dt.getUTCMinutes(),
    dow: dt.getUTCDay(),
  }
}

/** 周末非交易日 */
function isWeekendDow(dow: number): boolean {
  return dow === 0 || dow === 6
}

/** 各市场法定节假日（YYYY-MM-DD，主线程 holiday-service 启动时从 Nager.Date 注入）。
 *  内存模块级，主线程填充；Worker 隔离读不到（worker 内 calc 休市判定靠 service 层过滤休市 entries 不发 worker）。 */
const marketHolidays: Record<MarketTz, Set<string>> = {
  A: new Set(), HK: new Set(), US: new Set(),
  JP: new Set(), KR: new Set(), TW: new Set(),
  DE: new Set(), FR: new Set(), UK: new Set(),
  unknown: new Set(),
}

/** 注入某市场的节假日（主线程 holiday-service 取数后调）。
 *  dates 为 YYYY-MM-DD 列表（Nager 返回含年份）。 */
export function setMarketHolidays(market: MarketTz, dates: string[]): void {
  marketHolidays[market] = new Set(dates)
}

/** 判定某日期是否为该市场法定节假日（YYYY-MM-DD） */
function isMarketHoliday(market: MarketTz, dateStr: string): boolean {
  return marketHolidays[market]?.has(dateStr) ?? false
}

/** 格式化 YYYY-MM-DD */
function fmtDate(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface MarketTradingDays {
  /** 当日交易日（市场本地） */
  todayTradingDay: string
  /** 上一已完成交易日（已收盘）：收盘涨跌应取这一天相对其前一交易日的涨跌 */
  lastClosedDay: string
  /** 当前市场是否已收盘（当日交易日已完成） */
  isClosed: boolean
  /** 当日交易日日期（语义强调"这是当日交易日"） */
  currentTradingDay: string
  /** 今日的上一交易日（真正的"昨天"，不受收盘状态影响）：盘中=lastClosedDay，已收盘=lastClosedDay 的前一交易日 */
  previousClosedDay: string
  /** 今日是否为非交易日（周末或节假日）。true=全天无交易，realtime 应显示"--"。
   *  与 isClosed 区别：isClosed=true 可能是"交易日已收盘"（定格值有效），
   *  isNonTradingDay=true 才是"全天休市"（无任何实时数据，不该取/显 stale）。 */
  isNonTradingDay: boolean
}

/**
 * 判定指定市场的交易日
 * @param market 市场
 * @param nowMs  当前 UTC 毫秒数（默认 Date.now()）
 */
export function resolveMarketTradingDays(market: MarketTz, nowMs: number = Date.now()): MarketTradingDays {
  const local = toMarketLocal(market, nowMs)
  const closeStr = MARKET_CLOSE_LOCAL[market] || '16:00'
  const [closeH, closeM] = closeStr.split(':').map(Number)
  const nowMinutes = local.hh * 60 + local.mm
  const closedToday = nowMinutes >= closeH * 60 + closeM
  const todayDateStr = fmtDate(local.y, local.mo, local.d)
  const todayIsTradingDay = !isWeekendDow(local.dow) && !isMarketHoliday(market, todayDateStr)

  if (todayIsTradingDay) {
    if (closedToday) {
      return {
        currentTradingDay: todayDateStr,
        todayTradingDay: todayDateStr,
        lastClosedDay: todayDateStr,
        previousClosedDay: previousTradingDayFrom(local.y, local.mo, local.d, market),
        isClosed: true,
        isNonTradingDay: false,
      }
    }
    const prev = previousTradingDayFrom(local.y, local.mo, local.d, market)
    return {
      currentTradingDay: todayDateStr,
      todayTradingDay: todayDateStr,
      lastClosedDay: prev,
      previousClosedDay: prev,
      isClosed: false,
      isNonTradingDay: false,
    }
  }

  const lastClosed = previousTradingDayFrom(local.y, local.mo, local.d, market)
  const nextTd = nextTradingDayFrom(local.y, local.mo, local.d, market)
  return {
    currentTradingDay: lastClosed,
    todayTradingDay: nextTd,
    lastClosedDay: lastClosed,
    previousClosedDay: lastClosed,
    isClosed: true,
    isNonTradingDay: true,
  }
}

/** 从某个日期往前找最近的交易日（跳过周末和节假日），返回 YYYY-MM-DD */
function previousTradingDayFrom(y: number, mo: number, d: number, market: MarketTz): string {
  let dt = new Date(Date.UTC(y, mo - 1, d))
  for (let i = 0; i < 10; i++) {
    dt = new Date(dt.getTime() - 86400000)
    const ds = fmtDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
    if (!isWeekendDow(dt.getUTCDay()) && !isMarketHoliday(market, ds)) {
      return ds
    }
  }
  return fmtDate(y, mo, d)
}

/** 从某个日期往后找最近的交易日（跳过周末和节假日），返回 YYYY-MM-DD */
function nextTradingDayFrom(y: number, mo: number, d: number, market: MarketTz): string {
  let dt = new Date(Date.UTC(y, mo - 1, d))
  for (let i = 0; i < 10; i++) {
    dt = new Date(dt.getTime() + 86400000)
    const ds = fmtDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
    if (!isWeekendDow(dt.getUTCDay()) && !isMarketHoliday(market, ds)) {
      return ds
    }
  }
  return fmtDate(y, mo, d)
}

/**
 * 把 Yahoo bar 的 timestamp（UTC 秒）归到其所属市场交易日。
 * Yahoo daily bar 时间戳通常为该日 00:00 UTC 或收盘时刻，转市场本地日期后即为交易日。
 */
export function yahooBarToTradingDay(tsSec: number, market: MarketTz): string {
  const ms = tsSec * 1000
  const local = toMarketLocal(market, ms)
  return fmtDate(local.y, local.mo, local.d)
}

/**
 * 把 UTC 毫秒归到美东时段（含夏令时判定）。
 * 边界（美东本地 HH:mm）：
 *   PRE     04:00 ~ 09:30  盘前
 *   REGULAR 09:30 ~ 16:00  盘中
 *   POST    16:00 ~ 20:00  盘后
 *   OFF     其余           盘外（无实时 bar）
 */
export function classifyUSSessionByMs(ms: number): import('@/shared/types/common-types').USSession {
  const { hh, mm } = toMarketLocal('US', ms)
  const mins = hh * 60 + mm
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return 'PRE'
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return 'REGULAR'
  if (mins >= 16 * 60 && mins < 20 * 60) return 'POST'
  return 'OFF'
}

/** 便捷重载：Yahoo bar 时间戳是秒 */
export function classifyUSSessionByTs(tsSec: number): import('@/shared/types/common-types').USSession {
  return classifyUSSessionByMs(tsSec * 1000)
}
