/**
 * 基金详情页图表库（vue-echarts / echarts）按需加载与注册
 *
 * 背景（首次打开详情"没反应"的根因之一）：
 *   原实现在 fund-detail-pane.vue 顶部静态 `import VChart from 'vue-echarts'` +
 *   `import ... from 'echarts/core|charts|components|renderers'`。rollup 会把 echarts 拆成独立的
 *   echarts-*.js（约 518KB）chunk，并把它当成**详情路由 chunk 的静态依赖**——路由懒加载必须等这
 *   518KB 下载完才能 resolve，而路由只有"第一次点击基金行"时才开始下载它。于是慢网下表现为：
 *   点了一下完全没反应（URL 不变、视图不变、也没有任何提示），过一会儿再点才打开（chunk 已缓存）。
 *
 * 改成运行时动态 import 后：详情页自身的 chunk（约 37KB + 14KB CSS）到位即可渲染首屏
 *   （头部估值 / 持仓操作 / 基金信息立即出来），走势图区域先显示占位文案，
 *   echarts 到位后自动补上——518KB 不再挡在首屏前面。
 *
 * ⚠️ echarts 的按需注册（core.use）必须在 <v-chart> 渲染之前完成，否则图表空白。
 *    故对外暴露 chartLibState，调用方只在 state === 'ready' 时才渲染 <v-chart>。
 * ⚠️ 真正的 echarts 具名 import 放在 ./chart-echarts 里（本模块动态 import 它），
 *    切勿把 echarts 子模块写成本模块的动态 import 命名空间访问——那会让 chunk 从 518KB 膨胀到 1MB。
 */

import { ref, type Component } from 'vue'

/** 图表库状态：idle 未开始 / loading 加载中 / ready 可用 / error 失败 */
export type ChartLibState = 'idle' | 'loading' | 'ready' | 'error'

/** 图表库（echarts）当前状态，供详情页决定渲染图表还是占位提示 */
export const chartLibState = ref<ChartLibState>('idle')

/** 加载中的 promise（并发共享；失败后清空以允许下次重试） */
let chartPromise: Promise<Component> | null = null

/**
 * 加载并注册 echarts，返回 chart 组件（即 vue-echarts 默认导出）。
 * 幂等：并发/重复调用共享同一 promise。失败后会被下一次调用重试。
 */
export function loadFundDetailChart(): Promise<Component> {
  if (chartPromise) return chartPromise

  chartLibState.value = 'loading'
  const p = (async (): Promise<Component> => {
    // 动态 import 边界放在 chart-echarts（内部是静态具名 import，保证 echarts 按需 tree-shake）
    const mod = await import('./chart-echarts')
    chartLibState.value = 'ready'
    return mod.default as Component
  })()

  chartPromise = p
  // catch 单独挂：不影响调用方拿到的 p（调用方仍需自行 catch），只负责状态复位与允许重试
  p.catch(() => {
    chartLibState.value = 'error'
    if (chartPromise === p) chartPromise = null
  })

  return p
}
