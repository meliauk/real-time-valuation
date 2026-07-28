/**
 * Yahoo 综合线调度（Worker③）
 *
 * 主线程侧调度 yahoo-worker：海外市场（日韩台欧 + 美股盘前盘后）的昨日收盘 + 实时涨跌。
 *
 * 两 mode 分工：
 *   - close（昨日收盘）：只补"缓存缺失"的海外股（昨日值不变，全齐后不再拉）
 *   - realtime（今日实时）：全量刷新所有非 A/HK 股（含美股，价在变，每轮都拉）
 * 两 mode 各走专属并发槽（SLOT_CAP_PER_SOURCE 各1，防代理限流），各自 merge→recompute。
 *
 * symbol 解析：主线程做（guessYahooSymbol，含 localStorage 缓存），search 部分调 Worker③。
 * 代理熔断：任一请求命中 proxyFailed 即设全局冷却，期间转长心跳降频，不再密集重试。
 * 首屏占位：所有 T+2 基金 realtimeGszzl 置0（常驻显示，数据到位后由 recompute 覆盖），只做一次。
 *
 * 接力 loop：close 有缺失立刻下一轮；close 全齐且 realtime 完成转心跳。
 */

import { workerManager } from '@/shared/worker/worker-manager'
import { WORKER_NAMES, YAHOO_CONFIG, FUND_LOOP_CONFIG } from '@/config/constants'
import type { StockMarket, StockQuoteInfo, MarketTz } from '@/shared/types/common-types'
import { useFundStore, type StockEntry } from '@/modules/fund/fund-store'
import type { YahooQuoteResult } from '@/modules/fund/workers/yahoo-worker'
import { guessYahooSymbol, detectMarketFromSymbol, type SearchYahooSymbol, type YahooSearchResult } from './yahoo-symbol'
import { normalizeStockCodeTencent } from '@/shared/net/tencent-codec'
import { stockMarketToTz } from '@/shared/market/market-classify'
import { resolveMarketTradingDays } from '@/shared/market/trading-day'
import { runConcurrent } from '@/shared/net/rate-limiter'

let registered = false
let loopRunning = false
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null
let placeholderSet = false

function ensureRegistered(): void {
  if (registered) return
  registered = true
  workerManager.registerWorker(WORKER_NAMES.FUND_YAHOO, () =>
    new Worker(new URL('../workers/yahoo-worker.ts', import.meta.url), { type: 'module' }),
  )
}

/** 启动 Yahoo 线 loop（幂等） */
export function startYahooLoop(): void {
  if (loopRunning) return
  ensureRegistered()
  loopRunning = true
  void runRelayLoop()
}

/** 停止 Yahoo 线 loop */
export function stopYahooLoop(): void {
  loopRunning = false
  if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null }
}

/** search 回调：调 Worker③ 'yahoo-search'（注入给 guessYahooSymbol） */
const searchViaWorker: SearchYahooSymbol = async (keyword, count, includeEtf) => {
  try {
    const r = await workerManager.request<
      { keyword: string; count: number; includeEtf: boolean },
      { results: YahooSearchResult[]; proxyFailed: boolean }
    >(WORKER_NAMES.FUND_YAHOO, 'yahoo-search', { keyword, count, includeEtf }, FUND_LOOP_CONFIG.WORKER_TIMEOUT)
    return r.results
  } catch {
    return []
  }
}

/** 未取齐时失败后的重试间隔（毫秒）——不限次数持续重试直到拿到数据。
 *  免费代理偶发宕机几分钟，停摆/长间隔会错过恢复时机；3s 短间隔恢复后几秒内即可取到数据。 */
const RETRY_INTERVAL = 3 * 1000

async function runRelayLoop(): Promise<void> {
  while (loopRunning) {
    const hadMissing = await tickOnce()
    if (!loopRunning) break
    if (hadMissing) {
      // 有未取到的股（含代理全挂）：3s 后立即重试，不限次数直到拿到数据
      await new Promise<void>((resolve) => {
        heartbeatTimer = setTimeout(() => { heartbeatTimer = null; resolve() }, RETRY_INTERVAL)
      })
      continue
    }
    // 全齐：挂起心跳定期复查（实时价在变 + 应对新基金/跨日清缓存）
    await new Promise<void>((resolve) => {
      heartbeatTimer = setTimeout(() => { heartbeatTimer = null; resolve() }, FUND_LOOP_CONFIG.HEARTBEAT_INTERVAL)
    })
  }
}

