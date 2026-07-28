<template>
  <!-- 我的页 - 用户中心入口：随机用户卡 + 栏目入口列表 -->
  <div class="mine-page">
    <!-- 可滚动主体 -->
    <div class="mine-body">
      <!-- 随机用户卡：登录入口暂时关闭（auth 模块已实现，后期有需要再在 @click 接 /login 开放） -->
      <section class="user-card glass-card">
        <div class="avatar" :style="{ background: user.color }">
          <span class="avatar-initial">{{ user.initial }}</span>
        </div>
        <div class="user-info">
          <span class="user-name">{{ user.nickname }}</span>
          <span class="user-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            游客模式
          </span>
        </div>
      </section>

      <!-- 栏目入口列表 -->
      <section class="entry-list glass-card">
        <button class="entry-item" @click="go('/settings')">
          <span class="entry-icon" style="color: var(--color-primary-light)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          <span class="entry-text">
            <span class="entry-label">设置</span>
            <span class="entry-desc">外观、刷新策略、动画与隐私</span>
          </span>
          <svg class="entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button class="entry-item" @click="go('/settings/data')">
          <span class="entry-icon" style="color: var(--color-rise)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </span>
          <span class="entry-text">
            <span class="entry-label">数据管理</span>
            <span class="entry-desc">清除自选、持仓、缓存等本地数据</span>
          </span>
          <svg class="entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button class="entry-item" @click="go('/charity')">
          <span class="entry-icon" style="color: var(--color-rise)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </span>
          <span class="entry-text">
            <span class="entry-label">公益</span>
            <span class="entry-desc">请作者喝杯奶茶</span>
          </span>
          <svg class="entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button class="entry-item" @click="go('/settings/about')">
          <span class="entry-icon" style="color: var(--text-muted)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </span>
          <span class="entry-text">
            <span class="entry-label">关于</span>
            <span class="entry-desc">版本、数据来源与使用提示</span>
          </span>
          <svg class="entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 我的页 - 用户中心入口
 * 顶部随机用户卡（登录入口暂时关闭，auth 模块已实现待后期开放），
 * 下方栏目入口：设置 / 数据管理 / 公益 / 关于。
 */
defineOptions({ name: 'Mine' })

import { useRouter } from 'vue-router'
import { useRandomNickname } from '@/composables/use-random-nickname'

const router = useRouter()
const { user } = useRandomNickname()

function go(path: string): void {
  router.push(path)
}
</script>

<style scoped>
.mine-page {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

/* 可滚动主体 */
.mine-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding-bottom: 80px;
}

/* 随机用户卡（登录入口已关闭，不可点击） */
.user-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  transition: background var(--transition-fast);
  cursor: default;
}
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}
.avatar-initial {
  font-size: var(--font-xl);
  font-weight: 700;
  color: #fff;
}
.user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.user-name {
  font-size: var(--font-lg);
  font-weight: 700;
  color: var(--text-primary);
}
.user-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-xs);
  color: var(--text-muted);
}

/* 栏目入口列表 */
.entry-list {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-xs) var(--spacing-sm);
}
.entry-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-sm);
  background: transparent;
  border: none;
  border-top: 1px solid var(--border-default);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast);
  font-family: inherit;
}
.entry-item:first-child {
  border-top: none;
}
/* 覆盖 .glass-card:hover 全局规则：容器 hover 时不整体变背景，
   动态变化只针对被选中（hover/active）的单个条目，避免看起来全部被选中 */
.entry-list.glass-card:hover {
  background-color: transparent;
  border-color: var(--border-default);
  box-shadow: var(--glass-shadow);
}
.entry-item:hover {
  background: var(--bg-card-hover);
}
.entry-item:active {
  background: var(--color-primary-glow);
  transform: scale(0.995);
}
.entry-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform var(--transition-fast);
}
.entry-item:hover .entry-icon,
.entry-item:active .entry-icon {
  transform: translateX(2px);
}
.entry-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.entry-label {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
}
.entry-desc {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
.entry-arrow {
  flex-shrink: 0;
  color: var(--text-muted);
  opacity: 0.6;
  transition: transform var(--transition-fast), opacity var(--transition-fast);
}
.entry-item:hover .entry-arrow,
.entry-item:active .entry-arrow {
  transform: translateX(2px);
  opacity: 1;
}

@media (max-width: 767px) {
  .mine-page { padding: var(--spacing-sm); }
  .avatar { width: 44px; height: 44px; }
  .avatar-initial { font-size: var(--font-lg); }
}
</style>
