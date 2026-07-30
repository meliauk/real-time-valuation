<!--
  根组件
  路由出口（keep-alive 缓存6页 + 路由淡入过渡）+ 底部导航 + 跑马灯边框。
  全屏视图（资讯详情/基金详情）隐藏底部导航与跑马灯。
  监听页面可见性变化触发跨日检测；监听设置开关 reduceMotion/glassEffect。
-->
<template>
  <div id="app" class="app-layout">
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
import { STORAGE_KEYS } from '@/config/constants'
import { hasSessionFlag, setSessionFlag } from '@/shared/cache/local-storage-io'

const route = useRoute()
const settingsStore = useSettingsStore()
const confirmState = useConfirmState()

/* 启动公告：每次"启动 app"弹一次，刷新不弹。
   区分依据 sessionStorage——刷新保留、关闭 app/标签页清空：
     - 启动 app（新会话）→ 标记不存在 → 弹 → 关闭时置标记
     - 刷新页面（同会话）→ 标记已存在 → 不弹
     - 重启 app（关闭重开）→ 会话清空标记清除 → 再弹 */
const startupNoticeVisible = ref(!hasSessionFlag(STORAGE_KEYS.STARTUP_NOTICE_SHOWN))

/** 公告关闭：置本会话已弹标记，本次刷新/重启前不再弹 */
function closeStartupNotice(): void {
  startupNoticeVisible.value = false
  setSessionFlag(STORAGE_KEYS.STARTUP_NOTICE_SHOWN)
}

/* 全屏视图：隐藏底部导航栏与跑马灯，不保留底部留白。
   登录/注册页全屏沉浸，与基金详情页同处理。 */
const isFullscreenView = computed(() =>
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
</style>
