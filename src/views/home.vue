<template>
  <div class="manage-page">
    <!-- 固定头部 -->
    <header class="manage-header glass-card">
      <button class="back-btn" @click="router.back()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        <span>返回</span>
      </button>
      <h2 class="page-title">基金管理</h2>
      <div class="header-placeholder"></div>
    </header>

    <!-- 可滚动主体 -->
    <div class="manage-body">
      <!-- 批量工具栏 -->
      <div class="batch-bar glass-card">
        <div class="batch-select-all" @click="toggleSelectAll">
          <input
            type="checkbox"
            :checked="allSelected"
            :indeterminate.prop="someSelected"
            class="batch-checkbox"
            tabindex="-1"
            style="pointer-events: none"
          />
          <span>全选</span>
          <span v-if="selectedCodes.length > 0" class="batch-count">已选 {{ selectedCodes.length }} 项</span>
        </div>
        <div class="batch-actions" v-if="selectedCodes.length > 0">
          <button class="batch-btn" @click="batchClear">清空持仓</button>
          <button class="batch-btn batch-del-btn" @click="batchDelete">删除基金</button>
        </div>
      </div>

      <!-- 基金卡片列表 -->
      <div class="fund-cards">
        <div v-for="code in fundStore.fundCodes" :key="code" class="fund-op-card glass-card" :class="{ 'card-selected': selectedCodes.includes(code) }">
          <div class="card-row-top">
            <div class="card-checkbox" @click="toggleSelect(code)">
              <input type="checkbox" :checked="selectedCodes.includes(code)" class="batch-checkbox" tabindex="-1" style="pointer-events: none" />
            </div>
            <div class="card-info">
              <span class="card-name">{{ fundStore.resolveFundName(code) }}</span>
              <span class="card-code-badge font-number">{{ code }}</span>
            </div>
            <div class="card-data">
              <span v-if="getHoldingAmount(code) > 0" class="card-holding font-number">
                ¥{{ getHoldingAmount(code).toFixed(2) }}
              </span>
              <span v-else class="text-muted card-holding">暂无持仓</span>
              <span v-if="getHoldingAmount(code) > 0" :class="['card-profit font-number', getTodayProfit(code) > 0 ? 'text-rise' : getTodayProfit(code) < 0 ? 'text-fall' : 'text-flat']">
                今日 {{ getTodayProfit(code) > 0 ? '+' : '' }}{{ getTodayProfit(code).toFixed(2) }}
              </span>
            </div>
          </div>

          <!-- 操作按钮行 -->
          <div class="card-btns">
            <template v-if="getHoldingAmount(code) > 0">
              <button class="op-btn" :class="{ 'op-active': activeForm[code] === 'add' }" @click="toggleForm(code, 'add')">加仓</button>
              <button class="op-btn" :class="{ 'op-active': activeForm[code] === 'reduce' }" @click="toggleForm(code, 'reduce')">减仓</button>
              <button class="op-btn" :class="{ 'op-active': activeForm[code] === 'edit' }" @click="toggleForm(code, 'edit')">编辑</button>
              <button class="op-btn op-danger" @click="confirmClearHolding(code)">清空</button>
            </template>
            <template v-else>
              <button class="op-btn" :class="{ 'op-active': activeForm[code] === 'edit' }" @click="toggleForm(code, 'edit')">录入持仓</button>
            </template>
            <button class="op-btn op-del" @click="confirmDelete(code)">删除</button>
          </div>

          <!-- 展开表单 -->
          <Transition name="form-slide">
            <div v-if="activeForm[code]" class="op-form">
              <!-- 加仓表单 -->
              <template v-if="activeForm[code] === 'add'">
                <h4 class="form-title">加仓</h4>
                <div class="form-row">
                  <label class="form-label">投入金额</label>
                  <input v-model.number="formData[code].amount" type="number" min="0" class="form-input" placeholder="元" />
                </div>
                <div class="form-hint">参考净值：{{ getReferenceNav(code).toFixed(4) }}</div>
                <div class="form-actions">
                  <button class="form-btn form-cancel" @click="closeForm(code)">取消</button>
                  <button class="form-btn form-confirm" @click="submitAdd(code)">确认加仓</button>
                </div>
              </template>

              <!-- 减仓表单 -->
              <template v-else-if="activeForm[code] === 'reduce'">
                <h4 class="form-title">减仓</h4>
                <div class="form-row">
                  <label class="form-label">赎回份额</label>
                  <input v-model.number="formData[code].shares" type="number" min="0" class="form-input" placeholder="份" />
                </div>
                <div class="form-hint">当前持有：{{ holdingStore.getTotalShares(code).toFixed(2) }} 份</div>
                <div class="form-actions">
                  <button class="form-btn form-cancel" @click="closeForm(code)">取消</button>
                  <button class="form-btn form-confirm" @click="submitReduce(code)">确认减仓</button>
                </div>
              </template>

              <!-- 编辑/录入持仓 -->
              <template v-else-if="activeForm[code] === 'edit'">
                <h4 class="form-title">{{ getHoldingAmount(code) > 0 ? '编辑持仓' : '录入持仓' }}</h4>
                <div class="form-row">
                  <label class="form-label">持仓金额</label>
                  <input v-model.number="formData[code].holdingAmount" type="number" min="0" class="form-input" placeholder="元" />
                </div>
                <div class="form-row">
                  <label class="form-label">累计收益</label>
                  <input v-model.number="formData[code].totalProfit" type="number" class="form-input" placeholder="元（正盈负亏）" />
                </div>
                <div class="form-hint">投入本金 = ¥{{ calcPrincipal(code).toFixed(2) }}</div>
                <div class="form-actions">
                  <button class="form-btn form-cancel" @click="closeForm(code)">取消</button>
                  <button class="form-btn form-confirm" @click="submitEdit(code)">确认修改</button>
                </div>
              </template>
            </div>
          </Transition>

          <!-- 待确认计划（加仓/减仓，T+1 确认前可撤销） -->
          <PendingPlanList :fund-code="code" />
        </div>

        <div v-if="fundStore.fundCodes.length === 0" class="empty-tip">
          <p class="text-muted">暂无关注基金，请在首页搜索添加</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useFundStore } from '@/modules/fund/fund-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { removeKnownManager } from '@/composables/use-manager-check'
