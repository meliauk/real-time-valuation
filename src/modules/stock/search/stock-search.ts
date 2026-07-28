/**
 * 股票搜索（东财 suggest）
 *
 * 透传东财 suggest 能力：用户输什么就用东财模糊匹配，返回什么就给什么。
 * 不做品类过滤（股票/ETF/港股ETF 等均可搜可加）——搜索是独立功能，
 * 与"基金搜索只搜基金"互不重叠。品类/市场归属以东财返回的 MktNum 为准，
 * 由 addToWatchlist 存为 emMarketCode，后续 secidFor 走精确路径。
 */

import type { StockSearchItem } from '../stock-types'
import { API_URLS } from '@/config/constants'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'

/** 东财市场代码 → 中文标签（仅 UI 展示用；缺失时 market 为空但仍返回，emCode 照存不丢） */
const EM_MARKET_LABEL: Record<string, string> = {
  '1': '沪', '0': '深', '116': '港', '105': '美', '106': '美',
  '124': '日', '130': '韩', '118': '台',
  '155': '德', '156': '法', '157': '英',
  '173': '巴', '174': '印', '175': '新', '177': '澳',
}

/** 东财 suggest 响应 */
interface EmSuggestResponse {
  QuotationCodeTable?: {
    Data?: Array<{ Code?: string; Name?: string; MktNum?: string }>
  }
}

/** 搜索股票（关键词），透传东财 suggest，去重最多 15 条。
 *  不过滤品类：东财返回的股票/ETF/基金均可搜到，市场归属以 MktNum 为准。 */
export async function searchStocks(keyword: string): Promise<StockSearchItem[]> {
  const q = keyword.trim()
  if (!q) return []

  try {
    const cb = genCallbackName('search')
    const url = `${API_URLS.STOCK_SEARCH}?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=15&cb=${cb}`
    const data = await jsonpRequest<EmSuggestResponse>(url, cb, 6000)

    if (!data?.QuotationCodeTable?.Data) return []

    const results: StockSearchItem[] = []
    const seen = new Set<string>()
    for (const item of data.QuotationCodeTable.Data) {
      const code = String(item.Code || '')
      const name = String(item.Name || '')
      const mktNum = String(item.MktNum || '')
      if (!code || !name || !mktNum) continue
      const key = `${code}|${mktNum}`
      if (seen.has(key)) continue
      seen.add(key)
      // market 仅 UI 标签用，缺失留空；rawMarket(emCode) 始终保留，secidFor 据此精确构造
      results.push({ code, name, market: EM_MARKET_LABEL[mktNum] ?? '', rawMarket: mktNum })
    }
    return results.slice(0, 15)
  } catch {
    return []
  }
}
