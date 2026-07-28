/**
 * Worker② 实时线 - A/HK 实时涨跌取数
 *
 * Worker 内 fetch 腾讯 qt.gtimg 报价（CORS 放行），批量取 A/HK 实时涨跌。
 * 腾讯报价 GBK 编码，按 ~ split 取现价(第4)/昨收(第5)算涨跌，乱码不影响数字字段。
 *
 * 东财 push2 兜底不在 Worker 内做——Worker 取不到时该股不入 Map，
 * 由主线程 em-realtime-service 用东财 push2 JSONP 兜底。
 *
 * 请求类型：
 *   - 'realtime-batch'：批量 [{code, market}] → Map<code, StockQuoteInfo>
 */

/// <reference lib="webworker" />

import type { WorkerIncomingMessage, WorkerResponse } from '@/shared/worker/worker-protocol'
import type { StockMarket, StockQuoteInfo } from '@/shared/types/common-types'
import { fetchTencentRealtimeBatch } from '@/shared/net/tencent-fetch'
import { buildRealtimeQuote } from '@/modules/fund/calc/realtime-em-calc'

self.onmessage = async (e: MessageEvent<WorkerIncomingMessage>) => {
  const { id, type, payload } = e.data

  if (type === 'realtime-batch') {
    const entries = payload as Array<{ code: string; market: StockMarket }>
    const fetched = await fetchTencentRealtimeBatch(entries, 6000)
    // 用 buildRealtimeQuote 组装完整 StockQuoteInfo（修类型不匹配：原直接返回腾讯 {price,prevClose,changeRate}）
    // 休市过滤在 service 层做（worker 收到的都是开市 entries）；worker 内 isNonTradingDay 仅判周末作纵深防御
    const result = new Map<string, StockQuoteInfo>()
    for (const entry of entries) {
      const raw = fetched.get(entry.code)
      const rate = raw ? raw.changeRate : null
      result.set(entry.code, buildRealtimeQuote(entry.code, entry.market, rate, '腾讯'))
    }
    reply(id, true, result)
    return
  }

  reply(id, false, undefined, `em-realtime-worker 未实现请求类型: ${type}`)
}

/** 统一回复 */
function reply(id: number, ok: boolean, data?: unknown, err?: string): void {
  const resp: WorkerResponse = { id, ok, data, err }
  ;(self as any).postMessage(resp)
}

export {}
