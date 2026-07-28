/**
 * 新浪财经资讯源
 *
 * 新浪 roll 接口，多个 lid 覆盖不同分类（财经要闻/宏观/行业/公司/市场）。
 * JSONP 主线程取，只保留今日资讯。
 */

import type { NewsItemWithTime } from '../news-types'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'
import { formatTimestamp, formatTime } from '../format/news-time'
import { getTodayStr } from '@/shared/utils/date-format'

interface SinaNewsRaw {
  title: string
  url: string
  ctime: number
  media_name: string
}

/** 覆盖不同分类的 lid 列表 */
const LIDS = [2509, 2510, 2511, 2512, 2513]

/** 取新浪今日快讯（每个 lid 取 1 页 50 条，减少流量） */
export async function fetchSinaNews(): Promise<NewsItemWithTime[]> {
  const today = getTodayStr()
  const allNews: NewsItemWithTime[] = []
  for (const lid of LIDS) {
    try {
      const cb = genCallbackName(`sinaNews_${lid}`)
      const url = `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=${lid}&k=&num=50&page=1&callback=${cb}`
      const resp = await jsonpRequest<{ result?: { data?: SinaNewsRaw[] } }>(url, cb, 6000)
      if (!resp?.result?.data) continue
      for (const item of resp.result.data) {
        if (formatTimestamp(item.ctime) !== today) continue
        allNews.push({
          title: item.title, url: item.url,
          time: formatTime(item.ctime),
          source: item.media_name || '新浪财经',
          ctime: item.ctime,
        })
      }
    } catch { /* 静默 */ }
  }
  return allNews
}

/** 深度拉取更早的今日资讯（下拉加载更多，page 5-10） */
export async function fetchSinaNewsDeep(beforeCtime: number): Promise<NewsItemWithTime[]> {
  const today = getTodayStr()
  const allNews: NewsItemWithTime[] = []
  for (const lid of LIDS) {
    for (let page = 5; page <= 10; page++) {
      try {
        const cb = genCallbackName(`sinaDeep_${lid}_${page}`)
        const url = `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=${lid}&k=&num=50&page=${page}&callback=${cb}`
        const resp = await jsonpRequest<{ result?: { data?: SinaNewsRaw[] } }>(url, cb, 6000)
        if (!resp?.result?.data) break
        let hasRelevant = false
        for (const item of resp.result.data) {
          if (formatTimestamp(item.ctime) !== today) continue
          if (item.ctime < beforeCtime) {
            hasRelevant = true
            allNews.push({
              title: item.title, url: item.url,
              time: formatTime(item.ctime),
              source: item.media_name || '新浪财经',
              ctime: item.ctime,
            })
          }
        }
        if (!hasRelevant) break
      } catch { /* 静默 */ }
    }
  }
  return allNews
}
