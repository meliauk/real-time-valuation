/**
 * 基金名称 → 代码 匹配（前缀筛选 + 份额决胜）
 *
 * 视觉模型识别支付宝持仓截图时，截图本身不含 6 位基金代码（如 QDII 截图模型常把
 * fundCode 误填成 "QDII"）。本模块用模型返回的 fundName 在全量基金目录里匹配，补齐真实代码。
 *
 * 算法（用户方案，经真实数据验证 6/6 + 边界场景正确，准确率高）：
 *   1) 前缀筛选：用基金名前 n 个字（从 3 字开始，逐步加长 3→4→5→…）在目录里筛
 *      `fundName.includes(前缀)`。候选数不再减少时停——此时候选基本是「同一基金的
 *      不同份额/类型」（如 易方达XX A/C/D）。
 *   2) 份额决胜：候选里优先选份额后缀（A/C/D/E…）与模型基金名一致的；找不到一致的
 *      取候选里第一个。
 *
 * 相比「去后缀 + 相似度」方案：前缀筛选更直观、不依赖归一化正则、不会把名称相近的
 * 不同基金错配（前缀加到足够长就只剩同基金的不同份额）。
 *
 * 数据源：fetchFundCodeCatalog（全量基金目录 fundcode_search.js，含 code/pinyin/name/type）。
 */

import { fetchFundCodeCatalog } from './fund-code-catalog'
import type { FundCatalogItem } from '@/modules/fund/fund-types'

/** 提取基金名末尾的份额标识（A/C/D/E 等单字母，或"A类/C份额"），用于份额决胜 */
function extractShare(name: string): string {
  if (!name) return ''
  const s = String(name).replace(/\s+/g, '')
  let m = s.match(/([A-E])份额?$/); if (m) return m[1]
  m = s.match(/([A-Za-z])类$/); if (m) return m[1].toUpperCase()
  m = s.match(/([A-Z])$/); if (m) return m[1]
  return ''
}

export interface FundMatchResult {
  /** 匹配到的基金代码 */
  fundCode: string
  /** 匹配到的基金名称（目录里的标准名） */
  matchedName: string
  /** 相似度/置信度 0~1（前缀筛选收敛后份额一致=1，取第一个=0.9 兜底） */
  score: number
  /** 匹配方法：share（份额决胜）/ first（取第一个，无份额一致候选） */
  method: string
}

/** 前缀筛选起步长度（从 3 个字开始） */
const PREFIX_START = 3

/**
 * 用 fundName 在全量基金目录里补码（前缀筛选 + 份额决胜）。
 * @param fundName 模型返回的基金名称
 * @returns 匹配结果，或 null（目录为空 / 无候选）
 */
export async function matchFundByCatalogName(fundName: string): Promise<FundMatchResult | null> {
  if (!fundName) return null
  const catalog = await fetchFundCodeCatalog()
  if (!catalog || !catalog.length) return null

  const name = String(fundName).replace(/\s+/g, '')

  // 1) 前缀筛选：从 3 字开始逐步加长，候选数不再减少时停
  let chosen: FundCatalogItem[] = catalog.slice()
  let prevCount = chosen.length
  for (let n = PREFIX_START; n <= name.length; n++) {
    const prefix = name.slice(0, n)
    const filtered = catalog.filter(c => c.fundName.includes(prefix))
    if (filtered.length === 0) break          // 筛光了，用上一步的 chosen
    // 候选不再减少（或反而变多，理论不会）→ 停，用当前 chosen
    if (n > PREFIX_START && filtered.length >= prevCount) break
    chosen = filtered
    prevCount = filtered.length
    if (chosen.length <= 1) break              // 已锁定到 1 只
  }
  if (!chosen.length) return null

  // 2) 份额决胜：候选里优先选份额后缀与模型基金名一致的；无则取第一个
  const share = extractShare(name)
  let best: FundCatalogItem | null = null
  let method = 'first'
  let score = 0.9
  if (share) {
    const hit = chosen.find(c => extractShare(c.fundName) === share)
    if (hit) { best = hit; method = 'share'; score = 1 }
  }
  if (!best) best = chosen[0]

  return {
    fundCode: best.fundCode,
    matchedName: best.fundName,
    score: Math.round(score * 100) / 100,
    method,
  }
}
