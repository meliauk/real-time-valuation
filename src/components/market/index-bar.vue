<template>
  <!-- 基金页底部指数折叠条：收起态单条轮播，展开态卡片网格 -->
  <div class="index-bar glass-card">
    <!-- 主体：点击切换展开/收起 -->
    <div class="ib-main" @click="toggleExpand">
      <!-- 收起态：单条轮播 -->
      <template v-if="!expanded">
        <span v-if="quotes.length === 0" class="ib-empty">点击右侧设置选择要展示的指数</span>
        <div v-else class="ib-current" :key="currentKey">
          <span class="ib-tag">指数</span>
          <span class="ib-name">{{ cur.name }}</span>
          <span class="ib-price font-number">{{ cur.price > 0 ? cur.price.toFixed(2) : '--' }}</span>
          <span v-if="cur.price > 0" :class="['ib-rate', 'font-number', rateClass(cur)]">
            {{ cur.changeRate >= 0 ? '+' : '' }}{{ cur.changeRate.toFixed(2) }}%
          </span>
          <span v-else class="ib-rate ib-rate-muted">--</span>
          <span v-if="quotes.length > 1" class="ib-dots font-number">{{ currentIdx + 1 }}/{{ quotes.length }}</span>
        </div>
      </template>
      <!-- 展开态标题行 -->
      <div v-else class="ib-header">
        <span class="ib-title">指数</span>
        <span v-if="quotes.length > 0" class="ib-count font-number">{{ quotes.length }}</span>
        <span v-else class="ib-title-hint">未选择指数</span>
      </div>

      <!-- 右侧展开/收起箭头 -->
      <svg :class="['ib-arrow', { open: expanded }]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>

      <!-- 设置按钮（钉在主体行右侧，与展开箭头同水平；阻止冒泡以免触发展开） -->
      <button class="ib-settings" @click.stop="goSettings" title="选择指数">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>

    <!-- 展开态：横向滚动的正方形卡片，单行高度 -->
    <div v-if="expanded" class="ib-scroll">
      <template v-if="quotes.length > 0">
        <div v-for="q in quotes" :key="q.secid" :class="['sq-card', 'glass-card', tintClass(q)]">
          <div :class="['sq-accent', accentClass(q)]"></div>
          <div class="sq-content">
            <div class="sq-top">
              <span class="sq-badge">{{ marketTag(q) }}</span>
              <span class="sq-name">{{ q.name }}</span>
            </div>
            <span class="sq-price font-number">
              {{ q.price > 0 ? q.price.toFixed(2) : '--' }}
            </span>
            <div class="sq-bottom">
              <span v-if="q.price > 0" :class="['font-number', 'sq-rate', rateClass(q)]">
                {{ q.changeRate >= 0 ? '+' : '' }}{{ q.changeRate.toFixed(2) }}%
              </span>
              <span v-else class="sq-rate text-muted">--</span>
              <span v-if="q.price > 0 && q.changeAmount" :class="['font-number', 'sq-amount', rateClass(q)]">
                {{ q.changeAmount >= 0 ? '+' : '' }}{{ q.changeAmount.toFixed(2) }}
              </span>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="ib-empty-grid">
        暂无展示的指数，点击右上角设置选择
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onActivated, onDeactivated } from 'vue'
import { useRouter } from 'vue-router'
import { useIndexStore } from '@/modules/index/index-store'
import { useFundStore } from '@/modules/fund/fund-store'
import type { IndexQuote } from '@/modules/index/index-types'

const router = useRouter()
const indexStore = useIndexStore()
const fundStore = useFundStore()

/** 展开状态 */
const expanded = ref(false)
/** 轮播当前索引 */
const currentIdx = ref(0)

/** 轮播间隔（毫秒） */
const CAROUSEL_INTERVAL = 4000
/** 行情刷新间隔（毫秒） */
const REFRESH_INTERVAL = 60000

/** 选中的指数行情（仅指数，与自选股/资讯解耦） */
const quotes = computed(() => indexStore.selectedQuotes)

/** 当前轮播项 */
const cur = computed<IndexQuote>(() => quotes.value[currentIdx.value] ?? quotes.value[0])

