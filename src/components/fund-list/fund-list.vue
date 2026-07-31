<template>
  <!-- 基金列表 - 表格视图 / 卡片视图 双模式 -->
  <div class="fund-list-container">

    <!-- 卡片视图工具栏（视图切换 + 操作）——位于滚动区之外，固定不随滚动隐藏，避开 sticky 交互 bug -->
    <div v-if="viewMode === 'card'" class="card-toolbar">
      <button class="hdr-btn" @click="toggleViewMode" title="切换表格视图">
        <el-icon><List /></el-icon>
        <span style="font-size:11px; margin-left:4px">表格</span>
      </button>
      <el-dropdown trigger="click" placement="bottom-start" popper-class="sort-popper" @command="handleSortCommand">
        <button class="hdr-btn sort-btn" title="排序">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
          </svg>
          <span class="sort-label">{{ currentSortLabel }}</span>
          <span class="sort-dir" :class="{ 'is-asc': sortDirection === 'asc' }">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="opt in SORT_FIELDS"
              :key="opt.field"
              :command="opt.field"
              :class="{ 'is-active-sort': sortField === opt.field }"
            >
              <span class="sort-field-label">{{ opt.label }}</span>
              <span v-if="sortField === opt.field" class="sort-field-arrow" :class="{ 'is-asc': sortDirection === 'asc' }">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button class="hdr-btn manage-btn" @click="goManage">操作</button>
      <!-- 隐私眼睛 -->
      <PrivacyPopover v-model:visible="privacyPopoverVisible" />
    </div>

    <!-- 列表内容区（可滚动） -->
    <div class="list-body">

      <!-- 表格视图 -->
      <div v-if="viewMode === 'table'" class="table-view animate-fade-in">
        <div class="glass-card table-scroll">
          <table class="fund-table">
            <thead>
              <tr>
                <!-- ctrl 列表头：视图切换 + 排序下拉 + 操作 -->
                <th class="col-ctrl sticky-col-header">
                  <div class="ctrl-header">
                    <!-- 卡片/表格切换 -->
                    <button class="hdr-btn" @click="toggleViewMode" :title="viewMode === 'table' ? '切换卡片视图' : '切换表格视图'">
                      <el-icon v-if="viewMode === 'table'"><Grid /></el-icon>
                      <el-icon v-else><List /></el-icon>
                    </button>
                    <!-- 排序下拉 -->
                    <el-dropdown trigger="click" placement="bottom-start" popper-class="sort-popper" @command="handleSortCommand">
                      <button class="hdr-btn" title="排序">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
                        </svg>
                      </button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item
                            v-for="opt in SORT_FIELDS"
                            :key="opt.field"
                            :command="opt.field"
                            :class="{ 'is-active-sort': sortField === opt.field }"
                          >
                            <span class="sort-field-label">{{ opt.label }}</span>
                            <span v-if="sortField === opt.field" class="sort-field-arrow" :class="{ 'is-asc': sortDirection === 'asc' }">
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </span>
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                    <!-- 操作跳转 -->
                    <button class="hdr-btn manage-btn" @click="goManage" title="基金管理">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                      </svg>
                    </button>
                    <!-- 隐私眼睛 -->
                    <PrivacyPopover v-model:visible="privacyPopoverVisible" />
                  </div>
                </th>
                <th class="col-todayProfit">今日收益</th>
                <th class="col-totalProfit">累计收益</th>
                <th class="col-lastNetValue">昨日净值</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in sortedRows"
                :key="row.fundCode"
                :data-fund-row="row.fundCode"
                class="fund-row animate-stagger"
                :class="{ 'longpress-active': popup.visible && popup.fundCode === row.fundCode }"
                @click="handleRowClick(row.fundCode)"
                @touchstart.passive="onTouchStart($event, row.fundCode)"
                @touchmove.passive="onTouchMove($event)"
                @touchend="onTouchEnd($event)"
                @mousedown="onMouseDown($event, row.fundCode)"
                @mousemove="onMouseMove($event)"
                @mouseup="onMouseUp()"
                @mouseleave="cancelLongPress()"
                @contextmenu.prevent="onContextMenu"
              >
                <!-- ctrl 列：基金名称 + (持仓金额 估值日期) + [已更新 盘中涨跌] -->
                <td class="col-ctrl fund-ctrl-cell sticky-col">
                  <div class="ctrl-stack">
                    <span class="ctrl-name">{{ truncateName(row.fundName) }}</span>
                    <div class="ctrl-holding-row">
                      <span v-if="row.holdingAmount > 0" :class="['ctrl-holding', !p.holding && 'privacy-blur']">
                        ¥{{ formatCompactMoney(row.holdingAmount) }}
                      </span>
                      <span v-else class="ctrl-holding text-muted">--</span>
                      <span class="ctrl-date">{{ formatDate(row.valuationTime) }}</span>
                    </div>
                    <!-- 实时涨跌幅 + 已更新徽章：实时在左、已更新在右。
                         「预测」靠持仓占比加权，占比有效(移动端 API 取到)即显示，与详情页同口径。 -->
                    <div v-if="row.isUpdated || (row.realtimeGszzl != null && isRealtimeBadgeVisible(row.realtimeSource, row.hasHoldingsRatio))" class="ctrl-status-row">
                      <span v-if="row.realtimeGszzl != null && isRealtimeBadgeVisible(row.realtimeSource, row.hasHoldingsRatio)" :class="['ctrl-realtime', row.realtimeGszzl > 0 ? 'rt-rise' : row.realtimeGszzl < 0 ? 'rt-fall' : 'rt-flat', row.realtimePlaceholder && 'rt-placeholder']">
                        <span class="rt-dot"></span>
                        <span class="rt-value">{{ row.realtimeGszzl > 0 ? '+' : '' }}{{ row.realtimeGszzl.toFixed(2) }}%</span>
                        <span class="rt-label">{{ row.realtimeSource || '实时' }}</span>
                      </span>
                      <span v-if="row.isUpdated" class="ctrl-updated">更新</span>
                    </div>
                  </div>
                </td>

                <!-- 今日收益：有持仓显示金额+收益率，无持仓主行--、副行今日涨幅（与有持仓双行布局对齐） -->
                <td class="col-todayProfit">
                  <template v-if="row.holdingAmount > 0">
                    <div class="dual-row">
                      <span :class="['dual-main dual-main-profit font-number', row.todayProfit > 0 ? 'text-rise' : row.todayProfit < 0 ? 'text-fall' : 'text-flat', !p.todayProfit && 'privacy-blur']">
                        {{ formatProfitCompact(row.todayProfit) }}
                      </span>
                      <span v-if="row.hasTodayData" :class="['dual-sub font-number', row.changeRate > 0 ? 'text-rise' : row.changeRate < 0 ? 'text-fall' : 'text-flat', !p.todayRate && 'privacy-blur']">
                        {{ row.changeRate > 0 ? '+' : '' }}{{ row.changeRate.toFixed(2) }}%
                      </span>
                      <span v-else class="dual-sub font-number text-muted">--</span>
                    </div>
                  </template>
                  <div v-else class="dual-row">
                    <span class="dual-main font-number text-muted">--</span>
                    <span v-if="row.hasTodayData" :class="['dual-sub font-number', row.changeRate > 0 ? 'text-rise' : row.changeRate < 0 ? 'text-fall' : 'text-flat', !p.todayRate && 'privacy-blur']">
                      {{ row.changeRate > 0 ? '+' : '' }}{{ row.changeRate.toFixed(2) }}%
                    </span>
                    <span v-else class="dual-sub font-number text-muted">--</span>
                  </div>
                </td>

                <!-- 累计收益：有持仓显示金额+收益率，无持仓双行均显示-- -->
                <td class="col-totalProfit">
                  <template v-if="row.holdingAmount > 0">
                    <div class="dual-row">
                      <span :class="['dual-main dual-main-profit font-number', row.totalProfit > 0 ? 'text-rise' : row.totalProfit < 0 ? 'text-fall' : 'text-flat', !p.totalProfit && 'privacy-blur']">
                        {{ formatProfitCompact(row.totalProfit) }}
                      </span>
                      <span v-if="row.totalReturnRate != null" :class="['dual-sub font-number', row.totalReturnRate > 0 ? 'text-rise' : row.totalReturnRate < 0 ? 'text-fall' : 'text-flat', !p.totalRate && 'privacy-blur']">
                        {{ row.totalReturnRate > 0 ? '+' : '' }}{{ row.totalReturnRate.toFixed(2) }}%
                      </span>
                    </div>
                  </template>
                  <div v-else class="dual-row">
                    <span class="dual-main font-number text-muted">--</span>
                    <span class="dual-sub font-number text-muted">--</span>
                  </div>
                </td>

                <!-- 最新净值：上一个已确认净值 dwjz + 那天真实涨跌幅 netChangeRate（同日期配对） -->
                <td class="col-lastNetValue">
                  <div class="dual-row">
                    <span class="dual-main font-number">{{ row.currentNav.toFixed(4) }}</span>
                    <span :class="['dual-sub font-number', row.netChangeRate > 0 ? 'text-rise' : row.netChangeRate < 0 ? 'text-fall' : 'text-flat']">
                      {{ row.netChangeRate > 0 ? '+' : '' }}{{ row.netChangeRate.toFixed(2) }}%
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 卡片视图 -->
      <div v-if="viewMode === 'card'" class="card-view">
        <!-- 卡片视图工具栏已移至 list-body 外层，固定不随滚动隐藏 -->

        <div v-for="row in sortedRows" :key="row.fundCode" :data-fund-row="row.fundCode" class="fund-card animate-stagger" :class="{ 'longpress-active': popup.visible && popup.fundCode === row.fundCode }" @click="handleCardClick(row.fundCode)" @touchstart.passive="onTouchStart($event, row.fundCode)" @touchmove.passive="onTouchMove($event)" @touchend="onTouchEnd($event)" @mousedown="onMouseDown($event, row.fundCode)" @mousemove="onMouseMove($event)" @mouseup="onMouseUp()" @mouseleave="cancelLongPress()" @contextmenu.prevent="onContextMenu">
          <div class="card-top">
            <div class="card-identity">
              <span class="card-name-wrap">
                <span v-if="!row.isEstimated" class="confirmed-badge">✓</span>
                <span class="card-code font-number">{{ row.fundCode }}</span>
                <span class="card-name" :title="row.fundName">{{ row.fundName }}</span>
              </span>
            </div>
            <ChangeIndicator :value="row.hasTodayData ? row.changeRate : null" type="rate" hide-arrow :class="{ 'privacy-blur': !p.todayRate }" />
          </div>

          <div class="card-body">
            <div class="card-metrics">
              <div class="metric">
                <span class="metric-value font-number">{{ row.lastNetValue.toFixed(4) }}</span>
                <span class="metric-label">昨日净值</span>
              </div>
              <div class="metric">
                <span :class="['metric-value', 'font-number', row.holdingAmount > 0 ? '' : 'text-muted', row.holdingAmount > 0 && !p.holding ? 'privacy-blur' : '']">
                  {{ row.holdingAmount > 0 ? '¥' + formatCompactMoney(row.holdingAmount) : '--' }}
                </span>
                <span class="metric-label">持仓金额</span>
              </div>
              <div class="metric">
                <span v-if="row.holdingAmount > 0" :class="['metric-value', 'font-number', row.todayProfit > 0 ? 'text-rise' : row.todayProfit < 0 ? 'text-fall' : 'text-flat', !p.todayProfit && 'privacy-blur']">
                  {{ formatProfitCompact(row.todayProfit) }}
                </span>
                <span v-else class="metric-value font-number text-muted">--</span>
                <span class="metric-label">今日收益</span>
              </div>
              <div class="metric">
                <span v-if="row.holdingAmount > 0" :class="['metric-value', 'font-number', row.totalProfit > 0 ? 'text-rise' : row.totalProfit < 0 ? 'text-fall' : 'text-flat', !p.totalProfit && 'privacy-blur']">
                  {{ formatProfitCompact(row.totalProfit) }}
                </span>
                <span v-else class="metric-value font-number text-muted">--</span>
                <span class="metric-label">累计收益</span>
              </div>
              <div class="metric">
                <span v-if="row.holdingAmount > 0 && row.totalReturnRate != null" :class="['metric-value', 'font-number', row.totalReturnRate > 0 ? 'text-rise' : row.totalReturnRate < 0 ? 'text-fall' : 'text-flat', !p.totalRate && 'privacy-blur']">
                  {{ row.totalReturnRate > 0 ? '+' : '' }}{{ row.totalReturnRate.toFixed(2) }}%
                </span>
                <span v-else class="metric-value font-number text-muted">--</span>
                <span class="metric-label">收益率</span>
              </div>
              <div v-if="row.realtimeGszzl != null && isRealtimeBadgeVisible(row.realtimeSource, row.hasHoldingsRatio)" class="metric">
                <span :class="['realtime-badge', row.realtimeGszzl > 0 ? 'rt-rise' : row.realtimeGszzl < 0 ? 'rt-fall' : 'rt-flat', row.realtimePlaceholder && 'rt-placeholder']">
                  <span class="rt-dot"></span>
                  <span class="rt-value">{{ row.realtimeGszzl > 0 ? '+' : '' }}{{ row.realtimeGszzl.toFixed(2) }}%</span>
                </span>
                <span class="metric-label">{{ row.realtimeSource || '实时' }}</span>
              </div>
            </div>
            <div class="card-sparkline">
              <FundSparkline :points="row.intradayPoints" :change-rate="row.changeRate" :base-value="row.intradayBaseValue" />
            </div>
          </div>

          <div class="card-bottom">
            <span class="card-time text-muted">{{ row.valuationTime }}</span>
            <button class="card-del" @click.stop="$emit('removeFund', row.fundCode)" title="删除">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="sortedRows.length === 0" class="empty-state animate-fade-in">
        <el-icon :size="48" class="text-muted"><Warning /></el-icon>
        <p class="text-muted">暂无关注基金，点击搜索按钮添加</p>
      </div>
    </div>

    <!-- 长按弹出菜单 -->
    <Teleport to="body">
      <div v-if="popup.visible" class="longpress-halo" :style="haloStyle"></div>
      <div v-if="popup.visible" class="longpress-popup" :class="{ 'popup-above': popup.placement === 'above' }" :style="{ left: popup.x + 'px', top: popup.y + 'px' }">
        <span class="popup-arrow" :style="{ left: popup.arrowX + 'px', marginLeft: '0' }"></span>
        <button class="popup-btn popup-edit" @click.stop="handlePopupEdit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          <span>编辑持仓</span>
        </button>
        <button class="popup-btn popup-clear" @click.stop="handlePopupClear">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>清空持仓</span>
        </button>
        <button class="popup-btn popup-delete" @click.stop="handlePopupDelete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
          <span>删除</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * 基金列表组件 - 表格/卡片双视图
 * ctrl 列：视图切换 + 排序下拉 + 操作跳转
 * 点击行 → router.push('/fund/:code')
 * 长按 → 浮动菜单（编辑持仓/清空/删除）
 */

