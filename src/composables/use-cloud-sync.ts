/**
 * 云端同步 Composable - 首页进入时「是否加载云端数据」的一次性弹框 + 恢复
 *
 * 流程：已登录（cloudUser 有效）且该用户名未询问过 → 弹确认框：
 *   - 点「加载」：读 user_configs.data → 写回 localStorage → reload 使内存 store 重新加载
 *   - 点「不加载」：仅记标记，下次不再问
 * 标记用 sync-flag 永久存 localStorage，不参与 data 同步。
 */

import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/modules/auth/auth-store'
import { loadUserConfig } from '@/modules/sync/supabase-client'
import { restoreFundData } from '@/modules/sync/collect-fund-data'
import { hasSyncAsked, markSyncAsked } from '@/modules/sync/sync-flag'
import { confirm } from '@/composables/use-confirm'

export function useCloudSync() {
  const authStore = useAuthStore()

  /** 是否正在弹框/加载中（防重入） */
  const prompting = ref(false)

  /**
   * 首页进入时调用：已登录且未询问过则弹「是否加载云端数据」。
   * 可安全重复调用（未登录 / 已询问 / 正在弹 均直接返回）。
   */
  async function maybePromptLoad(): Promise<void> {
    const name = authStore.currentUserName
    if (!name || prompting.value) return
    if (hasSyncAsked(name)) return

    prompting.value = true
    try {
      const ok = await confirm({
        title: '加载云端数据',
        desc: `检测到账号「${name}」，是否从云端加载已同步的基金数据到本地？`,
        confirmText: '加载',
        cancelText: '不加载',
      })
      // 用户已做选择（无论加载与否），标记已询问，下次不再弹
      if (!ok) {
        markSyncAsked(name)
        return
      }

      const res = await loadUserConfig(name)
      if (!res.ok) {
        ElMessage.error(res.error || '加载失败')
        return
      }
      if (!res.data) {
        markSyncAsked(name)
        ElMessage.info('云端暂无数据，请先在 PC 首页「一键同步」')
        return
      }
      restoreFundData(res.data)
      markSyncAsked(name)
      ElMessage.success('云端数据已加载，正在刷新...')
      // 跳过 beforeunload 兜底落盘：新设备首次恢复时，内存 store 仍是空数据，
      // reload 前的 flushAllPersist/flushPersist 会用空内存覆盖刚写回 localStorage 的真实数据，
      // 导致持仓/缓存「看似没加载」。置 flag 复用 data-management 的清除保护机制。
      ;(window as unknown as { __skipPersistOnUnload?: boolean }).__skipPersistOnUnload = true
      setTimeout(() => window.location.reload(), 400)
    } finally {
      prompting.value = false
    }
  }

  return { maybePromptLoad }
}
