/**
 * 验证码模块 - 生成 / 校验 / 防刷
 *
 * 6 位数字验证码，5 分钟有效，同邮箱 60 秒内不可重发。
 * 用内存 Map 存储（验证码短生命周期，无需持久化；刷新页面即失效，需重新发送）。
 * crypto.getRandomValues 生成，避免 Math.random。
 */

import { AUTH_CONFIG, EMAILJS_CONFIG } from '@/config/constants'

/** 单邮箱验证码记录 */
interface CodeRecord {
  /** 6 位数字码 */
  code: string
  /** 过期时间戳（毫秒） */
  expireAt: number
  /** 上次发送时间戳（毫秒），用于 60 秒重发限制 */
  sentAt: number
}

/** email 小写归一 → 验证码记录（内存） */
const codeMap = new Map<string, CodeRecord>()

/** 生成 6 位数字验证码（首位可为 0，crypto.getRandomValues 避免 Math.random） */
export function generateCode(): string {
  const len = AUTH_CONFIG.CODE_LENGTH
  const digits = new Uint32Array(len)
  crypto.getRandomValues(digits)
  let code = ''
  for (let i = 0; i < len; i++) {
    code += (digits[i] % 10).toString()
  }
  return code
}

/** 归一化邮箱为小写键 */
function normalize(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * 检查能否重发：距上次发送不足 RESEND_LIMIT_SEC 秒则不可。
 * @returns ok=true 可发；ok=false 时 waitSec 为还需等待秒数
 */
export function canResend(email: string): { ok: boolean; waitSec: number } {
  const rec = codeMap.get(normalize(email))
  if (!rec) return { ok: true, waitSec: 0 }
  const elapsedSec = Math.floor((Date.now() - rec.sentAt) / 1000)
  const limit = EMAILJS_CONFIG.RESEND_LIMIT_SEC
  if (elapsedSec < limit) {
    return { ok: false, waitSec: limit - elapsedSec }
  }
  return { ok: true, waitSec: 0 }
}

export type IssueResult =
  | { ok: true; code: string; expireAt: number }
  | { ok: false; error: 'RATE_LIMITED'; waitSec: number }

/**
 * 签发验证码：检查重发限制 → 生成 → 记录 sentAt/expireAt。
 * 成功返回码与过期时间；重发过快返回 RATE_LIMITED + 剩余等待秒。
 */
export function issueCode(email: string): IssueResult {
  const key = normalize(email)
  const check = canResend(key)
  if (!check.ok) {
    return { ok: false, error: 'RATE_LIMITED', waitSec: check.waitSec }
  }
  const now = Date.now()
  const code = generateCode()
  const expireAt = now + EMAILJS_CONFIG.CODE_EXPIRE_MIN * 60 * 1000
  codeMap.set(key, { code, expireAt, sentAt: now })
  return { ok: true, code, expireAt }
}

export type ConsumeResult = 'OK' | 'INVALID' | 'EXPIRED' | 'NOT_FOUND'

/**
 * 校验并消费验证码（一次性：成功/失败均从内存移除，防爆破重试）。
 * - NOT_FOUND：未发送过（页面刷新/从未发）
 * - EXPIRED：已超 5 分钟
 * - INVALID：码不匹配
 * - OK：匹配
 */
export function consumeCode(email: string, input: string): ConsumeResult {
  const key = normalize(email)
  const rec = codeMap.get(key)
  if (!rec) return 'NOT_FOUND'
  // 先移除（一次性，无论对错）
  codeMap.delete(key)
  if (Date.now() > rec.expireAt) return 'EXPIRED'
  if (input.trim() !== rec.code) return 'INVALID'
  return 'OK'
}
