/**
 * 基金最近净值取数
 *
 * ⚠️ 东方财富 F10 lsjz 接口（F10DataApi.aspx）已失效，改由 pingzhongdata
 * 的 Data_netWorthTrend 提供最近净值（见 pingzhongdata-fetch.ts）。
 *
 * 本文件保留 fetchLsjzRealData 导出名（fund-valuation-merge 等历史调用方零改动），
 * 实现委托给 fetchPingzhongNavData。LsjzRealData 类型也从 pingzhongdata-fetch re-export。
 */

import { fetchPingzhongNavData, type LsjzRealData } from './pingzhongdata-fetch'

// 类型从 pingzhongdata-fetch re-export，保持现有 import 路径 { type LsjzRealData } 不变
export type { LsjzRealData }

/**
 * 取基金最近净值数据（委托给 pingzhongdata，F10 lsjz 已失效）。
 * @param fundCode 基金代码
 * @returns 最近净值+涨跌，失败返回 null
 */
export async function fetchLsjzRealData(fundCode: string): Promise<LsjzRealData | null> {
  return fetchPingzhongNavData(fundCode)
}
