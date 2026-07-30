<template>
  <div class="stock-full-page">
    <!-- 统一功能区：左(搜索+数量) 右(刷新)，与资讯页 toolbar 同布局，切换不跳动 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <div class="search-box" :class="{ expanded: showAddStock }">
          <input
            ref="stockInputRef"
            v-model="stockInput"
            class="stock-input-inline"
            placeholder="搜索添加股票..."
            @keydown="onSearchKeydown"
            @focus="expandSearch"
            @blur="onSearchBlur"
          />
          <button class="btn-icon search-trigger" :class="{ active: showAddStock }" @click.stop="toggleAddStock" title="添加股票">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <!-- 搜索建议下拉 -->
          <div v-if="showDropdown" class="search-dropdown">
            <div v-if="searching" class="dropdown-status">搜索中...</div>
            <template v-else-if="searchResults.length > 0">
              <div
                v-for="(item, idx) in searchResults"
                :key="item.code"
                :class="['search-result-item', { highlighted: idx === searchHighlight }]"
                @mousedown.prevent="selectSearchResult(item)"
                @mouseenter="searchHighlight = idx"
              >
                <span class="sr-name">{{ item.name }}</span>
                <span class="sr-code">{{ item.code }}</span>
                <span class="sr-market">{{ item.market }}</span>
              </div>
            </template>
            <div v-else class="dropdown-status">未找到匹配股票</div>
          </div>
        </div>
        <span v-if="stockStore.watchlist.length > 0" class="item-count">{{ stockStore.watchlist.length }}</span>
      </div>
      <button class="btn-refresh" :class="{ spinning: refreshing }" @click="manualRefresh" :disabled="refreshing" title="刷新行情">
        <svg class="refresh-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        <span class="countdown-text">{{ countdown }}s</span>
      </button>
    </header>

    <!-- 内容滚动区 -->
    <div class="market-body" ref="marketBodyRef">

    <!-- 自选关注：直接显示卡片 -->
    <section class="watchlist-panel">
      <span v-if="addError" class="add-error">{{ addError }}</span>
      <div v-if="stockStore.loading && stockStore.watchlist.length === 0" class="loading-text">
        加载中...
      </div>
      <div v-else-if="stockStore.watchlist.length === 0 && !showAddStock" class="empty-text">
        点击 + 添加自选股票
      </div>
      <div v-else class="watchlist-grid">
        <div
          v-for="item in sortedWatchlist"
          :key="item.code"
          :class="['watchlist-card', watchTint(item)]"
        >
          <div class="card-main">
            <div class="card-row">
              <span class="s-name">{{ item.name }}</span>
              <button class="btn-remove" @click.stop="stockStore.removeFromWatchlist(item.code)" title="移除自选">×</button>
            </div>
            <div class="card-row">
              <span class="s-code font-number">{{ item.code }}</span>
              <span v-if="item.price > 0" :class="['s-rate', 'font-number', watchRate(item)]">
                {{ item.changeRate >= 0 ? '+' : '' }}{{ item.changeRate.toFixed(2) }}%
              </span>
              <span v-else class="s-rate text-muted">--</span>
            </div>
            <div class="card-price-row">
              <span class="s-price font-number">{{ item.price > 0 ? item.price.toFixed(2) : '--' }}</span>
              <span v-if="item.price > 0 && item.changeAmount" :class="['s-amount', 'font-number', watchRate(item)]">
                {{ item.changeAmount >= 0 ? '+' : '' }}{{ item.changeAmount.toFixed(2) }}
              </span>
            </div>
          </div>
          <!-- 行情扩展：今开/最高/最低 + 成交额/换手率/市盈率/市净率（海外股兜底无数据 → --） -->
          <div class="card-stats">
            <div class="stat-cell">
              <span class="stat-label">今开</span>
              <span class="stat-value font-number">{{ fmtPrice(item.open) }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">成交额</span>
              <span class="stat-value font-number">{{ fmtTurnover(item.turnover) }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">最高</span>
              <span class="stat-value font-number">{{ fmtPrice(item.high) }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">换手率</span>
              <span class="stat-value font-number">{{ fmtRate(item.turnoverRate) }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">最低</span>
              <span class="stat-value font-number">{{ fmtPrice(item.low) }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">市盈率</span>
              <span class="stat-value font-number">{{ fmtRatio(item.peRatio) }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">市净率</span>
              <span class="stat-value font-number">{{ fmtRatio(item.pbRatio) }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 底部占位 -->
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
// 自选股完整页：行情用 useStockStore(@/modules/stock/stock-store)。
//   store 拆分后 watchlist 仅存 {code, emMarketCode}，行情在 quoteMap（按 code 取）。
//   旧 sortedWatchlist（带行情的排序自选股列表）需在组件内用 computed 重建：
//   遍历 watchlist，映射 quoteMap.get(code)，组合成行数据，按涨跌排序。
defineOptions({ name: 'StockFull' })

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useStockStore } from '@/modules/stock/stock-store'
import { useIndexStore } from '@/modules/index/index-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import { searchStocks } from '@/modules/stock/search/stock-search'
import type { StockSearchItem, StockQuote } from '@/modules/stock/stock-types'
import { formatTurnover } from '@/shared/utils/money-format'

const stockStore = useStockStore()
const indexStore = useIndexStore()
const settingsStore = useSettingsStore()

const showSelector = ref(false) // unused now, kept for compatibility
const showAddStock = ref(true)
const stockInput = ref('')
const stockInputRef = ref<HTMLInputElement | null>(null)
const addingStock = ref(false)
const addError = ref('')
const showBackTop = ref(false)
const refreshing = ref(false)
const countdown = ref(settingsStore.marketRefreshInterval)

// === 搜索建议 ===
const searchResults = ref<StockSearchItem[]>([])
const showDropdown = ref(false)
const searching = ref(false)
const searchHighlight = ref(-1)
let searchTimer: ReturnType<typeof setTimeout> | null = null

let scrollTimer: number | null = null
const marketBodyRef = ref<HTMLElement | null>(null)

/**
 * 自选股行数据（watchlist + quoteMap 组合，按涨跌排序）。
 * 旧版 store 的 sortedWatchlist 已随拆分移除，此处等价重建：
 * 遍历 watchlist 取 quoteMap.get(code) 得行情；无行情则用占位行（price=0 → 卡片显示 --）。
 * 排序：有行情且 changeRate 高者在前；无行情（price<=0）统一沉底，保持顺序稳定。
 */
const sortedWatchlist = computed<StockQuote[]>(() => {
  const rows = stockStore.watchlist.map(entry => {
    const q = stockStore.quoteMap.get(entry.code)
    if (q) return q
    // 占位行：仅 code/name，行情字段归零，卡片展示为 --
    return {
      code: entry.code,
      name: entry.code,
      price: 0,
      changeRate: 0,
      changeAmount: 0,
      emMarketCode: entry.emMarketCode,
    } as StockQuote
  })
  return rows.sort((a, b) => {
    const aValid = a.price > 0
    const bValid = b.price > 0
    if (aValid !== bValid) return aValid ? -1 : 1 // 有行情在前
    return b.changeRate - a.changeRate // 涨幅高在前
  })
})

function handleScroll(): void {
  if (scrollTimer) cancelAnimationFrame(scrollTimer)
  scrollTimer = requestAnimationFrame(() => {
    showBackTop.value = (marketBodyRef.value?.scrollTop ?? 0) > 400
  })
}

function scrollToTop(): void {
  marketBodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function toggleAddStock(): void {
  showAddStock.value = !showAddStock.value
  addError.value = ''
  if (showAddStock.value) {
    nextTick(() => {
      stockInputRef.value?.focus()
    })
  } else {
    stockInput.value = ''
    closeDropdown()
  }
}

function expandSearch(): void {
  if (!showAddStock.value) {
    showAddStock.value = true
  }
}

function onSearchBlur(e: FocusEvent): void {
  // 如果焦点转移到下拉项，不关闭
  const related = e.relatedTarget as HTMLElement | null
  if (related?.closest('.search-dropdown')) return
  // 仅收起搜索建议下拉，搜索框本身保持展开——只有点击 + 才会收起输入框
  setTimeout(() => {
    closeDropdown()
  }, 150)
}

/** 清空搜索输入并收起建议下拉，但保持搜索框展开（仅 + 按钮会收起整个输入框） */
function resetSearchInput(): void {
  stockInput.value = ''
  closeDropdown()
  addError.value = ''
}

// === 搜索建议 ===

function closeDropdown(): void {
  showDropdown.value = false
  searchResults.value = []
  searchHighlight.value = -1
  searching.value = false
}

// 监听输入变化，防抖搜索
watch(stockInput, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  const q = val.trim()
  if (!q) {
    closeDropdown()
    return
  }
  // 立即显示下拉 + 搜索中状态
  showDropdown.value = true
  searching.value = true
  searchResults.value = []
  searchHighlight.value = -1

  searchTimer = setTimeout(async () => {
    try {
      searchResults.value = await searchStocks(q)
      searchHighlight.value = -1
    } catch {
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 200)
})

function onSearchKeydown(e: KeyboardEvent): void {
  if (!showDropdown.value || searchResults.value.length === 0) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddStock()
    }
    if (e.key === 'Escape') closeDropdown()
    return
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      searchHighlight.value = (searchHighlight.value + 1) % searchResults.value.length
      break
    case 'ArrowUp':
      e.preventDefault()
      searchHighlight.value = searchHighlight.value <= 0
        ? searchResults.value.length - 1
        : searchHighlight.value - 1
      break
    case 'Enter':
      e.preventDefault()
      if (searchHighlight.value >= 0) {
        selectSearchResult(searchResults.value[searchHighlight.value])
      } else {
        handleAddStock()
      }
      break
    case 'Escape':
      closeDropdown()
      break
  }
}

async function selectSearchResult(item: StockSearchItem): Promise<void> {
  addError.value = ''
  addingStock.value = true
  try {
    // 新 addToWatchlist(item: StockSearchItem) 返回 boolean（false=已存在/失败）
    const ok = stockStore.addToWatchlist(item)
    if (!ok) {
      addError.value = '已在自选中或添加失败'
    } else {
      // 添加成功：清空输入、收起建议，但保持搜索框展开（仅 + 按钮收起）
      resetSearchInput()
      stockInputRef.value?.focus()
      // 立即取该新股行情，避免添加后列表显示 -- 要等下次轮询
      void stockStore.refresh()
    }
  } finally {
    addingStock.value = false
  }
}

async function handleAddStock(): Promise<void> {
  const code = stockInput.value.trim()
  if (!code || addingStock.value) return

  addError.value = ''
  addingStock.value = true
  try {
    // 原始代码添加：构造最小 StockSearchItem（market/rawMarket 留空，secid 按代码兜底）
    const item: StockSearchItem = { code, name: code, market: '', rawMarket: '' }
    const ok = stockStore.addToWatchlist(item)
    if (ok) {
      // 添加成功：清空输入、收起建议，但保持搜索框展开（仅 + 按钮收起）
      resetSearchInput()
      stockInputRef.value?.focus()
      // 立即取该新股行情，避免添加后列表显示 -- 要等下次轮询
      void stockStore.refresh()
    } else {
      addError.value = '已在自选中或添加失败'
    }
  } finally {
    addingStock.value = false
  }
}

let quoteRefreshTimer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

function startCountdown(): void {
  if (countdownTimer) return // 已有定时器运行中，不重置
  countdown.value = settingsStore.marketRefreshInterval
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      countdown.value = settingsStore.marketRefreshInterval
    }
  }, 1000)
}

function stopCountdown(): void {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
}

function startTimers(): void {
  stopTimers()
  if (!settingsStore.marketAutoRefresh) return
  startCountdown()
  const interval = settingsStore.marketRefreshInterval * 1000
  // 指数行情 + 自选股刷新：顺序请求（不并发），避免两路同时打 push2.eastmoney.com
  // 挤占同域 6 连接上限导致批次间歇失败（如港股 ETF 被挤掉）。轮询持续刷新，某次失败下轮补。
  quoteRefreshTimer = setInterval(async () => {
    await indexStore.refresh()
    await stockStore.refresh()
    countdown.value = settingsStore.marketRefreshInterval
  }, interval)
}

function stopTimers(): void {
  if (quoteRefreshTimer) { clearInterval(quoteRefreshTimer); quoteRefreshTimer = null }
  stopCountdown()
}

async function manualRefresh(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  try {
    // 顺序请求，理由同 startTimers（避免并发挤占 push2 连接）
    await indexStore.refresh()
    await stockStore.refresh()
    countdown.value = settingsStore.marketRefreshInterval
  } finally {
    refreshing.value = false
  }
}

onMounted(() => {
  // 完整页：store 通常已在 Tab 预览页初始化；仅当 watchlist 为空（首次直接进完整页）才补初始化
  if (stockStore.watchlist.length === 0) {
    stockStore.restoreWatchlist()
  }
  // 硬刷新后自选股仅恢复 code/name（quoteMap 为空，无行情缓存）：
  // 首屏立即补拉一次，不再只靠 60s 定时器；价格已就绪(warm)则跳过避免重复请求
  const needsFetch = stockStore.watchlist.some(
    e => !stockStore.quoteMap.get(e.code) || (stockStore.quoteMap.get(e.code)?.price ?? 0) <= 0,
  )
  if (stockStore.watchlist.length > 0 && needsFetch) {
    stockStore.refresh()
  }
  marketBodyRef.value?.addEventListener('scroll', handleScroll, { passive: true })
  startTimers()
})

// 监听自动刷新开关和刷新间隔变化
watch(() => settingsStore.marketAutoRefresh, () => { startTimers() })
watch(() => settingsStore.marketRefreshInterval, () => { startTimers() })

onUnmounted(() => {
  marketBodyRef.value?.removeEventListener('scroll', handleScroll)
  stopTimers()
})

// === 流光卡片 UI 辅助函数（自选股） ===
function watchTint(w: StockQuote): string {
  if (w.price <= 0) return ''
  return w.changeRate > 0 ? 'tint-rise' : w.changeRate < 0 ? 'tint-fall' : ''
}
function watchAccent(w: StockQuote): string {
  if (w.price <= 0) return 'accent-flat'
  return w.changeRate > 0 ? 'accent-rise' : w.changeRate < 0 ? 'accent-fall' : 'accent-flat'
}
function watchRate(w: StockQuote): string {
  if (w.price <= 0) return ''
  return w.changeRate > 0 ? 'text-rise' : w.changeRate < 0 ? 'text-fall' : 'text-flat'
}
function watchBar(w: StockQuote): string {
  if (w.price <= 0) return 'bar-flat'
  return w.changeRate > 0 ? 'bar-rise' : w.changeRate < 0 ? 'bar-fall' : 'bar-flat'
}

/** 涨跌进度条宽度（封顶 3%） */
function barPct(changeRate: number): string {
  if (!Number.isFinite(changeRate)) return '0%'
  return `${Math.min(Math.abs(changeRate) / 3, 1) * 100}%`
}

// === 卡片扩展数据格式化（缺值/无效 → --） ===
function fmtPrice(v: number | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '--'
  return v.toFixed(2)
}
function fmtRate(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '--'
  return `${v.toFixed(2)}%`
}
function fmtRatio(v: number | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '--'
  return v.toFixed(2)
}
function fmtTurnover(v: number | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '--'
  return formatTurnover(v)
}
</script>

<style scoped>
.stock-full-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: var(--spacing-sm);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}
.back-btn:hover { color: var(--text-primary); border-color: var(--border-hover); }

/* 统一功能区：左(板块功能) 右(刷新)，与资讯页同布局同高度，切换不跳动 */
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
  align-items: center;
  gap: var(--spacing-xs);
  min-width: 0;
  flex: 1;
}

.market-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 var(--spacing-xs);
  flex-shrink: 0;
}

