/**
 * 盘中估值走势取数
 *
 * 新浪盘中估值接口，返回当日开盘到当前时刻的完整估值时间序列（JSONP）。
 * 用于卡片视图当日走势缩略图。
 *
 * 响应结构：result.data.networth = [{ min_time: "HH:mm", pre_nav: 估值 }, ...]
 * 过滤无时间或估值为空/非正的点。
 */

import type { IntradayPoint } from '@/modules/fund/fund-types'
import { API_URLS, INTRADAY_CONFIG } from '@/config/constants'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'
import { safeParseFloat } from '@/shared/utils/safe-math'
import { isValidFundCode } from '@/shared/utils/validation'

/** 取基金当日盘中估值走势序列。失败返回空数组。 */
export async function fetchIntradayEstimate(fundCode: string): Promise<IntradayPoint[]> {
  if (!isValidFundCode(fundCode)) return []

  const callbackName = genCallbackName('jsonp_sina')
  const url = `${API_URLS.INTRADAY_ESTIMATE}?symbol=${fundCode}&callback=${callbackName}`

  try {
    const response = await jsonpRequest<any>(url, callbackName, INTRADAY_CONFIG.FETCH_TIMEOUT)
    const networth = response?.result?.data?.networth
    if (!Array.isArray(networth) || networth.length === 0) return []

    return networth
      .filter((p: any) => p.min_time && p.pre_nav != null)
      .map((p: any) => ({ time: p.min_time, value: safeParseFloat(p.pre_nav) }))
      .filter((p: IntradayPoint) => p.value > 0)
  } catch {
    return []
  }
}
