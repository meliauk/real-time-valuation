/**
 * Yahoo symbol 解析
 *
 * 市场归属由东财 F10 持仓的 emMarketCode 决定（权威），不做代码规律破解。
 * 三级策略：
 *   1. emMarketCode 精确映射（A/港/美/日台德法英在 EM_TO_YAHOO_SUFFIX，确定性强，不缓存）
 *   1.5 emCode 缺失但代码尾部带市场字母（东财把市场拼在代码尾，如 6501JP/012450KS）→ 拆分即得 symbol
 *   2. 无明确归属 → Yahoo Search 多结果匹配：
 *      完整中文名优先（取多条按 code 前缀校验挑吻合），搜不到降级用纯 code 搜。
 *      结果缓存7天。多结果匹配提高纯数字台韩股（如 2317/005930）的命中率。
 *
 * 不再用正则 pattern 猜测市场归属（深A/韩股撞码区靠正则必误判，靠 Search 拿权威结果）。
 */

import type { StockMarket } from '@/shared/types/common-types'
import { YAHOO_CONFIG, STORAGE_KEYS } from '@/config/constants'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'
import { EM_TO_YAHOO_SUFFIX } from '@/shared/market/em-market-map'

/** Yahoo symbol 缓存条目 */
interface SymbolCacheEntry { symbol: string; timestamp: number }

/** Yahoo 搜索结果 */
export interface YahooSearchResult {
  symbol: string
  name: string
  exchange: string
  quoteType: string
}

/** Yahoo search 回调（由 yahoo-service 注入：调 Worker③ 代理 fetch） */
export type SearchYahooSymbol = (keyword: string, count: number, includeEtf: boolean) => Promise<YahooSearchResult[]>

/** 根据 Yahoo symbol 后缀推断 StockMarket（Search 拿到 symbol 后推断归属用） */
export function detectMarketFromSymbol(symbol: string): StockMarket {
  if (symbol.endsWith('.SS') || symbol.endsWith('.SZ') || symbol.endsWith('.BJ')) return 'A'
  if (symbol.endsWith('.HK')) return 'HK'
  if (symbol.endsWith('.T')) return 'JP'
  if (symbol.endsWith('.KS') || symbol.endsWith('.KQ')) return 'KR'
  if (symbol.endsWith('.TW')) return 'TW'
  if (symbol.endsWith('.DE')) return 'DE'
  if (symbol.endsWith('.PA')) return 'FR'
  if (symbol.endsWith('.L')) return 'UK'
  if (/^[A-Z]+$/.test(symbol)) return 'US' // 纯字母无后缀 → 美股
  return 'unknown'
}

/**
 * 东财代码尾部的字母市场后缀 → Yahoo 后缀。
 * 东财 F10 对部分海外股把市场字母直接拼在代码尾部（如 6501JP / 012450KS），
 * 该字母即市场标识，拆开即得 Yahoo symbol。仅 emCode 缺失时启用（emCode 有的走精确映射）。
 * 注意：仅放后缀无歧义的市场；ISIN 码（JP3684400009 这类字母头+数字）不在此处理。
 */
const CODE_TAIL_MARKET_TO_YAHOO: Record<string, string> = {
  JP: '.T',  // 日本东证
  KS: '.KS', // 韩国 KOSPI 主板
  KQ: '.KQ', // 韩国 KOSDAQ 创业板
  TW: '.TW', // 台湾证交所
  HK: '.HK', // 港股
  DE: '.DE', // 德国 Xetra
  PA: '.PA', // 法国巴黎
  L: '.L',   // 英国伦敦
}

/**
 * 拆分"数字+字母市场尾"代码（如 6501JP → 6501.T）。
 * 仅整串为"纯数字 + 已知市场字母"且数字在前时命中，已带 .后缀/纯字母/ISIN码均不匹配。
 * @returns Yahoo symbol；不匹配返回 null（交上层走 Search）。
 */
function splitCodeTailMarket(code: string): string | null {
  const m = code.match(/^(\d+)(JP|KS|KQ|TW|HK|DE|PA|L)$/)
  if (!m) return null
  return `${m[1]}${CODE_TAIL_MARKET_TO_YAHOO[m[2]]}`
}

/** 加载 symbol 缓存（过滤过期） */
function loadSymbolCache(): Record<string, SymbolCacheEntry> {
  const raw = loadJSON<Record<string, SymbolCacheEntry> | null>(STORAGE_KEYS.YAHOO_SYMBOL_CACHE, null)
  if (!raw) return {}
  const now = Date.now()
  const valid: Record<string, SymbolCacheEntry> = {}
  for (const [code, entry] of Object.entries(raw)) {
    if (entry?.symbol && now - (entry.timestamp ?? 0) < YAHOO_CONFIG.SYMBOL_CACHE_TTL) {
      valid[code] = entry
    }
  }
  return valid
}

