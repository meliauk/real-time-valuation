<template>
  <!-- 底部导航栏 - 移动端风格 Tab Bar -->
  <nav class="bottom-nav glass-card">
    <router-link to="/" class="nav-item" :class="{ active: isActive('/') }">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
      <span>基金</span>
    </router-link>
    <router-link to="/market" class="nav-item" :class="{ active: isActive('/market') }">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
      <span>股票 x 板块 x 24h</span>
    </router-link>
    <router-link to="/mine" class="nav-item" :class="{ active: isActive('/mine') }">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      <span>我的</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const currentRoute = computed(() => route.path)

// 「我的」涵盖其下所有二级栏目：设置/数据管理/关于/指数设置/公益，进入任意一个都高亮「我的」。
const MINE_PATHS = ['/mine', '/settings', '/charity']

function isActive(path: string): boolean {
  if (path === '/') return currentRoute.value === '/'
  if (path === '/mine') {
    return MINE_PATHS.some(p => currentRoute.value === p || currentRoute.value.startsWith(p + '/'))
  }
  return currentRoute.value.startsWith(path)
}
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: var(--spacing-sm);
  /* 与内容板块等宽（640px - 两侧留白）并居中，圆角卡片样式与基金页顶部一致。
     ⚠️ 不用 left:50% + translateX(-50%) 居中：fixed 元素靠 transform 居中时，
     会被 .glass-card:hover（尤其 no-glass/pure-white 主题下的 transform:none）牵动，
     导致 hover/点击时整体向右位移。改用 left/right + margin:auto 居中，彻底脱离 transform。 */
  left: var(--spacing-md);
  right: var(--spacing-md);
  margin: 0 auto;
  max-width: calc(640px - var(--spacing-md) * 2);
  z-index: var(--z-fixed);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: var(--spacing-sm) 0;
  padding-bottom: calc(var(--spacing-sm) + env(safe-area-inset-bottom, 0px));
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--spacing-xs) var(--spacing-lg);
  color: var(--text-muted);
  font-size: 11px;
  text-decoration: none;
  transition: color var(--transition-fast);
  border-radius: var(--radius-md);
}

.nav-item:hover {
  color: var(--color-primary-light);
}

.nav-item.active {
  color: var(--color-primary);
}
</style>
