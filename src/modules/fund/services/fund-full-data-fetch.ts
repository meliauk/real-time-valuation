/**
 * 基金详情页全量数据取数
 *
 * 一次加载 pingzhongdata 提取：历史净值(Data_netWorthTrend) + 基金详情信息
 * （基金名称/类型/经理/规模/成立日期/历史业绩/申赎状态/费率/资产配置/十大重仓/持有人结构/同类排名）。
 * pingzhongdata 无历史数据时回退 F10 lsjz 区间取数。
 * 用内联 script 一次加载取多个 window 变量（参考 manager-check.ts 方式）。
 */

import dayjs from 'dayjs'
import { API_URLS, LSJZ_CONFIG } from '@/config/constants'
import { fetchFundNetValueRange } from '@/modules/fund/valuation/net-value-range'
import { safeParseFloat } from '@/shared/utils/safe-math'
import { isValidFundCode } from '@/shared/utils/validation'
import { runScriptTask } from '@/shared/net/script-data-locks'

// ===== 详情子结构类型 =====

export interface PerformanceItem { title: string; value: number }
export interface AssetAllocationItem { category: string; ratio: number }
export interface TopHoldingItem { stockCode: string; stockName: string; ratio: number; changeRate?: number | null }
export interface HolderStructureItem { holderType: string; ratio: number }

export interface FundFullInfo {
  fundCode: string
  fundName: string
  fundType: string
  establishDate: string
  fundScale: string
  fundManager: string
  dayGrowthDate: string | null
  performanceItems: PerformanceItem[]
  purchaseStatus: string
  redeemStatus: string
  purchaseRate: string
  minPurchase: string
  assetAllocation: AssetAllocationItem[]
  topHoldings: TopHoldingItem[]
  holderStructure: HolderStructureItem[]
  peerRanking: string
}

interface NetWorthPoint { x: number; y: number | string }

const FUND_TYPE_MAP: Record<string, string> = {
  '001': '股票型', '002': '混合型', '003': '债券型',
  '004': '指数型', '005': 'QDII', '006': 'FOF', '007': '货币型',
}

/**
 * 取基金全量数据（历史净值 + 详细信息）。一次加载 pingzhongdata 取所有字段。
 * @returns 透出 pingzhongRaw（stockCodesNew + Data_fundSharesPositions）供持仓取数复用，
 *          fetchTop10FromPingzhong 用 fundSharesPositions 的 name 填股票中文名，避免二次 script 注入。
 */
