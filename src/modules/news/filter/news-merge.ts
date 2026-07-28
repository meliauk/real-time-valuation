/**
 * 资讯多源合并去重
 *
 * 新浪 + 东财 + 海外 RSS 聚合，按发布时间倒序，按标题去重。
 */

import type { NewsItem, NewsItemWithTime } from '../news-types'

/** 多源合并 → 按时间倒序 + 按标题去重 → NewsItem[]（去掉 ctime） */
export function mergeAndDedup(...newsArrays: NewsItemWithTime[][]): NewsItem[] {
  const allNews = newsArrays.flat()
  allNews.sort((a, b) => b.ctime - a.ctime)
  const seen = new Set<string>()
  return allNews.filter(item => {
    if (seen.has(item.title)) return false
    seen.add(item.title)
    return true
  })
}
