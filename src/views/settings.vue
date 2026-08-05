<template>
  <div class="data-page">
    <!-- 固定头部：返回按钮 + 标题 -->
    <header class="data-header glass-card">
      <button class="back-btn" @click="router.back()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>返回</span>
      </button>
      <h2 class="page-title">数据管理</h2>
      <div class="header-placeholder"></div>
    </header>

    <!-- 可滚动主体 -->
    <div class="data-body">
      <SettingsSection title="数据管理" danger>
        <div class="danger-zone">
          <div class="danger-zone-header">
            <span class="danger-zone-desc">点击对应数据类型即可清除该项数据，或点底部「全部清除」一键清空。清除后应用将自动刷新，此操作不可撤销。</span>
          </div>
          <div class="clear-options">
            <button
              v-for="opt in clearOptions"
              :key="opt.key"
              class="clear-option"
              :disabled="clearing"
              @click="askClear([opt])"
            >
              <span class="clear-option-content">
                <span class="clear-option-label">{{ opt.label }}</span>
                <span class="clear-option-desc">{{ opt.desc }}</span>
              </span>
              <svg class="clear-option-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
          <button class="btn-danger" @click="askClear(clearOptions)" :disabled="clearing">
            {{ clearing ? '清除中...' : '全部清除' }}
          </button>
        </div>
      </SettingsSection>
    </div>

    <!-- 清除确认弹窗 -->
    <ConfirmModal
      :visible="showConfirmModal"
      :title="pendingKeys.length === clearOptions.length ? '确认全部清除' : '确认清除数据'"
      desc="将清除以下数据，应用将自动刷新。此操作不可撤销。"
      confirm-text="确认清除"
      cancel-text="取消"
      :loading="clearing"
      :items="pendingItems"
      @confirm="executeClearData"
      @cancel="cancelConfirm"
      @update:visible="cancelConfirm"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 数据管理页 - 从 settings.vue 拆出的数据管理分区 + 清除确认弹窗
 * 每类数据独立清除按钮（点该类右侧清除直接清对应项），底部「全部清除」一键清空。
 * 清除逻辑（含 __skipPersistOnUnload 全局 flag）原样保留，跨组件生效不变。
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useFundStore } from '@/modules/fund/fund-store'
import { useCacheStore } from '@/modules/fund/cache-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { STORAGE_KEYS } from '@/config/constants'
import SettingsSection from '@/views/settings/settings-section.vue'
import ConfirmModal from '@/components/shared/confirm-modal.vue'

const router = useRouter()

const clearing = ref(false)
const showConfirmModal = ref(false)

interface ClearOption {
  key: string
  label: string
  desc: string
  keys: string[]
}

const clearOptions = ref<ClearOption[]>([
  {
    key: 'settings',
    label: '应用设置',
    desc: '主题、刷新间隔、动画开关、资讯偏好等',
    keys: [STORAGE_KEYS.USER_SETTINGS, STORAGE_KEYS.VIEW_MODE, STORAGE_KEYS.ACTIVE_TAB, STORAGE_KEYS.COLUMN_CONFIG, STORAGE_KEYS.AUTO_REFRESH, STORAGE_KEYS.REFRESH_INTERVAL],
  },
  {
    key: 'funds',
    label: '自选基金',
    desc: '关注的基金代码列表',
    keys: [STORAGE_KEYS.FUND_CODES],
  },
  {
    key: 'holdings',
    label: '持仓数据',
    desc: '持仓份额、成本价、操作日志、待确认操作',
    keys: [STORAGE_KEYS.HOLDINGS, STORAGE_KEYS.HOLDING_ACTIONS, STORAGE_KEYS.PENDING_ACTIONS],
  },
  {
    key: 'stocks',
    label: '行情数据',
    desc: '自选股票列表、指数选择',
    keys: [STORAGE_KEYS.WATCHLIST, STORAGE_KEYS.SELECTED_INDICES],
  },
  {
    key: 'news',
    label: '资讯数据',
    desc: '资讯黑名单、已读记录',
    keys: [STORAGE_KEYS.NEWS_BLACKLIST, STORAGE_KEYS.NEWS_READ],
  },
  {
    key: 'cache',
    label: '缓存数据',
    desc: '估值/分时/T+2持仓涨跌/Yahoo解析等缓存（跨日自动失效，清除后重拉）',
    // 仅纯缓存键。切勿放入持仓本体（jgb_holdings/jgb_holding_actions/jgb_pending_actions）
    // 及 jgb_holdings_version：清掉版本号但保留持仓会触发 restoreHoldings 迁移分支，
    // 抹掉 addHoldingDirect 冻结的 yesterdayAmount/confirmedBaseAmount 基准，
    // 导致持有金额/累计收益被重算归零（今日收益因迁移重设 confirmedBase 仍非零，造成不一致）。
    keys: [
      STORAGE_KEYS.FUND_CACHE,                  // 估值缓存
      STORAGE_KEYS.FUND_NAMES,                  // 基金名称映射
      STORAGE_KEYS.FUND_CATALOG,                // 全量基金目录(24h)
      STORAGE_KEYS.STOCK_PREV_DAY_CACHE, STORAGE_KEYS.STOCK_PREV_DAY_DATE, // 持仓收盘涨跌
      STORAGE_KEYS.STOCK_REALTIME_CACHE, STORAGE_KEYS.STOCK_REALTIME_DATE, // 持仓实时涨跌
      STORAGE_KEYS.INDEX_QUOTES_CACHE, STORAGE_KEYS.INDEX_QUOTES_DATE,     // 指数行情
      STORAGE_KEYS.STOCK_QUOTES_CACHE, STORAGE_KEYS.STOCK_QUOTES_DATE,     // 自选股行情
      STORAGE_KEYS.YAHOO_SYMBOL_CACHE,         // Yahoo symbol解析
      STORAGE_KEYS.INTRADAY_MAP, STORAGE_KEYS.INTRADAY_MAP_DATE, // 盘中分时点
      STORAGE_KEYS.MARKET_HOLIDAYS,             // 各市场节假日（Nager，按年）
      STORAGE_KEYS.FUND_MANAGERS,              // 已知经理记录
      STORAGE_KEYS.TASKS,                       // 计划任务
    ],
  },
])

