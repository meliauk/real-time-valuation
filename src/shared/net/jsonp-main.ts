/**
 * 主线程 JSONP - 动态 <script> 标签加载绕过浏览器 CORS
 *
 * 仅主线程可用（依赖 document）。Worker 内无 document，跑不了 JSONP——
 * 故东财 push2/push2his/fundgz/lsjz/F10 这些不带 CORS 头的接口，只能主线程取。
 *
 * 定位：东财线主体走腾讯 fetch（Worker），JSONP 只在主线程作东财兜底用。
 * Yahoo/腾讯走 fetch，不用 JSONP。
 */

let jsonpCounter = 0

/**
 * 发起 JSONP 请求：创建 <script> 注入回调函数，获取跨域数据。
 * @param url          目标 URL（需含 cb= 回调参数）
 * @param callbackName 回调函数名（需与 url 的 cb= 一致）
 * @param timeout      超时毫秒，默认 6000
 */
export function jsonpRequest<T>(url: string, callbackName: string = 'jsonpgz', timeout: number = 6000): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = window as any
    let resolved = false
    const script = document.createElement('script')
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; cleanup(); reject(new Error(`JSONP 请求超时: ${url}`)) }
    }, timeout)

    w[callbackName] = (data: T) => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(data)
    }

    function cleanup() {
      clearTimeout(timer)
      // 不 delete/undefined 回调，改为空函数兜底：脚本若延迟到达（超时后/HMR 干扰）执行也不会抛 xxx is not a function
      w[callbackName] = () => {}
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }

    script.src = url
    script.onerror = () => {
      if (resolved) return
      resolved = true
      cleanup()
      reject(new Error(`JSONP 请求失败: ${url}`))
    }
    document.body.appendChild(script)
  })
}

/**
 * 通过 <script> 标签加载 JS 文件，脚本执行后读取 window 上的指定变量。
 * 用于东方财富 K线接口返回 var xxx={...} 格式、基金代码目录等。
 */
export function loadScriptVar<T>(url: string, varName: string, timeout: number = 4000, charset?: string): Promise<T | null> {
  return new Promise((resolve) => {
    const w = window as any
    delete w[varName]

    const script = document.createElement('script')
    let resolved = false

    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      if (script.parentNode) script.parentNode.removeChild(script)
      resolve(null)
    }, timeout)

    script.onload = () => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      const value = w[varName]
      if (script.parentNode) script.parentNode.removeChild(script)
      resolve(value as T | null)
    }

    script.onerror = () => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      if (script.parentNode) script.parentNode.removeChild(script)
      resolve(null)
    }

    if (charset) script.charset = charset
    script.src = url
    document.body.appendChild(script)
  })
}

/** 生成唯一回调函数名（避免并发请求回调名冲突） */
export function genCallbackName(prefix: string = 'jsonpgz'): string {
  return `${prefix}_${Date.now()}_${(++jsonpCounter).toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}
