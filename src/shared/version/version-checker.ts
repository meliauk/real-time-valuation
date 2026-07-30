/**
 * 版本检查器 - 自动检测线上新版本并强制刷新
 *
 * 解决 GitHub Pages 缓存 index.html 的问题：
 *   - index.html 被 CDN/浏览器缓存，更新部署后老用户仍读旧 index.html（引用旧 hash JS），
 *     需 Ctrl+Shift+R 强刷才更新。meta Cache-Control 在 GitHub Pages 不可靠（HTTP 响应头优先）。
 *   - 本模块：运行时 fetch version.json?v=<时间戳>（查询串绕过缓存，每次取线上最新），
 *     与当前运行的 __APP_VERSION__（构建时注入）比对，不一致则 location.reload()。
 *
 * version.json 由 vite 插件在构建时生成（含同一版本号），随产物部署到站点根/base 下。
 * 触发时机：app 启动后 + 页面回到前台（visibilitychange）+ 每 10 分钟轮询。
 */

/** 构建时注入的当前运行版本（vite define 注入，TS 占位声明见 version.d.ts） */
declare const __APP_VERSION__: string

/** 轮询间隔（毫秒）- 10 分钟。后台轮询意义不大（手机冻结），主要靠切回前台触发。 */
const POLL_INTERVAL_MS = 10 * 60 * 1000

/** 已触发刷新标记，避免重复 reload */
let reloadTriggered = false

/** version.json 的 URL（base 路径，与 index.html 同级） */
function versionJsonUrl(): string {
  // 取当前页面 base：JS 入口由 vite 注入 base 前缀，version.json 同级
  // 用相对路径保证 base 变化时正确：相对 index.html 所在目录
  const base = import.meta.env.BASE_URL || '/'
  return `${base}version.json`
}

/** fetch version.json（带时间戳查询串绕过缓存），返回线上版本号，失败返回空 */
async function fetchRemoteVersion(): Promise<string> {
  const url = `${versionJsonUrl()}?v=${Date.now()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const resp = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!resp.ok) return ''
    const json = (await resp.json()) as { version?: string }
    return String(json?.version || '')
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

/** 比对版本，不一致则强制刷新绕过浏览器缓存（专治 Chrome 对 index.html 的磁盘缓存）。
 *  ⚠️ 旧版用 location.reload()：Chrome 在 max-age 内对 reload 仍命中本地磁盘缓存，
 *  导致「检测到新版 → reload → 又读缓存旧 index.html → 还是旧版」死循环，
 *  表现为普通刷新回旧版（硬刷新 Ctrl+Shift+R 才正常）。其他浏览器缓存策略不同故正常。
 *  解法：给当前 URL 追加时间戳查询串后 location.replace —— 不同 URL 强制 Chrome 回源取新 index.html，
 *  新 index.html 引用新 hash JS → 新版 version-checker 比对一致不再刷新。 */
async function checkVersion(): Promise<void> {
  if (reloadTriggered) return
  const remote = await fetchRemoteVersion()
  if (!remote) return // 取数失败静默，下次再查
  const current = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
  if (current && remote !== current) {
    reloadTriggered = true
    reloadBypassCache()
  }
}

/** 刷新并绕过 index.html 缓存：用时间戳查询串让 Chrome 把请求当新 URL 回源。
 *  优先 replace（不污染 history 栈）；replace 不可用时退 reload。 */
function reloadBypassCache(): void {
  try {
    const u = new URL(window.location.href)
    u.searchParams.set('_v', String(Date.now()))
    window.location.replace(u.toString())
    return
  } catch { /* URL 构造异常，退回普通 reload */ }
  window.location.reload()
}

/** 启动版本检查：启动后查一次 + 切回前台查 + 定时轮询。幂等可多次调用。 */
export function startVersionChecker(): void {
  // 首次延迟 3 秒检查，避开首屏繁忙
  setTimeout(checkVersion, 3000)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkVersion()
    }
  })

  setInterval(checkVersion, POLL_INTERVAL_MS)
}
