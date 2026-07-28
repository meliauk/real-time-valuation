<template>
  <div class="hub-page">
    <!-- 板块切换器：独立一行，支持以后扩展更多板块 -->
    <nav class="tab-switcher" ref="switcherRef">
      <!-- 滑动高亮指示器：根据激活 tab 的位置/宽度平滑滑动 -->
      <span class="tab-indicator" :style="indicatorStyle"></span>
      <button :ref="el => setTabRef(el, 0)" :class="['tab-btn', { active: activeTab === 'stocks' }]" @click="switchTab('stocks')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
        <span>股票</span>
      </button>
      <button :ref="el => setTabRef(el, 1)" :class="['tab-btn', { active: activeTab === 'news' }]" @click="switchTab('news')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span>资讯</span>
      </button>
      <button :ref="el => setTabRef(el, 2)" :class="['tab-btn', { active: activeTab === 'sector' }]" @click="switchTab('sector')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span>板块</span>
      </button>
    </nav>

    <!-- 板块内容：各板块常驻挂载(定时器不受切换影响)，opacity 过渡切换 -->
    <div class="hub-body">
      <StockFull class="panel" :class="{ active: activeTab === 'stocks' }" />
      <NewsFull class="panel" :class="{ active: activeTab === 'news' }" />
      <SectorFull class="panel" :class="{ active: activeTab === 'sector' }" />
    </div>

    <!-- 底部指数折叠条：与基金页一致，收起态轮播 / 展开态卡片网格 -->
    <IndexBar />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'StockNewsHub' })

import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { STORAGE_KEYS } from '@/config/constants'
import StockFull from '@/views/stock-full.vue'
import NewsFull from '@/views/news-full.vue'
import SectorFull from '@/views/sector-full.vue'
import IndexBar from '@/components/market/index-bar.vue'

type TabKey = 'stocks' | 'news' | 'sector'
const TAB_ORDER: TabKey[] = ['stocks', 'news', 'sector']
const activeTab = ref<TabKey>(loadActiveTab())

const switcherRef = ref<HTMLElement | null>(null)
const tabRefs: HTMLElement[] = []
// 滑块位置/宽度：测量自激活 tab 按钮的 offsetLeft/offsetWidth
const indicator = ref({ x: 0, w: 0 })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setTabRef(el: any, idx: number): void {
  if (el instanceof HTMLElement) tabRefs[idx] = el
}
const indicatorStyle = computed(() => ({
  transform: `translateX(${indicator.value.x}px)`,
  width: `${indicator.value.w}px`,
}))

/** 测量激活 tab 按钮位置，更新滑块 */
function updateIndicator(): void {
  const idx = TAB_ORDER.indexOf(activeTab.value)
  const el = tabRefs[idx]
  if (!el) return
  indicator.value = { x: el.offsetLeft, w: el.offsetWidth }
}

function loadActiveTab(): TabKey {
  const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB)
  if (raw === 'news' || raw === 'sector') return raw
  return 'stocks'
}
function saveActiveTab(): void {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, activeTab.value)
}

function switchTab(tab: TabKey): void {
  if (activeTab.value === tab) return
  activeTab.value = tab
  saveActiveTab()
  nextTick(updateIndicator)
}

function onResize(): void { updateIndicator() }

onMounted(() => {
  nextTick(updateIndicator)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.hub-page {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  gap: var(--spacing-md);
}

/* 板块切换器：玻璃态胶囊容器，横向排列，支持扩展更多板块 */
.tab-switcher {
  position: relative;
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  padding: 4px;
  border-radius: var(--radius-full);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  align-self: flex-start;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab-switcher::-webkit-scrollbar { display: none; }

/* 滑动高亮指示器：绝对定位在切换器内，按激活 tab 位置/宽度平滑滑动 */
.tab-indicator {
  position: absolute;
  top: 4px;
  left: 0;
  height: calc(100% - 8px);
  border-radius: var(--radius-full);
  background: var(--color-primary-glow);
  border: 1px solid var(--color-primary);
  box-shadow: 0 1px 4px rgba(99, 102, 241, 0.15);
  /* 慢一点滑过去：transform 过渡，ease-out 收尾稳 */
  transition: transform 0.42s cubic-bezier(0.22, 0.61, 0.36, 1), width 0.42s cubic-bezier(0.22, 0.61, 0.36, 1);
  z-index: 0;
  pointer-events: none;
}
/* 减少动画模式：滑块瞬移 */
html.reduce-motion .tab-indicator { transition-duration: 0.001ms !important; }

.tab-btn {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color var(--transition-fast), font-weight var(--transition-fast);
}
.tab-btn:hover { color: var(--color-primary-light); }
.tab-btn.active {
  color: var(--color-primary-light);
  font-weight: 600;
}

/* 板块内容撑满 */
.hub-body {
  flex: 1;
  min-height: 0;
  position: relative;
}
/* 各板块绝对定位叠放，常驻挂载(定时器不受切换影响)，opacity 过渡切换 */
.panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.32s ease;
}
.panel.active {
  opacity: 1;
  pointer-events: auto;
}
/* 减少动画模式：瞬切 */
html.reduce-motion .panel { transition-duration: 0.001ms !important; }
</style>
