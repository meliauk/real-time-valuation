/**
 * 基金名称 → 代码 相似度匹配
 *
 * 视觉模型识别支付宝持仓截图时，截图本身不含 6 位基金代码（如 QDII 截图模型常把
 * fundCode 误填成 "QDII"）。本模块用模型返回的 fundName 在全量基金目录里做相似度
 * 匹配，补齐真实基金代码。
 *
 * 替代原 `use-image-recognition.ts` 里 `searchFunds(fundName)` 模糊搜索取第一个结果
 * 替换 fundCode 的做法——那种方式 A/C 份额、名称相近的不同基金常被错配。
 *
 * 策略（经 test/2-基金代码补全.html 实测验证，6/6 正确）：
 *   1) 候选筛选：用基金名里最长的中文关键词命中目录名称，把全市场上万条缩到几十条候选
 *   2) 完整名精确匹配 → 命中即补（method=exact）
 *   3) 去后缀主体名精确匹配 → 同主体名下多个份额时按份额后缀(A/C/D)决胜
 *      （method=exact-stripped）—— 关键：避免 A 类被去后缀后错配成 C 类
 *   4) 去后缀包含匹配（method=contain-stripped）
 *   5) 相似度兜底：归一化 Levenshtein 编辑距离取最高，份额一致再决胜
 *      （method=similarity）
 *
 * 数据源：fetchFundCodeCatalog（全量基金目录 fundcode_search.js，含 code/pinyin/name/type）。
 */

import { fetchFundCodeCatalog } from './fund-code-catalog'
import type { FundCatalogItem } from '@/modules/fund/fund-types'

/** 份额后缀 / 币种 / 类型括注 —— 用于归一化（去后缀）匹配 */
const RE_TYPE_BRACKET = /[\(（](QDII|FOF|LOF|ETF|联接)[\)）]/g
const RE_CURRENCY = /(人民币|美元|港元|欧元|日元)/g
/** 末尾单字母份额（A/C/D/E/I/H/R 等） */
const RE_TAIL_LETTER = /[A-Z]$/

/** 归一化基金名：去空格、去类型括注、去币种、去份额后缀，得到「主体名」用于匹配 */
function normalizeName(name: string): string {
  if (!name) return ''
  let s = String(name).replace(/\s+/g, '')
  s = s.replace(RE_TYPE_BRACKET, '')      // (QDII) → ''
  s = s.replace(RE_CURRENCY, '')          // 人民币 → ''
  // 末尾份额：先剥 "A类/C类"、"A份额"，再剥末尾单字母
  s = s.replace(/[A-Za-z]类$/, '')
  s = s.replace(/[A-E]份额?$/, '')
  s = s.replace(RE_TAIL_LETTER, '')
  return s
}

/** 提取基金名末尾的份额标识（A/C/D/E 等单字母，或"A类/C份额"），用于 A/C/D 决胜 */
function extractShare(name: string): string {
  if (!name) return ''
  const s = String(name).replace(/\s+/g, '')
  let m = s.match(/([A-E])份额?$/); if (m) return m[1]
  m = s.match(/([A-Za-z])类$/); if (m) return m[1].toUpperCase()
  m = s.match(/([A-Z])$/); if (m) return m[1]
  return ''
}

/** 提取基金名中的中文关键词（用于候选筛选；取连续≥2个汉字的片段，按长度降序） */
function extractKeywords(name: string): string[] {
  const s = String(name || '').replace(RE_TYPE_BRACKET, ' ').replace(RE_CURRENCY, ' ')
  const matches = s.match(/[一-龥]{2,}/g) || []
  return matches.filter(w => w.length >= 2).sort((a, b) => b.length - a.length)
}

/** 编辑距离（Levenshtein） */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array(b.length + 1)
  let curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/** 归一化相似度 0~1（1=完全相同）。基于编辑距离按较长串长度归一 */
