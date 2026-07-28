/**
 * Worker③ Yahoo 综合线 - 海外市场涨跌取数
 *
 * Worker 内通过公共代理 fetch Yahoo chart API（Yahoo 不带 CORS 头，需代理），
 * 用 calc/yahoo-close-calc（close 模式）或 calc/yahoo-realtime-calc（realtime 模式）算涨跌。
 *
 * 职责边界：本 Worker 只做"symbol → fetch → 算涨跌"。
 *   - Yahoo symbol 解析（代码→symbol，含 localStorage 缓存）在主线程 yahoo-service 做（Worker 无 localStorage）。
 *   - 并发槽 close/realtime 各 1 也在 service 控制（防代理限流）。
 *   - 代理轮换 + 熔断在 shared/net/proxy-rotation 内完成。
 *
 * 请求类型：
 *   - 'yahoo-quote'：单只 {symbol, market, mode} → {rate, date, session?, proxyFailed}
 *   - 'yahoo-quote-batch'：批量 [{symbol, market, mode}] → Map<symbol, 结果>
 */

/// <reference lib="webworker" />

import type { WorkerIncomingMessage, WorkerResponse } from '@/shared/worker/worker-protocol'
import type { MarketTz } from '@/shared/types/common-types'
import { API_URLS } from '@/config/constants'
import { fetchWithProxyRotation } from '@/shared/net/proxy-rotation'
import { fetchTencentRealtimeBatch } from '@/shared/net/tencent-fetch'
import { classifyUSSessionByMs } from '@/shared/market/trading-day'
import { calcCloseChangeRateByMarket } from '@/modules/fund/calc/yahoo-close-calc'
import { calcRealtimeChangeRateByMarket, calcRealtimeSimple } from '@/modules/fund/calc/yahoo-realtime-calc'
import type { YahooChartResponse, YahooChartResult } from '@/modules/fund/calc/yahoo-types'

/** 单只取数结果 */
export interface YahooQuoteResult {
  /** 涨跌幅（百分比，2位），null=算不出 */
  rate: number | null
  /** 交易日 YYYY-MM-DD，null=算不出 */
  date: string | null
  /** 美股时段标签（仅 realtime 美股） */
  session?: 'PRE' | 'REGULAR' | 'POST'
  /** true=所有代理都失败，上层跳过该股本轮不重试 */
  proxyFailed: boolean
  /** 数据来源：腾讯(美股盘中) / Yahoo(盘前盘后+其他海外)；供 UI 标 source */
  source?: '腾讯' | 'Yahoo'
}

/** 取数模式 */
type Mode = 'close' | 'realtime'

/** 单只 Yahoo 取数：拼 URL → 代理 fetch → calc 算涨跌 */
async function fetchYahooQuote(
  symbol: string,
  market: MarketTz,
  mode: Mode,
): Promise<YahooQuoteResult> {
  // close 用 1d 日K（只需日级收盘）；realtime 用 2m 线（含盘前/盘中/盘后）
  const interval = mode === 'realtime' ? '2m' : '1d'
  const range = mode === 'realtime' ? '1d' : '1mo'
  const targetUrl = `${API_URLS.YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=true`

  // realtime 2m线数据量大、经代理更慢；手机端弱网下 8s 超时易吃满导致整轮拖垮，
  // 收紧到 5s 快速失败交还 loop 3s 接力重试（单轮快、靠循环无限重试兜底）。
  const timeout = mode === 'realtime' ? 5000 : 6000
  const { data, proxyFailed } = await fetchWithProxyRotation(targetUrl, timeout)
  if (proxyFailed || !data) {
    return { rate: null, date: null, proxyFailed }
  }

  const result: YahooChartResult | undefined = (data as YahooChartResponse)?.chart?.result?.[0]
  if (!result?.meta) {
    // eslint-disable-next-line no-console
    console.warn(`[yahoo-worker] ${symbol} ${mode}: 代理成功但无chart.result.meta，原始结构异常`)
    return { rate: null, date: null, proxyFailed: false }
  }

  // realtime 按 market 分流：美股走时段模式，其他海外直取
  if (mode === 'close') {
    const r = calcCloseChangeRateByMarket(result, market)
    return { rate: r.rate, date: r.date, proxyFailed: false, source: 'Yahoo' }
  }
  const r = market === 'US'
    ? calcRealtimeChangeRateByMarket(result, market)
    : calcRealtimeSimple(result, market)
  return {
    rate: r.rate,
    date: r.date,
    session: r.session,
    proxyFailed: false,
    source: 'Yahoo',
  }
}

