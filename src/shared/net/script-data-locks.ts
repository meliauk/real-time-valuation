/**
 * window 全局变量取数的并发管控（单飞 + 跨 key 串行）
 *
 * 背景：pingzhongdata（window.stockCodesNew / Data_netWorthTrend / fS_name 等）与
 * F10 apidata（window.apidata JSONP 回调）都靠固定名 window 全局变量取数。
 * 详情页左右滑动时两个 pane 并发加载 → 同一时刻多个基金往同一批 window 变量写，
 * onload 读到的可能是别的基金残留/覆盖的值 → 持仓数据串扰（如无持仓的 QDII 显示出他基金持仓）。
 *
 * 本模块用「按 key 单飞 + 跨 key 串行」保证：window 全局变量任一时刻只属于一个 key
 * （一次 script 注入 → onload 取值 → 清理全局变量 = 一个临界区）。
 *   - 同 key 并发：合并成同一个请求（返回同一 promise），不重复注入 script
 *   - 不同 key：串行执行，A 清理完 window 才轮到 B 注入
 *
 * key 用 fundCode（pingzhongdata 三处与 F10 分别用 'pz:' / 'f10:' 前缀，两套全局变量互不阻塞）。
 */

type Task<T> = () => Promise<T>

/** 飞行中的请求（按 key 去重）：同 key 并发复用同一 promise */
const inflight = new Map<string, Promise<unknown>>()
/** 跨 key 串行链：任一时刻只有一个 task 在写 window 全局变量 */
let chain: Promise<void> = Promise.resolve()

/**
 * 单飞 + 串行执行一个依赖 window 全局变量的取数任务。
 *
 * @param key  锁 key（如 `pz:${fundCode}` / `f10:${fundCode}`）
 * @param task 取数任务（注入 script → onload 读 window → 清理全局变量）
 * @returns 同 key 并发返回同一 promise；不同 key 串行排队后执行
 */
export function runScriptTask<T>(key: string, task: Task<T>): Promise<T> {
  // 1. 同 key 飞行中：直接复用，不重复注入 script
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  // 2. 不同 key 串行：接在 chain 尾部，保证 window 全局变量临界区互斥
  const result = chain.then(async () => {
    try {
      return await task()
    } finally {
      inflight.delete(key)
    }
  })

  inflight.set(key, result)
  // 维持 chain 长度：已 settle 的旧链段会被 GC，不堆积
  chain = result.then(() => undefined, () => undefined)
  return result as Promise<T>
}