import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { List, Grid, Delete, Warning } from '@element-plus/icons-vue'
import ChangeIndicator from '@/components/shared/change-indicator.vue'
import FundSparkline from '@/components/fund-list/fund-sparkline.vue'
import PrivacyPopover from '@/components/shared/privacy-popover.vue'
import { useSettingsStore } from '@/modules/settings/settings-store'
import type { FundRowData } from '@/composables/use-fund-data'
import type { ViewMode, SortField, SortDirection } from '@/modules/fund/fund-types'
import { STORAGE_KEYS } from '@/config/constants'
import { formatProfitCompact, formatCompactMoney } from '@/shared/utils/money-format'

const props = defineProps<{
  sortedRows: FundRowData[]
  viewMode: ViewMode
  sortField: SortField
  sortDirection: SortDirection
}>()

const emit = defineEmits<{
  removeFund: [fundCode: string]
  changeViewMode: [mode: ViewMode]
  changeSort: [field: SortField, dir: SortDirection]
  clearHoldings: [fundCode: string]
  quickRemoveFund: [fundCode: string]
}>()

const router = useRouter()
const settingsStore = useSettingsStore()
const p = computed(() => settingsStore.privacy)
const privacyPopoverVisible = ref(false)

// ===== 排序选项 =====
// 每个字段只出现一次：首次点击按降序，再次点击同字段切换为升序，切换到别的字段则重置为降序。
interface SortFieldOption { label: string; field: SortField }
const SORT_FIELDS: SortFieldOption[] = [
  { label: '持有金额',   field: 'holdingAmount' },
  { label: '今日收益',   field: 'todayProfit' },
  { label: '今日收益率', field: 'changeRate' },
  { label: '累计收益',   field: 'totalProfit' },
  { label: '累计收益率', field: 'totalReturnRate' },
]

