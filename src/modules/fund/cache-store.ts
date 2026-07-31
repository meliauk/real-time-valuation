/**
 * 基金数据缓存 Store
 *
 * 管理基金估值数据的本地缓存（启动时预热，避免首屏空白）。
 * 职责：缓存读写、过期清理（超 CACHE_DURATION 失效）、跨日失效。
 * 不含估值获取（fund-store/fund-bootstrap）、持仓（holding-store）。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FundCache } from '@/modules/fund/fund-types'
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '@/config/constants'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'
import { isCacheToday, isCacheValid } from '@/shared/utils/date-format'

export const useCacheStore = defineStore('cache', () => {
  /** 缓存数据映射 - key 为基金代码 */
  const cacheMap = ref<Map<string, FundCache>>(new Map())
  /** 是否已从 localStorage 恢复完成。
   *  ⚠️ 防抖落盘兜底（flushPersist）的覆盖守卫：版本检查器强制刷新可能在 restoreCache()
   *  完成前就触发 beforeunload，此时内存 cacheMap 还是初始空 Map，若直接 flushPersist 会把空对象
   *  写入 FUND_CACHE 覆盖盘上真实缓存。restore 完成前置此标记为 false，兜底见之即跳过。 */
  let restored = false

  // ===== 缓存读取 =====
  function getCache(fundCode: string): FundCache | undefined {
    return cacheMap.value.get(fundCode)
  }
  /** 获取有效缓存 - 检查跨日和过期 */
  function getValidCache(fundCode: string): FundCache | null {
    const cache = cacheMap.value.get(fundCode)
    if (!cache) return null
    if (!isCacheToday(cache.cachedDate)) return null
    if (!isCacheValid(cache.cachedAt, DEFAULT_SETTINGS.CACHE_DURATION)) return null
    return cache
  }
  function hasValidCache(fundCode: string): boolean {
    return getValidCache(fundCode) !== null
  }

  // ===== 缓存写入 =====
  function saveCache(cache: FundCache): void {
    cacheMap.value.set(cache.fundCode, cache)
    persistCache()
  }
  function saveBatchCache(caches: FundCache[]): void {
    for (const cache of caches) cacheMap.value.set(cache.fundCode, cache)
    persistCache()
  }
  function removeCache(fundCode: string): void {
    cacheMap.value.delete(fundCode)
    persistCache()
  }
  function clearAllCache(): void {
    cacheMap.value.clear()
    saveJSON(STORAGE_KEYS.FUND_CACHE, {})
  }
  /** 清除过期缓存（超时的移除；跨日但估值仍保留用于启动预热） */
  function clearExpiredCache(): void {
    let changed = false
    for (const [key, cache] of cacheMap.value) {
      if (!isCacheValid(cache.cachedAt, DEFAULT_SETTINGS.CACHE_DURATION)) {
        cacheMap.value.delete(key)
        changed = true
      }
    }
    if (changed) persistCache()
  }

  // ===== 持久化（防抖） =====
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  function persistCache(): void {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      const obj: Record<string, FundCache> = {}
      for (const [key, value] of cacheMap.value) obj[key] = value
      saveJSON(STORAGE_KEYS.FUND_CACHE, obj)
      persistTimer = null
    }, 2000)
  }
  function flushPersist(): void {
    // 恢复未完成时跳过兜底写盘：避免空内存覆盖盘上真实缓存（版本检查刷新风暴场景）
    if (!restored) return
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    const obj: Record<string, FundCache> = {}
    for (const [key, value] of cacheMap.value) obj[key] = value
    saveJSON(STORAGE_KEYS.FUND_CACHE, obj)
  }

  // ===== 恢复 =====
  function restoreCache(): void {
    const obj = loadJSON<Record<string, FundCache> | null>(STORAGE_KEYS.FUND_CACHE, null)
    if (obj && typeof obj === 'object') {
      cacheMap.value = new Map(Object.entries(obj))
    }
    restored = true
  }

  return {
    cacheMap,
    getCache, getValidCache, hasValidCache,
    saveCache, saveBatchCache, removeCache, clearAllCache, clearExpiredCache,
    restoreCache, persistCache, flushPersist,
  }
})
