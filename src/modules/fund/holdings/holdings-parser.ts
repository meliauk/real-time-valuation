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

/** 从 HTML 中提取报告期日期（优先匹配"报告期/截止日期"后的日期，否则取首个日期） */
export function extractHoldingsReportDate(html: string): string | null {
  if (!html) return null
  const m1 = html.match(/(报告期|截止日期)[^0-9]{0,20}(\d{4}-\d{2}-\d{2})/)
  if (m1) return m1[2]
  const m2 = html.match(/(\d{4}-\d{2}-\d{2})/)
  return m2 ? m2[1] : null
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