/** 写入 symbol 缓存（按 code 索引） */
function saveSymbolToCache(code: string, symbol: string): void {
  const cache = loadSymbolCache()
  cache[code] = { symbol, timestamp: Date.now() }
  saveJSON(STORAGE_KEYS.YAHOO_SYMBOL_CACHE, cache)
}

/**
 * 判断 Yahoo search 返回的 symbol 是否与持仓 code 吻合（前缀相等）。
 * symbol 形如 2317.TW / 005930.KS / AAPL，去掉后缀后与 code 比对。
 * 数字 code 比对时先去前导零（如 0700 vs 00700.HK），避免位数差异误判。
 */
function symbolMatchesCode(symbol: string, code: string): boolean {
  const prefix = symbol.split('.')[0].toUpperCase()
  const c = code.toUpperCase()
  if (prefix === c) return true
  // 数字去前导零后比对（700 vs 0700）
  if (/^\d+$/.test(prefix) && /^\d+$/.test(c)) {
    return parseInt(prefix) === parseInt(c)
  }
  return false
}

/**
 * 用关键词搜 Yahoo 并挑出与 code 吻合的 symbol。
 * 取多条结果（SEARCH_MATCH_COUNT）逐条校验，命中第一个吻合的即返回；
 * 都不吻合则返回第一条（兜底，name 命中时多半相关）。
 */
async function searchBestSymbol(
  keyword: string, code: string, searchFn: SearchYahooSymbol,
): Promise<string | null> {
  const results = await searchFn(keyword, YAHOO_CONFIG.SEARCH_MATCH_COUNT, true)
  if (results.length === 0) return null
  // 优先：与 code 前缀吻合的那条
  const matched = results.find(r => r.symbol && symbolMatchesCode(r.symbol, code))
  return (matched?.symbol) || results[0].symbol || null
}

/**
 * 两级策略解析 Yahoo symbol。
 * @param code        已清洗的股票代码
 * @param emMarketCode 东财市场代码（F10 持仓提供，权威）
 * @param stockName   股票中文名（无明确归属时 Search 优先用此匹配）
 * @param searchFn    Yahoo Search 回调（注入，调 Worker）
 * @returns Yahoo symbol，失败返回 null
 */
export async function guessYahooSymbol(
  code: string,
  emMarketCode: string | undefined,
  stockName: string | undefined,
  searchFn: SearchYahooSymbol,
): Promise<string | null> {
  const cleanCode = code.trim().toUpperCase() || code

  // 1. emMarketCode 精确映射（A/港/美三档，权威，不缓存）
  if (emMarketCode && EM_TO_YAHOO_SUFFIX[emMarketCode] !== undefined) {
    const suffix = EM_TO_YAHOO_SUFFIX[emMarketCode]
    if (emMarketCode === '116') return `${cleanCode.padStart(4, '0')}${suffix}` // 港股补4位
    if (emMarketCode === '105' || emMarketCode === '106') return cleanCode      // 美股大写无后缀
    return `${cleanCode}${suffix}`
  }

  // 1.5 emCode 缺失：东财把市场字母拼在代码尾（如 6501JP/012450KS），拆分即得 Yahoo symbol。
  //    仅整串"数字+已知市场字母"命中，纯数字/纯字母/ISIN码（字母头）不匹配 → 落第2步 Search。
  const tailSplit = splitCodeTailMarket(cleanCode)
  if (tailSplit) return tailSplit

  // 2. 无明确归属（emCode 缺失/不在映射表）→ Yahoo Search 多结果匹配。
  //    策略：完整中文名优先（命中名），多取几条按 code 前缀校验挑吻合的；仍无则降级用纯 code 搜。
  const cached = loadSymbolCache()[cleanCode]?.symbol
  if (cached) return cached

  const trimmedName = stockName?.trim()
  // 2a. 有中文名：用完整中文名搜，按 code 校验挑吻合
  if (trimmedName) {
    const sym = await searchBestSymbol(trimmedName, cleanCode, searchFn)
    if (sym) { saveSymbolToCache(cleanCode, sym); return sym }
  }
  // 2b. 中文名搜不到（或无中文名）：用纯 code 搜，数字/字母代码 Yahoo 命中率高
  const symByCode = await searchBestSymbol(cleanCode, cleanCode, searchFn)
  if (symByCode) {
    saveSymbolToCache(cleanCode, symByCode)
    return symByCode
  }
  return null
}
