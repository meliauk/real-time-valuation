/**
 * 海外 RSS 资讯源
 *
 * Yahoo Finance / CNBC / MarketWatch 等 RSS，通过 rss2json 代理转 JSON。
 * 主线程 fetch（rss2json 有 CORS 头，可跨域读）。只保留今日资讯。
 * 任意源失败不影响其他。
 */

import type { NewsItemWithTime } from '../news-types'
import { formatTimestamp, formatTime } from '../format/news-time'
import { getTodayStr } from '@/shared/utils/date-format'

interface Rss2JsonItem {
  title: string
  pubDate: string
  link: string
}
interface Rss2JsonResponse {
  status: string
  items?: Rss2JsonItem[]
}

/** 海外 RSS 源：名称 → feed URL */
const OVERSEAS_FEEDS: [string, string][] = [
  ['Yahoo Finance', 'https://finance.yahoo.com/news/rssindex'],
  ['CNBC', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114'],
  ['MarketWatch', 'https://feeds.marketwatch.com/marketwatch/topstories/'],
]

/** 取单个 RSS 源（失败返回空数组） */
async function fetchOneRssFeed(feedUrl: string, sourceName: string): Promise<NewsItemWithTime[]> {
  try {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    const resp = await fetch(apiUrl, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!resp.ok) return []
    const data: Rss2JsonResponse = await resp.json()
    if (data.status !== 'ok' || !data.items?.length) return []

    const today = getTodayStr()
    const items: NewsItemWithTime[] = []
    for (const item of data.items) {
      if (!item.title || !item.link) continue
      const d = new Date(item.pubDate)
      if (isNaN(d.getTime())) continue
      const ctime = Math.floor(d.getTime() / 1000)
      if (formatTimestamp(ctime) !== today) continue
      items.push({
        title: item.title.trim(), url: item.link.trim(),
        time: formatTime(ctime), source: sourceName, ctime,
      })
    }
    return items
  } catch {
    return []
  }
}

/** 聚合所有海外 RSS 源 */
export async function fetchOverseasNews(): Promise<NewsItemWithTime[]> {
  const results = await Promise.all(
    OVERSEAS_FEEDS.map(([name, url]) => fetchOneRssFeed(url, name)),
  )
  return results.flat()
}
