/**
 * 详情页持仓股票涨跌 Composable（T+2 基金专用）
 *
 * 数据来源：全局缓存（store 的 stockPrevDayCache / stockRealtimeCache），不在此发起 Yahoo 请求。
 *   - 收盘涨跌：fundStore.stockPrevDayCache（由双 loop 后台填充：国内 aStockLoop 东财K线、海外 overseasLoop Yahoo close）
 *   - 实时涨跌：fundStore.stockRealtimeCache（由双 loop 填充：国内 aStockLoop 东财双值顺带、海外 overseasLoop Yahoo realtime 每轮全量刷新）
 * 启动 app 即开始获取所有基金持仓股票数据（store 层），点开详情页时全局缓存可能已有数据 → 立即显示；
 * 后台逐只/逐批到位后，下方 watch 触发本地 Map 增量刷新 → 「拿到哪只显示哪只」。
 *
 * 口径统一（按股票所在市场本地时区归日，见 cn-trading-day）：
 *   - 收盘：跳过今日 bar，取本地前一交易日 vs 其前日（与 T+1 calcPrevDayFromKlines 统一）
 *   - 实时：按各市场当日交易日相对昨收的实时涨跌（盘中/盘前盘后/收盘定格，24h 自由展示）
 * 口径在 yahoo-service.ts 的取数内统一计算，全局缓存存的就是该口径结果。
 * 收盘列与实时列日期不同是预期且正确的（如A股收盘列7.1、实时列7.2），二者本就是不同口径。
 *
 * 收盘/实时分开缓存（两个独立全局缓存），跨基金共享（同一只股只拉一次）。
 * 切基金/卸载时仅清本地 Map（全局缓存由 store 管理，不在此清）。
 *
 * 仅被 fund-detail-pane 引用；T+1 基金不调用 loadEstimation（由 fund-detail-pane 在 delayDays===2 时才触发）。
 */

import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import type { EstimatedHoldings } from '@/modules/fund/fund-types'
import type { StockQuoteInfo } from '@/shared/types/common-types'
import { useFundStore } from '@/modules/fund/fund-store'
import { computeEstimatedGszzlFromPrevDay } from '@/modules/fund/calc/gszzl-weight'
import { normalizeStockCodeTencent } from '@/shared/net/tencent-codec'
import { searchStocks } from '@/modules/stock/search/stock-search'

