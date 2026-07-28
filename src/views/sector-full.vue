<template>
  <div class="sector-full-page">
    <!-- 顶部市场切换：场内 / 场外（横向滑动胶囊） -->
    <nav class="market-switcher" ref="marketSwitcherRef">
      <span class="market-indicator" :style="marketIndicatorStyle"></span>
      <button
        v-for="m in MARKETS"
        :key="m.key"
        :ref="el => setMarketRef(el, m.key)"
        :class="['market-pill', { active: market === m.key }]"
        @click="switchMarket(m.key)"
      >
        {{ m.label }}
      </button>
    </nav>

    <!-- 二级维度切换：今日涨幅 / 资金流向 / 成交额 等（横向滑动胶囊） -->
    <nav class="metric-switcher" ref="metricSwitcherRef">
      <span class="metric-indicator" :style="metricIndicatorStyle"></span>
      <button
        v-for="mt in currentMetrics"
        :key="mt.key"
        :ref="el => setMetricRef(el, mt.key)"
        :class="['metric-pill', { active: metric === mt.key }]"
        @click="switchMetric(mt.key)"
      >
        <span class="metric-emoji">{{ mt.emoji }}</span>
        {{ mt.label }}
      </button>
    </nav>

    <!-- 统一功能区：右(刷新) -->
    <header class="toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">{{ currentMetric.label }}</span>
        <span class="toolbar-sub">{{ currentMarketLabel }}</span>
      </div>
      <button class="btn-refresh" :class="{ spinning: refreshing }" @click="manualRefresh" :disabled="refreshing" :title="`刷新${currentMetric.label}`">
        <svg class="refresh-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        <span class="countdown-text">{{ countdown }}s</span>
      </button>
    </header>

    <!-- 失败提示横幅：取数失败时保留旧数据并提示，不空屏 -->
    <div v-if="errorTip" class="error-banner">
      <svg class="error-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{{ errorTip }}</span>
    </div>

    <!-- 内容滚动区：上下滑动展示全部榜单 -->
    <div class="sector-body" ref="bodyRef" @scroll.passive="handleScroll">
      <div v-if="loading && rows.length === 0" class="loading-text">加载中...</div>
      <div v-else-if="rows.length === 0 && errorTip" class="empty-text">
        <p>加载失败</p>
        <p class="empty-sub">{{ errorTip }}</p>
      </div>
      <div v-else-if="rows.length === 0" class="empty-text">
        <p>暂无数据</p>
        <p class="empty-sub">{{ currentMarket.hint }}</p>
      </div>
      <div v-else class="rank-list">
        <div
          v-for="(item, idx) in rows"
          :key="item.code"
          class="rank-row"
        >
          <span class="rank-no" :class="topBadge(idx)">{{ idx + 1 }}</span>
          <div class="rank-info">
            <span class="rank-name">{{ item.name }}</span>
            <span class="rank-code font-number">{{ item.code }}</span>
          </div>
          <!-- 维度主数值：随当前 metric 切换展示 -->
          <div class="rank-metric font-number" :class="metricValueClass(item)">
            {{ metricValueText(item) }}
          </div>
          <!-- 资金流向榜时，右侧补涨跌幅辅助列 -->
          <span v-if="currentMetric.valueField === 'flow'" class="rank-rate font-number" :class="rateClass(item.rate)">
            {{ rateText(item.rate) }}
          </span>
        </div>
      </div>
      <!-- 分页状态：加载更多 / 没有更多 -->
      <div v-if="rows.length > 0" class="load-more">
        <span v-if="loadingMore" class="load-more-text">加载中...</span>
        <span v-else-if="!hasMore" class="load-more-text">已展示全部（{{ rows.length }}/{{ MAX_ROWS }}）</span>
        <span v-else class="load-more-hint">上滑加载更多 · {{ rows.length }}/{{ MAX_ROWS }}</span>
      </div>
      <div class="bottom-spacer"></div>
    </div>

    <!-- 回到顶部 -->
    <button v-show="showBackTop" class="back-to-top" @click="scrollToTop" title="回到顶部">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
