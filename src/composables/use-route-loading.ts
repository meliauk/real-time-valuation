/**
 * 全局路由加载态 - 供顶层进度条显示
 *
 * 懒加载路由（尤其基金详情：详情 chunk + 518KB 的 echarts 图表库）在慢网下需要数秒甚至数十秒才能到位。
 * 这段窗口里 router.push 还没有提交：URL 不变、视图不变、页面也没有任何提示——
 * 用户看到的就是「点了完全没反应」。这里用 beforeEach/afterEach 翻转一个 loading，
 * 由 App.vue 顶层渲染一条细进度条：只要导航还在进行中就一定有反馈，不会再出现"点了没反应"。
 *
 * 命中 keep-alive 缓存的页面导航会在同一 tick 内完成（进度条不会真正绘制），不产生闪烁。
 *
 * 另外接管 router.onError：路由 chunk 拉取失败（弱网、部署更新后旧 hash 失效）时 vue-router 会
 * 静默放弃这次导航，URL 与视图都不变——这正是"点击没反应"的另一种成因，这里补一条明确提示。
 */

import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Router } from 'vue-router'

/** 导航进行中（含懒加载 chunk 下载期） */
export const routeLoading = ref(false)

/**
 * 懒加载 chunk 拉取失败的错误特征（浏览器各自文案不同）。
 * 命中即说明"路由组件没拿到"，vue-router 会静默放弃这次导航——必须提示用户，否则就是点了没反应。
 */
const CHUNK_LOAD_ERROR = /dynamically imported module|Importing a module script failed|Loading chunk/i

/** 安装路由加载态监听（main.ts 里调用一次） */
export function setupRouteLoading(router: Router): void {
  router.beforeEach(() => {
    routeLoading.value = true
    return true
  })
  // afterEach 在导航成功/被中止后都会触发，一并在这里复位；
  // 懒加载 chunk 加载失败走 onError，避免进度条卡住不消失。
  router.afterEach(() => { routeLoading.value = false })
  router.onError((error: unknown) => {
    routeLoading.value = false
    // 弱网 / 部署更新后旧 hash 失效时，路由 chunk 会拉取失败，router 直接放弃导航（URL、视图都不变）。
    // 明确提示一次，而不是让用户面对"点了没反应"。
    const msg = String((error as { message?: string })?.message || '')
    if (CHUNK_LOAD_ERROR.test(msg)) {
      ElMessage.error('页面资源加载失败，请检查网络后重试')
    }
  })
}
