<template>
  <!-- 仪表盘 - 横向贯通命令条（整条点击展开/收起） -->
  <div
    class="dashboard-strip glass-card"
    :class="[
      { 'is-collapsed': collapsed, 'pc-mode': pcMode },
      collapsed ? 'strip-' + overallColor : ''
    ]"
    role="button"
    tabindex="0"
    :aria-expanded="!collapsed"
    :title="collapsed ? '展开统计' : '收起统计'"
    @click="toggleCollapse"
    @keydown.enter.prevent="toggleCollapse"
    @keydown.space.prevent="toggleCollapse"
  >
    <!-- 左侧渐变光条 -->
    <div class="strip-accent"></div>

    <!-- 展开状态：持有金额 -->
    <div class="strip-hero">
      <span class="hero-label">持有金额</span>
      <span :class="['hero-value font-number', !p.holding && 'privacy-blur']">
        <NumberTransition :value="stats.totalHoldingAmount" type="compactMoney" />
      </span>
    </div>

    <div class="strip-divider"></div>

    <!-- 指标：2×2 矩阵 -->
    <div class="strip-metrics">
      <div class="metric-cell">
        <span :class="['metric-value font-number', todayFmt.cssClass, !p.todayProfit && 'privacy-blur']">
          <NumberTransition :value="stats.todayProfit" type="compactProfit" />
        </span>
        <span class="metric-label">今日收益</span>
      </div>
      <div class="metric-cell metric-cell-extra">
        <span :class="['metric-value font-number', totalFmt.cssClass, !p.totalProfit && 'privacy-blur']">
          <NumberTransition :value="stats.totalProfit" type="compactProfit" />
        </span>
        <span class="metric-label">累计收益</span>
      </div>
      <div class="metric-cell">
        <span :class="['metric-rate font-number', todayRateFmt.cssClass, !p.todayRate && 'privacy-blur']">
          <NumberTransition :value="stats.todayReturnRate" type="rate" />
        </span>
        <span class="metric-label">今日收益率</span>
      </div>
      <div class="metric-cell metric-cell-extra">
        <span :class="['metric-rate font-number', rateFmt.cssClass, !p.totalRate && 'privacy-blur']">
          <NumberTransition :value="stats.overallChangeRate" type="rate" />
        </span>
        <span class="metric-label">累计收益率</span>
      </div>
    </div>

    <!-- 右侧展开/收起色条按钮（PC 端隐藏，视觉指示，点击冒泡到整条） -->
    <button v-if="!pcMode" class="collapse-tab" tabindex="-1" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline v-if="collapsed" points="15 18 9 12 15 6" />
        <polyline v-else points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import NumberTransition from '@/components/shared/number-transition.vue'
import { formatProfitWithColor, formatRateWithColor } from '@/shared/utils/money-format'
import { useSettingsStore } from '@/modules/settings/settings-store'
import type { DashboardStats } from '@/modules/holding/holding-types'

const COLLAPSED_KEY = 'dashboard_stats_collapsed'

const props = defineProps({
  stats: { type: Object as PropType<DashboardStats>, required: true },
  /** PC 端模式：始终展开、更紧凑 */
  pcMode: { type: Boolean, default: false },
})
const collapsed = ref(localStorage.getItem(COLLAPSED_KEY) === '1')

const settingsStore = useSettingsStore()
const p = computed(() => settingsStore.privacy)

function toggleCollapse(): void {
  collapsed.value = !collapsed.value
  localStorage.setItem(COLLAPSED_KEY, collapsed.value ? '1' : '0')
}

const todayFmt = computed(() => formatProfitWithColor(props.stats.todayProfit))
const totalFmt = computed(() => formatProfitWithColor(props.stats.totalProfit))
const todayRateFmt = computed(() => formatRateWithColor(props.stats.todayReturnRate))
const rateFmt = computed(() => formatRateWithColor(props.stats.overallChangeRate))

