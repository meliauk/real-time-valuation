/**
 * 基金数据收集 - 把浏览器缓存里基金相关的 localStorage 数据拼成一个大 JSON
 *
 * 覆盖换设备初次访问所需的自选代码/名称、估值缓存、持仓、推算持仓、盘中分时、
 * 个股涨跌等全部缓存。键名直接用 STORAGE_KEYS 的值，方便日后按原键还原到新设备。
 */

import { STORAGE_KEYS } from '@/config/constants'
import { loadJSON, loadString, saveJSON, saveString } from '@/shared/cache/local-storage-io'

/** 需要收集的 JSON 型缓存键（用 loadJSON 解析，值为 null 表示不存在则跳过） */
const JSON_KEYS = [
  STORAGE_KEYS.FUND_CODES,             // 自选基金代码
  STORAGE_KEYS.FUND_NAMES,             // 基金代码→名称映射
  STORAGE_KEYS.FUND_CACHE,             // 估值缓存
  STORAGE_KEYS.HOLDINGS,               // 持仓数据
  STORAGE_KEYS.HOLDING_ACTIONS,        // 持仓操作日志
  STORAGE_KEYS.PENDING_ACTIONS,        // T+1 待确认操作
  STORAGE_KEYS.ESTIMATED_GSZZL_CACHE,  // T+2 推算估值涨跌幅缓存
  STORAGE_KEYS.ESTIMATED_HOLDINGS_CACHE, // 推算持仓缓存
  STORAGE_KEYS.INTRADAY_MAP,           // 盘中分时点
  STORAGE_KEYS.STOCK_PREV_DAY_CACHE,   // 持仓股票昨收涨跌
  STORAGE_KEYS.STOCK_REALTIME_CACHE,   // 持仓股票实时涨跌
  STORAGE_KEYS.FUND_MANAGERS,          // 已知基金经理记录
  STORAGE_KEYS.TASKS,                  // 计划任务
] as const

/** 需要收集的字符串型缓存键（日期戳等，用 loadString 原样读取，不存在则跳过） */
const STRING_KEYS = [
  STORAGE_KEYS.HOLDINGS_VERSION,       // 持仓结构版本号
  STORAGE_KEYS.ESTIMATED_GSZZL_DATE,   // 推算估值涨跌缓存日期戳
  STORAGE_KEYS.ESTIMATED_HOLDINGS_DATE, // 推算持仓缓存日期戳
  STORAGE_KEYS.INTRADAY_MAP_DATE,      // 分时点日期戳
  STORAGE_KEYS.STOCK_PREV_DAY_DATE,    // 昨收涨跌缓存日期戳
  STORAGE_KEYS.STOCK_REALTIME_DATE,    // 实时涨跌缓存日期戳
] as const

/** 生成本地设备标识（无 crypto.randomUUID 时置空） */
function deviceId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : ''
}

/**
 * 收集所有基金相关缓存为一个大 JSON。
 * @returns 以 STORAGE_KEYS 值为键的对象 + 顶层 _syncMeta 元信息
 */
export function collectFundData(): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    _syncMeta: {
      at: new Date().toISOString(),
      deviceId: deviceId(),
    },
  }
  for (const key of JSON_KEYS) {
    const v = loadJSON<unknown>(key, null)
    if (v !== null) payload[key] = v
  }
  for (const key of STRING_KEYS) {
    const v = loadString(key)
    if (v !== null) payload[key] = v
  }
  return payload
}

/**
 * 把云端 data 大 JSON 还原写回 localStorage（一键加载/换设备恢复用）。
 * 只写 collectFundData 收集过的键，忽略 _syncMeta 等元信息。
 * 注意：写回 localStorage 后内存中的 store 不会自动感知，调用方需 reload 页面使数据生效。
 * @param data 云端 data（由 loadUserConfig 读取）
 */
export function restoreFundData(data: Record<string, unknown> | null | undefined): void {
  if (!data || typeof data !== 'object') return
  for (const key of JSON_KEYS) {
    const v = data[key]
    if (v !== undefined && v !== null) saveJSON(key, v)
  }
  for (const key of STRING_KEYS) {
    const v = data[key]
    if (v !== undefined && v !== null) saveString(key, String(v))
  }
}
