/**
 * 基金名称 → 代码 匹配（走基金搜索接口）
 *
 * 视觉模型识别支付宝持仓截图时，截图本身不含 6 位基金代码（如 QDII 截图模型常把
 * fundCode 误填成 "QDII"）。本模块用模型返回的 fundName 调基金搜索接口拿候选，
 * 再用「份额 + 括号注记 + 重合度」决胜，补齐真实代码。
 *
 * 走搜索接口（而非全量目录文件 fundcode_search.js）的原因：
 *   - 搜索接口返回的每个结果 fundCode + fundName 天然配套，不会像目录匹配那样
 *     把名称和错误代码错位绑定。
 *   - 搜索接口对带括号注记的名称（如 "(QDII)A(人民币份额)A"）更鲁棒。
 *
 * 决胜规则（经真实数据验证）：
 *   1) 份额一致：候选份额后缀（A/C/D，先去括号再取）与模型基金名一致者优先
 *   2) 括号注记一致：模型名里的括号注记（如 "人民币份额"，排除 QDII/FOF 等类型）
 *      候选名也要含——用于区分 "110037(无人民币份额)" 与 "018229(有人民币份额)"
 *   3) 重合度：模型名与候选名的最长公共子串占比，越高越优先
 *   4) 无份额一致：直接按重合度取最高
 *
 * 数据源：searchFunds（东方财富 FundSearchAPI，JSONP）。
 */

import { searchFunds } from './fund-search'
import type { SearchResult } from '@/modules/fund/fund-types'

/** 提取份额后缀（A/C/D/E…）。先去括号注记再取末尾份额字母——
 *  避免 "(人民币份额)" 结尾的名称取不到份额（份额在括号前，如 "...(QDII)A(人民币份额)" 的 A）。 */
function extractShare(name: string): string {
  if (!name) return ''
  const s = String(name).replace(/\s+/g, '').replace(/[\(（][^)）]*[\)）]/g, '')
  let m = s.match(/([A-E])份额?$/); if (m) return m[1]
  m = s.match(/([A-Za-z])类$/); if (m) return m[1].toUpperCase()
  m = s.match(/([A-Z])$/); if (m) return m[1]
  return ''
}

/** 提取基金名里的括号注记（排除 QDII/FOF/LOF/ETF/联接 等类型标记，
 *  保留 "人民币份额" 这类区分不同份额的注记）。用于区分同份额、同主体但注记不同的基金。 */
function bracketTags(name: string): string[] {
  const tags: string[] = []
  const re = /[\(（]([^)）]+)[\)）]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(String(name)))) {
    if (!/^(QDII|FOF|LOF|ETF|联接)$/.test(m[1])) tags.push(m[1])
  }
  return tags
}

/** 模型名与候选名的重合度 0~1（最长公共子串 / 较长串长度；完全相同或互含给高分） */
function overlapScore(modelName: string, candName: string): number {
  const m = String(modelName).replace(/\s+/g, '')
  const c = String(candName).replace(/\s+/g, '')
  if (m === c) return 1
  if (c.includes(m) || m.includes(c)) return 0.95
  let best = 0
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < c.length; j++) {
      let k = 0
      while (i + k < m.length && j + k < c.length && m[i + k] === c[j + k]) k++
      if (k > best) best = k
    }
  }
  return best / Math.max(m.length, c.length)
}

export interface FundMatchResult {
  /** 匹配到的基金代码 */
  fundCode: string
  /** 匹配到的基金名称（搜索结果里的标准名，与代码配套） */
  matchedName: string
  /** 置信度 0~1（份额+注记都一致=1，份额一致=0.95，仅重合度兜底=实际重合度） */
  score: number
  /** 匹配方法：share-tag（份额+注记一致）/ share（份额一致）/ overlap（重合度兜底） */
  method: string
}

/**
 * 用 fundName 调基金搜索接口拿候选，再份额+注记+重合度决胜补码。
 * @param fundName 模型返回的基金名称
 * @returns 匹配结果，或 null（搜索无结果）
 */
export async function matchFundByCatalogName(fundName: string): Promise<FundMatchResult | null> {
  if (!fundName) return null
  const results = await searchFunds(fundName)
  if (!results.length) return null

  const share = extractShare(fundName)
  const modelTags = bracketTags(fundName)
  const hasAllTags = (name: string): boolean => modelTags.every(t => name.includes(t))

  // 打分排序：份额一致 > 注记一致 > 重合度
  const scored = results.map((r: SearchResult) => {
    const shareMatch = share !== '' && extractShare(r.fundName) === share
    const tagMatch = modelTags.length > 0 && hasAllTags(r.fundName)
    const ov = overlapScore(fundName, r.fundName)
    return { r, shareMatch, tagMatch, ov }
  })
  scored.sort((a, b) => {
    if (a.shareMatch !== b.shareMatch) return a.shareMatch ? -1 : 1
    if (a.tagMatch !== b.tagMatch) return a.tagMatch ? -1 : 1
    return b.ov - a.ov
  })

  const best = scored[0]
  let score: number
  let method: string
  if (best.shareMatch && best.tagMatch) { score = 1; method = 'share-tag' }
  else if (best.shareMatch) { score = 0.95; method = 'share' }
  else { score = best.ov; method = 'overlap' }

  return {
    fundCode: best.r.fundCode,
    matchedName: best.r.fundName,
    score: Math.round(score * 100) / 100,
    method,
  }
}