import { confirm } from '@/composables/use-confirm'
import PendingPlanList from '@/components/shared/pending-plan-list.vue'

const router = useRouter()
const fundStore = useFundStore()
const holdingStore = useHoldingStore()

// ===== 批量选择 =====
const selectedCodes = ref<string[]>([])

const allSelected = computed(() =>
  fundStore.fundCodes.length > 0 && selectedCodes.value.length === fundStore.fundCodes.length
)
const someSelected = computed(() =>
  selectedCodes.value.length > 0 && selectedCodes.value.length < fundStore.fundCodes.length
)

function toggleSelect(code: string): void {
  // 用整体赋值而非 splice/push，确保响应式触发（与全选一致）
  if (selectedCodes.value.includes(code)) {
    selectedCodes.value = selectedCodes.value.filter(c => c !== code)
  } else {
    selectedCodes.value = [...selectedCodes.value, code]
  }
}

function toggleSelectAll(): void {
  if (allSelected.value) {
    selectedCodes.value = []
  } else {
    selectedCodes.value = [...fundStore.fundCodes]
  }
}

async function batchClear(): Promise<void> {
  const ok = await confirm({
    title: '批量清空持仓',
    desc: `确认清空选中的 ${selectedCodes.value.length} 只基金的持仓数据？`,
    confirmText: '确认清空',
    cancelText: '取消',
  })
  if (!ok) return
  for (const code of selectedCodes.value) {
    holdingStore.settleAllByFund(code)
  }
  ElMessage.success(`已清空 ${selectedCodes.value.length} 只基金的持仓`)
  selectedCodes.value = []
}

async function batchDelete(): Promise<void> {
  const ok = await confirm({
    title: '批量删除',
    desc: `确认删除选中的 ${selectedCodes.value.length} 只基金？持仓数据将一并清除。`,
    confirmText: '确认删除',
    cancelText: '取消',
  })
  if (!ok) return
  for (const code of selectedCodes.value) {
    fundStore.removeFund(code)
    holdingStore.removeHoldingsByFund(code)
    removeKnownManager(code)
  }
  ElMessage.success(`已删除 ${selectedCodes.value.length} 只基金`)
  selectedCodes.value = []
}

// ===== 单只操作 =====
const activeForm = reactive<Record<string, 'add' | 'reduce' | 'edit' | null>>({})
// 输入框默认空（''），避免显示 0 需手动删除；编辑时预填真实已有数据
const formData = reactive<Record<string, {
  amount: number | ''
  shares: number | ''
  holdingAmount: number | ''
  totalProfit: number | ''
}>>({})

