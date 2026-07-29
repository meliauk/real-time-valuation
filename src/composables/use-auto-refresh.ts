/**
 * 自动刷新 Composable - 管理估值数据的定时自动刷新
 * 仅在交易日交易时段内自动刷新，非交易时段暂停节省流量
 * 收盘后若仍有基金未确认（isEstimated=true），低频轮询直到全部确认
 * 从 settings store 读取用户偏好配置
 *
 * 可见性刷新：手机端切后台时浏览器会冻结/暂停 setInterval，切回前台数据已过期但定时器
 * 不会立即补刷（甚至 iOS 直接冻结，回来后无补刷）。监听 visibilitychange，页面重新可见时
 * 无视交易时段立即拉取一次最新估值，保证用户看到的"今日涨跌幅"是最新的而非后台冻结前的旧值。
 */

import { ref, onMounted, onUnmounted, onActivated, onDeactivated, watch } from 'vue'
import { useFundStore } from '@/modules/fund/fund-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import { isCnTradingDay } from '@/modules/fund/valuation/cn-trading-day'
import { beijingNow } from '@/shared/utils/date-format'

/** 收盘后低频轮询间隔（毫秒）- 5分钟 */
const POST_MARKET_INTERVAL_MS = 5 * 60 * 1000

/** 可见性刷新节流：距上次刷新不足此时长则跳过，避免刚 bootstrap/定时刷新完又重打（毫秒） */
const VISIBILITY_REFRESH_MIN_GAP_MS = 10 * 1000

/** 判断给定时间是否在 A股交易时段内 - 使用北京时间 */
function isTradingHours(): boolean {
  const d = beijingNow()
  const day = d.day()
  if (day === 0 || day === 6) return false
  const timeStr = d.format('HH:mm')
  return (timeStr >= '09:30' && timeStr <= '11:30') ||
         (timeStr >= '13:00' && timeStr <= '16:00')
}

