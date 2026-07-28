/**
 * F10 专用 apidata 串行 JSONP 加载器
 *
 * 东方财富 F10 接口（lsjz 历史净值、jjcc 持仓）都用固定全局 `window.apidata` 作回调，
 * 并发请求会互相覆盖导致数据错配/丢失。故所有 apidata 请求必须串行执行。
 *
 * 现改用 runScriptTask('f10:'+code)：
 *   - 同 fundCode 并发请求（如 fetchFundAllHoldings 内 year 重试）合并成一次
 *   - 不同 fundCode 串行，保证 window.apidata 任一时刻只属于一个基金
 *   - 与 pingzhongdata 的 'pz:' 锁分离（两套全局变量互不阻塞，提升并发）
 *
 * 兼容两种响应格式：
 *   1) `var apidata = {...}`（变量声明）- onload 后读取 window.apidata 对象
 *   2) `apidata({...})`（JSONP 回调）- 注册 window.apidata 为函数接收数据
 *
 * 超时处理：超时前检查 window.apidata 是否已被 var 覆盖为数据对象；超时后留空函数兜底，
 * 防晚到脚本执行 apidata({...}) 抛 "not a function"（数据丢弃可接受）。
 * 超时强制中止脚本加载（置空 src + 移除），释放 fundf10 域名连接槽。
 */

import { F10_CONFIG } from '@/config/constants'
import { runScriptTask } from '@/shared/net/script-data-locks'

/** 从 F10 接口 url 解析 fundCode（jjcc/lsjz 等接口都带 code=6位数字），作为锁 key */
function extractCode(url: string): string {
  const m = /code=(\d{6})/.exec(url)
  return m ? m[1] : url
}

/**
 * 通过 <script> 标签加载 F10 apidata 接口。
 * @param url     F10 接口 URL（含 type=jjcc/lsjz 等参数）
 * @param timeout 超时毫秒，默认 F10_CONFIG.TIMEOUT
 * @returns apidata 数据对象（可能含 content/year/curyear 等字段），失败 reject
 */
export function loadApidata(url: string, timeout: number = F10_CONFIG.TIMEOUT): Promise<any> {
  const code = extractCode(url)
  return runScriptTask(`f10:${code}`, () => loadApidataRaw(url, timeout))
}

/** 实际的 apidata 加载逻辑（无并发管控，由 loadApidata 包锁串行化） */
function loadApidataRaw(url: string, timeout: number): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const w = window as any
    let resolved = false

    // 注册为回调函数（支持 apidata({...}) 格式）
    w.apidata = (data: any) => {
      if (resolved) return
      resolved = true
      cleanup(false)
      resolve(data)
    }

    const script = document.createElement('script')
    const timer = setTimeout(() => {
      if (resolved) return
      // 超时前检查：var apidata = {...} 会把函数覆盖为数据对象
      const maybeData = w.apidata
      if (maybeData && typeof maybeData === 'object' && !(maybeData instanceof Function)) {
        resolved = true
        cleanup(false)
        resolve(maybeData)
        return
      }
      // 超时：强制终止脚本加载，释放连接槽
      resolved = true
      cleanup(true)
      reject(new Error(`F10 数据加载超时: ${url}`))
    }, timeout)

    function cleanup(timedOut: boolean) {
      clearTimeout(timer)
      // 超时留空函数兜底（防晚到脚本抛错）；正常完成清空（防残留数据污染下一次请求）
      w.apidata = timedOut ? () => {} : undefined
      if (timedOut) {
        script.onerror = null
        script.onload = null
        // 先置空 src 再移除，最大化触发浏览器中止在途请求
        try { script.src = '' } catch { /* ignore */ }
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }

    script.src = url
    script.onload = () => {
      if (resolved) return
      // var apidata = {...} 格式：函数被覆盖为数据对象，在 onload 中读取
      const maybeData = w.apidata
      if (maybeData && typeof maybeData === 'object' && !(maybeData instanceof Function)) {
        resolved = true
        cleanup(false)
        resolve(maybeData)
      } else {
        // 脚本加载完成但 window.apidata 未设置（无数据或格式未知）
        resolved = true
        cleanup(false)
        resolve(undefined)
      }
    }
    script.onerror = () => {
      if (resolved) return
      resolved = true
      cleanup(false)
      reject(new Error(`F10 数据加载失败: ${url}`))
    }
    document.head.appendChild(script)
  })
}
