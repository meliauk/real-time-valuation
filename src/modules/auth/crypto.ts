/**
 * 密码哈希工具 - Web Crypto API 零依赖实现
 *
 * 用 crypto.subtle 做 SHA-256 + 随机盐哈希：不存明文密码。
 * ⚠️ 前端哈希的安全上限：无后端时无法做服务端 bcrypt/PBKDF2 等慢哈希，纯前端哈希可被
 *    改客户端代码绕过校验。本次按要求实现"不存明文"，UI 不夸大安全性。
 */

import { AUTH_CONFIG } from '@/config/constants'

/** 字符串 → UTF-8 字节（显式 ArrayBuffer，规避 TS lib BufferSource/SharedArrayBuffer 重叠） */
function strToBytes(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s)
  // 拷到确定的 ArrayBuffer，避免 Uint8Array<ArrayBufferLike> 不被 BufferSource 接受的 lib 类型问题
  const buf = new ArrayBuffer(enc.byteLength)
  new Uint8Array(buf).set(enc)
  return new Uint8Array(buf)
}

/** 字节 → hex 字符串 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** 字节 → base64 字符串（用于盐的存储） */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** 生成随机盐（base64，AUTH_CONFIG.SALT_BYTES 字节）。用 crypto.getRandomValues 而非 Math.random。 */
export function randomSalt(): string {
  const bytes = new Uint8Array(AUTH_CONFIG.SALT_BYTES)
  crypto.getRandomValues(bytes)
  return bytesToBase64(bytes)
}

/** SHA-256(data) → hex */
async function sha256Hex(data: string): Promise<string> {
  // as BufferSource：规避 TS lib 中 Uint8Array<ArrayBufferLike> 与 BufferSource 的 SharedArrayBuffer 重叠类型问题
  const digest = await crypto.subtle.digest('SHA-256', strToBytes(data) as BufferSource)
  return bytesToHex(new Uint8Array(digest))
}

/**
 * 哈希密码：`${salt}:${sha256(salt + password)}`。
 * 校验时拆出 salt 重新哈希比对（见 verifyPassword）。
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  return `${salt}:${await sha256Hex(salt + password)}`
}

/** 校验密码是否匹配已存哈希（恒定时间比较，防时序侧信道） */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const colonIdx = storedHash.indexOf(':')
  if (colonIdx < 0) return false
  const salt = storedHash.substring(0, colonIdx)
  const expected = storedHash.substring(colonIdx + 1)
  const actual = await sha256Hex(salt + password)
  // 恒定时间比较：长度不同也走完全比较再判，避免因长度差提前 return 泄漏信息
  if (actual.length !== expected.length) {
    // 长度不等必不匹配，但仍消耗一次比较时间，避免长度侧信道
    let diff = 1
    for (let i = 0; i < actual.length && i < expected.length; i++) {
      diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
    }
    return false && diff === 0
  }
  let diff = 0
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}
