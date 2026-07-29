/**
 * F10 持仓 HTML 表格解析
 *
 * 东方财富 F10 持仓接口（FundArchivesDatas type=jjcc）返回 HTML，
 * 含一个持仓表格。本文件从 HTML 提取报告期日期 + 持仓明细（代码/名称/占比/市场代码）。
 *
 * 解析口径：
 *   - 列位置动态识别：先从 <thead> 定位"股票代码/证券代码/基金代码"、"股票名称/证券名称/基金名称"、
 *     "占净值比例/占比"三列的下标（兼容 ETF 联接基金"基金代码"列头）。
 *   - 代码提取：A股 6 位纯数字 > 港股 4-5 位独立数字串 > 美股纯字母 > 兜底原串。
 *   - emMarketCode：从单元格内 quote.eastmoney.com/unify/r/<emCode>. 链接提取，权威市场标识。
 *   - 占比：取百分号前的数字。
 *   - 跳过"暂无数据"、缺代码+缺名称、占比非法的行。
 */

import type { HoldingDetailItem } from '@/modules/fund/fund-types'

/** 从 HTML 中提取报告期日期（优先匹配"报告期/截止日期/截止至"后的日期，否则取首个日期） */
export function extractHoldingsReportDate(html: string): string | null {
  if (!html) return null
  // [\s\S] 跨标签匹配（截止至后可能有 <font> 等标签）
  const m1 = html.match(/(报告期|截止日期|截止至)[\s\S]{0,40}?(\d{4}-\d{2}-\d{2})/)
  if (m1) return m1[2]
  const m2 = html.match(/(\d{4}-\d{2}-\d{2})/)
  return m2 ? m2[1] : null
}

/** 一个季度报告块（最新一期）解析结果 */
export interface ReportBlock {
  /** 该季度的表格 HTML（含 <table>...<tbody>...</table>） */
  html: string
  /** 报告期截止日期（如 2026-06-30），无则空串 */
  reportDate: string
  /** 季度标题（如"2026年2季度股票投资明细"），无则空串 */
  title: string
}

/**
 * 从 apidata.content 切出最新一期（按截止日期降序首块）的季度报告块。
 *
 * content 结构：多个 <div class='box'>，每个含一个 <h4>（标题+截止日期）和一个 <table>。
 * 按"截止至：YYYY-MM-DD"日期降序取首块（最新报告期）。
 * @returns 最新块（html 含其 <table>，供 parseHoldingsHtml 解析）；无块返回 null
 */
export function extractLatestReportBlock(content: string): ReportBlock | null {
  if (!content || content.includes('暂无数据')) return null
  // 按 <div class='box'> 切块（每个 box 是一个季度）
  // 容错：content 顶层是 <div class='box'><div class='boxitem'>...<h4>...<table>...
  const blocks: { html: string; date: string; title: string }[] = []
  // 用 <h4 class='t'> 作为每块起点切分（标题含截止日期）
  const parts = content.split(/<h4[^>]*class=['"]t['"]/i)
  for (let i = 1; i < parts.length; i++) {
    // 该块从 h4 到下一个 h4（或 content 末尾）。split 后 parts[i] 是 h4 之后到下一分隔点的内容。
    const blockHtml = parts[i]
    // 截止日期：<font class='px12'>2026-06-30</font> 或 截止至：2026-06-30
    // 用 [\s\S] 跨标签匹配（截止至后可能有 <font> 等标签，[^0-9]* 匹配不了跨标签）
    const dateM = blockHtml.match(/截止至[\s\S]{0,80}?(\d{4}-\d{2}-\d{2})/)
    const date = dateM ? dateM[1] : ''
    // 标题：<a ...>易方达消费行业股票</a>&nbsp;&nbsp;2026年2季度股票投资明细
    const titleM = blockHtml.match(/(\d{4}年[一二三四1234]季度股票投资明细)/)
    const title = titleM ? titleM[1] : ''
    // 该块的 table（从块开头到 </table>，取第一个 table 的完整内容）
    const tableMatch = blockHtml.match(/<table[\s\S]*?<\/table>/i)
    const tableHtml = tableMatch ? tableMatch[0] : ''
    if (tableHtml) blocks.push({ html: tableHtml, date, title })
  }
  if (blocks.length === 0) {
    // 兜底：无 h4 分块（结构异常），取整个 content 的第一个 table
    const tableMatch = content.match(/<table[\s\S]*?<\/table>/i)
    if (tableMatch) return { html: tableMatch[0], reportDate: extractHoldingsReportDate(content) ?? '', title: '' }
    return null
  }
  // 按截止日期降序取最新一期（有日期的优先，无日期的排后）
  blocks.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date)
    if (a.date) return -1
    if (b.date) return 1
    return 0
  })
  const latest = blocks[0]
  return { html: latest.html, reportDate: latest.date || extractHoldingsReportDate(latest.html) || '', title: latest.title }
}