const currentSortLabel = computed(() => {
  const opt = SORT_FIELDS.find(o => o.field === props.sortField)
  return opt ? opt.label : '排序'
})

function handleSortCommand(field: SortField): void {
  // 首次点击某字段 → 降序；再次点击同字段 → 升序（在当前方向上翻转）；切换到别的字段 → 重新降序。
  const dir: SortDirection = props.sortField === field
    ? (props.sortDirection === 'desc' ? 'asc' : 'desc')
    : 'desc'
  emit('changeSort', field, dir)
}

// ===== 视图切换 =====
function toggleViewMode(): void {
  const next = props.viewMode === 'table' ? 'card' : 'table'
  emit('changeViewMode', next)
  localStorage.setItem(STORAGE_KEYS.VIEW_MODE, next)
}

// ===== 跳转 =====
function goManage(): void {
  router.push('/manage')
}

function handleRowClick(fundCode: string): void {
  if (longPressTriggered.value) { longPressTriggered.value = false; return }
  router.push(`/fund/${fundCode}`)
}

function handleCardClick(fundCode: string): void {
  if (longPressTriggered.value) { longPressTriggered.value = false; return }
  router.push(`/fund/${fundCode}`)
}

// ===== 工具函数 =====
function truncateName(name: string): string {
  if (!name) return '--'
  return name.length > 11 ? name.slice(0, 11) + '…' : name
}

