<template>
  <div class="settings-page">
    <!-- 顶部导航：返回按钮 + 标题 + 恢复默认 -->
    <header class="settings-header glass-card">
      <button class="back-btn" @click="router.back()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        <span>返回</span>
      </button>
      <h1 class="settings-title">设置</h1>
      <button class="reset-icon-btn" title="恢复默认设置" @click="showResetConfirm = true" aria-label="恢复默认设置">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
    </header>

    <!-- 可滚动主体：各板块设置入口 -->
    <div class="settings-body">
      <section class="entry-list glass-card">
        <button class="entry-item" @click="go('/settings/appearance')">
          <span class="entry-icon" style="color: var(--color-primary-light)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </span>
          <span class="entry-text">
            <span class="entry-label">外观与视觉</span>
            <span class="entry-desc">主题、动画、跑马灯、毛玻璃</span>
          </span>
          <svg class="entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button class="entry-item" @click="go('/settings/fund')">
          <span class="entry-icon" style="color: var(--color-primary-light)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </span>
          <span class="entry-text">
            <span class="entry-label">基金页</span>
            <span class="entry-desc">估值自动刷新、间隔、经理变更检测</span>
          </span>
          <svg class="entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button class="entry-item" @click="go('/settings/stock')">
          <span class="entry-icon" style="color: var(--color-rise)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </span>
          <span class="entry-text">
            <span class="entry-label">股票页</span>
            <span class="entry-desc">自选股自动刷新与间隔</span>
          </span>
          <svg class="entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button class="entry-item" @click="go('/settings/news')">
          <span class="entry-icon" style="color: var(--color-primary-light)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          <span class="entry-text">
            <span class="entry-label">资讯页</span>
            <span class="entry-desc">资讯刷新、海外源、间隔</span>
          </span>
          <svg class="entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button class="entry-item" @click="go('/settings/sector')">
          <span class="entry-icon" style="color: var(--color-primary-light)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </span>
          <span class="entry-text">
            <span class="entry-label">板块页</span>
            <span class="entry-desc">板块自动刷新与间隔</span>
          </span>
          <svg class="entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </section>
    </div>

    <!-- 恢复默认确认弹窗 -->
    <ConfirmModal
      :visible="showResetConfirm"
      title="恢复默认设置"
      desc="将主题、动画效果、刷新间隔等所有设置恢复为默认值。自选基金、持仓等数据不受影响。"
      confirm-text="确认恢复"
      cancel-text="取消"
      @confirm="executeResetDefaults"
      @cancel="showResetConfirm = false"
      @update:visible="showResetConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/modules/settings/settings-store'
import ConfirmModal from '@/components/shared/confirm-modal.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const showResetConfirm = ref(false)

function go(path: string): void {
  router.push(path)
}

function executeResetDefaults(): void {
  settingsStore.resetToDefaults()
  showResetConfirm.value = false
}
</script>

<style scoped>
.settings-page {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  gap: var(--spacing-sm);
}

.settings-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  flex-shrink: 0;
}

/* 返回按钮：沿用 manage.vue 的 .back-btn 样式 */
.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-xs);
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.back-btn:hover { color: var(--text-primary); border-color: var(--border-hover); }

/* 恢复默认设置图标按钮 */
.reset-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-rise-glow);
  background: var(--color-rise-glow);
  color: var(--color-rise);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.reset-icon-btn:hover {
  background: var(--color-rise);
  color: #fff;
  border-color: var(--color-rise);
  box-shadow: var(--shadow-rise-glow);
}

.settings-title {
  flex: 1;
  font-size: var(--font-lg);
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: var(--spacing-md);
}

/* 栏目入口列表：与 mine.vue 同款，hover 只选中单个条目 */
.entry-list {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-xs) var(--spacing-sm);
}
.entry-list.glass-card:hover {
  background-color: transparent;
  border-color: var(--border-default);
  box-shadow: var(--glass-shadow);
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
  .settings-page { padding: var(--spacing-sm); }
  .settings-header { padding: var(--spacing-sm) var(--spacing-md); }
}
</style>