export async function getFundFullData(fundCode: string): Promise<{
  history: { date: string; value: number }[]
  info: FundFullInfo | null
  /** pingzhongdata 持仓原始片段，供 fetchTop10FromPingzhong 复用（避免二次加载） */
  pingzhongRaw?: { stockCodesNew?: unknown; fundSharesPositions?: unknown[] }
}> {
  if (!isValidFundCode(fundCode)) return { history: [], info: null }

  const result = await loadPingzhongdataAll(fundCode)

  // 提取历史净值
  let history: { date: string; value: number }[] = []
  if (result?.netWorthData && Array.isArray(result.netWorthData)) {
    history = result.netWorthData
      .filter((d) => d && typeof d.x === 'number' && Number.isFinite(Number(d.y)))
      .sort((a, b) => a.x - b.x)
      .map((d) => ({ date: dayjs(d.x).format('YYYY-MM-DD'), value: safeParseFloat(d.y) }))
  }
  // 回退 lsjz
  if (history.length === 0) {
    try {
      const edate = dayjs().format('YYYY-MM-DD')
      const sdate = dayjs().subtract(3, 'year').format('YYYY-MM-DD')
      const lsjzRows = await fetchFundNetValueRange(fundCode, sdate, edate)
      history = lsjzRows.map((row) => ({ date: row.date, value: row.nav }))
    } catch { /* 静默 */ }
  }

  // 提取详情信息
  let info: FundFullInfo | null = null
  if (result?.windowData) {
    const w = result.windowData
    const partial: Partial<FundFullInfo> = {
      fundCode,
      fundName: w.fS_name ?? '',
      fundType: w.fS_type ? (FUND_TYPE_MAP[String(w.fS_type)] || String(w.fS_type)) : '',
      fundManager: Array.isArray(w.Data_currentFundManager) && w.Data_currentFundManager.length > 0
        ? (w.Data_currentFundManager[0]?.name ?? '--') : '--',
      fundScale: Array.isArray(w.Data_fluctuationScale) && w.Data_fluctuationScale.length > 0
        ? (w.Data_fluctuationScale[w.Data_fluctuationScale.length - 1]?.money
           ?? w.Data_fluctuationScale[w.Data_fluctuationScale.length - 1]?.assetMoney ?? '--') : '--',
      establishDate: history.length > 0 ? history[0].date : '',
      dayGrowthDate: history.length > 0 ? history[history.length - 1].date : null,
      performanceItems: [],
      purchaseStatus: w.fS_purchaseStatus ?? '',
      redeemStatus: w.fS_redeemStatus ?? '',
      purchaseRate: w.fund_Rate ? String(w.fund_Rate) : '',
      minPurchase: w.fund_minsg ? String(w.fund_minsg) : '',
      assetAllocation: [],
      topHoldings: [],
      holderStructure: [],
      peerRanking: '',
    }

    // 历史业绩：syl_* 优先，缺失从净值推算
    const calcGrowth = (days: number): number | null => {
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
      return closest && closest.value > 0 ? safeParseFloat((latest.value - closest.value) / closest.value * 100) : null
    }
    const periods: { title: string; sylKey?: string; days: number }[] = [
      { title: '近1周', days: 7 },
      { title: '近1月', sylKey: 'syl_1y', days: 30 },
      { title: '近3月', sylKey: 'syl_3y', days: 90 },
      { title: '近6月', sylKey: 'syl_6y', days: 180 },
      { title: '近1年', sylKey: 'syl_1n', days: 365 },
    ]
    for (const p of periods) {
      let val: number | null = null
      if (p.sylKey && w[p.sylKey] != null) val = safeParseFloat(w[p.sylKey])
      if (val == null || !Number.isFinite(val)) val = calcGrowth(p.days)
      if (val != null && Number.isFinite(val)) partial.performanceItems!.push({ title: p.title, value: val })
    }

    // 资产配置
    if (Array.isArray(w.Data_assetAllocation) && w.Data_assetAllocation.length > 0) {
      const latest = w.Data_assetAllocation[w.Data_assetAllocation.length - 1]
      if (latest?.assetAllocationList) {
        partial.assetAllocation = latest.assetAllocationList
          .filter((a: any) => a.name && a.ratio)
          .map((a: any) => ({ category: a.name, ratio: safeParseFloat(a.ratio) }))
      }
    }
    // 十大重仓
    if (Array.isArray(w.Data_fundSharesPositions) && w.Data_fundSharesPositions.length > 0) {
      const latest = w.Data_fundSharesPositions[w.Data_fundSharesPositions.length - 1]
      if (latest?.fundSharesPositionsList) {
        partial.topHoldings = latest.fundSharesPositionsList
          .slice(0, 10)
          .filter((s: any) => s.name && s.ratio)
          .map((s: any) => ({ stockCode: s.code ?? '', stockName: s.name, ratio: safeParseFloat(s.ratio) }))
      }
    }
    // 持有人结构
    if (Array.isArray(w.Data_holderStructure) && w.Data_holderStructure.length > 0) {
      const latest = w.Data_holderStructure[w.Data_holderStructure.length - 1]
      if (latest?.holderStructureList) {
        partial.holderStructure = latest.holderStructureList
          .filter((h: any) => h.name && h.ratio)
          .map((h: any) => ({ holderType: h.name, ratio: safeParseFloat(h.ratio) }))
      }
    }
    // 同类排名
    if (Array.isArray(w.Data_rateInSimilarType) && w.Data_rateInSimilarType.length > 0) {
      const latest = w.Data_rateInSimilarType[w.Data_rateInSimilarType.length - 1]
      if (latest) {
        const rankStr = String(latest.rank ?? latest.syl ?? '')
        const parts = rankStr.split('|')
        partial.peerRanking = parts.length === 2 ? `${parts[0]}/${parts[1]}` : rankStr || '--'
      }
    }

    info = partial as FundFullInfo
  }

  // 透出 pingzhongdata 的 stockCodesNew + Data_fundSharesPositions，供 fetchTop10FromPingzhong 复用
  // （避免二次加载；fundSharesPositions 的 name 用于填股票中文名）
  const pingzhongRaw = result?.windowData
    ? {
        stockCodesNew: result.windowData.stockCodesNew,
        fundSharesPositions: result.windowData.Data_fundSharesPositions,
      }
    : undefined

  return { history, info, pingzhongRaw }
}

