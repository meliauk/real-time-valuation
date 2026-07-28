<template>
  <div class="fund-sparkline">
    <svg v-if="points.length >= 2" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" class="sparkline-svg">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="fillColorTop" />
          <stop offset="100%" :stop-color="fillColorBottom" />
        </linearGradient>
      </defs>
      <!-- 0线（昨收水位线） -->
      <line v-if="zeroLineY !== null"
        :x1="0" :y1="zeroLineY" :x2="width" :y2="zeroLineY"
        stroke="var(--border-default)" stroke-width="1" stroke-dasharray="4 3"
      />
      <polygon :points="areaPoints" :fill="`url(#${gradientId})`" />
      <polyline :points="linePoints" fill="none" :stroke="strokeColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
    <svg v-else-if="points.length === 1" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" class="sparkline-svg">
      <line :x1="0" :y1="height / 2" :x2="width" :y2="height / 2" :stroke="strokeColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
    <div v-else class="sparkline-placeholder">
      <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" class="sparkline-svg">
        <line :x1="0" :y1="height / 2" :x2="width" :y2="height / 2" stroke="var(--border-default)" stroke-width="1" stroke-dasharray="4 3" />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IntradayPoint } from '@/modules/fund/fund-types'

const props = withDefaults(defineProps<{
  points?: IntradayPoint[]
  changeRate?: number
  /** 昨日收盘净值，用于绘制0线水位 */
  baseValue?: number
}>(), {
  points: () => [],
  changeRate: 0,
  baseValue: 0
})

const width = 120
const height = 48
const padY = 4

const _uid = Math.random().toString(36).substring(2, 8)
const gradientId = `spark-grad-${_uid}`

const strokeColor = computed(() => {
  if (props.changeRate > 0) return 'var(--color-rise)'
  if (props.changeRate < 0) return 'var(--color-fall)'
  return 'var(--color-flat)'
})

const fillColorTop = computed(() => {
  if (props.changeRate > 0) return 'var(--color-rise-glow)'
  if (props.changeRate < 0) return 'var(--color-fall-glow)'
  return 'rgba(156,163,175,0.08)'
})

const fillColorBottom = computed(() => {
  if (props.changeRate > 0) return 'var(--color-rise-glow)'
  if (props.changeRate < 0) return 'var(--color-fall-glow)'
  return 'rgba(156,163,175,0.02)'
})

const yAxis = computed(() => {
  const pts = props.points
  if (pts.length < 2) return null
  const values = pts.map(p => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  // 所有点值相同（T+2 水平线）时，用 baseValue 扩展 Y 轴范围以显示涨跌
  if (props.baseValue > 0 && min === max) {
    min = Math.min(min, props.baseValue)
    max = Math.max(max, props.baseValue)
    // 加 30% padding 防止横线和零线贴边
    const diff = max - min
    if (diff > 0) {
      min -= diff * 0.3
      max += diff * 0.3
    } else {
      // 水平线值与基准重合：用值本身的 0.5% 作为上下 padding
      const padding = min * 0.005
      min -= padding
      max += padding
    }
  }
  const range = max - min || 1
  return { min, max, range }
})

const linePoints = computed(() => {
  const pts = props.points
  const axis = yAxis.value
  if (!axis || pts.length < 2) return ''

  return pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * width
    const y = padY + (height - 2 * padY) - ((p.value - axis.min) / axis.range) * (height - 2 * padY)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})

const areaPoints = computed(() => {
  if (!linePoints.value) return ''
  return `0,${height} ${linePoints.value} ${width},${height}`
})

const zeroLineY = computed(() => {
  const axis = yAxis.value
  if (!axis || props.baseValue <= 0) return null
  if (props.baseValue < axis.min || props.baseValue > axis.max) return null
  return padY + (height - 2 * padY) - ((props.baseValue - axis.min) / axis.range) * (height - 2 * padY)
})
</script>

<style scoped>
.fund-sparkline {
  width: 100%;
  height: 48px;
  overflow: hidden;
}
.sparkline-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.sparkline-placeholder {
  width: 100%;
  height: 100%;
}
</style>
