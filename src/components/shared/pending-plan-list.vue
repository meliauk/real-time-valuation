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
        <span class="plan-date" :class="statusClass(p)">{{ statusText(p) }}</span>
        <button class="plan-cancel-btn" @click="onCancel(p)">{{ isFailed(p) ? '清除' : '取消计划' }}</button>
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
import { PendingActionStatus } from '@/modules/holding/holding-types'

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

/** 待确认计划列表：单基金走 getPendingByFund，全局走 pendingOrFailed。
 *  含 Failed（超期未能自动入账）——必须可见，否则用户不知道计划没生效。 */
const plans = computed<PendingAction[]>(() =>
  props.fundCode ? holdingStore.getPendingByFund(props.fundCode) : holdingStore.pendingOrFailed,
)

function isFailed(p: PendingAction): boolean {
  return p.status === PendingActionStatus.Failed
}

/** 日期 YYYY-MM-DD → M.D（如 2026-08-05 → 8.5），与用户口语一致，也更省横向空间 */
function shortDate(date: string): string {
  const [, m, d] = date.split('-')
  if (!m || !d) return date
  return `${Number(m)}.${Number(d)}`
}

/** 状态文案。
 *  正常等待：「待 8.5 日净值更新确认」——T+1 是当天、T+2 是次日，日期由 scheduledDate 直接反映，
 *  两者共用一套文案即可，无需按 delayDays 分支。
 *  异常（计划日已过仍取不到净值）：追加重试次数，让用户知道系统在持续尝试而非卡死。 */
function statusText(p: PendingAction): string {
  if (isFailed(p)) return `${shortDate(p.scheduledDate)} 日未成交${p.failedReason ? `（${p.failedReason}）` : ''}`
  const tried = p.attemptCount ?? 0
  const base = `待 ${shortDate(p.scheduledDate)} 日净值更新确认`
  return tried > 0 ? `${base}（已重试 ${tried} 次）` : base
}

function statusClass(p: PendingAction): string {
  return isFailed(p) ? 'status-failed' : ''
}

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
    title: isFailed(p) ? '清除未成交计划' : '取消待确认计划',
    desc: isFailed(p)
      ? `${fundLabel}的${actionLabel}计划在 ${p.scheduledDate} 未能成交，已不会再自动执行。清除后如仍需操作请重新提交。`
      : `确认取消${fundLabel}的${actionLabel}计划？取消后将不会在 ${p.scheduledDate} 执行。`,
    confirmText: isFailed(p) ? '清除' : '确认取消',
    cancelText: '保留',
  })
  if (!confirmed) return
  const ok = holdingStore.cancelPendingAction(p.id)
  if (ok) ElMessage.success(isFailed(p) ? '已清除该计划' : '已取消该计划')
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
  /* 窄屏换行：状态文案（「待 8.5 日净值更新确认（已重试 N 次）」）较长，
     与左侧金额挤在一行会溢出重叠。允许换行后，空间不足时 .plan-meta 整体落到第二行。 */
  flex-wrap: wrap;
  row-gap: 4px;
}
.plan-item:first-of-type { border-top: none; }

.plan-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
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
  /* 金额不参与压缩：早期无此保护，状态文案变长时金额被挤压与日期重叠 */
  flex-shrink: 0;
  white-space: nowrap;
}

.plan-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 不再 flex-shrink:0——它会强占宽度把左侧金额挤到重叠。
     改为可收缩 + 允许整体换行，宽度不足时自然落到第二行右对齐。 */
  flex: 0 1 auto;
  min-width: 0;
  margin-left: auto;
}
.plan-date {
  font-size: 10px;
  color: var(--text-muted);
  min-width: 0;
  /* 极窄屏兜底：文案再长也不撑破容器 */
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 超期未成交：红色，提示需用户手动处理 */
.plan-date.status-failed {
  color: #ef4444;
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
