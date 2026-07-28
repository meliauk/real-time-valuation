/**
 * 账号体系类型定义 - 邮箱注册/登录
 *
 * 纯前端 localStorage 存储（无后端）：用户列表 + 当前登录态共一个键（STORAGE_KEYS.AUTH）。
 * 密码以 SHA-256 + 随机盐哈希存储，不存明文（见 crypto.ts）。
 */

/** 注册用户记录 */
export interface AuthUser {
  /** 邮箱（小写归一，登录唯一键） */
  email: string
  /** 昵称（注册时填，空则用邮箱前缀） */
  nickname: string
  /** 密码哈希（salt + sha256(salt + password)，见 crypto.hashPassword） */
  passwordHash: string
  /** 盐（base64，与 passwordHash 配对校验） */
  salt: string
  /** 注册时间戳（毫秒） */
  createdAt: number
}

/** 当前登录态 */
export interface AuthSession {
  /** 已登录用户邮箱 */
  email: string
  /** 登录时间戳（毫秒） */
  loginAt: number
}

/** localStorage 持久化结构：全部账号 + 当前 session */
export interface StoredAuth {
  users: AuthUser[]
  session: AuthSession | null
}
