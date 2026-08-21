/**
 * 历史净值区间取数
 *
 * 按日期区间（sdate~edate）从 pingzhongdata 完整净值序列（Data_netWorthTrend）过滤。
 * pingzhongdata 为天天基金基金详情 js，含全历史单位净值（升序）。
 *
 * ⚠️ 迁移说明：东方财富 F10 lsjz 接口（F10DataApi.aspx）已失效（见 lsjz-fetch.ts 迁移说明），
 * 估值合并已改用 pingzhongdata；本文件同步迁移（原 F10DataApi.aspx 分页实现已删除）。
 * 依赖 fetchPingzhongTrend 的 60s 内存缓存，同一刷新周期内与估值合并共用一次下载。
 *
 * 用于待确认计划结算、漏日回放、详情页历史净值回退等需要区间净值的场景。
 */

import { fetchPingzhongTrend } from './pingzhongdata-fetch'
import type { LsjzRow } from './lsjz-parser'
import { isValidFundCode } from '@/shared/utils/validation'

/**
 * 按日期区间获取历史净值。
 * @param fundCode 基金代码
 * @param sdate    起始日期 YYYY-MM-DD
 * @param edate    结束日期 YYYY-MM-DD
 * @returns 净值行数组（升序，末尾最新），参数非法/取数失败返回空数组
 */
export async function fetchFundNetValueRange(
  fundCode: string,
  sdate: string,
  edate: string,
): Promise<LsjzRow[]> {
  if (!isValidFundCode(fundCode)) return []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sdate) || !/^\d{4}-\d{2}-\d{2}$/.test(edate)) return []
  if (sdate > edate) return []

  const rows = await fetchPingzhongTrend(fundCode)
  if (!rows || rows.length === 0) return []
  return rows.filter((r) => r.date >= sdate && r.date <= edate)
}
