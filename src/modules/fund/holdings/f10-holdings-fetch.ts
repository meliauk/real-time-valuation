/**
 * F10 基金持仓取数
 *
 * 东方财富 F10 FundArchivesDatas 接口（type=jjcc），返回持仓 HTML。
 * 通过 f10-apidata-loader 串行加载（window.apidata 全局回调，并发会覆盖），
 * holdings-parser 解析 HTML，report-date 判定报告类型。
 *
 * 两种取数模式：
 *   - full=true  → topline=200 获取全量持仓（年报/半年报披露全部）
 *   - full=false → topline=10 仅获取十大重仓（季报）
 *
 * 年份兜底：请求当年无数据时，用响应的 curyear 重试；全量模式若只返回季报（非全量）
 * 且未指定年份，回退上一年年报取全量。按季度（month=1/2/3/4）查年度报告。
 */

import type { FundAllHoldings, YearlyHoldingsResult } from '@/modules/fund/fund-types'
import { API_URLS, F10_CONFIG } from '@/config/constants'
import { loadApidata } from './f10-apidata-loader'
import { parseHoldingsHtml, extractHoldingsReportDate } from './holdings-parser'
import { detectReportType } from './report-date'
import { isValidFundCode } from '@/shared/utils/validation'

/**
 * 获取基金持仓数据。
 * @param fundCode 基金代码
 * @param options  year=指定年份（空=当年）；full=true全量/false十大；month=季度(1一季/2半年/3三季/4年报)
 */
export async function fetchFundAllHoldings(
  fundCode: string,
  options?: { year?: string; full?: boolean; month?: string },
): Promise<FundAllHoldings | null> {
  if (!isValidFundCode(fundCode)) return null

  const year = options?.year ?? ''
  const full = options?.full ?? false
  const month = options?.month ?? ''
  const topline = full ? F10_CONFIG.TOPLINE_FULL : F10_CONFIG.TOPLINE_TOP10
  const monthParam = month ? `&month=${month}` : ''

  const curYear = new Date().getFullYear()
  const yearToUse = year || String(curYear)

  const url = `${API_URLS.F10_HOLDINGS}?type=jjcc&code=${fundCode}&topline=${topline}&year=${yearToUse}${monthParam}&_=${Date.now()}`

  try {
    const apidata = await loadApidata(url, F10_CONFIG.TIMEOUT)
    if (!apidata) return full ? await fetchFundTop10Holdings(fundCode) : null

    const content = apidata.content || ''
    const holdings = parseHoldingsHtml(content)

    // 无数据：用响应的 curyear 重试
    if (holdings.length === 0 && apidata.curyear) {
      const retried = await fetchWithYear(fundCode, String(apidata.curyear), full, month)
      if (retried) return retried
    }

    if (holdings.length > 0) {
      const reportDate = extractHoldingsReportDate(content) ?? ''
      const { reportType, isFull } = detectReportType(reportDate)

      // 全量模式但结果仅为季报（前10大）→ 回退上一年年报取全量
      if (full && !isFull && !year && !month) {
        const prevYear = String(Number(yearToUse) - 1)
        const prevResult = await fetchWithYear(fundCode, prevYear, full, month)
        if (prevResult && prevResult.isFull) return prevResult
      }

      return { reportDate, reportType, isFull, holdings }
    }
  } catch {
    // 静默：本轮失败，上层可重试
  }

  // 全量模式兜底：仍取不到任何持仓 → 降级取十大重仓（topline=10），保证至少展示十大，不空白
  if (full) return await fetchFundTop10Holdings(fundCode)

  return null
}

/** 指定年份重新请求（不做全量模式回退，避免无限递归） */
async function fetchWithYear(
  fundCode: string, year: string, full: boolean, month: string,
): Promise<FundAllHoldings | null> {
  const topline = full ? F10_CONFIG.TOPLINE_FULL : F10_CONFIG.TOPLINE_TOP10
  const monthParam = month ? `&month=${month}` : ''
  const retryUrl = `${API_URLS.F10_HOLDINGS}?type=jjcc&code=${fundCode}&topline=${topline}&year=${year}${monthParam}&_=${Date.now()}`

  const retryData = await loadApidata(retryUrl, F10_CONFIG.TIMEOUT)
  if (!retryData) return null

  const retryContent = retryData.content || ''
  const retryHoldings = parseHoldingsHtml(retryContent)
  if (retryHoldings.length === 0) return null

  const reportDate = extractHoldingsReportDate(retryContent) ?? ''
  const { reportType, isFull } = detectReportType(reportDate)

  return { reportDate, reportType, isFull, holdings: retryHoldings }
}

/** 仅取十大重仓股（季报，topline=10） */
export async function fetchFundTop10Holdings(fundCode: string): Promise<FundAllHoldings | null> {
  return fetchFundAllHoldings(fundCode, { full: false })
}

/**
 * 按年份获取基金各季度持仓报告。
 * 依次按 month=1(一季)/2(半年)/3(三季)/4(年报) 查全量报告；全无数据则不限月份兜底查一次。
 */
export async function fetchFundHoldingsByYear(
  fundCode: string, year: string,
): Promise<YearlyHoldingsResult> {
  if (!isValidFundCode(fundCode)) return { year, reports: [], error: '无效的基金代码' }

  const reports: FundAllHoldings[] = []
  const quarters = [
    { month: '1', label: '一季报' },
    { month: '2', label: '半年报' },
    { month: '3', label: '三季报' },
    { month: '4', label: '年报' },
  ]

  for (const q of quarters) {
    try {
      const result = await fetchFundAllHoldings(fundCode, { year, full: true, month: q.month })
      if (result && result.holdings.length > 0) reports.push(result)
    } catch { /* 单季失败不影响其他季 */ }
  }

  // 各季度全无数据：不限月份兜底
  if (reports.length === 0) {
    try {
      const result = await fetchFundAllHoldings(fundCode, { year, full: true })
      if (result && result.holdings.length > 0) reports.push(result)
    } catch { /* ignore */ }
  }

  return { year, reports }
}
