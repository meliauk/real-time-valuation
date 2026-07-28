/**
 * 资讯板块类型定义
 *
 * 财经快讯多源聚合（新浪/东财/海外RSS），统一 NewsItem 结构。
 */

/** 资讯条目 */
export interface NewsItem {
  /** 标题 */
  title: string
  /** 链接 */
  url: string
  /** 时间 HH:mm */
  time: string
  /** 来源 */
  source: string
  /** 发布时间戳（秒），用于排序和加载更多 */
  ctime: number
}

/** 携带 ctime 的临时项（内部排序用） */
export interface NewsItemWithTime extends NewsItem {
  ctime: number
}
