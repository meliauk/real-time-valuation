/**
 * 预留板块 Worker - 空壳，待扩展
 *
 * 当前作为"最小链路验证"载体：支持 'ping' 类型请求，fetch 腾讯 fqkline 返回日K条数，
 * 用来验证"主线程发请求 → Worker fetch → 回结果"全链路通畅。
 * 未来扩展新板块时，复制本文件改名为 <新板块>-worker.ts，写入真实取数逻辑。
 *
 * Worker 内无 DOM/Pinia，纯取数+postMessage 回主线程。
 */

/// <reference lib="webworker" />

import type { WorkerIncomingMessage, WorkerResponse } from '@/shared/worker/worker-protocol'
import { fetchTencentKline, fetchTencentRealtimeBatch } from '@/shared/net/tencent-fetch'
import type { StockMarket } from '@/shared/types/common-types'

self.onmessage = async (e: MessageEvent<WorkerIncomingMessage>) => {
  const { id, type, payload } = e.data

  // 链路自检：原样回显，验证通信协议
  if (type === 'echo') {
    reply(id, true, { echoed: payload })
    return
  }

  // 最小链路验证：fetch 腾讯 fqkline 日K，返回条数
  if (type === 'ping-tencent-kline') {
    const { code, market } = payload as { code: string; market: StockMarket }
    const klines = await fetchTencentKline(code, market, 6000)
    reply(id, true, { count: klines?.length ?? 0, last: klines?.[klines.length - 1] ?? null })
    return
  }

  // 直连 fetch 自检（腾讯报价，走真实批量解析逻辑）
  if (type === 'ping-tencent-quote') {
    const map = await fetchTencentRealtimeBatch([{ code: '600519', market: 'A' }], 6000)
    const got = map.size > 0
    reply(id, got, got ? { size: map.size, sample: map.get('600519') ?? null } : undefined,
      got ? undefined : '腾讯报价解析为空')
    return
  }

  // 未实现的请求类型
  reply(id, false, undefined, 'reserved 板块未实现该请求类型')
}

/** 统一回复：构造 WorkerResponse 并 postMessage 回主线程 */
function reply(id: number, ok: boolean, data?: any, err?: string): void {
  const resp: WorkerResponse = { id, ok, data, err }
  ;(self as any).postMessage(resp)
}

export {}
