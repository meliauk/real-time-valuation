/**
 * 股票行情取数（主线程东财 push2 批量）
 *
 * 自选股批量行情，走东财 push2 ulist.np（secid 批量，JSONP 主线程）。
 * 量小（用户自选股通常几十只），主线程够用，不进 Worker。
 *
 * 提供两种口径：
 *   - fetchStockQuotes：精简（只 f2/f3/f12/f14，涨跌用）
 *   - fetchFullStockQuotes：完整（价格/涨跌/开高低/成交额/换手率/市盈市净，卡片展示用）
 */

import type { StockQuote } from '../stock-types'
import { API_URLS, FUND_LOOP_CONFIG } from '@/config/constants'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'
import { secidFor } from '@/shared/market/secid'
import { normalizeStockCodeTencent } from '@/shared/net/tencent-codec'

/** 东财 push2 完整行情原始字段 */
interface EmQuoteRaw {
  f2: number | null; f3: number | null; f4: number | null; f6: number | null
  f8: number | null; f9: number | null; f12: string; f14: string
  f15: number | null; f16: number | null; f17: number | null; f23: number | null
}
interface EmQuoteResponse { data?: { diff?: EmQuoteRaw[] } }

/** 批量取自选股完整行情，返回 Map<code, StockQuote>（双 key：归一化 + 原始） */
export async function fetchFullStockQuotes(
  codes: string[],
  marketMap?: Map<string, string>,
): Promise<Map<string, StockQuote>> {
  const result = new Map<string, StockQuote>()
  if (codes.length === 0) return result

  // 构造 secid（用 marketMap 精确，缺失时 secidFor 兜底）
  const codeToNormalized = new Map<string, string>()
  const secidToCode = new Map<string, string>()
  for (const raw of codes) {
    const { code } = normalizeStockCodeTencent(raw)
    codeToNormalized.set(raw, code)
    const market = marketMap?.get(raw) ?? marketMap?.get(code)
    const secid = secidFor(code, market)
    if (secid) secidToCode.set(secid, code)
  }
  if (secidToCode.size === 0) {
    return result
  }

  const secids = [...secidToCode.keys()]
  const allDiff: EmQuoteRaw[] = []
  for (let i = 0; i < secids.length; i += FUND_LOOP_CONFIG.REALTIME_BATCH) {
    const batch = secids.slice(i, i + FUND_LOOP_CONFIG.REALTIME_BATCH)
    // 东财 push2 同域 6 连接上限，与指数/基金实时线并发会间歇性失败 → 失败阶梯重试。
    // 间隔递增让出连接（连接竞争偶发，多等几轮通常即成功），重试到取到或耗尽。
    const RETRY_DELAYS = [300, 600, 900]
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      const cb = genCallbackName('stk')
      const url = `${API_URLS.STOCK_QUOTES}?fltt=2&secids=${batch.join(',')}&fields=f2,f3,f4,f6,f8,f9,f12,f14,f15,f16,f17,f23&cb=${cb}`
      try {
        const resp = await jsonpRequest<EmQuoteResponse>(url, cb)
        if (resp?.data?.diff) allDiff.push(...resp.data.diff)
        break // 成功（或返回空但未抛错）即跳出重试
      } catch {
        if (attempt < RETRY_DELAYS.length) await new Promise<void>(r => setTimeout(r, RETRY_DELAYS[attempt]))
      }
    }
  }

  // 按 f12(code) 索引
  const quoteMap = new Map<string, EmQuoteRaw>()
  for (const item of allDiff) quoteMap.set(item.f12, item)

  // 双 key 写入（归一化 + 原始）
  for (const [raw, normalized] of codeToNormalized) {
    const item = quoteMap.get(normalized)
    const market = marketMap?.get(raw) ?? marketMap?.get(normalized)
    result.set(raw, {
      code: raw,
      name: item?.f14 ?? raw,
      price: item?.f2 ?? 0,
      changeRate: item?.f3 ?? 0,
      changeAmount: item?.f4 ?? 0,
      open: item?.f17 ?? undefined,
      high: item?.f15 ?? undefined,
      low: item?.f16 ?? undefined,
      turnover: item?.f6 ?? undefined,
      turnoverRate: item?.f8 ?? undefined,
      peRatio: item?.f9 ?? undefined,
      pbRatio: item?.f23 ?? undefined,
      emMarketCode: market,
    })
  }
  return result
}
