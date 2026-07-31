<template>
  <div class="fund-detail-pane">
    <!-- 固定头部 -->
    <header class="detail-header glass-card" :style="headerBg">
      <div class="header-top">
        <button class="back-btn" @click="goBack">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="header-identity">
          <span class="header-name">{{ fundName }}</span>
          <span class="header-code font-number">{{ fundCode }}</span>
        </div>
        <div class="header-rate">
          <span :class="['rate-big font-number', rateColor]">{{ rateSign }}{{ currentGszzl.toFixed(2) }}%</span>
        </div>
      </div>
      <div class="header-meta">
        <span :class="['meta-badge', isEstimated ? 'badge-est' : 'badge-confirmed']">{{ isEstimated ? '今日估值' : '已确认' }}</span>
        <span :class="['meta-badge', delayDays === 2 ? 'badge-t2' : 'badge-t1']">{{ confirmTypeText }}</span>
        <span class="meta-time">{{ valuationTimeStr }}</span>
        <span v-if="realtimeGszzl != null && !isHiddenRtSource" :class="['meta-realtime', realtimeGszzl > 0 ? 'rt-rise' : realtimeGszzl < 0 ? 'rt-fall' : 'rt-flat']">
          <span class="rt-line">
            <span class="rt-dot"></span>
            <span class="rt-val font-number">{{ realtimeGszzl > 0 ? '+' : '' }}{{ realtimeGszzl.toFixed(2) }}%</span>
            <span class="rt-tag">{{ realtimeSource || '实时' }}</span>
          </span>
        </span>
      </div>
    </header>

    <!-- 可滚动内容区 -->
    <div class="detail-body">

    <!-- A. 持仓概览 + 操作（有持仓时显示） -->
    <section class="section glass-card holding-section">
      <!-- 持仓数据卡片 -->
      <div v-if="holdingAmount > 0" class="holding-cards">
        <div class="h-card">
          <span :class="['h-card-val font-number', !p.holding && 'privacy-blur']">¥{{ formatCompactMoney(holdingAmount) }}</span>
          <span class="h-card-label">持仓金额</span>
        </div>
        <div class="h-card">
          <span :class="['h-card-val font-number', todayProfit > 0 ? 'text-rise' : todayProfit < 0 ? 'text-fall' : 'text-flat', !p.todayProfit && 'privacy-blur']">
            {{ formatProfitCompact(todayProfit) }}
          </span>
          <span class="h-card-label">今日收益</span>
        </div>
        <div class="h-card">
          <span :class="['h-card-val font-number', totalProfit > 0 ? 'text-rise' : totalProfit < 0 ? 'text-fall' : 'text-flat', !p.totalProfit && 'privacy-blur']">
            {{ formatProfitCompact(totalProfit) }}
          </span>
          <span class="h-card-label">累计收益</span>
        </div>
        <div class="h-card">
          <span :class="['h-card-val font-number', totalReturnRate > 0 ? 'text-rise' : totalReturnRate < 0 ? 'text-fall' : 'text-flat', !p.totalRate && 'privacy-blur']">
            {{ totalReturnRate > 0 ? '+' : '' }}{{ totalReturnRate.toFixed(2) }}%
          </span>
          <span class="h-card-label">累计收益率</span>
        </div>
      </div>
      <div v-else class="no-holding-hint">暂无持仓，可通过操作页添加</div>

      <!-- 操作按钮行 -->
      <div class="op-btns">
        <template v-if="holdingAmount > 0">
          <button :class="['op-btn', activeOp === 'add' && 'op-active']" @click="toggleOp('add')">加仓</button>
          <button :class="['op-btn', activeOp === 'reduce' && 'op-active']" @click="toggleOp('reduce')">减仓</button>
          <button :class="['op-btn', activeOp === 'edit' && 'op-active']" @click="toggleOp('edit')">编辑</button>
          <button class="op-btn op-danger" @click="handleClearHolding">清空</button>
        </template>
        <template v-else>
          <button :class="['op-btn', activeOp === 'edit' && 'op-active']" @click="toggleOp('edit')">录入持仓</button>
        </template>
      </div>

      <!-- 操作表单 -->
      <Transition name="form-slide">
        <div v-if="activeOp" class="op-form">
          <!-- 加仓 -->
          <template v-if="activeOp === 'add'">
            <div class="form-row">
              <label class="form-label">投入金额</label>
              <input v-model.number="opForm.amount" type="number" min="0" class="form-input" placeholder="元" />
            </div>
            <div class="form-hint">参考净值：{{ referenceNav.toFixed(4) }}</div>
            <div class="form-actions">
              <button class="form-btn form-cancel" @click="closeOp">取消</button>
              <button class="form-btn form-confirm" @click="submitAdd">确认加仓</button>
            </div>
          </template>
          <!-- 减仓 -->
          <template v-else-if="activeOp === 'reduce'">
            <div class="form-row">
              <label class="form-label">赎回份额</label>
              <input v-model.number="opForm.shares" type="number" min="0" class="form-input" placeholder="份" />
            </div>
            <div class="form-hint">当前持有：{{ currentShares.toFixed(2) }} 份</div>
            <div class="form-actions">
              <button class="form-btn form-cancel" @click="closeOp">取消</button>
              <button class="form-btn form-confirm" @click="submitReduce">确认减仓</button>
            </div>
          </template>
          <!-- 编辑 -->
          <template v-else-if="activeOp === 'edit'">
            <div class="form-row">
              <label class="form-label">持仓金额</label>
              <input v-model.number="opForm.holdingAmount" type="number" min="0" class="form-input" placeholder="元" />
            </div>
            <div class="form-row">
              <label class="form-label">累计收益</label>
              <input v-model.number="opForm.totalProfit" type="number" class="form-input" placeholder="元（正盈负亏）" />
            </div>
            <div class="form-hint">投入本金 = ¥{{ Math.max(0, (opForm.holdingAmount || 0) - (opForm.totalProfit || 0)).toFixed(2) }}</div>
            <div class="form-actions">
              <button class="form-btn form-cancel" @click="closeOp">取消</button>
              <button class="form-btn form-confirm" @click="submitEdit">确认修改</button>
            </div>
          </template>
        </div>
      </Transition>

      <!-- 待确认计划（加仓/减仓，T+1 确认前可撤销） -->
      <PendingPlanList :fund-code="fundCode" />
    </section>

    <!-- B. 走势图 -->
    <section class="section glass-card">
      <div class="chart-mode-toggle">
        <button :class="['seg-btn', chartMode === 'intraday' ? 'seg-active' : '']" @click="chartMode = 'intraday'">当日走势</button>
        <button :class="['seg-btn', chartMode === 'history' ? 'seg-active' : '']" @click="chartMode = 'history'">历史走势</button>
      </div>
      <div class="chart-box">
        <template v-if="chartMode === 'intraday'">
          <v-chart v-if="intradayChartOption" :option="intradayChartOption" autoresize class="chart" />
          <div v-else class="chart-empty"><p class="text-muted">暂无当日走势数据</p></div>
        </template>
        <template v-else>
          <div v-if="chartLoading" class="chart-empty"><span class="animate-breathe">加载图表数据...</span></div>
          <v-chart v-else-if="chartOption" :option="chartOption" autoresize class="chart" />
          <div v-else class="chart-empty"><p class="text-muted">暂无历史数据</p></div>
        </template>
      </div>
    </section>

    <!-- C. 基金详情（可折叠） -->
    <section class="section glass-card">
      <div class="collapse-header" @click="showInfo = !showInfo">
        <span class="section-title">基金信息</span>
        <svg :class="['collapse-arrow', showInfo ? 'open' : '']" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <Transition name="collapse">
        <div v-if="showInfo">
          <div v-if="detailLoading" class="loading-tip"><span class="animate-breathe">加载中...</span></div>
          <template v-else-if="fundInfo">
            <!-- 基本信息 -->
            <div class="info-grid">
              <div class="info-card"><span class="info-label">基金类型</span><span class="info-val">{{ fundInfo.fundType || '--' }}</span></div>
              <div class="info-card"><span class="info-label">基金经理</span><span class="info-val">{{ fundInfo.fundManager || '--' }}</span></div>
              <div class="info-card"><span class="info-label">成立日期</span><span class="info-val">{{ fundInfo.establishDate || '--' }}</span></div>
              <div class="info-card"><span class="info-label">基金规模</span><span class="info-val">{{ fundInfo.fundScale || '--' }}</span></div>
              <div class="info-card"><span class="info-label">净值日期</span><span class="info-val">{{ fundInfo.dayGrowthDate || '--' }}</span></div>
              <div class="info-card"><span class="info-label">同类排名</span><span class="info-val">{{ (fundInfo as any).peerRanking || '--' }}</span></div>
            </div>
            <!-- 交易规则 -->
            <div class="info-grid" style="margin-top: 8px;">
              <div class="info-card"><span class="info-label">申购费率</span><span class="info-val">{{ fundInfo.purchaseRate ? fundInfo.purchaseRate + '%' : '--' }}</span></div>
              <div class="info-card"><span class="info-label">最低申购</span><span class="info-val">{{ fundInfo.minPurchase ? fundInfo.minPurchase + '元' : '--' }}</span></div>
              <div class="info-card"><span class="info-label">申购状态</span><span :class="['info-val', fundInfo.purchaseStatus === '开放' ? 'text-rise' : 'text-fall']">{{ fundInfo.purchaseStatus || '--' }}</span></div>
              <div class="info-card"><span class="info-label">赎回状态</span><span :class="['info-val', fundInfo.redeemStatus === '开放' ? 'text-rise' : 'text-fall']">{{ fundInfo.redeemStatus || '--' }}</span></div>
            </div>
            <!-- 历史业绩 -->
            <div v-if="fundInfo.performanceItems.length > 0" class="perf-row">
              <div v-for="item in fundInfo.performanceItems" :key="item.title" :class="['perf-item', item.value > 0 ? 'perf-rise' : item.value < 0 ? 'perf-fall' : 'perf-flat']">
                <span class="perf-val font-number">{{ item.value > 0 ? '+' : '' }}{{ item.value.toFixed(2) }}%</span>
                <span class="perf-label">{{ item.title }}</span>
              </div>
            </div>
            <!-- 资产配置 -->
            <div v-if="fundInfo.assetAllocation && fundInfo.assetAllocation.length > 0" class="alloc-section">
              <div v-for="item in fundInfo.assetAllocation" :key="item.category" class="alloc-item">
                <div class="alloc-bar-row">
                  <span class="alloc-label">{{ item.category }}</span>
                  <span class="alloc-val font-number">{{ item.ratio.toFixed(2) }}%</span>
                </div>
                <div class="alloc-bar-bg"><div class="alloc-bar-fill" :style="{ width: Math.min(item.ratio, 100) + '%' }"></div></div>
              </div>
            </div>
          </template>
          <div v-else class="loading-tip text-muted">暂无详情数据</div>
        </div>
      </Transition>
    </section>

    <!-- D. 重仓股票 -->
    <section class="section glass-card">
      <div class="collapse-header" @click="showHoldings = !showHoldings">
        <span class="section-title">持仓股票</span>
        <div class="holdings-meta" v-if="displayHoldings">
          <span v-if="displayHoldings.reportType" class="meta-tag">{{ displayHoldings.reportType }}</span>
          <span v-if="displayHoldings.reportDate" class="meta-tag">{{ displayHoldings.reportDate }}</span>
        </div>
        <svg :class="['collapse-arrow', showHoldings ? 'open' : '']" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <Transition name="collapse">
        <div v-if="showHoldings">
          <div v-if="holdingsLoading" class="loading-tip"><span class="animate-breathe">加载持仓数据...</span></div>
          <template v-else-if="displayHoldings && displayHoldings.holdings.length > 0">
            <!-- 持仓表 昨日收盘/实时 切换开关（T+1/T+2 通用） -->
            <div class="chart-mode-toggle holdings-mode-toggle">
              <button :class="['seg-btn', holdingsMode === 'close' ? 'seg-active' : '']" @click="holdingsMode = 'close'">昨日收盘</button>
              <button :class="['seg-btn', holdingsMode === 'realtime' ? 'seg-active' : '']" @click="holdingsMode = 'realtime'">实时</button>
            </div>
            <div v-if="holdingsMode === 'realtime'" class="realtime-delay-tip">
              <svg class="rdt-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>数据延迟15min左右</span>
            </div>
            <div class="holdings-table">
              <div class="holdings-thead">
                <span>#</span><span>股票</span><span>占比</span><span>涨跌</span>
              </div>
              <template v-for="(stock, idx) in displayHoldings.holdings" :key="stock.stockCode">
                <div class="holdings-row" @click="toggleStock(stock.stockCode)">
                  <span class="h-idx">{{ idx + 1 }}</span>
                  <div class="h-name-wrap">
                    <span class="h-name">{{ stock.stockName || stock.stockCode }}</span>
                    <span class="h-code font-number">{{ stock.stockCode }}</span>
                  </div>
                  <span class="h-ratio font-number">{{ stock.ratio > 0 ? stock.ratio.toFixed(2) + '%' : '--' }}</span>
                  <span v-if="stockChange(stock) != null" class="h-rate-wrap">
                    <span :class="['h-rate font-number', stockChangeClass(stock)]">
                      {{ stockChange(stock)! > 0 ? '+' : '' }}{{ (stockChange(stock) as number).toFixed(2) }}%
                    </span>
                    <svg :class="['h-expand-arrow', expandedStocks.has(stock.stockCode) ? 'open' : '']" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </span>
                  <span v-else class="h-rate font-number text-muted">
                    --
                    <svg :class="['h-expand-arrow', expandedStocks.has(stock.stockCode) ? 'open' : '']" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </span>
                </div>
                <Transition name="collapse">
                  <div v-if="expandedStocks.has(stock.stockCode)" class="h-debug-row">
                    <div class="h-debug-grid">
                      <span class="hd-cell"><em>市场归属</em><b :class="{ 'hd-warn': !stock.emMarketCode }">{{ marketLabel(stock) }}</b></span>
                      <span class="hd-cell"><em>判定档位</em><b :class="{ 'hd-warn': shareClass(stock) === 'unknown' }">{{ shareClass(stock) }}</b></span>
                      <span class="hd-cell"><em>取数接口</em><b :class="{ 'hd-warn': stockQuote(stock)?.source?.toLowerCase().includes('yahoo') }">{{ stockQuote(stock)?.source || '待取' }}</b></span>
                      <span class="hd-cell"><em>涨跌就绪</em><b>{{ stockQuote(stock) ? (stockQuote(stock)!.closed ? '休盘' : (stockQuote(stock)!.changeRate != null ? '是' : '取数中')) : '否' }}</b></span>
                      <span class="hd-cell hd-raw"><em>原始条目</em><b class="font-number">{{ stock.rawEntry || stock.stockCode }}</b></span>
                    </div>
                  </div>
                </Transition>
              </template>
            </div>
          </template>
          <template v-else-if="fundInfo && fundInfo.topHoldings && fundInfo.topHoldings.length > 0">
            <div class="holdings-table">
              <div class="holdings-thead"><span>#</span><span>股票</span><span>占比</span><span>涨跌</span></div>
              <div v-for="(stock, idx) in fundInfo.topHoldings" :key="stock.stockCode" class="holdings-row">
                <span class="h-idx">{{ idx + 1 }}</span>
                <div class="h-name-wrap">
                  <span class="h-name">{{ stock.stockName }}</span>
                  <span class="h-code font-number">{{ stock.stockCode }}</span>
                </div>
                <span class="h-ratio font-number">{{ stock.ratio > 0 ? stock.ratio.toFixed(2) + '%' : '--' }}</span>
                <span class="h-rate text-muted">--</span>
              </div>
            </div>
          </template>
          <div v-else class="loading-tip text-muted">暂无持仓数据</div>
        </div>
      </Transition>
    </section>

    <!-- E. 持有人结构 -->
    <section v-if="fundInfo && fundInfo.holderStructure && fundInfo.holderStructure.length > 0" class="section glass-card">
      <div class="section-title" style="margin-bottom: 12px;">持有人结构</div>
      <div v-for="item in fundInfo.holderStructure" :key="item.holderType" class="alloc-item">
        <div class="alloc-bar-row">
          <span class="alloc-label">{{ item.holderType }}</span>
          <span class="alloc-val font-number">{{ item.ratio.toFixed(2) }}%</span>
        </div>
        <div class="alloc-bar-bg"><div class="alloc-bar-fill" :style="{ width: Math.min(item.ratio, 100) + '%' }"></div></div>
      </div>
    </section>
    </div><!-- /detail-body -->
  </div>
