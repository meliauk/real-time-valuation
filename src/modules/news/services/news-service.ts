/**
 * 资讯聚合服务
 *
 * 多源聚合入口：新浪 + 东财（主线程 JSONP）+ 海外 RSS（主线程 fetch，可选）。
 * 任一源失败不影响其他。按发布时间倒序、按标题去重。
 * 加载更多：拉取更深页数的今日资讯。
 */

import type { NewsItem, NewsItemWithTime } from '../news-types'
import { fetchSinaNews, fetchSinaNewsDeep } from '../sources/sina-news'
import { fetchEastmoneyNews, fetchEastmoneyNewsDeep } from '../sources/eastmoney-news'
import { fetchOverseasNews } from '../sources/overseas-rss'
import { mergeAndDedup } from '../filter/news-merge'

/** 取今日财经快讯（多源聚合）
 *  @param includeOverseas 是否含海外 RSS（默认 false，由设置控制）
 */
export async function fetchTodayNews(includeOverseas: boolean = false): Promise<NewsItem[]> {
  const promises: Promise<NewsItemWithTime[]>[] = [
    fetchSinaNews(),
    fetchEastmoneyNews(),
  ]
  if (includeOverseas) {
    promises.push(fetchOverseasNews())
  }
  const [sina, em, overseas = []] = await Promise.all(promises)
  return mergeAndDedup(sina, em, overseas)
}

/** 加载更早的今日资讯（下拉加载更多，拉更深页数，仍限今日） */
export async function fetchMoreNews(beforeCtime: number): Promise<NewsItem[]> {
  const [sina, em] = await Promise.all([
    fetchSinaNewsDeep(beforeCtime),
    fetchEastmoneyNewsDeep(beforeCtime),
  ])
  return mergeAndDedup(sina, em)
}
