/**
 * 指数板块 Pinia store
 *
 * 持有指数行情 + 用户勾选的指数列表。刷新走 index-service（主线程东财 JSONP）。
 * 持久化用户勾选到 localStorage。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { IndexQuote } from './index-types'
import { STORAGE_KEYS, DEFAULT_SELECTED_INDICES, INDEX_PRESETS } from '@/config/constants'
import { loadJSON, saveJSON, loadString, saveString } from '@/shared/cache/local-storage-io'
import { fetchGlobalIndexQuotes } from './index-service'
import { getBeijingTodayStr } from '@/shared/utils/date-format'

export const useIndexStore = defineStore('index', () => {
  /** 全部预设指数行情 - key 为 secid */
  const indexQuotes = ref<Map<string, IndexQuote>>(new Map())
  /** 用户勾选的指数 secid 列表 */
  const selectedIndices = ref<string[]>([...DEFAULT_SELECTED_INDICES])
  /** 是否刷新中 */
  const loading = ref(false)

  /** 已勾选指数的行情（按勾选顺序） */
  const selectedQuotes = computed(() =>
    selectedIndices.value
      .map(secid => indexQuotes.value.get(secid))
      .filter((q): q is IndexQuote => !!q),
  )

  /** 全部预设指数（带 selected 标记，供设置页展示） */
  const allIndices = computed(() =>
    INDEX_PRESETS.map(p => ({
      ...p,
      selected: selectedIndices.value.includes(p.secid),
    })),
  )

  /** 刷新全部预设指数行情 */
  async function refresh(): Promise<void> {
    if (loading.value) {
      return
    }
    loading.value = true
    try {
      const quotes = await fetchGlobalIndexQuotes()
      if (quotes.size > 0) {
        // 合并语义：只覆盖取到有效值(price>0)的指数；JSONP 间歇性失败导致 price=0 的项
        // 保留旧值，避免已显示的行情被冲成 "--"（service 对缺失项填 0）。
        const merged = new Map(indexQuotes.value)
        for (const [secid, q] of quotes) {
          if (q.price > 0) merged.set(secid, q)
        }
        indexQuotes.value = merged
        persistQuotes()
      }
    } finally {
      loading.value = false
    }
  }

  /** 恢复指数行情缓存（仅当日写入，跨日丢弃避免显示过期行情） */
  function restoreQuotes(): void {
    if (loadString(STORAGE_KEYS.INDEX_QUOTES_DATE) !== getBeijingTodayStr()) return
    const obj = loadJSON<Record<string, IndexQuote> | null>(STORAGE_KEYS.INDEX_QUOTES_CACHE, null)
    if (obj && typeof obj === 'object') {
      indexQuotes.value = new Map(Object.entries(obj))
    }
  }

  /** 持久化指数行情（带当日戳，供下次启动预热） */
  function persistQuotes(): void {
    const obj: Record<string, IndexQuote> = {}
    for (const [key, value] of indexQuotes.value) obj[key] = value
    saveJSON(STORAGE_KEYS.INDEX_QUOTES_CACHE, obj)
    saveString(STORAGE_KEYS.INDEX_QUOTES_DATE, getBeijingTodayStr())
  }

  /** 恢复用户勾选 + 行情缓存（启动预热，避免首屏全 --） */
  function restoreSelected(): void {
    const saved = loadJSON<string[] | null>(STORAGE_KEYS.SELECTED_INDICES, null)
    if (Array.isArray(saved) && saved.length > 0) {
      selectedIndices.value = saved
    }
    restoreQuotes()
  }

  /** 持久化用户勾选 */
  function persistSelected(): void {
    saveJSON(STORAGE_KEYS.SELECTED_INDICES, selectedIndices.value)
  }

  /** 切换指数勾选 */
  function toggleIndex(secid: string): void {
    const idx = selectedIndices.value.indexOf(secid)
    if (idx >= 0) {
      selectedIndices.value = selectedIndices.value.filter(s => s !== secid)
    } else {
      selectedIndices.value = [...selectedIndices.value, secid]
    }
    persistSelected()
  }

  return {
    indexQuotes, selectedIndices, loading, selectedQuotes, allIndices,
    refresh, restoreSelected, restoreQuotes, persistQuotes, toggleIndex,
  }
})