/** 轮播切换的 key，驱动收起态淡入动画 */
const currentKey = computed(() => `${currentIdx.value}-${cur.value?.secid ?? ''}`)

let carouselTimer: number | null = null
let refreshTimer: number | null = null

/** 启动轮播：仅收起态且选中数 > 1 时运行 */
function startCarousel(): void {
  stopCarousel()
  if (expanded.value || quotes.value.length <= 1) return
  carouselTimer = window.setInterval(() => {
    if (quotes.value.length === 0) return
    currentIdx.value = (currentIdx.value + 1) % quotes.value.length
  }, CAROUSEL_INTERVAL)
}

function stopCarousel(): void {
  if (carouselTimer !== null) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
}

/** 点击横条切换展开/收起 */
function toggleExpand(): void {
  expanded.value = !expanded.value
  if (expanded.value) {
    stopCarousel()
  } else {
    startCarousel()
  }
}

/** 跳转指数选择页 */
function goSettings(): void {
  router.push('/settings/indices')
}

// 选中数变化时校正索引越界并重置轮播
watch(() => quotes.value.length, (len) => {
  if (len === 0) {
    currentIdx.value = 0
  } else if (currentIdx.value >= len) {
    currentIdx.value = 0
  }
  startCarousel()
})

// 展开状态变化时同步轮播
watch(expanded, () => {
  if (expanded.value) stopCarousel()
  else startCarousel()
})

// 用 onActivated/onDeactivated 而非 onMounted/onUnmounted：home 页被 keep-alive 缓存时，
// 切到 stock-full 等页面会触发 deactivated → 停止指数轮询，避免与 stock-full 的指数轮询
// 双套定时器同时打 push2.eastmoney.com 加剧 6 连接竞争。
onActivated(() => {
  indexStore.restoreSelected()
  // 避让基金估值刷新：等 fundStore 刷新结束（或 5s 超时）再拉指数，
  // 避免 batchGetValuation 的 JSONP 争抢东财连接池（push2.eastmoney.com 6 连接上限）
  const refreshWhenReady = () => {
    if (fundStore.refreshStatus !== 'loading') {
      indexStore.refresh()
    } else {
      setTimeout(refreshWhenReady, 500)
    }
  }
  refreshWhenReady()
  setTimeout(() => { if (indexStore.indexQuotes.size === 0) indexStore.refresh() }, 5000)
  refreshTimer = window.setInterval(() => indexStore.refresh(), REFRESH_INTERVAL)
  startCarousel()
})

onDeactivated(() => {
  stopCarousel()
  if (refreshTimer !== null) { clearInterval(refreshTimer); refreshTimer = null }
})

// ===== 流光卡片 UI 辅助函数（复制自 market.vue，保持视觉一致） =====
function tintClass(q: IndexQuote): string {
  if (q.price <= 0) return ''
  return q.changeRate > 0 ? 'tint-rise' : q.changeRate < 0 ? 'tint-fall' : ''
}
function accentClass(q: IndexQuote): string {
  if (q.price <= 0) return 'accent-flat'
  return q.changeRate > 0 ? 'accent-rise' : q.changeRate < 0 ? 'accent-fall' : 'accent-flat'
}
function rateClass(q: IndexQuote): string {
  if (q.price <= 0) return ''
  return q.changeRate > 0 ? 'text-rise' : q.changeRate < 0 ? 'text-fall' : 'text-flat'
}

/** 市场标签 */
function marketTag(q: IndexQuote): string {
  if (/^\d{6}$/.test(q.code)) {
    return q.code.startsWith('6') || q.code.startsWith('000') ? '沪' : '深'
  }
  const c = q.code
  if (c === 'HSI' || c === 'HSCEI' || c === 'HSTECH') return '港'
  if (c === 'DJIA' || c === 'NDX' || c === 'SPX') return '美'
  if (c === 'N225') return '日'
  if (c === 'KS11') return '韩'
  if (c === 'TWII') return '台'
  if (c === 'FTSE') return '英'
  if (c === 'GDAXI') return '德'
  if (c === 'FCHI') return '法'
  return ''
}
</script>

<style scoped>
.index-bar {
  position: relative;
  padding: 0;
  flex-shrink: 0;
  overflow: hidden;
  /* 左右留白对齐底部固定导航栏宽度（导航 width = 100% - spacing-md*2） */
  margin-inline: var(--spacing-sm);
}

