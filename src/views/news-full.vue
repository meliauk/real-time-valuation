<template>
  <div class="news-full-page">
    <!-- 统一功能区：左(黑名单) 右(刷新)，与股票页 toolbar 同布局，切换不跳动 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <button class="btn-header btn-filter" :class="{ active: showBlacklist }" @click="showBlacklist = !showBlacklist" title="来源关键词过滤">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <span class="btn-label">关键词过滤</span>
        </button>
      </div>
      <button class="btn-refresh" :class="{ spinning: refreshing }" @click="refreshNews" :disabled="refreshing" title="刷新资讯">
        <svg class="refresh-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        <span class="countdown-text">{{ countdown }}s</span>
      </button>
    </header>

    <!-- 黑名单面板（固定在顶部，不随内容滚动） -->
    <section v-show="showBlacklist" class="blacklist-panel glass-card">
      <div class="blacklist-header">
        <span class="blacklist-title">关键词过滤</span>
        <span class="blacklist-hint">输入关键词后回车添加，匹配来源或标题的资讯将被过滤</span>
      </div>
      <div class="blacklist-tags">
        <span
          v-for="(kw, idx) in blacklistKeywords"
          :key="idx"
          class="blacklist-tag"
        >
          {{ kw }}
          <button type="button" class="tag-remove" @click="removeKeyword(idx)">&times;</button>
        </span>
      </div>
      <div class="blacklist-add-row">
        <input
          v-model="blacklistInput"
          class="blacklist-input-inline"
          placeholder="输入关键词，回车添加"
          @keydown.enter.prevent="addKeyword"
        />
        <button type="button" class="btn-add" @click="addKeyword">添加</button>
      </div>
    </section>

    <!-- 内容滚动区 -->
    <div class="news-body" ref="newsBodyRef">

    <!-- 资讯列表 -->
    <section class="news-panel">
      <div v-if="newsItems.length === 0" class="empty-text">
        暂无今日资讯
      </div>
      <div v-else class="news-timeline">
        <div
          v-for="(item, i) in newsItems"
          :key="i"
          :class="['news-item', { read: isRead(item.title) }]"
          @click="openNews(item)"
        >
          <div class="news-time-col">
            <span class="news-time">{{ item.time }}</span>
            <span :class="['time-dot', { active: i === 0 }]"></span>
            <span v-if="i < newsItems.length - 1" class="time-line"></span>
          </div>
          <div :class="['news-content', sourceColor(item.source)]">
            <span class="news-title">{{ item.title }}</span>
            <span class="news-source">{{ item.source }}</span>
          </div>
          <svg class="news-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
      <div v-if="loadingMore" class="loading-more">加载更多...</div>
      <div v-else-if="noMoreNews && newsItems.length > 0" class="loading-more">— 已加载全部今日资讯 —</div>
    </section>

    <!-- 底部占位 -->
    <div class="bottom-spacer"></div>

    <!-- 回到顶部 -->
    <button v-show="showBackTop" class="back-to-top" @click="scrollToTop" title="回到顶部">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// 资讯页：行情用 useNewsStore(@/modules/news/news-store)。
//   store API：refresh/news(过滤后)/rawNews/blacklist/addBlacklist/restoreState/loadMore。
//   已读记录由本页自管（localStorage），store 也持有 readTitles 供设置页统计。
import { ref, onMounted, onUnmounted, onActivated, onDeactivated, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNewsStore } from '@/modules/news/news-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import { STORAGE_KEYS } from '@/config/constants'
import { saveJSON } from '@/shared/cache/local-storage-io'
import type { NewsItem } from '@/modules/news/news-types'
import { fetchMoreNews } from '@/modules/news/services/news-service'

defineOptions({ name: 'NewsFull' })

const router = useRouter()
const newsStore = useNewsStore()
const settingsStore = useSettingsStore()

const countdown = ref(settingsStore.newsRefreshInterval)

const newsItems = ref<NewsItem[]>([])
const showBackTop = ref(false)
const showBlacklist = ref(false)
const refreshing = ref(false)
const loadingMore = ref(false)
const noMoreNews = ref(false)