</template>

<script setup lang="ts">
/**
 * 基金详情页内容子组件（pane）- 由 fund-detail.vue 壳组件按 fundCode 挂载。
 * 职责：单只基金的展示与数据加载（走势图/持仓操作/T+2 推算/详情）。
 * 不含：左右滑动状态机、切换按钮、路由同步（这些在壳层）。
 */
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useFundStore } from '@/modules/fund/fund-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import type { FundAllHoldings, HoldingDetailItem } from '@/modules/fund/fund-types'
import type { FundFullInfo as FundInfo } from '@/modules/fund/services/fund-full-data-fetch'
import { getFundFullData } from '@/modules/fund/services/fund-full-data-fetch'
import { fetchIntradayEstimate } from '@/modules/fund/intraday/intraday-estimate-fetch'
import { getPreviousTradingDay, getTodayStr, isCnTradingDay } from '@/modules/fund/valuation/cn-trading-day'
import { getConfirmType, confirmTypeLabel } from '@/modules/fund/valuation/fund-type'
import { confirm } from '@/composables/use-confirm'
import { formatValuationTimeWithSeconds } from '@/shared/utils/date-format'
import { formatProfitCompact, formatCompactMoney } from '@/shared/utils/money-format'
import { useEstimatedHoldings } from '@/composables/use-estimated-holdings'
import PendingPlanList from '@/components/shared/pending-plan-list.vue'
import { classifyShare } from '@/shared/market/market-classify'
import { EM_MARKET_LABEL } from '@/shared/market/em-market-map'
import type { StockQuoteInfo } from '@/shared/types/common-types'

