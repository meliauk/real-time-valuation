/**
 * 收盘线调度（Worker①）
 *
 * 主线程侧调度 em-close-worker：收集 A/HK/US 缺失股 → 发 Worker 取腾讯日K → 收结果 →
 * merge 进 stockPrevDayCache → recompute。每轮 A→HK→US 全组依次处理（非"只补第一组"），
 * 某组里的死股靠 loop 无限重试兜底，不阻塞后序组推进。A 股已收盘时降频（转心跳复查）。
 *
 * 昨日收盘 A股/港股/美股 主源用腾讯 fqkline（Worker①）；Worker 取不到时（返回 null，非休盘），
 * 主线程用东财 push2his 日K JSONP 兜底（节流分批，避免密集请求挤搜索/实时线）。
 * 东财也取不到时不写缓存（不判 failed），下轮由 collectMissing 重新收集重试。
 *
 * 接力 loop：有缺失一轮完立刻下一轮；全齐转心跳。跨日清理时由 store 重建。
 */

import { workerManager } from '@/shared/worker/worker-manager'
import { WORKER_NAMES, FUND_LOOP_CONFIG } from '@/config/constants'
import type { StockMarket, StockQuoteInfo } from '@/shared/types/common-types'
import { useFundStore, type StockEntry } from '@/modules/fund/fund-store'
import type { PrevDayResult } from '@/modules/fund/calc/prev-day-calc'
import { calcPrevDayFromKlines } from '@/modules/fund/calc/prev-day-calc'
import { classifyShare } from '@/shared/market/market-classify'
import { normalizeStockCodeTencent } from '@/shared/net/tencent-codec'
import { runBatched } from '@/shared/net/rate-limiter'
import { fetchEmKline } from './em-kline-fetch'

let registered = false
let loopRunning = false
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

/** 注册 Worker①（懒，首次启动 loop 时调） */
function ensureRegistered(): void {
  if (registered) return
  registered = true
  workerManager.registerWorker(WORKER_NAMES.FUND_EM_CLOSE, () =>
    new Worker(new URL('../workers/em-close-worker.ts', import.meta.url), { type: 'module' }),
  )
}

/** 启动收盘线接力 loop（幂等，已运行则跳过） */
export function startEmCloseLoop(): void {
  if (loopRunning) return
  ensureRegistered()
  loopRunning = true
  void runRelayLoop()
}

/** 停止收盘线 loop（跨日清理/app 卸载用） */
export function stopEmCloseLoop(): void {
  loopRunning = false
  if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null }
}

/** 接力循环：有缺失立刻下一轮，全齐转心跳 */
async function runRelayLoop(): Promise<void> {
  while (loopRunning) {
    const hadMissing = await tickOnce()
    if (!loopRunning) break
    if (hadMissing) {
      // 有缺失，立刻下一轮
      continue
    }
    // 全齐，挂心跳复查
    await new Promise<void>((resolve) => {
      heartbeatTimer = setTimeout(() => { heartbeatTimer = null; resolve() }, FUND_LOOP_CONFIG.HEARTBEAT_INTERVAL)
    })
  }
}

/** 一轮：收集缺失 → 对每个非空组依次取数 → merge。
 *  ⚠️ 不再用"A→HK→US 只取第一组"的优先级补齐——那会让某组里的死股（腾讯+东财都取不到）
 *  每轮重试卡死该组，后序组永远轮不到。改为一轮内 A→HK→US 全组依次处理，死股靠 loop
 *  无限重试兜底，不阻塞其他组推进。取不到的股不写缓存（不判 failed），下轮继续重试。 */
async function tickOnce(): Promise<boolean> {
  const store = useFundStore()
  const { aStock, hkStock, usStock } = store.collectMissingStocks()
  if (aStock.length === 0 && hkStock.length === 0 && usStock.length === 0) {
    return false // 全齐
  }

  // A→HK→US 依次处理（每轮全组都过一遍，死股重试不阻塞后序组）
  if (aStock.length > 0) await processGroup(aStock)
  if (hkStock.length > 0) await processGroup(hkStock)
  if (usStock.length > 0) await processGroup(usStock)

  // 返回是否仍有缺失（下一轮 collectMissing 重新判定）
  return true
}

