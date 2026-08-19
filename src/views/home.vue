<template>
  <!-- 首页视图 - 基金估值系统的主界面 -->
  <div class="home-page">
    <!-- 顶部导航栏 -->
    <header class="header glass-card">
      <div class="header-left">
        <div class="logo-icon">
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
            <ellipse cx="50" cy="60" rx="35" ry="30" fill="#ef4444"/>
            <ellipse cx="50" cy="65" rx="22" ry="20" fill="#fca5a5"/>
            <circle cx="50" cy="32" r="18" fill="#ef4444"/>
            <circle cx="44" cy="29" r="5" fill="white"/>
            <circle cx="44" cy="29" r="2.5" fill="#1e293b"/>
            <circle cx="56" cy="29" r="5" fill="white"/>
            <circle cx="56" cy="29" r="2.5" fill="#1e293b"/>
            <polygon points="50,36 46,40 54,40" fill="#f97316"/>
            <path d="M38 22 Q42 8 46 20 Q48 6 52 20 Q56 8 60 22" fill="#dc2626" stroke="#dc2626" stroke-width="1"/>
            <ellipse cx="30" cy="58" rx="14" ry="10" fill="#dc2626" transform="rotate(-15 30 58)"/>
            <line x1="42" y1="88" x2="38" y2="96" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
            <line x1="42" y1="88" x2="46" y2="96" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
            <line x1="58" y1="88" x2="54" y2="96" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
            <line x1="58" y1="88" x2="62" y2="96" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </div>
        <h1 class="logo">基攻宝</h1>
      </div>
      <div class="header-right">
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
    </header>

    <!-- 仪表盘统计 -->
    <DashboardStats :stats="dashboardStats" />

    <!-- 基金列表（可滚动区域） -->
    <div class="fund-list-scroll">
      <FundList
        :sorted-rows="sortedFundRows"
        :view-mode="viewMode"
        :sort-field="fundStore.sortField"
        :sort-direction="fundStore.sortDirection"
        @remove-fund="handleRemoveFund"
        @quick-remove-fund="handleQuickRemoveFund"
        @change-view-mode="handleViewModeChange"
        @change-sort="handleSortChange"
        @clear-holdings="handleClearHoldings"
      />
    </div>

    <!-- 底部指数折叠条：收起态轮播，展开态卡片网格 -->
    <IndexBar />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onActivated, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

import DashboardStats from '@/components/dashboard/dashboard-stats.vue'
import FundList from '@/components/fund-list/fund-list.vue'
import SearchBar from '@/components/search/search-bar.vue'
import IndexBar from '@/components/market/index-bar.vue'

import { useFundData } from '@/composables/use-fund-data'
import { useAutoRefresh } from '@/composables/use-auto-refresh'
import { useCrossDay } from '@/composables/use-cross-day'
import { useClockTick } from '@/composables/use-clock-tick'
import { confirm } from '@/composables/use-confirm'
import { useCloudSync } from '@/composables/use-cloud-sync'
import { useFundStore } from '@/modules/fund/fund-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import { removeKnownManager } from '@/composables/use-manager-check'
import type { ViewMode, SortField, SortDirection } from '@/modules/fund/fund-types'
// 迁移注记：旧版用 loadSettings/saveSettings(@/config/settings) 管理 viewMode。
// @/config/settings 已废弃，改用 fundStore.viewMode（settingsStore 无 viewMode 字段）。

const fundStore = useFundStore()
const holdingStore = useHoldingStore()
const settingsStore = useSettingsStore()
const { sortedFundRows, dashboardStats, refreshData } = useFundData()
useAutoRefresh()
useCrossDay()
// 分钟级时钟：驱动「已更新」徽章在次日 08:30 按约定清空（纯时间函数非响应式，
// 不挂时钟则要等下一次估值刷新——交易时段才跑，即 09:30 之后——徽章才消失）
useClockTick()

// 云端数据加载弹框（首页进入时，已登录且未询问过才弹一次）
const { maybePromptLoad } = useCloudSync()

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

onMounted(() => { startCountdown() })
onUnmounted(() => { stopCountdown() })

onActivated(() => {
  if (fundStore.fundCodes.length > 0 && fundStore.valuationMap.size === 0) refreshData()
  stopCountdown()
  startCountdown()
  // 延迟触发，避开 App.vue 启动公告弹窗，避免两层弹窗叠放
  setTimeout(() => { void maybePromptLoad() }, 500)
})

// ===== T+2 提示（已去除弹窗，仅重置状态避免残留） =====
watch(() => fundStore.t2HintPending, (pending) => {
  if (pending) fundStore.t2HintPending = false
}, { immediate: true })

// ===== 隐私 Popover =====
// 已移至 fund-list.vue ctrl 列表头中

// ===== 视图模式（改用 fundStore.viewMode，废弃 loadSettings/saveSettings） =====
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
  // 旧版：s.viewMode = mode; saveSettings(s)。新版写入 fundStore.viewMode 持久化。
  fundStore.viewMode = mode
}

function handleSortChange(field: SortField, dir: SortDirection): void {
  fundStore.setSort(field, dir)
}
</script>

<style scoped>
.home-page {
  padding: var(--spacing-md);
  /* 底部为固定导航栏让位：100vh 锁高 + padding-bottom 内收，
     使 IndexBar 落在导航正上方（紧挨），flex:1 的基金列表正常滚动 */
  padding-bottom: calc(64px + var(--spacing-sm) + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  flex-shrink: 0;
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
  gap: var(--spacing-sm);
  flex-shrink: 0;
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
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.countdown-text { font-variant-numeric: tabular-nums; min-width: 28px; text-align: right; }

.logo {
  font-size: var(--font-2xl);
  font-weight: 800;
  background: linear-gradient(135deg, #ff6b6b, #ffa500, #f7e74a, #4af78a, #4acff7, #a44af7, #f74acf, #ff6b6b);
  background-size: 400% 400%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: rainbowFlow 3s ease infinite;
}
@keyframes rainbowFlow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.logo-sub { font-size: var(--font-sm); color: var(--text-muted); }

.fund-list-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.home-page > :not(.fund-list-scroll) { flex-shrink: 0; }

@media (max-width: 767px) {
  /* 移动端缩小四周 padding，但必须保留底部对固定导航栏的避让，
     否则 IndexBar 会被底部导航盖住 */
  .home-page {
    padding: var(--spacing-sm);
    padding-bottom: calc(64px + var(--spacing-sm) + env(safe-area-inset-bottom, 0px));
  }
  .header { padding: var(--spacing-sm) var(--spacing-md); }
  .logo { font-size: var(--font-xl); }
  .logo-sub { display: none; }
}
</style>
