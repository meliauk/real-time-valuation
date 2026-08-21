/**
 * 基金数据 Composable - 涨跌幅驱动模型
 *
 * 聚合 fund-store 估值 + holding-store 持仓，生成 UI 直接用的基金行数据（FundRowData）。
 * 今日收益/持有金额/累计收益 三者由 holding-store 涨跌幅驱动模型算出（见 holding-store 方案甲）。
 */

import { computed } from 'vue'
import { useFundStore } from '@/modules/fund/fund-store'
import { useHoldingStore } from '@/modules/holding/holding-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import type { IntradayPoint } from '@/modules/fund/fund-types'
import type { SortField } from '@/modules/fund/fund-types'
import type { PeriodReturnItem, ConsecutiveInfo } from '@/modules/fund/services/fund-period-returns'
import { ChangeDirection } from '@/config/enums'
import { safeParseFloat, displayRate, roundMoney } from '@/shared/utils/safe-math'
import { formatValuationTime, formatHoldingDate, isPastDailyBadgeReset } from '@/shared/utils/date-format'
import { getPreviousTradingDay, getTodayStr, isCnTradingDay } from '@/modules/fund/valuation/cn-trading-day'
import { currentMinuteTick } from '@/composables/use-clock-tick'
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
  /** 是否有今日涨跌数据。与详情页 currentGszzl(=gszzl) 口径一致：
   *  有非零估算涨跌(gszzl)、或有盘中估算时间(gztime)、或今日确认净值已出(jzrg) 任一即显示；
   *  全无时今日涨跌列显示 -- 而非 0.00%（避免无数据时误显 0）。 */
  hasTodayData?: boolean
  /** 本基金持仓是否有真实占比（移动端 API 前十大含占比）。
   *  用于实时胶囊「实时」展示开关——占比有效即显示（与详情页 isHiddenRtSource 同口径），
   *  无占比时加权推算无意义故隐藏。 */
  hasHoldingsRatio?: boolean
  realtimeGszzl?: number
  realtimeSource?: string
  realtimeUpdatedAt?: string
  /** 实时胶囊是否为占位态（em-realtime-service 首屏置 0、无 realtimeUpdatedAt）。
   *  占位期间数据未到位，UI 加 loading 弱化样式，与"真实算出 0.00%"视觉区分。 */
  realtimePlaceholder?: boolean
  intradayPoints: IntradayPoint[]
  intradayBaseValue: number
  /** PC 端周期收益（近1周/近1月/近3月/近6月/近1年），非 PC 端时为空数组 */
  periodReturns: PeriodReturnItem[]
  /** PC 端连续涨跌信息 */
  consecutiveDays: ConsecutiveInfo | null
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
  const settingsStore = useSettingsStore()
  /** 分钟级时钟：让依赖"当前时间"的字段（isUpdated 的 08:30 边界、valuationTime 的跨日）
   *  能在时间跨过边界时自动重算。纯时间函数不是响应式的，不读它就永远不会因时间流逝而更新。 */
  const minuteTick = currentMinuteTick()

  /** 基金行数据列表 */
  const fundRows = computed<FundRowData[]>(() => {
    // 建立时间依赖：每分钟触发一次重算，使 08:30 徽章重置 / 跨日按时生效
    void minuteTick.value
    return fundStore.fundCodes.map(code => {
      try {
        const v = fundStore.getValuation(code)
        const gszzl = v?.gszzl || 0
        const displayGszzl = displayRate(gszzl)
        const isEstimated = v?.isEstimated ?? true
        const today = getTodayStr()
        // isUpdated（已更新）：约定第二日北京时间 08:30 准时清空徽章。
        //   - 08:30 前：一律不显示（避免把"昨日已更新"误显成今日，清晨 fundgz 尚未出今日估算时
        //     基金保留昨日确认值 isEstimated=false 会误亮徽章）。
        //   - 08:30 后：基金公司当日发布了确认净值才算已更新——
        //     T+1：jzrq >= today；T+2：jzrq >= getPreviousTradingDay()。
        //   接口无当日确认数据（jzrq 落后预期日期）→ 不显示徽章，今日涨跌列随之显示 --（由 changeRate 逻辑兜底）。
        const expectedConfirmDate = v?.delayDays === 2 ? getPreviousTradingDay() : today
        const isUpdated = isPastDailyBadgeReset() && v?.jzrq != null && v.jzrq >= expectedConfirmDate

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

        const todayProfit = holdingStore.calcFundTodayProfit(code, displayGszzl, v?.dwjz, gszzl, isEstimated, holdingStore.resolveGszzlDate(v))
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

        // 推算持仓缓存（T+1/T+2 同源）：供 hasTodayData 判定 + 实时胶囊占比判定共用。
        const estHoldings = fundStore.estimatedHoldingsCache.get(code)?.data

        // 是否有今日涨跌数据：与详情页 currentGszzl(=gszzl) 口径一致——
        // 有非零估算涨跌、或有盘中估算 gztime、或今日确认净值已出，任一即显示今日涨跌；
        // 全无（fundgz/新浪失败且确认未出）才显示 -- 而非 0.00%。
        // T+2 未确认时今日涨跌来自持仓股票加权推算（recomputeFundsForStocks）：
        // 只要持仓缓存存在即视为"有数据可算"——推算出来是 0（涨跌互抵）也显示 0.00%，
        // 不再用 gszzl!==0 卡 --（旧逻辑会把真实推算 0 误判为无数据显示 --，与详情页不一致）。
        // T+2 一只持仓股昨收都拿不到的极端情况会推算为 0，仍显 0.00%——可接受（比长时间 -- 体感好），
        // loop 取到数据后 recompute 覆盖为真实值。
        const hasHoldingsForEstimate = v?.delayDays === 2
          ? !!estHoldings && estHoldings.holdings.length > 0
          : false
        const hasTodayData = gszzl !== 0 || (!!v?.gztime)
          || (v?.jzrq != null && v.jzrq >= expectedConfirmDate)
          || hasHoldingsForEstimate

        // 持仓占比是否有效：读推算持仓缓存，任一项 ratio>0 即有效。
        // 与详情页 hasHoldingsRatio(displayHoldings.holdings.some(h=>h.ratio>0)) 同口径，
        // 供实时胶囊按新口径决定「实时」是否显示。
        const hasHoldingsRatio = !!estHoldings && estHoldings.holdings.some(h => (h.ratio ?? 0) > 0)

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
          hasTodayData,
          hasHoldingsRatio,
          delayDays: v?.delayDays ?? 1,
          // enablePrediction=false 时 recompute 不再推算 realtimeGszzl；透出 undefined 让胶囊/排序无值，
          // 防 valuationMap 残留开关关闭前的旧实时值导致胶囊仍显示。
          realtimeGszzl: settingsStore.enablePrediction ? v?.realtimeGszzl : undefined,
          realtimeSource: settingsStore.enablePrediction ? v?.realtimeSource : undefined,
          realtimeUpdatedAt: settingsStore.enablePrediction ? v?.realtimeUpdatedAt : undefined,
          // 占位态：em-realtime(yahoo) 首屏置 realtimeGszzl=0、source 为占位标签、未设 realtimeUpdatedAt。
          // 数据到位 recompute 后会设 realtimeUpdatedAt——据此区分占位/真实。
          realtimePlaceholder: settingsStore.enablePrediction && v?.realtimeGszzl === 0 && !v?.realtimeUpdatedAt &&
            v?.realtimeSource === '实时',
          intradayPoints: fundStore.intradayMap[code] || [],
          intradayBaseValue: computeIntradayBase(v),
          periodReturns: fundStore.getPeriodReturns(code) || [],
          consecutiveDays: fundStore.getConsecutiveDays(code),
        }
      } catch {
        return {
          fundCode: code, fundName: '--', lastNetValue: 0, currentNav: 0,
          changeRate: 0, netChangeRate: 0, changeDirection: ChangeDirection.Flat,
          holdingAmount: 0, costPrice: 0, todayProfit: 0, totalProfit: 0,
          totalReturnRate: null, profitStatus: 'flat', valuationTime: '', holdingDate: '',
          isEstimated: true, isUpdated: false, hasTodayData: false, delayDays: 1,
          intradayPoints: [], intradayBaseValue: 0, periodReturns: [], consecutiveDays: null,
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