// 板块页 - 每日热门基金
//   两级胶囊切换：
//     顶层 市场（场内 / 场外）
//       场内：ETF clist 实时榜（涨幅榜 fid=f3 / 资金流向 fid=f62 / 成交额 fid=f6）
//       场外：开放式基金 rankhandler（被东财 Referer 拦截，当前降级为空态+提示）
//   纯展示榜单，不可点开详情（不跳持仓/详情页）。
defineOptions({ name: 'SectorFull' })

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { API_URLS, STORAGE_KEYS } from '@/config/constants'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'
import { useSettingsStore } from '@/modules/settings/settings-store'

const settingsStore = useSettingsStore()

// ===== 市场 / 维度配置 =====
type MarketKey = 'onboard' | 'offboard'  // 场内 / 场外
// 维度：涨幅(po=1, fid=f3) / 跌幅(po=0, fid=f3) / 流入(po=1, fid=f62) / 流出(po=0, fid=f62)
type MetricKey = 'gainers' | 'losers' | 'inflow' | 'outflow'

interface MetricDef {
  key: MetricKey
  label: string
  emoji: string
  fid: string   // 排序字段：f3 涨跌幅 / f62 主力净流入
  po: string   // 排序方向：1 降序 / 0 升序
  /** 主数值取哪个字段：rate 涨跌幅 / flow 主力净流入 */
  valueField: 'rate' | 'flow'
}
interface MarketDef { key: MarketKey; label: string; hint: string }

const MARKETS: MarketDef[] = [
  { key: 'onboard', label: '场内', hint: '场内 ETF 实时榜' },
  // { key: 'offboard', label: '场外', hint: '场外开放式基金排行接口（rankhandler）被东财 Referer 校验拦截，跨域取不到，待后续接入' },
  { key: 'offboard', label: '场外', hint: '' },
]
const ONBOARD_METRICS: MetricDef[] = [
  { key: 'gainers', label: '今日涨幅', emoji: '📈', fid: 'f3', po: '1', valueField: 'rate' },
  { key: 'losers', label: '今日跌幅', emoji: '📉', fid: 'f3', po: '0', valueField: 'rate' },
  { key: 'inflow', label: '资金流入', emoji: '💰', fid: 'f62', po: '1', valueField: 'flow' },
  { key: 'outflow', label: '资金流出', emoji: '💸', fid: 'f62', po: '0', valueField: 'flow' },
]

const market = ref<MarketKey>(loadMarket())
const metric = ref<MetricKey>(loadMetric())
const currentMetrics = computed<MetricDef[]>(() => ONBOARD_METRICS)
const currentMetric = computed<MetricDef>(() =>
  ONBOARD_METRICS.find(m => m.key === metric.value) ?? ONBOARD_METRICS[0])
const currentMarket = computed<MarketDef>(() =>
  MARKETS.find(m => m.key === market.value) ?? MARKETS[0])
const currentMarketLabel = computed(() => currentMarket.value.label)

function loadMarket(): MarketKey {
  const raw = localStorage.getItem(STORAGE_KEYS.SECTOR_MARKET)
  return raw === 'offboard' ? 'offboard' : 'onboard'
}
function loadMetric(): MetricKey {
  const raw = localStorage.getItem(STORAGE_KEYS.SECTOR_METRIC)
  if (raw === 'losers' || raw === 'inflow' || raw === 'outflow') return raw
  return 'gainers'
}
function switchMarket(m: MarketKey): void {
  if (market.value === m) return
  market.value = m
  localStorage.setItem(STORAGE_KEYS.SECTOR_MARKET, m)
  nextTick(() => { updateMarketIndicator(); updateMetricIndicator() })
}
function switchMetric(m: MetricKey): void {
  if (metric.value === m) return
  metric.value = m
  localStorage.setItem(STORAGE_KEYS.SECTOR_METRIC, m)
  nextTick(updateMetricIndicator)
}

