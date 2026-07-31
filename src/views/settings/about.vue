<template>
  <div class="about-page">
    <!-- 固定头部：返回按钮 + 标题 -->
    <header class="about-header glass-card">
      <button class="back-btn" @click="router.back()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>返回</span>
      </button>
      <h2 class="page-title">关于</h2>
      <div class="header-placeholder"></div>
    </header>

    <!-- 可滚动主体 -->
    <div class="about-body">
      <SettingsSection title="关于">
        <div class="about-info">
          <div class="about-row">
            <span>版本</span>
            <span class="about-value">v2.0.0</span>
          </div>
          <div class="about-row">
            <span>数据来源</span>
            <span class="about-value">天天基金 · 东方财富 · 新浪财经 · 腾讯</span>
          </div>
          <div class="about-row">
            <span>GitHub 源码</span>
            <a class="about-value about-link" href="https://github.com/L-newbie/real-time-valuation" target="_blank" rel="noopener noreferrer">
              https://github.com/L-newbie/real-time-valuation
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 17L17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </a>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="免责声明">
        <div class="about-disclaimer">
          <p>本应用提供的基金估值、股票行情、财经资讯等数据均来自公开第三方数据源，仅供学习研究参考，不构成任何投资建议。</p>
          <p>数据可能存在延迟或误差，请以官方披露为准。据此操作风险自负，本应用及作者不对因使用本应用产生的任何直接或间接损失承担责任。</p>
          <p>请遵守所在地区的相关法律法规，理性投资。</p>
        </div>
      </SettingsSection>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 关于页 - 从 settings.vue 拆出的关于分区，独立成二级栏目 */
import { useRouter } from 'vue-router'
import SettingsSection from '@/views/settings/settings-section.vue'

const router = useRouter()
</script>

<style scoped>
.about-page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--spacing-md);
  padding-bottom: calc(var(--spacing-md) + 56px + env(safe-area-inset-bottom, 0px));
  gap: var(--spacing-sm);
}

/* 头部（固定，不滚动）——沿用 manage.vue 的 back-btn 样式 */
.about-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  flex-shrink: 0;
}
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
}
.back-btn:hover { color: var(--text-primary); border-color: var(--border-hover); }
.page-title {
  flex: 1;
  font-size: var(--font-lg);
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
}
.header-placeholder { width: 60px; }

/* 可滚动主体 */
.about-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding-bottom: var(--spacing-md);
}

/* 关于信息 */
.about-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}
.about-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: var(--font-sm);
  color: var(--text-secondary);
  gap: var(--spacing-md);
}
.about-value {
  color: var(--text-muted);
  text-align: right;
  flex-shrink: 0;
}
.about-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  text-decoration: none;
  transition: color var(--transition-fast);
}
.about-link:hover { color: var(--text-primary); }

/* 免责声明 */
.about-disclaimer {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}
.about-disclaimer p {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--text-muted);
  line-height: 1.7;
}

@media (max-width: 767px) {
  .about-page { padding: var(--spacing-sm); }
  .about-header { padding: var(--spacing-sm) var(--spacing-md); }
}
</style>
