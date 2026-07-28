<template>
  <!--
    待确认计划列表（T+1 / T+2 加仓·减仓）。
    加仓/减仓提交后先生成 PendingAction，待净值确认日自动执行；
    在此可查看并撤销尚未执行的计划。逻辑全部走 holdingStore（getPendingByFund / cancelPendingAction）。
    fundCode 为空时展示全部待确认计划（全局视图，如管理页）；非空时只展示该基金的计划（详情页）。
  -->
  <div v-if="plans.length > 0" class="pending-plan-list">
    <div class="plan-head">
      <span class="plan-title">待确认计划</span>
      <span class="plan-count font-number">{{ plans.length }}</span>
    </div>

    <div v-for="p in plans" :key="p.id" class="plan-item">
      <div class="plan-main">
        <span :class="['plan-type', p.type === 'add' ? 'type-add' : 'type-reduce']">
          {{ p.type === 'add' ? '加仓' : '减仓' }}
        </span>
        <span v-if="showFund" class="plan-fund-name">{{ fundName(p.fundCode) }}</span>
        <span class="plan-amount font-number" :class="{ 'privacy-blur': !privacy.holding }">
          {{ p.type === 'add' ? '¥' : '' }}{{ formatAmount(p) }}{{ p.type === 'add' ? '' : ' 份' }}
        </span>
      </div>
      <div class="plan-meta">
        <span class="plan-date">{{ p.scheduledDate }} 确认</span>
        <button class="plan-cancel-btn" @click="onCancel(p)">取消计划</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 待确认计划列表组件 —— 详情页（单基金）与管理页（全局）共用。
 * 数据来自 holdingStore.pendingOnly（仅 status===Pending），取消调用 cancelPendingAction。
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { useFundStore } from '@/modules/fund/fund-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import { confirm } from '@/composables/use-confirm'
import type { PendingAction } from '@/modules/holding/holding-types'

const props = defineProps<{
  /** 限定基金代码；为空时展示全部待确认计划（全局视图） */
  fundCode?: string
}>()

const holdingStore = useHoldingStore()
const fundStore = useFundStore()
const settingsStore = useSettingsStore()
const privacy = computed(() => settingsStore.privacy)

/** 是否展示基金名（全局视图才需要，单基金视图无需重复展示当前基金名） */
const showFund = computed(() => !props.fundCode)

/** 待确认计划列表：单基金走 getPendingByFund，全局走 pendingOnly */
const plans = computed<PendingAction[]>(() =>
  props.fundCode ? holdingStore.getPendingByFund(props.fundCode) : holdingStore.pendingOnly,
)

function fundName(code: string): string {
  return fundStore.resolveFundName(code)
}

function formatAmount(p: PendingAction): string {
  // 加仓金额按元、2 位；减仓份额按份、2 位
  return p.type === 'add'
    ? p.amount.toFixed(2)
    : p.amount.toFixed(2)
}

async function onCancel(p: PendingAction): Promise<void> {
  const actionLabel = p.type === 'add' ? `加仓 ¥${p.amount.toFixed(2)}` : `减仓 ${p.amount.toFixed(2)} 份`
  const fundLabel = props.fundCode ? '' : `「${fundStore.resolveFundName(p.fundCode)}」`
  const confirmed = await confirm({
    title: '取消待确认计划',
    desc: `确认取消${fundLabel}的${actionLabel}计划？取消后将不会在 ${p.scheduledDate} 执行。`,
    confirmText: '确认取消',
    cancelText: '保留',
  })
  if (!confirmed) return
  const ok = holdingStore.cancelPendingAction(p.id)
  if (ok) ElMessage.success('已取消该计划')
  else ElMessage.warning('该计划已执行或不存在，无法取消')
}
</script>

<style scoped>
.pending-plan-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
}

.plan-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.plan-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.plan-count {
  font-size: 10px;
  color: var(--color-primary-light);
  background: var(--color-primary-glow);
  padding: 0 6px;
  border-radius: var(--radius-full);
  line-height: 1.6;
}

.plan-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 6px 0;
  border-top: 1px solid var(--border-default);
}
.plan-item:first-of-type { border-top: none; }

.plan-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.plan-type {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.type-add { background: rgba(239,68,68,0.12); color: #ef4444; }
.type-reduce { background: rgba(34,197,94,0.12); color: #22c55e; }

.plan-fund-name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.plan-amount {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.plan-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.plan-date {
  font-size: 10px;
  color: var(--text-muted);
}

.plan-cancel-btn {
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.plan-cancel-btn:hover {
  border-color: #f59e0b;
  color: #f59e0b;
  background: rgba(245,158,11,0.08);
}
</style>
