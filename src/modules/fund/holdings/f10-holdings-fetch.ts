/**
 * F10 基金持仓取数
 *
 * 东方财富 F10 FundArchivesDatas 接口（type=jjcc），返回 `var apidata = {content, arryear, curyear}`。
 * content 含多个季度持仓表格（按 <h4> 分块），每块一个 <table>，列含股票代码/名称/占净值比例/持股数/市值。
 * 通过 f10-apidata-loader 串行加载（window.apidata 全局回调，并发会覆盖），
 * holdings-parser 解析 HTML，report-date 判定报告类型。
 *
 * 取数参数（实测，2026-07）：type=jjcc&code=X&topline=N&year=&month=&rt=rand
 *   ⚠️ year/month 必须空（传具体年份如 2026 反而取不到当期）。topline=10 取前十大、=200 取全量（年报/半年报）。
 *   rt 随机数防缓存。
 *
 * 两种取数模式：
 *   - full=true  → topline=200 获取全量持仓（年报/半年报披露全部）
 *   - full=false → topline=10 仅获取十大重仓（季报）
 *
 * 多季度处理：content 含多个季度块，取最新一期（按截止日期降序首块）。
 * 全量模式若最新一期是季报（非全量）且未指定年份，回退取最近年报/半年报全量。
 */

import type { FundAllHoldings, YearlyHoldingsResult } from '@/modules/fund/fund-types'
import { API_URLS, F10_CONFIG } from '@/config/constants'
import { loadApidata } from './f10-apidata-loader'
import { parseHoldingsHtml, extractLatestReportBlock, extractHoldingsReportDate } from './holdings-parser'
import { detectReportType } from './report-date'
import { isValidFundCode } from '@/shared/utils/validation'

/** 解析 jjcc 响应文本为 apidata 对象。
 *  响应格式 `var apidata = {content,arryear,curyear};` —— 是 JS 对象字面量
 *  （key 无引号、带换行缩进、content 字符串内含单引号 HTML 属性），非合法 JSON，JSON.parse 失败。
 *  用 new Function 沙箱执行取值（与项目 loadApidata 的 script 注入同性质，但隔离作用域不暴露 window）。 */
function parseApidataText(text: string): any | null {
  if (!text) return null
  // 提取 var apidata = {...} 或 apidata({...}) 的对象部分
  let objLiteral: string | null = null
  const m = text.match(/var\s+apidata\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)
  if (m) objLiteral = m[1]
  if (!objLiteral) {
    const m2 = text.match(/apidata\s*\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/)
    if (m2) objLiteral = m2[1]
  }
  if (!objLiteral) return null
  try {
    // 沙箱执行：函数体内 return 对象字面量，不暴露 window/global
    const fn = new Function(`return (${objLiteral})`) as () => any
    return fn()
  } catch {
    return null
  }
}

/** F10 专用多代理候选（不共用 yahoo 的单代理列表，避免影响 yahoo 限流控制）。
 *  allorigins /get（wrap）、allorigins /raw（直传）、thingproxy（直传）、corsproxy.io（直传）。 */
