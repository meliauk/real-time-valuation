/**
 * 历史净值区间分页取数
 *
 * 按日期区间（sdate~edate）分页拉取 F10 lsjz 全部历史净值，去重后升序返回。
 * 用于净值走势展示、累计金额推算等需要完整净值序列的场景。
 *
 * 分页口径：每页 LSJZ_CONFIG.PER_PAGE 条，页内不足 per 视为最后一页停止；
 * 跨页按日期去重（接口分页边界可能重叠）；结果按日期升序排序。
 * 走 f10-apidata-loader 串行加载。
 */

import { API_URLS, LSJZ_CONFIG } from '@/config/constants'
import { loadApidata } from '../holdings/f10-apidata-loader'
import { parseLsjzContent, type LsjzRow } from './lsjz-parser'
import { isValidFundCode } from '@/shared/utils/validation'

/**
 * 按日期区间获取历史净值。
 * @param fundCode 基金代码
 * @param sdate    起始日期 YYYY-MM-DD
 * @param edate    结束日期 YYYY-MM-DD
 * @returns 净值行数组（升序，末尾最新），参数非法返回空数组
 */
export async function fetchFundNetValueRange(
  fundCode: string,
  sdate: string,
  edate: string,
): Promise<LsjzRow[]> {
  if (!isValidFundCode(fundCode)) return []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sdate) || !/^\d{4}-\d{2}-\d{2}$/.test(edate)) return []
  if (sdate > edate) return []

  const merged = new Map<string, LsjzRow>()
  let pageNum = 1
  const per = LSJZ_CONFIG.PER_PAGE

  while (true) {
    const url = `${API_URLS.F10_LSJZ}?type=lsjz&code=${fundCode}&page=${pageNum}&per=${per}&sdate=${sdate}&edate=${edate}`
    try {
      const apidata = await loadApidata(url, LSJZ_CONFIG.TIMEOUT)
      const content = apidata?.content || ''
      const batch = parseLsjzContent(content)
      if (!batch.length) break

      for (const row of batch) {
        merged.set(row.date, row)
      }
      // 不足一页 → 最后一页
      if (batch.length < per) break
      pageNum++
    } catch {
      break
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date))
}