// ===== 已读资讯 =====
const readTitles = reactive(new Set<string>())

function loadReadTitles(): void {
  const raw = localStorage.getItem(STORAGE_KEYS.NEWS_READ)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      // 跨日清理：旧格式（纯数组）或日期不匹配则丢弃
      if (Array.isArray(parsed)) {
        // 旧格式，清理
        localStorage.removeItem(STORAGE_KEYS.NEWS_READ)
        return
      }
      const today = new Date().toISOString().slice(0, 10)
      if (parsed.date === today && Array.isArray(parsed.titles)) {
        for (const t of parsed.titles) readTitles.add(t)
      } else {
        localStorage.removeItem(STORAGE_KEYS.NEWS_READ)
      }
    } catch { /* ignore */ }
  }
}

function saveReadTitles(): void {
  const today = new Date().toISOString().slice(0, 10)
  localStorage.setItem(STORAGE_KEYS.NEWS_READ, JSON.stringify({
    date: today,
    titles: [...readTitles],
  }))
}

function markAsRead(title: string): void {
  if (readTitles.has(title)) return
  readTitles.add(title)
  saveReadTitles()
}

function isRead(title: string): boolean {
  return readTitles.has(title)
}

let scrollTimer: number | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
const newsBodyRef = ref<HTMLElement | null>(null)

function handleScroll(): void {
  if (scrollTimer) cancelAnimationFrame(scrollTimer)
  scrollTimer = requestAnimationFrame(() => {
    const el = newsBodyRef.value
    if (!el) return
    showBackTop.value = el.scrollTop > 400
    // 距离底部 200px 时触发加载更多
    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (scrollBottom < 200) {
      loadMoreNews()
    }
  })
}

function scrollToTop(): void {
  newsBodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// ===== 下拉加载更多 =====

async function loadMoreNews(): Promise<void> {
  if (loadingMore.value || noMoreNews.value) return
  const items = newsItems.value
  if (items.length === 0) return
  const oldestCtime = items[items.length - 1].ctime
  if (!oldestCtime) return

  loadingMore.value = true
  try {
    const more = await fetchMoreNews(oldestCtime)
    if (more.length > 0) {
      const existingTitles = new Set(items.map(i => i.title))
      const newItems = more.filter(i => !existingTitles.has(i.title))
      if (newItems.length > 0) {
        newsItems.value = [...items, ...newItems]
      }
    } else {
      noMoreNews.value = true
    }
  } finally {
    loadingMore.value = false
  }
}

function openNews(item: NewsItem): void {
  markAsRead(item.title)
  router.push({
    path: '/news/detail',
    query: { title: item.title, source: item.source, url: item.url },
  })
}

/** 资讯来源颜色哈希 */
function sourceColor(source: string): string {
  const colors = ['src-blue', 'src-purple', 'src-green', 'src-orange', 'src-red', 'src-teal']
  let hash = 0
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i)
    hash |= 0
  }
  return colors[Math.abs(hash) % colors.length]
}

// ===== 刷新逻辑 =====

function startCountdown(): void {
  if (countdownTimer) return // 已有定时器运行中，不重置
  if (!settingsStore.newsAutoRefresh) return
  countdown.value = settingsStore.newsRefreshInterval
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      refreshNews()
    }
  }, 1000)
}

function stopCountdown(): void {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

async function refreshNews(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await newsStore.refresh()
    newsItems.value = [...newsStore.news]
    noMoreNews.value = false
    stopCountdown()
    startCountdown()
  } finally {
    refreshing.value = false
  }
}

// ===== 黑名单逻辑 =====
const blacklistKeywords = ref<string[]>([])
const blacklistInput = ref('')

function initBlacklist(): void {
  blacklistKeywords.value = [...newsStore.blacklist]
}

function addKeyword(): void {
  const kw = blacklistInput.value.trim()
  if (!kw) return
  // 去重
  if (blacklistKeywords.value.some(k => k.toLowerCase() === kw.toLowerCase())) {
    blacklistInput.value = ''
    return
  }
  blacklistKeywords.value.push(kw)
  blacklistInput.value = ''
  applyBlacklist()
}

