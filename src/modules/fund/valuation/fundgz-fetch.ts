/**
 * 盘中估值取数
 *
 * ⚠️ 天天基金 fundgz 接口（fundgz.1234567.com.cn）已失效（多基金返回 failed），
 * 改用新浪盘中估值接口 getEstimateNetworthPic 取当日盘中估值净值和涨跌幅。
 *
 * 新浪返回 result.data.networth 序列，末项含：
 *   - pre_nav：估值净值 → gz
 *   - growthrate：涨跌幅（小数，如 0.025 → 2.5%）→ gszzl（×100）
 *   - pre_date + min_time：估值日期与时分 → gztime
 *
 * 新浪仅 A 股 T+1 基金有盘中估值；QDII 等 T+2 基金 networth=null → 返回 null，
 * 由 fund-valuation-merge 用 lsjz/pingzhongdata 确认值兜底。
 *
 * 失败重试：网络偶发失败，重试最多 FUNDGZ_RETRIES 次，退避递增。
 * 保留导出名 fetchFundgz（fund-valuation-merge 调用不变）。
 */

import type { FundValuation } from '@/modules/fund/fund-types'
import { API_URLS, FUND_VALUATION_CONFIG } from '@/config/constants'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'
import { safeParseFloat } from '@/shared/utils/safe-math'
import { isValidFundCode } from '@/shared/utils/validation'

/** 取基金盘中估值（新浪，带重试）。失败返回 null。 */
export async function fetchFundgz(fundCode: string): Promise<FundValuation | null> {
  if (!isValidFundCode(fundCode)) return null

  for (let attempt = 1; attempt <= FUND_VALUATION_CONFIG.FUNDGZ_RETRIES; attempt++) {
    try {
      const result = await fetchSinaEstimate(fundCode)
      if (result) return result
    } catch {
      // 本轮失败，继续重试
    }
    if (attempt < FUND_VALUATION_CONFIG.FUNDGZ_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, attempt * FUND_VALUATION_CONFIG.FUNDGZ_RETRY_BACKOFF))
    }
  }
  return null
}

/** 新浪盘中估值原始项 */
interface SinaNetworthPoint {
  min_time?: string
  pre_nav?: number | string
  growthrate?: number | string
  pre_date?: string
}

/**
 * 调新浪盘中估值接口，取末项构建 FundValuation。
 * networth 为空（QDII 无盘中估值）或解析失败 → 抛错让上层重试/兜底。
 */
async function fetchSinaEstimate(fundCode: string): Promise<FundValuation | null> {
  const callbackName = genCallbackName('jsonp_sina_gz')
  const url = `${API_URLS.INTRADAY_ESTIMATE}?symbol=${fundCode}&callback=${callbackName}`

  const response: any = await jsonpRequest<any>(url, callbackName, FUND_VALUATION_CONFIG.FUNDGZ_TIMEOUT)

  const networth: SinaNetworthPoint[] | undefined = response?.result?.data?.networth
  if (!Array.isArray(networth) || networth.length === 0) return null

  // 末条为最新盘中点
  const last = networth[networth.length - 1]
  const gz = safeParseFloat(last.pre_nav)
  if (!Number.isFinite(gz) || gz <= 0) return null

  // growthrate 是小数（0.025），转百分比（2.5）
  const gszzl = Math.round(safeParseFloat(last.growthrate) * 100 * 100) / 100

  // gztime：pre_date + min_time（如 "2026-07-21 11:31"，去掉秒）
  let gztime = ''
  if (last.pre_date && last.min_time) {
    gztime = `${last.pre_date} ${last.min_time}`.replace(/:(\d{2}):\d{2}$/, ':$1')
  } else if (last.pre_date) {
    gztime = last.pre_date
  }

  return {
    fundcode: fundCode,
    name: response?.result?.data?.name || response?.result?.data?.fund_name || '',
    gztime,
    gz,
    dwjz: gz, // 新浪无独立确认净值，merge 层会用 pingzhongdata 覆盖
    gszzl,
    jzrq: last.pre_date || '',
    isEstimated: true,
  }
}
