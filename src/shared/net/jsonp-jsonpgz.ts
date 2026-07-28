/**
 * fundgz 专用 JSONP 调度器 - 全局 jsonpgz 回调路由
 *
 * 天天基金 fundgz 估值接口固定用 `jsonpgz` 作为回调名（不能像通用 JSONP 那样每次生成唯一名）。
 * 并发请求多只基金时，所有响应都进同一个 `window.jsonpgz`，需按响应里的 fundcode 路由到对应请求。
 *
 * 本模块安装全局分发器，按 fundcode 把数据投递给等待中的请求；同一基金并发请求时全部 resolve。
 *
 * 仅主线程用（依赖 window/document）。
 */

interface PendingGzEntry {
  fundCode: string
  resolve: (v: any) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
  script: HTMLScriptElement
}

let dispatcherInstalled = false
const pendingGzEntries = new Map<string, PendingGzEntry[]>()

/** 安装全局 jsonpgz 分发器（幂等，只装一次） */
function ensureJsonpgzDispatcher(): void {
  if (dispatcherInstalled) return
  dispatcherInstalled = true

  ;(window as any).jsonpgz = (data: any) => {
    const fundCode = data?.fundcode ?? ''
    if (fundCode && pendingGzEntries.has(fundCode)) {
      const entries = pendingGzEntries.get(fundCode)!
      pendingGzEntries.delete(fundCode)
      for (const entry of entries) {
        clearTimeout(entry.timer)
        if (entry.script.parentNode) entry.script.parentNode.removeChild(entry.script)
        entry.resolve(data)
      }
    }
    // payload 无 fundcode 或无匹配 → 丢弃数据避免跨基金污染
  }
}

/** 从待处理队列移除指定条目（超时/出错时清理） */
function removeEntry(fundCode: string, script: HTMLScriptElement): void {
  const entries = pendingGzEntries.get(fundCode)
  if (entries) {
    const idx = entries.findIndex((e) => e.script === script)
    if (idx >= 0) entries.splice(idx, 1)
    if (entries.length === 0) pendingGzEntries.delete(fundCode)
  }
}

/**
 * 通过 fundgz JSONP 请求一只基金估值。
 * @param fundCode 基金代码
 * @param url      完整 URL（需含 fundcode，回调固定 jsonpgz）
 * @param timeout  超时毫秒
 */
export function requestViaJsonpgz(fundCode: string, url: string, timeout: number = 4000): Promise<any> {
  ensureJsonpgzDispatcher()

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timer = setTimeout(() => {
      removeEntry(fundCode, script)
      if (script.parentNode) script.parentNode.removeChild(script)
      reject(new Error(`fundgz JSONP 请求超时: ${url}`))
    }, timeout)

    const entry: PendingGzEntry = { fundCode, resolve, reject, timer, script }
    if (pendingGzEntries.has(fundCode)) {
      pendingGzEntries.get(fundCode)!.push(entry)
    } else {
      pendingGzEntries.set(fundCode, [entry])
    }

    script.src = url
    script.onerror = () => {
      removeEntry(fundCode, script)
      clearTimeout(timer)
      if (script.parentNode) script.parentNode.removeChild(script)
      reject(new Error(`fundgz JSONP 请求失败: ${url}`))
    }
    document.head.appendChild(script)
  })
}
