/**
 * 股票板块 Pinia store
 *
 * 自选股列表 + 行情。添加走 stock-search 搜索 → 选定入 watchlist；
 * 刷新走 stock-service 批量取东财 push2 行情。watchlist 持久化 localStorage。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { StockQuote, StockSearchItem } from './stock-types'
import { STORAGE_KEYS } from '@/config/constants'
import { loadJSON, saveJSON, loadString, saveString } from '@/shared/cache/local-storage-io'
import { fetchFullStockQuotes } from './services/stock-service'
import { getBeijingTodayStr } from '@/shared/utils/date-format'

/** watchlist 条目（代码 + emMarketCode，用于精确构造 secid） */
export interface WatchlistEntry {
  code: string
  emMarketCode?: string
}

export const useStockStore = defineStore('stock', () => {
  /** 自选股列表 */
  const watchlist = ref<WatchlistEntry[]>([])
  /** 自选股行情 - key 为 code */
  const quoteMap = ref<Map<string, StockQuote>>(new Map())
  /** 刷新中 */
  const loading = ref(false)

  /** 自选股数量 */
  const count = computed(() => watchlist.value.length)

  /** 恢复 watchlist + 行情缓存（启动预热，避免首屏全 --） */
  function restoreWatchlist(): void {
    const saved = loadJSON<WatchlistEntry[] | null>(STORAGE_KEYS.WATCHLIST, null)
    if (Array.isArray(saved)) watchlist.value = saved
    restoreQuotes()
  }

  /** 持久化 watchlist */
  function persistWatchlist(): void {
    saveJSON(STORAGE_KEYS.WATCHLIST, watchlist.value)
  }

  /** 添加自选股（搜索结果项） */
  function addToWatchlist(item: StockSearchItem): boolean {
    if (watchlist.value.some(e => e.code === item.code)) return false
    watchlist.value = [...watchlist.value, { code: item.code, emMarketCode: item.rawMarket }]
    persistWatchlist()
    return true
  }

  /** 移除自选股 */
  function removeFromWatchlist(code: string): void {
    watchlist.value = watchlist.value.filter(e => e.code !== code)
    const next = new Map(quoteMap.value)
    next.delete(code)
    quoteMap.value = next
    persistWatchlist()
  }

  /** 刷新全部自选股行情 */
  async function refresh(): Promise<void> {
    if (loading.value) {
      return
    }
    if (watchlist.value.length === 0) {
      return
    }
    loading.value = true
    try {
      const codes = watchlist.value.map(e => e.code)
      const marketMap = new Map<string, string>()
      for (const e of watchlist.value) {
        if (e.emMarketCode) marketMap.set(e.code, e.emMarketCode)
      }
      const fetched = await fetchFullStockQuotes(codes, marketMap)
      if (fetched.size > 0) {
        // 合并语义：只覆盖取到有效值(price>0)的股票；JSONP 间歇性失败导致 price=0 的项
        // 保留旧值，避免已显示的行情被冲成 "--"（service 对缺失项填 0）。
        const merged = new Map(quoteMap.value)
        for (const [code, q] of fetched) {
          if (q.price > 0) merged.set(code, q)
        }
        quoteMap.value = merged
        persistQuotes()
      }
    } finally {
      loading.value = false
    }
  }

  /** 恢复自选股行情缓存（仅当日写入，跨日丢弃避免显示过期行情） */
  function restoreQuotes(): void {
    if (loadString(STORAGE_KEYS.STOCK_QUOTES_DATE) !== getBeijingTodayStr()) return
    const obj = loadJSON<Record<string, StockQuote> | null>(STORAGE_KEYS.STOCK_QUOTES_CACHE, null)
    if (obj && typeof obj === 'object') {
      // 仅恢复 watchlist 里仍存在的股票，剔除已移除的过期项
      const codes = new Set(watchlist.value.map(e => e.code))
      const filtered = new Map<string, StockQuote>()
      for (const [code, q] of Object.entries(obj)) {
        if (codes.has(code)) filtered.set(code, q)
      }
      if (filtered.size > 0) quoteMap.value = filtered
    }
  }

  /** 持久化自选股行情（带当日戳，供下次启动预热） */
  function persistQuotes(): void {
    const obj: Record<string, StockQuote> = {}
    for (const [key, value] of quoteMap.value) obj[key] = value
    saveJSON(STORAGE_KEYS.STOCK_QUOTES_CACHE, obj)
    saveString(STORAGE_KEYS.STOCK_QUOTES_DATE, getBeijingTodayStr())
  }

  return {
    watchlist, quoteMap, loading, count,
    restoreWatchlist, restoreQuotes, persistWatchlist, persistQuotes,
    addToWatchlist, removeFromWatchlist, refresh,
  }
})
