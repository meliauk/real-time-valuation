/**
 * 云端数据加载询问标记 - 控制「是否加载 user_configs.data」每个用户名只弹一次
 *
 * 用 STORAGE_KEYS.SYNC_LOADED_MAP 存 { [userName]: true }，localStorage 永久有效（无过期）。
 * ⚠️ 该标记是本地 UI 状态，不参与 collectFundData 同步，也不会进入 user_configs.data。
 */

import { STORAGE_KEYS } from '@/config/constants'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'

/** 已询问标记映射：userName → 是否已弹过 */
type SyncLoadedMap = Record<string, boolean>

/** 该用户名是否已经询问过「是否加载云端数据」 */
export function hasSyncAsked(userName: string): boolean {
  const map = loadJSON<SyncLoadedMap>(STORAGE_KEYS.SYNC_LOADED_MAP, {})
  return !!map[userName]
}

/** 标记该用户名已询问过（永久，下次进入首页不再弹） */
export function markSyncAsked(userName: string): void {
  const map = loadJSON<SyncLoadedMap>(STORAGE_KEYS.SYNC_LOADED_MAP, {})
  map[userName] = true
  saveJSON(STORAGE_KEYS.SYNC_LOADED_MAP, map)
}
