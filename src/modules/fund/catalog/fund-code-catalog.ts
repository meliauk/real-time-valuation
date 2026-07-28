/**
 * 基金代码目录 + 基金类型取数
 *
 * 全量基金代码目录（fundcode_search.js，声明 var r = [[code,pinyin,name,type,...], ...]），
 * 含全市场基金的代码/名称/类型。结果按日缓存到 localStorage（24h），并发调用共享同一次请求。
 *
 * getFundType：从目录取基金类型字符串（带 LRU 缓存），供估值合并的 FundTypeResolver 注入。
 *   - 优先目录查找（快、覆盖全）；
 *   - 目录缺失回退搜索接口；
 *   - LRU 缓存（FUND_VALUATION_CONFIG.FUND_TYPE_CACHE_MAX）避免重复查询。
 */

import type { FundCatalogItem } from '@/modules/fund/fund-types'
import { API_URLS, FUND_CATALOG_CONFIG, FUND_VALUATION_CONFIG, STORAGE_KEYS } from '@/config/constants'
import { loadScriptVar } from '@/shared/net/jsonp-main'
import { searchFunds } from './fund-search'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'
import { ref } from 'vue'

/** 目录正在从网络下载/解析中（仅缓存未命中走网络时为 true，命中内存/localStorage 缓存时不触发）。
 *  供 UI 显示"首次加载目录可能较慢"的提示：true 弹出，false 消失。 */
const catalogLoading = ref(false)

/** 读取目录加载中信号（供组件 watch 决定是否显示加载提示） */
export function useCatalogLoading() {
  return catalogLoading
}

/** 目录 localStorage 缓存结构 */
interface CatalogCache {
  data: FundCatalogItem[]
  timestamp: number
}

let cachedCatalog: FundCatalogItem[] | null = null
let catalogPromise: Promise<FundCatalogItem[]> | null = null

/** 取全量基金代码目录（内存→localStorage→网络，并发共享） */
export async function fetchFundCodeCatalog(): Promise<FundCatalogItem[]> {
  if (cachedCatalog && cachedCatalog.length > 0) return cachedCatalog
  if (catalogPromise) return catalogPromise

  // 尝试 localStorage 恢复
  const restored = loadJSON<CatalogCache | null>(STORAGE_KEYS.FUND_CATALOG, null)
  if (restored && Array.isArray(restored.data) && restored.data.length > 0 &&
      Date.now() - (restored.timestamp ?? 0) < FUND_CATALOG_CONFIG.CATALOG_CACHE_DURATION) {
    cachedCatalog = restored.data
    return cachedCatalog
  }

  // 缓存未命中，要走网络下载——置加载信号供 UI 提示
  catalogLoading.value = true
  catalogPromise = doFetchCatalog()
  try {
    return await catalogPromise
  } finally {
    catalogPromise = null
    catalogLoading.value = false
  }
}

/** 实际加载目录（script tag 加载 fundcode_search.js，读 window.r） */
async function doFetchCatalog(): Promise<FundCatalogItem[]> {
  try {
    const r = await loadScriptVar<any[]>(
      API_URLS.FUND_CODE_SEARCH,
      'r',
      FUND_CATALOG_CONFIG.CATALOG_TIMEOUT,
      'utf-8',
    )
    if (!Array.isArray(r) || r.length === 0) return []

    cachedCatalog = r
      .filter((item: any[]) => Array.isArray(item) && item.length >= 4 && item[0] && item[2])
      .map((item: any[]) => ({
        fundCode: String(item[0]),
        pinyin: String(item[1] ?? ''),
        fundName: String(item[2]),
        fundType: String(item[3] ?? ''),
      }))

    saveJSON(STORAGE_KEYS.FUND_CATALOG, { data: cachedCatalog, timestamp: Date.now() })
    return cachedCatalog
  } catch {
    return []
  }
}

// ===== 基金类型取数（getFundType，供估值合并 FundTypeResolver 注入）=====

/** 基金类型+名称（同一次取数同时获得，供估值合并判定 T+1/T+2 及 fundgz 失败时名称兜底） */
export interface FundTypeAndName {
  fundType: string
  fundName: string
}

/** 基金类型+名称 LRU 缓存（code → {fundType, fundName}） */
const fundTypeCache = new Map<string, FundTypeAndName>()

/** LRU 淘汰写入缓存 */
function setFundTypeCache(code: string, data: FundTypeAndName): void {
  if (fundTypeCache.has(code)) {
    fundTypeCache.delete(code)
  } else if (fundTypeCache.size >= FUND_VALUATION_CONFIG.FUND_TYPE_CACHE_MAX) {
    const firstKey = fundTypeCache.keys().next().value
    if (firstKey !== undefined) fundTypeCache.delete(firstKey)
  }
  fundTypeCache.set(code, data)
}

/**
 * 取基金类型+名称（供估值合并判定 T+1/T+2，及 fundgz 失败时 fundName 兜底）。
 * 优先目录查找，回退搜索接口，带 LRU 缓存。一次取数同时拿类型和名称。
 * 失败返回 { fundType: '', fundName: '' }。
 */
export async function getFundType(fundCode: string): Promise<FundTypeAndName> {
  const cached = fundTypeCache.get(fundCode)
  if (cached) return cached

  // 目录查找（同时拿类型和名称）
  try {
    const catalog = await fetchFundCodeCatalog()
    const item = catalog.find((c) => c.fundCode === fundCode)
    if (item?.fundType) {
      const data: FundTypeAndName = { fundType: item.fundType, fundName: item.fundName || '' }
      setFundTypeCache(fundCode, data)
      return data
    }
  } catch {
    // 目录失败，回退搜索
  }

  // 搜索接口回退（同时拿类型和名称）
  try {
    const results = await searchFunds(fundCode)
    if (results.length > 0) {
      const data: FundTypeAndName = {
        fundType: results[0].fundType || '',
        fundName: results[0].fundName || '',
      }
      setFundTypeCache(fundCode, data)
      return data
    }
  } catch {
    // 搜索也失败
  }

  return { fundType: '', fundName: '' }
}

/**
 * 从目录取基金名称（同步，要求目录已加载）。供启动预热填充名称映射——
 * fundgz 失败的基金也能在估值刷新前从目录拿到名称，避免列表只剩"基金(code)"。
 * 目录未加载时返回空串。
 */
export function getCatalogFundName(fundCode: string): string {
  if (!cachedCatalog) return ''
  const item = cachedCatalog.find(c => c.fundCode === fundCode)
  return item?.fundName ?? ''
}