/** 估值日期：取 YYYY-MM-DD（valuationTime 已由 formatValuationTimeWithSeconds 格式化） */
function formatDate(timeStr: string): string {
  if (!timeStr) return '--'
  // 形如 2024-01-15 或 2024-01-15 16:00:00，取前10位日期部分
  const date = timeStr.slice(0, 10)
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(date) ? date : (timeStr || '--')
}

/** 实时胶囊是否可见。
 *  与详情页 isHiddenRtSource 同口径：「预测」靠持仓占比加权推算，
 *  占比有效(移动端 API 取到前十大含占比)即显示，无占比时加权恒 0 无意义故隐藏。
 *  其它源（官方实时/休盘）正常显示。 */
function isRealtimeBadgeVisible(source: string | undefined, hasHoldingsRatio = true): boolean {
  if (!source) return true
  if (source === '预测') return hasHoldingsRatio
  return true
}

// ===== 长按弹出菜单 =====
const LONG_PRESS_DURATION = 600
const MOVE_THRESHOLD = 10

interface PopupState {
  visible: boolean
  fundCode: string
  x: number
  y: number
  arrowX: number
  placement: 'below' | 'above'
}

const popup = ref<PopupState>({ visible: false, fundCode: '', x: 0, y: 0, arrowX: 0, placement: 'below' })
const haloStyle = ref<Record<string, string>>({})
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressStartX = 0
let longPressStartY = 0
const longPressTriggered = ref(false)
// 长按弹窗弹出后，鼠标释放时浏览器会合成一次 mouseup→click（tail click）。
// 该 click 会被捕获阶段的 document 监听误判为"点击外部"而立即关闭弹窗，导致按钮一闪而过无法点选。
// 此标志在弹窗显示时置位，用于吸收这一次 tail click；在 hidePopup 中统一复位。
const suppressClickClose = ref(false)

