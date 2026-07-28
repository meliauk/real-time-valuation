/**
 * 基金经理变更检测
 *
 * 每日检测一次用户关注基金的基金经理是否变更（取 pingzhongdata 的 Data_currentFundManager）。
 * 与已记录的经理对比，变更则收集到变更列表，由调用方决定如何通知（UI 弹窗等）。
 *
 * 检测结果持久化到 localStorage（STORAGE_KEYS.FUND_MANAGERS），按日去重（已检测当日则跳过）。
 * 并发取详情（MANAGER_CHECK_CONCURRENCY），避免串行队列撑满。
 *
 * 不耦合 UI 通知层——只返回变更列表，通知由调用方处理（保持板块纯逻辑）。
 */

import type { KnownManager, ManagerChange } from '../fund-types'
import { API_URLS, STORAGE_KEYS, FUND_VALUATION_CONFIG, LSJZ_CONFIG } from '@/config/constants'
import { loadJSON, saveJSON } from '@/shared/cache/local-storage-io'
import { getTodayStr } from '../valuation/cn-trading-day'

/** 加载已知经理记录（code → KnownManager） */
export function loadKnownManagers(): Record<string, KnownManager> {
  return loadJSON<Record<string, KnownManager>>(STORAGE_KEYS.FUND_MANAGERS, {})
}

/** 保存已知经理记录 */
export function saveKnownManagers(data: Record<string, KnownManager>): void {
  saveJSON(STORAGE_KEYS.FUND_MANAGERS, data)
}

/** 移除某基金的已知经理记录（基金被移除关注时调） */
export function removeKnownManager(fundCode: string): void {
  const data = loadKnownManagers()
  delete data[fundCode]
  saveKnownManagers(data)
}

/** pingzhongdata 当前经理字段结构 */
interface CurrentFundManager { name?: string }

/**
 * 取基金当前经理 + 名称（pingzhongdata 一次加载取 Data_currentFundManager + fS_name）。
 * @returns { name, manager }，取不到或经理为空返回 null
 */
async function fetchFundManager(fundCode: string): Promise<{ name: string; manager: string } | null> {
  return new Promise((resolve) => {
    const w = window as any
    const url = `${API_URLS.FUND_DETAIL}${fundCode}.js?rt=${Date.now()}`
    const script = document.createElement('script')
    let done = false

    const timer = setTimeout(() => {
      if (done) return
      done = true
      cleanup()
      resolve(null)
    }, LSJZ_CONFIG.TIMEOUT)

    function cleanup(): void {
      clearTimeout(timer)
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    script.onload = () => {
      if (done) return
      done = true
      cleanup()
      const manager = w.Data_currentFundManager?.[0]?.name
      const name = w.fS_name ?? fundCode
      if (!manager || manager === '--') {
        resolve(null)
        return
      }
      resolve({ name, manager })
    }
    script.onerror = () => {
      if (done) return
      done = true
      cleanup()
      resolve(null)
    }
    script.src = url
    document.head.appendChild(script)
  })
}

/**
 * 检测基金经理变更。
 * @param fundCodes 关注的基金代码列表
 * @returns 变更列表（当日已检测的基金跳过，不重复检测）
 */
export async function checkManagerChanges(fundCodes: string[]): Promise<ManagerChange[]> {
  if (fundCodes.length === 0) return []

  const known = loadKnownManagers()
  const today = getTodayStr()
  const changes: ManagerChange[] = []
  const concurrency = FUND_VALUATION_CONFIG.MANAGER_CHECK_CONCURRENCY

  for (let i = 0; i < fundCodes.length; i += concurrency) {
    const batch = fundCodes.slice(i, i + concurrency)
    await Promise.allSettled(batch.map(async (code) => {
      // 当日已检测则跳过
      if (known[code]?.updatedAt === today) return
      const result = await fetchFundManager(code)
      if (!result) return

      const prev = known[code]
      if (prev && prev.managerName !== result.manager) {
        changes.push({
          fundCode: code,
          fundName: result.name,
          oldManager: prev.managerName,
          newManager: result.manager,
        })
      }
      known[code] = {
        fundCode: code,
        fundName: result.name,
        managerName: result.manager,
        updatedAt: today,
      }
    }))
  }

  saveKnownManagers(known)
  return changes
}
