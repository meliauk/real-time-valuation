/**
 * 盘中分时点生成
 *
 * 根据估值数据生成当日分时走势点：
 *   - T+2 基金（QDII等，盘中估值不变）：从开盘到当前时刻，每 INTERVAL_MINUTES 分钟一个点，
 *     值恒为估值（视觉上水平线，与 T+1 格式一致）。
 *   - T+1 基金（有盘中估值 gz+gztime）：按 gztime 的时间部分追加一个点；
 *     若与上一点同时刻则替换，否则追加（形成盘中走势）。
 *
 * T+2 的分段时间段：上午 09:30-11:30、下午 13:00-16:00，endTime 取当前时刻（盘中）
 * 或对应分段结束（午休/收盘后）。
 *
 * 纯计算，历史点通过参数传入（updateIntradayPoints 写入 store 由 2.10 fund-store 实现）。
 */

import type { IntradayPoint, FundValuation } from '@/modules/fund/fund-types'
import { INTRADAY_CONFIG } from '@/config/constants'

/**
 * 生成盘中分时点。
 * @param valuation 当前估值
 * @param prevPoints 该基金已有的历史分时点（T+1 追加用）
 * @returns 新分时点数组，无法生成返回 null
 */
export function generateIntradayPoints(
  valuation: FundValuation,
  prevPoints: IntradayPoint[] = [],
): IntradayPoint[] | null {
  // T+2 判定：delayDays=2，或 gztime 为纯日期（无时间部分）
  const isT2 = valuation.delayDays === 2 ||
    (valuation.delayDays == null && !!valuation.gztime && !valuation.gztime.includes(':'))

  if (isT2 && (valuation.gz > 0 || valuation.dwjz > 0)) {
    const value = valuation.gz > 0 ? valuation.gz : valuation.dwjz
    if (value > 0) {
      return generateT2FlatPoints(value)
    }
    return null
  }

  // T+1：有盘中估值，按 gztime 追加
  if (valuation.gz > 0 && valuation.gztime) {
    const timePart = valuation.gztime.includes(' ')
      ? valuation.gztime.split(' ')[1]?.substring(0, 5) ?? ''
      : ''
    if (timePart) {
      const lastPoint = prevPoints[prevPoints.length - 1]
      if (lastPoint && lastPoint.time === timePart) {
        // 同时刻替换
        return [...prevPoints.slice(0, -1), { time: timePart, value: valuation.gz }]
      }
      return [...prevPoints, { time: timePart, value: valuation.gz }]
    }
  }
  return null
}

/** T+2 生成水平线分时点（上午+下午分段，按 INTERVAL_MINUTES 间隔，值恒定） */
function generateT2FlatPoints(value: number): IntradayPoint[] {
  const now = new Date()
  const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  // endTime：盘中取当前时刻，午休取11:30，收盘后取16:00
  let endTime = '16:00'
  if (curTime >= '09:30' && curTime < '11:30') endTime = curTime
  else if (curTime >= '11:30' && curTime < '13:00') endTime = '11:30'
  else if (curTime >= '13:00' && curTime < '16:00') endTime = curTime

  const points: IntradayPoint[] = []
  const step = INTRADAY_CONFIG.INTERVAL_MINUTES
  const addSegment = (startH: number, startM: number, endH: number, endM: number) => {
    let h = startH, m = startM
    while (h < endH || (h === endH && m <= endM)) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      if (time > endTime) return
      points.push({ time, value })
      m += step
      if (m >= 60) { m -= 60; h++ }
    }
  }
  addSegment(9, 30, 11, 30)   // 上午
  addSegment(13, 0, 16, 0)    // 下午 13:00-16:00（终止点 16:00）

  // 点不足2个时补首尾
  if (points.length < 2) {
    points.push({ time: '09:30', value }, { time: endTime, value })
  }
  return points
}
