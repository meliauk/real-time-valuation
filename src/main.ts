/**
 * 应用入口
 *
 * 职责：创建 Vue 应用、挂载 Pinia/路由/Element Plus、恢复持久化缓存、启动各板块。
 *
 * 多 Worker 架构下，本入口只负责"装配"，数据请求由各板块 Worker 发起，
 * 主线程只做调度与状态写入（详见 plan/v2.0.md）。
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import './assets/styles/main.css'
import { startFundModule } from './modules/fund/fund-bootstrap'
import { useSettingsStore } from './modules/settings/settings-store'
import { useCacheStore } from './modules/fund/cache-store'
import { useHoldingStore } from './modules/holding/holding-store'

const app = createApp(App)

// 注册 Element Plus 图标（全局组件）
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus)

app.mount('#app')

// 应用主题（dark/light）
useSettingsStore().initTheme()

// 启动基金板块（恢复缓存 + 估值刷新 + 3 service loop）
void startFundModule()

// 版本检查器：GitHub Pages 缓存 index.html 导致老用户读旧版，此处轮询 version.json，
// 与当前运行版本不一致即强制刷新，让用户自动用上最新部署。详见 version-checker.ts。
import('./shared/version/version-checker').then(({ startVersionChecker }) => {
  startVersionChecker()
}).catch(() => { /* 静默，不影响主功能 */ })

// 关页前兜底落盘：防抖定时器未触发时（用户快速关页/刷新）保证最后一次写入不丢。
// 同步调用 flush，不依赖异步 promise（beforeunload 内异步不可靠）。
// ⚠️ 用户在设置页执行"清除数据"时，需跳过兜底——否则刚被 removeItem 删掉的
//    FUND_CACHE / HOLDINGS 等键会被内存里仍完整的状态原样写回，等于没清。
//    清除流程会先置 window.__skipPersistOnUnload = true 再 reload。
window.addEventListener('beforeunload', () => {
  if ((window as unknown as { __skipPersistOnUnload?: boolean }).__skipPersistOnUnload) return
  try {
    useCacheStore().flushPersist()
    useHoldingStore().flushAllPersist()
  } catch { /* store 未初始化等异常，静默 */ }
})