function ensureFormData(code: string): void {
  if (!formData[code]) {
    formData[code] = {
      amount: '',
      shares: '',
      holdingAmount: '',
      totalProfit: '',
    }
  }
}

function toggleForm(code: string, type: 'add' | 'reduce' | 'edit'): void {
  ensureFormData(code)
  if (activeForm[code] === type) {
    activeForm[code] = null
  } else {
    if (type === 'edit') {
      // 编辑/录入：有持仓预填真实已有数据，无持仓保持空便于录入
      const v = fundStore.getValuation(code)
      const holdAmt = holdingStore.getFundHoldingAmount(code, v?.dwjz, v?.gszzl, v?.isEstimated)
      if (holdAmt > 0) {
        const principal = holdingStore.getPrincipal(code)
        formData[code].holdingAmount = parseFloat(holdAmt.toFixed(2))
        formData[code].totalProfit = parseFloat((holdAmt - principal).toFixed(2))
      } else {
        formData[code].holdingAmount = ''
        formData[code].totalProfit = ''
      }
    }
    activeForm[code] = type
  }
}

function closeForm(code: string): void {
  activeForm[code] = null
}

function getHoldingAmount(code: string): number {
  const v = fundStore.getValuation(code)
  return holdingStore.getFundHoldingAmount(code, v?.dwjz, v?.gszzl, v?.isEstimated)
}

function getTodayProfit(code: string): number {
  const v = fundStore.getValuation(code)
  return holdingStore.calcFundTodayProfit(code, 0, v?.dwjz, v?.gszzl, v?.isEstimated, holdingStore.resolveGszzlDate(v))
}

function getReferenceNav(code: string): number {
  return fundStore.getValuation(code)?.dwjz ?? 0
}

function calcPrincipal(code: string): number {
  const d = formData[code]
  if (!d) return 0
  return Math.max(0, (d.holdingAmount || 0) - (d.totalProfit || 0))
}

function submitAdd(code: string): void {
  const d = formData[code]
  const nav = getReferenceNav(code)
  if (!d.amount || d.amount <= 0) { ElMessage.warning('请输入有效金额'); return }
  if (nav <= 0) { ElMessage.warning('当前净值不可用'); return }
  const delayDays = fundStore.getValuation(code)?.delayDays ?? 1
  holdingStore.createPendingAdd(code, d.amount, nav, delayDays)
  ElMessage.success('加仓申请已提交，待净值确认后生效')
  closeForm(code)
  d.amount = ''
}

function submitReduce(code: string): void {
  const d = formData[code]
  const nav = getReferenceNav(code)
  if (!d.shares || d.shares <= 0) { ElMessage.warning('请输入有效份额'); return }
  if (nav <= 0) { ElMessage.warning('当前净值不可用'); return }
  const delayDays = fundStore.getValuation(code)?.delayDays ?? 1
  holdingStore.createPendingReduce(code, d.shares, nav, delayDays)
  ElMessage.success('减仓申请已提交，待净值确认后生效')
  closeForm(code)
  d.shares = ''
}

function submitEdit(code: string): void {
  const d = formData[code]
  if (!d.holdingAmount || d.holdingAmount <= 0) { ElMessage.warning('请输入持仓金额'); return }
  const nav = getReferenceNav(code)
  const refNav = nav > 0 ? nav : 1
  const estimatedShares = d.holdingAmount / refNav
  const v = fundStore.getValuation(code)
  holdingStore.addHoldingDirect(
    code, estimatedShares, refNav, d.holdingAmount,
    d.totalProfit === '' ? 0 : d.totalProfit,
    { gszzl: v?.gszzl, isEstimated: v?.isEstimated, jzrq: v?.jzrq },
  )
  ElMessage.success('持仓已更新')
  closeForm(code)
}

async function confirmClearHolding(code: string): Promise<void> {
  const name = fundStore.resolveFundName(code)
  const ok = await confirm({
    title: '清空持仓',
    desc: `确认清空「${name}」的持仓数据？`,
    confirmText: '确认清空',
    cancelText: '取消',
  })
  if (!ok) return
  holdingStore.settleAllByFund(code)
  closeForm(code)
  ElMessage.success('已清空持仓')
}

