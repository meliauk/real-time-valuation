<template>
  <!-- PC 端指数条：纵向上下两部分，上半指数列表，下半操作按钮区 -->
  <div class="index-bar-pc glass-card">
    <!-- 上半部分：指数行情列表 -->
    <div class="ibp-top">
      <div class="ibp-header">
        <span class="ibp-title">指数行情</span>
        <span class="ibp-count font-number">{{ quotes.length }}</span>
      </div>
      <div class="ibp-list">
        <template v-if="quotes.length > 0">
          <div v-for="q in quotes" :key="q.secid" class="ibp-row">
            <span class="ibp-badge">{{ marketTag(q) }}</span>
            <span class="ibp-name">{{ q.name }}</span>
            <span class="ibp-price font-number">
              {{ q.price > 0 ? q.price.toFixed(2) : '--' }}
            </span>
            <span v-if="q.price > 0" :class="['ibp-rate', 'font-number', rateClass(q)]">
              {{ q.changeRate >= 0 ? '+' : '' }}{{ q.changeRate.toFixed(2) }}%
            </span>
            <span v-if="q.price > 0 && q.changeAmount" :class="['ibp-amount', 'font-number', rateClass(q)]">
              {{ q.changeAmount >= 0 ? '+' : '' }}{{ q.changeAmount.toFixed(2) }}
            </span>
          </div>
        </template>
        <div v-else class="ibp-empty">
          点击右上角设置选择要展示的指数
        </div>
      </div>
      <button class="ibp-settings" @click="goSettings" title="选择指数">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>

    <!-- 下半部分：操作按钮区（一键同步等） -->
    <div class="ibp-bottom">
      <button class="ibp-action" :disabled="syncing" @click="syncToCloud" title="将基金数据同步到云端">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 17l6-6 4 4 6-6" />
          <path d="M14 7h6v6" />
        </svg>
        <span>{{ syncing ? '同步中...' : '一键同步到Supabase' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onActivated, onDeactivated } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useIndexStore } from '@/modules/index/index-store'
import { useFundStore } from '@/modules/fund/fund-store'
import { useAuthStore } from '@/modules/auth/auth-store'
import { collectFundData } from '@/modules/sync/collect-fund-data'
import { syncUserConfig } from '@/modules/sync/supabase-client'
import type { IndexQuote } from '@/modules/index/index-types'

const router = useRouter()
const indexStore = useIndexStore()
const fundStore = useFundStore()
const authStore = useAuthStore()

/** 行情刷新间隔（毫秒） */
const REFRESH_INTERVAL = 60000

/** 选中的指数行情 */
const quotes = computed(() => indexStore.selectedQuotes)

/** 一键同步进行中标记 */
const syncing = ref(false)

let refreshTimer: number | null = null

/** 跳转指数选择页 */
function goSettings(): void {
  router.push('/settings/indices')
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

/** 一键同步：收集浏览器缓存基金数据 → 写入云端 user_configs.data */
async function syncToCloud(): Promise<void> {
  if (syncing.value) return
  const userName = authStore.currentUserName
  if (!userName) {
    ElMessage.warning('请先登录后再同步')
    router.push('/login')
    return
  }
  syncing.value = true
  try {
    const data = collectFundData()
    const res = await syncUserConfig(userName, data)
    if (res.ok) {
      ElMessage.success(res.created ? '同步成功（已新建云端用户）' : '同步成功')
    } else {
      ElMessage.error(res.error || '同步失败')
    }
  } finally {
    syncing.value = false
  }
}

// 用 onActivated/onDeactivated 而非 onMounted/onUnmounted：与 index-bar 一致，
// 切到其他页面停止指数轮询，避免与 stock-full 双套定时器同时打 push2.eastmoney.com
onActivated(() => {
  indexStore.restoreSelected()
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
})

onDeactivated(() => {
  if (refreshTimer !== null) { clearInterval(refreshTimer); refreshTimer = null }
})
</script>

<style scoped>
.index-bar-pc {
  position: relative;
  padding: 0;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 上半：指数列表 */
.ibp-top {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* 标题行 */
.ibp-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  padding-right: 40px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}
.ibp-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-primary);
}
.ibp-count {
  font-size: var(--font-xs);
  color: var(--text-muted);
  background: var(--bg-elevated);
  padding: 0 6px;
  border-radius: var(--radius-full);
}

/* 列表滚动区 */
.ibp-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: var(--spacing-xs) 0;
}

/* 行 */
.ibp-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px var(--spacing-md);
  border-bottom: 1px solid var(--border-default);
  transition: background var(--transition-fast);
}
.ibp-row:last-child {
  border-bottom: none;
}
.ibp-row:hover {
  background: var(--bg-card-hover);
}

.ibp-badge {
  font-size: 9px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--color-primary-glow);
  color: var(--color-primary-light);
  font-weight: 600;
  flex-shrink: 0;
  line-height: 14px;
}
.ibp-name {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.ibp-price {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.ibp-rate {
  font-size: var(--font-xs);
  font-weight: 600;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  min-width: 52px;
  text-align: right;
}
.ibp-amount {
  font-size: 10px;
  font-weight: 500;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  min-width: 44px;
  text-align: right;
}
.ibp-empty {
  padding: var(--spacing-md);
  text-align: center;
  font-size: var(--font-xs);
  color: var(--text-muted);
}

/* 设置按钮 */
.ibp-settings {
  position: absolute;
  top: 4px;
  right: 8px;
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
.ibp-settings:hover {
  color: var(--color-primary);
  background: var(--color-primary-glow);
}

/* 下半：操作按钮区 */
.ibp-bottom {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  border-top: 1px solid var(--border-default);
}
.ibp-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-xs);
  font-weight: 500;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.ibp-action:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary-light);
  background: var(--color-primary-glow);
}
.ibp-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.text-rise { color: var(--color-rise); }
.text-fall { color: var(--color-fall); }
.text-flat { color: var(--text-muted); }
</style>
