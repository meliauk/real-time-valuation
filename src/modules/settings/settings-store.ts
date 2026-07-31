/**
 * 设置 Store - 集中管理用户偏好设置
 *
 * 主题、刷新策略、动画效果、资讯源、隐私控制等可配置项。
 * 所有设置持久化到 localStorage（STORAGE_KEYS.USER_SETTINGS），字段变化自动持久化。
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { STORAGE_KEYS } from '@/config/constants'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'

export type ThemeMode = 'dark' | 'light' | 'pure-white'
export type RefreshIntervalOption = 5 | 10 | 15 | 30 | 60 | 120 | 300

/** 隐私控制 - 5 项统一指标可见性，false=遮挡，true=可见。横栏汇总与基金列表共用同一套开关。 */
export interface PrivacySettings {
  /** 持有金额（本金/当前市值） */
  holding: boolean
  /** 今日收益（金额） */
  todayProfit: boolean
  /** 今日收益率 */
  todayRate: boolean
  /** 累计收益（金额） */
  totalProfit: boolean
  /** 累计收益率 */
  totalRate: boolean
}

export interface UserSettings {
  theme: ThemeMode
  autoRefresh: boolean
  marketAutoRefresh: boolean
  sectorAutoRefresh: boolean
  refreshInterval: RefreshIntervalOption
  marketRefreshInterval: RefreshIntervalOption
  sectorRefreshInterval: RefreshIntervalOption
  reduceMotion: boolean
  newsAutoRefresh: boolean
  overseasNews: boolean
  newsRefreshInterval: RefreshIntervalOption
  showPageMarquee: boolean
  showSearchGlow: boolean
  enableGlassEffect: boolean
  enableManagerCheck: boolean
  /** 开启实时涨跌幅：true=拉取持仓股行情并加权推算盘中实时涨跌（详情页胶囊+列表「实时涨跌幅」排序）；
   *  false=完全不做推算（不拉持仓股行情、不算 realtimeGszzl），省网络和算力。 */
  enablePrediction: boolean
  privacy: PrivacySettings
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'light',
  autoRefresh: true,
  marketAutoRefresh: true,
  sectorAutoRefresh: true,
  refreshInterval: 5,
  marketRefreshInterval: 60,
  sectorRefreshInterval: 60,
  reduceMotion: false,
  newsAutoRefresh: true,
  overseasNews: false,
  newsRefreshInterval: 120,
  showPageMarquee: false,
  showSearchGlow: false,
  enableGlassEffect: false,
  enableManagerCheck: true,
  enablePrediction: true,
  privacy: {
    holding: true, todayProfit: true, todayRate: true, totalProfit: true, totalRate: true,
  },
}

/**
 * 旧隐私结构（8 键，分仪表盘/列表两组）→ 新 5 项统一指标迁移。
 * 旧结构语义：今日收益率=dashboard_rates/list_today_rate，累计收益率=dashboard_rates/list_total_amount，
 * 沿用现状语义做无损映射（不纠正历史值）。无旧键时按默认补全缺字段（兼容部分写入/新装）。
 */