// ===== 胶囊滑块指示器（测量激活按钮位置/宽度，平滑滑动） =====
const marketSwitcherRef = ref<HTMLElement | null>(null)
const metricSwitcherRef = ref<HTMLElement | null>(null)
const marketRefs: Record<string, HTMLElement> = {}
const metricRefs: Record<string, HTMLElement> = {}
const marketIndicator = ref({ x: 0, w: 0 })
const metricIndicator = ref({ x: 0, w: 0 })
const marketIndicatorStyle = computed(() => ({
  transform: `translateX(${marketIndicator.value.x}px)`,
  width: `${marketIndicator.value.w}px`,
}))
const metricIndicatorStyle = computed(() => ({
  transform: `translateX(${metricIndicator.value.x}px)`,
  width: `${metricIndicator.value.w}px`,
}))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setMarketRef(el: any, key: MarketKey): void { if (el instanceof HTMLElement) marketRefs[key] = el }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setMetricRef(el: any, key: MetricKey): void { if (el instanceof HTMLElement) metricRefs[key] = el }
function updateMarketIndicator(): void {
  const el = marketRefs[market.value]
  if (el) marketIndicator.value = { x: el.offsetLeft, w: el.offsetWidth }
}
function updateMetricIndicator(): void {
  const el = metricRefs[metric.value]
  if (el) metricIndicator.value = { x: el.offsetLeft, w: el.offsetWidth }
}

// ===== 数据 =====
interface EtfRow {
  code: string
  name: string
  rate: number       // 涨跌幅 % (f3)
  turnover: number   // 成交额 (f6)
  inflow: number     // 主力净流入 (f62)
}
interface ClistRaw {
  f3: number | null
  f6: number | null
  f12: string
  f14: string
  f62: number | null
}
interface ClistResp { data?: { diff?: ClistRaw[] } }

const rows = ref<EtfRow[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)   // 是否还有更多（未达 100 上限）
const refreshing = ref(false)
const countdown = ref(settingsStore.sectorRefreshInterval)
const showBackTop = ref(false)
const bodyRef = ref<HTMLElement | null>(null)
/** 取数失败提示（空串=正常）。失败时保留旧榜单，不清空 */
const errorTip = ref('')
/** 连续失败计数：达 FAIL_PAUSE 阈值后暂停定时刷新，避免持续撞被封的东财 push2 延长封禁 */
let failStreak = 0

/** 分页：首屏 20 条，下滑加载更多，上限 500 条
 *  不加载就不占资源（按需分页），500 条覆盖全市场 ETF 近全部 */
const PAGE_SIZE = 20
const MAX_ROWS = 500
/** 连续失败 N 次后暂停自动刷新（东财封 IP 时不再每 60s 撞一次） */
const FAIL_PAUSE = 3

let refreshTimer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
let scrollTimer: number | null = null

/** 拉取场内 ETF 榜单（clist）。fid 排序字段，po 方向，page 页码，pz 每页条数
 *  fs：东财 5 个 ETF 板块码全覆盖（沪市/深市 ETF 等），单写 b:MK0021 只覆盖部分品种，
 *      部分时段返回空 diff → 榜单"暂无数据"。参照 akshare fund_etf_spot_em / 东财 gridlist#fund_etf。
 *  ut：东财 clist 鉴权 token，缺失会被部分网关判为非法请求返回空。
 *  返回 { ok, rows }：ok=false 表示取数失败（限流/封IP/网络），调用方据此保留旧数据。 */
