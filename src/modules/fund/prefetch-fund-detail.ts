/**
 * 基金详情页资源预热
 *
 * 问题：详情路由是懒加载 chunk，且它的图表库 echarts 约 518KB，两者此前都只在
 *   「第一次点基金行」的那一刻才发起下载。慢网下这段下载期间 router.push 尚未提交
 *   （URL 不变、视图不变、无任何提示），用户看到的就是「第一次打开详情没反应，
 *   过一会儿再点就好了」。
 *
 * 解法：把详情页资源提前拉下来（模块缓存命中后，路由懒加载即时 resolve，点击秒开）。
 *   两档预热：
 *     - 'view'：只拉详情路由 chunk（约 50KB，含详情页自身与几张小组件），开销很小；
 *     - 'full'：再顺手把 echarts 图表库（约 518KB）一起拉下来——弱网/省流量模式自动降级为 'view'。
 *   调用点：main.ts 首屏空闲预热（full）+ 基金列表鼠标悬停预热（full，鼠标移到行上即为强意图）。
 *
 * 幂等：重复调用不会重复下载；失败复位标记，交给下次点击/悬停重试。
 */

import { loadFundDetailChart } from '@/components/fund-detail/chart-lib'

/**
 * 详情页路由组件加载器。
 * router 的路由表与预热共用同一个函数（同一动态 import specifier → 同一 chunk，
 * 谁先执行谁发起下载，另一方直接命中模块缓存，不会重复请求）。
 */
export function loadFundDetailView() {
  return import('@/views/fund-detail.vue')
}

let viewPreloadStarted = false
let chartPreloadStarted = false

/**
 * 预热基金详情页资源。
 * @param mode 'view' 只预热详情页 chunk；'full' 连图表库一起预热（弱网下自动降级为 'view'）
 */
export function preloadFundDetail(mode: 'view' | 'full' = 'view'): void {
  if (!viewPreloadStarted) {
    viewPreloadStarted = true
    // 失败（离线 / 资源 404 / 部署更新导致旧 hash 失效）复位标记，下次点击或悬停可重试
    loadFundDetailView().catch(() => { viewPreloadStarted = false })
  }
  if (mode === 'full') warmChartLib()
}

/** 预热 518KB 的 echarts 图表库（幂等；弱网/省流量模式跳过，由详情页按需加载） */
function warmChartLib(): void {
  if (chartPreloadStarted) return
  if (!canPrefetchHeavyAssets()) return
  chartPreloadStarted = true
  loadFundDetailChart().catch(() => { chartPreloadStarted = false })
}

/**
 * 是否允许后台预热大体积资源（图表库）。
 * 省流量模式（saveData）或 2G 网络下不预热，避免替用户偷跑流量；
 * Network Information API 缺失（Safari/Firefox）时按"允许预热"处理。
 */
function canPrefetchHeavyAssets(): boolean {
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (!conn) return true
  if (conn.saveData) return false
  return !String(conn.effectiveType || '').includes('2g')
}

/**
 * 首屏空闲预热（main.ts 挂载后调用）。
 * 延迟到首屏渲染完之后再跑，避免与首屏取数抢带宽、抢主线程；
 * requestIdleCallback 不可用（Safari）时退化为纯 setTimeout。
 */
export function schedulePreloadFundDetail(delayMs = 1200): void {
  const run = (): void => preloadFundDetail('full')
  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }).requestIdleCallback
  setTimeout(() => {
    if (typeof ric === 'function') ric(run, { timeout: 2000 })
    else run()
  }, delayMs)
}