/** 一轮：首屏占位 → close 补缺失 + realtime 全量 → merge → recompute */
async function tickOnce(): Promise<boolean> {
  const store = useFundStore()

  // 首屏占位（幂等）：T+2 基金 realtimeGszzl 置0
  if (!placeholderSet) {
    placeholderSet = true
    let changed = false
    for (const code of store.fundCodes) {
      const v = store.getValuation(code)
      if (!v || v.delayDays !== 2) continue
      if (v.realtimeGszzl == null) {
        v.realtimeGszzl = 0
        v.realtimeSource = '实时推算'
        changed = true
      }
    }
    if (changed) store.valuationMap = new Map(store.valuationMap)
  }

  const { overseas: overseasMissing } = store.collectMissingStocks() // close 缺失
  const overseasAll = store.collectOverseasAll()                       // realtime 全量
  if (overseasAll.length === 0) return false

  const closeMissing = overseasMissing.length > 0
  let hadMissing = false

  // Phase 1：解析所有海外股的 symbol（close+realtime 合集去重）
  const allEntries = closeMissing
    ? dedupeEntries([...overseasMissing, ...overseasAll])
    : overseasAll
  const symbolMap = await resolveSymbols(allEntries)

  // Phase 2：close 补缺失 + realtime 全量，各走专属槽
  try {
    const tasks: Promise<{ mode: 'close' | 'realtime'; fetched: Map<string, StockQuoteInfo> }>[] = []

    if (closeMissing) {
      const closeEntries = overseasMissing
        .map(e => ({ e, sym: symbolMap.get(normalizeStockCodeTencent(e.stockCode).code) }))
        .filter(x => x.sym) as Array<{ e: StockEntry; sym: { symbol: string; market: StockMarket } }>
      tasks.push(runMode(closeEntries, 'close').then(fetched => ({ mode: 'close' as const, fetched })))
    }

    const rtEntries = overseasAll
      .map(e => ({ e, sym: symbolMap.get(normalizeStockCodeTencent(e.stockCode).code) }))
      .filter(x => x.sym) as Array<{ e: StockEntry; sym: { symbol: string; market: StockMarket } }>
    tasks.push(runMode(rtEntries, 'realtime').then(fetched => ({ mode: 'realtime' as const, fetched })))

    const results = await Promise.all(tasks)
    for (const { mode, fetched } of results) {
      if (fetched.size > 0) {
        if (mode === 'close') await store.mergeStockQuotesToCache(fetched, overseasMissing)
        else await store.mergeRealtimeToCache(fetched, overseasAll)
      }
      // close/realtime 任一有未取到的股 → hadMissing=true，loop 走 3s 短重试而非 60s 心跳。
      // ⚠️ 原仅判 close：realtime 即便 40/98 失败也判 hadMissing=false → 走 60s 心跳 → 失败股迟迟不重试。
      if (mode === 'close' && fetched.size < overseasMissing.length) hadMissing = true
      if (mode === 'realtime' && fetched.size < rtEntries.length) hadMissing = true
    }
  } catch {
    hadMissing = true
  }

  return hadMissing
}

/** 解析一批股票的 Yahoo symbol + market（并发） */
async function resolveSymbols(entries: StockEntry[]): Promise<Map<string, { symbol: string; market: StockMarket }>> {
  const result = new Map<string, { symbol: string; market: StockMarket }>()
  const unresolved: string[] = []
  await runConcurrent(entries, YAHOO_CONFIG.SYMBOL_CONCURRENCY, async (e) => {
    const { code } = normalizeStockCodeTencent(e.stockCode)
    const symbol = await guessYahooSymbol(code, e.emMarketCode, e.stockName, searchViaWorker)
    // market 统一从映射出的 symbol 后缀推断（含台湾.TW/日本.T等，比 detectMarketByEmCode 更全，
    // 因 EM_MARKET_MAP 只精确 A/港/美，台湾118等不在表里）
    const market: StockMarket = detectMarketFromSymbol(symbol || '')
    if (symbol) result.set(code, { symbol, market })
    else unresolved.push(`${code}(emCode=${e.emMarketCode ?? '无'})`)
  })
  if (unresolved.length) {
    // eslint-disable-next-line no-console
    console.warn(`[yahoo] symbol未解析 ${unresolved.length} 只: ${unresolved.join(', ')}`)
  }
  return result
}