function similarity(a: string, b: string): number {
  if (!a && !b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

export interface FundMatchResult {
  /** 匹配到的基金代码 */
  fundCode: string
  /** 匹配到的基金名称（目录里的标准名） */
  matchedName: string
  /** 相似度 0~1 */
  score: number
  /** 匹配方法：exact / exact-stripped / contain-stripped / similarity */
  method: string
}

/** 匹配过程中的最优候选（含份额决胜用的中间量） */
interface BestCandidate {
  item: FundCatalogItem
  method: string
  score: number
  adjScore: number
  shareMatch: boolean
}

/**
 * 用 fundName 在全量基金目录里补码。
 * @param fundName 模型返回的基金名称
 * @returns 匹配结果，或 null（目录为空 / 无候选）
 */
export async function matchFundByCatalogName(fundName: string): Promise<FundMatchResult | null> {
  if (!fundName) return null
  const catalog = await fetchFundCodeCatalog()
  if (!catalog || !catalog.length) return null

  const name = String(fundName).replace(/\s+/g, '')
  const normName = normalizeName(name)   // 去后缀主体名
  const share = extractShare(name)      // 份额后缀 A/C/D...（决胜用）

  // 1) 候选筛选：用最长中文关键词命中目录名称，缩小到几十条
  const kws = extractKeywords(name)
  let candidates: FundCatalogItem[] = []
  if (kws.length) {
    const top = kws[0]
    candidates = catalog.filter(c => c.fundName.includes(top))
    if (candidates.length > 60 && kws[1]) {
      const second = kws[1]
      const finer = candidates.filter(c => c.fundName.includes(second))
      if (finer.length) candidates = finer
    }
  }
  // 关键词没筛到（罕见，如名称全是英文/数字）→ 退回拼音包含
  if (!candidates.length) {
    const py = name.toLowerCase()
    candidates = catalog.filter(c => c.pinyin && c.pinyin.toLowerCase().includes(py))
  }
  if (!candidates.length) return null

  // 份额一致优先级最高——避免 A 类被去后缀后错配成 C 类
  let best: BestCandidate | null = null
  const consider = (item: FundCatalogItem, method: string, score: number): void => {
    const cShare = extractShare(item.fundName)
    const shareMatch = !!share && share === cShare
    // 份额一致给 +0.001 的微弱加分（仅用于同等分数下决胜）
    const adjScore = score + (shareMatch ? 0.001 : 0)
    if (!best || adjScore > best.adjScore || (adjScore === best.adjScore && shareMatch && !best.shareMatch)) {
      best = { item, method, score: Math.min(1, adjScore), adjScore, shareMatch }
    }
  }

  // 2) 完整名精确匹配（含份额后缀）
  for (const c of candidates) {
    if (c.fundName.replace(/\s+/g, '') === name) { consider(c, 'exact', 1); break }
  }
  // 3) 去后缀主体名相等 —— 同主体名下多个份额时，份额决胜选出正确的那只
  if (!best) {
    const sameBody = candidates.filter(c => normalizeName(c.fundName) === normName)
    if (sameBody.length) {
      if (share) {
        const hit = sameBody.find(c => extractShare(c.fundName) === share) || sameBody[0]
        consider(hit, 'exact-stripped', 0.99)
      } else {
        consider(sameBody[0], 'exact-stripped', 0.99)
      }
    }
  }
  // 4) 去后缀后包含匹配（一方主体名包含另一方）
  if (!best && normName.length >= 4) {
    for (const c of candidates) {
      const cn = normalizeName(c.fundName)
      if (cn.length >= 4 && (cn.includes(normName) || normName.includes(cn))) {
        const sc = Math.min(cn.length, normName.length) / Math.max(cn.length, normName.length)
        consider(c, 'contain-stripped', Math.max(0.85, sc))
      }
    }
  }
  // 5) 相似度兜底：对所有候选算归一化编辑距离（用主体名比），取最高；份额一致再决胜
  if (!best) {
    for (const c of candidates) {
      const sc = similarity(normName, normalizeName(c.fundName))
      consider(c, 'similarity', sc)
    }
  }
  if (!best) return null
  // best 在 consider 闭包内赋值，TS 控制流不跟踪闭包赋值，故此处用非空断言
  const b = best!
  return {
    fundCode: b.item.fundCode,
    matchedName: b.item.fundName,
    score: Math.round(b.score * 100) / 100,
    method: b.method,
  }
}
