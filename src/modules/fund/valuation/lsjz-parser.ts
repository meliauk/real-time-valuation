/**
 * F10 lsjz 历史净值 HTML 表格解析
 *
 * 东方财富 F10 lsjz 接口返回 HTML 表格，含日期/单位净值/日增长率三列。
 * 本文件从 HTML 提取净值序列，按日期升序返回（末尾为最新）。
 *
 * 解析口径：
 *   - 日期列需匹配 YYYY-MM-DD 格式；
 *   - 净值列取首个可 parseFloat 的数字；
 *   - 增长率列取首个带 % 的数字（可能为空 → null）；
 *   - 跳过"暂无数据"。
 *   - 结果 reverse 为升序（接口返回是降序，最新在前）。
 */

/** 历史净值行 */
export interface LsjzRow {
  /** 净值日期 YYYY-MM-DD */
  date: string
  /** 单位净值 */
  nav: number
  /** 日增长率（百分比，可能为 null） */
  growth: number | null
}

/** 解析 F10 lsjz 返回的 HTML 表格内容 → 净值行（升序，末尾最新） */
export function parseLsjzContent(content: string): LsjzRow[] {
  if (!content || content.includes('暂无数据')) return []

  const rowMatches = content.match(/<tr[\s\S]*?<\/tr>/gi) || []
  const results: LsjzRow[] = []

  for (const row of rowMatches) {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/gi) || []
    if (!cells.length) continue

    const getText = (td: string) => td.replace(/<[^>]+>/g, '').trim()
    const dateStr = getText(cells[0] || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue

    const navStr = getText(cells[1] || '')
    const nav = parseFloat(navStr)
    if (!Number.isFinite(nav)) continue

    // 增长率：在所有单元格找首个带 % 的数字
    let growth: number | null = null
    for (const c of cells) {
      const txt = getText(c)
      const m = txt.match(/([-+]?\d+(?:\.\d+)?)\s*%/)
      if (m) {
        growth = parseFloat(m[1])
        break
      }
    }

    results.push({ date: dateStr, nav, growth })
  }

  // 接口返回降序（最新在前），反转成升序
  return results.reverse()
}