use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer])

const props = defineProps<{ fundCode: string }>()
const router = useRouter()
const fundStore = useFundStore()
const holdingStore = useHoldingStore()
const settingsStore = useSettingsStore()
const p = computed(() => settingsStore.privacy)

/**
 * 返回上一页：用 window.history.state.back 判断 history 栈里是否有可退的上一页（同步、可靠）。
 *   - 有上一页：router.back()，回到进入详情页前的那一页（通常是基金首页，也可能是别的 tab）。
 *   - 无上一页（如刷新后直接落到详情页、栈无前驱）：router.replace('/') 兜底回首页。
 *
 * 不再用「back() + nextTick 探测 route.path 再 replace('/')」：back() 的导航是异步的，nextTick
 * 不保证 route 已更新到位，快速操作或栈被滑动 replace 污染时会误判"仍在详情页"而叠一次 replace('/')，
 * 把 history 栈里的 /fund/ 项改成 /，后续 back() 弹到错误 tab（股票/公益/设置），即"返回跳到别的主页面"。
 * 改为出栈前同步判定，一步到位，不再叠加任何 replace。
 */
function goBack(): void {
  const hasPrev = !!window.history.state?.back
  if (hasPrev) {
    router.back()
  } else {
    router.replace('/')
  }
}

const fundCode = computed(() => props.fundCode)
// 名称：统一走 resolveFundName（估值实时 name 优先，回退 fundNameMap）。
// fundgz 失败时 name 是"基金(code)"占位符，跳过它用映射里的真名。
const fundName = computed(() => fundStore.resolveFundName(fundCode.value))

