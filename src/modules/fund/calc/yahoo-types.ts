/**
 * Yahoo Finance chart 响应类型定义
 *
 * Yahoo chart API 返回的 JSON 结构。close/realtime 两 mode 共用此类型：
 *   - close 模式用 1d 线（日级收盘序列）
 *   - realtime 模式用 2m 线（含盘前/盘中/盘后 bar，需 includePrePost=true）
 *
 * meta 含 marketState（REGULAR/PRE/POST/CLOSED）和各时段价格/涨跌字段，
 * 供美股盘前盘后时段判定。
 */

/** Yahoo chart meta 字段 */
export interface YahooChartMeta {
  symbol?: string
  regularMarketPrice?: number
  regularMarketChangePercent?: number
  regularMarketChange?: number
  /** 最新成交时间（Unix 秒） */
  regularMarketTime?: number
  previousClose?: number
  currency?: string
  longName?: string
  shortName?: string
  /** 市场状态：REGULAR(盘中)/PRE(盘前)/POST(盘后)/CLOSED(已收盘)/PREPRE/POSTPOST */
  marketState?: string
  /** 盘前价格/涨跌（需 includePrePost=true） */
  preMarketPrice?: number
  preMarketChange?: number
  preMarketChangePercent?: number
  /** 盘后价格/涨跌 */
  postMarketPrice?: number
  postMarketChange?: number
  postMarketChangePercent?: number
}

/** Yahoo chart result（含收盘序列和时间戳） */
export interface YahooChartResult {
  meta?: YahooChartMeta
  timestamp?: number[]
  indicators?: {
    quote?: Array<{
      close?: (number | null)[]
    }>
  }
}

/** Yahoo chart 顶层响应 */
export interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[]
    error?: { code: string; description: string }
  }
}
