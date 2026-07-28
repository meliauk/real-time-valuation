/**
 * Yahoo 实时涨跌计算
 *
 * 实时列口径：当日交易日相对昨收的实时涨跌。
 *   - 美股：走盘前/盘中/盘后时段模式（PRE/REGULAR/POST），三层兜底。
 *   - 其他海外（日韩台欧）：无盘前盘后概念，直取 regularMarketChangePercent。
 *
 * 美股三层逻辑（按可靠性递减）：
 *   1. marketState 路由：Yahoo 返回 PRE/POST/REGULAR → 对应时段 ChangePercent。
 *      ⚠️ 盘前盘后绝不能用 regularMarketChangePercent（盘前时它是"昨收 vs 前日"，符号会反）。
 *   2. Price 自算：对应时段 ChangePercent 字段缺失时，用对应时段 Price vs 基准自算。
 *      盘前/盘中基准=previousClose（昨收），盘后基准=regularMarketPrice（当日正式收盘）。
 *   3. bar 回退：marketState 和 Price 都缺时，从 2m bar 序列按"最新可得"时段取末根 close 自算。
 *      只用当日交易日 bar（丢弃前一交易日夜盘残留），按 ts 最大者优先。
 */

import type { MarketTz, USSession } from '@/shared/types/common-types'
import { resolveMarketTradingDays, yahooBarToTradingDay } from '@/shared/market/trading-day'
import { classifyUSSessionByMs, classifyUSSessionByTs } from '@/shared/market/session'
import type { YahooChartResult } from './yahoo-types'

/** 美股时段标签（仅 realtime 美股有意义） */
export type RealtimeSession = 'PRE' | 'REGULAR' | 'POST'

/** 实时涨跌计算结果 */
export interface RealtimeRateResult {
  /** 实时涨跌幅（百分比，2位小数），null=算不出 */
  rate: number | null
  /** 当日交易日 YYYY-MM-DD，null=算不出 */
  date: string | null
  /** 美股时段标签（其他海外为 undefined） */
  session?: RealtimeSession
}

/**
 * 非美股实时涨跌（日韩台欧）：直取 meta.regularMarketChangePercent。
 * 这些市场无盘前盘后，该字段即当日盘中实时涨跌（基准已由 Yahoo 内置为相对昨收）。
 */
export function calcRealtimeSimple(result: YahooChartResult, market: MarketTz): RealtimeRateResult {
  const m = result.meta
  if (!m) return { rate: null, date: null }
  // 休市（worker 内节假日数据未注入，仅判周末；节假日由 service 层过滤不发 worker）：当日无实时数据
  if (resolveMarketTradingDays(market).isNonTradingDay) return { rate: null, date: null }
  const { currentTradingDay } = resolveMarketTradingDays(market)
  const rate = m.regularMarketChangePercent
  if (rate != null && Number.isFinite(rate)) {
    return { rate: Math.round(rate * 100) / 100, date: currentTradingDay }
  }
  // regularMarketChangePercent 缺失：用 regularMarketPrice vs previousClose 兜底
  const price = m.regularMarketPrice
  const prev = m.previousClose
  if (price != null && Number.isFinite(price) && price > 0 && prev != null && Number.isFinite(prev) && prev > 0) {
    return { rate: Math.round((price - prev) / prev * 100 * 100) / 100, date: currentTradingDay }
  }
  return { rate: null, date: null }
}

/**
 * 美股实时涨跌：盘前/盘中/盘后时段模式，四层兜底。
 *
 * 分时段基准（关键，对齐东财口径）：
 *   - 盘前 PRE：基准 = regularMarketPrice（上一交易日正式收盘价，PRE 时段定格不变）。
 *     ⚠️ 不能用 previousClose——Yahoo 的 previousClose 与 regularMarketPrice 不同（含调整/口径差异），
 *        用 previousClose 会导致盘前涨跌幅度错、甚至方向反（实测 NVDA 盘前从 +1.92% 错成应是 −2.02%）。
 *   - 盘中 REGULAR：基准 = previousClose（昨收；此时 regularMarketPrice 是当日实时价，不能做基准）。
 *   - 盘后 POST：基准 = regularMarketPrice（当日正式收盘价）。
 *
 * 实测 Yahoo chart(interval=2m&range=1d&includePrePost=true) 经代理不返回 marketState、
 * preMarketPrice/Percent、postMarketPrice/Percent、regularMarketChangePercent → Layer 1/2 恒 miss，
 * 实际走 Layer 3 bar 回退；盘前未开的 OFF 空窗走 Layer 4 meta 兜底。
 *
 * @param result Yahoo chart result（2m 线，含盘前盘后 bar）
 * @param market 美股时区
 */
