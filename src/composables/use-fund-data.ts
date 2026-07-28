/**
 * 基金数据 Composable - 涨跌幅驱动模型
 *
 * 聚合 fund-store 估值 + holding-store 持仓，生成 UI 直接用的基金行数据（FundRowData）。
 * 今日收益/持有金额/累计收益 三者由 holding-store 涨跌幅驱动模型算出（见 holding-store 方案甲）。
 */

import { computed } from 'vue'
import { useFundStore } from '@/modules/fund/fund-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import type { IntradayPoint } from '@/modules/fund/fund-types'
import type { SortField } from '@/modules/fund/fund-types'
import { ChangeDirection } from '@/config/enums'
import { safeParseFloat, displayRate, roundMoney } from '@/shared/utils/safe-math'
import { formatValuationTime, formatHoldingDate } from '@/shared/utils/date-format'
import { getPreviousTradingDay, getTodayStr, isCnTradingDay } from '@/modules/fund/valuation/cn-trading-day'
import dayjs from 'dayjs'

/** 基金行数据 - 估值 + 持仓 + 计算字段的合并视图 */
export interface FundRowData {
  fundCode: string
  fundName: string
  lastNetValue: number
  currentNav: number
  changeRate: number
  netChangeRate: number
  changeDirection: ChangeDirection
  holdingAmount: number
  costPrice: number
  todayProfit: number
  totalProfit: number
  totalReturnRate: number | null
  profitStatus: string
  valuationTime: string
  holdingDate: string
  isEstimated?: boolean
  isUpdated?: boolean
  delayDays?: 1 | 2
  realtimeGszzl?: number
  realtimeSource?: string
  realtimeUpdatedAt?: string
  /** 实时胶囊是否为占位态（em-realtime-service 首屏置 0、无 realtimeUpdatedAt）。
   *  占位期间数据未到位，UI 加 loading 弱化样式，与"真实算出 0.00%"视觉区分。 */
  realtimePlaceholder?: boolean
  intradayPoints: IntradayPoint[]
  intradayBaseValue: number
}

/** 计算走势图昨收基准 */
function computeIntradayBase(v: { dwjz: number; delayDays?: 1 | 2; gztime?: string; gszzl: number; isEstimated?: boolean } | undefined): number {
  if (!v || v.dwjz <= 0) return 0
  const isT2 = v.delayDays === 2 || (v.delayDays == null && !!v.gztime && !v.gztime.includes(':'))
  if (isT2) return v.dwjz
  if (v.gszzl !== 0 && !v.isEstimated) return v.dwjz / (1 + v.gszzl / 100)
  return v.dwjz
}

