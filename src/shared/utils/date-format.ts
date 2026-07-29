/**
 * 日期时间格式化 - 北京时间一致性
 *
 * 本项目面向中国市场，所有日期时间统一锚定北京时间（UTC+8），避免跨时区漂移。
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

/** 当前北京时间（dayjs 对象，UTC+8） */
export function beijingNow(): dayjs.Dayjs {
  return dayjs().utcOffset(8)
}

/** 北京时间今日日期字符串 YYYY-MM-DD */
export function getBeijingTodayStr(): string {
  return beijingNow().format('YYYY-MM-DD')
}

/** 获取北京时间日期字符串 YYYY-MM-DD（今日） */
export function getTodayStr(): string {
  return getBeijingTodayStr()
}

/** 当前北京时间字符串 YYYY-MM-DD HH:mm:ss */
export function getNowStr(): string {
  return beijingNow().format('YYYY-MM-DD HH:mm:ss')
}

/** 当前北京时间 HH:mm */
export function getCurrentTimeStr(): string {
  return beijingNow().format('HH:mm')
}

/**
 * 当日「已更新」徽章重置时刻：北京时间 08:30。
 * 此刻前视为"新一天的清晨"——基金公司尚未发布当日确认净值，
 * 徽章一律不显示（避免把"昨日已更新"误显示成今日）。此刻后才按 jzrq 判定是否已更新。
 */
export const DAILY_BADGE_RESET_HOUR = 8
export const DAILY_BADGE_RESET_MINUTE = 30

/** 当前北京时间是否已过当日 08:30（过了才允许显示"已更新"徽章） */
export function isPastDailyBadgeReset(): boolean {
  const d = beijingNow()
  const h = d.hour()
  const m = d.minute()
  return h > DAILY_BADGE_RESET_HOUR || (h === DAILY_BADGE_RESET_HOUR && m >= DAILY_BADGE_RESET_MINUTE)
}

/** 判断是否跨日 - lastUpdateDate 与今日北京日期不同即为跨日 */
export function isCrossDay(lastUpdateDate: string): boolean {
  if (!lastUpdateDate) return false
  return lastUpdateDate !== getBeijingTodayStr()
}

/** 判断缓存是否今日写入（cachedDate === 今日北京日期） */
export function isCacheToday(cacheDate: string): boolean {
  return !!cacheDate && cacheDate === getBeijingTodayStr()
}

/** 缓存是否有效（在有效期内） */
export function isCacheValid(cachedAt: number, durationMs: number): boolean {
  return Date.now() - cachedAt < durationMs
}

/** 格式化持仓日期 YYYY-MM-DD → 中文展示 */
export function formatHoldingDate(dateStr: string): string {
  if (!dateStr) return '--'
  return dateStr
}

/** 格式化估值时间（gztime 可能为 "2024-01-15 16:00" 或 "2024-01-15"） */
export function formatValuationTime(valuationTime: string): string {
  if (!valuationTime) return '--'
  // 只取 HH:mm 部分（去掉秒），无时间只显示日期
  return valuationTime.length > 10 ? valuationTime.slice(11, 16) : valuationTime
}

/** 格式化估值时间 - 日期+时间显示完整，纯日期仅显示日期。
 *  gztime 为 "2024-01-15 16:00" → "2024-01-15 16:00:00"；"2024-01-15" → "2024-01-15"。
 *  详情页头部估值时间用此（含秒，与卡片视图 HH:mm 区分）。 */
export function formatValuationTimeWithSeconds(valuationTime: string): string {
  if (!valuationTime) return '--'
  if (!dayjs(valuationTime).isValid()) return valuationTime
  const hasTime = valuationTime.includes(' ') && valuationTime.split(' ')[1]?.trim()
  return hasTime
    ? dayjs(valuationTime).format('YYYY-MM-DD HH:mm:ss')
    : dayjs(valuationTime).format('YYYY-MM-DD')
}