function removeKeyword(idx: number): void {
  blacklistKeywords.value.splice(idx, 1)
  applyBlacklist()
}

function applyBlacklist(): void {
  // store.news 为 computed，依赖 blacklist，赋值后自动重新过滤；持久化与 store 内部格式一致
  newsStore.blacklist = [...blacklistKeywords.value]
  saveJSON(STORAGE_KEYS.NEWS_BLACKLIST, newsStore.blacklist)
  newsItems.value = [...newsStore.news]
}

// 监听自动刷新开关和刷新间隔变化（在 setup 阶段注册，确保 keep-alive 下也能响应）
watch(() => settingsStore.newsAutoRefresh, () => { stopCountdown(); startCountdown() })
watch(() => settingsStore.newsRefreshInterval, () => { stopCountdown(); startCountdown() })

// ===== 生命周期 =====

let isFirstLoad = true

onMounted(async () => {
  // 预连接资讯源域名
  const preconnectDomains = ['https://finance.sina.com.cn']
  for (const domain of preconnectDomains) {
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = domain
    link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  }
  // 加载已读记录
  loadReadTitles()
  // 加载黑名单（同时恢复 store 黑名单/已读）
  newsStore.restoreState()
  initBlacklist()
  // 首次加载资讯
  await newsStore.refresh()
  newsItems.value = [...newsStore.news]
  isFirstLoad = false
  // 启动倒计时
  startCountdown()
})

onActivated(() => {
  newsBodyRef.value?.addEventListener('scroll', handleScroll, { passive: true })
})

onDeactivated(() => {
  newsBodyRef.value?.removeEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  newsBodyRef.value?.removeEventListener('scroll', handleScroll)
  stopCountdown()
})
</script>

<style scoped>
.news-full-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: var(--spacing-sm);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}
.back-btn:hover { color: var(--text-primary); border-color: var(--border-hover); }

/* 统一功能区：与股票页 toolbar 同布局同高度，切换不跳动 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  flex-shrink: 0;
  min-height: 40px;
  position: relative;
  z-index: 20;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  min-width: 0;
  flex: 1;
}

.news-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 var(--spacing-xs);
  flex-shrink: 0;
}

.news-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding-top: var(--spacing-md);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.logo-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.news-title-head {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-secondary);
}

.news-sub {
  font-size: var(--font-xs);
  color: var(--text-muted);
}

/* ===== 头部按钮 ===== */
.btn-header {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.btn-label { font-size: var(--font-xs); font-weight: 500; }

.btn-header:hover,
.btn-header.active {
  border-color: var(--color-primary);
  color: var(--color-primary-light);
  background: var(--color-primary-glow);
}

/* 关键词过滤按钮：用淡红色背景区分于主色按钮（过滤=屏蔽语义，红色更直观） */
.btn-filter:hover,
.btn-filter.active {
  border-color: var(--color-rise);
  color: var(--color-rise-light);
  background: var(--color-rise-glow);
}

/* ===== 刷新按钮 ===== */
.btn-refresh {
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
  white-space: nowrap;
}

.btn-refresh:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-light);
  background: var(--color-primary-glow);
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-icon {
  flex-shrink: 0;
  transition: transform 0.6s ease;
}

.btn-refresh.spinning .refresh-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.countdown-text {
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  text-align: right;
}

/* ===== 黑名单面板 ===== */
.blacklist-panel {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  margin-top: var(--spacing-sm);
}

.blacklist-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.blacklist-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.blacklist-hint {
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
}

/* 胶囊标签列表 */
.blacklist-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 0;
}

.blacklist-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--radius-full);
  background: var(--color-rise-glow);
  border: 1px solid var(--color-rise);
  color: var(--color-rise);
  font-size: var(--font-xs);
  line-height: 1.4;
}

.tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-rise);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  opacity: 0.6;
  transition: opacity var(--transition-fast);
}

.tag-remove:hover {
  opacity: 1;
}

