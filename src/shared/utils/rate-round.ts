/**
 * 涨跌幅四舍五入 - 统一 2 位小数口径
 *
 * 全项目涨跌幅统一保留 2 位小数，消除浮点边界误差（如 5.345 → 5.35 而非 5.34）。
 * +1e-10 修正浮点边界（Math.round 对 .5 的处理）。
 */

import { NUMBER_FORMAT } from '@/config/constants'

/** 涨跌幅四舍五入到 2 位小数（统一口径，+1e-10 修正浮点边界） */
export function roundRate(value: number): number {
  const factor = Math.pow(10, NUMBER_FORMAT.RATE_DECIMALS)
  return Math.round((value + 1e-10) * factor) / factor
}

/**
 * 计算涨跌幅并四舍五入到 2 位小数。
 * @param current  当前值
 * @param previous 上期值（基准）
 * @returns (current - previous) / previous * 100，previous<=0 返回 0
 */
export function calcAndRoundRate(current: number, previous: number): number {
  if (!Number.isFinite(previous) || previous <= 0) return 0
  if (!Number.isFinite(current)) return 0
  return roundRate((current - previous) / previous * 100)
}
