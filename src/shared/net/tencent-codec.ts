/**
 * 腾讯代码构造 - 归一化 code + market → 腾讯接口用的代码格式
 *
 * 腾讯两个接口的代码格式不同：
 *   - fqkline 日K：A股 sh/sz/bj 前缀 + 6位；港股 hk + 5位补零；美股 us + 大写 + .OQ 后缀
 *   - qt.gtimg 报价：A股/港股同日K；美股必须无后缀（usAAPL.OQ 报错 v_pv_none_match）
 */

import type { StockMarket } from '@/shared/types/common-types'

/**
 * 归一化 code + market → 腾讯日K代码（fqkline param 用）。
 * A股: 沪 6/68/9 开头 → sh；深 0/30/2 开头 → sz；北交所 8/4 → bj
 * 港股: hk + 5 位补零（00700 → hk00700）
 * 美股: us + 大写 + .OQ 后缀（纳斯达克）；后缀缺失时退无后缀重试（见 tencent-fetch）
 */
export function tencentKlineCode(code: string, market: StockMarket): string {
  if (market === 'A') {
    if (/^(6|68|9)/.test(code)) return `sh${code}`
    if (/^(0|30|2)/.test(code)) return `sz${code}`
    if (/^[84]/.test(code)) return `bj${code}`
    return `sh${code}` // 兜底
  }
  if (market === 'HK') return `hk${code.padStart(5, '0')}`
  if (market === 'US') return `us${code.toUpperCase()}.OQ`
  return code
}

/**
 * 归一化 code + market → 腾讯报价代码（qt.gtimg.cn q= 用）。
 * 与日K代码差异：美股报价必须无后缀（usAAPL.OQ 返回 v_pv_none_match）。
 * A/港 报价代码与日K一致。
 */
export function tencentQuoteCode(code: string, market: StockMarket): string {
  if (market === 'A') return tencentKlineCode(code, market)
  if (market === 'HK') return tencentKlineCode(code, market)
  if (market === 'US') return `us${code.toUpperCase()}`
  return code
}

/**
 * 归一化原始股票代码：去掉 .US/.HK/.SZ/.SH 后缀和市场前缀，转纯代码。
 * 腾讯/东财代码可能带各种前后缀，统一归一化后才能构造腾讯代码/secid。
 */
export function normalizeStockCodeTencent(raw: string): { code: string; market?: StockMarket } {
  const suffixes: Array<{ s: string; m: StockMarket }> = [
    { s: 'JP', m: 'JP' }, { s: 'KR', m: 'KR' }, { s: 'TW', m: 'TW' },
    { s: 'DE', m: 'DE' }, { s: 'FR', m: 'FR' }, { s: 'UK', m: 'UK' },
    { s: 'BR', m: 'BR' }, { s: 'IN', m: 'IN' }, { s: 'SG', m: 'SG' },
    { s: 'AU', m: 'AU' }, { s: 'US', m: 'US' },
    { s: 'HK', m: 'HK' }, { s: 'SZ', m: 'A' }, { s: 'SH', m: 'A' },
  ]
  let code = raw
  let market: StockMarket | undefined
  for (const { s, m } of suffixes) {
    const re = new RegExp(`[.]?${s}$`, 'i')
    if (re.test(code)) {
      code = code.replace(re, '')
      market = m
      break
    }
  }
  return { code, market }
}
