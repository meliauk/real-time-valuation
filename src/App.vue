<!--
  根组件
  路由出口（keep-alive 缓存6页 + 路由淡入过渡）+ 底部导航 + 跑马灯边框。
  全屏视图（资讯详情/基金详情）隐藏底部导航与跑马灯。
  监听页面可见性变化触发跨日检测；监听设置开关 reduceMotion/glassEffect。
-->
<template>
  <div id="app" class="app-layout">
    <!-- 路由加载进度条：懒加载路由 chunk 下载期间的可见反馈。
         没有它时，慢网下首次点击基金行的表现是"点了完全没反应"（URL 与视图都不变）。 -->
    <transition name="route-progress">
      <div v-if="routeLoading" class="route-progress"><span class="route-progress-bar"></span></div>
    </transition>

    <main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="route-fade" mode="default">
          <keep-alive :max="6">
            <component :is="Component" />
          </keep-alive>
        </transition>
      </router-view>
    </main>
    <BottomNav v-if="!isFullscreenView" />
    <PageMarquee v-if="!isFullscreenView" />

    <!-- 全局二次确认弹窗（由 useConfirm() composable 单例驱动） -->
    <ConfirmModal
      :visible="confirmState.visible"
      :title="confirmState.title"
      :desc="confirmState.desc"
      :confirm-text="confirmState.confirmText"
      :cancel-text="confirmState.cancelText"
      :items="confirmState.items"
      @confirm="resolveConfirm"
      @cancel="resolveCancel"
      @update:visible="resolveCancel"
    />

    <!-- 启动公告：东财数据限制说明（每次启动 app 弹一次，刷新不弹） -->
    <NoticeModal
      :visible="startupNoticeVisible"
      title="数据获取受限通知"
      tone="warn"
      confirm-text="我知道了"
      @update:visible="(v) => { if (!v) closeStartupNotice() }"
      @close="closeStartupNotice"
    >
      <p>东方财富近期<strong>收紧了数据开放</strong>，已无法获取并推算基金的完整持仓。</p>
      <p>受此影响，目前<strong>仅展示前十大持仓股票及其占比</strong>；<strong>实时数据仅基于前十大持仓</strong>进行加权计算，不代表基金整体实时表现。</p>
      <p>建议<strong>优先使用手机端</strong>访问本应用。Web 端部分数据接口受浏览器跨域与环境限制可能无法正常返回，手机端体验更稳定完整。</p>
      <p class="notice-thanks">感谢理解与支持。</p>
    </NoticeModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BottomNav from '@/components/shared/bottom-nav.vue'
import PageMarquee from '@/components/shared/page-marquee.vue'
import ConfirmModal from '@/components/shared/confirm-modal.vue'
import NoticeModal from '@/components/shared/notice-modal.vue'
import { useSettingsStore } from '@/modules/settings/settings-store'
import { useConfirmState, resolveConfirm, resolveCancel } from '@/composables/use-confirm'
import { routeLoading } from '@/composables/use-route-loading'
import { STORAGE_KEYS } from '@/config/constants'
import { loadString, saveString, hasSessionFlag, setSessionFlag } from '@/shared/cache/local-storage-io'

const route = useRoute()
const settingsStore = useSettingsStore()
const confirmState = useConfirmState()

/* 启动公告：每个版本（每次构建发布）只弹一次，同版本内刷新/重启不再弹。
   原实现用 sessionStorage 每次启动 app 都弹 → 对老用户反复打扰；
   改为 localStorage 存「已弹过的版本号」，版本号 = __APP_VERSION__
   （git 短哈希+构建时间戳，vite 每次构建注入、每次发布唯一）：
     - 首次使用或升级到新版本 → 本地无记录/版本不同 → 弹
     - 同版本内刷新、重启 → 版本相同 → 不弹
   ⚠️ 版本号缺失（极端情况）退化为旧行为：每会话弹一次。 */
const startupNoticeVisible = ref(shouldShowStartupNotice())

function currentAppVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
}

function shouldShowStartupNotice(): boolean {
  const v = currentAppVersion()
  if (!v) return !hasSessionFlag(STORAGE_KEYS.STARTUP_NOTICE_SHOWN)
  return loadString(STORAGE_KEYS.STARTUP_NOTICE_SHOWN) !== v
}

/** 公告关闭：记录当前版本已弹，本版本内不再弹 */
function closeStartupNotice(): void {
  startupNoticeVisible.value = false
  const v = currentAppVersion()
  if (!v) setSessionFlag(STORAGE_KEYS.STARTUP_NOTICE_SHOWN)
  else saveString(STORAGE_KEYS.STARTUP_NOTICE_SHOWN, v)
}

/* 全屏视图：隐藏底部导航栏与跑马灯，不保留底部留白。
   登录/注册页全屏沉浸，与基金详情页同处理。 */
const isFullscreenView = computed(() =>
  route.path === '/pc' ||
  route.path === '/login' || route.path === '/register' ||
  route.path === '/news/detail' || route.path.startsWith('/fund/'),
)

// 跨日检测统一由 useCrossDay composable 负责（home.vue 引入），此处不再重复实现，
// 避免两套跨日口径并存（toLocaleDateString vs getTodayStr）误清同日缓存。

watch(() => settingsStore.reduceMotion, (enabled) => {
  if (enabled) document.documentElement.classList.add('reduce-motion')
  else document.documentElement.classList.remove('reduce-motion')
}, { immediate: true })

watch(() => settingsStore.enableGlassEffect, (enabled) => {
  if (!enabled) document.documentElement.classList.add('no-glass')
  else document.documentElement.classList.remove('no-glass')
}, { immediate: true })
</script>

<style scoped>
/* ===== 路由加载进度条（fixed 到视口顶部，不受 .app-layout 的 overflow 影响） ===== */
.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 9999;
  pointer-events: none;
  overflow: hidden;
  background: rgba(99, 102, 241, 0.12);
}
.route-progress-bar {
  display: block;
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
  animation: route-progress-slide 1.1s ease-in-out infinite;
}
@keyframes route-progress-slide {
  from { transform: translateX(-100%); }
  to   { transform: translateX(250%); }
}
/* 减少动画偏好：静态整条，不做位移动画 */
:global(.reduce-motion) .route-progress-bar {
  animation: none;
  width: 100%;
}
.route-progress-enter-active,
.route-progress-leave-active { transition: opacity 0.2s ease; }
.route-progress-enter-from,
.route-progress-leave-to { opacity: 0; }

.app-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* height 锁死（非 min-height）：用 100dvh 动态视口跟随 iOS 地址栏伸缩，
     100vh 兜底（旧浏览器）。锁死高度让 .app-main 的 flex:1 有确定上限，
     内部 .home-page(100dvh) 与之对齐，避免地址栏显示时 100vh > 可视区
     导致 body 溢出、文档上滑把顶部 header 顶出屏幕。 */
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  /* 阻断内部滚动溢出向 body/文档传播（iOS Safari 弹性滚动），
     与 html 的 overscroll-behavior:none 双保险。 */
  overscroll-behavior: contain;
}
.app-main {
  flex: 1;
  min-height: 0;
  padding-bottom: 60px;
  width: 100%;
  max-width: 640px;
  /* 内部可滚动容器滚到边界时不外传（contain 在最外层兜底，防 body 弹性上移） */
  overscroll-behavior: contain;
}
.app-layout:has(.news-page, .fund-detail-shell) .app-main {
  padding-bottom: 0;
}
/* PC 三栏布局：去掉移动端宽度限制与底部留白 */
.app-layout:has(.pc-home) .app-main {
  max-width: none;
  padding-bottom: 0;
}
</style>
