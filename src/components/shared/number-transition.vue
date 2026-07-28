<template>
  <!-- 数字动画过渡组件 - 估值/盈亏数值变化时的平滑动画效果 -->
  <span :class="['font-number', pulseClass]">{{ formattedValue }}</span>
</template>

<script setup lang="ts">
/**
 * 数字过渡动画组件
 * 当数值变化时触发脉冲动画，用于估值和盈亏数据的实时更新展示
 */

import { ref, watch, computed } from 'vue'
import { formatMoney, formatChangeRate, formatNetValue, formatCompactMoney, formatProfitCompact } from '@/shared/utils/money-format'

const props = defineProps<{
  /** 当前数值 */
  value: number
  /** 格式化类型：money(金额) / rate(涨跌幅) / netValue(净值) / compactMoney(紧凑金额,带¥) / compactProfit(紧凑收益,带±) */
  type?: 'money' | 'rate' | 'netValue' | 'compactMoney' | 'compactProfit'
}>()

const pulseClass = ref('')

/** 格式化显示值 */
const formattedValue = computed(() => {
  switch (props.type ?? 'money') {
    case 'rate': return formatChangeRate(props.value)
    case 'netValue': return formatNetValue(props.value)
    case 'compactMoney': return `¥${formatCompactMoney(props.value)}`
    case 'compactProfit': return formatProfitCompact(props.value)
    default: return formatMoney(props.value)
  }
})

/** 值变化时触发脉冲动画 */
watch(() => props.value, () => {
  pulseClass.value = 'animate-pulse-number'
  setTimeout(() => { pulseClass.value = '' }, 400)
})
</script>
