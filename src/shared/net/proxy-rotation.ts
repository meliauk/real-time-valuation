/**
 * Yahoo/RSS 多代理轮换 + 熔断
 *
 * 在 Worker 内执行（Yahoo fetch 隔离到 Worker 线程，不淹主线程）。
 * 遍历可用代理，首个成功即返回；失败的累计连续失败计数，达阈值熔断（冷却期内跳过）。
 *
 * 响应无 CORS 头/非 JSON 时识别为"代理故障"(proxyFailed)，上层据此跳过该股本轮不再死循环重试。
 * 设计为 Worker 内可运行（无 DOM 依赖）。
 */

import { PROXY_CANDIDATES, type ProxyCandidate } from './proxy-candidates'
import { PROXY_BREAK_THRESHOLD, PROXY_BREAK_COOLDOWN_MS } from '@/config/constants'

/** 各代理运行时状态：连续失败计数 + 熔断到期时间戳(0=未熔断) */
interface ProxyState {
  failStreak: number
  breakUntil: number // ms 时间戳，>now 表示熔断中
}

const proxyStates: ProxyState[] = PROXY_CANDIDATES.map(() => ({ failStreak: 0, breakUntil: 0 }))

/** 标记一次失败（连续达阈值则熔断） */
function markProxyFail(idx: number): void {
  const s = proxyStates[idx]
  s.failStreak++
  if (s.failStreak >= PROXY_BREAK_THRESHOLD) {
    s.breakUntil = Date.now() + PROXY_BREAK_COOLDOWN_MS
  }
}

/** 标记一次成功（清零连续失败计数，不清熔断——熔断靠冷却自然到期） */
function markProxyOk(idx: number): void {
  proxyStates[idx].failStreak = 0
}

/** 代理是否当前熔断中 */
function isProxyBroken(idx: number): boolean {
  const s = proxyStates[idx]
  if (s.breakUntil > Date.now()) return true
  if (s.breakUntil > 0 && s.breakUntil <= Date.now()) s.breakUntil = 0
  return false
}

/** 当前可用的代理下标（跳过熔断的），无可用则返回空数组 */
function availableProxyIndexes(): number[] {
  const out: number[] = []
  for (let i = 0; i < PROXY_CANDIDATES.length; i++) {
    if (!isProxyBroken(i)) out.push(i)
  }
  return out
}

/**
 * 用单个代理 fetch 一次，解析目标 JSON。
 * @returns {data, reason}：data 非 null=成功；失败时 reason 为原因（供上层汇总，不逐次刷屏）
 */
async function fetchViaProxy(candidate: ProxyCandidate, targetUrl: string, timeoutMs: number): Promise<{ data: any | null; reason: string }> {
  const proxyUrl = candidate.build(targetUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(proxyUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (!resp.ok) return { data: null, reason: `HTTP ${resp.status}` }

    if (candidate.wrap) {
      // allorigins /get：{contents, status:{http_code}}
      const raw = await resp.json() as { contents?: string; status?: { http_code?: number } }
      if (raw?.status?.http_code && raw.status.http_code !== 200) {
        return { data: null, reason: `目标http_code=${raw.status.http_code}` }
      }
      const contents = raw?.contents
      if (typeof contents !== 'string' || contents.length === 0) {
        return { data: null, reason: 'contents空' }
      }
      return { data: JSON.parse(contents), reason: '' }
    } else {
      // 直传代理：响应体即原始 JSON 文本
      const text = await resp.text()
      if (!text || text.length === 0) return { data: null, reason: '响应体空' }
      return { data: JSON.parse(text), reason: '' }
    }
  } catch (e) {
    clearTimeout(timer)
    // 区分超时与其他网络错误，便于排查代理不稳定根因
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return { data: null, reason: aborted ? `超时(${timeoutMs}ms)` : 'fetch异常' }
  }
}

/**
 * 多代理轮换取数：遍历可用代理，首个成功即返回；全部失败返回 null。
 * 单代理(allorigins)场景重试2次对抗偶发超时/限流；代理全挂即 proxyFailed 终止本轮，
 * 不无限重试(会拖垮连接池)——靠上层 loop 接力(有缺失立刻下一轮)持续重试，即"一直尝试"。
 * @returns { data, proxyFailed }：data 非 null=成功；proxyFailed=true=代理全挂(上层跳过重试)
 */
export async function fetchWithProxyRotation(
  targetUrl: string,
  timeoutMs: number = 6000,
): Promise<{ data: any | null; proxyFailed: boolean }> {
  const MAX_RETRY = 2
  let lastReason = ''
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const indexes = availableProxyIndexes()
    const tryOrder = indexes.length > 0 ? indexes : [0]
    for (const idx of tryOrder) {
      const candidate = PROXY_CANDIDATES[idx]
      const { data, reason } = await fetchViaProxy(candidate, targetUrl, timeoutMs)
      if (data != null) {
        markProxyOk(idx)
        return { data, proxyFailed: false }
      }
      markProxyFail(idx)
      if (reason) lastReason = reason
    }
  }
  // 重试全失败输出一次汇总（避免逐次刷屏），上层结果日志已显示逐只
  // eslint-disable-next-line no-console
  console.warn(`[proxy] allorigins 重试${MAX_RETRY}次全失败 (${lastReason})`)
  return { data: null, proxyFailed: true }
}
