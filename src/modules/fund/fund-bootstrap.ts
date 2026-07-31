/**
 * 基金板块启动编排
 *
 * 串起启动流程：恢复缓存 → 预热目录 → 估值刷新 → 启动 3 个 service loop。
 *
 * 启动顺序依据数据依赖：
 *   1. 恢复基金代码列表 + 双全局缓存（跨日校验，非今日丢弃）；
 *   2. 预热基金目录（避免估值合并时 getFundType 重复下载目录）；
 *   3. 估值刷新：batchGetValuation（fundgz+lsjz+类型 三路并发），得各基金 delayDays；
 *   4. 启动 3 个 service loop（收盘/实时/Yahoo）——各 loop 的 collectMissing 据 delayDays
 *      触发持仓取数（T+2→getEstimatedHoldings、T+1→getT1Holdings），持仓就绪后取数 merge→recompute。
 *
 * 跨日：use-cross-day watcher 检测跨日，调 store.clearCrossDayCaches + 重建 Worker。
 */

import { useFundStore } from '@/modules/fund/fund-store'
import { useCacheStore } from '@/modules/fund/cache-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { getCatalogFundName } from '@/modules/fund/catalog/fund-code-catalog'
import { fetchFundCodeCatalog } from '@/modules/fund/catalog/fund-code-catalog'
import { startEmCloseLoop, stopEmCloseLoop } from '@/modules/fund/services/em-close-service'
import { startEmRealtimeLoop, stopEmRealtimeLoop } from '@/modules/fund/services/em-realtime-service'
import { startYahooLoop, stopYahooLoop } from '@/modules/fund/services/yahoo-service'
import { loadHolidays, reloadHolidays } from '@/modules/fund/services/holiday-service'
import { workerManager } from '@/shared/worker/worker-manager'
import { getBaseDay } from '@/modules/fund/valuation/cn-trading-day'

let started = false

