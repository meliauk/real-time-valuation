/**
 * 基金搜索
 *
 * 东方财富 FundSearchAPI（JSONP），按关键词模糊匹配基金代码和名称。
 * 用于添加基金时的搜索框。
 *
 * 响应 Datas 数组，每项 CODE/NAME/FUNDTYPE 字段。过滤无代码或无名称的结果。
 */

import type { SearchResult } from '@/modules/fund/fund-types'
import { API_URLS, FUND_CATALOG_CONFIG } from '@/config/constants'
import { jsonpRequest, genCallbackName } from '@/shared/net/jsonp-main'

/** 按关键词搜索基金。关键词过短（< SEARCH_MIN_KEYWORD）返回空。 */
export async function searchFunds(keyword: string): Promise<SearchResult[]> {
  if (!keyword || keyword.trim().length < FUND_CATALOG_CONFIG.SEARCH_MIN_KEYWORD) return []

  const callbackName = genCallbackName('fundSearch')
  const url = `${API_URLS.SEARCH}?m=1&key=${encodeURIComponent(keyword)}&pageSize=${FUND_CATALOG_CONFIG.SEARCH_PAGE_SIZE}&callback=${callbackName}`

  try {
    const response = await jsonpRequest<any>(url, callbackName, FUND_CATALOG_CONFIG.SEARCH_TIMEOUT)
    const datas = response?.Datas ?? []
    return datas
      .map((item: any) => ({
        fundCode: item.CODE ?? item.FundCode ?? '',
        fundName: item.NAME ?? item.FundName ?? '',
        fundType: item.FUNDTYPE ?? item.FundType ?? '',
      }))
      .filter((item: SearchResult) => item.fundCode && item.fundName)
  } catch {
    return []
  }
}
