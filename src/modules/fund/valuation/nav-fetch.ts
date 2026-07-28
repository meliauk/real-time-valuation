/**
 * 基金最新净值涨跌取数
 *
 * 从东方财富 pingzhongdata（Data_netWorthTrend 净值序列）取最新一条有涨跌的净值记录，
 * 作为 T+2 推算持仓的单日净值约束（优化器用基金当日净值涨跌反推持仓权重）。
 *
 * 涨跌口径：
 *   - 优先用序列条目自带的 equityReturn（官方公布的日增长率）；
 *   - 缺失则用当日净值 vs 前一日净值自算，截 2 位小数。
 */

import { API_URLS, LSJZ_CONFIG } from '@/config/constants'
import { loadScriptVar } from '@/shared/net/jsonp-main'
import { isValidFundCode } from '@/shared/utils/validation'

/** 净值涨跌记录 */
export interface NavRecord {
  /** 净值日期 YYYY-MM-DD */
  date: string
  /** 日涨跌幅（百分比，2位小数） */
  changeRate: number
}

/** pingzhongdata 净值序列条目 */
interface NetWorthPoint {
  /** 时间戳（毫秒） */
  x: number
  /** 单位净值（可能为字符串或数字） */
  y: number | string
  /** 日增长率（字符串，可能为空） */
  equityReturn?: string
}

/** 取基金最新一条有涨跌的净值记录（null=无数据或失败） */
export async function fetchLatestNavChange(fundCode: string): Promise<NavRecord | null> {
  if (!isValidFundCode(fundCode)) return null
  try {
    const data = await loadScriptVar<NetWorthPoint[]>(
      `${API_URLS.FUND_DETAIL}${fundCode}.js?rt=${Date.now()}`,
      'Data_netWorthTrend',
      LSJZ_CONFIG.TIMEOUT,
    )
    if (!data || !Array.isArray(data) || data.length < 2) return null

    // 从末尾往前找第一条有涨跌的记录
    for (let i = data.length - 1; i >= 1; i--) {
      const item = data[i]
      const prev = data[i - 1]
      if (item.x == null || item.y == null) continue

      const date = formatDateFromTimestamp(item.x)
      let rate: number | null = null

      // 优先用官方 equityReturn
      if (item.equityReturn != null && item.equityReturn !== '') {
        const parsed = parseFloat(item.equityReturn)
        if (Number.isFinite(parsed)) rate = parsed
      }
      // 缺失则自算
      if (rate == null) {
        const prevVal = Number(prev.y)
        const curVal = Number(item.y)
        if (Number.isFinite(prevVal) && Number.isFinite(curVal) && prevVal > 0) {
          rate = ((curVal - prevVal) / prevVal) * 100
        }
      }

      if (rate != null && Number.isFinite(rate)) {
        return { date, changeRate: Math.round(rate * 100) / 100 }
      }
    }
    return null
  } catch {
    return null
  }
}

/** 时间戳 → 北京日期 YYYY-MM-DD */
function formatDateFromTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