/** 启动基金板块（幂等，app 挂载时调一次） */
export async function startFundModule(): Promise<void> {
  if (started) return
  started = true

  const store = useFundStore()

  // 1. 恢复持久化状态（基金列表 + 名称映射 + 持仓 + 双全局缓存 + 估值缓存预热）
  store.restoreFundCodes()
  store.restoreFundNames()
  store.restoreColumnConfig()

  // 持仓恢复：用户录入的持仓/操作日志/T+1待确认操作，刷新后必须读回，否则累计收益断链。
  const holdingStore = useHoldingStore()
  holdingStore.restoreHoldings()
  holdingStore.restoreActions()
  holdingStore.restorePendingActions()

  // 双全局缓存（跨日校验，非今日丢弃）
  store.restoreStockCaches()
  // 推算持仓缓存（今日戳校验，跨日丢弃）——recompute 依赖它算 gszzl/realtimeGszzl，无持仓则算不出。
  // 必须在 seedFromCache 之前恢复，seedFromCache 后的 recompute 才有持仓底数。
  store.restoreEstimatedHoldingsCache()
  // T+2 推算估值涨跌幅缓存（美股基准日校验，跨日丢弃）——必须在 seedFromCache 之前恢复，
  // seedFromCache 据此回填 T+2 未确认基金的 gszzl，避免重启首屏长时间 --（要等 loop 重算）
  store.restoreEstimatedGszzlMap()
  // 盘中分时点恢复（当日有效，跨日丢弃重生成）——首屏缩略图立即有数据，不等估值刷新生成
  store.restoreIntradayMap()

  // 估值缓存预热：把上次估值读回 valuationMap，首屏不空白，再异步刷新更新值。
  // （仅今日缓存；T+2 未确认用缓存的推算 gszzl 覆盖，见 seedFromCache）
  const cacheStore = useCacheStore()
  cacheStore.restoreCache()
  cacheStore.clearExpiredCache()
  store.seedFromCache(cacheStore.cacheMap)

  // 缓存恢复后立即触发一次 recompute：用已恢复的 stockPrevDayCache/stockRealtimeCache + 持仓缓存，
  // 把缓存的股票涨跌加权喂进 valuationMap 的 gszzl/realtimeGszzl——重启首屏即有值，不等 loop 重算。
  // （seedFromCache 已恢复的 valuation 若带了上次的 realtimeGszzl，此处会按最新缓存重新加权覆盖）
  store.recomputeAllFromCache()

  if (store.fundCodes.length === 0) return

  // 2. 预热目录（不阻塞首屏）：void 异步加载，getFundType 内部 await fetchFundCodeCatalog 会共享
  //    同一个 catalogPromise（去重），目录就绪后自动命中缓存。首屏已由 seedFromCache 显示缓存数据，
  //    不必等目录下载完才继续——目录未就绪时 getFundType 回退搜索接口兜底。
  void fetchFundCodeCatalog().catch(() => { /* 不阻塞 */ })

  // 2.5 从目录补充关注基金名称（fundgz 失败的基金也能显示真名）
  // 目录异步加载中，getCatalogFundName 暂返回空（cachedCatalog 未就绪），目录到位后下次刷新补全。
  for (const code of store.fundCodes) {
    if (!store.getFundName(code)) {
      const name = getCatalogFundName(code)
      if (name) store.setFundName(code, name)
    }
  }

  // 3. 估值刷新——走 refreshAllValuations（含 batchGetValuation + T+2 防闪烁合并 + 保留 realtime
  //    + 存盘 + 持仓累计同步 + refreshStatus 管理，与定时刷新同链路）。首屏已由 seedFromCache 显示
  //    缓存数据，此处后台刷新覆盖。
  //    ⚠️ 不能直接 store.valuationMap = batchGetValuation(...)：那样会整体覆盖，抹掉 seedFromCache/
  //    recomputeAllFromCache 恢复的 T+2 推算 gszzl + realtime 胶囊（无防闪烁），首屏会闪 -- 再等 loop 恢复。
  // 异步取各市场节假日（Nager.Date，注入 trading-day 供休市判定）。不阻塞首屏——
  // 取到前 service loop 用周末兜底，注入后下轮修正。失败静默退化周末。
  void loadHolidays().catch(() => { /* 静默 */ })
  try {
    await store.refreshAllValuations()
    const holdingStore = useHoldingStore()
    // 全量重算自愈：增量推进只在前台跑，错过的交易日无法补齐。
    // 此处用历史净值从 holdingDate 起全量累乘，一次性把 yesterdayAmount/lastConfirmedDate
    // 校准到最新已确认净值——用户上次关 app 期间错过的收益此处补齐。
    void holdingStore.recalibrateHoldingsFromNav().catch(() => { /* 静默，不影响首屏 */ })
    // 启动即生成分时点：估值就绪后批量生成，确保首屏缩略图有数据（恢复不到/为空时兜底）
    for (const [code, valuation] of store.valuationMap) {
      store.updateIntradayPoints(code, valuation)
    }
    // 异步拉取 T+1 完整日走势（新浪，卡片缩略图）：估值就绪后判断 T+2 跳过。
    // 不阻塞后续（持仓预取/loop），后台到位后覆盖 fundgz 单点为完整走势。
    void store.fetchIntradayHistory().catch(() => { /* 静默 */ })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[fund-bootstrap] 估值刷新异常', e)
  }

  // 4. 预取持仓（写入 estimatedHoldingsCache/t1HoldingsCache）。
  //    必须在启动 service loop 之前完成——否则 loop 第一轮 collectMissingStocks 收集到 0 股
  //    （持仓缓存未就绪）→ 判定全齐 → 转 60s 心跳 → 持仓涨跌要等一分钟才取（首屏长时间空白）。
  //    预取完再启 loop，第一轮即收集到持仓股立即取数。fetchStockQuotes 传 noop：持仓立即展示，涨跌由 loop 取数后 recompute。
  // T+2 基金：取推算持仓（estimatedHoldingsCache），盘中 gszzl + 实时胶囊均基于此
  const t2Funds = store.fundCodes.filter(code => store.getValuation(code)?.delayDays === 2)
  await Promise.all(t2Funds.map(async (code) => {
    try { await store.getEstimatedHoldings(code, async () => new Map()) } catch { /* 单只失败不影响 */ }
  }))
  // T+1 基金：同时预取推算持仓（estimatedHoldingsCache，喂实时胶囊，与 T+2 同口径）
  //   和全量持仓（t1HoldingsCache，喂持仓透视表展示，全量明细）。
  //   胶囊取数 collect*/recompute 读 estimatedHoldingsCache；透视表 use-estimated-holdings 读 t1HoldingsCache。
  const t1Funds = store.fundCodes.filter(code => store.getValuation(code)?.delayDays === 1)
  await Promise.all(t1Funds.map(async (code) => {
    try { await store.getEstimatedHoldings(code, async () => new Map()) } catch { /* 单只失败不影响 */ }
    try { await store.getT1Holdings(code) } catch { /* 单只失败不影响 */ }
  }))

  // 5. 启动 3 个 service loop（持仓已就绪，第一轮 collectMissing 即收集到股取数）
  startEmCloseLoop()
  startEmRealtimeLoop()
  startYahooLoop()
}

/** 停止基金板块（app 卸载/跨日重建用） */
export function stopFundModule(): void {
  stopEmCloseLoop()
  stopEmRealtimeLoop()
  stopYahooLoop()
}

/** 跨日重建：清缓存 + 重建 Worker + 重新启动 */
export async function rebuildFundModuleOnCrossDay(): Promise<void> {
  stopFundModule()
  workerManager.rebuildAllWorkers()
  const store = useFundStore()
  store.clearCrossDayCaches()
  reloadHolidays()  // 跨日/跨年重置节假日 loaded 标记，startFundModule 内重取（同年命中缓存，跨年重取 Nager）
  started = false
  await startFundModule()
}