// ===== 估值数据 =====
const isEstimated = computed(() => fundStore.getValuation(fundCode.value)?.isEstimated ?? true)
const currentGszzl = computed(() => fundStore.getValuation(fundCode.value)?.gszzl ?? 0)
const delayDays = computed(() => fundStore.getValuation(fundCode.value)?.delayDays ?? 1)
/** 确认类型中文标签（当日确认 / 次日确认），替代不直观的「T+1/T+2」 */
const confirmTypeText = computed(() => confirmTypeLabel(getConfirmType(delayDays.value)))
const realtimeGszzl = computed(() => fundStore.getValuation(fundCode.value)?.realtimeGszzl ?? null)
const realtimeUpdatedAt = computed(() => fundStore.getValuation(fundCode.value)?.realtimeUpdatedAt ?? '')
const realtimeSource = computed(() => fundStore.getValuation(fundCode.value)?.realtimeSource ?? '')
/** 实时预测胶囊（预测）展示开关：占比有效（前十大含占比）时显示，否则隐藏。
 *  加权 computeEstimatedGszzlFromPrevDay 用 ratio×changeRate，占比全 0 时加权恒 0 无意义故隐藏。
 *  仅对「预测」来源生效——它靠持仓占比加权；其他来源（如 fundgz 确认值）不受此约束。 */
const hasHoldingsRatio = computed(() => {
  const hs = displayHoldings.value?.holdings
  return !!hs && hs.some(h => (h.ratio ?? 0) > 0)
})
const isHiddenRtSource = computed(() => {
  if (realtimeSource.value !== '预测') return false
  return !hasHoldingsRatio.value
})

const rateColor = computed(() => {
  if (currentGszzl.value > 0) return 'text-rise'
  if (currentGszzl.value < 0) return 'text-fall'
  return 'text-flat'
})
const rateSign = computed(() => currentGszzl.value > 0 ? '+' : '')

const headerBg = computed(() => {
  const r = currentGszzl.value
  if (r > 0) return { background: 'linear-gradient(135deg, var(--bg-card), rgba(239,68,68,0.04))' }
  if (r < 0) return { background: 'linear-gradient(135deg, var(--bg-card), rgba(34,197,94,0.04))' }
  return {}
})

const valuationTimeStr = computed(() => {
  const v = fundStore.getValuation(fundCode.value)
  if (!v) return '--'
  if (!isCnTradingDay()) return formatValuationTimeWithSeconds(getPreviousTradingDay())
  const valTime = v.delayDays === 2
    ? getPreviousTradingDay()
    : (v.isEstimated ? (v.gztime ?? '') : getTodayStr())
  return formatValuationTimeWithSeconds(valTime)
})

// ===== 持仓数据 =====
const currentShares = computed(() => holdingStore.getTotalShares(fundCode.value))
const referenceNav = computed(() => fundStore.getValuation(fundCode.value)?.dwjz ?? 0)

const holdingAmount = computed(() => {
  const v = fundStore.getValuation(fundCode.value)
  return holdingStore.getFundHoldingAmount(fundCode.value, v?.dwjz, v?.gszzl, v?.isEstimated)
})
const todayProfit = computed(() => {
  const v = fundStore.getValuation(fundCode.value)
  return holdingStore.calcFundTodayProfit(fundCode.value, 0, v?.dwjz, v?.gszzl, v?.isEstimated)
})
const totalProfit = computed(() => {
  if (holdingAmount.value <= 0) return 0
  const principal = holdingStore.getPrincipal(fundCode.value)
  return holdingAmount.value - principal
})
const totalReturnRate = computed(() => {
  const principal = holdingStore.getPrincipal(fundCode.value)
  if (principal <= 0) return 0
  return (totalProfit.value / principal) * 100
})

// ===== 持仓操作 =====
const activeOp = ref<'add' | 'reduce' | 'edit' | null>(null)
const opForm = reactive<{ amount: number | ''; shares: number | ''; holdingAmount: number | ''; totalProfit: number | '' }>({
  amount: '',
  shares: '',
  holdingAmount: '',
  totalProfit: '',
})

function toggleOp(type: 'add' | 'reduce' | 'edit'): void {
  if (activeOp.value === type) {
    activeOp.value = null
    return
  }
  if (type === 'edit') {
    opForm.holdingAmount = holdingAmount.value > 0 ? parseFloat(holdingAmount.value.toFixed(2)) : ''
    opForm.totalProfit = holdingAmount.value > 0 ? parseFloat(totalProfit.value.toFixed(2)) : ''
  }
  activeOp.value = type
}

function closeOp(): void { activeOp.value = null }

function submitAdd(): void {
  if (!opForm.amount || opForm.amount <= 0) { ElMessage.warning('请输入有效金额'); return }
  const nav = referenceNav.value
  if (nav <= 0) { ElMessage.warning('当前净值不可用'); return }
  holdingStore.createPendingAdd(fundCode.value, opForm.amount, nav, delayDays.value)
  ElMessage.success('加仓申请已提交，待净值确认后生效')
  opForm.amount = ''
  closeOp()
}