async function confirmDelete(code: string): Promise<void> {
  const name = fundStore.resolveFundName(code)
  const ok = await confirm({
    title: '删除确认',
    desc: `确认删除「${name}」？持仓数据将一并清除。`,
    confirmText: '确认删除',
    cancelText: '取消',
  })
  if (!ok) return
  fundStore.removeFund(code)
  holdingStore.removeHoldingsByFund(code)
  removeKnownManager(code)
  const idx = selectedCodes.value.indexOf(code)
  if (idx >= 0) selectedCodes.value.splice(idx, 1)
  ElMessage.success('已删除')
}
</script>

<style scoped>
/* ===== 页面布局 ===== */
.manage-page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--spacing-md);
  /* 底部为悬浮导航栏预留空间，使滚动区域止于导航上方，内容不从导航两侧间隙露出 */
  padding-bottom: calc(var(--spacing-md) + 56px + env(safe-area-inset-bottom, 0px));
  gap: var(--spacing-sm);
}

/* ===== 头部（固定，不滚动） ===== */
.manage-header {
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

/* ===== 可滚动主体 ===== */
.manage-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  width: 100%;
  /* 内容底部与底部栏目之间留一点空白间隙 */
  padding-bottom: var(--spacing-sm);
}

/* ===== 批量工具栏 ===== */
.batch-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: 8px var(--spacing-md);
}
.batch-select-all {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  user-select: none;
}
.batch-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
  cursor: pointer;
  flex-shrink: 0;
}
/* 选中态：勾选标记在深色背景下确保可见 */
.batch-checkbox:checked {
  box-shadow: 0 0 0 2px rgba(99,102,241,0.25);
}
.batch-count {
  font-size: 12px;
  color: var(--color-primary-light);
  font-weight: 500;
}
.batch-actions {
  margin-left: auto;
  display: flex;
  gap: var(--spacing-sm);
}
.batch-btn {
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: all var(--transition-fast);
}
.batch-btn:hover { border-color: var(--color-primary); color: var(--color-primary-light); }
.batch-del-btn:hover { border-color: var(--color-rise); color: var(--color-rise); background: rgba(239,68,68,0.08); }

/* ===== 基金卡片 ===== */
.fund-cards {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}
.fund-op-card {
  padding: var(--spacing-md);
  transition: all var(--transition-fast);
}
.fund-op-card.card-selected {
  border-color: rgba(99,102,241,0.55);
  background: rgba(99,102,241,0.08);
  box-shadow: 0 0 0 1px rgba(99,102,241,0.35) inset;
}
.card-row-top {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
}
.card-checkbox { display: flex; align-items: center; padding-top: 2px; cursor: pointer; }
.card-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.card-name {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-code-badge {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.card-data {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}
.card-holding { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.card-profit { font-size: 11px; }

/* 操作按钮行 */
.card-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: var(--spacing-sm);
}
.op-btn {
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: all var(--transition-fast);
}
.op-btn:hover { border-color: var(--color-primary); color: var(--color-primary-light); background: var(--color-primary-glow); }
.op-btn.op-active { border-color: var(--color-primary); color: var(--color-primary-light); background: rgba(99,102,241,0.12); }
.op-danger:hover { border-color: #f59e0b; color: #f59e0b; background: rgba(245,158,11,0.08); }
.op-del { margin-left: auto; }
.op-del:hover { border-color: var(--color-rise); color: var(--color-rise); background: rgba(239,68,68,0.08); }

/* 展开表单 */
.op-form {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
}
.form-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: var(--spacing-sm); }
.form-row { display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: 8px; }
.form-label { font-size: 12px; color: var(--text-muted); width: 56px; flex-shrink: 0; }
.form-input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color var(--transition-fast);
}
.form-input:focus { border-color: var(--color-primary); }
.form-hint { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; }
.form-btn {
  height: 28px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  transition: all var(--transition-fast);
}
.form-cancel { color: var(--text-muted); }
.form-cancel:hover { color: var(--text-primary); }
.form-confirm { border-color: rgba(99,102,241,0.5); color: var(--color-primary-light); background: var(--color-primary-glow); }
.form-confirm:hover { background: rgba(99,102,241,0.18); border-color: var(--color-primary); }

/* 表单展开动画 */
.form-slide-enter-active,
.form-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.form-slide-enter-from,
.form-slide-leave-to { max-height: 0; opacity: 0; margin-top: 0; }
.form-slide-enter-to,
.form-slide-leave-from { max-height: 300px; opacity: 1; }

/* 空状态 */
.empty-tip { display: flex; align-items: center; justify-content: center; padding: var(--spacing-2xl); }

@media (max-width: 767px) {
  .manage-body { padding: var(--spacing-sm); }
}
</style>
