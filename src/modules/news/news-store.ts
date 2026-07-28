/**
 * 资讯板块 Pinia store
 *
 * 今日资讯列表 + 黑名单 + 已读。刷新走 news-service 多源聚合。
 * 黑名单/已读持久化 localStorage。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NewsItem } from './news-types'
import { STORAGE_KEYS } from '@/config/constants'
import { loadJSON, saveJSON, loadString, saveString } from '@/shared/cache/local-storage-io'
import { fetchTodayNews, fetchMoreNews } from './services/news-service'
import { filterByBlacklist } from './filter/news-blacklist'
import { useSettingsStore } from '@/modules/settings/settings-store'

export const useNewsStore = defineStore('news', () => {
  /** 原始资讯列表（未过滤黑名单） */
  const rawNews = ref<NewsItem[]>([])
  /** 黑名单来源列表 */
  const blacklist = ref<string[]>([])
  /** 已读标题集合 */
  const readTitles = ref<Set<string>>(new Set())
  /** 刷新中 */
  const loading = ref(false)

  /** 过滤黑名单后的资讯 */
  const news = computed(() => filterByBlacklist(rawNews.value, blacklist.value))

  /** 未读数 */
  const unreadCount = computed(() =>
    news.value.filter(item => !readTitles.value.has(item.title)).length,
  )

  /** 刷新今日资讯 */
  async function refresh(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      // 海外 RSS 由设置开关控制（overseasNews），关闭时只拉国内源
      const includeOverseas = useSettingsStore().overseasNews
      const items = await fetchTodayNews(includeOverseas)
      rawNews.value = items
    } finally {
      loading.value = false
    }
  }

  /** 加载更多（更早的今日资讯） */
  async function loadMore(): Promise<void> {
    if (rawNews.value.length === 0) return
    const beforeCtime = rawNews.value[rawNews.value.length - 1].ctime
    const older = await fetchMoreNews(beforeCtime)
    if (older.length > 0) {
      // 合并去重（保留已有，追加更早的）
      const existing = new Set(rawNews.value.map(n => n.title))
      const fresh = older.filter(n => !existing.has(n.title))
      rawNews.value = [...rawNews.value, ...fresh]
    }
  }

  /** 标记已读 */
  function markRead(title: string): void {
    readTitles.value.add(title)
    persistRead()
  }

  /** 恢复黑名单/已读 */
  function restoreState(): void {
    blacklist.value = loadJSON<string[]>(STORAGE_KEYS.NEWS_BLACKLIST, [])
    const readArr = loadString(STORAGE_KEYS.NEWS_READ)
    if (readArr) {
      try { readTitles.value = new Set(JSON.parse(readArr)) } catch { /* ignore */ }
    }
  }

  function persistRead(): void {
    saveString(STORAGE_KEYS.NEWS_READ, JSON.stringify([...readTitles.value]))
  }

  function persistBlacklist(): void {
    saveJSON(STORAGE_KEYS.NEWS_BLACKLIST, blacklist.value)
  }

  /** 添加黑名单来源 */
  function addBlacklist(source: string): void {
    if (!blacklist.value.includes(source)) {
      blacklist.value = [...blacklist.value, source]
      persistBlacklist()
    }
  }

  return {
    rawNews, blacklist, readTitles, loading,
    news, unreadCount,
    refresh, loadMore, markRead, restoreState, addBlacklist,
  }
})
