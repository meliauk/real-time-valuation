<template>
  <div class="ticker-bar glass-card" @click="openMarket">
    <div class="ticker-fade-left"></div>
    <div class="ticker-fade-right"></div>
    <div class="ticker-track"
      @mouseenter="doPause"
      @mouseleave="doResume"
      @touchstart="doPause"
      @touchend="doResume"
      @touchcancel="doResume"
    >
      <div class="ticker-scroll" :class="{ paused }" :style="scrollStyle">
        <span v-if="messages.length === 0" class="ticker-item ticker-placeholder">行情加载中...</span>
        <template v-else>
        <span v-for="(msg, i) in doubledMessages" :key="i" :class="['ticker-item', msg.cssClass]">
          <span v-if="msg.type === 'index'" class="ticker-tag">指数</span>
          <span v-else class="ticker-tag news-tag">资讯</span>
          {{ msg.text }}
          <span class="ticker-sep">|</span>
        </span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIndexStore } from '@/modules/index/index-store'
import { useStockStore } from '@/modules/stock/stock-store'

const router = useRouter()
const indexStore = useIndexStore()
const stockStore = useStockStore()

const paused = ref(false)
let pauseTimer: number | null = null

function doPause(): void {
  paused.value = true
  if (pauseTimer) clearTimeout(pauseTimer)
  // 安全兜底：1.5秒后强制恢复，防止事件丢失导致永久暂停
  pauseTimer = window.setTimeout(() => {
    paused.value = false
    pauseTimer = null
  }, 1500)
}

function doResume(): void {
  paused.value = false
  if (pauseTimer) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
}

/** 滚动条混合消息（指数 + 自选股，与旧 useMarketStore.tickerMessages 逻辑一致） */
interface TickerMessage {
  text: string
  cssClass: string
  type: 'index' | 'news'
}

const messages = computed<TickerMessage[]>(() => {
  const msgs: TickerMessage[] = []

  // 指数消息
  for (const q of indexStore.selectedQuotes) {
    const sign = q.changeRate >= 0 ? '+' : ''
    const cssClass = q.changeRate > 0 ? 'text-rise' : q.changeRate < 0 ? 'text-fall' : 'text-flat'
    msgs.push({
      text: `${q.name} ${q.price.toFixed(2)} ${sign}${q.changeRate.toFixed(2)}%`,
      cssClass,
      type: 'index',
    })
  }

  // 自选股消息：watchlist 仅存 code/emMarketCode，行情从 quoteMap 取
  for (const entry of stockStore.watchlist) {
    const q = stockStore.quoteMap.get(entry.code)
    if (!q || q.price <= 0) continue
    const sign = q.changeRate >= 0 ? '+' : ''
    const cssClass = q.changeRate > 0 ? 'text-rise' : q.changeRate < 0 ? 'text-fall' : 'text-flat'
    msgs.push({
      text: `${q.name} ${q.price.toFixed(2)} ${sign}${q.changeRate.toFixed(2)}%`,
      cssClass,
      type: 'index',
    })
  }

  return msgs
})

const doubledMessages = computed(() => [...messages.value, ...messages.value])

const scrollStyle = computed(() => {
  const count = messages.value.length
  if (count === 0) return {}
  const duration = Math.max(count * 8, 20) // 每条约8秒，最少20秒，更慢更舒适
  return { animationDuration: `${duration}s` }
})

function openMarket(): void {
  router.push('/market')
}

// 定期刷新行情数据（每 60 秒）
let refreshTimer: number | null = null

onMounted(() => {
  // 旧 useMarketStore.restoreSelection() 同时恢复指数勾选 + 自选股 watchlist；拆分后分别调用
  indexStore.restoreSelected()
  stockStore.restoreWatchlist()
  // 旧 refreshAll() 同时刷新指数 + 资讯 + 自选股；滚动条只需指数 + 自选股
  indexStore.refresh()
  stockStore.refresh()
  refreshTimer = window.setInterval(() => {
    indexStore.refresh()
    stockStore.refresh()
  }, 60000)
})

onUnmounted(() => {
  if (refreshTimer !== null) clearInterval(refreshTimer)
  if (pauseTimer !== null) clearTimeout(pauseTimer)
})
</script>

<style scoped>
.ticker-bar {
  padding: var(--spacing-xs) 0;
  cursor: pointer;
  overflow: hidden;
  user-select: none;
  position: relative;
}

/* 两侧渐变遮罩，文字淡入淡出，缓解眼晕 */
.ticker-fade-left,
.ticker-fade-right {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40px;
  z-index: 1;
  pointer-events: none;
}

.ticker-fade-left {
  left: 0;
  background: linear-gradient(90deg, var(--bg-card) 0%, transparent 100%);
}

.ticker-fade-right {
  right: 0;
  background: linear-gradient(270deg, var(--bg-card) 0%, transparent 100%);
}

.ticker-track {
  overflow: hidden;
  white-space: nowrap;
  padding: 0 40px;
}

.ticker-scroll {
  display: inline-block;
  animation: ticker-scroll linear infinite;
  white-space: nowrap;
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
}

.ticker-scroll.paused {
  animation-play-state: paused;
}

.ticker-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-sm);
  margin-right: var(--spacing-md);
}

.ticker-placeholder {
  color: var(--text-muted);
  opacity: 0.6;
  font-style: italic;
}

.ticker-tag {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 2px;
  background: var(--color-primary-glow);
  color: var(--color-primary-light);
  font-weight: 600;
}

.ticker-tag.news-tag {
  background: var(--color-warning-glow, rgba(245, 158, 11, 0.2));
  color: var(--color-warning, #f59e0b);
}

.ticker-sep {
  color: var(--text-muted);
  margin-left: var(--spacing-md);
  opacity: 0.4;
}

@keyframes ticker-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@media (max-width: 767px) {
  .ticker-fade-left,
  .ticker-fade-right {
    width: 24px;
  }
  .ticker-track {
    padding: 0 24px;
  }
  .ticker-item {
    font-size: var(--font-xs);
  }
  .ticker-tag {
    font-size: 9px;
    padding: 0 3px;
  }
}
</style>
