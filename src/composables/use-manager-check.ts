/**
 * 基金经理变更检测 Composable
 *
 * 薄包装：从 fund-store 取关注基金代码，调 manager-check 模块的 checkManagerChanges
 * 检测变更并返回变更列表（ManagerChange[]）。不耦合 UI 通知层——通知由调用方处理。
 *
 * 注意：旧版含 ElNotification 直接通知 + 自行 load/save known managers；
 *       新版逻辑全部下沉到 @/modules/fund/misc/manager-check，本 composable 只做编排。
 */
import { useFundStore } from '@/modules/fund/fund-store'
import {
  checkManagerChanges as checkManagerChangesImpl,
  removeKnownManager,
} from '@/modules/fund/misc/manager-check'
import type { ManagerChange } from '@/modules/fund/fund-types'

export { removeKnownManager }

/**
 * 检测用户关注基金的基金经理是否变更。
 * @returns 变更列表（当日已检测的基金跳过）；通知由调用方决定如何展示
 */
export async function checkManagerChanges(): Promise<ManagerChange[]> {
  const fundStore = useFundStore()
  const codes = fundStore.fundCodes
  if (codes.length === 0) return []
  return checkManagerChangesImpl(codes)
}
