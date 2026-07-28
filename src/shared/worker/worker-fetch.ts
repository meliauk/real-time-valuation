/**
 * Worker 内 fetch 封装 - 超时 + 代理轮换
 *
 * Worker 内取数统一走 fetch（不依赖 JSONP，因为 Worker 无 document）。
 *   - 腾讯接口（CORS 放行）：直接 fetch，不走代理
 *   - Yahoo/RSS 接口（需代理）：走 shared/net/proxy-rotation 多代理轮换
 *
 * 本文件是 Worker 与 proxy-rotation 之间的薄封装，给 Worker 入口文件用。
 * 设计为 Worker 内可运行（无 DOM 依赖）。
 */

import { fetchWithProxyRotation } from '@/shared/net/proxy-rotation'

/**
 * Worker 内直连 fetch（用于腾讯等 CORS 放行接口）。
 * @returns 解析后的对象；失败返回 null
 */
export async function workerFetchDirect<T>(
  url: string,
  timeoutMs: number = 5000,
): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!resp.ok) return null
    return (await resp.json()) as T
  } catch {
    clearTimeout(timer)
    return null
  }
}

/**
 * Worker 内通过代理 fetch（用于 Yahoo/RSS 等需 CORS 代理的接口）。
 * 多代理轮换 + 熔断在 proxy-rotation 内完成。
 * @returns { data, proxyFailed }：data 非 null=成功；proxyFailed=true=代理全挂
 */
export async function workerFetchViaProxy<T>(
  targetUrl: string,
  timeoutMs: number = 3000,
): Promise<{ data: T | null; proxyFailed: boolean }> {
  const { data, proxyFailed } = await fetchWithProxyRotation(targetUrl, timeoutMs)
  return { data: data as T | null, proxyFailed }
}
