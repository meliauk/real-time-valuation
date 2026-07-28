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
      <h2 class="page-title">资讯页</h2>
      <div class="header-placeholder"></div>
    </header>

    <!-- 可滚动主体 -->
    <div class="settings-body">
      <SettingsSection title="24h 资讯">
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">资讯自动刷新</span>
            <span class="setting-desc">行情页自动拉取最新财经资讯</span>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="settingsStore.newsAutoRefresh" />
            <span class="switch-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">海外财经资讯</span>
            <span class="setting-desc">拉取 Yahoo Finance、CNBC 等海外 RSS 源。国内网络可能加载较慢，默认关闭</span>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="settingsStore.overseasNews" />
            <span class="switch-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">资讯刷新间隔</span>
            <span class="setting-desc">行情页资讯列表的自动刷新间隔</span>
          </div>
          <select class="select-input" v-model.number="settingsStore.newsRefreshInterval">
            <option :value="30">30 秒</option>
            <option :value="60">1 分钟</option>
            <option :value="120">2 分钟 — 推荐</option>
            <option :value="300">5 分钟</option>
          </select>
        </div>
      </SettingsSection>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 资讯页设置子页 - 资讯自动刷新/海外资讯/刷新间隔 */
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/modules/settings/settings-store'
import SettingsSection from '@/views/settings/settings-section.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
</script>
