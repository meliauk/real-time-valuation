/**
 * 实时线调度（Worker②）
 *
 * 主线程侧调度 em-realtime-worker：A/HK 持仓股全量刷新实时涨跌 → Worker② 取腾讯报价 →
 * merge 进 stockRealtimeCache → recompute。实时价在变，每轮全量重拉（不像 close 全齐即停）。
 *
 * 收盘后降频：A/HK 已收盘时实时值不再变化，转心跳复查（不密集重打）。
 *
 * 东财 JSONP 兜底：Worker 取不到的股，主线程用东财 push2 批量行情 JSONP 补一次。
 * 美股不进（美股 realtime 走 Yahoo 盘前盘后时段，由 yahoo-service 负责）。
 *
 * 接力 loop：实时刷新持续转心跳（实时需持续）；本服务由 store 统一编排启停。
 */

import { workerManager } from '@/shared/worker/worker-manager'
import { WORKER_NAMES, API_URLS, FUND_LOOP_CONFIG } from '@/config/constants'
import type { StockMarket, StockQuoteInfo } from '@/shared/types/common-types'
import { useFundStore, type StockEntry } from '@/modules/fund/fund-store'
import { classifyShare, stockMarketToTz } from '@/shared/market/market-classify'
import { secidFor } from '@/shared/market/secid'
import { normalizeStockCodeTencent } from '@/shared/net/tencent-codec'
import { resolveMarketTradingDays } from '@/shared/market/trading-day'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'
import { runBatched } from '@/shared/net/rate-limiter'
import { buildRealtimeQuote } from '@/modules/fund/calc/realtime-em-calc'

let registered = false
let loopRunning = false
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null
/** 收盘后是否已取过今日涨跌快照（定格值）。
 *  收盘后今日涨跌不再变化，只需取一次定格；之后低频复查。重启/跨日重置为 false。 */
let closedSnapshotTaken = false
/** 上次快照的交易日，跨日重置 closedSnapshotTaken（节后首个交易日需重新取收盘快照） */
let lastSnapshotDay = ''
/** T+1 预测胶囊首屏占位是否已置（幂等）。T+1 基金持仓 A/HK 股由本服务取数，
 *  占位放此而非 yahoo（yahoo 主碰海外股）。重启/跨日重置为 false。 */
let placeholderSet = false

function ensureRegistered(): void {
  if (registered) return
  registered = true
  workerManager.registerWorker(WORKER_NAMES.FUND_EM_REALTIME, () =>
    new Worker(new URL('../workers/em-realtime-worker.ts', import.meta.url), { type: 'module' }),
  )
}

/** 启动实时线 loop（幂等） */
export function startEmRealtimeLoop(): void {
  if (loopRunning) return
  ensureRegistered()
  loopRunning = true
  closedSnapshotTaken = false  // 启动重置：可能跨日/重启，重新取收盘快照
  lastSnapshotDay = ''
  placeholderSet = false       // 启动重置：T+1 预测占位重跑（跨日/重建后需重新占位）
  void runRelayLoop()
}

/** 停止实时线 loop */
export function stopEmRealtimeLoop(): void {
  loopRunning = false
  if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null }
}

async function runRelayLoop(): Promise<void> {
  while (loopRunning) {
    const aTd = resolveMarketTradingDays('A')
    const hkTd = resolveMarketTradingDays('HK')
    const aNonTrading = aTd.isNonTradingDay
    const hkNonTrading = hkTd.isNonTradingDay

    // 跨日重置：新交易日（currentTradingDay 变化）允许重新取收盘快照
    const todayKey = aTd.currentTradingDay
    if (lastSnapshotDay && lastSnapshotDay !== todayKey) {
      closedSnapshotTaken = false
    }
    lastSnapshotDay = todayKey

    // A/HK 都休市（周末/节假日）：tickOnce 写 closed 覆盖 stale（worker 不 fetch），不取周五当实时
    if (aNonTrading && hkNonTrading) {
      if (!closedSnapshotTaken) {
        await tickOnce()
        closedSnapshotTaken = true  // 休市无数据可取，标记不再重试
      }
      await new Promise<void>((resolve) => {
        heartbeatTimer = setTimeout(() => { heartbeatTimer = null; resolve() }, FUND_LOOP_CONFIG.HEARTBEAT_INTERVAL)
      })
      continue
    }

    // A/HK 都已收盘（交易日收盘后）：取一次定格快照，之后低频复查
    const aDone = aNonTrading || aTd.isClosed
    const hkDone = hkNonTrading || hkTd.isClosed
    if (aDone && hkDone) {
      if (!closedSnapshotTaken) {
        const got = await tickOnce()
        if (got > 0) closedSnapshotTaken = true
      }
      await new Promise<void>((resolve) => {
        heartbeatTimer = setTimeout(() => { heartbeatTimer = null; resolve() }, FUND_LOOP_CONFIG.HEARTBEAT_INTERVAL)
      })
      continue
    }

    // 至少一个盘中：实时价在变，短间隔刷新
    await tickOnce()
    await new Promise<void>((resolve) => { heartbeatTimer = setTimeout(() => { heartbeatTimer = null; resolve() }, 3000) })
  }
}