/** 单 mode 取数：拼 entries → Worker③ 'yahoo-quote-batch' → 组装 StockQuoteInfo Map */
async function runMode(
  entries: Array<{ e: StockEntry; sym: { symbol: string; market: StockMarket } }>,
  mode: 'close' | 'realtime',
): Promise<Map<string, StockQuoteInfo>> {
  const result = new Map<string, StockQuoteInfo>()
  if (entries.length === 0) return result

  // realtime 模式：休市市场（周末/节假日）当日无交易，直接写 closed（覆盖 stale），不发 worker③ 取数。
  // 美股(US)例外：有盘前盘后，周末/盘后时段仍取 Yahoo（POST 定格值对用户有价值，参与加权），
  //   由 Yahoo 实际返回决定有无数据，不强制 closed。
  // close 模式不动（收盘列锚美股基准日，口径不变）。
  let fetchEntries = entries
  if (mode === 'realtime') {
    fetchEntries = []
    for (const x of entries) {
      if (x.sym.market === 'US') { fetchEntries.push(x); continue }  // 美股始终取
      const tz = stockMarketToTz(x.sym.market)
      if (resolveMarketTradingDays(tz).isNonTradingDay) {
        const { code } = normalizeStockCodeTencent(x.e.stockCode)
        result.set(code, {
          changeRate: null, date: null, market: x.sym.market,
          source: null, closed: true, updatedAt: Date.now(),
        })
      } else {
        fetchEntries.push(x)
      }
    }
    if (fetchEntries.length === 0) return result
  }

  // 并发槽控制（防代理限流）：close/realtime 各 SLOT_CAP_PER_SOURCE
  await acquireSlot(mode)
  try {
    const batch = fetchEntries.map(x => ({
      symbol: x.sym.symbol,
      market: stockMarketToTz(x.sym.market) as MarketTz,
      mode,
    }))
    const fetched = await workerManager.request<typeof batch, Map<string, YahooQuoteResult>>(
      WORKER_NAMES.FUND_YAHOO, 'yahoo-quote-batch', batch, FUND_LOOP_CONFIG.WORKER_TIMEOUT,
    )
    let nullCnt = 0
    for (const x of fetchEntries) {
      const { code } = normalizeStockCodeTencent(x.e.stockCode)
      const r = fetched.get(x.sym.symbol)
      if (r && r.rate != null) {
        // date：腾讯实时分支未填(算不出交易日)，realtime 时补当前交易日；close 用 Yahoo 返回的基准日
        const date = r.date ?? (mode === 'realtime' ? resolveMarketTradingDays(stockMarketToTz(x.sym.market)).currentTradingDay : null)
        result.set(code, {
          changeRate: r.rate,
          date,
          market: x.sym.market,
          source: r.source ?? 'Yahoo',  // 腾讯(美股盘中) / Yahoo(盘前盘后+其他海外)
          session: r.session,
          updatedAt: mode === 'realtime' ? Date.now() : undefined,
        })
      } else {
        nullCnt++
      }
      // 取数失败(rate==null)的股：解析阶段已用 Search 拿 symbol，此处不再二次回退
      // （同一 symbol 重取必失败）。直接 null，交 loop 下轮接力重新 Search+取数。
    }
    if (nullCnt) {
      // eslint-disable-next-line no-console
      console.warn(`[yahoo] ${mode}取数失败 ${nullCnt}/${entries.length}（多为代理波动，loop 会接力重试）`)
    }
  } finally {
    releaseSlot(mode)
  }
  return result
}

// ===== 并发槽（close/realtime 各 SLOT_CAP_PER_SOURCE，防代理限流）=====
const closeInFlight = { count: 0 }
const realtimeInFlight = { count: 0 }
const closeQueue: Array<() => void> = []
const realtimeQueue: Array<() => void> = []

function slotState(mode: 'close' | 'realtime') {
  return mode === 'realtime'
    ? { inFlight: realtimeInFlight, queue: realtimeQueue }
    : { inFlight: closeInFlight, queue: closeQueue }
}
function acquireSlot(mode: 'close' | 'realtime'): Promise<void> {
  const { inFlight, queue } = slotState(mode)
  if (inFlight.count < YAHOO_CONFIG.SLOT_CAP_PER_SOURCE) {
    inFlight.count++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    queue.push(() => { inFlight.count++; resolve() })
  })
}
function releaseSlot(mode: 'close' | 'realtime'): void {
  const { inFlight, queue } = slotState(mode)
  inFlight.count--
  const next = queue.shift()
  if (next) next()
}

/** 去重 entries（按归一化 code） */
function dedupeEntries(entries: StockEntry[]): StockEntry[] {
  const map = new Map<string, StockEntry>()
  for (const e of entries) {
    const { code } = normalizeStockCodeTencent(e.stockCode)
    if (!map.has(code)) map.set(code, e)
  }
  return Array.from(map.values())
}