.market-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding-bottom: 80px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.logo-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

.market-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-secondary);
}

.market-sub {
  font-size: var(--font-xs);
  color: var(--text-muted);
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

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-icon {
  flex-shrink: 0;
  transition: transform 0.6s ease;
}

.btn-refresh.spinning .refresh-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.countdown-text {
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  text-align: right;
}

/* ===== 通用 Panel Header（可折叠标题栏） ===== */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);
}

.panel-header:hover {
  background: var(--bg-card-hover);
}

.panel-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.item-count {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background: var(--color-primary-glow);
  color: var(--color-primary-light);
  font-weight: 600;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-icon:hover,
.btn-icon.active {
  border-color: var(--color-primary);
  color: var(--color-primary-light);
  background: var(--color-primary-glow);
}

.toggle-arrow {
  transition: transform var(--transition-fast);
  color: var(--text-muted);
  flex-shrink: 0;
}

.toggle-arrow.open {
  transform: rotate(180deg);
}

/* ===== 通用状态文字 ===== */
.loading-text,
.empty-text {
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--spacing-lg);
}

/* ===== 自选关注 ===== */
.watchlist-panel {
  padding: 0;
  overflow: visible;
  position: relative;
}

/* 展开式搜索框 */
.search-box {
  display: flex;
  align-items: center;
  position: relative;
  z-index: 10;
}

