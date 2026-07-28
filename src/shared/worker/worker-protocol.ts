/**
 * 主线程 ↔ Worker 通信协议
 *
 * 统一消息格式，主线程和所有 Worker 都遵守。
 * 请求带请求 ID，响应回匹配的 ID——WorkerManager 据此把响应路由到对应的 Promise。
 *
 * 协议设计：
 *   请求（主线程 → Worker）：{ id, type, payload }
 *   响应（Worker → 主线程）：{ id, ok, data?, err?, proxyFailed? }
 *
 * type 由各 Worker 自定义（如 'prev-day-A' / 'realtime-batch'），Worker 内按 type 分发处理。
 */

/** 主线程 → Worker 的请求消息 */
export interface WorkerRequest<P = unknown> {
  /** 请求 ID（主线程生成，响应回匹配此 ID） */
  id: number
  /** 请求类型（各 Worker 自定义，如 'prev-day-A'） */
  type: string
  /** 请求载荷（按 type 不同结构不同） */
  payload: P
  /** 超时毫秒（Worker 内 fetch 用，默认由 Worker 自定） */
  timeoutMs?: number
}

/** Worker → 主线程的响应消息 */
export interface WorkerResponse<D = unknown> {
  /** 对应请求的 ID */
  id: number
  /** 是否成功 */
  ok: boolean
  /** 成功时的数据 */
  data?: D
  /** 失败时的错误信息 */
  err?: string
  /** 代理全挂标记（Yahoo/RSS 用）：true=所有代理失败，上层跳过该股本轮不重试 */
  proxyFailed?: boolean
}

/** Worker 收到的请求（Worker 内 onmessage 用，含 id/type/payload/timeoutMs） */
export type WorkerIncomingMessage = WorkerRequest

/** 请求 ID 自增器（主线程用） */
let reqIdCounter = 0

/** 生成下一个请求 ID */
export function nextRequestId(): number {
  return ++reqIdCounter
}
