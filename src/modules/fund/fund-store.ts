/**
 * 基金板块 Pinia store
 *
 * 持有基金估值全链路状态：估值数据、推算持仓、双全局缓存（收盘/实时）、盘中分时。
 * 核心机制：事件驱动 recompute——每批股票涨跌数据到位即 merge 进缓存并重算持有这些股票的 T+2 基金估值，
 * 不等整轮 loop 结束。
 *
 * 与 service 的分工：store 持状态 + merge/recompute 算法；service（2.9）做调度
 * （收集缺失股→发 Worker→收结果→调 store 的 merge）。store 暴露 collectMissing/onBatch 给 service。
 *
 * 持久化：基金代码/双全局缓存/盘中分时持久化到 localStorage，跨日失效重拉。
 */

import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import type {
  FundValuation, EstimatedHoldings, EstimatedHoldingItem,
  IntradayPoint, FundAllHoldings, FundCache, ViewMode, SortField, SortDirection, ColumnConfig,
} from '@/modules/fund/fund-types'
import type { StockQuoteInfo, StockMarket } from '@/shared/types/common-types'
import { RefreshStatus } from '@/config/enums'
import { STORAGE_KEYS, DEFAULT_SETTINGS, FUND_VALUATION_CONFIG, ESTIMATE_CONFIG, INTRADAY_CONFIG } from '@/config/constants'
import { loadJSON, saveJSON, loadString, saveString, removeKey } from '@/shared/cache/local-storage-io'
import { isValidFundCode } from '@/shared/utils/validation'
import { getTodayStr, getBaseDay, getPreviousTradingDay, isCnTradingDay } from '@/modules/fund/valuation/cn-trading-day'
import { classifyShare } from '@/shared/market/market-classify'
import { stockMarketToTz } from '@/shared/market/market-classify'
import { resolveMarketTradingDays } from '@/shared/market/trading-day'
import { normalizeStockCodeTencent } from '@/shared/net/tencent-codec'
import { computeEstimatedGszzlFromPrevDay } from '@/modules/fund/calc/gszzl-weight'
import { beijingNow } from '@/shared/utils/date-format'
import { fetchEstimatedHoldings, type FetchStockQuotes } from '@/modules/fund/holdings/estimated-holdings'
import { fetchTop10FromMobileApi } from '@/modules/fund/holdings/f10-mobile-fetch'
import { fetchTop10FromPingzhong } from '@/modules/fund/holdings/pingzhong-holdings-fetch'
import type { PingzhongPreloaded } from '@/modules/fund/holdings/pingzhong-holdings-fetch'
import { generateIntradayPoints } from '@/modules/fund/intraday/intraday-points'
import { fetchIntradayEstimate } from '@/modules/fund/intraday/intraday-estimate-fetch'
import { batchGetValuation } from '@/modules/fund/valuation/fund-valuation-merge'
import { getFundType } from '@/modules/fund/catalog/fund-code-catalog'
import { useCacheStore } from '@/modules/fund/cache-store'
import { useHoldingStore } from '@/modules/holding/holding-store'

/** 推算持仓缓存条目 */
interface EstimatedCacheEntry { data: EstimatedHoldings; cachedDate: string }
/** T+1 持仓缓存条目 */
interface T1CacheEntry { data: FundAllHoldings; cachedDate: string }
/** 收集的缺失股条目（service 调度用） */
export interface StockEntry { stockCode: string; emMarketCode?: string; stockName?: string }

/** 推算持仓缓存 LRU 上限 */
const MAX_ESTIMATED_CACHE = ESTIMATE_CONFIG.MAX_ESTIMATED_CACHE