/** 一轮：收集 A/HK 全量 → Worker② 取数 → merge → 兜底。休市市场直接写 closed 不取数。 */
async function tickOnce(): Promise<number> {
  const store = useFundStore()

  // 首屏占位（幂等）：T+1（当日确认）基金 realtimeGszzl 置 0（标签「预测」），让胶囊先显示，
  // 持仓股票实时数据到位后由 recomputeFundsForStocks 覆盖为真实加权值。
  // 占位不设 realtimeUpdatedAt——下游据此（!realtimeUpdatedAt）判占位态加 loading 样式。
  // 放在 collectAHkAll 的 early return 之前，确保即使用户只有 T+1 基金、持仓暂未就绪时占位也执行。
  if (!placeholderSet) {
    placeholderSet = true
    let changed = false
    for (const code of store.fundCodes) {
      const v = store.getValuation(code)
      if (!v || v.delayDays !== 1) continue
      if (v.realtimeGszzl == null) {
        v.realtimeGszzl = 0
        v.realtimeSource = '预测'
        changed = true
      }
    }
    if (changed) store.valuationMap = new Map(store.valuationMap)
  }

  // realtime 全量刷新：直接从持仓收集 A/HK 全量（不跳过已缓存——实时价在变/收盘取定格值需重拉）。
  // collectMissingStocks 会跳过已缓存的股（仅用于收盘补缺失），不适合实时全量刷新。
  const rtEntries = store.collectAHkAll()
  if (rtEntries.length === 0) return 0  // 持仓未就绪，不视作已取快照，下轮重试

  // 休市过滤：休市市场当日无交易，直接写 closed（覆盖 stale），不发 worker 取数
  const closedMap = new Map<string, StockQuoteInfo>()
  const openEntries: Array<{ code: string; market: StockMarket }> = []
  const openRtEntries: StockEntry[] = []
  for (const e of rtEntries) {
    const { code } = normalizeStockCodeTencent(e.stockCode)
    const market = classifyShare(e.emMarketCode, code) as StockMarket
    const tz = stockMarketToTz(market)
    if (resolveMarketTradingDays(tz).isNonTradingDay) {
      closedMap.set(code, buildRealtimeQuote(code, market, null, '休盘'))
    } else {
      openEntries.push({ code, market })
      openRtEntries.push(e)
    }
  }
  // 休市的先 merge（覆盖 stale 周五数据）
  if (closedMap.size > 0) await store.mergeRealtimeToCache(closedMap, rtEntries)

  if (openEntries.length === 0) return closedMap.size  // 全休市，不取数

  try {
    const result = await workerManager.request<
      Array<{ code: string; market: StockMarket }>,
      Map<string, StockQuoteInfo>
    >(WORKER_NAMES.FUND_EM_REALTIME, 'realtime-batch', openEntries, FUND_LOOP_CONFIG.WORKER_TIMEOUT)

    const rtMap = new Map<string, StockQuoteInfo>(result)
    // Worker 取不到的 → 东财 push2 兜底
    const fallbackEntries: StockEntry[] = []
    for (let i = 0; i < openEntries.length; i++) {
      if (!rtMap.has(openEntries[i].code)) {
        fallbackEntries.push(openRtEntries[i])
      }
    }

    if (rtMap.size > 0) {
      await store.mergeRealtimeToCache(rtMap, openRtEntries)
    }

    if (fallbackEntries.length > 0) {
      await runBatched(fallbackEntries, FUND_LOOP_CONFIG.REALTIME_BATCH, 0, async (e) => {
        const info = await fetchEmRealtimeFallback(e)
        if (info) {
          const batchMap = new Map<string, StockQuoteInfo>()
          const { code } = normalizeStockCodeTencent(e.stockCode)
          batchMap.set(code, info)
          await store.mergeRealtimeToCache(batchMap, [e])
        }
      })
    }
    return rtMap.size + closedMap.size  // 取到的实时数据条数（>0 视作已取快照）
  } catch {
    // 本轮失败，下轮再试
    return closedMap.size
  }
}

/** 东财 push2 批量行情 JSONP 兜底（Worker 取不到时） */
async function fetchEmRealtimeFallback(entry: StockEntry): Promise<StockQuoteInfo | null> {
  const { code } = normalizeStockCodeTencent(entry.stockCode)
  const market = classifyShare(entry.emMarketCode, code)
  const secid = secidFor(code, entry.emMarketCode)
  if (!secid) return null

  const cbName = genCallbackName('rt')
  const url = `${API_URLS.STOCK_QUOTES}?secids=${secid}&fields=f3&cb=${cbName}`

  try {
    const data = await jsonpRequest<any>(url, cbName, FUND_LOOP_CONFIG.EM_FALLBACK_TIMEOUT)
    const rate = data?.data?.diff?.[0]?.f3
    if (!Number.isFinite(rate)) return null
    return buildRealtimeQuote(code, market, rate, '东财')
  } catch {
    return null
  }
}