interface FetchResult { ok: boolean; rows: EtfRow[] }
async function fetchOnboardRank(fid: string, po: string, page: number, pz: number): Promise<FetchResult> {
  const cb = genCallbackName('sector')
  const fs = 'b:MK0021,b:MK0022,b:MK0023,b:MK0024,b:MK0827'
  const ut = 'bd1d9ddb04089700cf9c27f6f7426281'
  const url = `${API_URLS.SECTOR_RANK}?pn=${page}&pz=${pz}&po=${po}&np=1&ut=${ut}&fltt=2&invt=2&fs=${fs}&fields=f2,f3,f6,f12,f14,f62&fid=${fid}&cb=${cb}`
  try {
    const resp = await jsonpRequest<ClistResp>(url, cb)
    const diff = resp?.data?.diff
    // data.diff 缺失 = 东财风控空响应（被封IP常见）；空数组 = 该板块确实无数据
    if (!diff) return { ok: false, rows: [] }
    return {
      ok: true,
      rows: diff.map(d => ({
        code: d.f12 ?? '',
        name: d.f14 ?? d.f12 ?? '',
        rate: d.f3 ?? 0,
        turnover: d.f6 ?? 0,
        inflow: d.f62 ?? 0,
      })).filter(r => r.code),
    }
  } catch {
    // JSONP 超时/onerror = 取数失败（封IP/限流/网络断），不算"无数据"
    return { ok: false, rows: [] }
  }
}

async function refreshRanks(): Promise<void> {
  // 场外：rankhandler 被 Referer 拦截，暂无数据
  if (market.value === 'offboard') {
    rows.value = []
    hasMore.value = false
    errorTip.value = ''
    failStreak = 0
    return
  }
  const def = currentMetric.value
  loading.value = true
  // 切维度/市场/手动刷新：回到第 1 页
  const { ok, rows: data } = await fetchOnboardRank(def.fid, def.po, 1, PAGE_SIZE)
  loading.value = false
  if (!ok) {
    // 取数失败：保留旧榜单不清空，提示失败；连续失败达阈值则暂停定时刷新
    failStreak++
    errorTip.value = rows.value.length > 0
      ? '刷新失败，展示旧数据（东财接口可能限流/封IP）'
      : '加载失败，东财接口可能限流或封IP，稍后重试'
    if (failStreak >= FAIL_PAUSE) {
      stopTimers()
      errorTip.value = `连续 ${failStreak} 次刷新失败，已暂停自动刷新（东财接口限流/封IP）`
    }
    return
  }
  // 成功：清失败计数与提示
  failStreak = 0
  errorTip.value = ''
  rows.value = data
  hasMore.value = data.length === PAGE_SIZE && data.length < MAX_ROWS
  // 若之前因连续失败停了定时器，恢复成功后重启（仅当用户开着自动刷新）
  if (!refreshTimer && settingsStore.sectorAutoRefresh) startTimers()
}

/** 下滑加载更多：取下一页，追加到 rows，达 100 条上限或不足一页则停 */
async function loadMore(): Promise<void> {
  if (loadingMore.value || loading.value || !hasMore.value) return
  const def = currentMetric.value
  const nextPage = Math.floor(rows.value.length / PAGE_SIZE) + 1
  loadingMore.value = true
  const { ok, rows: data } = await fetchOnboardRank(def.fid, def.po, nextPage, PAGE_SIZE)
  loadingMore.value = false
  if (!ok) {
    // 加载更多失败：不追加，提示，但不影响已有榜单
    errorTip.value = '加载更多失败，稍后重试'
    return
  }
  errorTip.value = ''
  if (data.length > 0) {
    // 去重（避免接口返回重叠）
    const seen = new Set(rows.value.map(r => r.code))
    rows.value.push(...data.filter(r => !seen.has(r.code)))
  }
  // 不足一页 或 已达上限 → 没有更多
  hasMore.value = data.length === PAGE_SIZE && rows.value.length < MAX_ROWS
}