.stock-input-inline {
  width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: var(--font-sm);
  outline: none;
  opacity: 0;
  transition: width 0.3s ease, opacity 0.2s ease, padding 0.3s ease, border 0.3s ease;
}

.search-box.expanded .stock-input-inline {
  width: 180px;
  padding: 4px 10px;
  opacity: 1;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  margin-right: 4px;
}

.search-box.expanded .stock-input-inline:focus {
  border-color: var(--color-primary);
}

.stock-input-inline::placeholder {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.search-trigger {
  flex-shrink: 0;
}

.add-error {
  display: block;
  font-size: var(--font-xs);
  color: var(--color-rise);
  padding: 0 var(--spacing-lg) var(--spacing-xs);
}

/* 搜索下拉 */
/* 搜索下拉：左对齐搜索框往右展开，避免溢出屏幕左边缘 */
.search-box .search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  width: min(280px, 80vw);
  background: var(--bg-elevated, #1e293b);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-height: 280px;
  overflow-y: auto;
  z-index: 9999;
}

.dropdown-status {
  padding: 12px 16px;
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-align: center;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 8px 12px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.search-result-item:hover,
.search-result-item.highlighted {
  background: rgba(99, 102, 241, 0.12);
}

.search-result-item:first-child {
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.search-result-item:last-child {
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}

.sr-name {
  flex: 1;
  font-size: var(--font-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sr-code {
  font-size: var(--font-xs);
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  min-width: 56px;
  text-align: right;
}

.sr-market {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--radius-full);
  background: var(--color-primary-glow);
  color: var(--color-primary-light);
  font-weight: 600;
  min-width: 22px;
  text-align: center;
}

.watchlist-grid {
  display: grid;
  /* 桌面端每卡占半宽（两列）；手机端由媒体查询降为单列整行 */
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-xs);
  padding: var(--spacing-xs);
}

/* 紧凑数字卡：左侧色条 + 涨跌底色，无玻璃卡边框，精致省空间 */
.watchlist-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-md);
  border-left: 3px solid var(--border-default);
  background: var(--bg-surface);
  padding: var(--spacing-xs) var(--spacing-sm);
  transition: transform 0.2s ease, background 0.3s ease;
}
.watchlist-card:hover { transform: translateY(-1px); }
.watchlist-card.tint-rise {
  border-left-color: var(--color-rise);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.10), rgba(239, 68, 68, 0.02));
}
.watchlist-card.tint-fall {
  border-left-color: var(--color-fall);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.10), rgba(34, 197, 94, 0.02));
}

