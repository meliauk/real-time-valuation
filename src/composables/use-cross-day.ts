/**
 * 跨日检测 Composable - 检测日期变更并触发数据刷新
 * 当用户长时间保持页面打开，跨过午夜后需要重新获取当日估值
 * 检测间隔 30 秒，确保快速响应跨日
 *
 * 这是全 app 唯一的跨日入口：App.vue 不再重复实现跨日判定（避免两套口径并存误清同日缓存）。
 * 跨日动作：重建基金板块（清缓存+重建Worker+重启loop）+ 清指数/股票行情内存 + 刷新估值 + 经理变更检测。
 */

import { onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { useIndexStore } from '@/modules/index/index-store'
import { useStockStore } from '@/modules/stock/stock-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import { rebuildFundModuleOnCrossDay } from '@/modules/fund/fund-bootstrap'
import { checkManagerChanges } from '@/composables/use-manager-check'
import { resolveMarketTradingDays } from '@/shared/market/trading-day'

export function useCrossDay() {
  const indexStore = useIndexStore()
  const stockStore = useStockStore()
  const settingsStore = useSettingsStore()

  /** 基准日 = 美股 lastClosedDay（美东最近已收盘交易日）。美股是最晚收盘的主要市场，
   *  美股收盘=全球交易日翻篇。基准日变化即跨日（北京凌晨4点美股收盘时触发）。 */
  let currentBaseDay = resolveMarketTradingDays('US').lastClosedDay

  /** 检测间隔定时器 */
  let checkTimer: number | null = null

  /** 是否正在执行跨日重建（防重入：visibilitychange 与轮询可能同时触发） */
  let rebuilding = false

  /** 检查是否跨日（基准日变化=美股收盘翻篇） */
  async function checkCrossDay(): Promise<void> {
    const baseDay = resolveMarketTradingDays('US').lastClosedDay
    if (baseDay === currentBaseDay) return
    if (rebuilding) return
    rebuilding = true
    currentBaseDay = baseDay
    try {
      // 基金板块：清缓存 + 重建 Worker + 重启 loop + 重新恢复+刷新
      await rebuildFundModuleOnCrossDay()
      // 指数/股票行情内存清空（持久化的当日戳已过期，恢复时会自动丢弃；此处清内存避免合并语义保留过期值）
      indexStore.indexQuotes = new Map()
      stockStore.quoteMap = new Map()
      await indexStore.refresh()
      await stockStore.refresh()
      // 经理变更检测由设置开关控制（enableManagerCheck），关闭时跳过省流量
      if (settingsStore.enableManagerCheck) {
        await checkManagerChanges()
      }
    } finally {
      rebuilding = false
    }
  }

  /** 页面可见性变化时立即检查跨日（用户从后台切回前台） */
  async function onVisibilityChange(): Promise<void> {
    if (document.visibilityState === 'visible') {
      await checkCrossDay()
    }
  }

  function startTimer(): void {
    stopTimer()
    // 30 秒检查一次跨日，确保快速响应
    checkTimer = window.setInterval(checkCrossDay, 30 * 1000)
  }

  function stopTimer(): void {
    if (checkTimer !== null) {
      clearInterval(checkTimer)
      checkTimer = null
    }
  }

  onMounted(() => {
    startTimer()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    stopTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  // keep-alive 场景：页面激活时立即检查跨日并重启定时器
  // 不重置 currentBaseDay：保留离开时的基准日，若离开期间美股收盘翻篇，checkCrossDay 能检测到变化
  onActivated(() => {
    checkCrossDay()
    startTimer()
  })

  // keep-alive 场景：页面失活时暂停定时器
  onDeactivated(() => {
    stopTimer()
  })

  return { checkCrossDay }
}