export function useAutoRefresh() {
  const fundStore = useFundStore()
  const holdingStore = useHoldingStore()
  const settingsStore = useSettingsStore()

  /** 交易时段定时器 ID */
  let timerId: number | null = null

  /** 收盘后低频轮询定时器 ID */
  let postMarketTimerId: number | null = null

  /** 是否已过首次挂载（区分首次 onActivated 与 keep-alive 重激活，避免首屏重复刷新） */
  let activatedOnce = false

  /** 当前是否在交易时段 - 非交易时段自动暂停刷新 */
  const inTradingHours = ref(isTradingHours())

  /** 判断是否还有基金未确认净值 */
  function hasUnconfirmedFunds(): boolean {
    return fundStore.fundCodes.some(code => {
      const v = fundStore.getValuation(code)
      return v == null || v.isEstimated !== false
    })
  }

  /** 交易时段内刷新逻辑 */
  async function tradingHoursRefresh(): Promise<void> {
    inTradingHours.value = isTradingHours()
    // 非交易时段或非交易日不刷新（转由收盘后轮询处理）
    if (!inTradingHours.value || !isCnTradingDay()) return
    await fundStore.refreshAllValuations()
    // executePendingActions 不 await：内部 fetchFundNetValueRange 走串行 apidata 队列会阻塞，
    // 脱离刷新主链路异步执行，避免卡住下次定时刷新触发
    void holdingStore.executePendingActions(fundStore.valuationMap).catch(() => { /* 静默 */ })
  }

  /** 启动交易时段自动刷新 */
  function startAutoRefresh(): void {
    stopAutoRefresh()
    const intervalMs = settingsStore.refreshInterval * 1000
    timerId = window.setInterval(tradingHoursRefresh, intervalMs)
  }

  /** 停止交易时段自动刷新 */
  function stopAutoRefresh(): void {
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
  }

  /** 收盘后低频轮询 - 直到所有基金确认净值后自动停止 */
  async function postMarketPoll(): Promise<void> {
    // 如果已进入交易时段，无需收盘轮询
    if (isTradingHours() && isCnTradingDay()) {
      stopPostMarketPoll()
      return
    }

    // 全部已确认，停止轮询
    if (!hasUnconfirmedFunds()) {
      stopPostMarketPoll()
      return
    }

    // 刷新数据检查确认状态
    await fundStore.refreshAllValuations()
    void holdingStore.executePendingActions(fundStore.valuationMap).catch(() => { /* 静默 */ })
  }

  /** 启动收盘后低频轮询 */
  function startPostMarketPoll(): void {
    stopPostMarketPoll()
    postMarketTimerId = window.setInterval(postMarketPoll, POST_MARKET_INTERVAL_MS)
  }

  /** 停止收盘后低频轮询 */
  function stopPostMarketPoll(): void {
    if (postMarketTimerId !== null) {
      clearInterval(postMarketTimerId)
      postMarketTimerId = null
    }
  }

  /** 页面重新可见时立即拉取最新估值（无视交易时段）。
   *  手机端切后台会冻结 setInterval，切回前台定时器不补刷，数据停留在冻结前的旧值——
   *  用户看到的"今日涨跌幅"不是最新。此处补一次刷新，保证前台始终是最新数据。
   *  节流：距上次刷新不足 VISIBILITY_REFRESH_MIN_GAP_MS 跳过（bootstrap 刚拉完/定时刷新刚跑过则不重打）。
   *  refreshAllValuations 自身有 Loading 互斥，并发安全。
   *  仅在开启自动刷新时生效——关闭自动刷新的用户不期望任何自动拉取。 */
  async function refreshOnVisible(): Promise<void> {
    if (!settingsStore.autoRefresh) return
    if (document.visibilityState !== 'visible') return
    if (fundStore.fundCodes.length === 0) return
    // 手机端后台冻结→次日恢复：实时缓存可能带昨日 stale 值，先清过期再刷新，
    // 避免 loop 重拉前显示异常（A股交易日已变即清空，同日不动）。
    fundStore.expireStaleRealtimeCache()
    const gap = Date.now() - fundStore.lastRefreshTime
    if (gap >= 0 && gap < VISIBILITY_REFRESH_MIN_GAP_MS) return
    await fundStore.refreshAllValuations()
    void holdingStore.executePendingActions(fundStore.valuationMap).catch(() => { /* 静默 */ })
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      void refreshOnVisible()
    }
  }

  /** 切换自动刷新开关 */
  function toggleAutoRefresh(enabled?: boolean): void {
    settingsStore.autoRefresh = enabled ?? !settingsStore.autoRefresh
    if (settingsStore.autoRefresh) {
      startAutoRefresh()
      startPostMarketPoll()
    } else {
      stopAutoRefresh()
      stopPostMarketPoll()
    }
  }

  /** 监听刷新间隔变化，自动重启交易时段定时器 */
  watch(() => settingsStore.refreshInterval, () => {
    if (settingsStore.autoRefresh) {
      startAutoRefresh()
    }
  })

  /** 监听自动刷新开关变化 */
  watch(() => settingsStore.autoRefresh, (enabled) => {
    if (enabled) {
      startAutoRefresh()
      startPostMarketPoll()
    } else {
      stopAutoRefresh()
      stopPostMarketPoll()
    }
  })

  /** 生命周期绑定 */
  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)

    // 启动定时刷新（无论 store 是否已有估值——bootstrap 已拉过则跳过本次刷新，但定时器仍需启动）。
    //   ⚠️ 修复：原逻辑 `if (valuationMap.size > 0) return` 会连带跳过 startAutoRefresh，
    //   导致首屏已有 bootstrap/缓存数据时定时器永不启动（表现为"今日涨跌幅不自动刷新"）。
    //   定时器与首次刷新解耦：定时器照常起；仅当无数据时补一次首屏刷新。
    if (settingsStore.autoRefresh) {
      startAutoRefresh()
      // 收盘后也启动低频轮询
      startPostMarketPoll()
    }

    // store 已有估值（bootstrap 启动时已刷新过）则不再重复首屏刷新
    if (fundStore.valuationMap.size === 0 && fundStore.fundCodes.length > 0) {
      // 延迟 300ms 再刷新，避免页面切换时卡顿
      setTimeout(() => {
        fundStore.refreshAllValuations().then(() => {
          // executePendingActions 不阻塞：内部串行 apidata 取数会拖慢后续刷新
          void holdingStore.executePendingActions(fundStore.valuationMap).catch(() => { /* 静默 */ })
        })
      }, 300)
    }
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    stopAutoRefresh()
    stopPostMarketPoll()
  })

  // keep-alive 场景：页面激活时重新验证定时器状态
  onActivated(() => {
    // 首次 onActivated（紧随 onMounted）跳过：首屏刷新已在 onMounted 处理，避免重复拉取。
    // 仅 keep-alive 从缓存恢复时补一次最新估值（离开期间后台未刷新，数据已过期）。
    const isReactivation = activatedOnce
    activatedOnce = true
    // 重新验证并重启定时器（浏览器可能在后台暂停了定时器）
    if (settingsStore.autoRefresh) {
      // 先停止再重启，确保定时器状态正确
      stopAutoRefresh()
      stopPostMarketPoll()
      startAutoRefresh()
      startPostMarketPoll()
      // 重激活时补一次最新估值；与 visibility 刷新共用节流，刚刷新过则跳过。
      if (isReactivation) void refreshOnVisible()
    }
    // 跨日检测与刷新统一由 useCrossDay 负责（home.vue 同时引入），此处不再重复
    // clearCrossDayCaches + refreshAllValuations，避免每次切回首页都误清当天缓存
    // 导致持仓股票涨跌被迫重新获取。
  })

  // keep-alive 场景：页面失活时可选暂停定时器节省资源
  onDeactivated(() => {
    // 不暂停定时器，让后台也能保持刷新
    // 仅在组件卸载时停止（onUnmounted）
  })

  return {
    inTradingHours,
    toggleAutoRefresh,
    startAutoRefresh,
    stopAutoRefresh,
  }
}
