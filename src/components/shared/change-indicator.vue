<template>
  <!-- 涨跌指示标签 - 根据涨跌方向自动变色 -->
  <span :class="[directionClass, 'font-number inline-flex items-center', hideArrow ? '' : 'gap-1']">
    <span v-if="direction === 'rise' && !hideArrow" class="text-xs">▲</span>
    <span v-else-if="direction === 'fall' && !hideArrow" class="text-xs">▼</span>
    <span v-else-if="!hideArrow" class="text-xs opacity-40">◆</span>
    <span>{{ displayValue }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * 涨跌指示组件
 * 根据数值正负自动显示红涨绿跌，带箭头图标
 */

import { computed } from 'vue'
import { formatChangeRate, formatMoney } from '@/shared/utils/money-format'

const props = defineProps<{
  /** 数值 - null/undefined 时显示 -- */
  value: number | null | undefined
  /** 显示类型：rate(涨跌幅) / money(金额) */
  type?: 'rate' | 'money'
  /** 隐藏箭头图标，文字更紧凑 */
  hideArrow?: boolean
}>()

/** 涨跌方向 */
const direction = computed(() => {
  if (props.value == null) return 'flat'
  if (props.value > 0) return 'rise'
  if (props.value < 0) return 'fall'
  return 'flat'
})

/** CSS 类名 */
const directionClass = computed(() => {
  switch (direction.value) {
    case 'rise': return 'text-rise'
    case 'fall': return 'text-fall'
    default: return 'text-flat'
  }
})

/** 显示文本 */
const displayValue = computed(() => {
  if (props.value == null) return '--'
  switch (props.type ?? 'rate') {
    case 'money': return formatMoney(props.value)
    default: return formatChangeRate(props.value)
  }
})
</script>