function submitReduce(): void {
  if (!opForm.shares || opForm.shares <= 0) { ElMessage.warning('请输入有效份额'); return }
  const nav = referenceNav.value
  if (nav <= 0) { ElMessage.warning('当前净值不可用'); return }
  holdingStore.createPendingReduce(fundCode.value, opForm.shares, nav, delayDays.value)
  ElMessage.success('减仓申请已提交，待净值确认后生效')
  opForm.shares = ''
  closeOp()
}

function submitEdit(): void {
  if (!opForm.holdingAmount || opForm.holdingAmount <= 0) { ElMessage.warning('请输入持仓金额'); return }
  const nav = referenceNav.value > 0 ? referenceNav.value : 1
  const shares = opForm.holdingAmount / nav
  const v = fundStore.getValuation(fundCode.value)
  holdingStore.addHoldingDirect(
    fundCode.value, shares, nav, opForm.holdingAmount,
    opForm.totalProfit === '' ? 0 : opForm.totalProfit,
    { gszzl: v?.gszzl, isEstimated: v?.isEstimated, jzrq: v?.jzrq },
  )
  ElMessage.success('持仓已更新')
  closeOp()
}

async function handleClearHolding(): Promise<void> {
  const ok = await confirm({
    title: '清空持仓',
    desc: '确认清空该基金的全部持仓？',
    confirmText: '确认清空',
    cancelText: '取消',
  })
  if (!ok) return
  holdingStore.settleAllByFund(fundCode.value)
  ElMessage.success('已清空持仓')
}

// ===== 走势图 =====
const chartMode = ref<'intraday' | 'history'>('intraday')
const chartLoading = ref(false)
const historyData = ref<{ date: string; value: number }[]>([])

const changeRate = computed(() => fundStore.getValuation(fundCode.value)?.gszzl ?? 0)
const baselineNav = computed(() => {
  const v = fundStore.getValuation(fundCode.value)
  if (!v || v.dwjz <= 0) return 0
  const isT2val = v.delayDays === 2 || (v.delayDays == null && v.gztime && !v.gztime.includes(':'))
  if (isT2val) return v.dwjz
  if (v.gszzl !== 0 && !v.isEstimated) return v.dwjz / (1 + v.gszzl / 100)
  return v.dwjz
})
const intradayPoints = computed(() => fundStore.intradayMap[fundCode.value] || [])
const isT2fund = computed(() => {
  const v = fundStore.getValuation(fundCode.value)
  return v?.delayDays === 2 || (v?.delayDays == null && v?.gztime && !v.gztime.includes(':'))
})

const intradayChartOption = computed(() => {
  const points = intradayPoints.value
  if (points.length < 2) return null
  const times = points.map(p => p.time)
  const values = points.map(p => p.value)
  const cr = changeRate.value
  const style = getComputedStyle(document.documentElement)
  const lineColor = cr > 0 ? style.getPropertyValue('--color-rise').trim() || '#ef4444'
    : cr < 0 ? style.getPropertyValue('--color-fall').trim() || '#22c55e' : '#9ca3af'
  const fillTop = cr > 0 ? 'rgba(239,68,68,0.25)' : cr < 0 ? 'rgba(34,197,94,0.25)' : 'rgba(156,163,175,0.08)'
  const fillBot = cr > 0 ? 'rgba(239,68,68,0.02)' : cr < 0 ? 'rgba(34,197,94,0.02)' : 'rgba(156,163,175,0.02)'
  const base = baselineNav.value
  const axisColor = style.getPropertyValue('--text-muted').trim() || '#64748b'
  const splitColor = style.getPropertyValue('--border-default').trim() || 'rgba(148,163,184,0.08)'
  const tooltipBg = style.getPropertyValue('--bg-card').trim() || '#1e293b'
  const tooltipText = style.getPropertyValue('--text-primary').trim() || '#f1f5f9'

  const allSame = values.length > 0 && values.every(v => v === values[0])
  let yMin: number | undefined, yMax: number | undefined
  if (allSame && base > 0 && Math.abs(values[0] - base) > 0) {
    const diff = Math.abs(values[0] - base)
    const halfRange = Math.max(diff * 0.8, values[0] * 0.005)
    const center = (values[0] + base) / 2
    yMin = center - halfRange; yMax = center + halfRange
  } else if (allSame && values[0] > 0) {
    const pad = values[0] * 0.01
    yMin = values[0] - pad; yMax = values[0] + pad
  }

  return {
    backgroundColor: 'transparent',
    grid: { left: 56, right: 12, top: 12, bottom: 28 },
    xAxis: { type: 'category', data: times, axisLine: { lineStyle: { color: splitColor } }, axisLabel: { color: axisColor, fontSize: 11, interval: 'auto' } },
    yAxis: { type: 'value', scale: true, min: yMin, max: yMax, axisLine: { show: false }, splitLine: { lineStyle: { color: splitColor } }, axisLabel: { color: axisColor, fontSize: 11, formatter: (v: number) => v.toFixed(4) } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderColor: splitColor,
      textStyle: { color: tooltipText, fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        if (!p) return ''
        const idx = p.dataIndex
        const val = values[idx]
        if (isT2fund.value) {
          const diffStr = `${cr >= 0 ? '+' : ''}${cr.toFixed(2)}%`
          return `${times[idx]}<br/>估值: ${val.toFixed(4)}<br/>涨跌: ${diffStr}`
        }
        const diff = base > 0 ? ((val - base) / base * 100).toFixed(2) : '--'
        const diffStr = base > 0 ? `${Number(diff) >= 0 ? '+' : ''}${diff}%` : '--'
        return `${times[idx]}<br/>估值: ${val.toFixed(4)}<br/>涨跌: ${diffStr}`
      },
    },
    series: [{
      type: 'line', data: values, smooth: false, symbol: 'none',
      lineStyle: { color: lineColor, width: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: fillTop }, { offset: 1, color: fillBot }] } },
      markLine: base > 0 ? { silent: true, symbol: 'none', data: [{ yAxis: base, lineStyle: { color: splitColor, type: 'dashed', width: 1 }, label: { show: false } }] } : undefined,
    }],
  }
})

