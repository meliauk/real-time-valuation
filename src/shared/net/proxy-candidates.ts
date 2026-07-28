/**
 * Yahoo/RSS CORS 代理候选列表
 *
 * 实测免费公共代理中，仅 allorigins 的 /get 端点稳定可用（返回 {contents,status} 包裹）。
 * corsproxy 对 Yahoo chart 返 404；allorigins-raw 在 Worker 内被 CORS 拦截（不发 ACAO 头）；
 * thingproxy 经常宕机。故只保留 allorigins-get，配合 proxy-rotation 的循环重试取数。
 *
 * 这里只放候选定义，运行时轮换+熔断逻辑在 proxy-rotation.ts。
 */

export interface ProxyCandidate {
  /** 代理名（日志/调试用） */
  name: string
  /** 构造完整代理 URL */
  build: (targetUrl: string) => string
  /** true=响应是 {contents,status} 包裹(需二次 parse)；false=直传原始内容 */
  wrap: boolean
}

/**
 * 代理候选列表（与 constants.ts YAHOO_PROXY_CANDIDATES 一致）。
 * Worker 内内联此定义以保持自包含（Worker 不能 import 带 DOM 依赖的模块，但纯常量可以）。
 */
export const PROXY_CANDIDATES: ProxyCandidate[] = [
  { name: 'allorigins-get', build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, wrap: true },
]
