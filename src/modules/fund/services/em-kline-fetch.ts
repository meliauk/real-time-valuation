/**
 * 东方财富 push2his 日K fetch（主线程 JSONP 兜底）
 *
 * Worker① 腾讯 fqkline 取不到时（返回 null，非休盘），主线程用东财 push2his 日K
 * JSONP 兜底取数。Worker 跑不了 JSONP（无 document），故兜底只能在主线程做。
 *
 * 返回 klines 逗号串数组（date,open,close,high,low,vol,amount），与腾讯 klinesFromTencent
 * 口径一致，可直接喂 calcPrevDayFromKlines（取 parts[0]=date、parts[2]=close，需 ≥5 段）。
 */

import { API_URLS, FUND_LOOP_CONFIG } from '@/config/constants'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'
import { secidFor } from '@/shared/market/secid'

interface EmKlineResponse {
  data?: {
    code?: string
    name?: string
    klines?: string[]
  }
}

/**
 * 东财 push2his 日K fetch → klines 逗号串数组。
 *
 * @param code         归一化纯代码（600519/00700/AAPL）
 * @param emMarketCode 东财市场代码（构造 secid 用）
 * @param limit        取近 N 根日K（默认 30，覆盖昨日+前一交易日+节假日缓冲，足够 calcPrevDay）
 * @returns klines 数组；失败/空返回 null
 */
export async function fetchEmKline(
  code: string,
  emMarketCode?: string,
  limit: number = 30,
): Promise<string[] | null> {
  const secid = secidFor(code, emMarketCode)
  if (!secid) return null

  const cb = genCallbackName('kl')
  const url =
    `${API_URLS.STOCK_KLINE}?secid=${secid}` +
    `&fields1=f1,f2,f3,f4,f5,f6` +
    `&fields2=f51,f52,f53,f54,f55,f56,f57` +
    `&klt=101&fqt=1&beg=0&end=20500101&lmt=${limit}` +
    `&cb=${cb}`

  try {
    const resp = await jsonpRequest<EmKlineResponse>(url, cb, FUND_LOOP_CONFIG.EM_FALLBACK_TIMEOUT)
    const klines = resp?.data?.klines
    if (!Array.isArray(klines) || klines.length === 0) return null
    return klines
  } catch {
    return null
  }
}