/**
 * 解析 F10 jjcc 返回的 HTML 表格 → 持仓明细列表。
 * 先从 <thead> 识别列位置，再从 <tbody> 解析数据行（tbody 缺失时退全表 <tr>）。
 */
export function parseHoldingsHtml(content: string): HoldingDetailItem[] {
  if (!content || content.includes('暂无数据')) return []

  // 1) 解析 <thead> 列标题，动态定位关键列
  const headerRow = (content.match(/<thead[\s\S]*?<tr[\s\S]*?<\/tr>[\s\S]*?<\/thead>/i) || [])[0] || ''
  const headerCells = (headerRow.match(/<th[\s\S]*?>([\s\S]*?)<\/th>/gi) || []).map(th => th.replace(/<[^>]+>/g, '').trim())
  let idxCode = -1, idxName = -1, idxWeight = -1
  headerCells.forEach((h, i) => {
    const t = h.replace(/\s+/g, '')
    if (idxCode < 0 && (t.includes('股票代码') || t.includes('证券代码') || t.includes('基金代码'))) idxCode = i
    if (idxName < 0 && (t.includes('股票名称') || t.includes('证券名称') || t.includes('基金名称'))) idxName = i
    if (idxWeight < 0 && (t.includes('占净值比例') || t.includes('占比'))) idxWeight = i
  })

  // 2) 解析 <tbody> 数据行
  const tbodyMatch = content.match(/<tbody[\s\S]*?<\/tbody>/i)
  const dataRows = tbodyMatch
    ? (tbodyMatch[0].match(/<tr[\s\S]*?<\/tr>/gi) || [])
    : (content.match(/<tr[\s\S]*?<\/tr>/gi) || [])

  const getText = (td: string) => td.replace(/<[^>]+>/g, '').trim()
  const getEmMarket = (td: string): string | undefined => {
    const m = td.match(/quote\.eastmoney\.com\/unify\/r\/(\d+)\./)
    return m ? m[1] : undefined
  }
  const results: HoldingDetailItem[] = []

  for (const row of dataRows) {
    const rawTds = (row.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi) || [])
    const tds = rawTds.map(td => getText(td))
    if (!tds.length) continue

    let stockCode = ''
    let stockName = ''
    let ratioStr = ''
    let emMarketCode: string | undefined

    // 代码列：优先按列下标取，缺失时在全行找首个 6 位纯数字
    if (idxCode >= 0 && tds[idxCode]) {
      const raw = String(tds[idxCode]).trim()
      emMarketCode = getEmMarket(rawTds[idxCode] || '')
      const mA = raw.match(/(\d{6})/)
      const mHK = raw.match(/(?<!\d)(\d{4,5})(?!\d)/) // 港股4-5位独立数字串
      const mAlpha = raw.match(/\b([A-Za-z]{1,10})\b/)
      stockCode = mA ? mA[1] : (mHK ? mHK[1] : (mAlpha ? mAlpha[1].toUpperCase() : raw))
    } else {
      const ci = tds.findIndex(txt => /^\d{6}$/.test(txt))
      if (ci >= 0) stockCode = tds[ci]
    }

    // 名称列：优先按列下标，缺失时取非代码非百分比的文本
    if (idxName >= 0 && tds[idxName]) {
      stockName = tds[idxName]
    } else if (stockCode) {
      const ni = tds.findIndex(txt => txt && txt !== stockCode && !/%$/.test(txt))
      stockName = ni >= 0 ? tds[ni] : ''
    }

    // 占比列：优先按列下标，缺失时在全行找首个百分比
    if (idxWeight >= 0 && tds[idxWeight]) {
      const wm = tds[idxWeight].match(/([\d.]+)\s*%/)
      ratioStr = wm ? wm[1] : tds[idxWeight]
    } else {
      const wi = tds.findIndex(txt => /\d+(?:\.\d+)?\s*%/.test(txt))
      if (wi >= 0) {
        const wm = tds[wi].match(/([\d.]+)\s*%/)
        ratioStr = wm ? wm[1] : ''
      }
    }

    const ratio = parseFloat(ratioStr)
    if (!stockCode && !stockName) continue
    if (!Number.isFinite(ratio)) continue

    results.push({ stockCode, stockName, ratio, emMarketCode })
  }

  return results
}
