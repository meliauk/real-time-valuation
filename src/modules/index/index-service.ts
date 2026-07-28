/**
 * 指数行情取数（主线程东财 push2）
 *
 * 20 个全球指数统一通过东财 push2 secid 批量查询。JSONP 主线程取（指数接口无 CORS 头，
 * Worker 内 fetch 不可用，且指数请求量小、主线程够用）。
 *
 * 口径：整体失败返回空 Map（上层保留旧值，不填 0 占位覆盖）；接口成功但个别指数缺失才填占位。
 */

import type { IndexQuote } from './index-types'
import { API_URLS, INDEX_PRESETS, FUND_LOOP_CONFIG } from '@/config/constants'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'

/** 东财 push2 行情基础字段（指数/股票自选股复用） */
export interface EmBaseQuote {
  code: string
  name: string
  price: number
  changeRate: number
  changeAmount: number
}

/** 东财 push2 行情原始字段 */
interface EmQuoteRaw {
  f2: number | null  // 最新价
  f3: number | null  // 涨跌幅
  f4: number | null  // 涨跌额
  f12: string         // 代码（A股6位，全球指数为 secid 或简称）
  f14: string         // 名称
}

interface EmQuoteResponse {
  data?: { diff?: EmQuoteRaw[] }
}

/** 批量取所有预设指数行情，返回 Map<secid, IndexQuote> */
export async function fetchGlobalIndexQuotes(): Promise<Map<string, IndexQuote>> {
  const result = new Map<string, IndexQuote>()
  const secids = INDEX_PRESETS.map(p => p.secid)
  const quoteMap = await fetchQuotesBySecid(secids)

  for (const preset of INDEX_PRESETS) {
    // push2 f12 对 A 股是 6 位代码，对全球指数是 secid 本身或简称；先用 secid 查再用 code 查
    const q = quoteMap.get(preset.secid) ?? quoteMap.get(preset.code)
    result.set(preset.secid, {
      secid: preset.secid,
      code: preset.code,
      name: q?.name || preset.name,
      price: q?.price ?? 0,
      changeRate: q?.changeRate ?? 0,
      changeAmount: q?.changeAmount ?? 0,
    })
  }
  return result
}

/** 通过 secid 批量查询东财 push2 行情（内部用，指数 + 股票自选股复用） */
export async function fetchQuotesBySecid(secids: string[]): Promise<Map<string, EmBaseQuote>> {
  const result = new Map<string, EmBaseQuote>()
  if (secids.length === 0) return result

  const allDiff: EmQuoteRaw[] = []
  for (let i = 0; i < secids.length; i += FUND_LOOP_CONFIG.REALTIME_BATCH) {
    const batch = secids.slice(i, i + FUND_LOOP_CONFIG.REALTIME_BATCH)
    const cb = genCallbackName('idx')
    const url = `${API_URLS.STOCK_QUOTES}?fltt=2&secids=${batch.join(',')}&fields=f2,f3,f4,f12,f14&cb=${cb}`
    try {
      const resp = await jsonpRequest<EmQuoteResponse>(url, cb)
      if (resp?.data?.diff) allDiff.push(...resp.data.diff)
    } catch {
      // 静默失败
    }
  }

  for (const item of allDiff) {
    result.set(item.f12, {
      code: item.f12,
      name: item.f14 || item.f12,
      price: item.f2 ?? 0,
      changeRate: item.f3 ?? 0,
      changeAmount: item.f4 ?? 0,
    })
  }
  return result
}
