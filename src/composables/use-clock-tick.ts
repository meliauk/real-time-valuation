/**
 * 全局分钟级时钟 tick - 供依赖"当前时间"的 computed 建立响应式依赖
 *
 * 背景：Vue computed 只在其追踪到的响应式依赖变化时重算。像 isPastDailyBadgeReset()
 * / getTodayStr() 这类纯时间函数不是响应式的——时间跨过 08:30、跨过午夜，都不会触发任何重算。
 * 「已更新」徽章因此在次日 08:30 不会按约定清空，要等下一次估值刷新（交易时段才跑，
 * 即 09:30 之后）才消失；挂在后台的页面则更久。
 *
 * 方案：模块级单例定时器，每分钟递增 minuteTick。需要按时间边界重算的 computed
 * 读一次 minuteTick 即建立依赖，到点自动重算。
 *
 * 单例 + 引用计数：多个组件共用一个 interval，全部卸载后自动停表，不泄漏。
 * 对齐分钟边界：首次延迟到下一个整分钟再起 interval，使 08:30 这类边界的触发误差 < 1s。
 */

import { ref, onMounted, onUnmounted } from 'vue'

/** 分钟计数器 - 每分钟自增，作为时间相关 computed 的响应式依赖 */
const minuteTick = ref(0)

let timerId: ReturnType<typeof setInterval> | null = null
let alignTimerId: ReturnType<typeof setTimeout> | null = null
let refCount = 0

function start(): void {
  if (timerId !== null || alignTimerId !== null) return
  // 对齐到下一个整分钟，避免边界（如 08:30:00）最多晚 59s 才触发
  const msToNextMinute = 60000 - (Date.now() % 60000)
  alignTimerId = setTimeout(() => {
    alignTimerId = null
    minuteTick.value++
    timerId = setInterval(() => { minuteTick.value++ }, 60000)
  }, msToNextMinute)
}

function stop(): void {
  if (timerId !== null) { clearInterval(timerId); timerId = null }
  if (alignTimerId !== null) { clearTimeout(alignTimerId); alignTimerId = null }
}

/**
 * 订阅分钟级时钟。在 computed 内读取返回的 minuteTick 即建立响应式依赖。
 * 组件卸载时自动退订，无组件订阅时停表。
 */
export function useClockTick() {
  onMounted(() => {
    refCount++
    start()
  })
  onUnmounted(() => {
    refCount--
    if (refCount <= 0) { refCount = 0; stop() }
  })
  return { minuteTick }
}

/** 非组件上下文读取当前 tick（供 composable 内的 computed 直接依赖，不管理生命周期） */
export function currentMinuteTick() {
  return minuteTick
}