export function useEstimatedHoldings(fundCode: Ref<string> | string, delayDays: Ref<number> | number) {
  const estimated = ref<EstimatedHoldings | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** 收盘涨跌（基准日统一锚美股最近已收盘交易日）：从全局缓存提取，key=原始 stockCode */
  const prevDayMap = ref<Map<string, StockQuoteInfo>>(new Map())
  const estimatedGszzl = ref<number | null>(null)
  /** 实时涨跌（各市场当日交易日相对昨收）：从全局缓存提取，key=原始 stockCode */
  const realtimeMap = ref<Map<string, StockQuoteInfo>>(new Map())

  const code = computed(() => typeof fundCode === 'string' ? fundCode : fundCode.value)
  const isT2 = computed(() => {
    const days = typeof delayDays === 'number' ? delayDays : delayDays.value
    return days === 2
  })

  /** 当前基金持仓股票清单（统一来源）：T+1/T+2 均用推算持仓（estimated）。
   *  供 refreshPrevDayFromCache/refreshRealtimeFromCache 提取涨跌，与 displayHoldings 展示的持仓行同源同构，
   *  保证涨跌列与持仓行一一对应。T+1/T+2 同源。 */
  const holdingsList = computed(() => {
    return estimated.value?.holdings ?? []
  })

  async function loadEstimation(preloaded?: { stockCodesNew?: unknown; fundSharesPositions?: unknown[] }): Promise<void> {
    const fc = code.value
    if (!fc) return

    loading.value = true
    error.value = null
    // 切换基金时清空上一只的本地状态，避免异步取数期间残留旧基金持仓（串台）。
    //   estimated（持仓本身）尤其关键：旧版只清涨跌 Map 不清 estimated，
    //   切到无持仓基金时 estData=null 不更新 estimated → 永久显示上一只持仓。
    estimated.value = null
    prevDayMap.value = new Map()
    realtimeMap.value = new Map()

    const fundStore = useFundStore()
    let estData = fundStore.estimatedHoldingsCache.get(fc)?.data ?? null

    // 缓存未命中时异步拉取推算持仓
    if (!estData) {
      try {
        // fetchStockQuotes 传 noop：持仓立即展示，涨跌由 store loop 取数后 recompute 兜底
        // preloaded：复用详情页已加载的 pingzhongdata（stockCodesNew），避免二次 script 注入
        estData = await fundStore.getEstimatedHoldings(fc, async () => new Map(), preloaded)
      } catch { /* 静默 */ }
    }

    if (estData) {
      estimated.value = estData
      // 东财搜索取股票中文名填 stockName。接口返回什么显示什么，不映射。异步不阻塞，取到后触发响应式刷新。
      // 传 fc 做守卫：searchStocks 异步期间若用户切到别的基金，estimated 已被新基金 loadEstimation 替换，
      // 此处写回会串台旧基金持仓，故仅当仍是本基金时才填。
      void fillStockNames(estData, fc)
    }

    // 收盘/实时涨跌：从全局缓存同步提取（不发起 Yahoo 请求；后台填充后由 watch 增量刷新）
    refreshPrevDayFromCache()
    refreshRealtimeFromCache()

    if (isT2.value) {
      const v = fundStore.getValuation(fc)
      // 自愈：首屏 gszzl 仍可能为 0 时用全局收盘缓存补算
      if (estData && estData.holdings.length > 0 && v && v.isEstimated && v.gszzl === 0) {
        const gszzl = computeEstimatedGszzlFromPrevDay(estData.holdings, fundStore.stockPrevDayCache)
        if (gszzl != null) {
          v.gszzl = gszzl
          if (v.dwjz > 0) v.gz = v.dwjz * (1 + gszzl / 100)
          fundStore.valuationMap.set(fc, v)
          fundStore.estimatedGszzlMap.set(fc, gszzl)
          estimatedGszzl.value = gszzl
        } else {
          estimatedGszzl.value = v?.gszzl ?? null
        }
      } else {
        estimatedGszzl.value = v?.gszzl ?? null
      }
    }

    loading.value = false
  }

  /** 东财搜索取股票名填 stockName（持仓股票名）。
   *  pingzhong stockCodesNew 只有代码无名称，用东财 suggest 逐只搜补中文名。
   *  候选筛选：纯数字股（emMarketCode 空）必是海外股（港股/韩股无前缀），东财搜索常同时返回
   *  深市同代码退市股(1/0)和基金(150等非股票)。emMarketCode 非空时精确匹配最权威；
   *  空时排除 A股+基金，从剩余海外股挑（东财排序通常主股票在前）。
   *  仅填为空的 stockName，已具名不覆盖。异步不阻塞，取到后重新赋值 estimated 触发刷新。 */
  async function fillStockNames(est: EstimatedHoldings, fc: string): Promise<void> {
    const items = est.holdings.filter(h => !h.stockName)
    if (items.length === 0) return
    const results = await Promise.all(
      items.map(async h => ({ h, res: await searchStocks(h.stockCode) }))
    )
    // 守卫：searchStocks 期间若已切到别的基金，estimated 已被替换，不再写回（防串台）。
    if (code.value !== fc) return
    const NON_STOCK_MARKETS = new Set(['150', '151', '152', '153'])  // 基金/理财类 rawMarket（非股票）
    const isAShare = (m: string) => m === '1' || m === '0'
    let changed = false
    for (const { h, res } of results) {
      const normCode = normalizeStockCodeTencent(h.stockCode).code
      const candidates = res.filter(r => r.code === h.stockCode || r.code === normCode)
      // 1) emMarketCode 精确匹配（最权威）
      let hit = candidates.find(r => r.rawMarket === h.emMarketCode)
      // 2) emCode 空/匹配不上：排除 A股(1/0)和基金(150等非股票)，从剩余挑第一个
      if (!hit) {
        const overseas = candidates.filter(r => !isAShare(r.rawMarket) && !NON_STOCK_MARKETS.has(r.rawMarket))
        hit = overseas[0] ?? candidates[0]
      }
      if (hit?.name) { h.stockName = hit.name; changed = true }
    }
    if (changed) estimated.value = { ...est, holdings: [...est.holdings] }
  }

  /** 从全局收盘缓存提取本基金持仓的收盘涨跌到 prevDayMap。
   *  全局缓存在后台被东财/Yahoo 涨跌逐批填充后会变化（store 重新赋值整张 Map）→ watch 重新调用，增量刷新涨跌列。
   *  T+1/T+2 同构：holdingsList 统一来源（T+2 推算持仓 / T+1 store 全量持仓）。 */
  function refreshPrevDayFromCache(): void {
    const holdings = holdingsList.value
    if (holdings.length === 0) return
    const fundStore = useFundStore()
    const globalCache = fundStore.stockPrevDayCache
    const stockMap = new Map<string, StockQuoteInfo>()
    for (const h of holdings) {
      const info = globalCache.get(h.stockCode)
      if (info) stockMap.set(h.stockCode, info) // 有就设；后台到位后逐步补齐更多股票
    }
    prevDayMap.value = stockMap // 始终覆盖：缓存增长时补齐更多股票
  }

  /** 从全局实时缓存提取本基金持仓的实时涨跌到 realtimeMap（与收盘同构，缓存分离） */
  function refreshRealtimeFromCache(): void {
    const holdings = holdingsList.value
    if (holdings.length === 0) return
    const fundStore = useFundStore()
    const globalCache = fundStore.stockRealtimeCache
    const stockMap = new Map<string, StockQuoteInfo>()
    for (const h of holdings) {
      const info = globalCache.get(h.stockCode)
      if (info) stockMap.set(h.stockCode, info)
    }
    realtimeMap.value = stockMap
  }

  /** 主动从全局缓存提取昨日收盘+实时涨跌（T+1 进入详情页时调，因 T+1 不走 loadEstimation） */
  function refreshFromCache(): void {
    refreshPrevDayFromCache()
    refreshRealtimeFromCache()
  }

  // 全局缓存在后台东财/Yahoo 涨跌到位后会变化（store 重新赋值整张 Map）→ 重新提取，刷新涨跌列
  const stopWatchPrevDay = watch(() => useFundStore().stockPrevDayCache, () => {
    refreshPrevDayFromCache()
  })
  const stopWatchRealtime = watch(() => useFundStore().stockRealtimeCache, () => {
    refreshRealtimeFromCache()
  })

  function getPrevDayRate(stockCode: string): number | null {
    return prevDayMap.value.get(stockCode)?.changeRate ?? null
  }
  function prevDayClass(stockCode: string): string {
    const rate = getPrevDayRate(stockCode)
    if (rate == null) return ''
    if (rate > 0) return 'text-rise'
    if (rate < 0) return 'text-fall'
    return 'text-flat'
  }
  function formatRate(rate: number | null): string {
    if (rate == null) return '--'
    const sign = rate > 0 ? '+' : ''
    return `${sign}${rate.toFixed(2)}%`
  }

  function getRealtimeRate(stockCode: string): number | null {
    return realtimeMap.value.get(stockCode)?.changeRate ?? null
  }
  /** 美股实时时段标签（仅 Yahoo realtime 美股有意义）：'PRE'盘前/'REGULAR'盘中/'POST'盘后，其余 undefined */
  function getRealtimeSession(stockCode: string): 'PRE' | 'REGULAR' | 'POST' | undefined {
    return realtimeMap.value.get(stockCode)?.session
  }
  /** 实时数据时间戳（Unix ms）：Yahoo 用最新成交时间，东财用取数时刻。close 模式无值 */
  function getRealtimeUpdatedAt(stockCode: string): number | undefined {
    return realtimeMap.value.get(stockCode)?.updatedAt
  }
  function realtimeClass(stockCode: string): string {
    const rate = getRealtimeRate(stockCode)
    if (rate == null) return ''
    if (rate > 0) return 'text-rise'
    if (rate < 0) return 'text-fall'
    return 'text-flat'
  }

  onUnmounted(() => {
    stopWatchPrevDay()
    stopWatchRealtime()
    estimated.value = null
    prevDayMap.value = new Map()
    estimatedGszzl.value = null
    realtimeMap.value = new Map()
  })

  return {
    estimated,
    loading,
    error,
    isT2,
    estimatedGszzl,
    loadEstimation,
    refreshFromCache,
    getPrevDayRate,
    prevDayClass,
    formatRate,
    prevDayMap,
    realtimeMap,
    getRealtimeRate,
    getRealtimeSession,
    getRealtimeUpdatedAt,
    realtimeClass,
  }
}