/* 添加行 */
.blacklist-add-row {
  display: flex;
  gap: var(--spacing-xs);
}

.blacklist-input-inline {
  flex: 1;
  padding: 5px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--font-xs);
  outline: none;
  transition: border-color var(--transition-fast);
  font-family: inherit;
}

.blacklist-input-inline:focus {
  border-color: var(--color-primary);
}

.blacklist-input-inline::placeholder {
  color: var(--text-muted);
}

.btn-add {
  padding: 5px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-primary);
  background: var(--color-primary-glow);
  color: var(--color-primary-light);
  font-size: var(--font-xs);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.btn-add:hover {
  background: var(--color-primary);
  color: var(--text-primary);
}

/* ===== 资讯时间线 ===== */
.panel-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--spacing-sm);
}

.empty-text {
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--spacing-lg);
}

.loading-more {
  font-size: var(--font-xs);
  color: var(--text-muted);
  text-align: center;
  padding: var(--spacing-md);
  animation: breathe 1.5s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.news-timeline {
  display: flex;
  flex-direction: column;
}

.news-item {
  display: flex;
  align-items: stretch;
  cursor: pointer;
  gap: 0;
  transition: all 0.2s ease;
  padding: var(--spacing-sm) 0;
  border-radius: var(--radius-md);
}

.news-item:hover {
  background: var(--bg-card-hover);
  transform: translateX(2px);
  border-radius: var(--radius-md);
}

.news-item:hover .news-content {
  border-left-color: var(--color-primary);
}

.news-item.read .news-title {
  color: var(--text-muted);
}

.news-item.read .news-content {
  opacity: 0.55;
}

.news-item.read .time-dot {
  background: var(--text-muted);
  border-color: var(--text-muted);
  box-shadow: none;
}

.news-item:hover .news-arrow {
  opacity: 1;
  transform: translateX(0);
}

/* 时间列 */
.news-time-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 48px;
  flex-shrink: 0;
  position: relative;
  padding-top: 2px;
}

.news-time {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  margin-bottom: 6px;
}

.time-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--text-muted);
  background: transparent;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.time-dot.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  box-shadow: 0 0 6px var(--color-primary-glow);
}

.time-line {
  flex: 1;
  width: 1px;
  background: var(--border-default);
  margin-top: 4px;
  min-height: 12px;
}

/* 新闻内容 */
.news-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 var(--spacing-sm);
  border-left: 2px solid transparent;
  transition: border-color 0.2s ease;
}

.news-content.src-blue   { border-left-color: #3b82f6; }
.news-content.src-purple { border-left-color: #8b5cf6; }
.news-content.src-green  { border-left-color: #22c55e; }
.news-content.src-orange { border-left-color: #f59e0b; }
.news-content.src-red    { border-left-color: #ef4444; }
.news-content.src-teal   { border-left-color: #14b8a6; }

.news-title {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-source {
  font-size: 11px;
  color: var(--text-muted);
}

.news-arrow {
  flex-shrink: 0;
  color: var(--text-muted);
  opacity: 0;
  transform: translateX(-4px);
  transition: all 0.2s ease;
  align-self: center;
  margin-right: var(--spacing-sm);
}

.bottom-spacer {
  height: 60px;
}

/* ===== 回到顶部按钮 ===== */
.back-to-top {
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: all 0.3s ease;
  animation: fade-in-up 0.3s ease;
}

.back-to-top:hover {
  background: var(--bg-card-hover);
  border-color: var(--color-primary);
  color: var(--color-primary-light);
  transform: translateY(-2px);
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: 767px) {
  .news-full-page {
    padding: var(--spacing-sm);
  }

  .news-time-col {
    width: 40px;
  }

  .news-time {
    font-size: 10px;
  }

  .news-title {
    font-size: var(--font-xs);
  }

  .news-arrow {
    opacity: 0.4;
  }

  .back-to-top {
    bottom: 70px;
    right: 12px;
    width: 36px;
    height: 36px;
  }

  .btn-refresh {
    padding: 4px 8px;
  }

  .countdown-text {
    min-width: 24px;
  }
}
</style>