const POPUP_WIDTH = 156
const POPUP_HEIGHT = 176
const ARROW_SIZE = 8
const GAP = 8
const EDGE_MARGIN = 8

function startLongPress(fundCode: string, x: number, y: number): void {
  longPressStartX = x
  longPressStartY = y
  longPressTriggered.value = false
  clearLongPressTimer()
  longPressTimer = setTimeout(() => {
    longPressTriggered.value = true
    window.getSelection()?.removeAllRanges()
    showPopup(fundCode)
  }, LONG_PRESS_DURATION)
}

function cancelLongPress(): void { clearLongPressTimer() }

function checkLongPressMove(x: number, y: number): void {
  const dx = Math.abs(x - longPressStartX)
  const dy = Math.abs(y - longPressStartY)
  if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) clearLongPressTimer()
}

function clearLongPressTimer(): void {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
}

function showPopup(fundCode: string): void {
  const rowEl = document.querySelector<HTMLElement>(`[data-fund-row="${fundCode}"]`)
  const row = rowEl?.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (row) {
    haloStyle.value = {
      left: `${Math.max(row.left, EDGE_MARGIN)}px`,
      top: `${Math.max(row.top, EDGE_MARGIN)}px`,
      width: `${Math.min(row.width, vw - EDGE_MARGIN * 2)}px`,
      height: `${Math.min(row.height, vh - EDGE_MARGIN * 2)}px`,
    }
  }

  const anchorCenterX = row ? row.left + row.width / 2 : vw / 2
  const rowTop = row ? row.top : 0
  const rowBottom = row ? row.bottom : vh / 2

  let x = anchorCenterX - POPUP_WIDTH / 2
  x = Math.max(EDGE_MARGIN, Math.min(x, vw - POPUP_WIDTH - EDGE_MARGIN))

  const ARROW_W = 12
  let arrowX = anchorCenterX - x - ARROW_W / 2
  arrowX = Math.max(EDGE_MARGIN, Math.min(arrowX, POPUP_WIDTH - ARROW_W - EDGE_MARGIN))

  const spaceBelow = vh - rowBottom - EDGE_MARGIN
  const spaceAbove = rowTop - EDGE_MARGIN
  let placement: 'below' | 'above' = 'below'
  let y: number
  if (spaceBelow >= POPUP_HEIGHT + GAP + ARROW_SIZE) {
    y = rowBottom + GAP + ARROW_SIZE
  } else if (spaceAbove >= POPUP_HEIGHT + GAP + ARROW_SIZE) {
    placement = 'above'
    y = rowTop - GAP - ARROW_SIZE - POPUP_HEIGHT
  } else {
    placement = spaceBelow >= spaceAbove ? 'below' : 'above'
    y = placement === 'below' ? rowBottom + GAP + ARROW_SIZE : rowTop - GAP - ARROW_SIZE - POPUP_HEIGHT
    y = Math.max(EDGE_MARGIN, Math.min(y, vh - POPUP_HEIGHT - EDGE_MARGIN))
  }

  popup.value = { visible: true, fundCode, x, y, arrowX, placement }
  suppressClickClose.value = true
}

function hidePopup(): void {
  popup.value.visible = false
  haloStyle.value = {}
  suppressClickClose.value = false
}

function handlePopupEdit(): void {
  const code = popup.value.fundCode
  hidePopup()
  router.push(`/fund/${code}?action=edit`)
}

function handlePopupDelete(): void {
  const code = popup.value.fundCode
  hidePopup()
  emit('quickRemoveFund', code)
}

function handlePopupClear(): void {
  const code = popup.value.fundCode
  hidePopup()
  emit('clearHoldings', code)
}

