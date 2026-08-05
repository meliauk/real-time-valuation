<template>
  <!-- PC 首页：左中右三栏布局 -->
  <div class="pc-home">
    <!-- 左栏 20%：指数行情列表 -->
    <aside class="pc-left">
      <IndexBarPC />
    </aside>

    <!-- 中栏 60%：搜索+刷新 + 仪表盘 + 基金列表 -->
    <main class="pc-center">
      <!-- 顶部工具栏 -->
      <div class="pc-toolbar">
        <SearchBar />
        <button class="btn-refresh" :class="{ spinning: refreshing }" @click="manualRefresh" :disabled="refreshing" title="刷新估值">
          <svg class="refresh-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span class="countdown-text">{{ countdown }}s</span>
        </button>
      </div>

      <!-- 仪表盘 -->
      <DashboardStats :stats="dashboardStats" :pc-mode="true" />

      <!-- 基金列表 -->
      <div class="pc-fund-list">
        <FundList
          :sorted-rows="sortedFundRows"
          :view-mode="viewMode"
          :sort-field="fundStore.sortField"
          :sort-direction="fundStore.sortDirection"
          :pc-mode="true"
          @remove-fund="handleRemoveFund"
          @quick-remove-fund="handleQuickRemoveFund"
          @change-view-mode="handleViewModeChange"
          @change-sort="handleSortChange"
          @clear-holdings="handleClearHoldings"
        />
      </div>
    </main>

    <!-- 右栏 20%：板块排行 -->
    <aside class="pc-right">
      <SectorFull />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onActivated, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

import DashboardStats from '@/components/dashboard/dashboard-stats.vue'
import FundList from '@/components/fund-list/fund-list.vue'
import SearchBar from '@/components/search/search-bar.vue'
import IndexBarPC from '@/components/market/index-bar-pc.vue'
import SectorFull from '@/views/sector-full.vue'

import { useFundData } from '@/composables/use-fund-data'
import { useAutoRefresh } from '@/composables/use-auto-refresh'
import { useCrossDay } from '@/composables/use-cross-day'
import { confirm } from '@/composables/use-confirm'
import { useFundStore } from '@/modules/fund/fund-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import { removeKnownManager } from '@/composables/use-manager-check'
import type { ViewMode, SortField, SortDirection } from '@/modules/fund/fund-types'

const fundStore = useFundStore()
const holdingStore = useHoldingStore()
const settingsStore = useSettingsStore()
const { sortedFundRows, dashboardStats, refreshData } = useFundData()
useAutoRefresh()
useCrossDay()

// ===== 手动刷新 =====
const refreshing = ref(false)
const countdown = ref(settingsStore.refreshInterval)

let countdownTimer: ReturnType<typeof setInterval> | null = null

function startCountdown(): void {
  if (countdownTimer) return
  countdown.value = settingsStore.refreshInterval
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) countdown.value = settingsStore.refreshInterval
  }, 1000)
}

function stopCountdown(): void {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
}

async function manualRefresh(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await refreshData()
    countdown.value = settingsStore.refreshInterval
  } finally {
    refreshing.value = false
  }
}

watch(() => settingsStore.refreshInterval, () => {
  countdown.value = settingsStore.refreshInterval
})

onMounted(() => {
  startCountdown()
  // 获取所有基金的周期收益（PC 端列表新增列）
  const codes = fundStore.fundCodes
  if (codes.length > 0) fundStore.fetchPeriodReturns([...codes])
})
onUnmounted(() => { stopCountdown() })

onActivated(() => {
  if (fundStore.fundCodes.length > 0 && fundStore.valuationMap.size === 0) refreshData()
  stopCountdown()
  startCountdown()
})

// ===== T+2 提示 =====
watch(() => fundStore.t2HintPending, (pending) => {
  if (pending) fundStore.t2HintPending = false
}, { immediate: true })

// ===== 视图模式 =====
const viewMode = ref<ViewMode>(fundStore.viewMode)

// ===== 事件处理 =====

async function handleQuickRemoveFund(fundCode: string): Promise<void> {
  const ok = await confirm({
    title: '删除确认',
    desc: '确认删除该基金？持仓数据将一并清除。',
    confirmText: '确认删除',
    cancelText: '取消',
  })
  if (!ok) return
  fundStore.removeFund(fundCode)
  holdingStore.removeHoldingsByFund(fundCode)
  removeKnownManager(fundCode)
  ElMessage.success('已删除')
}

async function handleRemoveFund(fundCode: string): Promise<void> {
  const ok = await confirm({
    title: '移除确认',
    desc: '确认移除该基金？持仓数据将一并清除。',
    confirmText: '确认移除',
    cancelText: '取消',
  })
  if (!ok) return
  fundStore.removeFund(fundCode)
  holdingStore.removeHoldingsByFund(fundCode)
  removeKnownManager(fundCode)
  ElMessage.success('已移除')
}

async function handleClearHoldings(code: string): Promise<void> {
  const ok = await confirm({
    title: '清空持仓',
    desc: '确认清空该基金的持仓数据？清空后持仓金额和收益将归零。',
    confirmText: '确认清空',
    cancelText: '取消',
  })
  if (!ok) return
  holdingStore.settleAllByFund(code)
  ElMessage.success('已清空持仓')
}

function handleViewModeChange(mode: ViewMode): void {
  viewMode.value = mode
  fundStore.viewMode = mode
}

function handleSortChange(field: SortField, dir: SortDirection): void {
  fundStore.setSort(field, dir)
}
</script>

<style scoped>
.pc-home {
  display: flex;
  flex-direction: row;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
}

/* ===== 左栏 20% ===== */
.pc-left {
  width: 20%;
  min-width: 180px;
  max-width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 中栏 60% ===== */
.pc-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  overflow: hidden;
}

/* 顶部工具栏 */
.pc-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  flex-shrink: 0;
}
.pc-toolbar > :first-child {
  flex: 1;
}

/* 基金列表区域 */
.pc-fund-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 刷新按钮 */
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
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.countdown-text { font-variant-numeric: tabular-nums; min-width: 28px; text-align: right; }

/* ===== 右栏 20% ===== */
.pc-right {
  width: 20%;
  min-width: 220px;
  max-width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
