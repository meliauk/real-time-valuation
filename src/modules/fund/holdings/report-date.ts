/**
 * 基金持仓报告期判定
 *
 * 东方财富 F10 持仓按报告期返回，报告期日期的月份决定报告类型：
 *   03 → 一季报，06 → 半年报，09 → 三季报，12 → 年报。
 * 半年报/年报为"全部持仓"（isFull=true），季报仅"十大重仓"（isFull=false）。
 *
 * 推算持仓时据此判断：季报需结合最近年报/半年报按比例推算非前十大，
 * 半年报/年报已是全量披露无需推算。
 */

/** 报告期日期 → { 报告类型, 是否全量 } */
export function detectReportType(reportDate: string): { reportType: string; isFull: boolean } {
  if (!reportDate) return { reportType: '未知', isFull: false }
  const month = reportDate.substring(5, 7)
  switch (month) {
    case '03': return { reportType: '一季报', isFull: false }
    case '06': return { reportType: '半年报', isFull: true }
    case '09': return { reportType: '三季报', isFull: false }
    case '12': return { reportType: '年报', isFull: true }
    default: return { reportType: '未知', isFull: false }
  }
}

/** 从 apidata 响应中提取可用的报告期年份列表 */
export function extractAvailableYears(apidata: any): string[] {
  if (!apidata) return []
  const yearStr = apidata.year
  if (!yearStr) return []
  if (Array.isArray(yearStr)) return yearStr.map(String)
  if (typeof yearStr === 'string') return yearStr.split(/\s+/).filter(Boolean)
  return []
}