/** 整体涨跌色（用于收起状态边框） */
const overallColor = computed(() => {
  if (props.stats.todayProfit > 0) return 'rise'
  if (props.stats.todayProfit < 0) return 'fall'
  return 'flat'
})
</script>

<style scoped>
.dashboard-strip {
  position: relative;
  display: flex;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  padding-right: 0;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.dashboard-strip:focus-visible {
  outline: 2px solid var(--color-primary-light);
  outline-offset: -2px;
}

/* ===== 收起状态 ===== */
.dashboard-strip.is-collapsed {
  padding: 2px 0 2px var(--spacing-lg);
}
/* 收起态上下 padding 仅 2px，校正负 margin 避免色条凸出 strip 边界 */
.dashboard-strip.is-collapsed .collapse-tab {
  margin-top: -2px;
  margin-bottom: -2px;
}
.dashboard-strip.is-collapsed .strip-hero,
.dashboard-strip.is-collapsed .strip-divider,
.dashboard-strip.is-collapsed .metric-cell-extra {
  opacity: 0;
  max-height: 0;
  max-width: 0;
  overflow: hidden;
  padding: 0;
  margin: 0;
  pointer-events: none;
}
.dashboard-strip.is-collapsed .strip-metrics {
  flex: 1;
  display: flex;
  flex-direction: row;
  justify-content: space-around;
}
.dashboard-strip.is-collapsed .metric-cell {
  flex: 0 0 auto;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-sm);
}
.dashboard-strip.is-collapsed .metric-value {
  font-size: var(--font-lg);
  font-weight: 700;
}
.dashboard-strip.is-collapsed .metric-rate {
  font-size: var(--font-md);
  font-weight: 600;
}
.dashboard-strip.is-collapsed .metric-label {
  font-size: var(--font-xs);
  order: -1;
}

/* 收起状态：整体色条效果 */
.dashboard-strip.strip-rise {
  border-color: rgba(239, 68, 68, 0.2);
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.08);
}
.dashboard-strip.strip-rise .strip-accent {
  background: linear-gradient(180deg, #ef4444, #f87171, #dc2626);
}
.dashboard-strip.strip-fall {
  border-color: rgba(34, 197, 94, 0.2);
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.08);
}
.dashboard-strip.strip-fall .strip-accent {
  background: linear-gradient(180deg, #22c55e, #4ade80, #16a34a);
}
.dashboard-strip.strip-flat .strip-accent {
  background: linear-gradient(180deg, #94a3b8, #cbd5e1, #64748b);
}

/* 左侧渐变光条 */
.strip-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--color-primary), var(--color-primary-light), var(--color-primary-dark));
  border-radius: var(--radius-full) 0 0 var(--radius-full);
  opacity: 0.85;
  box-shadow: 0 0 12px var(--color-primary-glow), 0 0 4px var(--color-primary-light);
  transition: background 0.35s ease, box-shadow 0.35s ease;
}