const chartOption = computed(() => {
  if (historyData.value.length === 0) return null
  const dates = historyData.value.map(d => d.date)
  const values = historyData.value.map(d => d.value)
  const dayChanges = values.map((v, i) => i === 0 || values[i-1] === 0 ? null : parseFloat(((v - values[i-1]) / values[i-1] * 100).toFixed(2)))
  const style = getComputedStyle(document.documentElement)
  const axisColor = style.getPropertyValue('--text-muted').trim() || '#64748b'
  const splitColor = style.getPropertyValue('--border-default').trim() || 'rgba(148,163,184,0.08)'
  const tooltipBg = style.getPropertyValue('--bg-card').trim() || '#1e293b'
  const tooltipText = style.getPropertyValue('--text-primary').trim() || '#f1f5f9'
  return {
    backgroundColor: 'transparent',
    grid: { left: 32, right: 12, top: 12, bottom: 48 },
    xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: splitColor } }, axisLabel: { color: axisColor, fontSize: 11 } },
    yAxis: { type: 'value', scale: true, axisLine: { show: false }, splitLine: { lineStyle: { color: splitColor } }, axisLabel: { color: axisColor, fontSize: 11 } },
    tooltip: {
      trigger: 'axis', backgroundColor: tooltipBg, borderColor: splitColor, textStyle: { color: tooltipText, fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        if (!p) return ''
        const idx = p.dataIndex
        const change = dayChanges[idx]
        const changeStr = change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '--'
        return `${dates[idx]}<br/>净值: ${values[idx].toFixed(4)}<br/>日涨跌: ${changeStr}`
      },
    },
    dataZoom: [{ type: 'inside', start: 70, end: 100 }],
    series: [{
      type: 'line', data: values, smooth: true, symbol: 'none',
      lineStyle: { color: style.getPropertyValue('--color-primary').trim() || '#6366f1', width: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(99,102,241,0.3)' }, { offset: 1, color: 'rgba(99,102,241,0.02)' }] } },
    }],
  }
})

// ===== 详情 =====
const detailLoading = ref(false)
const fundInfo = ref<FundInfo | null>(null)
const fundAllHoldings = ref<FundAllHoldings | null>(null)
const holdingsLoading = ref(false)
const showInfo = ref(true)
const showHoldings = ref(true)

const {
  estimated: estimatedHoldings, isT2, loadEstimation, refreshFromCache,
  getPrevDayRate, prevDayClass, formatRate,
  getRealtimeRate, realtimeClass,
  prevDayMap, realtimeMap,
} = useEstimatedHoldings(fundCode, delayDays)

const holdingsMode = ref<'close' | 'realtime'>('close')

// 持仓表涨跌列：T+1/T+2 统一按 holdingsMode 分流（昨日收盘 getPrevDayRate / 实时 getRealtimeRate）
// 数据来源全局双缓存（store loop 预加载，T+1 国内股东财K线、T+2 国内股东财+海外Yahoo）
function stockChange(stock: HoldingDetailItem): number | null {
  return holdingsMode.value === 'close' ? getPrevDayRate(stock.stockCode) : getRealtimeRate(stock.stockCode)
}
function stockChangeClass(stock: HoldingDetailItem): string {
  return holdingsMode.value === 'close' ? prevDayClass(stock.stockCode) : realtimeClass(stock.stockCode)
}

// ===== 持仓行展开/收起 + 调试信息（临时：定位移动端 emCode 留空后是否大量落 Yahoo 导致涨跌慢）=====
// 每只股的展开状态，key=stockCode。默认收起。
const expandedStocks = ref<Set<string>>(new Set())
function toggleStock(stockCode: string): void {
  const s = new Set(expandedStocks.value)
  if (s.has(stockCode)) s.delete(stockCode)
  else s.add(stockCode)
  expandedStocks.value = s
}

// 当前模式下该股的行情缓存项（含 source/market，供调试看走了哪个接口）
function stockQuote(stock: HoldingDetailItem): StockQuoteInfo | undefined {
  const map = holdingsMode.value === 'close' ? prevDayMap.value : realtimeMap.value
  return map.get(stock.stockCode)
}
// 市场归属标签：emCode → EM_MARKET_LABEL 中文名（如 130→韩、1→沪）；无 emCode 显示"空(待补全)"
function marketLabel(stock: HoldingDetailItem): string {
  const em = stock.emMarketCode
  if (!em) return '空(待补全)'
  return EM_MARKET_LABEL[em] || em
}
// classifyShare 判定档位（A/HK/US/unknown），unknown 会走 Yahoo
function shareClass(stock: HoldingDetailItem): string {
  return classifyShare(stock.emMarketCode, stock.stockCode)
}

// 切换基金时重置模式
watch(fundCode, () => {
  holdingsMode.value = 'close'
})

const displayHoldings = computed(() => {
  // T+1/T+2 统一优先用推算持仓（estimatedHoldings）展示。
  //   description 由推算逻辑如实给出，区分三种状态：
  //     - 全量披露（年报/半年报季报）：「{reportType}为全量披露，无需推算」→ 完整持仓
  //     - 推算成功：「基于{季报}结合{年报}推算，共 N 支」→ 前十大+非前十大缩放
  //     - 无全量报告（新基金等）：「无最近全量报告数据，仅显示季报持仓」→ 仅前十大
  //   reportType 用 description 摘要，避免写死「推算完整持仓」掩盖降级情况。
  // T+1 的 gszzl 今日涨跌幅仍由 fundgz 驱动，不受此影响（loadEstimation 的 gszzl 自愈仅 isT2 时执行）。
  if (estimatedHoldings.value) {
    const e = estimatedHoldings.value
    // 取 description 第一句作标签；报告期单独显示
    const tag = e.description.split('，')[0] || '推算持仓'
    // holdings 含非前十大(isEstimated=true)才算「完整」，仅前十大则不算
    const isFull = e.holdings.some(h => h.isEstimated)
    return { reportDate: e.quarterReportDate, reportType: tag, isFull, holdings: e.holdings }
  }
  // 推算持仓未就绪（如取数失败）时回退到 F10 全量持仓，避免表格空白
  return fundAllHoldings.value
})

