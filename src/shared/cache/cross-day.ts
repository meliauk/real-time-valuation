/**
 * 跨日清理 - 检测日期变更并触发缓存失效
 *
 * 当用户长时间保持页面打开，跨过午夜（北京时间）后，前一交易日的缓存数据失效，
 * 需要重新获取当日数据。本模块提供跨日检测的纯工具，实际"清什么缓存"由各 store 决定。
 *
 * 设计：检测与执行分离——本模块只管"判定是否跨日"，store 决定"清哪些缓存、拉哪些数据"。
 */

import { getBeijingTodayStr } from '@/shared/utils/date-format'

/**
 * 判定是否跨日：上次记录日期 vs 今日北京日期。
 * @param lastDate 上次记录的日期字符串 YYYY-MM-DD
 * @returns true=已跨日（需清理重拉），false=同日
 */
export function isCrossDay(lastDate: string): boolean {
  if (!lastDate) return false
  return lastDate !== getBeijingTodayStr()
}

/**
 * 跨日检测器：周期性轮询日期是否变化，跨日时触发回调。
 *
 * @param onCrossDay 跨日时的回调（由 store 注入清理逻辑）
 * @param intervalMs 检测间隔，默认 30s
 * @returns 控制句柄：stop() 停止检测
 */
export function createCrossDayWatcher(
  onCrossDay: () => void | Promise<void>,
  intervalMs: number = 30 * 1000,
): { start: () => void; stop: () => void; checkNow: () => Promise<void> } {
  let currentDate = getBeijingTodayStr()
  let timer: ReturnType<typeof setInterval> | null = null

  async function check(): Promise<void> {
    const today = getBeijingTodayStr()
    if (today !== currentDate) {
      currentDate = today
      await onCrossDay()
    }
  }

  return {
    start: () => {
      if (timer) return
      timer = setInterval(() => { void check() }, intervalMs)
    },
    stop: () => {
      if (timer) { clearInterval(timer); timer = null }
    },
    checkNow: check,
  }
}
