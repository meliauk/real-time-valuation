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
      <h2 class="page-title">板块页</h2>
      <div class="header-placeholder"></div>
    </header>

    <!-- 可滚动主体 -->
    <div class="settings-body">
      <SettingsSection title="板块">
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">板块自动刷新</span>
            <span class="setting-desc">板块数据自动刷新</span>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="settingsStore.sectorAutoRefresh" />
            <span class="switch-slider"></span>
          </label>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">板块刷新间隔</span>
            <span class="setting-desc">控制板块数据的自动刷新频率</span>
          </div>
          <select class="select-input" v-model.number="settingsStore.sectorRefreshInterval">
            <option :value="5">5 秒 — 最实时</option>
            <option :value="10">10 秒</option>
            <option :value="15">15 秒</option>
            <option :value="30">30 秒</option>
            <option :value="60">60 秒 — 推荐</option>
            <option :value="120">120 秒 — 最省流量</option>
          </select>
        </div>
      </SettingsSection>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 板块页设置子页 - 板块自动刷新/刷新间隔 */
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/modules/settings/settings-store'
import SettingsSection from '@/views/settings/settings-section.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
</script>