/** 单组批量取数：腾讯 Worker① 批量 → 取不到的走东财兜底（节流分批）。
 *  取不到的股不写缓存（不判 failed），下轮由 collectMissing 重新收集重试。 */
async function processGroup(target: StockEntry[]): Promise<void> {
  const store = useFundStore()

  // 发 Worker① 批量取数（service 层分批，避免一次几百只发 Worker 超时）
  const entries = target.map(e => {
    const { code } = normalizeStockCodeTencent(e.stockCode)
    const market = classifyShare(e.emMarketCode, code)
    return { code, market: market as StockMarket }
  })

  const SERVICE_BATCH = FUND_LOOP_CONFIG.KLINE_SERVICE_BATCH

  try {
    for (let i = 0; i < entries.length; i += SERVICE_BATCH) {
      const batchEntries = entries.slice(i, i + SERVICE_BATCH)
      const batchTarget = target.slice(i, i + SERVICE_BATCH)
      const result = await workerManager.request<
        Array<{ code: string; market: StockMarket }>,
        Map<string, PrevDayResult>
      >(WORKER_NAMES.FUND_EM_CLOSE, 'prev-day-batch', batchEntries, FUND_LOOP_CONFIG.WORKER_TIMEOUT)

      // 组装 StockQuoteInfo：腾讯取到/休盘正常写入；腾讯取不到(null非休盘)走东财兜底。
      const prevDayMap = new Map<string, StockQuoteInfo>()
      const tencentFailed: StockEntry[] = []  // 腾讯取不到 → 东财兜底
      for (let j = 0; j < batchEntries.length; j++) {
        const entry = batchEntries[j]
        const r = result.get(entry.code)
        if (r && 'closed' in r) {
          prevDayMap.set(entry.code, {
            changeRate: null, date: null, market: entry.market, source: '休盘', closed: true,
          })
        } else if (r && 'changeRate' in r) {
          prevDayMap.set(entry.code, {
            changeRate: r.changeRate, date: r.date, market: entry.market, source: '腾讯',
          })
        } else {
          // 腾讯取不到(null非休盘) → 收集交东财兜底（对齐 entry.code）
          tencentFailed.push(batchTarget[j])
        }
      }

      // merge Worker 结果（有值即触发 recompute）
      if (prevDayMap.size > 0) {
        await store.mergeStockQuotesToCache(prevDayMap, batchTarget)
      }

      // 腾讯取不到的股：主线程东财 push2his 日K JSONP 兜底（节流分批，避免密集请求挤搜索/实时线）
      if (tencentFailed.length > 0) {
        await runBatched(tencentFailed, FUND_LOOP_CONFIG.KLINE_BATCH, FUND_LOOP_CONFIG.KLINE_BATCH_GAP, async (e) => {
          const emInfo = await fetchEmCloseFallback(e)
          if (!emInfo) return  // 东财也取不到 → 不写缓存，下轮重试（不判 failed）
          const batchMap = new Map<string, StockQuoteInfo>()
          const { code } = normalizeStockCodeTencent(e.stockCode)
          batchMap.set(code, emInfo)
          await store.mergeStockQuotesToCache(batchMap, [e])
        })
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[em-close] processGroup 异常', e)
  }
}

/** 东财 push2his 日K JSONP 兜底（腾讯 Worker 取不到时）：取日K → calcPrevDayFromKlines。
 *  东财取到正常涨跌/休盘写东财源；东财也取不到返回 null（不写缓存、不判 failed，下轮重试）。 */
async function fetchEmCloseFallback(entry: StockEntry): Promise<StockQuoteInfo | null> {
  const { code } = normalizeStockCodeTencent(entry.stockCode)
  const market = classifyShare(entry.emMarketCode, code)

  const klines = await fetchEmKline(code, entry.emMarketCode)
  if (klines && klines.length >= 2) {
    const r = calcPrevDayFromKlines(klines, market)
    if (r && 'closed' in r) {
      return { changeRate: null, date: null, market, source: '休盘', closed: true }
    }
    if (r && 'changeRate' in r) {
      return { changeRate: r.changeRate, date: r.date, market, source: '东财' }
    }
  }
  // 腾讯+东财均取不到 → 返回 null，不写缓存，下轮由 collectMissing 重新收集重试
  return null
}