self.onmessage = async (e: MessageEvent<WorkerIncomingMessage>) => {
  const { id, type, payload } = e.data

  if (type === 'yahoo-quote') {
    const { symbol, market, mode } = payload as { symbol: string; market: MarketTz; mode: Mode }
    const result = await fetchYahooQuote(symbol, market, mode)
    reply(id, true, { symbol, result })
    return
  }

  if (type === 'yahoo-quote-batch') {
    const entries = payload as Array<{ symbol: string; market: MarketTz; mode: Mode }>
    const results = new Map<string, YahooQuoteResult>()

    // 美股盘中(REGULAR)走腾讯批量取数（腾讯有正式时段数据，绕开 Yahoo 2m 大请求代理易失败）。
    // 盘前盘后/其他海外/close 仍走 Yahoo chart。腾讯取不到的不写入（靠循环重试+缓存临时展示）。
    if (classifyUSSessionByMs(Date.now()) === 'REGULAR') {
      // 美股 realtime 子集：symbol 即纯代码(AAPL)，腾讯报价码 usAAPL
      const usRtEntries = entries
        .filter(e => e.market === 'US' && e.mode === 'realtime')
        .map(e => ({ symbol: e.symbol, code: e.symbol }))
      if (usRtEntries.length > 0) {
        const tcEntries = usRtEntries.map(e => ({ code: e.code, market: 'US' as const }))
        const tcMap = await fetchTencentRealtimeBatch(tcEntries, 6000)
        for (const e of usRtEntries) {
          const q = tcMap.get(e.code)
          if (q && Number.isFinite(q.changeRate)) {
            results.set(e.symbol, {
              rate: q.changeRate,
              date: null,  // 实时不需 date（runMode 按当前交易日填）
              session: 'REGULAR',
              proxyFailed: false,
              source: '腾讯',
            })
          }
          // 腾讯取不到的（美股不在腾讯覆盖）：不写入，不回退 Yahoo，靠循环重试+缓存临时展示
        }
      }
    }

    // 剩余 entries（美股盘前盘后 + 其他海外 + close + 美股盘中腾讯未取到的）走 Yahoo chart
    const yahooEntries = entries.filter(e => !results.has(e.symbol))
    // 限并发(BATCH_CONCURRENCY)而非 Promise.all 全并发：
    // 全量海外股同时请求会瞬间压垮 allorigins 单一代理(限流→集体超时)，限流后逐批取成功率大幅提升。
    // 5→2：手机端弱网反馈取数艰难，代理限流抬头，回调并发优先保成功率而非速度。
    const BATCH_CONCURRENCY = 2
    let idx = 0
    const size = Math.min(BATCH_CONCURRENCY, yahooEntries.length)
    const workers = Array.from({ length: size }, async () => {
      while (idx < yahooEntries.length) {
        const i = idx++
        const entry = yahooEntries[i]
        try {
          results.set(entry.symbol, await fetchYahooQuote(entry.symbol, entry.market, entry.mode))
        } catch { /* 单只失败不影响其他 */ }
      }
    })
    await Promise.all(workers)
    reply(id, true, results)
    return
  }

  if (type === 'yahoo-search') {
    const { keyword, count, includeEtf } = payload as { keyword: string; count: number; includeEtf: boolean }
    const targetUrl = `${API_URLS.YAHOO_SEARCH}?q=${encodeURIComponent(keyword)}&quotesCount=${count}&newsCount=0`
    const { data, proxyFailed } = await fetchWithProxyRotation(targetUrl, 6000)
    if (proxyFailed || !data) {
      reply(id, true, { results: [], proxyFailed })
      return
    }
    const quotes = (data as { quotes?: YahooSearchQuote[] })?.quotes ?? []
    const results = quotes
      .filter((q) => q.symbol && (includeEtf
        ? (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
        : q.quoteType === 'EQUITY'))
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange || '',
        quoteType: q.quoteType || '',
      }))
    reply(id, true, { results, proxyFailed: false })
    return
  }

  reply(id, false, undefined, `yahoo-worker 未实现请求类型: ${type}`)
}

/** Yahoo search 单条结果（原始） */
interface YahooSearchQuote {
  symbol: string
  shortname?: string
  longname?: string
  exchange?: string
  quoteType?: string
}

/** 统一回复 */
function reply(id: number, ok: boolean, data?: unknown, err?: string): void {
  const resp: WorkerResponse = { id, ok, data, err }
  ;(self as any).postMessage(resp)
}

export {}
