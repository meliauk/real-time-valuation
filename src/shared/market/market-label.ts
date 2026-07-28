/**
 * 市场标签（纯展示，直接显示 pingzhong stockCodesNew 第一步解析的 rawEntry 原文）
 *
 * 用户要求：只展示 pingzhong 接口第一步返回的原始内容，不做任何映射或拆分。
 * rawEntry 是 stockCodesNew 条目原文（如 '105.ASML'/'116.00700'/'285A JP'/'000660'），
 * 原样整串返回，让用户看到接口到底给了什么。
 *
 * 不依赖估值流：classifyShare/emMarketCode 是行情分流的权威键，本函数只读取展示。
 */

import type { HoldingDetailItem } from '@/modules/fund/fund-types'

/**
 * 计算持仓项的市场标签：直接返回 pingzhong stockCodesNew 条目原文（rawEntry）。
 * @param h 持仓项（仅需 rawEntry；缺失回退 emMarketCode，再缺失返回 '--'）
 * @returns rawEntry 原文整串（如 '105.ASML'/'285A JP'/'000660'）；无 rawEntry 时回退 emMarketCode
 */
export function computeMarketLabel(
  h: Pick<HoldingDetailItem, 'emMarketCode' | 'rawEntry'>,
): string {
  if (h.rawEntry && h.rawEntry.trim() !== '') return h.rawEntry
  if (h.emMarketCode && h.emMarketCode.trim() !== '') return h.emMarketCode.trim()
  return '--'
}