function migratePrivacy(old: Record<string, boolean> | undefined): PrivacySettings {
  const d = DEFAULT_SETTINGS.privacy
  if (!old) return { ...d }
  const hasOld = 'dashboard_holding' in old || 'list_holding' in old
  if (!hasOld) return { ...d, ...old } // 已是新结构或空，补全缺字段
  return {
    holding:     old.dashboard_holding   ?? old.list_holding      ?? d.holding,
    todayProfit: old.dashboard_today     ?? old.list_today_amount ?? d.todayProfit,
    todayRate:   old.dashboard_rates     ?? old.list_today_rate   ?? d.todayRate,
    totalProfit: old.dashboard_total     ?? old.list_total_amount ?? d.totalProfit,
    totalRate:   old.dashboard_rates     ?? old.list_total_amount ?? d.totalRate,
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const stored = loadJSON<Partial<UserSettings>>(STORAGE_KEYS.USER_SETTINGS, {})

  const theme = ref<ThemeMode>(stored.theme ?? DEFAULT_SETTINGS.theme)
  const autoRefresh = ref<boolean>(stored.autoRefresh ?? DEFAULT_SETTINGS.autoRefresh)
  const marketAutoRefresh = ref<boolean>(stored.marketAutoRefresh ?? DEFAULT_SETTINGS.marketAutoRefresh)
  const sectorAutoRefresh = ref<boolean>(stored.sectorAutoRefresh ?? DEFAULT_SETTINGS.sectorAutoRefresh)
  const refreshInterval = ref<RefreshIntervalOption>(stored.refreshInterval ?? DEFAULT_SETTINGS.refreshInterval)
  const marketRefreshInterval = ref<RefreshIntervalOption>(stored.marketRefreshInterval ?? DEFAULT_SETTINGS.marketRefreshInterval)
  const sectorRefreshInterval = ref<RefreshIntervalOption>(stored.sectorRefreshInterval ?? DEFAULT_SETTINGS.sectorRefreshInterval)
  const reduceMotion = ref<boolean>(stored.reduceMotion ?? DEFAULT_SETTINGS.reduceMotion)
  const newsAutoRefresh = ref<boolean>(stored.newsAutoRefresh ?? DEFAULT_SETTINGS.newsAutoRefresh)
  const overseasNews = ref<boolean>(stored.overseasNews ?? DEFAULT_SETTINGS.overseasNews)
  const newsRefreshInterval = ref<RefreshIntervalOption>(stored.newsRefreshInterval ?? DEFAULT_SETTINGS.newsRefreshInterval)
  const showPageMarquee = ref<boolean>(stored.showPageMarquee ?? DEFAULT_SETTINGS.showPageMarquee)
  const showSearchGlow = ref<boolean>(stored.showSearchGlow ?? DEFAULT_SETTINGS.showSearchGlow)
  const enableGlassEffect = ref<boolean>(stored.enableGlassEffect ?? DEFAULT_SETTINGS.enableGlassEffect)
  const enableManagerCheck = ref<boolean>(stored.enableManagerCheck ?? DEFAULT_SETTINGS.enableManagerCheck)
  const enablePrediction = ref<boolean>(stored.enablePrediction ?? DEFAULT_SETTINGS.enablePrediction)
  const privacy = ref<PrivacySettings>(migratePrivacy(stored.privacy as Record<string, boolean> | undefined))

  function toObject(): UserSettings {
    return {
      theme: theme.value, autoRefresh: autoRefresh.value,
      marketAutoRefresh: marketAutoRefresh.value, sectorAutoRefresh: sectorAutoRefresh.value,
      refreshInterval: refreshInterval.value, marketRefreshInterval: marketRefreshInterval.value,
      sectorRefreshInterval: sectorRefreshInterval.value, reduceMotion: reduceMotion.value,
      newsAutoRefresh: newsAutoRefresh.value, overseasNews: overseasNews.value,
      newsRefreshInterval: newsRefreshInterval.value, showPageMarquee: showPageMarquee.value,
      showSearchGlow: showSearchGlow.value, enableGlassEffect: enableGlassEffect.value,
      enableManagerCheck: enableManagerCheck.value, enablePrediction: enablePrediction.value,
      privacy: { ...privacy.value },
    }
  }

  function persist(): void {
    saveJSON(STORAGE_KEYS.USER_SETTINGS, toObject())
  }

  // 字段变化自动持久化
  const fields = [theme, autoRefresh, marketAutoRefresh, sectorAutoRefresh, refreshInterval,
    marketRefreshInterval, sectorRefreshInterval, reduceMotion, newsAutoRefresh, overseasNews,
    newsRefreshInterval, showPageMarquee, showSearchGlow, enableGlassEffect, enableManagerCheck,
    enablePrediction]
  for (const field of fields) watch(field, () => persist(), { deep: false })
  watch(privacy, () => persist(), { deep: true })

  function resetToDefaults(): void {
    theme.value = DEFAULT_SETTINGS.theme
    autoRefresh.value = DEFAULT_SETTINGS.autoRefresh
    marketAutoRefresh.value = DEFAULT_SETTINGS.marketAutoRefresh
    sectorAutoRefresh.value = DEFAULT_SETTINGS.sectorAutoRefresh
    refreshInterval.value = DEFAULT_SETTINGS.refreshInterval
    marketRefreshInterval.value = DEFAULT_SETTINGS.marketRefreshInterval
    sectorRefreshInterval.value = DEFAULT_SETTINGS.sectorRefreshInterval
    reduceMotion.value = DEFAULT_SETTINGS.reduceMotion
    newsAutoRefresh.value = DEFAULT_SETTINGS.newsAutoRefresh
    overseasNews.value = DEFAULT_SETTINGS.overseasNews
    newsRefreshInterval.value = DEFAULT_SETTINGS.newsRefreshInterval
    showPageMarquee.value = DEFAULT_SETTINGS.showPageMarquee
    showSearchGlow.value = DEFAULT_SETTINGS.showSearchGlow
    enableGlassEffect.value = DEFAULT_SETTINGS.enableGlassEffect
    enableManagerCheck.value = DEFAULT_SETTINGS.enableManagerCheck
    enablePrediction.value = DEFAULT_SETTINGS.enablePrediction
    privacy.value = { ...DEFAULT_SETTINGS.privacy }
  }

  const privacyState = computed<'all-visible' | 'partial' | 'all-hidden'>(() => {
    const vals = Object.values(privacy.value)
    if (vals.every(v => v)) return 'all-visible'
    if (vals.every(v => !v)) return 'all-hidden'
    return 'partial'
  })

  function showAllPrivacy(): void {
    const keys = Object.keys(privacy.value) as (keyof PrivacySettings)[]
    keys.forEach(k => { privacy.value[k] = true })
  }
  function hideAllPrivacy(): void {
    const keys = Object.keys(privacy.value) as (keyof PrivacySettings)[]
    keys.forEach(k => { privacy.value[k] = false })
  }

  function applyTheme(t: ThemeMode): void {
    const html = document.documentElement
    html.classList.remove('dark', 'light', 'pure-white')
    html.classList.add(t)
    if (t === 'dark') html.style.colorScheme = 'dark'
    else html.style.colorScheme = 'light'
  }
  function initTheme(): void { applyTheme(theme.value) }
  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme(theme.value)
  }
  watch(theme, (t) => applyTheme(t))

  return {
    theme, autoRefresh, marketAutoRefresh, sectorAutoRefresh, refreshInterval,
    marketRefreshInterval, sectorRefreshInterval, reduceMotion, newsAutoRefresh,
    overseasNews, newsRefreshInterval, showPageMarquee, showSearchGlow,
    enableGlassEffect, enableManagerCheck, enablePrediction, privacy,
    toObject, persist, resetToDefaults, initTheme, toggleTheme, applyTheme,
    privacyState, showAllPrivacy, hideAllPrivacy,
  }
})