// ===== 定时器 =====
function startCountdown(): void {
  if (countdownTimer) return
  countdown.value = settingsStore.sectorRefreshInterval
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) countdown.value = settingsStore.sectorRefreshInterval
  }, 1000)
}
function stopCountdown(): void {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
}
function startTimers(): void {
  stopTimers()
  if (!settingsStore.sectorAutoRefresh) return
  startCountdown()
  const interval = settingsStore.sectorRefreshInterval * 1000
  refreshTimer = setInterval(() => {
    void refreshRanks()
    countdown.value = settingsStore.sectorRefreshInterval
  }, interval)
}
function stopTimers(): void {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  stopCountdown()
}
async function manualRefresh(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await refreshRanks()
    // 成功（errorTip 清空）才重置倒计时；失败时保留提示、不假装计时
    if (!errorTip.value) countdown.value = settingsStore.sectorRefreshInterval
  } finally {
    refreshing.value = false
  }
}

// ===== 滚动 =====
function handleScroll(): void {
  if (scrollTimer) cancelAnimationFrame(scrollTimer)
  scrollTimer = requestAnimationFrame(() => {
    const el = bodyRef.value
    if (!el) return
    showBackTop.value = el.scrollTop > 400
    // 距底部 < 120px 触发加载更多
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      void loadMore()
    }
  })
}
function scrollToTop(): void {
  bodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// ===== 展示格式化 =====
function rateClass(rate: number): string {
  return rate > 0 ? 'text-rise' : rate < 0 ? 'text-fall' : 'text-flat'
}
function rateText(rate: number): string {
  if (!Number.isFinite(rate)) return '--'
  return `${rate > 0 ? '+' : ''}${rate.toFixed(2)}%`
}
function amountClass(v: number): string {
  return v > 0 ? 'text-rise' : v < 0 ? 'text-fall' : 'text-flat'
}
/** 主力净流入：亿元/万元，带正负号 */
function flowText(v: number): string {
  if (!Number.isFinite(v)) return '--'
  const sign = v > 0 ? '+' : ''
  const abs = Math.abs(v)
  if (abs >= 1e8) return `${sign}${(v / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${sign}${(v / 1e4).toFixed(2)}万`
  return `${sign}${v.toFixed(0)}`
}
/** 当前维度主数值文本（按 valueField 取 涨跌幅 / 主力净流入） */
function metricValueText(item: EtfRow): string {
  return currentMetric.value.valueField === 'rate' ? rateText(item.rate) : flowText(item.inflow)
}
function metricValueClass(item: EtfRow): string {
  return currentMetric.value.valueField === 'rate' ? rateClass(item.rate) : amountClass(item.inflow)
}
function topBadge(idx: number): string {
  if (idx === 0) return 'no-top1'
  if (idx === 1) return 'no-top2'
  if (idx === 2) return 'no-top3'
  return ''
}

// ===== 生命周期 =====
watch(market, () => { void refreshRanks() })
watch(metric, () => { void refreshRanks() })
watch(() => settingsStore.sectorAutoRefresh, () => { startTimers() })
watch(() => settingsStore.sectorRefreshInterval, () => { startTimers() })

onMounted(() => {
  nextTick(() => { updateMarketIndicator(); updateMetricIndicator() })
  window.addEventListener('resize', onResize)
  void refreshRanks()
  startTimers()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  stopTimers()
})
function onResize(): void { updateMarketIndicator(); updateMetricIndicator() }
</script>

<style scoped>
.sector-full-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: var(--spacing-sm);
}

/* ===== 顶层层级胶囊切换器（场内/场外） ===== */
.market-switcher {
  position: relative;
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  padding: 4px;
  background: var(--bg-surface);
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
}
.market-indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 0;
}
.market-pill {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-sm);
  font-weight: 500;
  border-radius: var(--radius-full);
  transition: color var(--transition-fast);
  white-space: nowrap;
}
.market-pill.active { color: #fff; font-weight: 600; }

/* ===== 二级维度胶囊切换器（涨幅/跌幅/流入/流出，平均分布） ===== */
.metric-switcher {
  position: relative;
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  padding: 4px;
  background: var(--bg-surface);
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
}
.metric-indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  border-radius: var(--radius-full);
  background: var(--bg-card-hover);
  border: 1px solid var(--color-primary-glow);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 0;
}
.metric-pill {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 6px 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-xs);
  font-weight: 500;
  border-radius: var(--radius-full);
  transition: color var(--transition-fast);
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  overflow: hidden;
}
.metric-pill.active { color: var(--color-primary); font-weight: 600; }
.metric-emoji { font-size: var(--font-xs); flex-shrink: 0; }