/* ===== 主体行 ===== */
.ib-main {
  position: relative; /* 设置按钮 absolute 的定位基准，确保展开/收起都钉在主体行 */
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  min-height: 38px;
  cursor: pointer;
  transition: background var(--transition-fast);
  padding-right: 56px; /* 给展开箭头 + 设置按钮留位 */
}
.ib-main:hover {
  background: var(--bg-card-hover);
}

/* 收起态单条 */
.ib-current {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
  min-width: 0;
  animation: ib-fade-in 0.4s ease;
}
@keyframes ib-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.ib-tag {
  font-size: 10px;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--color-primary-glow);
  color: var(--color-primary-light);
  font-weight: 600;
  flex-shrink: 0;
  line-height: 16px;
}
.ib-name {
  font-size: var(--font-sm);
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ib-price {
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--text-primary);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.ib-rate {
  font-size: var(--font-sm);
  font-weight: 600;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.ib-rate-muted {
  color: var(--text-muted);
}
.ib-dots {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
  flex-shrink: 0;
  opacity: 0.7;
}
.ib-empty {
  flex: 1;
  font-size: var(--font-xs);
  color: var(--text-muted);
  font-style: italic;
}

/* 展开态标题行 */
.ib-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex: 1;
}
.ib-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-primary);
}
.ib-count {
  font-size: var(--font-xs);
  color: var(--text-muted);
  background: var(--bg-elevated);
  padding: 0 6px;
  border-radius: var(--radius-full);
}
.ib-title-hint {
  font-size: var(--font-xs);
  color: var(--text-muted);
}

/* 右侧箭头 */
.ib-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform var(--transition-fast);
  margin-left: auto;
}
.ib-arrow.open {
  transform: rotate(180deg);
}

/* 设置按钮 */
.ib-settings {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  z-index: 2;
}
.ib-settings:hover {
  color: var(--color-primary);
  background: var(--color-primary-glow);
}

/* ===== 展开态：横向滚动的正方形卡片，单行高度 ===== */
.ib-scroll {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-sm);
  overflow-x: auto;
  overflow-y: hidden;
  border-top: 1px solid var(--border-default);
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}
/* 隐藏桌面端滚动条，保留可滚动 */
.ib-scroll::-webkit-scrollbar {
  height: 4px;
}
.ib-scroll::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 2px;
}

.sq-card {
  flex: 0 0 auto;
  width: 120px;
  height: 120px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: row;
  padding: 0;
  border: 1px solid var(--border-default);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.3s ease;
}
.sq-card:hover {
  transform: translateY(-1px);
  border-color: var(--border-hover);
}
.sq-card.tint-rise {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.02));
}
.sq-card.tint-fall {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.02));
}

/* 顶部渐变光条 */
.sq-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  transition: background 0.3s ease;
}
.sq-accent.accent-rise {
  background: linear-gradient(90deg, var(--color-rise-light), var(--color-rise-glow));
}
.sq-accent.accent-fall {
  background: linear-gradient(90deg, var(--color-fall-light), var(--color-fall-glow));
}
.sq-accent.accent-flat {
  background: linear-gradient(90deg, var(--color-flat), var(--border-default));
}

.sq-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--spacing-xs) var(--spacing-sm);
  min-width: 0;
}
.sq-top {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.sq-badge {
  font-size: 9px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--color-primary-glow);
  color: var(--color-primary-light);
  font-weight: 600;
  flex-shrink: 0;
  line-height: 14px;
}
.sq-name {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.sq-price {
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sq-bottom {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-xs);
}
.sq-rate {
  font-size: var(--font-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.sq-amount {
  font-size: 10px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.sq-amount.text-rise { color: var(--color-rise-light); }
.sq-amount.text-fall { color: var(--color-fall-light); }
.sq-amount.text-flat { color: var(--text-muted); }

.ib-empty-grid {
  flex: 1;
  padding: var(--spacing-md);
  text-align: center;
  font-size: var(--font-xs);
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .sq-card {
    width: 104px;
    height: 104px;
  }
  .ib-name {
    max-width: 40vw;
  }
}

</style>
