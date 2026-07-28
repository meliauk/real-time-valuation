/**
 * 东方财富 24h 滚动资讯源
 *
 * 东财 clist 接口，多个 fs 覆盖财经/宏观/行业/公司/市场/债券/全球。
 * JSONP 主线程取，只保留今日资讯。拉取 1 页 50 条减少流量。
 */

import type { NewsItemWithTime } from '../news-types'
import { API_URLS } from '@/config/constants'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'
import { parseEastmoneyTime, formatTimestamp, formatTime } from '../format/news-time'
import { getTodayStr } from '@/shared/utils/date-format'

interface EmNewsRaw {
  f14: string  // 标题
  f16: string  // 来源
  f17: string  // 时间
  f20: string  // URL
}

/** 分类筛选条件 */
const FS = [
  'm:0+t:6+f:!2',   // 财经
  'm:0+t:13+f:!2',  // 宏观
  'm:0+t:80+f:!2',  // 行业
  'm:1+t:2+f:!2',   // 公司
  'm:1+t:23+f:!2',  // 市场
  'm:0+t:7+f:!2',   // 债券
  'm:1+t:3+f:!2',   // 全球
].join(',')

const FIELDS = 'f12,f14,f16,f17,f20'

/** 取东财今日滚动新闻（1 页 50 条） */
export async function fetchEastmoneyNews(): Promise<NewsItemWithTime[]> {
  const today = getTodayStr()
  const allNews: NewsItemWithTime[] = []
  try {
    const cb = genCallbackName('emNews')
    const url = `${API_URLS.EASTMONEY_NEWS}?cb=${cb}&fid=ctime&po=1&pz=50&pn=1&np=1&fltt=2&invt=2&fs=${encodeURIComponent(FS)}&fields=${FIELDS}`
    const resp = await jsonpRequest<{ data?: { diff?: EmNewsRaw[] } }>(url, cb, 6000)
    if (!resp?.data?.diff) return allNews
    for (const item of resp.data.diff) {
      const title = String(item.f14 || '').trim()
      const source = String(item.f16 || '').trim() || '东方财富'
      const url = String(item.f20 || '').trim()
      if (!title || !url) continue
      const ctime = parseEastmoneyTime(String(item.f17 || ''))
      if (!ctime) continue
      if (formatTimestamp(ctime) !== today) continue
      allNews.push({ title, url, time: formatTime(ctime), source, ctime })
    }
  } catch { /* 静默 */ }
  return allNews
}

/** 深度拉取更早的今日资讯（page 4-8） */
export async function fetchEastmoneyNewsDeep(beforeCtime: number): Promise<NewsItemWithTime[]> {
  const today = getTodayStr()
  const allNews: NewsItemWithTime[] = []
  for (let page = 4; page <= 8; page++) {
    try {
      const cb = genCallbackName(`emDeep_${page}`)
      const url = `${API_URLS.EASTMONEY_NEWS}?cb=${cb}&fid=ctime&po=1&pz=50&pn=${page}&np=1&fltt=2&invt=2&fs=${encodeURIComponent(FS)}&fields=${FIELDS}`
      const resp = await jsonpRequest<{ data?: { diff?: EmNewsRaw[] } }>(url, cb, 6000)
      if (!resp?.data?.diff) break
      let hasRelevant = false
      for (const item of resp.data.diff) {
        const title = String(item.f14 || '').trim()
        const source = String(item.f16 || '').trim() || '东方财富'
        const url = String(item.f20 || '').trim()
        if (!title || !url) continue
        const ctime = parseEastmoneyTime(String(item.f17 || ''))
        if (!ctime) continue
        if (formatTimestamp(ctime) !== today) continue
        if (ctime >= beforeCtime) continue
        hasRelevant = true
        allNews.push({ title, url, time: formatTime(ctime), source, ctime })
      }
      if (!hasRelevant) break
    } catch { /* 静默 */ }
  }
  return allNews
}
