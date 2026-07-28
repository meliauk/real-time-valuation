/**
 * 东方财富 emMarketCode 映射表
 *
 * 东财 F10 持仓解析得到的 emMarketCode（如 1/0/116/105/106/124/130/118...）是权威市场标识。
 * 本文件集中维护 emMarketCode → 各用途的映射，避免散落。
 *
 * 注意：仅 A/港/美三档是"精确映射"——这三档东财能直接取数。
 * 海外市场（日韩台欧等）emCode 仅用于 UI 标签，涨跌取数一律交 Yahoo（不依赖 emCode 精确值）。
 */

import type { StockMarket } from '@/shared/types/common-types'

/** 东财 emMarketCode → StockMarket（仅 A/港/美三档精确，海外一律 unknown 交 Yahoo） */
export const EM_MARKET_MAP: Record<string, StockMarket> = {
  '1': 'A', '0': 'A',        // 沪/深
  '116': 'HK',               // 港股
  '105': 'US', '106': 'US',  // 美股（纳斯达克/纽交所）
}

/** emMarketCode → 东财 secid 前缀（仅 A/港/美三档） */
export const MARKET_SECID_PREFIX: Record<string, string> = {
  '1': '1', '0': '0',
  '116': '116',
  '105': '105', '106': '106',
}

/** emMarketCode → Yahoo 后缀（精确映射，能映射的不必走 Yahoo Search，减轻网络压力）。
 *  仅放后缀确定的；韩股(130)有 .KS/.KQ 主板创业板之分无法靠 emCode 区分，巴印新澳后缀歧义，均不加留 Search。 */
export const EM_TO_YAHOO_SUFFIX: Record<string, string> = {
  '1': '.SS',   // 上交所
  '0': '.SZ',   // 深交所
  '116': '.HK', // 港股
  '105': '', '106': '', // 美股无后缀
  '124': '.T',  // 日本东证
  '118': '.TW', // 台湾证交所
  '155': '.DE', // 德国Xetra
  '156': '.PA', // 法国巴黎
  '157': '.L',  // 英国伦敦
}

/** 东财市场代码 → 中文标签（搜索结果/详情页市场标识用） */
export const EM_MARKET_LABEL: Record<string, string> = {
  '1': '沪', '0': '深', '116': '港', '105': '美', '106': '美',
  '124': '日', '130': '韩', '118': '台',
  '155': '德', '156': '法', '157': '英',
  '173': '巴', '174': '印', '175': '新', '177': '澳',
}
