/**
 * A股交易日历 - 含节假日（基金净值滞后日计算用）
 *
 * 基金估值需按 A股交易日计算净值滞后：T+1 取前1个交易日净值，T+2 取前2个交易日净值。
 * 节假日必须跳过（春节/国庆等），否则假期当天会取到非交易日的错误净值。
 *
 * 节假日表覆盖 2024-2026（与官方放假安排一致），未来年份需在此追加。
 * 仅 A股日历——港股/美股的净值滞后由各自确认机制处理，不用此日历。
 */

import dayjs from 'dayjs'
import { beijingNow, getBeijingTodayStr } from '@/shared/utils/date-format'
import { resolveMarketTradingDays } from '@/shared/market/trading-day'

/** 2024年法定节假日 */
const HOLIDAYS_2024 = [
  '2024-01-01',
  '2024-02-10', '2024-02-11', '2024-02-12', '2024-02-13', '2024-02-14', '2024-02-15', '2024-02-16', '2024-02-17',
  '2024-04-04', '2024-04-05', '2024-04-06',
  '2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04', '2024-05-05',
  '2024-06-08', '2024-06-09', '2024-06-10',
  '2024-09-15', '2024-09-16', '2024-09-17',
  '2024-10-01', '2024-10-02', '2024-10-03', '2024-10-04', '2024-10-05', '2024-10-06', '2024-10-07',
]
/** 2025年法定节假日 */
const HOLIDAYS_2025 = [
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-05', '2025-04-06',
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-31', '2025-06-01', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
]
/** 2026年法定节假日 */
const HOLIDAYS_2026 = [
  '2026-01-01',
  '2026-02-14', '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
]

const ALL_HOLIDAYS = new Set([...HOLIDAYS_2024, ...HOLIDAYS_2025, ...HOLIDAYS_2026])

/** 判断是否为周末 */
function isWeekend(d: dayjs.Dayjs): boolean {
  const day = d.day()
  return day === 0 || day === 6
}

/** 判断是否为法定节假日 */
function isHoliday(d: dayjs.Dayjs): boolean {
  return ALL_HOLIDAYS.has(d.format('YYYY-MM-DD'))
}

/** 判断是否为真正的 A股交易日（非周末 + 非节假日） */
export function isCnTradingDay(date?: dayjs.Dayjs): boolean {
  const d = date ?? beijingNow()
  return !isWeekend(d) && !isHoliday(d)
}

/** 获取上一个 A股交易日（跳过周末和节假日），返回 YYYY-MM-DD */
export function getPreviousTradingDay(date?: dayjs.Dayjs): string {
  return getPreviousNTradingDay(1, date)
}

/** 获取下一个 A股交易日（跳过周末和节假日），返回 YYYY-MM-DD */
export function getNextTradingDay(date?: dayjs.Dayjs): string {
  return getNextNTradingDay(1, date)
}

/** 获取第 N 个未来 A股交易日（跳过周末和节假日），返回 YYYY-MM-DD */
export function getNextNTradingDay(n: number = 1, date?: dayjs.Dayjs): string {
  let d = date ?? beijingNow()
  let count = 0
  while (count < n) {
    d = d.add(1, 'day')
    if (isCnTradingDay(d)) count++
  }
  return d.format('YYYY-MM-DD')
}

/** 获取前第 N 个 A股交易日（跳过周末和节假日），返回 YYYY-MM-DD */
export function getPreviousNTradingDay(n: number, date?: dayjs.Dayjs): string {
  let d = date ?? beijingNow()
  let count = 0
  while (count < n) {
    d = d.subtract(1, 'day')
    if (isCnTradingDay(d)) count++
  }
  return d.format('YYYY-MM-DD')
}

/** 获取今日 A股日期字符串 YYYY-MM-DD */
export function getTodayStr(): string {
  return getBeijingTodayStr()
}

/** 获取全球基准日（美股最近已收盘交易日）。
 *  缓存日期戳用此（而非北京自然日）：美股收盘=全球交易日翻篇，基准日变化即应丢弃旧缓存。
 *  避免美股收盘跨日（北京凌晨4点）时北京日期未变导致 restoreStockCaches 误恢复旧缓存。 */
export function getBaseDay(): string {
  return resolveMarketTradingDays('US').lastClosedDay
}

/** 获取当前完整时间字符串 YYYY-MM-DD HH:mm:ss */
export function getNowStr(): string {
  const d = beijingNow()
  return `${d.format('YYYY-MM-DD')} ${String(d.hour()).padStart(2, '0')}:${String(d.minute()).padStart(2, '0')}:${String(d.second()).padStart(2, '0')}`
}