.card-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.card-row { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-width: 0; }
.s-name {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.s-code { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono, monospace); }
.s-rate { font-size: var(--font-xs); font-weight: 600; font-variant-numeric: tabular-nums; }
.card-price-row { display: flex; align-items: baseline; justify-content: space-between; gap: 4px; }
.s-price {
  font-size: var(--font-lg);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.s-amount { font-size: 10px; font-weight: 500; font-variant-numeric: tabular-nums; }
.s-amount.text-rise { color: var(--color-rise-light); }
.s-amount.text-fall { color: var(--color-fall-light); }
.s-amount.text-flat { color: var(--text-muted); }

/* 行情扩展统计区：两列网格，填充半宽卡/手机整行空白 */
.card-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 12px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-default);
}
.stat-cell {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px;
  min-width: 0;
}
.stat-label {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}
.stat-value {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
  transition: all var(--transition-fast);
  opacity: 0.4;
}

.watchlist-card:hover .btn-remove {
  opacity: 0.8;
}

.btn-remove:hover {
  background: var(--color-rise-glow);
  color: var(--color-rise);
  opacity: 1;
}

/* ===== 流光卡片内容（自选股共用） ===== */
/* 左侧渐变光条 */
.card-accent {
  flex-shrink: 0;
  width: 4px;
  border-radius: var(--radius-md) 0 0 var(--radius-md);
  transition: background 0.3s ease;
}