export const useFundStore = defineStore('fund', () => {
  // ===== 基础状态 =====
  /** 用户关注的基金代码列表 */
  const fundCodes = ref<string[]>([])
  /** 基金代码→名称映射（搜索/目录/估值多源填充）。fundgz 失败时兜底显示名称，避免列表里只剩"基金(code)"。 */
  const fundNameMap = ref<Record<string, string>>({})
  /** 估值数据映射 - key 为基金代码 */
  const valuationMap = ref<Map<string, FundValuation>>(new Map())
  /** T+2 基金推算估值涨跌幅映射 - key 为基金代码 */
  const estimatedGszzlMap = ref<Map<string, number>>(new Map())
  /** 个股昨跌全局缓存 - key 为 stockCode（双 key：归一化+原始），跨基金共享，跨日失效 */
  const stockPrevDayCache = shallowRef<Map<string, StockQuoteInfo>>(new Map())
  /** 个股实时涨跌全局缓存 - 与收盘缓存分离，T+1/T+2 共享，跨日清空 */
  const stockRealtimeCache = shallowRef<Map<string, StockQuoteInfo>>(new Map())
  /** T+1 基金持仓缓存 - 供 loop 全局预加载持仓股票，跨日失效 */
  const t1HoldingsCache = ref<Map<string, T1CacheEntry>>(new Map())
  /** 推算持仓缓存 - LRU 上限 MAX_ESTIMATED_CACHE，跨日失效 */
  const estimatedHoldingsCache = ref<Map<string, EstimatedCacheEntry>>(new Map())
  /** 盘中分时数据 - key 为基金代码 */
  const intradayMap = ref<Record<string, IntradayPoint[]>>({})
  /** 数据刷新状态 */
  const refreshStatus = ref<RefreshStatus>(RefreshStatus.Idle)
  /** 上次刷新时间戳 */
  const lastRefreshTime = ref<number>(0)
  /** 上次刷新日期 - 跨日检测 */
  const lastRefreshDate = ref<string>('')
  /** 视图模式 */
  const viewMode = ref<ViewMode>('table')
  /** 排序字段 */
  const sortField = ref<SortField>('changeRate')
  /** 排序方向 */
  const sortDirection = ref<SortDirection>('desc')
  /** 列配置 */
  const columnConfig = ref<ColumnConfig[]>(initColumnConfig())

  // ===== 飞行中请求去重 =====
  const pendingT1Requests = new Map<string, Promise<FundAllHoldings | null>>()
  const pendingEstimationRequests = new Map<string, Promise<EstimatedHoldings | null>>()

  // ===== 计算属性 =====
  const isLoading = computed(() => refreshStatus.value === RefreshStatus.Loading)
  const fundCount = computed(() => fundCodes.value.length)

  /** T+2 提示标志：首次检测到 T+2 基金时置 true，由页面消费后置 false */
  const t2HintPending = ref(false)

  /** 获取指定基金的估值数据 */
  function getValuation(fundCode: string): FundValuation | undefined {
    return valuationMap.value.get(fundCode)
  }

  // ===== 基金代码增删 =====
  /** 添加基金。name 可选：搜索/识图/目录拿到名称时一并写入 fundNameMap，fundgz 失败也能显示名称。 */
  function addFund(code: string, name?: string): boolean {
    if (!isValidFundCode(code) || fundCodes.value.includes(code)) return false
    fundCodes.value = [...fundCodes.value, code]
    if (name) setFundName(code, name)
    persistFundCodes()
    return true
  }

  function removeFund(code: string): void {
    fundCodes.value = fundCodes.value.filter(c => c !== code)
    persistFundCodes()
  }

  /** 批量添加基金。items 可传 code 字符串或 {code, name} 对象，名称一并写入映射。 */
  function batchAddFunds(items: (string | { code: string; name?: string })[]): number {
    const valid = items.filter((it): it is { code: string; name?: string } => {
      const code = typeof it === 'string' ? it : it.code
      return isValidFundCode(code) && !fundCodes.value.includes(code)
    })
    fundCodes.value = [...fundCodes.value, ...valid.map(v => v.code)]
    for (const v of valid) if (v.name) setFundName(v.code, v.name)
    persistFundCodes()
    return valid.length
  }

  /** 写入基金名称（非空才写，触发响应式更新）。多源填充：搜索/目录/估值/fundgz 均可调。 */
  function setFundName(code: string, name: string): void {
    if (!name || fundNameMap.value[code] === name) return
    fundNameMap.value = { ...fundNameMap.value, [code]: name }
    saveJSON(STORAGE_KEYS.FUND_NAMES, fundNameMap.value)
  }

  /** 取基金名称（兜底，不含估值接口实时 name）。 */
  function getFundName(code: string): string {
    return fundNameMap.value[code] ?? ''
  }

  /** 解析显示用基金名称：优先估值接口实时 name（跳过"基金(code)"占位符），回退 fundNameMap，再回退 code。
   *  所有 UI 显示基金名的位置统一走此方法，保证 fundgz 失败时也能显示真名。 */
  function resolveFundName(code: string): string {
    const raw = getValuation(code)?.name ?? ''
    if (raw && !raw.startsWith('基金(')) return raw
    return getFundName(code) || code
  }

  /** 判定是否为占位名 fundgz 失败时生成的"基金(code)"，占位名不算真名，不写入映射。 */
  function stripPlaceholderName(name: string | undefined, code: string): string {
    if (!name) return ''
    if (name === `基金(${code})`) return ''
    return name
  }

  // ===== 持久化 =====
  function restoreFundCodes(): void {
    const codes = loadJSON<string[]>(STORAGE_KEYS.FUND_CODES, [])
    fundCodes.value = codes.filter(c => isValidFundCode(c))
  }

  /** 恢复基金名称映射（启动预热，避免列表首屏只剩"基金(code)"） */
  function restoreFundNames(): void {
    fundNameMap.value = loadJSON<Record<string, string>>(STORAGE_KEYS.FUND_NAMES, {})
  }

  function persistFundCodes(): void {
    saveJSON(STORAGE_KEYS.FUND_CODES, fundCodes.value)
  }

  /** 恢复双全局缓存（跨日校验）；
   *  localStorage 存的是普通对象，需转回 Map。
   *  - prevDay（昨日收盘）：基准日校验（美股 lastClosedDay，baseDay 变化=全球跨日）
   *  - realtime（今日实时）：用 A股当前交易日校验（非 baseDay）。实时数据属于当日市场，
   *    清晨美股基准日未翻篇时 baseDay 不变，会把昨日 A股实时值误当今日恢复→手机端后台冻结
   *    后次日恢复显示异常。改用 A股当前交易日（交易日=今日，非交易日=上一交易日）校验，
   *    过期则丢弃内存恢复并清 localStorage，强制 loop 重拉。 */
  function restoreStockCaches(): void {
    const baseDay = getBaseDay()
    const prevDate = loadString(STORAGE_KEYS.STOCK_PREV_DAY_DATE)
    if (prevDate === baseDay) {
      const raw = loadJSON<Record<string, StockQuoteInfo> | null>(STORAGE_KEYS.STOCK_PREV_DAY_CACHE, null)
      stockPrevDayCache.value = raw ? new Map(Object.entries(raw)) : new Map()
    } else {
      // 过期：清 localStorage 避免下次仍读到旧值（内存本就空，loop 重拉）
      removeKey(STORAGE_KEYS.STOCK_PREV_DAY_CACHE)
      removeKey(STORAGE_KEYS.STOCK_PREV_DAY_DATE)
    }
    const rtDate = loadString(STORAGE_KEYS.STOCK_REALTIME_DATE)
    if (rtDate) {
      const raw = loadJSON<Record<string, StockQuoteInfo> | null>(STORAGE_KEYS.STOCK_REALTIME_CACHE, null)
      if (raw) {
        // 逐条按其所属市场的「当前交易日」校验：realtime 缓存是 A/HK/US/海外混存的扁平 Map，
        // 各市场交易日不同步（美股周五实时在北京周六仍有效），不能用单一 A 股口径全局判。
        // 仅保留 date 仍等于该市场当前交易日的条目；旧交易日数据丢弃，交 loop 重取/写 closed。
        // ⚠️ 必须逐条：旧实现用单个 STOCK_REALTIME_DATE 戳判定，非交易日回退到上一交易日导致
        //    周五实时在周六被误判有效（stored===rtDay）而整体恢复，显示周五涨跌——跨日显示异常根因。
        const kept = new Map<string, StockQuoteInfo>()
        let changed = false
        for (const [code, info] of Object.entries(raw)) {
          if (!info || !realtimeEntryStillValid(info)) { changed = true; continue }
          kept.set(code, info)
        }
        stockRealtimeCache.value = kept
        // 有过期条目被丢弃：落盘缓存已与实际保留集不一致，立即写回（清空则删 key），避免下次又恢复旧值
        if (changed) persistStockRealtimeCache()
      } else {
        stockRealtimeCache.value = new Map()
        removeKey(STORAGE_KEYS.STOCK_REALTIME_CACHE)
        removeKey(STORAGE_KEYS.STOCK_REALTIME_DATE)
      }
    } else {
      stockRealtimeCache.value = new Map()
    }
  }

  /** 判定单条 realtime 缓存是否仍属于「其市场的当前交易日」（有效则保留，否则丢弃）。
   *  各市场交易日独立计算：美股周五实时在北京周六 currentTradingDay('US')=Friday 仍有效。
   *  closed 占位（休盘 changeRate=null date=null）一律保留——loop 写入的当日休市标记无需过期。
   *  缺 market/date 且非 closed 的（异常数据）视为过期丢弃。 */
  function realtimeEntryStillValid(info: StockQuoteInfo): boolean {
    if (info.closed) return true
    if (!info.market) return false
    const tz = stockMarketToTz(info.market)
    const curTd = resolveMarketTradingDays(tz).currentTradingDay
    return !!info.date && info.date === curTd
  }

  /** 实时缓存的归属交易日：交易日=今日，非交易日=上一交易日（实时数据属于最近/当前交易日）。 */
  function getRealtimeCacheDay(): string {
    return isCnTradingDay() ? getTodayStr() : getPreviousTradingDay()
  }

  function persistStockPrevDayCache(): void {
    // Map 不能直接 JSON.stringify（会丢 entries 落盘成 '{}'）；先摊成普通对象，
    // restoreStockCaches 再用 Object.entries 读回。否则缓存形同未存，每次刷新都全量重拉。
    const obj: Record<string, StockQuoteInfo> = {}
    for (const [code, info] of stockPrevDayCache.value) obj[code] = info
    saveJSON(STORAGE_KEYS.STOCK_PREV_DAY_CACHE, obj)
    saveString(STORAGE_KEYS.STOCK_PREV_DAY_DATE, getBaseDay())
  }

  function persistStockRealtimeCache(): void {
    // 同上：Map 需摊成普通对象再落盘，避免序列化成 '{}' 丢失实时缓存。
    // 日期戳用 A股当前交易日（非 baseDay）：实时数据属于当日市场，baseDay 在北京清晨
    // 美股未翻篇时不变化，会让昨日 A股实时值被当今日恢复（手机端次日显示异常）。
    const obj: Record<string, StockQuoteInfo> = {}
    for (const [code, info] of stockRealtimeCache.value) obj[code] = info
    saveJSON(STORAGE_KEYS.STOCK_REALTIME_CACHE, obj)
    saveString(STORAGE_KEYS.STOCK_REALTIME_DATE, getRealtimeCacheDay())
  }

  /** 恢复盘中分时点缓存（仅当日写入有效，跨日丢弃重生成，避免首屏缩略图空白） */
  function restoreIntradayMap(): void {
    if (loadString(STORAGE_KEYS.INTRADAY_MAP_DATE) !== getTodayStr()) return
    const raw = loadJSON<Record<string, IntradayPoint[]> | null>(STORAGE_KEYS.INTRADAY_MAP, null)
    if (raw && typeof raw === 'object') intradayMap.value = raw
  }

  /** 持久化盘中分时点（带当日戳，供下次启动预热） */
  function persistIntradayMap(): void {
    saveJSON(STORAGE_KEYS.INTRADAY_MAP, intradayMap.value)
    saveString(STORAGE_KEYS.INTRADAY_MAP_DATE, getTodayStr())
  }

  // ===== merge：股票涨跌写入全局缓存 + 触发 recompute =====

  /** 将股票昨日收盘 Map 合并进 stockPrevDayCache（双 key：原始码 + 归一化码），触发 recompute */
  async function mergeStockQuotesToCache(
    quoteMap: Map<string, StockQuoteInfo>,
    holdings: { stockCode: string }[],
  ): Promise<void> {
    if (quoteMap.size === 0) return
    const merged = new Map(stockPrevDayCache.value)
    for (const [code, info] of quoteMap) {
      // 有涨跌 或 休盘(closed) 才写入；取不到(changeRate=null 且非休盘)的不写缓存，
      // 下轮由 collectMissing 重新收集重试（不判 failed 永久跳过——取不到可能是临时网络/代理问题）
      if (info.changeRate != null || info.closed) merged.set(code, info)
    }
    // 双 key：同时用原始代码写入，确保后续按原始码匹配
    for (const h of holdings) {
      const { code: normalizedCode } = normalizeStockCodeTencent(h.stockCode)
      const info = merged.get(normalizedCode) ?? merged.get(h.stockCode)
      if (info) merged.set(h.stockCode, info)
    }
    stockPrevDayCache.value = merged
    persistStockPrevDayCache()
    // 数据变化立即重算持有这些股票的基金涨跌幅（事件驱动）
    await recomputeFundsForStocks(quoteMap.keys())
  }

  /** 将股票实时 Map 合并进 stockRealtimeCache（双 key），触发 recompute */
  async function mergeRealtimeToCache(
    quoteMap: Map<string, StockQuoteInfo>,
    holdings: { stockCode: string }[],
  ): Promise<void> {
    if (quoteMap.size === 0) return
    const merged = new Map(stockRealtimeCache.value)
    for (const [code, info] of quoteMap) {
      // 有涨跌 或 休盘(closed) 都写入；休盘覆盖 stale 周五数据，避免休市日实时列显旧值
      if (info.changeRate != null || info.closed) merged.set(code, info)
    }
    for (const h of holdings) {
      const { code: normalizedCode } = normalizeStockCodeTencent(h.stockCode)
      const info = merged.get(normalizedCode) ?? merged.get(h.stockCode)
      if (info) merged.set(h.stockCode, info)
    }
    stockRealtimeCache.value = merged
    persistStockRealtimeCache()
    await recomputeFundsForStocks(quoteMap.keys())
  }

  // ===== recompute：事件驱动重算受影响基金 =====

  /** 找出持有指定股票的 T+1/T+2 基金（数据变化时定向重算）。
   *  T+1/T+2 均取 estimatedHoldingsCache（推算持仓：季报前十大+全量报告按比例缩放+优化器约束），
   *  使预测胶囊与 T+2 同口径。T+1 的 gszzl 主数值仍由 fundgz 驱动，不在此推算（见 recomputeFundsForStocks 守卫）。
   *  全量持仓（t1HoldingsCache）仅用于持仓透视表展示，不喂胶囊。 */
  function fundsHoldingStocks(stockCodes: Iterable<string>): Map<string, EstimatedHoldingItem[]> {
    const targetCodes = new Set<string>()
    for (const sc of stockCodes) targetCodes.add(sc)
    const result = new Map<string, EstimatedHoldingItem[]>()
    const today = getTodayStr()
    for (const fundCode of fundCodes.value) {
      const v = valuationMap.value.get(fundCode)
      if (!v) continue
      const isT2 = v.delayDays === 2  // T+2 即可（确认后 isEstimated=false 也需重算 realtimeGszzl）
      const isT1 = v.delayDays === 1  // T+1 也参与：持仓股票实时加权 → 预测胶囊
      if (!isT2 && !isT1) continue
      // T+1/T+2 统一取推算持仓，胶囊口径一致
      const cached = estimatedHoldingsCache.value.get(fundCode)
      const holdings: EstimatedHoldingItem[] | null =
        cached && cached.cachedDate === today ? cached.data.holdings : null
      if (!holdings) continue
      const hasTarget = holdings.some(h => {
        const nc = normalizeStockCodeTencent(h.stockCode).code
        return targetCodes.has(nc) || targetCodes.has(h.stockCode)
      })
      if (hasTarget) result.set(fundCode, holdings)
    }
    return result
  }

  /** 持仓涨跌数据变化后，立即重算持有这些股票的基金估值（gszzl 昨日收盘 + realtimeGszzl 实时） */
  async function recomputeFundsForStocks(stockCodes: Iterable<string>): Promise<void> {
    const affectedFunds = fundsHoldingStocks(stockCodes)
    for (const [fundCode, holdings] of affectedFunds) {
      const v = valuationMap.value.get(fundCode)
      if (!v) continue
      // 昨日收盘加权 → gszzl（仅 T+2 未确认 isEstimated 时推算；已确认则保留确认值，不被持仓推算覆盖）。
      // ⚠️ 必须卡 delayDays===2：T+1 盘中 isEstimated=true，若进此块会用持仓昨收加权覆盖 fundgz 给的 gszzl，
      //    并污染 estimatedGszzlMap（喂 T+2 防闪烁）。T+1 的 gszzl（今日涨跌幅）恒由 fundgz 驱动，不受持仓股票影响；
      //    T+1 的「预测」胶囊走下面 realtime 块，持仓底数已与 T+2 同取 estimatedHoldingsCache（推算持仓）。
      if (v.delayDays === 2 && v.isEstimated) {
        const gszzl = computeEstimatedGszzlFromPrevDay(holdings, stockPrevDayCache.value)
        if (gszzl != null) {
          v.gszzl = gszzl
          if (v.dwjz > 0) v.gz = v.dwjz * (1 + gszzl / 100)
          estimatedGszzlMap.value.set(fundCode, gszzl)
        }
      }
      // 实时加权 → realtimeGszzl（头部胶囊）。确认后也推算——实时估算是独立展示需求。
      // 胶囊标签按确认类型区分（替代旧的 T+1「预测」/T+2「实时」二分，措辞更准确）：
      //   - 当日确认（原 T+1）：基金有 fundgz 官方盘中估值作主值，胶囊是持仓股票实时加权 → 「持仓预测」
      //   - 次日确认（原 T+2）：无盘中估值，胶囊是唯一实时推算（今日市场数据，美股含盘前/盘中/盘后）→ 「实时推算」
      const rtLabel = v.delayDays === 1 ? '持仓预测' : '实时推算'
      const realtimeMapForFund = new Map<string, StockQuoteInfo>()
      let allHoldingsCached = true  // 是否每只持仓都有缓存条目（用于判全休市）
      for (const h of holdings) {
        const nc = normalizeStockCodeTencent(h.stockCode).code
        const info = stockRealtimeCache.value.get(nc) ?? stockRealtimeCache.value.get(h.stockCode)
        if (!info) { allHoldingsCached = false; continue }
        // 加权前按其所属市场当前交易日校验 date：丢弃旧交易日数据（防跨日过期清理漏网时旧涨跌被加权显示）。
        // 各市场独立判定（美股周五实时在周六仍有效）。closed 占位（休盘 changeRate=null）本就不进加权。
        if (info.changeRate == null) continue
        if (!realtimeEntryStillValid(info)) { allHoldingsCached = false; continue }
        realtimeMapForFund.set(h.stockCode, info)
      }
      const rtGszzl = computeEstimatedGszzlFromPrevDay(holdings, realtimeMapForFund)
      if (rtGszzl != null) {
        v.realtimeGszzl = rtGszzl
        v.realtimeSource = rtLabel
        v.realtimeUpdatedAt = beijingNow().format('HH:mm')
      } else if (allHoldingsCached && realtimeMapForFund.size === 0) {
        // 所有持仓股都有缓存但全休市（changeRate=null）→ realtimeGszzl=0 显示"休盘"
        v.realtimeGszzl = 0
        v.realtimeSource = '休盘'
        v.realtimeUpdatedAt = beijingNow().format('HH:mm')
      }
      valuationMap.value.set(fundCode, v) // 触发响应式
    }
  }

  // ===== 推算持仓取数（带缓存+LRU+去重）=====

  /** 获取推算持仓（带缓存+LRU淘汰+飞行中请求去重）。fetchStockQuotes 由 service 注入。 */
  function getEstimatedHoldings(
    fundCode: string,
    fetchStockQuotes: FetchStockQuotes,
    preloaded?: PingzhongPreloaded,
  ): Promise<EstimatedHoldings | null> {
    const today = getTodayStr()
    const cached = estimatedHoldingsCache.value.get(fundCode)
    if (cached && cached.cachedDate === today) return Promise.resolve(cached.data)

    const pending = pendingEstimationRequests.get(fundCode)
    if (pending) return pending

    const promise = (async (): Promise<EstimatedHoldings | null> => {
      try {
        const est = await fetchEstimatedHoldings(fundCode, undefined, fetchStockQuotes, preloaded)
        if (est) {
          lruSet(estimatedHoldingsCache.value, fundCode, { data: est, cachedDate: today }, MAX_ESTIMATED_CACHE)
          // 推算过程已拉取的股票行情写入全局缓存，避免重复请求
          if (est.stockQuoteMap && est.stockQuoteMap.size > 0) {
            void mergeStockQuotesToCache(est.stockQuoteMap, est.holdings)
          }
          // 后台 Yahoo 涨跌完成（持仓已先展示）后，异步填充全局缓存并刷新估值
          if (est.stockQuotesReady) {
            est.stockQuotesReady.then(() => {
              if (est.stockQuoteMap && est.stockQuoteMap.size > 0) {
                void mergeStockQuotesToCache(est.stockQuoteMap, est.holdings)
              }
            }).catch(() => { /* 静默 */ })
          }
          // 后台 pingzhong 市场补全完成（首页 bootstrap 异步路径）：补全改了 holdings 的 emMarketCode，
          // 需写回缓存 + 触发 recompute，让被误判的海外股（如韩股 000660）改走 Yahoo 正确取数。
          if (est.holdingsEnrichedReady) {
            est.holdingsEnrichedReady.then(() => {
              try {
                // 写回补全后的持仓（覆盖首屏占位的错误市场缓存），供下一轮 collectMissingStocks 按新 emCode 分流
                lruSet(estimatedHoldingsCache.value, fundCode, { data: est, cachedDate: getTodayStr() }, MAX_ESTIMATED_CACHE)
                // 清掉按错误深市 key 写入的脏涨跌缓存（若有），避免 recompute 仍取到旧误判值
                for (const h of est.holdings) {
                  const nc = normalizeStockCodeTencent(h.stockCode).code
                  if (stockRealtimeCache.value.has(nc)) stockRealtimeCache.value.delete(nc)
                  if (stockPrevDayCache.value.has(nc)) stockPrevDayCache.value.delete(nc)
                }
                // 触发重算：被改市场的股重新进 collect 分流（韩股→overseas→Yahoo），取数后 recompute 回填
                void recomputeFundsForStocks(est.holdings.map(h => h.stockCode))
              } catch { /* 静默 */ }
            }).catch(() => { /* 静默 */ })
          }
        }
        return est
      } finally {
        pendingEstimationRequests.delete(fundCode)
      }
    })()

    pendingEstimationRequests.set(fundCode, promise)
    return promise
  }

  /** 获取 T+1 基金全量持仓（带缓存+去重），供 loop 预加载 */
  function getT1Holdings(fundCode: string): Promise<FundAllHoldings | null> {
    const today = getTodayStr()
    const cached = t1HoldingsCache.value.get(fundCode)
    if (cached && cached.cachedDate === today) return Promise.resolve(cached.data)

    const pending = pendingT1Requests.get(fundCode)
    if (pending) return pending

    const promise = (async (): Promise<FundAllHoldings | null> => {
      try {
        // 占比：优先东财移动端 API（含代码+名称+占比），失败回退 pingzhong（仅代码、占比0）
        let result = await fetchTop10FromMobileApi(fundCode)
        if (!result || result.holdings.length === 0) {
          result = await fetchTop10FromPingzhong(fundCode)
        }
        if (result) {
          lruSet(t1HoldingsCache.value, fundCode, { data: result, cachedDate: today }, MAX_ESTIMATED_CACHE)
        }
        return result
      } finally {
        pendingT1Requests.delete(fundCode)
      }
    })()

    pendingT1Requests.set(fundCode, promise)
    return promise
  }

  /** 将已取到的 T+1 全量持仓写入缓存（供 service loop collectMissingStocks 收集股票代码）。
   *  详情页 fund-detail-pane 自行 fetchFundAllHoldings 后调此写入，保证 loop 能收集到该基金持仓股。 */
  function setT1Holdings(fundCode: string, data: FundAllHoldings): void {
    const today = getTodayStr()
    lruSet(t1HoldingsCache.value, fundCode, { data, cachedDate: today }, MAX_ESTIMATED_CACHE)
  }

  // ===== collectMissing：供 service 收集缺失股（三档分流）=====

  /** 收集所有 T+1/T+2 基金持仓中"收盘缓存缺失"的股票，按三档分流 */
  function collectMissingStocks(): { aStock: StockEntry[]; hkStock: StockEntry[]; usStock: StockEntry[]; overseas: StockEntry[] } {
    const today = getTodayStr()
    const aStockMap = new Map<string, StockEntry>()
    const hkStockMap = new Map<string, StockEntry>()
    const usStockMap = new Map<string, StockEntry>()
    const overseasMap = new Map<string, StockEntry>()

    for (const code of fundCodes.value) {
      const v = valuationMap.value.get(code)
      if (!v) continue
      const isT2 = v.delayDays === 2  // T+2 确认后(isEstimated=false)仍取持仓涨跌——持仓表展示是独立需求，美股盘中海外股实时在变；不再用 isEstimated 过滤（确认后 collect 会跳过导致持仓全空）
      const isT1 = v.delayDays === 1
      if (!isT2 && !isT1) continue
      // T+1/T+2 统一取推算持仓（胶囊口径一致）；全量持仓 t1HoldingsCache 仅用于透视表
      const estCached = estimatedHoldingsCache.value.get(code)
      const holdings = estCached && estCached.cachedDate === today ? estCached.data.holdings : null
      if (!holdings) continue
      for (const h of holdings) {
        const { code: normalizedCode } = normalizeStockCodeTencent(h.stockCode)
        const cached = stockPrevDayCache.value.get(normalizedCode)
        // 已缓存有值 / 休盘(closed) → 跳过不重复拉。
        // ⚠️ 取不到的股不写缓存、不判 failed——每轮重新收集重试。取不到可能是代理波动/网络抖动/
        // 临时无数据，不该"判死刑"永久跳过（旧 failed 机制会导致当天再也拿不到收盘值）。
        // em-close 一轮处理 A→HK→US 全组（非只取第一组），故死股重试不阻塞后序组推进。
        if (cached && (cached.changeRate != null || cached.closed)) continue
        const entry: StockEntry = { stockCode: h.stockCode, emMarketCode: h.emMarketCode, stockName: h.stockName }
        const market: StockMarket = classifyShare(h.emMarketCode, normalizedCode)
        if (market === 'A') aStockMap.set(normalizedCode, entry)
        else if (market === 'HK') hkStockMap.set(normalizedCode, entry)
        else if (market === 'US') usStockMap.set(normalizedCode, entry)
        else overseasMap.set(normalizedCode, entry)
      }
    }
    return {
      aStock: Array.from(aStockMap.values()),
      hkStock: Array.from(hkStockMap.values()),
      usStock: Array.from(usStockMap.values()),
      overseas: Array.from(overseasMap.values()),
    }
  }

  /** 收集所有 T+1/T+2 基金持仓中的"非 A/HK"股全量（realtime 每轮全量刷新用） */
  function collectOverseasAll(): StockEntry[] {
    const today = getTodayStr()
    const map = new Map<string, StockEntry>()
    for (const code of fundCodes.value) {
      const v = valuationMap.value.get(code)
      if (!v) continue
      const isT2 = v.delayDays === 2  // T+2 确认后(isEstimated=false)仍取持仓涨跌——持仓表展示是独立需求，美股盘中海外股实时在变；不再用 isEstimated 过滤（确认后 collect 会跳过导致持仓全空）
      const isT1 = v.delayDays === 1
      if (!isT2 && !isT1) continue
      // T+1/T+2 统一取推算持仓（胶囊口径一致）；全量持仓 t1HoldingsCache 仅用于透视表
      const estCached = estimatedHoldingsCache.value.get(code)
      const holdings = estCached && estCached.cachedDate === today ? estCached.data.holdings : null
      if (!holdings) continue
      for (const h of holdings) {
        const { code: normalizedCode } = normalizeStockCodeTencent(h.stockCode)
        // realtime 东财线只含 A/HK；美股+海外全走 Yahoo
        if (classifyShare(h.emMarketCode, normalizedCode) === 'A') continue
        if (classifyShare(h.emMarketCode, normalizedCode) === 'HK') continue
        map.set(normalizedCode, { stockCode: h.stockCode, emMarketCode: h.emMarketCode, stockName: h.stockName })
      }
    }
    return Array.from(map.values())
  }

  /** 收集所有 T+1/T+2 基金持仓中的 A/HK 股全量（realtime 每轮全量刷新用，不跳过已缓存）。
   *  与 collectOverseasAll 对称：collectMissingStocks 会跳过已缓存的股（用于收盘补缺失），
   *  但实时刷新需全量重拉（实时价在变 / 收盘后取定格值），故单独收集不跳过。 */
  function collectAHkAll(): StockEntry[] {
    const today = getTodayStr()
    const map = new Map<string, StockEntry>()
    for (const code of fundCodes.value) {
      const v = valuationMap.value.get(code)
      if (!v) continue
      const isT2 = v.delayDays === 2  // T+2 确认后(isEstimated=false)仍取持仓涨跌——持仓表展示是独立需求，美股盘中海外股实时在变；不再用 isEstimated 过滤（确认后 collect 会跳过导致持仓全空）
      const isT1 = v.delayDays === 1
      if (!isT2 && !isT1) continue
      // T+1/T+2 统一取推算持仓（胶囊口径一致）；全量持仓 t1HoldingsCache 仅用于透视表
      const estCached = estimatedHoldingsCache.value.get(code)
      const holdings = estCached && estCached.cachedDate === today ? estCached.data.holdings : null
      if (!holdings) continue
      for (const h of holdings) {
        const { code: normalizedCode } = normalizeStockCodeTencent(h.stockCode)
        const m = classifyShare(h.emMarketCode, normalizedCode)
        if (m !== 'A' && m !== 'HK') continue  // 只 A/HK（美股海外走 Yahoo）
        map.set(normalizedCode, { stockCode: h.stockCode, emMarketCode: h.emMarketCode, stockName: h.stockName })
      }
    }
    return Array.from(map.values())
  }

  // ===== 估值刷新（UI 用，带防闪烁） =====

  /** 请求单只基金估值（写 valuationMap + 更新盘中分时） */
  async function fetchValuation(fundCode: string): Promise<FundValuation | null> {
    const { getFundValuation } = await import('@/modules/fund/valuation/fund-valuation-merge')
    const data = await getFundValuation(fundCode, getFundType)
    if (data) {
      valuationMap.value.set(fundCode, data)
      // 多源填充名称：fundgz 成功才有真名，写回映射供 fundgz 失败时兜底
      const realName = stripPlaceholderName(data.name, fundCode)
      if (realName) setFundName(fundCode, realName)
      updateIntradayPoints(fundCode, data)
    }
    return data
  }

  /** 触发持仓股票收盘涨跌预加载（占位 no-op）。
   *  旧项目由详情页触发；新项目改为启动时由 service loop（em-close/yahoo）持续取数，
   *  详情页无需手动触发。保留方法签名供 fund-detail-pane 逻辑不动。 */
  function startStockPreload(): void {
    // no-op：service loop 启动后持续收集持仓股涨跌（collectMissingStocks）
  }

  /** 触发持仓股票实时涨跌取数（占位 no-op）。
   *  旧项目由详情页触发；新项目改为启动时由 em-realtime service loop 持续取数。 */
  function startRealtimeEstimate(): void {
    // no-op：em-realtime service loop 启动后持续刷新实时涨跌
  }

  /**
   * 刷新所有基金估值（UI 手动刷新 + 定时刷新用）。
   * 口径：确认值优先只升级不降级（防闪烁）、T+2 保留推算值、保留 realtime 字段、
   * T+1 防 fundgz 失败归零、更新盘中分时、写缓存、触发持仓 syncYesterdayAmounts/replayGappedHoldings。
   */
  async function refreshAllValuations(): Promise<void> {
    if (refreshStatus.value === RefreshStatus.Loading) return
    if (fundCodes.value.length === 0) return

    refreshStatus.value = RefreshStatus.Loading
    try {
      const result = await batchGetValuation(fundCodes.value, getFundType)
      const refreshedCodes = new Set(result.keys())
      const intradayUpdates: Record<string, IntradayPoint[]> = {}

      for (const [code, valuation] of result) {
        const existing = valuationMap.value.get(code)
        // 已有确认值，新值反而是估算 → 继承确认状态字段、保留盘中 gz/gztime 供走势图重算
        //   （不论 T+1/T+2，已确认最高优：不被盘中估算覆盖 isEstimated/confirmedGszzl/gszzl/jzrq）。
        //   不用 continue：需放行走势图重算(596-615)，否则已确认基金盘中分时不更新。
        if (existing && !existing.isEstimated && valuation.isEstimated) {
          valuation.isEstimated = false
          valuation.confirmedGszzl = existing.confirmedGszzl
          valuation.jzrq = existing.jzrq
          valuation.gszzl = existing.gszzl   // 今日涨跌维持确认值，不被盘中估算覆盖
          valuation.gz = existing.gz
          if (intradayMap.value[code]) intradayMap.value = { ...intradayMap.value, [code]: [] }
        }
        // T+2 未确认：保留已有推算值防闪烁归零
        if (valuation.delayDays === 2 && valuation.isEstimated) {
          const estGszzl = estimatedGszzlMap.value.get(code)
          if (existing && existing.gszzl !== 0) {
            valuation.gszzl = existing.gszzl
            valuation.gz = existing.gz
          } else if (estGszzl != null) {
            valuation.gszzl = estGszzl
            if (valuation.dwjz > 0) valuation.gz = valuation.dwjz * (1 + estGszzl / 100)
          } else {
            valuation.gszzl = 0
            valuation.gz = 0
          }
        }
        // 保留 realtime 字段（防主刷新抹掉 loop 写入的实时/预测值）。T+1/T+2 均需保留：
        // batchGetValuation 结果不带 realtime 字段，不加宽门控会盘中抹掉 T+1 预测胶囊。
        if (existing && existing.realtimeGszzl != null) {
          valuation.realtimeGszzl = existing.realtimeGszzl
          valuation.realtimeSource = existing.realtimeSource
          valuation.realtimeUpdatedAt = existing.realtimeUpdatedAt
        }
        // T+1 防闪烁：fundgz 失败合成值不覆盖已有非零估算
        if (valuation.delayDays !== 2 && valuation.isEstimated && !valuation.gztime
            && valuation.gszzl === 0 && existing?.isEstimated) {
          const existingDate = existing.gztime?.substring(0, 10) || ''
          if (existingDate === getTodayStr() && existing.gszzl !== 0) {
            valuation.gszzl = existing.gszzl
            valuation.gz = existing.gz
            valuation.gztime = existing.gztime
          }
        }
        valuationMap.value.set(code, valuation)
        // T+2 水平线走势重新生成
        if (valuation.delayDays === 2 || (valuation.delayDays == null && valuation.gztime && !valuation.gztime.includes(':'))) {
          const points = generateIntradayPoints(valuation, intradayMap.value[code] || [])
          if (points) intradayUpdates[code] = points
          continue
        }
        // T+1 追加当前估值点
        if (valuation.gz > 0 && valuation.gztime) {
          const timePart = valuation.gztime.includes(' ')
            ? valuation.gztime.split(' ')[1]?.substring(0, 5) ?? ''
            : ''
          if (timePart) {
            const ex = intradayMap.value[code] || []
            const lastPoint = ex[ex.length - 1]
            if (lastPoint && lastPoint.time === timePart) {
              intradayUpdates[code] = [...ex.slice(0, -1), { time: timePart, value: valuation.gz }]
            } else {
              intradayUpdates[code] = [...ex, { time: timePart, value: valuation.gz }]
            }
          }
        }
      }
      for (const [code, points] of Object.entries(intradayUpdates)) {
        intradayMap.value[code] = points
      }
      if (Object.keys(intradayUpdates).length > 0) persistIntradayMap()
      // 清理未刷新成功的过期估值（已确认基金跳过——已确认最高优，不被刷新失败回退为估算；全部失败则保留，不归零）
      const today = getTodayStr()
      if (refreshedCodes.size > 0) {
        for (const [code, v] of valuationMap.value) {
          if (!refreshedCodes.has(code) && v.isEstimated !== false) {
            const gzDate = v.gztime?.substring(0, 10) || ''
            const jzrq = v.jzrq || ''
            if (gzDate && gzDate !== today && jzrq !== today) {
              v.isEstimated = true
              v.gszzl = 0
              v.gz = 0
            }
          }
        }
      }
      refreshStatus.value = RefreshStatus.Success
      lastRefreshTime.value = Date.now()
      // lastRefreshDate 统一用美股基准日（getBaseDay），与 clearCrossDayCaches 一致——
      // 跨日判定（use-cross-day）以美股 lastClosedDay 为准，三者口径必须相同，否则北京凌晨段误判。
      lastRefreshDate.value = getBaseDay()

      // 写缓存（下次启动预热）
      const cacheStore = useCacheStore()
      const caches: FundCache[] = []
      for (const [code, valuation] of result) {
        const existingCache = cacheStore.getCache(code)
        // 多源填充名称：估值接口拿到的非占位名写回 fundNameMap（fundgz 成功才有真名）
        const realName = stripPlaceholderName(valuation.name, code)
        if (realName) setFundName(code, realName)
        caches.push({
          fundCode: code,
          fundName: realName || existingCache?.fundName || getFundName(code),
          valuation,
          info: existingCache?.info ?? null,
          cachedAt: Date.now(),
          cachedDate: today,
        })
      }
      cacheStore.saveBatchCache(caches)

      // 持仓累计盈亏同步（确认净值推进 + 漏日回放）
      const holdingStore = useHoldingStore()
      // executePendingActions 内部调 fetchFundNetValueRange（走全局串行 apidata 队列），
      // 不能 await：会阻塞 refreshAllValuations 完成、卡住 Loading 态，导致后续定时刷新全被挡。
      // 改异步不阻塞，与 syncYesterdayAmounts 解耦——executePendingActions 改持仓后下次刷新再同步。
      void holdingStore.executePendingActions(valuationMap.value).catch(() => { /* 静默 */ })
      holdingStore.syncYesterdayAmounts(valuationMap.value)
      void holdingStore.replayGappedHoldings(valuationMap.value).catch(() => { /* 静默 */ })

      // T+2 推算 + 实时预估交给已启动的 service loop（bootstrap 已启动则自动跑）
      // 若 loop 未启动，UI 刷新后 T+2 gszzl 暂为推算值，loop 启动后补全
    } catch {
      refreshStatus.value = RefreshStatus.Failed
    }
  }

  // ===== 跨日清理 =====

  /** 清空已过期的实时缓存（手机端后台冻结→次日恢复用）。
   *  手机端切后台时定时器冻结，回到前台时若 A股交易日已变（跨日），
   *  内存 stockRealtimeCache 仍带昨日 stale 值，loop 重拉前会显示异常。
   *  本方法：比对"上次落盘的实时缓存交易日"与"当前 A股交易日"，不一致则清空内存实时缓存
   *  （+清 localStorage），让 service loop 回到前台后全量重拉。仅在跨日时清，同日不清（避免抹掉当日数据）。
   *  幂等：已空时无副作用。
   *
   *  按市场分片过期：realtime 缓存混存 A/HK/US/海外，各市场交易日不同步。从后台恢复时逐条按其
   *  所属市场当前交易日校验，丢弃旧交易日条目、保留仍有效条目（如美股周五实时在北京周六仍有效）。
   *  不再用单一 A 股口径全清——否则会把有效的非同步市场实时数据一起误删。 */
  function expireStaleRealtimeCache(): void {
    const cur = stockRealtimeCache.value
    if (cur.size === 0) return
    const kept = new Map<string, StockQuoteInfo>()
    let changed = false
    for (const [code, info] of cur) {
      if (!info || !realtimeEntryStillValid(info)) { changed = true; continue }
      kept.set(code, info)
    }
    if (changed) {
      stockRealtimeCache.value = kept
      if (kept.size === 0) {
        removeKey(STORAGE_KEYS.STOCK_REALTIME_CACHE)
        removeKey(STORAGE_KEYS.STOCK_REALTIME_DATE)
      } else {
        persistStockRealtimeCache()
      }
    }
  }

  /** 跨日清理：清空双全局缓存+持仓缓存（让 loop 全量重拉），重置 lastRefreshDate */
  function clearCrossDayCaches(): void {
    stockPrevDayCache.value = new Map()
    stockRealtimeCache.value = new Map()
    estimatedHoldingsCache.value = new Map()
    t1HoldingsCache.value = new Map()
    estimatedGszzlMap.value = new Map()
    intradayMap.value = {}
    lastRefreshDate.value = getBaseDay()
  }

  /** 清空与缓存相关的内存状态（不重置 lastRefreshDate，不触发跨日重建）。
   *  供设置页"清除缓存数据"调用：删 localStorage 键后同步清内存，
   *  避免刷新前的 300ms 窗口期内后台 loop 把已删数据 merge 回内存再被兜底落盘。 */
  function clearCacheDataInMemory(): void {
    stockPrevDayCache.value = new Map()
    stockRealtimeCache.value = new Map()
    estimatedHoldingsCache.value = new Map()
    t1HoldingsCache.value = new Map()
    estimatedGszzlMap.value = new Map()
    intradayMap.value = {}
    fundNameMap.value = {}
    valuationMap.value = new Map()
  }

  // ===== UI 方法 =====

  /** 设置排序（同字段点击切换方向，不同字段切默认方向） */
  function setSort(field: SortField, direction?: SortDirection): void {
    if (sortField.value === field && !direction) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortField.value = field
      sortDirection.value = direction ?? 'asc'
    }
  }

  /** 更新单个基金的盘中分时数据（估值刷新后调） */
  function updateIntradayPoints(code: string, valuation: FundValuation): void {
    const points = generateIntradayPoints(valuation, intradayMap.value[code] ?? [])
    if (points) {
      intradayMap.value = { ...intradayMap.value, [code]: points }
      persistIntradayMap()
    }
  }

  /** 批量拉取 T+1 基金新浪完整日走势，合并历史+实时点（卡片缩略图用）。
   *  T+2 用 generateIntradayPoints 合成水平线走势，不依赖新浪分时，跳过以降低首屏并发。
   *  实时点（来自 fundgz）覆盖历史点（更可靠）。 */
  async function fetchIntradayHistory(): Promise<void> {
    if (fundCodes.value.length === 0) return
    const updates: Record<string, IntradayPoint[]> = {}
    let hasUpdate = false
    const BATCH = INTRADAY_CONFIG.FETCH_BATCH
    for (let i = 0; i < fundCodes.value.length; i += BATCH) {
      const batch = fundCodes.value.slice(i, i + BATCH)
      const results = await Promise.allSettled(batch.map(code => fetchIntradayEstimate(code)))
      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        if (r.status !== 'fulfilled' || !r.value.length) continue
        const code = batch[j]
        // T+2 跳过：用 generateIntradayPoints 合成水平线，不依赖新浪分时
        const v0 = valuationMap.value.get(code)
        if (v0 && (v0.delayDays === 2 || (v0.delayDays == null && v0.gztime && !v0.gztime.includes(':')))) continue
        // 合并：先放历史，再用已有实时点覆盖
        const merged = new Map<string, number>()
        for (const p of r.value) merged.set(p.time, p.value)
        for (const p of (intradayMap.value[code] || [])) merged.set(p.time, p.value)
        updates[code] = Array.from(merged.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([time, value]) => ({ time, value }))
        hasUpdate = true
      }
    }
    if (hasUpdate) {
      intradayMap.value = { ...intradayMap.value, ...updates }
      persistIntradayMap()
    }
  }

  /** 从缓存预热估值数据 - 启动时先填充，再异步刷新更新。
   *  T+2 未确认基金用缓存的推算 gszzl 覆盖，避免首屏显示 0。仅今日缓存。 */
  function seedFromCache(cacheMap: Map<string, FundCache>): void {
    const today = getTodayStr()
    for (const [code, cache] of cacheMap) {
      if (!cache.valuation || !fundCodes.value.includes(code)) continue
      if (cache.cachedDate !== today) continue
      // T+2 未确认：用缓存的推算 gszzl 覆盖
      if (cache.valuation.delayDays === 2 && cache.valuation.isEstimated) {
        const estGszzl = estimatedGszzlMap.value.get(code)
        if (estGszzl != null) {
          cache.valuation.gszzl = estGszzl
          if (cache.valuation.dwjz > 0) cache.valuation.gz = cache.valuation.dwjz * (1 + estGszzl / 100)
        }
      }
      valuationMap.value.set(code, cache.valuation)
    }
  }

  /** 保存列配置（持久化） */
  function saveColumnConfig(columns: ColumnConfig[]): void {
    columnConfig.value = columns
    saveJSON(STORAGE_KEYS.COLUMN_CONFIG, columns)
  }

  /** 从 localStorage 恢复列配置 */
  function restoreColumnConfig(): void {
    const saved = loadJSON<ColumnConfig[] | null>(STORAGE_KEYS.COLUMN_CONFIG, null)
    if (Array.isArray(saved) && saved.length > 0) {
      columnConfig.value = saved
    }
  }

  // ===== LRU =====
  function lruSet<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number): void {
    if (map.has(key)) {
      map.delete(key)
    } else if (map.size >= maxSize) {
      const firstKey = map.keys().next().value
      if (firstKey !== undefined) map.delete(firstKey)
    }
    map.set(key, value)
  }

  /** 列配置初始化（从 DEFAULT_SETTINGS.VISIBLE_COLUMNS 构建） */
  function initColumnConfig(): ColumnConfig[] {
    return DEFAULT_SETTINGS.VISIBLE_COLUMNS.map(key => ({
      key, title: key, width: 120, sortable: true, visible: true,
    }))
  }

  return {
    // 状态
    fundCodes, fundNameMap, valuationMap, estimatedGszzlMap, stockPrevDayCache, stockRealtimeCache,
    t1HoldingsCache, estimatedHoldingsCache, intradayMap, refreshStatus,
    lastRefreshTime, lastRefreshDate, viewMode, sortField, sortDirection, columnConfig,
    t2HintPending,
    // 计算属性
    isLoading, fundCount,
    // 读取
    getValuation, getFundName, resolveFundName,
    // 增删
    addFund, removeFund, batchAddFunds, setFundName,
    // 持久化
    restoreFundCodes, restoreFundNames, persistFundCodes, restoreStockCaches,
    persistStockPrevDayCache, persistStockRealtimeCache, restoreIntradayMap,
    // merge/recompute
    mergeStockQuotesToCache, mergeRealtimeToCache, recomputeFundsForStocks,
    // 持仓取数
    getEstimatedHoldings, getT1Holdings, setT1Holdings,
    // 收集（供 service）
    collectMissingStocks, collectOverseasAll, collectAHkAll,
    // 跨日
    clearCrossDayCaches, clearCacheDataInMemory, expireStaleRealtimeCache,
    // UI 方法
    setSort, updateIntradayPoints, fetchIntradayHistory, seedFromCache, saveColumnConfig, restoreColumnConfig,
    fetchValuation, refreshAllValuations,
    startStockPreload, startRealtimeEstimate,
  }
})
