/**
 * 基金周期收益取数服务
 *
 * 一次 JSONP 加载 pingzhongdata 提取 Data_netWorthTrend + syl_*，
 * 计算近1周/近1月/近3月/近6月/近1年涨跌幅。
 * 用于 PC 端基金列表新增周期收益列，独立于详情页 fund-full-data-fetch。
 */

import dayjs from 'dayjs'
import { API_URLS, LSJZ_CONFIG } from '@/config/constants'
import { safeParseFloat } from '@/shared/utils/safe-math'
import { isValidFundCode } from '@/shared/utils/validation'

/** 周期收益项 */
export interface PeriodReturnItem {
  title: string
  value: number
}

/** 连续涨跌信息 */
export interface ConsecutiveInfo {
  /** 方向：up=连续上涨, down=连续下跌, flat=平盘 */
  direction: 'up' | 'down' | 'flat'
  /** 连续天数（flat 时为 0） */
  count: number
}

/** 从历史净值中推算约 N 日前净值，计算涨跌幅 */
function calcGrowth(history: { date: string; value: number }[], days: number): number | null {
  if (history.length < 2) return null
  const latest = history[history.length - 1]
  const target = dayjs(latest.date).subtract(days, 'day')
  let closest = history[0]
  let minDist = Infinity
  for (const d of history) {
    if (d.date === latest.date) continue
    const dist = Math.abs(dayjs(d.date).diff(target, 'day'))
    if (dist < minDist) { minDist = dist; closest = d }
  }
  return closest && closest.value > 0
    ? safeParseFloat((latest.value - closest.value) / closest.value * 100)
    : null
}

/** 从历史净值序列计算连续涨跌天数。
 *  history 按日期升序排列，从最新一条往前数连续同向天数。 */
function calcConsecutiveDays(history: { date: string; value: number }[]): ConsecutiveInfo | null {
  if (history.length < 2) return null
  // 计算每日涨跌方向
  const dirs: ('up' | 'down' | 'flat')[] = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].value
    const curr = history[i].value
    if (prev <= 0) { dirs.push('flat'); continue }
    const change = (curr - prev) / prev
    if (change > 0) dirs.push('up')
    else if (change < 0) dirs.push('down')
    else dirs.push('flat')
  }
  if (dirs.length === 0) return null
  // 从最新日推方向并往前计数
  const latest = dirs[dirs.length - 1]
  if (latest === 'flat') return { direction: 'flat', count: 0 }
  let count = 0
  for (let i = dirs.length - 1; i >= 0; i--) {
    if (dirs[i] === latest) count++
    else break
  }
  return { direction: latest, count }
}

/** 单个基金 JSONP 加载（无 runScriptTask 锁，由调用方保证串行） */
function loadPingzhongPeriod(fundCode: string): Promise<{
  netWorthData: { x: number; y: number | string }[] | null
  windowData: Record<string, any> | null
} | null> {
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

    const keysToClean = [
      'Data_netWorthTrend', 'fS_name', 'fS_type',
      'syl_1y', 'syl_3y', 'syl_6y', 'syl_1n',
    ]
    function clearGlobals(): void {
      for (const k of keysToClean) {
        try { delete w[k] } catch { w[k] = undefined }
      }
    }
    function cleanup(): void {
      clearTimeout(timer)
      clearGlobals()
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    script.onload = () => {
      if (done) return
      done = true
      const windowData: Record<string, any> = {
        syl_1y: w.syl_1y, syl_3y: w.syl_3y, syl_6y: w.syl_6y, syl_1n: w.syl_1n,
      }
      const netWorthData = w.Data_netWorthTrend ?? null
      cleanup()
      resolve({ netWorthData, windowData })
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

/** 取单个基金的周期收益列表（5项）+ 连续涨跌 */
export async function fetchFundPeriodReturns(fundCode: string): Promise<{
  items: PeriodReturnItem[]
  consecutive: ConsecutiveInfo | null
}> {
  const empty = { items: [] as PeriodReturnItem[], consecutive: null as ConsecutiveInfo | null }
  if (!isValidFundCode(fundCode)) return empty

  const result = await loadPingzhongPeriod(fundCode)
  if (!result) return empty

  // 解析历史净值
  const history: { date: string; value: number }[] = (result.netWorthData || [])
    .filter((d) => d && typeof d.x === 'number' && Number.isFinite(Number(d.y)))
    .sort((a, b) => a.x - b.x)
    .map((d) => ({ date: dayjs(d.x).format('YYYY-MM-DD'), value: safeParseFloat(d.y) }))

  const w = result.windowData || {}

  const periods: { title: string; sylKey?: string; days: number }[] = [
    { title: '近1周', days: 7 },
    { title: '近1月', sylKey: 'syl_1y', days: 30 },
    { title: '近3月', sylKey: 'syl_3y', days: 90 },
    { title: '近6月', sylKey: 'syl_6y', days: 180 },
    { title: '近1年', sylKey: 'syl_1n', days: 365 },
  ]

  const items: PeriodReturnItem[] = []
  for (const p of periods) {
    let val: number | null = null
    if (p.sylKey && w[p.sylKey] != null) val = safeParseFloat(w[p.sylKey])
    if (val == null || !Number.isFinite(val)) val = calcGrowth(history, p.days)
    if (val != null && Number.isFinite(val)) items.push({ title: p.title, value: val })
  }
  const consecutive = calcConsecutiveDays(history)
  return { items, consecutive }
}

/** 批量取多个基金的周期收益 + 连续涨跌（串行避免 window 全局变量冲突） */
export async function fetchFundPeriodReturnsBatch(codes: string[]): Promise<
  Map<string, { items: PeriodReturnItem[]; consecutive: ConsecutiveInfo | null }>
> {
  const map = new Map<string, { items: PeriodReturnItem[]; consecutive: ConsecutiveInfo | null }>()
  for (const code of codes) {
    const result = await fetchFundPeriodReturns(code)
    if (result.items.length > 0) map.set(code, result)
  }
  return map
}