/* ===== 工具栏（标题 + 刷新） ===== */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  flex-shrink: 0;
  min-height: 40px;
  position: relative;
  z-index: 200;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
}
.toolbar-left {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  min-width: 0;
  flex: 1;
}
.toolbar-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}
.toolbar-sub {
  font-size: var(--font-xs);
  color: var(--text-muted);
}

/* ===== 失败提示横幅 ===== */
.error-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  background: var(--color-fall-glow);
  border: 1px solid var(--color-fall-glow);
  color: var(--color-fall);
  font-size: var(--font-xs);
  line-height: 1.4;
}
.error-icon { flex-shrink: 0; }

/* ===== 内容滚动区 ===== */
.sector-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding-bottom: 80px;
}

/* ===== 榜单行 ===== */
.rank-list {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;   /* 内容自然高度，不被 body flex 压缩；超出由 sector-body 滚动 */
}
.rank-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-bottom: 1px solid var(--border-default);
  transition: background var(--transition-fast);
  flex-shrink: 0;   /* 行不被压缩，保持可读高度 */
  min-height: 40px;
}
.rank-row:last-child { border-bottom: none; }
.rank-row:hover { background: var(--bg-card-hover); }

.rank-no {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-input);
}
.rank-no.no-top1 { background: var(--color-rise); color: #fff; }
.rank-no.no-top2 { background: var(--color-rise-glow); color: var(--color-rise-light); }
.rank-no.no-top3 { background: var(--color-fall-glow); color: var(--color-fall-light); }

.rank-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.rank-name {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.rank-code {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
}

/* 维度主数值（随 metric 切换） */
.rank-metric {
  font-size: var(--font-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 72px;
  text-align: right;
}
/* 涨跌幅辅助列（资金流向/成交额榜时右侧补涨跌幅） */
.rank-rate {
  font-size: var(--font-xs);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 56px;
  text-align: right;
}

/* ===== 刷新按钮 ===== */
.btn-refresh {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-xs);
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.btn-refresh:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-light);
  background: var(--color-primary-glow);
}
.btn-refresh:disabled { opacity: 0.6; cursor: not-allowed; }
.refresh-icon { flex-shrink: 0; transition: transform 0.6s ease; }
.btn-refresh.spinning .refresh-icon { animation: spin 0.8s linear infinite; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.countdown-text {
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  text-align: right;
}

/* ===== 状态文字 ===== */
.loading-text,
.empty-text {
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}
.empty-sub {
  font-size: var(--font-xs);
  color: var(--text-muted);
  opacity: 0.7;
  line-height: 1.5;
  padding: 0 var(--spacing-md);
}

.bottom-spacer { height: 80px; }

/* 分页状态指示 */
.load-more {
  text-align: center;
  padding: var(--spacing-sm);
}
.load-more-text {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
.load-more-hint {
  font-size: var(--font-xs);
  color: var(--text-muted);
  opacity: 0.7;
}

/* ===== 涨跌色 ===== */
.text-rise { color: var(--color-rise); }
.text-fall { color: var(--color-fall); }
.text-flat { color: var(--text-muted); }
.text-secondary { color: var(--text-secondary); }

/* ===== 回到顶部 ===== */
.back-to-top {
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: all 0.3s ease;
  animation: fade-in-up 0.3s ease;
}
.back-to-top:hover {
  background: var(--bg-card-hover);
  border-color: var(--color-primary);
  color: var(--color-primary-light);
  transform: translateY(-2px);
}
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: 767px) {
  .back-to-top { bottom: 70px; right: 12px; width: 36px; height: 36px; }
}
</style>