function onTouchStart(e: TouchEvent, fundCode: string): void {
  const t = e.touches[0]
  // 即时清一次已有选择：配合 CSS user-select:none，兜底防止 touchstart 瞬间残留的选区
  // 被浏览器用于触发系统 copy/查询菜单（passive 监听无法 preventDefault，靠清选区 + CSS 双保险）。
  window.getSelection()?.removeAllRanges()
  startLongPress(fundCode, t.clientX, t.clientY)
}
function onTouchMove(e: TouchEvent): void {
  checkLongPressMove(e.touches[0].clientX, e.touches[0].clientY)
}
function onTouchEnd(_e: TouchEvent): void { cancelLongPress() }

function onMouseDown(e: MouseEvent, fundCode: string): void {
  if (e.button !== 0) return
  startLongPress(fundCode, e.clientX, e.clientY)
}
function onMouseMove(e: MouseEvent): void { checkLongPressMove(e.clientX, e.clientY) }
function onMouseUp(): void { cancelLongPress() }
function onContextMenu(_e: MouseEvent): void { /* prevent handled in template */ }

function onDocumentClick(_e: MouseEvent): void {
  // 桌面端长按弹窗显示后，鼠标释放产生的 tail click 会先到达这里（capture 阶段）。
  // 吸收这一次，保留弹窗等待用户点击按钮；后续真实点击走正常关闭逻辑。
  if (suppressClickClose.value) { suppressClickClose.value = false; return }
  if (popup.value.visible) hidePopup()
}
function onDocumentScroll(): void { if (popup.value.visible) hidePopup() }

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('scroll', onDocumentScroll, true)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick, true)
  document.removeEventListener('scroll', onDocumentScroll, true)
  clearLongPressTimer()
})
</script>

<style scoped>
.fund-list-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.list-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding-bottom: 70px;
}

/* 卡片视图工具栏 */
.card-toolbar {
  /* 位于滚动区 list-body 之外，作为固定工具栏不随滚动隐藏（避开 sticky 与 dropdown 交互 bug） */
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}
/* 卡片视图工具栏按钮：自适应宽度胶囊式，图标+文字排布更美观 */
.card-toolbar .hdr-btn {
  width: auto;
  height: 30px;
  padding: 0 12px;
  gap: 5px;
  border-radius: var(--radius-full);
  font-size: 12px;
}
.card-toolbar .hdr-btn.sort-btn {
  max-width: 170px;
}
.card-toolbar .hdr-btn .sort-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 当前方向小箭头：降序朝下、升序朝上，主色提示 */
.card-toolbar .hdr-btn .sort-dir {
  display: inline-flex;
  align-items: center;
  color: var(--color-primary-light);
  opacity: 0.85;
  transition: transform var(--transition-fast);
}
.card-toolbar .hdr-btn .sort-dir.is-asc {
  transform: rotate(180deg);
}
/* 眼睛按钮在卡片工具栏中缩到与其他按钮一致 */
.card-toolbar :deep(.btn-eye) {
  width: 30px;
  height: 30px;
}

/* ===== 表格 ===== */
.table-scroll { /* 父级 list-body 负责滚动 */ }
.table-view { /* list-body 负责滚动 */ }

.fund-table {
  width: 100%;
  border-collapse: collapse;
  /* 固定列宽：让数据列均匀铺满右侧，避免与名称列挤在一起 */
  table-layout: fixed;
}

.fund-table th {
  padding: 6px 8px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: left;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
  user-select: none;
  background: var(--bg-surface);
  position: sticky;
  top: 0;
  z-index: 2;
  height: 36px;
  box-sizing: border-box;
}

.fund-table td {
  padding: 6px 4px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
  background: var(--bg-card);
  vertical-align: middle;
}

/* sticky 列 */
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 3;
  background: var(--bg-card);
  border-right: 1px solid var(--border-default);
}
.sticky-col-header {
  position: sticky;
  left: 0;
  top: 0;
  z-index: 4;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-default);
}

.fund-row { cursor: pointer; transition: background var(--transition-fast); }
.fund-row:hover td { background: var(--bg-card-hover) !important; }
/* 常驻禁用文本选择 + 系统长按 callout 菜单（copy/查询）：
   旧实现仅在 .longpress-active（弹窗已弹出后）才禁用，但浏览器默认的长按文本选择
   在 600ms 计时器触发前就已抢先弹出系统菜单，passive touchstart 无法 preventDefault 拦不住。
   改为行级常驻禁用，让浏览器根本不进入「选中文本」状态，从源头杜绝 copy/查询菜单。 */
.fund-row,
.fund-row td { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.fund-row.longpress-active { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }

/* ctrl 列表头内控件行 */
.ctrl-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 3px;
  padding: 0 4px;
}
/* 眼睛按钮在 ctrl 表头中缩到与其他按钮一致 */
.ctrl-header :deep(.btn-eye) {
  width: 26px;
  height: 26px;
}

