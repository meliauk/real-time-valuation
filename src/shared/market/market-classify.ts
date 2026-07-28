/**
 * 市场三档分流判定
 *
 * 只认 emMarketCode（东财 F10 持仓提供的权威市场代码），不做代码位数/后缀破解。
 * 仅精确识别 A/HK/US 三档（emCode 1/0/116/105/106，东财/腾讯能直接取数），
 * 其余（日韩台欧 / emCode 缺失或不在映射表）一律返回 'unknown'，交 Yahoo Search 匹配。
 */

import type { StockMarket, MarketTz } from '@/shared/types/common-types'
import { EM_MARKET_MAP } from './em-market-map'

/** A股：emCode=1(沪)/0(深) */
export function isAShare(emMarketCode?: string): boolean {
  return emMarketCode === '1' || emMarketCode === '0'
}

/** 港股：仅 emCode=116（东财明确归属）。无 emCode 不按代码位数猜——交 Yahoo Search。 */
export function isHKShare(emMarketCode?: string): boolean {
  return emMarketCode === '116'
}

/** 美股：仅 emCode=105/106（东财明确归属）。无 emCode 不按字母位数猜——交 Yahoo Search。 */
export function isUSShare(emMarketCode?: string): boolean {
  return emMarketCode === '105' || emMarketCode === '106'
}

/**
 * 判三档市场：A/HK/US，其余返回 'unknown'（交 Yahoo）。
 * 只认 emMarketCode（东财明确归属），无 emCode 不按代码位数猜——一律 unknown 走 Yahoo Search。
 * @param emMarketCode 东财市场代码（F10 持仓提供，权威）
 * @param code         归一化纯代码（保留兼容外部调用，判定不再依赖）
 */
export function classifyShare(emMarketCode?: string, _code?: string): StockMarket {
  if (isAShare(emMarketCode)) return 'A'
  if (isHKShare(emMarketCode)) return 'HK'
  if (isUSShare(emMarketCode)) return 'US'
  return 'unknown'
}

/** emMarketCode → StockMarket（仅 A/港/美三档精确，海外返回 unknown） */
export function detectMarketByEmCode(emMarketCode: string): StockMarket {
  return EM_MARKET_MAP[emMarketCode] ?? 'unknown'
}

/**
 * StockMarket → MarketTz（交易日判定用）。
 * 只有 A/HK/US/JP/KR/TW/DE/FR/UK 八个市场有交易日判定逻辑，
 * 其余（BR/IN/SG/AU/unknown）→ 'unknown'，交易日判定退化为最近交易日。
 */
export function stockMarketToTz(m: StockMarket): MarketTz {
  if (m === 'A' || m === 'HK' || m === 'US' || m === 'JP' || m === 'KR' || m === 'TW' || m === 'DE' || m === 'FR' || m === 'UK') {
    return m as MarketTz
  }
  return 'unknown'
}