export function calcRealtimeChangeRateByMarket(result: YahooChartResult, market: MarketTz): RealtimeRateResult {
  const m = result.meta
  if (!m) return { rate: null, date: null }
  // 美股有盘前盘后，周末/盘后时段仍可能有 POST 定格数据——不判休市，由 Yahoo 实际返回决定
  const { currentTradingDay } = resolveMarketTradingDays(market)

  // 第一层：marketState 路由。严格按时段取对应 ChangePercent。
  const state = m.marketState
  const curSession: USSession = state
    ? (state.includes('POST') ? 'POST' : state.includes('PRE') ? 'PRE' : state === 'REGULAR' ? 'REGULAR' : classifyUSSessionByMs(Date.now()))
    : classifyUSSessionByMs(Date.now())

  let metaRate: number | null = null
  let session: RealtimeSession | undefined
  if (curSession === 'PRE' && m.preMarketChangePercent != null && Number.isFinite(m.preMarketChangePercent)) {
    metaRate = m.preMarketChangePercent; session = 'PRE'
  } else if (curSession === 'POST' && m.postMarketChangePercent != null && Number.isFinite(m.postMarketChangePercent)) {
    metaRate = m.postMarketChangePercent; session = 'POST'
  } else if (curSession === 'REGULAR' && m.regularMarketChangePercent != null && Number.isFinite(m.regularMarketChangePercent)) {
    metaRate = m.regularMarketChangePercent; session = 'REGULAR'
  }
  if (metaRate != null && Number.isFinite(metaRate)) {
    return { rate: Math.round(metaRate * 100) / 100, date: currentTradingDay, session }
  }

  // 第二层：ChangePercent 缺失，用对应时段 Price vs 基准自算。
  //   盘前: preMarketPrice vs regularMarketPrice（上一交易日正式收盘价，对齐东财）
  //   盘中: regularMarketPrice vs previousClose（昨收）
  //   盘后: postMarketPrice vs regularMarketPrice（当日正式收盘）
  if (curSession === 'PRE' && validPos(m.preMarketPrice) && validPos(m.regularMarketPrice)) {
    return { rate: rateFrom(m.preMarketPrice!, m.regularMarketPrice!), date: currentTradingDay, session: 'PRE' }
  }
  if (curSession === 'POST' && validPos(m.postMarketPrice) && validPos(m.regularMarketPrice)) {
    return { rate: rateFrom(m.postMarketPrice!, m.regularMarketPrice!), date: currentTradingDay, session: 'POST' }
  }
  if (curSession === 'REGULAR' && validPos(m.regularMarketPrice) && validPos(m.previousClose)) {
    return { rate: rateFrom(m.regularMarketPrice!, m.previousClose!), date: currentTradingDay, session: 'REGULAR' }
  }

  // 第三层：bar 回退。2m 线含盘前/盘中/盘后 bar，按"最新可得"时段取末根 close 自算。
  //   基准按时段：PRE=regularMarketPrice（上一交易日收盘）、REGULAR=previousClose（昨收）、POST=regularMarketPrice（当日收盘）。
  //   PRE 候选无 regClose 时不 push（宁缺毋滥，该股此轮显 --，不回退 previousClose 以免方向反）。
  //
  //   日期过滤两阶段：先取当日(currentTradingDay) bar；若当日一根都没有（盘前未开的交易日，
  //   如工作日北京 08:00–16:00 美股盘前没开，Yahoo 只返回上一交易日 bar），
  //   则退取最近已收盘交易日(lastClosedDay)的 bar——此时只用其 POST 盘后段作为
  //   「上一交易日盘后定格值」，避免把盘中 bar 当最新。这样工作日盘前未开时显上一交易日盘后数据。
  const closesRaw = result.indicators?.quote?.[0]?.close
  const ts = result.timestamp
  if (closesRaw && ts && closesRaw.length > 0) {
    const { lastClosedDay } = resolveMarketTradingDays(market)
    let postLast: { close: number; ts: number } | null = null
    let preLast: { close: number; ts: number } | null = null
    let regLast: { close: number; ts: number } | null = null
    let usedFallbackDay = false // 是否退取了 lastClosedDay 的盘后 bar（决定 date 取值）
    // 第一阶段：仅取当日 bar
    for (let i = 0; i < closesRaw.length; i++) {
      const c = closesRaw[i]
      if (c == null || !Number.isFinite(c) || c <= 0) continue
      if (ts[i] == null) continue
      if (yahooBarToTradingDay(ts[i], market) !== currentTradingDay) continue
      const pt = { close: c, ts: ts[i] }
      const sess = classifyUSSessionByTs(ts[i])
      if (sess === 'POST') postLast = pt
      else if (sess === 'PRE') preLast = pt
      else if (sess === 'REGULAR') regLast = pt
    }
    // 当日无 bar（盘前未开的交易日）：退取 lastClosedDay 的盘后 bar 作定格值
    if (!postLast && !preLast && !regLast) {
      for (let i = 0; i < closesRaw.length; i++) {
        const c = closesRaw[i]
        if (c == null || !Number.isFinite(c) || c <= 0) continue
        if (ts[i] == null) continue
        if (yahooBarToTradingDay(ts[i], market) !== lastClosedDay) continue
        if (classifyUSSessionByTs(ts[i]) !== 'POST') continue // 仅取盘后段，不当盘中/盘前
        postLast = { close: c, ts: ts[i] }
        usedFallbackDay = true
      }
    }
    // 基准选择：PRE/POST 用 regularMarketPrice（上一交易日/当日收盘），REGULAR 用 previousClose（昨收）
    const prevClose = m.previousClose      // 盘中基准
    const regClose = m.regularMarketPrice   // 盘前(上一交易日收盘)/盘后(当日收盘)基准
    type Cand = { close: number; ts: number; base: number; sess: RealtimeSession }
    const cands: Cand[] = []
    if (postLast && validPos(regClose)) cands.push({ close: postLast.close, ts: postLast.ts, base: regClose!, sess: 'POST' })
    if (preLast && validPos(regClose)) cands.push({ close: preLast.close, ts: preLast.ts, base: regClose!, sess: 'PRE' })
    if (regLast && validPos(prevClose)) cands.push({ close: regLast.close, ts: regLast.ts, base: prevClose!, sess: 'REGULAR' })
    if (cands.length > 0) {
      const best = cands.reduce((a, b) => b.ts > a.ts ? b : a)
      // date：当日 bar 取 currentTradingDay；退取 lastClosedDay 盘后的取 lastClosedDay
      const date = usedFallbackDay ? lastClosedDay : currentTradingDay
      return { rate: rateFrom(best.close, best.base), date, session: best.sess }
    }
  }
  // 第四层：OFF 空窗兜底（上一交易日也无盘后 bar，如新股/取数失败）。
  //   用 meta 的 regularMarketPrice vs previousClose 显上一交易日当日涨跌，date=lastClosedDay。
  const regClose4 = m.regularMarketPrice
  const prevClose4 = m.previousClose
  if (validPos(regClose4) && validPos(prevClose4)) {
    return { rate: rateFrom(regClose4, prevClose4), date: resolveMarketTradingDays(market).lastClosedDay, session: undefined }
  }
  return { rate: null, date: null }
}

/** 数值为正有限数 */
function validPos(v: number | undefined | null): v is number {
  return v != null && Number.isFinite(v) && v > 0
}

/** (close - base) / base * 100，截2位 */
function rateFrom(close: number, base: number): number {
  return Math.round((close - base) / base * 100 * 100) / 100
}