.card-accent.accent-rise {
  background: linear-gradient(180deg, var(--color-rise-light), var(--color-rise-glow));
}

.card-accent.accent-fall {
  background: linear-gradient(180deg, var(--color-fall-light), var(--color-fall-glow));
}

.card-accent.accent-flat {
  background: linear-gradient(180deg, var(--color-flat), var(--border-default));
}

/* 卡片内容区 */
.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-sm) var(--spacing-md);
  gap: 4px;
  min-width: 0;
}

.card-top {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.index-name {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.index-price {
  font-size: var(--font-lg);
  font-weight: 700;
  color: var(--text-primary);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.card-bottom {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.change-rate {
  font-size: var(--font-md);
  font-weight: 700;
}

.change-amount {
  font-size: var(--font-xs);
  font-weight: 500;
}

.change-amount.text-rise { color: var(--color-rise-light); }
.change-amount.text-fall { color: var(--color-fall-light); }
.change-amount.text-flat { color: var(--text-muted); }

/* 涨跌进度条 */
.change-bar {
  height: 3px;
  border-radius: 2px;
  background: var(--border-default);
  overflow: hidden;
  margin-top: 2px;
}

.change-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s ease;
}

.change-bar-fill.bar-rise {
  background: linear-gradient(90deg, var(--color-rise-glow), var(--color-rise));
}

.change-bar-fill.bar-fall {
  background: linear-gradient(90deg, var(--color-fall-glow), var(--color-fall));
}

.change-bar-fill.bar-flat {
  background: var(--color-flat);
}

.bottom-spacer {
  height: 80px;
}

/* ===== 回到顶部按钮 ===== */
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
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ===== 响应式 ===== */
@media (max-width: 767px) {
  .stock-full-page {
    padding: var(--spacing-sm);
  }

  .index-grid {
    grid-template-columns: 1fr;
  }

  .index-price {
    font-size: var(--font-md);
  }

  /* 手机端自选股卡片单列整行：两列时每卡仅~150px，
     名称+代码+价格+涨跌+7项扩展统计严重挤压截断。
     单列后卡片宽度≈视口宽，所有字段完整可见（用户要求"每行一个"）。
     桌面端(≥768px)仍保持两列不变。 */
  .watchlist-grid {
    grid-template-columns: 1fr;
  }

  .search-box.expanded .stock-input-inline {
    width: 120px;
  }

  .back-to-top {
    bottom: 70px;
    right: 12px;
    width: 36px;
    height: 36px;
  }
}
</style>
