/**
 * Supabase PostgREST 客户端 - 基金数据云端同步
 *
 * 用原生 fetch 直调 PostgREST REST API，避免引入 @supabase/supabase-js 依赖。
 * 职责：
 *   - 登录时校验 user_name 是否存在于 user_configs（checkUserName）
 *   - 一键同步时按 user_name 写入/更新 data 字段（syncUserConfig）
 *
 * 鉴权：apikey + Authorization: Bearer 双写，二者同用 SUPABASE_CONFIG.ANON_KEY。
 */

import { SUPABASE_CONFIG } from '@/config/constants'

/** PostgREST 请求头（apikey + Bearer 双写，二者同为 key） */
function postgrestHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_CONFIG.ANON_KEY,
    Authorization: `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
    'Content-Type': 'application/json',
  }
}

/** user_configs 行（仅取同步需要的字段） */
interface UserConfigRow {
  /** 主键 */
  id: number
  /** 用户 ID（uuid，本项目不校验其值，随机生成即可） */
  user_id: string
  /** 用户名（登录校验唯一标识） */
  user_name: string | null
}

/** 生成 UUID v4（crypto.randomUUID 不可用时回退手工拼装） */
function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 按 user_name 查询 user_configs 行（不存在返回 null，异常抛出） */
async function findConfigByName(userName: string): Promise<UserConfigRow | null> {
  const url = `${SUPABASE_CONFIG.REST_URL}/user_configs?user_name=eq.${encodeURIComponent(userName)}&select=id,user_id,user_name&limit=1`
  const res = await fetch(url, { headers: postgrestHeaders() })
  if (!res.ok) throw new Error(`查询用户配置失败(${res.status})`)
  const arr = (await res.json()) as UserConfigRow[]
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null
}

/**
 * 校验 user_name 是否存在于 user_configs（登录用）。
 * @param userName 用户输入的用户名
 * @returns true=表中存在（可登录），false=不存在
 * @throws 网络/接口异常时抛出
 */
export async function checkUserName(userName: string): Promise<boolean> {
  const row = await findConfigByName(userName)
  return row != null
}

/** 同步结果 */
export interface SyncResult {
  /** 是否成功 */
  ok: boolean
  /** 失败原因 */
  error?: string
  /** true=新建用户行，false=更新已有行 */
  created?: boolean
}

/**
 * 一键同步：把基金缓存大 JSON 写入 user_configs.data（覆盖）。
 * 已存在该 user_name 的行则 PATCH data；不存在则 POST 新建（user_id 随机 uuid）。
 * @param userName 当前登录用户名
 * @param data 待保存的大 JSON（由 collectFundData 收集）
 * @returns 同步结果，失败时带 error 文案
 */
export async function syncUserConfig(userName: string, data: unknown): Promise<SyncResult> {
  try {
    const existing = await findConfigByName(userName)
    const url = `${SUPABASE_CONFIG.REST_URL}/user_configs`
    if (existing) {
      const res = await fetch(`${url}?id=eq.${existing.id}`, {
        method: 'PATCH',
        headers: postgrestHeaders(),
        body: JSON.stringify({ data }),
      })
      if (!res.ok) throw new Error(`更新失败(${res.status})`)
      return { ok: true, created: false }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: postgrestHeaders(),
      body: JSON.stringify({ user_id: randomUuid(), user_name: userName, data }),
    })
    if (!res.ok) throw new Error(`新建失败(${res.status})`)
    return { ok: true, created: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '同步失败' }
  }
}

/** 云端数据加载结果 */
export interface LoadResult {
  /** 是否成功 */
  ok: boolean
  /** 云端 data 字段（可能为 null，表示该用户尚未同步过数据） */
  data?: Record<string, unknown> | null
  /** 失败原因 */
  error?: string
}

/**
 * 按 user_name 读取 user_configs.data（一键加载/恢复用）。
 * @param userName 当前登录用户名
 * @returns 加载结果，ok=true 时 data 为云端 JSON（无数据为 null）
 */
export async function loadUserConfig(userName: string): Promise<LoadResult> {
  try {
    const url = `${SUPABASE_CONFIG.REST_URL}/user_configs?user_name=eq.${encodeURIComponent(userName)}&select=data&limit=1`
    const res = await fetch(url, { headers: postgrestHeaders() })
    if (!res.ok) throw new Error(`查询云端数据失败(${res.status})`)
    const arr = (await res.json()) as { data: unknown }[]
    const data = (Array.isArray(arr) && arr.length > 0 ? arr[0].data : null) as Record<string, unknown> | null
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '加载失败' }
  }
}
