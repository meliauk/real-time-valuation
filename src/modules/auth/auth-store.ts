/**
 * 账号 Store - 邮箱注册/登录态管理（Pinia setup 风格）
 *
 * 镜像 settings-store.ts：loadJSON 恢复 + watch 自动持久化。
 * 账号数据独立键 STORAGE_KEYS.AUTH，与基金自选/持仓/设置完全隔离，不影响现有功能。
 *
 * 密码用 crypto.ts 的 SHA-256+盐哈希存储，不存明文。
 * 登录态仅本机有效（localStorage），清浏览器即"登出"。
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { STORAGE_KEYS, AUTH_CONFIG } from '@/config/constants'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'
import { randomSalt, hashPassword, verifyPassword } from './crypto'
import type { AuthUser, AuthSession, StoredAuth } from './auth-types'

/** 邮箱格式校验（宽松：有 @ 与域名段即可） */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

export const useAuthStore = defineStore('auth', () => {
  // 恢复持久化数据
  const stored = loadJSON<StoredAuth>(STORAGE_KEYS.AUTH, { users: [], session: null })
  const users = ref<AuthUser[]>(Array.isArray(stored.users) ? stored.users : [])
  const session = ref<AuthSession | null>(stored.session ?? null)

  /** 当前登录用户 */
  const currentUser = computed<AuthUser | null>(() => {
    if (!session.value) return null
    return users.value.find(u => u.email === session.value!.email) ?? null
  })

  /** 是否已登录 */
  const isLoggedIn = computed<boolean>(() => currentUser.value != null)

  /** 持久化到 localStorage */
  function persist(): void {
    saveJSON(STORAGE_KEYS.AUTH, { users: users.value, session: session.value })
  }

  // session / users 变化自动持久化（与 settings-store watch 持久化一致）
  watch([users, session], () => persist(), { deep: true })

  /**
   * 注册：邮箱查重 + 盐哈希 + 入库 + 自动登录。
   * @returns { ok } 或 { ok:false, error } 友好错误文案
   */
  async function register(email: string, password: string, nickname: string): Promise<{ ok: boolean; error?: string }> {
    const e = email.trim().toLowerCase()
    if (!isValidEmail(e)) return { ok: false, error: '邮箱格式不正确' }
    if (password.length < AUTH_CONFIG.PASSWORD_MIN_LEN) {
      return { ok: false, error: `密码至少 ${AUTH_CONFIG.PASSWORD_MIN_LEN} 位` }
    }
    if (users.value.some(u => u.email === e)) {
      return { ok: false, error: '该邮箱已注册，请直接登录' }
    }
    const salt = randomSalt()
    const passwordHash = await hashPassword(password, salt)
    const nick = nickname.trim() || e.split('@')[0]
    const user: AuthUser = {
      email: e,
      nickname: nick,
      passwordHash,
      salt,
      createdAt: Date.now(),
    }
    users.value = [...users.value, user]
    // 自动登录
    session.value = { email: e, loginAt: Date.now() }
    return { ok: true }
  }

  /**
   * 登录：查用户 + 校验密码 + 写 session。
   * @returns { ok } 或 { ok:false, error } 友好错误文案
   */
  async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const e = email.trim().toLowerCase()
    if (!isValidEmail(e)) return { ok: false, error: '邮箱格式不正确' }
    const user = users.value.find(u => u.email === e)
    if (!user) return { ok: false, error: '该邮箱未注册' }
    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) return { ok: false, error: '密码错误' }
    session.value = { email: e, loginAt: Date.now() }
    return { ok: true }
  }

  /** 退出登录（清 session，保留账号记录） */
  function logout(): void {
    session.value = null
  }

  return {
    users,
    session,
    currentUser,
    isLoggedIn,
    register,
    login,
    logout,
  }
})