// 当前待确认清除的选项列表（单类或全部）
const pending = ref<ClearOption[]>([])
const pendingKeys = computed(() => pending.value.map(o => o.key))
// 弹窗列表项：label + desc
const pendingItems = computed(() =>
  pending.value.map(o => ({ label: o.label, desc: o.desc }))
)

/** 点单个清除 / 全部清除：设定待清列表并开确认弹窗 */
function askClear(items: ClearOption[]): void {
  if (clearing.value) return
  pending.value = items
  showConfirmModal.value = true
}

function cancelConfirm(): void {
  if (clearing.value) return
  showConfirmModal.value = false
  pending.value = []
}

function executeClearData(): void {
  if (clearing.value) return

  clearing.value = true
  try {
    const checkedKeys = new Set(pending.value.map(o => o.key))

    // 1. 先清空内存状态：删除 localStorage 键后，后台 service loop 仍可能在
    //    刷新前的 300ms 窗口内 merge 数据回内存、再被关页兜底落盘把已删键写回。
    //    故同步清掉对应内存状态，确保即使发生写入也是清空态。
    if (checkedKeys.has('cache')) {
      useCacheStore().clearAllCache()
      useFundStore().clearCacheDataInMemory()
    }
    if (checkedKeys.has('funds')) {
      const fundStore = useFundStore()
      fundStore.fundCodes = []
      fundStore.fundNameMap = {}
    }
    if (checkedKeys.has('holdings')) {
      useHoldingStore().clearAllHoldings()
    }

    // 2. 删 localStorage 键
    const keysToRemove = new Set<string>()
    for (const opt of pending.value) {
      for (const key of opt.keys) {
        keysToRemove.add(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }

    // 3. 置 flag 让 main.ts 的 beforeunload 兜底跳过 flushPersist/flushAllPersist，
    //    否则内存里仍完整的状态会把刚删的 FUND_CACHE/HOLDINGS 等键原样写回。
    ;(window as unknown as { __skipPersistOnUnload?: boolean }).__skipPersistOnUnload = true

    setTimeout(() => {
      // 清 hash 回首页：hash 路由下 location.reload() 会停在 #/settings/data，
      // 用户清完缓存仍看着这个页面，且此时数据已清空、页面无意义。回首页重新加载数据更合理。
      const { origin, pathname } = window.location
      window.location.replace(`${origin}${pathname}`)
    }, 300)
  } catch {
    clearing.value = false
    showConfirmModal.value = false
    pending.value = []
    alert('清除失败，请重试')
  }
}
</script>

<style scoped>
.data-page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--spacing-md);
  padding-bottom: calc(var(--spacing-md) + 56px + env(safe-area-inset-bottom, 0px));
  gap: var(--spacing-sm);
}

/* 头部（固定，不滚动）——沿用 manage.vue 的 back-btn 样式 */
.data-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  flex-shrink: 0;
}
.back-btn {
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
}
.back-btn:hover { color: var(--text-primary); border-color: var(--border-hover); }
.page-title {
  flex: 1;
  font-size: var(--font-lg);
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
}
.header-placeholder { width: 60px; }

/* 可滚动主体 */
.data-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: var(--spacing-md);
}

/* === 数据管理 === */
.danger-zone {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.danger-zone-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.danger-zone-desc {
  font-size: var(--font-xs);
  color: var(--text-muted);
  line-height: 1.5;
}
.clear-options {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
/* 每个数据类型整行即一个按钮：点击直接弹二次确认清除该项 */
.clear-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-md) var(--spacing-sm);
  border: none;
  border-top: 1px solid var(--border-default);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast);
  font-family: inherit;
}
.clear-options .clear-option:first-child {
  border-top: none;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}
.clear-option:hover:not(:disabled) {
  background: var(--bg-card-hover);
}
.clear-option:active:not(:disabled) {
  background: var(--color-rise-glow);
}
.clear-option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.clear-option-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.clear-option-label {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
}
.clear-option-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
.clear-option-arrow {
  flex-shrink: 0;
  color: var(--color-rise);
  opacity: 0.6;
  transition: transform var(--transition-fast), opacity var(--transition-fast);
}
.clear-option:hover .clear-option-arrow,
.clear-option:active .clear-option-arrow {
  transform: translateX(2px);
  opacity: 1;
}
/* 全部清除按钮：实心醒目，居中铺开 */
.btn-danger {
  padding: 9px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-rise);
  background: transparent;
  color: var(--color-rise);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  align-self: center;
  min-width: 160px;
}
.btn-danger:hover:not(:disabled) {
  background: var(--color-rise);
  color: #fff;
}
.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 767px) {
  .data-page { padding: var(--spacing-sm); }
  .data-header { padding: var(--spacing-sm) var(--spacing-md); }
}
</style>