const F10_PROXY_CANDIDATES: Array<{ name: string; build: (u: string) => string; wrap: boolean }> = [
  { name: 'allorigins-get', build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, wrap: true },
  { name: 'allorigins-raw', build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, wrap: false },
  { name: 'thingproxy', build: (u) => `https://thingproxy.freeboard.io/fetch/${u}`, wrap: false },
  { name: 'corsproxy', build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`, wrap: false },
]

/** 经 CORS 代理 fetch jjcc 接口，取 raw 文本并解析为 apidata。
 *  script 注入在非 fundf10 origin（dev/gh-pages）会被东财 Referer 校验拒绝，
 *  走代理换 origin 绕过。代理只取文本，自行剥 var apidata 壳（fetchWithProxyRotation 会 JSON.parse 失败，故独立实现）。 */
async function loadApidataViaProxy(url: string, timeoutMs: number = F10_CONFIG.TIMEOUT): Promise<any | null> {
  for (const candidate of F10_PROXY_CANDIDATES) {
    const proxyUrl = candidate.build(url)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs * 3) // 代理较慢，放宽超时到18s
    try {
      const resp = await fetch(proxyUrl, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!resp.ok) continue
      let text = ''
      if (candidate.wrap) {
        // allorigins /get：{contents, status:{http_code}}
        const raw = await resp.json() as { contents?: string; status?: { http_code?: number } }
        if (raw?.status?.http_code && raw.status.http_code !== 200) continue
        text = raw?.contents ?? ''
      } else {
        text = await resp.text()
      }
      if (!text) continue
      const apidata = parseApidataText(text)
      if (apidata && apidata.content) return apidata
    } catch {
      clearTimeout(timer)
      // 试下一个代理
    }
  }
  return null
}

/** 构造 jjcc 接口 URL（真实参数：year/month 空，topline 控制十大/全量） */
function buildUrl(fundCode: string, topline: number, year?: string, month?: string): string {
  // year/month 实测必须空（传具体年份取不到当期）。只有显式指定年份（按年查历史）才填。
  const y = year ? `&year=${year}` : '&year='
  const m = month ? `&month=${month}` : '&month='
  return `${API_URLS.F10_HOLDINGS}?type=jjcc&code=${fundCode}&topline=${topline}${y}${m}&rt=${Math.random()}`
}

/**
 * 获取基金持仓数据。
 * @param fundCode 基金代码
 * @param options  year=指定年份（空=当年最新）；full=true全量/false十大；month=季度(1一季/2半年/3三季/4年报)
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

  const url = buildUrl(fundCode, topline, year, month)

  try {
    // 先 script 注入（同 origin 直连最快）；失败（dev/gh-pages origin 被东财 Referer 拒）走代理兜底。
    // loadApidata 失败会 reject，单独捕获以走代理兜底（不让整个 try 跳过）。
    let apidata: any = null
    try {
      apidata = await loadApidata(url, F10_CONFIG.TIMEOUT)
    } catch {
      // script 注入失败（origin 被 Referer 拒），继续走代理兜底
    }
    if (!apidata || !apidata.content) {
      apidata = await loadApidataViaProxy(url, F10_CONFIG.TIMEOUT)
    }
    if (!apidata) return full ? await fetchFundTop10Holdings(fundCode) : null

    const content = apidata.content || ''
    // content 含多个季度块，取最新一期（按截止日期降序首块）
    const latest = extractLatestReportBlock(content)
    if (!latest) {
      // 无数据：用响应的 curyear 重试（兼容旧逻辑）
      if (apidata.curyear) {
        const retried = await fetchWithYear(fundCode, String(apidata.curyear), full, month)
        if (retried) return retried
      }
      return full ? await fetchFundTop10Holdings(fundCode) : null
    }

    const holdings = parseHoldingsHtml(latest.html)
    const reportDate = (latest.reportDate || extractHoldingsReportDate(content)) ?? ''
    const { reportType, isFull } = detectReportType(reportDate)

    // 全量模式但最新一期是季报（仅前十大）→ 回退取最近年报/半年报全量
    if (full && !isFull && !year && !month) {
      const prevYear = String(Number(apidata.curyear || new Date().getFullYear()) - 1)
      const prevResult = await fetchWithYear(fundCode, prevYear, full, month)
      if (prevResult && prevResult.isFull) return prevResult
    }

    if (holdings.length > 0) {
      return { reportDate, reportType, isFull, holdings }
    }

    // 最新期解析失败：退回用整个 content 兜底解析（旧逻辑兼容）
    const fallbackHoldings = parseHoldingsHtml(content)
    if (fallbackHoldings.length > 0) {
      return { reportDate, reportType, isFull, holdings: fallbackHoldings }
    }
  } catch {
    // 静默：本轮失败，上层可重试
  }

  // 全量模式兜底：仍取不到任何持仓 → 降级取十大重仓（topline=10），保证至少展示十大带占比，不空白
  if (full) return await fetchFundTop10Holdings(fundCode)

  return null
}

/** 指定年份重新请求（不做全量模式回退，避免无限递归） */
async function fetchWithYear(
  fundCode: string, year: string, full: boolean, month: string,
): Promise<FundAllHoldings | null> {
  const topline = full ? F10_CONFIG.TOPLINE_FULL : F10_CONFIG.TOPLINE_TOP10
  const retryUrl = buildUrl(fundCode, topline, year, month)

  // script 注入失败走代理兜底（同 fetchFundAllHoldings）
  let retryData = await loadApidata(retryUrl, F10_CONFIG.TIMEOUT)
  if (!retryData || !retryData.content) {
    retryData = await loadApidataViaProxy(retryUrl, F10_CONFIG.TIMEOUT)
  }
  if (!retryData) return null

  const retryContent = retryData.content || ''
  const latest = extractLatestReportBlock(retryContent)
  if (!latest) return null

  const holdings = parseHoldingsHtml(latest.html)
  if (holdings.length === 0) return null

  const reportDate = (latest.reportDate || extractHoldingsReportDate(retryContent)) ?? ''
  const { reportType, isFull } = detectReportType(reportDate)

  return { reportDate, reportType, isFull, holdings }
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