// ===== 数据加载 =====
async function loadData(code: string): Promise<void> {
  chartLoading.value = true
  detailLoading.value = true
  holdingsLoading.value = true
  historyData.value = []
  fundInfo.value = null
  fundAllHoldings.value = null

  const v = fundStore.getValuation(code)
  const isT2val = v?.delayDays === 2 || (v?.delayDays == null && v?.gztime && !v?.gztime?.includes?.(':'))

  const intradayTask = (async () => {
    if (isT2val && v) {
      fundStore.updateIntradayPoints(code, v)
      return
    }
    const existing = fundStore.intradayMap[code] || []
    if (existing.length >= 2) return
    try {
      const pts = await fetchIntradayEstimate(code)
      if (pts.length > 0) {
        const lastSinaVal = pts[pts.length - 1].value
        const currentGz = v?.gz || 0
        const scale = (lastSinaVal > 0 && currentGz > 0) ? currentGz / lastSinaVal : 1
        const scaled = scale !== 1 ? pts.map(p => ({ time: p.time, value: p.value * scale })) : pts
        fundStore.intradayMap = { ...fundStore.intradayMap, [code]: scaled }
      }
    } catch { /* 静默 */ }
  })()

  const fullDataTask = (async () => {
    try {
      const { history, info, pingzhongRaw } = await getFundFullData(code)
      if (fundCode.value !== code) return pingzhongRaw
      historyData.value = history
      fundInfo.value = info
      return pingzhongRaw
    } finally {
      if (fundCode.value === code) {
        chartLoading.value = false
        detailLoading.value = false
      }
    }
  })()

  const holdingsTask = (async () => {
    // 持仓由 loadEstimation 走前十大（移动端 API 优先含占比，回退 pingzhong 仅代码）。
    // ⚠️ holdingsLoading 必须等 loadEstimation 真正完成后才置 false：
    //   旧版在开头就置 false，导致切基金时旧持仓（estimated 未清）在 loading 解除后立即显示 → 串台。
    //   现配合 loadEstimation 开头清 estimated，切基金时先显"加载持仓数据..."直到新数据就绪/确认无持仓。
    if (fundCode.value !== code) return

    try {
      // 等 fullDataTask 完成，复用其已加载的 pingzhongdata（stockCodesNew），
      // 传给 loadEstimation 避免二次 script 注入。getFundFullData 通常 <1s。
      const pingzhongRaw = await fullDataTask

      if (fundCode.value !== code) return  // 等待期间又切走，丢弃本次结果

      if (delayDays.value === 2) {
        fundStore.startStockPreload?.()
        await loadEstimation(pingzhongRaw)
      } else {
        // T+1：loadEstimation 走 pingzhong 前十大填本地 ref → displayHoldings 显示。
        //   今日涨跌幅恒由 fundgz 驱动，涨跌由 store loop 全局预加载（国内股东财K线），
        //   详情页 composable watch 全局缓存增量显示。
        fundStore.startStockPreload?.()
        await loadEstimation(pingzhongRaw)
        refreshFromCache() // 持仓就绪后主动从全局缓存提取一次（缓存已有数据时立即显示）
        fundStore.startRealtimeEstimate?.()
      }
    } finally {
      // 仅当仍是当前基金时解除 loading：切走后由新基金自己的 loadData 管理 loading，
      // 避免旧请求的 finally 把新基金的 loading 提前关掉（竞态保护）。
      if (fundCode.value === code) holdingsLoading.value = false
    }
  })()

  await Promise.all([intradayTask, fullDataTask, holdingsTask])
}

onMounted(() => {
  if (fundCode.value) loadData(fundCode.value)
})

watch(fundCode, (code) => {
  if (code) loadData(code)
})
</script>

