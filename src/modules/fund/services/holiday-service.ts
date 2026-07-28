/**
 * 各市场法定节假日取数（Nager.Date）+ 缓存 + 注入 trading-day
 *
 * Nager.Date 公共节假日 API（带 CORS 头，主线程 fetch 直接可用，无需代理）：
 *   GET https://date.nager.at/api/v3/PublicHolidays/{year}/{country}
 *   返回 [{date, localName, name, global, counties, types...}]
 *   过滤 global===true（全国假日，州假日 counties 不算——股市是全国性）。
 *
 * 启动时批量取当年主要市场节假日，localStorage 缓存（按年，跨年重取），
 * 注入 trading-day.setMarketHolidays。取数失败静默退化为周末逻辑。
 *
 * 节假日数据只在主线程内存（Worker 隔离读不到）——休市过滤在 service 层做，
 * worker②③ 收到的都是开市 entries，无需判休市。
 */

import type { MarketTz } from '@/shared/types/common-types'
import { API_URLS, STORAGE_KEYS, HOLIDAY_CONFIG } from '@/config/constants'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'
import { setMarketHolidays } from '@/shared/market/trading-day'
import { runConcurrent } from '@/shared/net/rate-limiter'

/** 市场标识 → Nager 国家码 */
const MARKET_TO_COUNTRY: Partial<Record<MarketTz, string>> = {
  A: 'CN', HK: 'HK', US: 'US', JP: 'JP', KR: 'KR',
  TW: 'TW', DE: 'DE', FR: 'FR', UK: 'GB',
}

/** localStorage 缓存结构 */
interface HolidayCache {
  /** 缓存的年份（跨年重取） */
  year: number
  /** market → 当年节假日 YYYY-MM-DD 列表 */
  markets: Partial<Record<MarketTz, string[]>>
}

let loaded = false

/** 取某市场某年节假日（global=true 全国假日）。失败返回空数组（退化周末）。 */
async function fetchMarketHolidays(market: MarketTz, year: number): Promise<string[]> {
  const country = MARKET_TO_COUNTRY[market]
  if (!country) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HOLIDAY_CONFIG.FETCH_TIMEOUT)
  try {
    const resp = await fetch(`${API_URLS.NAGER_HOLIDAYS}/${year}/${country}`, { signal: controller.signal })
    clearTimeout(timer)
    if (!resp.ok) return []
    const data = await resp.json() as Array<{ date?: string; global?: boolean }>
    if (!Array.isArray(data)) return []
    return data.filter(h => h?.global === true && h.date).map(h => h.date as string)
  } catch {
    clearTimeout(timer)
    return []
  }
}

/**
 * 启动时加载各市场当年节假日：localStorage 缓存命中（同年）直接注入，
 * 否则批量取 Nager，存缓存 + 注入。失败的市场静默退化周末。
 * 幂等：已加载不重取（跨日/跨年由跨日重建调 reloadHolidays）。
 */
export async function loadHolidays(): Promise<void> {
  if (loaded) return
  loaded = true
  const year = new Date().getFullYear()

  // 1. localStorage 命中（同年）直接注入
  const cached = loadJSON<HolidayCache | null>(STORAGE_KEYS.MARKET_HOLIDAYS, null)
  const allMarkets = HOLIDAY_CONFIG.MARKETS as unknown as MarketTz[]
  if (cached && cached.year === year && cached.markets) {
    for (const m of allMarkets) {
      const dates = cached.markets[m]
      if (dates) setMarketHolidays(m, dates)
    }
    return
  }

  // 2. 缓存未命中/跨年：批量取 Nager
  const markets = allMarkets
  const result: Partial<Record<MarketTz, string[]>> = {}
  await runConcurrent(markets, HOLIDAY_CONFIG.FETCH_CONCURRENCY, async (m) => {
    const dates = await fetchMarketHolidays(m, year)
    if (dates.length > 0) {
      result[m] = dates
      setMarketHolidays(m, dates)  // 取到即注入，不等全部完成
    }
  })

  // 3. 存缓存（仅存取到的市场）
  const cache: HolidayCache = { year, markets: result }
  saveJSON(STORAGE_KEYS.MARKET_HOLIDAYS, cache)
}

/** 跨日/跨年重建时重载（重置 loaded 标记，重新取） */
export function reloadHolidays(): void {
  loaded = false
  void loadHolidays()
}
