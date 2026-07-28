/**
 * 全局二次确认 Composable - 提供与 ConfirmModal 组件配套的 await confirm({...}) 调用
 *
 * 用法（替换原 ElMessageBox.confirm）：
 *   const ok = await confirm({ title: '删除确认', desc: '确认删除该基金？持仓数据将一并清除。',
 *                             confirmText: '确认删除', cancelText: '取消' })
 *   if (!ok) return
 *   // ... 执行操作
 *
 * 实现：模块级单例 reactive 状态驱动 App.vue 挂载的唯一 <ConfirmModal>。
 * 同一时刻只允许一个确认弹窗：若上一个未关闭，新调用会等其 resolve 后再弹（队列化）
 * 以避免弹层叠加错乱。
 */

import { reactive } from 'vue'
import type { ConfirmItem } from '@/components/shared/confirm-modal.vue'

export interface ConfirmOptions {
  title: string
  desc?: string
  confirmText?: string
  cancelText?: string
  items?: ConfirmItem[]
}

interface ConfirmState extends ConfirmOptions {
  visible: boolean
  resolver: ((ok: boolean) => void) | null
}

// 模块级单例：整 app 共用一个状态 + 一个 pending promise
const state = reactive<ConfirmState>({
  visible: false,
  title: '',
  desc: '',
  confirmText: '确认',
  cancelText: '取消',
  items: [],
  resolver: null,
})

/** 供 App.vue 的 <ConfirmModal> 绑定用 */
export function useConfirmState() {
  return state
}

/** 弹出确认窗，返回是否确认。取消/关闭均 resolve(false)，不 reject，调用点用 if(!ok) return */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  // 若已有弹窗在等待，先 resolve 掉它（视为取消）再开新的，避免叠加
  if (state.resolver) {
    state.resolver(false)
    state.resolver = null
  }
  return new Promise<boolean>((resolve) => {
    state.title = options.title
    state.desc = options.desc ?? ''
    state.confirmText = options.confirmText ?? '确认'
    state.cancelText = options.cancelText ?? '取消'
    state.items = options.items ?? []
    state.resolver = resolve
    state.visible = true
  })
}

/** 点确认 - 由 ConfirmModal @confirm 触发 */
export function resolveConfirm(): void {
  if (!state.resolver) return
  const r = state.resolver
  state.resolver = null
  state.visible = false
  r(true)
}

/** 点取消/点遮罩关闭 - 由 ConfirmModal @cancel / update:visible(false) 触发 */
export function resolveCancel(): void {
  if (!state.resolver) return
  const r = state.resolver
  state.resolver = null
  state.visible = false
  r(false)
}
