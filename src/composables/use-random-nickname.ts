/**
 * 随机用户称呼 - 基于机器特征派生的稳定昵称/头像
 *
 * 未来用户管理的预留入口：当前无账号体系，用本机特征 hash 出一个稳定称呼，
 * 同一机器每次打开一致、跨机器大概率不同。接入账号后可替换为真实用户信息。
 *
 * 不用 Math.random 挑词：保证即使 localStorage 被清，重新生成结果也一致；
 * 持久化只是兜底加速，避免每次进「我的」页都重算 hash。
 */

import { ref } from 'vue'
import { STORAGE_KEYS } from '@/config/constants'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'

export interface RandomUser {
  /** 完整昵称，如「破晓的墨龙」 */
  nickname: string
  /** 头像色块 hsl，如「hsl(210, 65%, 55%)」 */
  color: string
  /** 昵称首字，头像色块上展示 */
  initial: string
}

interface StoredUser extends RandomUser {
  /** 派生用 seed，留作调试/未来扩展 */
  seed: number
}

// 形容词 × 名词，约 20×20 = 400 种组合
const ADJECTIVES = [
  '疾风的', '静默的', '炽热的', '霜降的', '破晓的', '星陨的', '深海的', '晨曦的',
  '暮光的', '雷霆的', '幽兰的', '烈焰的', '寒霜的', '苍穹的', '流光的', '长夜的',
  '远山的', '清波的', '惊鸿的', '逐月的',
]
const NOUNS = [
  '赤狐', '青鸟', '玄鹤', '墨龙', '白虎', '朱雀', '玉兔', '金鲤', '银鹰', '苍狼',
  '碧蛇', '紫燕', '丹凤', '素麟', '翠羽', '墨鲤', '霜鹰', '云鹤', '雪豹', '星鹿',
]

/** djb2 字符串 hash → 32 位无符号整数 */
function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h
}

/** 采集机器特征：同一机器稳定、跨机器大概率不同 */
function collectFingerprint(): string {
  const parts: string[] = []
  try { parts.push(navigator.userAgent) } catch { /* ignore */ }
  try { parts.push(navigator.language) } catch { /* ignore */ }
  try {
    parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`)
  } catch { /* ignore */ }
  try {
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '')
  } catch { /* ignore */ }
  try { parts.push(String(navigator.hardwareConcurrency || '')) } catch { /* ignore */ }
  try { parts.push(navigator.platform || '') } catch { /* ignore */ }
  return parts.join('|')
}

function generate(): StoredUser {
  const seed = hashStr(collectFingerprint())
  const adj = ADJECTIVES[seed % ADJECTIVES.length]
  const noun = NOUNS[(seed >> 8) % NOUNS.length]
  const nickname = `${adj}${noun}`
  return {
    nickname,
    color: `hsl(${seed % 360}, 65%, 55%)`,
    initial: nickname.charAt(0),
    seed,
  }
}

let cached: RandomUser | null = null

/** 取当前用户称呼（首次调用即生成并持久化，后续命中内存/缓存） */
export function useRandomNickname() {
  if (cached) return { user: ref<RandomUser>(cached) }

  const stored = loadJSON<StoredUser | null>(STORAGE_KEYS.RANDOM_NICKNAME, null)
  if (stored && stored.nickname && stored.color) {
    cached = { nickname: stored.nickname, color: stored.color, initial: stored.initial || stored.nickname.charAt(0) }
  } else {
    const generated = generate()
    saveJSON(STORAGE_KEYS.RANDOM_NICKNAME, generated)
    cached = { nickname: generated.nickname, color: generated.color, initial: generated.initial }
  }

  return { user: ref<RandomUser>(cached) }
}
