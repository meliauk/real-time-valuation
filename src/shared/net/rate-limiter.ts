/**
 * 通用请求节流 - 批量请求时控制并发节奏
 *
 * 东财对短时密集请求敏感（连接池争抢/限流），腾讯 fqkline 高并发也可能不稳。
 * 本模块提供"批量分批 + 批间隔"的节流工具，取数时调用。
 */

/**
 * 按批大小和批间隔，串行处理一批任务。
 * 每批内并发，批与批之间等待 gapMs。
 *
 * @param items     待处理项
 * @param batchSize 每批大小
 * @param gapMs     批间隔毫秒
 * @param fn        单项处理函数（批内并发调用）
 */
export async function runBatched<T>(
  items: T[],
  batchSize: number,
  gapMs: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await Promise.all(batch.map((item) => fn(item).catch(() => { /* 单个失败不影响其他 */ })))
    if (i + batchSize < items.length) await new Promise((r) => setTimeout(r, gapMs))
  }
}

/**
 * 固定并发池执行器：同时最多 concurrency 个在途，完成一个补一个。
 * 不分批，纯并发限制。适合 Yahoo 这种"慢但需控并发"的场景。
 *
 * @param items       待处理项
 * @param concurrency 最大并发数
 * @param fn          单项处理函数
 */
export async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  let index = 0
  const size = Math.min(concurrency, items.length)
  const workers = Array.from({ length: size }, async () => {
    while (index < items.length) {
      const i = index++
      try {
        await fn(items[i])
      } catch { /* 单个失败不影响其他 */ }
    }
  })
  await Promise.all(workers)
}
