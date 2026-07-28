/**
 * 东方财富 secid 构造（A/HK/US 三档）
 *
 * secid = 市场前缀 + "." + 代码。仅 A/港/美三档能构造（东财/腾讯直接取数的市场）。
 * 海外市场 secid 返回 null，交 Yahoo。
 */

import { MARKET_SECID_PREFIX } from './em-market-map'

/**
 * emMarketCode + 代码 → 东财 secid（仅 A/港/美三档，海外返回 null）。
 * @param code         归一化纯代码
 * @param emMarketCode 东财市场代码
 */
export function secidFor(code: string, emMarketCode?: string): string | null {
  if (emMarketCode && MARKET_SECID_PREFIX[emMarketCode] != null) {
    const prefix = MARKET_SECID_PREFIX[emMarketCode]
    const c = emMarketCode === '116' ? code.padStart(5, '0')
      : emMarketCode === '105' || emMarketCode === '106' ? code.toUpperCase()
      : code
    return `${prefix}.${c}`
  }
  // emCode 缺失时按代码特征兜底（仅 A/港/美三档，海外返回 null）
  if (/^(60|30|68|8|4)\d{4,5}$/.test(code) || /^\d{6}$/.test(code)) {
    return parseInt(code) >= 600000 ? `1.${code}` : `0.${code}`
  }
  // 纯字母代码（1-6 位）→ 美股，统一用 105 前缀（纳斯达克/纽交所东财均认 105）。
  // 与旧项目 stockCodeToSecid 一致：emCode 缺失时纯字母按美股兜底，避免直接返回 null 取不到数据。
  if (/^[A-Za-z]{1,6}$/.test(code)) {
    return `105.${code.toUpperCase()}`
  }
  if (/^\d{4,5}$/.test(code)) {
    return `116.${code.padStart(5, '0')}`
  }
  return null
}
