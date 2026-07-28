/**
 * Worker① 收盘线 - 昨日收盘涨跌取数
 *
 * Worker 内 fetch 腾讯 fqkline 日K（ifzq.gtimg.cn，CORS 放行），
 * 用 calc/prev-day-calc 算各市场昨日收盘涨跌 + 休盘判定。
 *
 * 东财 JSONP 兜底不在 Worker 内做（Worker 无 document 跑不了 JSONP）——
 * Worker 取不到时返回 null，由主线程 em-close-service 用东财 push2his JSONP 兜底。
 *
 * 请求类型：
 *   - 'prev-day'：单只 {code, market} → PrevDayResult
 *   - 'prev-day-batch'：批量 [{code, market}] → Map<code, PrevDayResult>
 */

/// <reference lib="webworker" />

import type { WorkerIncomingMessage, WorkerResponse } from '@/shared/worker/worker-protocol'
import type { StockMarket } from '@/shared/types/common-types'
import { FUND_LOOP_CONFIG } from '@/config/constants'
import { fetchTencentKline } from '@/shared/net/tencent-fetch'
import { calcPrevDayFromKlines, type PrevDayResult } from '@/modules/fund/calc/prev-day-calc'

self.onmessage = async (e: MessageEvent<WorkerIncomingMessage>) => {
  const { id, type, payload } = e.data

  if (type === 'prev-day') {
    const { code, market } = payload as { code: string; market: StockMarket }
    const klines = await fetchTencentKline(code, market, 6000)
    const result: PrevDayResult = klines ? calcPrevDayFromKlines(klines, market) : null
    // null 表示 Worker 取不到，交主线程东财兜底；{closed:true} 是休盘（不兜底）
    reply(id, true, { code, result })
    return
  }

  if (type === 'prev-day-batch') {
    const entries = payload as Array<{ code: string; market: StockMarket }>
    const results = new Map<string, PrevDayResult>()
    // 分批并发（避免几百只一次性 Promise.all 触发腾讯限流/超时）
    const BATCH = FUND_LOOP_CONFIG.KLINE_WORKER_CONCURRENCY
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH)
      await Promise.all(batch.map(async (entry) => {
        const klines = await fetchTencentKline(entry.code, entry.market, 6000)
        results.set(entry.code, klines ? calcPrevDayFromKlines(klines, entry.market) : null)
      }))
    }
    reply(id, true, results)
    return
  }

  reply(id, false, undefined, `em-close-worker 未实现请求类型: ${type}`)
}

/** 统一回复 */
function reply(id: number, ok: boolean, data?: unknown, err?: string): void {
  const resp: WorkerResponse = { id, ok, data, err }
  ;(self as any).postMessage(resp)
}

export {}
