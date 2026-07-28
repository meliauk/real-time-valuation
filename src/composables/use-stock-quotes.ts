/**
 * 股票行情 Composable - 封装持仓股票涨跌幅的获取与自动轮询
 * 生命周期与弹窗绑定：打开获取，关闭自动清理
 */

import { ref, watch, onUnmounted, type Ref } from 'vue'
import type { HoldingDetailItem } from '@/modules/fund/fund-types'
import { fetchFullStockQuotes } from '@/modules/stock/services/stock-service'
import { normalizeStockCodeTencent } from '@/shared/net/tencent-codec'
import { isCnTradingDay } from '@/modules/fund/valuation/cn-trading-day'
import { beijingNow } from '@/shared/utils/date-format'

type HoldingItem = HoldingDetailItem

/** 判断是否处于美股交易时段 - 使用北京时间 */
function isUsTradingHours(): boolean {
  const now = beijingNow()
  const h = now.hour()
  const m = now.minute()
  const t = h * 60 + m
  // 美股夏令时：北京时间 21:30-04:00
  // 美股冬令时：北京时间 22:30-05:00
  // 合并覆盖：21:30-05:00
  return t >= 1290 || t <= 300
}

/** 判断是否处于港股交易时段 - 使用北京时间 */
function isHkTradingHours(): boolean {
  const now = beijingNow()
  const h = now.hour()
  const m = now.minute()
  const t = h * 60 + m
  // 港股：北京时间 09:30-12:00, 13:00-16:00
  return (t >= 570 && t <= 720) || (t >= 780 && t <= 960)
}

export function useStockQuotes(holdings: Ref<HoldingItem[] | null>) {
  const quoteMap = ref<Map<string, number | null>>(new Map())
  const isLoading = ref(false)

  let timer: ReturnType<typeof setInterval> | null = null
  let stopWatch: ReturnType<typeof watch> | null = null

  function shouldPoll(): boolean {
    if (!isCnTradingDay()) return false
    const now = new Date()
    const hours = now.getHours()
    const minutes = now.getMinutes()
    const aShareActive = hours >= 9 && (hours < 15 || (hours === 15 && minutes === 0))
    return aShareActive || isUsTradingHours() || isHkTradingHours()
  }

  async function refresh(): Promise<void> {
    const list = holdings.value
    if (!list || list.length === 0) return

    isLoading.value = true
    try {
      const codes = list.map(h => h.stockCode)
      // 新版 stock-service 仅提供 fetchFullStockQuotes（返回 Map<string, StockQuote>），
      // 此处取 changeRate 以保持 composable 原有 quoteMap<number|null> 口径不变
      const data = await fetchFullStockQuotes(codes)
      const rates = new Map<string, number | null>()
      for (const [code, quote] of data) {
        rates.set(code, quote?.changeRate ?? null)
      }
      quoteMap.value = rates
    } catch {
      // 静默失败
    } finally {
      isLoading.value = false
    }
  }

  function startPolling(intervalMs = 30_000): void {
    stopPolling()
    refresh()
    timer = setInterval(() => {
      if (shouldPoll()) refresh()
    }, intervalMs)
  }

  function stopPolling(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  stopWatch = watch(
    holdings,
    (newVal) => {
      if (newVal && newVal.length > 0) {
        startPolling()
      } else {
        quoteMap.value = new Map()
        stopPolling()
      }
    },
    { immediate: true }
  )

  onUnmounted(() => {
    stopPolling()
    stopWatch?.()
  })

  function getChangeRate(stockCode: string): number | null {
    const code = normalizeStockCodeTencent(stockCode).code
    return quoteMap.value.get(code) ?? quoteMap.value.get(stockCode) ?? null
  }

  function rateClass(stockCode: string): string {
    const rate = getChangeRate(stockCode)
    if (rate == null) return ''
    if (rate > 0) return 'text-rise'
    if (rate < 0) return 'text-fall'
    return 'text-flat'
  }

  function formatRate(rate: number): string {
    const sign = rate > 0 ? '+' : ''
    return `${sign}${rate.toFixed(2)}%`
  }

  return {
    quoteMap,
    isLoading,
    getChangeRate,
    rateClass,
    formatRate,
    refresh,
  }
}