<style scoped>
.fund-detail-pane {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 头部（固定不滚动） ===== */
.detail-header {
  padding: var(--spacing-md);
  flex-shrink: 0;
  margin: var(--spacing-sm) var(--spacing-md) 0;
  border-radius: var(--radius-md);
  transition: background 0.4s ease;
}

/* ===== 可滚动内容区 ===== */
.detail-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--spacing-sm) var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  width: 100%;
  padding-bottom: 80px;
}
.detail-body {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.detail-body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.header-top {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: 8px;
  min-height: 56px;
}
.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}
.back-btn:hover { color: var(--text-primary); border-color: var(--border-hover); }
.header-identity {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  min-width: 0;
}
.header-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.header-code {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  align-self: flex-start;
}
.rate-big {
  font-size: 24px;
  font-weight: 800;
  flex-shrink: 0;
}
.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-left: 4px;
}
.meta-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
}
.badge-est { background: rgba(245,158,11,0.12); color: #f59e0b; }
.badge-confirmed { background: rgba(34,197,94,0.12); color: #22c55e; }
.badge-t2 { background: rgba(6,182,212,0.12); color: #22d3ee; }
.badge-t1 { background: rgba(99,102,241,0.12); color: var(--color-primary-light); }
.meta-time { font-size: 11px; color: var(--text-muted); }
.meta-realtime {
  display: flex;
  align-items: center;
  margin-top: 2px;
}
.meta-realtime .rt-line {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}
.meta-realtime .rt-val { font-variant-numeric: tabular-nums; }
.meta-realtime .rt-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: rgba(59, 130, 246, 0.16);
  color: #3b82f6;
  line-height: 1.4;
}
.meta-realtime.rt-rise { color: #ef4444; }
.meta-realtime.rt-fall { color: #22c55e; }
.meta-realtime.rt-flat { color: var(--text-muted); }
.rt-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22d3ee;
  animation: rt-breathe 1.6s ease-in-out infinite;
}
@keyframes rt-breathe {
  0%, 100% { opacity: 0.35; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* ===== 区块 ===== */
.section { padding: var(--spacing-md); }

/* ===== 走势图 ===== */
.chart-mode-toggle {
  display: inline-flex;
  gap: 0;
  background: rgba(99,102,241,0.06);
  border-radius: var(--radius-md);
  padding: 2px;
  margin-bottom: var(--spacing-sm);
}
.seg-btn {
  padding: 4px 14px;
  border: none;
  border-radius: calc(var(--radius-md) - 2px);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}
.seg-btn.seg-active { background: var(--bg-card); color: var(--color-primary); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
.chart-box {
  height: 200px;
  background: rgba(99,102,241,0.02);
  border: 1px solid rgba(99,102,241,0.08);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.chart { width: 100%; height: 100%; }
.chart-empty { display: flex; align-items: center; justify-content: center; height: 100%; }

/* ===== 折叠头 ===== */
.collapse-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  padding: 4px 0;
  user-select: none;
}
.collapse-header:hover .section-title { color: var(--color-primary-light); }
.section-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); flex: 1; }
.holdings-meta { display: flex; gap: 6px; }
.meta-tag { font-size: 10px; color: var(--text-muted); background: var(--bg-surface); padding: 1px 6px; border-radius: var(--radius-full); }
.holdings-mode-toggle { margin-bottom: 8px; }
.realtime-delay-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  padding: 3px 9px;
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}
.realtime-delay-tip .rdt-icon { opacity: 0.7; }
.collapse-arrow { color: var(--text-muted); transition: transform 0.25s ease; flex-shrink: 0; }
.collapse-arrow.open { transform: rotate(180deg); }

.collapse-enter-active, .collapse-leave-active { transition: all 0.25s ease; overflow: hidden; }
.collapse-enter-from, .collapse-leave-to { max-height: 0; opacity: 0; }
.collapse-enter-to, .collapse-leave-from { max-height: 2000px; opacity: 1; }

.loading-tip { padding: 12px 0; font-size: 13px; text-align: center; }

/* ===== 基金信息 ===== */
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-top: 12px;
}
.info-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
}
.info-label { font-size: 10px; color: var(--text-muted); }
.info-val { font-size: 12px; color: var(--text-primary); font-weight: 500; }

.perf-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.perf-item { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 10px; border-radius: var(--radius-md); min-width: 56px; }
.perf-item.perf-rise { background: rgba(239,68,68,0.08); }
.perf-item.perf-fall { background: rgba(34,197,94,0.08); }
.perf-item.perf-flat { background: var(--bg-surface); }
.perf-val { font-size: 12px; font-weight: 600; }
.perf-rise .perf-val { color: #ef4444; }
.perf-fall .perf-val { color: #22c55e; }
.perf-label { font-size: 10px; color: var(--text-muted); }

.alloc-section { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.alloc-item { display: flex; flex-direction: column; gap: 4px; }
.alloc-bar-row { display: flex; justify-content: space-between; align-items: center; }
.alloc-label { font-size: 11px; color: var(--text-muted); }
.alloc-val { font-size: 11px; color: var(--text-secondary); }
.alloc-bar-bg { height: 4px; background: var(--bg-surface); border-radius: var(--radius-full); overflow: hidden; }
.alloc-bar-fill { height: 100%; background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light)); border-radius: var(--radius-full); transition: width 0.6s ease; }

/* ===== 持仓表格 ===== */
.holdings-table {
  margin-top: 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.holdings-thead {
  display: grid;
  grid-template-columns: 20px 1fr 48px 60px;
  padding: 5px 10px;
  background: var(--bg-surface);
  font-size: 10px;
  color: var(--text-muted);
  gap: 8px;
  align-items: center;
}
.holdings-thead span:nth-child(3) { text-align: right; }
.holdings-thead span:nth-child(4) { text-align: right; }
.holdings-row {
  display: grid;
  grid-template-columns: 20px 1fr 48px 60px;
  padding: 7px 10px;
  gap: 8px;
  align-items: center;
  border-top: 1px solid var(--border-default);
  transition: background var(--transition-fast);
}
.holdings-row:hover { background: var(--bg-card-hover); }
.h-idx { font-size: 11px; color: var(--text-muted); }
.h-name-wrap { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.h-name { font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.h-code { font-size: 10px; color: var(--text-muted); }
.h-ratio { font-size: 12px; color: var(--text-secondary); text-align: right; }
.h-market { font-size: 11px; color: var(--text-muted); text-align: right; white-space: nowrap; }
.h-rate { font-size: 12px; text-align: right; }
.h-rate-wrap { display: inline-flex; align-items: center; justify-content: flex-end; gap: 3px; }
.h-expand-arrow { color: var(--text-muted); transition: transform 0.2s ease; flex-shrink: 0; }
.h-expand-arrow.open { transform: rotate(180deg); }
.holdings-row { cursor: pointer; }

/* 展开调试行 */
.h-debug-row {
  padding: 6px 10px 8px 38px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-surface);
}
.h-debug-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px 12px;
}
.hd-cell { display: flex; align-items: center; gap: 4px; font-size: 10px; min-width: 0; }
.hd-cell em { color: var(--text-muted); font-style: normal; flex-shrink: 0; }
.hd-cell b { color: var(--text-secondary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hd-cell.hd-raw { grid-column: 1 / -1; }
.hd-cell.hd-raw b { font-size: 10px; color: var(--text-muted); }
.hd-warn { color: var(--color-fall) !important; }

@media (max-width: 767px) {
  .detail-header { padding: var(--spacing-sm) var(--spacing-md); margin: var(--spacing-xs) var(--spacing-sm) 0; }
  .detail-body { padding: var(--spacing-xs) var(--spacing-sm); }
  .info-grid { grid-template-columns: 1fr 1fr; }
  .rate-big { font-size: 20px; }
  .holding-cards { grid-template-columns: 1fr 1fr; }
}

/* ===== 持仓概览 ===== */
.holding-section { display: flex; flex-direction: column; gap: var(--spacing-sm); }
.holding-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.h-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 6px;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  text-align: center;
  min-width: 0;
  overflow: hidden;
}
.h-card-val { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; max-width: 100%; }
.h-card-label { font-size: 10px; color: var(--text-muted); }
.no-holding-hint { font-size: 12px; color: var(--text-muted); text-align: center; padding: 8px 0; }

.op-btns { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.op-btn {
  height: 28px;
  padding: 0 14px;
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

.op-form {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
}
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

.form-slide-enter-active,
.form-slide-leave-active { transition: all 0.25s cubic-bezier(0.4,0,0.2,1); overflow: hidden; }
.form-slide-enter-from,
.form-slide-leave-to { max-height: 0; opacity: 0; margin-top: 0; }
.form-slide-enter-to,
.form-slide-leave-from { max-height: 300px; opacity: 1; }
</style>
