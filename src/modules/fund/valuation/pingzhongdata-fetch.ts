/**
 * pingzhongdata 净值取数（替代失效的 F10 lsjz）
 *
 * 天天基金 F10 lsjz 接口（F10DataApi.aspx）已失效，改用 pingzhongdata
 * 的 Data_netWorthTrend 净值序列取最近净值，供估值合并使用。
 *
 * 返回结构与 lsjz-fetch 的 LsjzRealData 兼容，使 fund-valuation-merge 改动最小：
 *   - dwjz：最新已确认净值（末条 y）
 *   - gszzl：最新条真实涨跌（末条 equityReturn）
 *   - gz：同 dwjz
 *   - jzrq：最新条净值日期（末条 x 时间戳 → YYYY-MM-DD）
 *   - recentNavs：最近4条升序净值（供按 delayDays 取滞后N交易日净值）
 *
 * script 注入加载，onload 后从全局变量读 Data_netWorthTrend + fS_name
 * （参考 fund-full-data-fetch.ts 的 loadPingzhongdataAll 模式）。
 */

import dayjs from 'dayjs'
import { API_URLS, LSJZ_CONFIG } from '@/config/constants'
import type { LsjzRow } from './lsjz-parser'
import { safeParseFloat } from '@/shared/utils/safe-math'
import { isValidFundCode } from '@/shared/utils/validation'
import { runScriptTask } from '@/shared/net/script-data-locks'

/** 净值取数结果（lsjz-fetch 历史遗留命名，lsjz 接口失效后改由 pingzhongdata 提供） */
export interface LsjzRealData {
  /** 最新已确认净值（dwjz） */
  dwjz: number
  /** 最新条真实涨跌（gszzl，百分比） */
  gszzl: number
  /** 净值估算值（同 dwjz） */
  gz: number
  /** 最新条净值日期（jzrq） */
  jzrq: string
  /** 最近4条升序净值（供滞后N交易日取值） */
  recentNavs: LsjzRow[]
}

/** pingzhongdata 净值序列原始项 */
interface PingzhongTrendPoint {
  /** 时间戳（毫秒） */
  x: number
  /** 单位净值 */
  y: number | string
  /** 日增长率（百分比，可能缺失） */
  equityReturn?: number | null
}

/**
 * 取基金最近净值数据（从 pingzhongdata 的 Data_netWorthTrend）。
 * @param fundCode 基金代码
 * @returns 最近净值+涨跌，失败返回 null
 */
export async function fetchPingzhongNavData(fundCode: string): Promise<LsjzRealData | null> {
  if (!isValidFundCode(fundCode)) return null

  const trend = await loadPingzhongTrend(fundCode)
  if (!trend || trend.length === 0) return null

  // 过滤有效项并升序（pingzhongdata 本身升序，保险起见再排一次）
  const valid = trend
    .filter((d) => d && typeof d.x === 'number' && Number.isFinite(Number(d.y)))
    .sort((a, b) => a.x - b.x)
  if (valid.length === 0) return null

  const latest = valid[valid.length - 1]
  const dwjz = safeParseFloat(latest.y)
  let gszzl = Number.isFinite(latest.equityReturn as number) ? safeParseFloat(latest.equityReturn) : 0

  // 涨跌缺失：用前一条净值自算（2位）
  if (gszzl === 0 && valid.length >= 2) {
    const prev = valid[valid.length - 2]
    const prevNav = safeParseFloat(prev.y)
    if (prevNav > 0) {
      gszzl = Math.round(((dwjz - prevNav) / prevNav * 100) * 100) / 100
    }
  }

  // recentNavs：最近4条升序，供 fillPrevConfirmedNav 按 delayDays 取滞后N交易日净值
  const recentNavs: LsjzRow[] = valid.slice(-4).map((d) => ({
    date: dayjs(d.x).format('YYYY-MM-DD'),
    nav: safeParseFloat(d.y),
    growth: Number.isFinite(d.equityReturn as number) ? safeParseFloat(d.equityReturn) : null,
  }))

  return {
    dwjz,
    gszzl,
    gz: dwjz,
    jzrq: dayjs(latest.x).format('YYYY-MM-DD'),
    recentNavs,
  }
}

/** 加载 pingzhongdata，返回 Data_netWorthTrend 净值序列。失败返回 null。
 *  通过 runScriptTask('pz:'+code) 串行：与 pingzhongdata 另两处加载器共享同一锁，
 *  保证 window 全局变量任一时刻只属于一个基金（详情页左右滑动双 pane 并发时防串扰）。 */
function loadPingzhongTrend(fundCode: string): Promise<PingzhongTrendPoint[] | null> {
  return runScriptTask(`pz:${fundCode}`, () => loadPingzhongTrendRaw(fundCode))
}

function loadPingzhongTrendRaw(fundCode: string): Promise<PingzhongTrendPoint[] | null> {
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
      script.onload = null
      script.onerror = null
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    script.onload = () => {
      if (done) return
      done = true
      const trend = Array.isArray(w.Data_netWorthTrend) ? w.Data_netWorthTrend : null
      cleanup()
      // 清理全局变量，避免污染下一次加载
      try { delete w.Data_netWorthTrend } catch { w.Data_netWorthTrend = undefined }
      try { delete w.fS_name } catch { w.fS_name = undefined }
      resolve(trend)
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