/** 一次加载 pingzhongdata，返回 Data_netWorthTrend + window 变量。
 *  onload 后清理读过的全局变量，避免污染下一次加载（对齐 loadPingzhongGlobal 的清理列表）。
 *  通过 runScriptTask('pz:'+code) 串行：与 pingzhongdata 另两处加载器共享同一锁，
 *  保证 window.stockCodesNew/Data_netWorthTrend 等全局变量任一时刻只属于一个基金
 *  （详情页左右滑动双 pane 并发时防止持仓数据串扰）。 */
function loadPingzhongdataAll(fundCode: string): Promise<{
  netWorthData: NetWorthPoint[] | null
  windowData: Record<string, any> | null
} | null> {
  return runScriptTask(`pz:${fundCode}`, () => loadPingzhongdataAllRaw(fundCode))
}

function loadPingzhongdataAllRaw(fundCode: string): Promise<{
  netWorthData: NetWorthPoint[] | null
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

    /** 清理本次读过的全局变量，避免污染下一次 pingzhongdata 加载。
     *  已取出的引用快照不受影响（delete 只删 window 属性，不动对象本身）。 */
    const keysToClean = [
      'Data_netWorthTrend', 'fS_name', 'fS_type', 'Data_currentFundManager',
      'Data_fluctuationScale', 'fS_purchaseStatus', 'fS_redeemStatus', 'fund_Rate',
      'fund_minsg', 'syl_1y', 'syl_3y', 'syl_6y', 'syl_1n', 'Data_assetAllocation',
      'Data_fundSharesPositions', 'Data_holderStructure', 'Data_rateInSimilarType',
      'stockCodesNew', 'stockCodes', 'zqCodesNew', 'zqCodes', 'fS_code',
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
        fS_name: w.fS_name,
        fS_type: w.fS_type,
        Data_currentFundManager: w.Data_currentFundManager,
        Data_fluctuationScale: w.Data_fluctuationScale,
        fS_purchaseStatus: w.fS_purchaseStatus,
        fS_redeemStatus: w.fS_redeemStatus,
        fund_Rate: w.fund_Rate,
        fund_minsg: w.fund_minsg,
        syl_1y: w.syl_1y, syl_3y: w.syl_3y, syl_6y: w.syl_6y, syl_1n: w.syl_1n,
        Data_assetAllocation: w.Data_assetAllocation,
        Data_fundSharesPositions: w.Data_fundSharesPositions,
        Data_holderStructure: w.Data_holderStructure,
        Data_rateInSimilarType: w.Data_rateInSimilarType,
        stockCodesNew: w.stockCodesNew,
      }
      const netWorthData = w.Data_netWorthTrend ?? null
      cleanup()  // 先取完值再清全局（windowData 是引用快照，clearGlobals 不影响已取对象）
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
