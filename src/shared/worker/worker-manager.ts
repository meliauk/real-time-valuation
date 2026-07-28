/**
 * WorkerManager - 统一 Worker 调度器（并发架构中枢）
 *
 * 各板块 service 通过它发请求，不直接碰 Worker 通信细节。
 * 负责：Worker 懒创建、请求分发（请求ID回调匹配）、看门狗超时、terminate 重建、生命周期。
 *
 * 设计要点：
 *   - 懒启动：板块首次请求时才创建 Worker，不用不占资源。
 *   - 请求ID回调匹配：每个请求分配唯一 id，postMessage 后存 pending，
 *     Worker 回 {id, ok, data} 时按 id 找到 Promise resolve。
 *   - 看门狗超时：每请求启动超时定时器，超时则该请求 reject。
 *   - terminate 重建：连续多次超时/Worker 报错时，terminate 整个 Worker 重建，
 *     清掉该 Worker 所有 pending，下个请求自动新建。
 *   - 跨日清理：app 跨日时 terminate 所有 Worker 重建。
 *
 * ⚠️ Worker 引入方式：用 Vite 字面量形式创建 Worker 传入：
 *     new Worker(new URL('./workers/xxx-worker.ts', import.meta.url), {type:'module'})
 *   不能用 @/ 别名或变量——Vite 静态分析要求 new URL 第一参数是字面量相对路径。
 *   service 调 registerWorker(name, factory) 注册创建器，manager 首次请求时调用。
 */

import type { WorkerRequest, WorkerResponse } from './worker-protocol'
import { nextRequestId } from './worker-protocol'

/** 待处理请求的回调记录 */
interface PendingRequest {
  resolve: (data: any) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** 各 Worker 的运行时状态 */
interface WorkerSlot {
  /** Worker 实例（懒创建，null=未创建） */
  worker: Worker | null
  /** 待处理请求 Map（id → 回调） */
  pending: Map<number, PendingRequest>
  /** 连续失败计数（用于触发 terminate 重建） */
  failStreak: number
  /** Worker 创建失败/崩溃标记，true=该 Worker 不可用 */
  broken: boolean
  /** Worker 创建工厂（service 注册时传入） */
  factory: (() => Worker) | null
}

/** 各板块 Worker 状态槽 */
const slots = new Map<string, WorkerSlot>()

/**
 * 注册板块 Worker 创建工厂。
 * 各板块 service 初始化时调用，传入 Vite 字面量创建的 Worker 构造器。
 * @param name    Worker 名（WORKER_NAMES 中的值）
 * @param factory 创建 Worker 的函数：() => new Worker(new URL('./xxx.ts', import.meta.url), {type:'module'})
 */
export function registerWorker(name: string, factory: () => Worker): void {
  let slot = slots.get(name)
  if (!slot) {
    slot = { worker: null, pending: new Map(), failStreak: 0, broken: false, factory: null }
    slots.set(name, slot)
  }
  slot.factory = factory
}

/** 获取/创建指定 Worker 的状态槽 */
function getSlot(name: string): WorkerSlot {
  let slot = slots.get(name)
  if (!slot) {
    slot = { worker: null, pending: new Map(), failStreak: 0, broken: false, factory: null }
    slots.set(name, slot)
  }
  return slot
}

/** 创建 Worker 实例（用注册的 factory） */
function createWorker(name: string, slot: WorkerSlot): Worker | null {
  if (!slot.factory) {
    slot.broken = true
    return null
  }
  try {
    const worker = slot.factory()
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      handleResponse(name, e.data)
    }
    worker.onerror = () => {
      // Worker 崩溃：标记不可用，清空该 Worker 所有 pending
      slot.broken = true
      slot.worker = null
      for (const [, p] of slot.pending) {
        clearTimeout(p.timer)
        p.reject(new Error(`Worker ${name} 崩溃`))
      }
      slot.pending.clear()
    }
    slot.broken = false
    return worker
  } catch {
    slot.broken = true
    return null
  }
}

/** 处理 Worker 返回的响应：按 id 路由到对应 Promise */
function handleResponse(name: string, resp: WorkerResponse): void {
  const slot = slots.get(name)
  if (!slot) return
  const pending = slot.pending.get(resp.id)
  if (!pending) return
  clearTimeout(pending.timer)
  slot.pending.delete(resp.id)
  if (resp.ok) {
    pending.resolve(resp.data)
    slot.failStreak = 0
  } else {
    pending.reject(new Error(resp.err || `Worker ${name} 请求失败`))
    slot.failStreak++
    if (slot.failStreak >= 5) rebuildWorker(name)
  }
}

/** 重建 Worker：terminate 旧实例，清 pending，下个请求自动新建 */
function rebuildWorker(name: string): void {
  const slot = slots.get(name)
  if (!slot) return
  if (slot.worker) {
    slot.worker.terminate()
    slot.worker = null
  }
  for (const [, p] of slot.pending) {
    clearTimeout(p.timer)
    p.reject(new Error(`Worker ${name} 重建`))
  }
  slot.pending.clear()
  slot.failStreak = 0
  slot.broken = false
}

/**
 * 向指定 Worker 发请求。
 * @param name      Worker 名
 * @param type      请求类型（各 Worker 自定义）
 * @param payload   请求载荷
 * @param timeoutMs 超时毫秒（默认 8s）
 * @returns Worker 返回的 data
 */
export function request<P = unknown, D = unknown>(
  name: string,
  type: string,
  payload: P,
  timeoutMs: number = 8000,
): Promise<D> {
  const slot = getSlot(name)

  // Worker 未创建或已崩溃 → 尝试创建
  if (!slot.worker && !slot.broken) {
    slot.worker = createWorker(name, slot)
  }
  if (!slot.worker || slot.broken) {
    return Promise.reject(new Error(`Worker ${name} 不可用`))
  }

  const id = nextRequestId()
  const req: WorkerRequest<P> = { id, type, payload, timeoutMs }
  const worker = slot.worker

  return new Promise<D>((resolve, reject) => {
    const timer = setTimeout(() => {
      slot.pending.delete(id)
      slot.failStreak++
      reject(new Error(`Worker ${name} 请求超时 (${type})`))
      if (slot.failStreak >= 5) rebuildWorker(name)
    }, timeoutMs)

    slot.pending.set(id, { resolve: resolve as (d: any) => void, reject, timer })
    worker.postMessage(req)
  })
}

/** 跨日清理：terminate 所有 Worker 重建（清空各 Worker 内的状态） */
export function rebuildAllWorkers(): void {
  for (const name of slots.keys()) {
    rebuildWorker(name)
  }
}

/** 终止所有 Worker（app 卸载时） */
export function terminateAllWorkers(): void {
  for (const [, slot] of slots) {
    if (slot.worker) {
      slot.worker.terminate()
      slot.worker = null
    }
    for (const [, p] of slot.pending) {
      clearTimeout(p.timer)
      p.reject(new Error(`Worker 终止`))
    }
    slot.pending.clear()
  }
}

/** 单例导出（整个 app 共用一个 manager） */
export const workerManager = {
  registerWorker,
  request,
  rebuildAllWorkers,
  terminateAllWorkers,
}