.hdr-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.hdr-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-light);
  background: var(--color-primary-glow);
}
.manage-btn {
  color: var(--color-primary-light);
  border-color: rgba(99, 102, 241, 0.35);
}
.manage-btn:hover {
  background: rgba(99, 102, 241, 0.12);
}

/* ctrl 列数据行 */
.ctrl-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 2px 0;
}
.ctrl-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ctrl-holding {
  font-size: 11px;
  color: var(--text-muted);
}
/* 持仓金额 + 估值日期 同一行，金额在左、日期在右，不换行 */
.ctrl-holding-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
  min-width: 0;
}
.ctrl-holding-row .ctrl-date {
  margin-left: auto;
}
.ctrl-date {
  font-size: 10px;
  color: var(--text-muted);
}

/* 已更新徽章 + 盘中涨跌幅 同一行 */
.ctrl-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 16px;
}
/* 已更新徽章：仅在已更新时渲染，橘黄色背景 */
.ctrl-updated {
  display: inline-block;
  font-size: 9px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: auto; /* 推到 ctrl-status-row 最右侧，与下方日期右对齐 */
}
.ctrl-realtime {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
}
.ctrl-realtime .rt-value { font-variant-numeric: tabular-nums; }
.ctrl-realtime .rt-label {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: var(--radius-full);
  background: rgba(59, 130, 246, 0.16);
  color: #3b82f6;
  line-height: 1.4;
}
.ctrl-realtime.rt-rise { color: #ef4444; }
.ctrl-realtime.rt-fall { color: #22c55e; }
.ctrl-realtime.rt-flat { color: var(--text-muted); }

/* 双行布局 */
.dual-row {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
}
.dual-main {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 今日/累计收益金额：调小字号、不加粗（昨日净值仍用 .dual-main 原样） */
.dual-main-profit {
  font-size: 13px;
  font-weight: 400;
}
.dual-sub {
  font-size: 11px;
}

/* 数据列右对齐，向右铺满（表头与数据均右对齐，消除视觉错位） */
.col-todayProfit,
.col-totalProfit,
.col-lastNetValue {
  text-align: right;
}
/* 表头列名同样右对齐，贴合下方数字（提升优先级覆盖 .fund-table th 的左对齐） */
.fund-table th.col-todayProfit,
.fund-table th.col-totalProfit,
.fund-table th.col-lastNetValue {
  text-align: right;
}

/* 净值列 */
.col-lastNetValue .dual-main {
  font-size: 13px;
  font-weight: 500;
}

/* 实时呼吸点 */
.rt-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #22d3ee;
  animation: rt-breathe 1.6s ease-in-out infinite;
}
@keyframes rt-breathe {
  0%, 100% { opacity: 0.35; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* 占位态（首屏实时值未到位）：整体弱化 + 呼吸点改为旋转 loading，与"真实算出 0.00%"视觉区分 */
.rt-placeholder { opacity: 0.5; }
.rt-placeholder .rt-dot {
  background: transparent;
  border: 1.5px solid var(--text-muted);
  border-top-color: transparent;
  width: 7px;
  height: 7px;
  animation: rt-spin 0.8s linear infinite;
}
@keyframes rt-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ===== 卡片 ===== */
.card-view {
  display: grid;
  /* 电脑端/平板：一行两个；手机端由下方媒体查询覆盖为一行一个 */
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
  align-items: stretch;
}
.fund-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}
.fund-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--color-primary), rgba(99,102,241,0.2));
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.fund-card:hover { border-color: rgba(99,102,241,0.3); box-shadow: 0 4px 20px rgba(99,102,241,0.08); }
.fund-card:hover::before { opacity: 1; }
/* 常驻禁用文本选择 + 系统长按 callout（同 .fund-row，卡片视图同源问题） */
.fund-card { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.fund-card.longpress-active { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }

.card-top { display: flex; align-items: center; gap: var(--spacing-sm); }
.card-identity { display: flex; align-items: center; flex: 1; min-width: 0; }
.card-name-wrap { display: flex; align-items: center; gap: 4px; min-width: 0; }
.confirmed-badge { color: #f59e0b; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.card-code { font-size: var(--font-xs); color: var(--text-muted); flex-shrink: 0; margin-right: 4px; }
.card-name { font-size: var(--font-sm); color: var(--text-primary); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

.card-body { display: flex; gap: var(--spacing-sm); align-items: center; }
.card-metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-xs) var(--spacing-md); flex: 2; }
.card-sparkline { flex: 1; min-width: 0; }
.metric { display: flex; flex-direction: column-reverse; gap: 2px; min-width: 0; overflow: hidden; }
.metric-value { font-size: 12px; color: var(--text-primary); font-weight: 500; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.metric-label { font-size: 11px; color: var(--text-muted); }

.realtime-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; }
.realtime-badge.rt-rise { color: #ef4444; }
.realtime-badge.rt-fall { color: #22c55e; }
.realtime-badge.rt-flat { color: var(--text-muted); }
.rt-value { font-variant-numeric: tabular-nums; }

.card-bottom { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-default); padding-top: var(--spacing-xs); }
.card-time { font-size: var(--font-xs); }
.card-del { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px 4px; border-radius: var(--radius-sm); transition: all var(--transition-fast); font-size: var(--font-sm); }
.card-del:hover { color: var(--color-rise); background: rgba(239,68,68,0.1); }

/* ===== 空状态 ===== */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: var(--spacing-2xl); gap: var(--spacing-md); }

/* ===== 列宽（桌面端固定列宽，数据列向右铺满） ===== */
/* 名称列收窄到刚好容纳 名称+持仓+日期+盘中；三个数据列等分剩余宽度铺满右侧 */
.col-ctrl         { width: 180px; }
.col-todayProfit  { width: calc((100% - 180px) / 3); }
.col-totalProfit  { width: calc((100% - 180px) / 3); }
.col-lastNetValue { width: calc((100% - 180px) / 3); }

/* ===== 排序下拉选中态 ===== */

/* ===== 移动端 ===== */
@media (max-width: 767px) {
  .fund-table {
    table-layout: fixed;
    width: 100%;
  }
  .col-ctrl        { width: min(130px, 36vw) !important; }
  .col-todayProfit { width: min(72px,  20vw) !important; }
  .col-totalProfit { width: min(72px,  20vw) !important; }
  .col-lastNetValue{ width: min(70px,  20vw) !important; }

  .card-view { grid-template-columns: 1fr; }
  .card-metrics { grid-template-columns: 1fr 1fr; }
  .card-name { font-size: var(--font-sm); }
  .fund-card { min-height: 120px; }
  .card-identity { flex-direction: column; align-items: flex-start; overflow: hidden; }
}

@media (min-width: 768px) and (max-width: 1024px) {
  .card-metrics { grid-template-columns: 1fr 1fr; }
}
</style>

<style>
/* 长按弹出菜单（非 scoped，teleport 到 body） */
.longpress-halo {
  position: fixed;
  z-index: 9998;
  pointer-events: none;
  border: 1.5px dashed var(--color-primary);
  border-radius: var(--radius-lg);
  box-shadow: 0 0 16px var(--color-primary-glow), inset 0 0 12px var(--color-primary-glow);
  animation: halo-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes halo-in {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}

.longpress-popup {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 156px;
  padding: 6px;
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04) inset;
  animation: popup-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-secondary);
}
.popup-arrow {
  position: absolute;
  top: -7px;
  width: 12px;
  height: 12px;
  background: var(--glass-bg);
  border-left: 1px solid var(--border-default);
  border-top: 1px solid var(--border-default);
  transform: rotate(45deg);
  border-top-left-radius: 3px;
}
.longpress-popup.popup-above .popup-arrow {
  top: auto; bottom: -7px;
  border-top: none; border-left: none;
  border-right: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
  border-top-left-radius: 0; border-bottom-right-radius: 3px;
}
@keyframes popup-in {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 1; transform: scale(1); }
}
.popup-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
  white-space: nowrap;
}
.popup-btn:active { transform: scale(0.97); }
.popup-edit:hover { background: rgba(99,102,241,0.12); color: var(--color-primary-light); }
.popup-clear:hover { background: rgba(245,158,11,0.12); color: #f59e0b; }
.popup-delete:hover { background: rgba(239,68,68,0.12); color: #f87171; }

/* 排序下拉：精致紧凑、文字不过大 */
.sort-popper.el-dropdown__popper.el-popper {
  padding: 4px !important;
  min-width: 128px !important;
}
.sort-popper .el-dropdown-menu {
  padding: 0 !important;
}
.sort-popper .el-dropdown-menu__item {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 9px !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  line-height: 1.35 !important;
  color: var(--text-secondary) !important;
}
.sort-popper .el-dropdown-menu__item .sort-field-label {
  white-space: nowrap;
}
/* 当前排序字段的方向箭头：降序朝下、升序朝上，主色高亮 */
.sort-popper .sort-field-arrow {
  display: inline-flex;
  align-items: center;
  color: var(--color-primary-light);
}
.sort-popper .sort-field-arrow.is-asc {
  transform: rotate(180deg);
}

/* 排序下拉激活项：选中态用主色高亮，更清晰可辨 */
.is-active-sort {
  color: var(--color-primary-light) !important;
  background: var(--color-primary-glow) !important;
  font-weight: 600;
}
.is-active-sort:hover {
  background: var(--color-primary-glow) !important;
  color: var(--color-primary-light) !important;
}

</style>
