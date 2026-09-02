/**
 * 云端数据加载询问标记 - 控制「是否加载 user_configs.data」每次登录会话只问一次
 *
 * 用 STORAGE_KEYS.SYNC_LOADED_MAP 存 { [userName]: true }。
 * ⚠️ 该标记是本地 UI 状态，不参与 collectFundData 同步，也不会进入 user_configs.data。
 *
 * 生命周期：登录后首次进入首页弹「是否加载云端数据」，选择后记标记；
 * 登出（authStore.logout）时清空整表 → 下次任何账号登录都会重新询问。
 */

import { STORAGE_KEYS } from '@/config/constants'
import { loadJSON, saveJSON, removeKey } from '@/shared/cache/local-storage-io'

/** 已询问标记映射：userName → 是否已弹过 */
type SyncLoadedMap = Record<string, boolean>

/** 该用户名是否已经询问过「是否加载云端数据」 */
export function hasSyncAsked(userName: string): boolean {
  const map = loadJSON<SyncLoadedMap>(STORAGE_KEYS.SYNC_LOADED_MAP, {})
  return !!map[userName]
}

/** 标记该用户名已询问过（本次登录会话内不再弹） */
export function markSyncAsked(userName: string): void {
  const map = loadJSON<SyncLoadedMap>(STORAGE_KEYS.SYNC_LOADED_MAP, {})
  map[userName] = true
  saveJSON(STORAGE_KEYS.SYNC_LOADED_MAP, map)
}

/** 清空全部已询问标记（登出时调用）——重新登录后再次询问是否加载云端数据 */
export function clearSyncAsked(): void {
  removeKey(STORAGE_KEYS.SYNC_LOADED_MAP)
}