export function useFundData() {
  const fundStore = useFundStore()
  const holdingStore = useHoldingStore()

  /** 基金行数据列表 */
  const fundRows = computed<FundRowData[]>(() => {
    return fundStore.fundCodes.map(code => {
      try {
        const v = fundStore.getValuation(code)
        const gszzl = v?.gszzl || 0
        const displayGszzl = displayRate(gszzl)
        const isEstimated = v?.isEstimated ?? true
        const today = getTodayStr()
        // isUpdated（已更新）：今天基金公司更新了确认净值即算已更新，无论更新的是今日还是昨日净值。
        //   - T+1（国内基金）：今天会更新出今日(7.20)净值 → jzrq >= today
        //   - T+2（QDII等）：今天会更新出昨日(7.19)净值 → jzrq >= getPreviousTradingDay()
        //   不再要求 jzrq===today——T+2 今日更新昨日净值也算"已更新"。
        const expectedConfirmDate = v?.delayDays === 2 ? getPreviousTradingDay() : today
        const isUpdated = !isEstimated || (v?.jzrq != null && v.jzrq >= expectedConfirmDate)

        // 名称：统一走 resolveFundName（估值实时 name 优先，回退 fundNameMap），
        // fundgz 失败时也能显示搜索/目录拿到的真名。列表无名称时显示 --。
        const resolvedName = fundStore.resolveFundName(code)
        const fundName = resolvedName === code ? '--' : resolvedName

        // 昨日净值/昨日涨跌：同日期配对（方案甲：滞后 N 个交易日，不随今日确认前进）。
        //   prevConfirmedGszzl 由 fillPrevConfirmedNav 与 prevConfirmedNav 配对设置（回退分支已修为 lsjz
        //   同日期真实涨跌，不再用今日 result.gszzl 顶替）。
        //   prevConfirmedGszzl 缺失时退 confirmedGszzl（lsjz 最新条涨跌，与 dwjz 同日期），最后退 gszzl。
        const currentNav = v?.prevConfirmedNav ?? v?.dwjz ?? 0
        const confirmedRate = isEstimated ? (v?.confirmedGszzl ?? 0) : (v?.gszzl ?? 0)

        const todayProfit = holdingStore.calcFundTodayProfit(code, displayGszzl, v?.dwjz, gszzl, isEstimated)
        const baseAmount = holdingStore.getFundHoldingAmount(code, v?.dwjz, gszzl, isEstimated)
        const principal = holdingStore.getPrincipal(code)
        const holdingAmount = baseAmount
        const totalProfit = roundMoney(holdingAmount - principal)
        const totalReturnRate: number | null = principal > 0 ? displayRate(totalProfit / principal * 100) : null

        const valTime = !isCnTradingDay()
          ? getPreviousTradingDay()
          : v?.delayDays === 2
            ? getPreviousTradingDay()
            : (v?.isEstimated ? (v.gztime ?? '') : getTodayStr())

        const profitStatus = totalReturnRate != null
          ? (totalReturnRate > 0 ? 'profit' : totalReturnRate < 0 ? 'loss' : 'flat')
          : 'flat'

        return {
          fundCode: code,
          fundName,
          lastNetValue: v?.prevConfirmedNav ?? v?.dwjz ?? 0,
          currentNav,
          changeRate: safeParseFloat(displayGszzl),
          netChangeRate: safeParseFloat(displayRate(v?.prevConfirmedGszzl ?? confirmedRate)),
          changeDirection: displayGszzl > 0 ? ChangeDirection.Rise : displayGszzl < 0 ? ChangeDirection.Fall : ChangeDirection.Flat,
          holdingAmount,
          costPrice: holdingStore.getAvgCostPrice(code),
          todayProfit,
          totalProfit,
          totalReturnRate,
          profitStatus,
          valuationTime: formatValuationTime(valTime),
          holdingDate: formatHoldingDate(holdingStore.activeHoldings.find(h => h.fundCode === code)?.holdingDate ?? ''),
          isEstimated,
          isUpdated,
          delayDays: v?.delayDays ?? 1,
          realtimeGszzl: v?.realtimeGszzl,
          realtimeSource: v?.realtimeSource,
          realtimeUpdatedAt: v?.realtimeUpdatedAt,
          // 占位态：em-realtime(yahoo) 首屏置 realtimeGszzl=0、source 为占位标签、未设 realtimeUpdatedAt。
          // 数据到位 recompute 后会设 realtimeUpdatedAt——据此区分占位/真实。
          realtimePlaceholder: v?.realtimeGszzl === 0 && !v?.realtimeUpdatedAt &&
            (v?.realtimeSource === '持仓预测' || v?.realtimeSource === '实时推算'),
          intradayPoints: fundStore.intradayMap[code] || [],
          intradayBaseValue: computeIntradayBase(v),
        }
      } catch {
        return {
          fundCode: code, fundName: '--', lastNetValue: 0, currentNav: 0,
          changeRate: 0, netChangeRate: 0, changeDirection: ChangeDirection.Flat,
          holdingAmount: 0, costPrice: 0, todayProfit: 0, totalProfit: 0,
          totalReturnRate: null, profitStatus: 'flat', valuationTime: '', holdingDate: '',
          isEstimated: true, delayDays: 1,
          intradayPoints: [], intradayBaseValue: 0,
        }
      }
    })
  })

  /** 排序后的基金行数据 */
  const sortedFundRows = computed<FundRowData[]>(() => {
    const rows = [...fundRows.value]
    const field = fundStore.sortField
    const dir = fundStore.sortDirection === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const valA = (a as any)[field] ?? 0
      const valB = (b as any)[field] ?? 0
      if (typeof valA === 'string') return valA.localeCompare(valB) * dir
      return (valA - valB) * dir
    })
    return rows
  })

  /** 仪表盘统计 */
  const dashboardStats = computed(() => {
    const vMap = new Map<string, { gz: number; dwjz: number; gszzl: number; isEstimated?: boolean; jzrq?: string; delayDays?: 1 | 2 }>()
    for (const [code, v] of fundStore.valuationMap) {
      vMap.set(code, { gz: v.gz, dwjz: v.dwjz, gszzl: v.gszzl, isEstimated: v.isEstimated, jzrq: v.jzrq, delayDays: v.delayDays })
    }
    return holdingStore.getDashboardStats(vMap)
  })

  /** 刷新所有基金数据 */
  async function refreshData(): Promise<void> {
    await fundStore.refreshAllValuations()
  }

  return { fundRows, sortedFundRows, dashboardStats, refreshData, fundStore, holdingStore }
}
