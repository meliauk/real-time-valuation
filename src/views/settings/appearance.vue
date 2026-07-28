<template>
  <div class="settings-sub-page">
    <!-- 固定头部：返回按钮 + 标题 -->
    <header class="settings-header glass-card">
      <button class="back-btn" @click="router.back()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        <span>返回</span>
      </button>
      <h2 class="page-title">外观与视觉</h2>
      <div class="header-placeholder"></div>
    </header>

    <!-- 可滚动主体 -->
    <div class="settings-body">
      <SettingsSection title="外观与视觉">
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">主题模式</span>
            <span class="setting-desc">暗色科技/亮色玻璃/纯白极简三主题</span>
          </div>
          <div class="theme-switch">
            <button
              :class="['theme-btn', { active: settingsStore.theme === 'dark' }]"
              @click="settingsStore.theme = 'dark'"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              暗色
            </button>
            <button
              :class="['theme-btn', { active: settingsStore.theme === 'light' }]"
              @click="settingsStore.theme = 'light'"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
              亮色
            </button>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">减少动画效果</span>
            <span class="setting-desc">减少界面动画，降低 GPU 占用，适合低性能设备</span>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="settingsStore.reduceMotion" />
            <span class="switch-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">页面跑马灯边框</span>
            <span class="setting-desc">页面四周的流光边框特效。关闭可降低 GPU 占用</span>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="settingsStore.showPageMarquee" />
            <span class="switch-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">搜索框发光动画</span>
            <span class="setting-desc">顶部搜索框的炫彩发光边框。关闭可降低 GPU 占用</span>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="settingsStore.showSearchGlow" />
            <span class="switch-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">毛玻璃效果</span>
            <span class="setting-desc">卡片和弹窗的背景模糊效果。关闭可显著降低 GPU 占用，适合低性能设备</span>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="settingsStore.enableGlassEffect" />
            <span class="switch-slider"></span>
          </label>
        </div>
      </SettingsSection>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 外观与视觉设置子页 - 主题/动画/跑马灯/搜索框发光/毛玻璃 */
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/modules/settings/settings-store'
import SettingsSection from '@/views/settings/settings-section.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
</script>