/* Hero 区（展开：左侧大字） */
.strip-hero {
  flex: 1.2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-left: var(--spacing-sm);
  gap: 2px;
  min-width: 0;
  opacity: 1;
  max-height: 200px;
  max-width: 100%;
  overflow: hidden;
  transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), max-height 0.6s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.6s cubic-bezier(0.4, 0, 0.2, 1), padding 0.6s cubic-bezier(0.4, 0, 0.2, 1), margin 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.hero-label {
  font-size: var(--font-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 500;
}

.hero-value {
  font-size: var(--font-3xl);
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* 竖分割线 */
.strip-divider {
  width: 1px;
  height: 44px;
  background: linear-gradient(180deg, transparent, var(--border-hover), transparent);
  margin: 0 var(--spacing-lg);
  flex-shrink: 0;
  opacity: 0.7;
  overflow: hidden;
  transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), max-height 0.6s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.6s cubic-bezier(0.4, 0, 0.2, 1), margin 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 指标矩阵：2行×2列 CSS Grid（展开状态） */
.strip-metrics {
  flex: 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  gap: var(--spacing-xs) var(--spacing-md);
  align-items: end;
  min-width: 0;
}

.metric-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  min-width: 0;
}

/* 金额数值 */
.metric-value {
  font-size: var(--font-xl);
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

/* 收益率数值 */
.metric-rate {
  font-size: var(--font-md);
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

/* 标签 */
.metric-label {
  font-size: var(--font-xs);
  color: var(--text-muted);
  white-space: nowrap;
  letter-spacing: 0.03em;
  font-weight: 500;
}

/* 右侧展开/收起色条按钮 */
.collapse-tab {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  align-self: stretch;
  min-height: 40px;
  border: none;
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.06), rgba(99, 102, 241, 0.2));
  color: var(--color-primary-light);
  cursor: pointer;
  transition: background 0.3s ease, color 0.3s ease;
  margin-left: var(--spacing-sm);
  /* 顶满 strip 上下：负 margin 抵消父级 padding，色条贴到 strip 边缘 */
  margin-top: calc(-1 * var(--spacing-md));
  margin-bottom: calc(-1 * var(--spacing-md));
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}
.collapse-tab:hover {
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.35), rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.35));
  color: var(--color-primary);
}
.collapse-tab svg {
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.collapse-tab:hover svg {
  transform: scale(1.15);
}

/* 涨跌发光 */
.text-rise {
  text-shadow: 0 0 8px var(--color-rise-glow);
}
.text-fall {
  text-shadow: 0 0 8px var(--color-fall-glow);
}

/* PC 端紧凑模式 */
.dashboard-strip.pc-mode {
  padding: var(--spacing-sm) var(--spacing-md);
  padding-right: var(--spacing-md);
  cursor: pointer;
}
.dashboard-strip.pc-mode:focus-visible {
  outline: none;
}
.dashboard-strip.pc-mode .strip-hero {
  flex: 1;
}
.dashboard-strip.pc-mode .hero-value {
  font-size: var(--font-xl);
}
.dashboard-strip.pc-mode .hero-label {
  font-size: 10px;
}
.dashboard-strip.pc-mode .strip-divider {
  height: 32px;
  margin: 0 var(--spacing-md);
}
.dashboard-strip.pc-mode .metric-value {
  font-size: var(--font-md);
}
.dashboard-strip.pc-mode .metric-rate {
  font-size: var(--font-sm);
}
.dashboard-strip.pc-mode .metric-label {
  font-size: 10px;
}

/* 移动端 */
@media (max-width: 767px) {
  .dashboard-strip {
    padding: var(--spacing-sm) var(--spacing-md);
    padding-right: 0;
  }

  .dashboard-strip.is-collapsed {
    padding: 2px 0 2px var(--spacing-md);
  }
  .dashboard-strip.is-collapsed .metric-value {
    font-size: var(--font-md);
  }
  .dashboard-strip.is-collapsed .metric-rate {
    font-size: var(--font-sm);
  }

  .strip-accent {
    width: 2px;
  }

  .strip-hero {
    flex: 1;
    padding-left: var(--spacing-xs);
  }

  .hero-label {
    font-size: 10px;
  }

  .hero-value {
    font-size: var(--font-lg);
  }

  .strip-divider {
    height: 32px;
    margin: 0 var(--spacing-sm);
  }

  .strip-metrics {
    flex: 1.5;
    gap: 2px var(--spacing-sm);
  }

  .metric-value {
    font-size: var(--font-md);
  }

  .metric-rate {
    font-size: var(--font-sm);
  }

  .metric-label {
    font-size: 10px;
  }

  .collapse-tab {
    width: 20px;
    /* 移动端 padding 用 --spacing-md(12px)，负 margin 自动跟随变量 */
    margin-top: calc(-1 * var(--spacing-md));
    margin-bottom: calc(-1 * var(--spacing-md));
  }
}
</style>
