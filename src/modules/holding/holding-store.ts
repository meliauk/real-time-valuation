/**
 * 持仓管理 Store - 涨跌幅驱动模型
 *
 * 精度策略（方案甲）：今日收益 / 持有金额 / 累计收益三者统一以「显示涨跌幅」（displayRate 截 2 位）
 * 为唯一数据源，不用原始 >2 位精度涨跌幅。
 *
 * 三者口径（持有金额/累计收益在今日净值确认前不含今日涨跌，今日收益独立计算）：
 *   - 今日收益 = confirmedBase × displayRate(gszzl)/100（基于「未更新的昨日确认金额」算，
 *     今日净值确认推进 yesterdayAmount 后不影响今日收益——confirmedBase 是推进前的快照）
 *   - 持有金额 = 昨日持有金额（仅含已确认数据），估算时不含当日涨跌；今日净值确认前不叠加今日
 *   - 累计收益 = 持有金额 - 投入本金（随持有金额口径，今日净值确认前不含今日涨跌）
 *
 * 注意：今日收益与「持有金额增量」并不恒等——持有金额在今日确认前不变（增量=0），
 *   而今日收益已按今日涨跌算出。二者口径不同，今日收益仅在「今日净值确认、yesterdayAmount
 *   推进」后才体现进持有金额/累计收益。这是预期行为，非 bug。
 *
 * 持仓记录（Holding）在 fund-types（估值流程依赖）；操作记录/待确认操作在本板块类型。
 * 持久化用 localStorage（防抖写入 + beforeunload 兜底）。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import type { Holding, FundValuation } from '@/modules/fund/fund-types'
import type { HoldingAction, PendingAction, DashboardStats } from './holding-types'
import { HoldingActionType, PendingActionStatus } from './holding-types'
import { ProfitStatus } from '@/config/enums'
import { STORAGE_KEYS } from '@/config/constants'
import { safeParseFloat, roundMoney, displayRate } from '@/shared/utils/safe-math'
import { generateId } from '@/shared/utils/validation'
import { loadJSON, saveJSON, loadString, saveString } from '@/shared/cache/local-storage-io'
import { getTodayStr, getNowStr, getPreviousNTradingDay, getTradingDayFromToday } from '@/modules/fund/valuation/cn-trading-day'

/** 持仓数据版本号 - 结构变更时递增，触发自动迁移 */
const HOLDINGS_DATA_VERSION = 4

/** 待确认操作的最大**实际尝试**次数（按不同日期计，同日多次刷新只算一次）。
 *  超过仍取不到确认净值即置 Failed，避免因基金停牌/长期延迟披露/交易日历偏差
 *  导致计划永久悬挂在 Pending。
 *  ⚠️ 按"尝试次数"而非"自然日历"计：纯前端应用关掉页面即无代码运行，
 *  用户长期不开 app 时日历会空转，按日历判会误杀本可正常成交的计划。 */
const MAX_PENDING_ATTEMPTS = 10

export const useHoldingStore = defineStore('holding', () => {
  // ===== 基础状态 =====
  /** 所有持仓列表 */
  const holdings = ref<Holding[]>([])
  /** 持仓操作日志 */
  const actions = ref<HoldingAction[]>([])
  /** T+1 待确认操作列表 */
  const pendingActions = ref<PendingAction[]>([])
  /** 是否已从 localStorage 恢复完成。
   *  ⚠️ 落盘兜底（flushAllPersist / persistHoldings）的覆盖守卫：版本检查器强制刷新可能在
   *  restoreHoldings() 完成前触发 beforeunload，此时内存 holdings 还是初始空数组，若直接落盘会
   *  把空数组写入 HOLDINGS 覆盖盘上真实持仓——用户录入的基金持仓就此丢失。restore 完成前置此标记
   *  为 false，所有写盘入口见之即跳过；宁可丢这一轮兜底，也不让空内存覆盖好数据。 */
  let restored = false

  // ===== 计算属性 =====
  /** 活跃持仓（未结算） */
  const activeHoldings = computed(() => holdings.value.filter(h => !h.settled))
  /** 已结算持仓 */
  const settledHoldings = computed(() => holdings.value.filter(h => h.settled))
  /** 待执行的 pending 操作 */
  const pendingOnly = computed(() =>
    pendingActions.value.filter(a => a.status === PendingActionStatus.Pending),
  )
  /** 待执行 + 已失效（超期未成交）——UI 计划列表用：Failed 必须可见，
   *  否则用户不知道计划没入账；用户手动取消后才消失。 */
  const pendingOrFailed = computed(() =>
    pendingActions.value.filter(a =>
      a.status === PendingActionStatus.Pending || a.status === PendingActionStatus.Failed,
    ),
  )
  /** 活跃持仓按 fundCode 分组索引——派生自 activeHoldings（依赖 holdings ref），
   *  holdings 增删/结算翻转时 computed 自动失效重算，无需手动同步写入点。
   *  各按基金查询方法改读此索引，消除「每只基金一次 activeHoldings.filter 全表扫描」的 O(n×m)：
   *  列表渲染时 N 只基金 × M 笔持仓，旧实现每只基金多次 filter 全表，刷新一次为 O(n²) 级。 */
  const holdingsByFund = computed(() => {
    const m = new Map<string, Holding[]>()
    for (const h of activeHoldings.value) {
      const arr = m.get(h.fundCode)
      if (arr) arr.push(h)
      else m.set(h.fundCode, [h])
    }
    return m
  })

  // ===== 查询 =====
  function getPendingByFund(fundCode: string): PendingAction[] {
    return pendingOrFailed.value.filter(a => a.fundCode === fundCode)
  }
  function getHoldingsByFund(fundCode: string): Holding[] {
    return holdingsByFund.value.get(fundCode) ?? []
  }
  function getTotalShares(fundCode: string): number {
    const list = holdingsByFund.value.get(fundCode)
    if (!list) return 0
    let sum = 0
    for (const h of list) sum += h.shares
    return sum
  }
  function getAvgCostPrice(fundCode: string): number {
    const list = holdingsByFund.value.get(fundCode)
    if (!list || list.length === 0) return 0
    let totalCost = 0, totalShares = 0
    for (const h of list) { totalCost += h.shares * h.costPrice; totalShares += h.shares }
    return totalShares > 0 ? totalCost / totalShares : 0
  }
  function getPrincipal(fundCode: string): number {
    const list = holdingsByFund.value.get(fundCode)
    if (!list) return 0
    let sum = 0
    for (const h of list) sum += h.initialAmount ?? h.shares * h.costPrice
    return sum
  }

  // ===== 涨跌幅驱动计算 =====
  /** 取显示精度涨跌幅（截 2 位）—— 方案甲唯一数据源 */
  function displayRateSafe(gszzl?: number | null): number {
    if (gszzl == null || !Number.isFinite(gszzl)) return 0
    return displayRate(gszzl)
  }

  /** 昨日持有金额 = 各持仓笔 yesterdayAmount 之和 */
  function getYesterdayHoldingAmount(fundCode: string): number {
    const list = holdingsByFund.value.get(fundCode)
    if (!list) return 0
    let sum = 0
    for (const h of list) sum += h.yesterdayAmount ?? h.initialAmount ?? h.shares * h.costPrice
    return sum
  }

  /** 持有金额 = 昨日持有金额（仅含已确认数据），估算时不含当日涨跌 */
  function getFundHoldingAmount(fundCode: string, _dwjz?: number, _gszzl?: number, _isEstimated?: boolean): number {
    const base = getYesterdayHoldingAmount(fundCode)
    // syncYesterdayAmounts 尚未运行（新持仓 confirmedBaseAmount 全 0），用涨跌幅直接算
    if (_isEstimated === false && _gszzl && _gszzl !== 0) {
      const list = holdingsByFund.value.get(fundCode) ?? []
      let totalConfirmedBase = 0
      for (const h of list) totalConfirmedBase += h.confirmedBaseAmount ?? 0
      if (totalConfirmedBase === 0) {
        return roundMoney(base * (1 + displayRateSafe(_gszzl) / 100))
      }
    }
    return base
  }

  /** 累计收益 = 持有金额 - 投入本金 */
  function getFundAccumulatedProfit(fundCode: string, _dwjz?: number, _gszzl?: number, _isEstimated?: boolean): number {
    return roundMoney(getFundHoldingAmount(fundCode, _dwjz, _gszzl, _isEstimated) - getPrincipal(fundCode))
  }

  /** 当前展示的 gszzl（今日涨跌幅）属于哪一个交易日。
   *  用于把「按该日净值刚成交的份额」排除出今日收益基数（见 calcFundTodayProfit）。
   *    - 已确认（isEstimated=false）：gszzl 就是 jzrq 那天的真实涨跌 → 取 jzrq
   *    - 未确认（盘中估算）：gszzl 是今天的预估涨跌 → 取今天
   *  各调用点统一走此函数，避免口径分裂。 */
  function resolveGszzlDate(v?: { isEstimated?: boolean; jzrq?: string }): string {
    if (v?.isEstimated === false && v.jzrq) return v.jzrq
    return getTodayStr()
  }

  /** 今日收益基数：参与「今日涨跌」的持有金额合计。
   *  排除 entryNavDate >= gszzlDate 的持仓——按该日净值刚成交的份额，其买入价已是该日收盘价，
   *  该日涨跌与它无关。今日收益（分子）与今日收益率分母共用此函数，保证口径不分裂。 */
  function getTodayProfitBase(fundCode: string, gszzlDate?: string): number {
    const list = holdingsByFund.value.get(fundCode) ?? []
    let confirmedBase = 0
    let fallbackBase = 0
    for (const h of list) {
      if (gszzlDate && h.entryNavDate && h.entryNavDate >= gszzlDate) continue
      confirmedBase += h.confirmedBaseAmount ?? 0
      fallbackBase += h.yesterdayAmount ?? h.initialAmount ?? h.shares * h.costPrice
    }
    return confirmedBase > 0 ? confirmedBase : fallbackBase
  }

  /** 今日收益 = 基数金额 × 涨跌幅/100。
   *  基数用 confirmedBaseAmount（基金更新前的持有金额快照），不受 syncYesterdayAmounts 推进
   *  yesterdayAmount 的影响——持有数据基金更新后会变，今日收益始终基于更新前的基数计算。
   *  confirmedBaseAmount 为 0（新持仓尚未 sync）时兜底 yesterdayAmount。
   *
   *  ⚠️ 今日收益只由「涨跌」产生，不由「加减仓」产生：
   *  按 D 日确认净值成交的份额，已经以 D 日收盘价入账——D 日当天那段涨幅发生在买入之前，
   *  与这笔钱无关。若不排除，加仓当天会凭空多出一笔今日收益（¥100 按当日 +2% 的收盘净值买入，
   *  却显示今日赚了 2 元），且金额越大越离谱。故 entryNavDate >= 当前涨跌所属日的持仓不计入基数。
   *  gszzlDate 缺省时（调用方未传）退化为原行为，不影响历史调用点。 */
  function calcFundTodayProfit(fundCode: string, _changeRate: number, _dwjz?: number, gszzl?: number, _isEstimated?: boolean, gszzlDate?: string): number {
    const base = getTodayProfitBase(fundCode, gszzlDate)
    if (base <= 0) return 0
    return roundMoney(base * displayRateSafe(gszzl) / 100)
  }

  /** 计算累计收益 */
  function calcFundTotalProfit(fundCode: string, _todayProfit: number = 0, _dwjz?: number, gszzl?: number, isEstimated?: boolean): number {
    return getFundAccumulatedProfit(fundCode, _dwjz, gszzl, isEstimated)
  }

  /** 盈亏状态 */
  function getProfitStatus(fundCode: string): ProfitStatus {
    const profit = getFundAccumulatedProfit(fundCode)
    if (profit > 0) return ProfitStatus.Profit
    if (profit < 0) return ProfitStatus.Loss
    return ProfitStatus.BreakEven
  }

  /** 仪表盘统计 */
  function getDashboardStats(
    valuationMap: Map<string, { gz: number; dwjz: number; gszzl: number; isEstimated?: boolean; jzrq?: string; delayDays?: 1 | 2 }>,
  ): DashboardStats {
    let totalHoldingAmount = 0, totalProfit = 0, totalCost = 0, todayProfitSum = 0, totalYesterdayAmount = 0
    const fundCodes = new Set(activeHoldings.value.map(h => h.fundCode))
    for (const code of fundCodes) {
      const v = valuationMap.get(code)
      // getPrincipal 复用：旧实现此循环内调了两次 getPrincipal（加 totalCost、算 totalProfit），
      // 各扫一遍持仓。提为局部变量调一次，口径不变。
      const principal = getPrincipal(code)
      totalCost += principal
      const baseAmount = getFundHoldingAmount(code, v?.dwjz, v?.gszzl, v?.isEstimated)
      const gszzlDate = resolveGszzlDate(v)
      const todayProfit = calcFundTodayProfit(code, 0, v?.dwjz, v?.gszzl, v?.isEstimated, gszzlDate)
      totalHoldingAmount += baseAmount
      totalProfit += roundMoney(baseAmount - principal)
      todayProfitSum += todayProfit
      // 今日收益率的分母必须与分子基数同口径：当日刚成交的份额不产生今日收益，
      // 也不该计入分母，否则新加仓当天会把收益率稀释（分子不含、分母含）。
      totalYesterdayAmount += getTodayProfitBase(code, gszzlDate)
    }
    const overallChangeRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0
    const todayReturnRate = totalYesterdayAmount > 0 ? (todayProfitSum / totalYesterdayAmount) * 100 : 0
    return {
      totalHoldingAmount: roundMoney(totalHoldingAmount),
      todayProfit: roundMoney(todayProfitSum),
      totalProfit: roundMoney(totalProfit),
      overallChangeRate: safeParseFloat(displayRate(overallChangeRate)),
      totalCost: roundMoney(totalCost),
      todayReturnRate: safeParseFloat(displayRate(todayReturnRate)),
    }
  }

  // ===== 持仓操作 =====
  /** 加仓 - 输入金额，自动算份额和成本价。
   *  @param navDate 成交净值所属日期（结算路径传 executedNavDate）。传入后该笔份额
   *    在「涨跌所属日 <= navDate」期间不计入今日收益基数——按 D 日收盘净值买入的钱，
   *    不该享受 D 日当天的涨幅（那段涨跌发生在买入之前）。 */
  function addHoldingByAmount(fundCode: string, amount: number, netValue: number, note?: string, navDate?: string): Holding {
    const shares = netValue > 0 ? amount / netValue : 0
    const holding: Holding = {
      id: generateId(), fundCode, shares, costPrice: netValue,
      // 持仓日期取成交净值日期（有则用），而非落库时刻：结算可能延迟发生
      // （用户几天没开 app，08-04 的计划到 08-06 才补执行），此时 getNowStr() 是 08-06，
      // 而钱实际按 08-04 净值买入、从 08-04 起就在涨跌。recalibrateHoldingsFromNav 以
      // holdingDate 为累乘起点，用落库时刻会白丢 08-05/08-06 两天收益。
      holdingDate: navDate || getNowStr(), createdAt: Date.now(), settled: false,
      initialAmount: amount, yesterdayAmount: amount,
      entryNavDate: navDate,
    }
    holdings.value.push(holding)
    logAction({ id: generateId(), fundCode, type: HoldingActionType.Add, sharesBefore: 0, sharesAfter: shares, costBefore: 0, costAfter: netValue, timestamp: Date.now(), note })
    persistHoldings()
    return holding
  }

  /** 直接创建持仓 - 指定份额和成本价（持有金额/累计盈亏由涨跌幅驱动，录入即冻结为基准） */
  function addHoldingDirect(
    fundCode: string, shares: number, costPrice: number,
    _holdingAmtFromUser?: number, _profitFromUser?: number,
    valuation?: { gszzl?: number; isEstimated?: boolean; jzrq?: string },
  ): Holding {
    const holdingAmt = _holdingAmtFromUser ?? (shares * costPrice)
    const profit = _profitFromUser ?? 0
    const initialAmount = holdingAmt - profit
    // 录入即冻结：用户输入的持有金额直接作为昨收基准，不按当日 gszzl 反推
    const yesterdayAmount = holdingAmt
    const holding: Holding = {
      id: generateId(), fundCode, shares, costPrice,
      holdingDate: getNowStr(), createdAt: Date.now(), settled: false,
      initialAmount, yesterdayAmount,
      // 未传 jzrq 时留空：syncYesterdayAmounts 迁移分支会用真实 v.jzrq 正确填，
      // 并基于 principal 算 yesterdayAmount。绝不用 getNowStr()（带时分秒）——
      // 它会让守卫2/3 的字符串比较（jzrq 纯日期 vs 带时分秒）永远判定跳过，导致今日收益永不累计。
      lastConfirmedDate: valuation?.jzrq || undefined,
      confirmedBaseAmount: yesterdayAmount,
    }
    holdings.value.push(holding)
    logAction({ id: generateId(), fundCode, type: HoldingActionType.Edit, sharesBefore: 0, sharesAfter: shares, costBefore: 0, costAfter: costPrice, timestamp: Date.now() })
    persistHoldings()
    return holding
  }

  /** 减仓 - 减少份额，按比例缩放 yesterdayAmount */
  function reduceHolding(holdingId: string, reduceShares: number, note?: string): boolean {
    const idx = holdings.value.findIndex(h => h.id === holdingId)
    if (idx === -1) return false
    const holding = holdings.value[idx]
    if (reduceShares >= holding.shares) return settleHolding(holdingId, note)
    const sharesBefore = holding.shares, costBefore = holding.costPrice
    const ratio = (holding.shares - reduceShares) / holding.shares
    holding.shares = safeParseFloat(holding.shares - reduceShares)
    if (holding.initialAmount != null) holding.initialAmount = holding.initialAmount * ratio
    if (holding.yesterdayAmount != null) holding.yesterdayAmount = holding.yesterdayAmount * ratio
    logAction({ id: generateId(), fundCode: holding.fundCode, type: HoldingActionType.Reduce, sharesBefore, sharesAfter: holding.shares, costBefore, costAfter: holding.costPrice, timestamp: Date.now(), note })
    persistHoldings()
    return true
  }

  /** 编辑持仓 - 修改份额和成本价，更新 yesterdayAmount */
  function editHolding(holdingId: string, newShares: number, newCostPrice: number, _newHoldingAmount?: number, _newAccumulatedProfit?: number, _newYesterdayHoldingAmount?: number, _yesterdayAmount?: number): boolean {
    const holding = holdings.value.find(h => h.id === holdingId)
    if (!holding) return false
    const sharesBefore = holding.shares, costBefore = holding.costPrice
    holding.shares = newShares
    holding.costPrice = newCostPrice
    const holdingAmt = _yesterdayAmount ?? (newShares * newCostPrice)
    const profit = _newAccumulatedProfit ?? 0
    holding.yesterdayAmount = holdingAmt
    holding.initialAmount = _yesterdayAmount != null ? holdingAmt - profit : (newShares * newCostPrice)
    logAction({ id: generateId(), fundCode: holding.fundCode, type: HoldingActionType.Edit, sharesBefore, sharesAfter: newShares, costBefore, costAfter: newCostPrice, timestamp: Date.now() })
    persistHoldings()
    return true
  }

  /** 结算持仓 - 清仓标记已结算 */
  function settleHolding(holdingId: string, note?: string): boolean {
    const holding = holdings.value.find(h => h.id === holdingId)
    if (!holding) return false
    const sharesBefore = holding.shares, costBefore = holding.costPrice
    holding.settled = true
    holding.shares = 0
    logAction({ id: generateId(), fundCode: holding.fundCode, type: HoldingActionType.Settle, sharesBefore, sharesAfter: 0, costBefore, costAfter: 0, timestamp: Date.now(), note })
    immediatePersistHoldings()
    return true
  }

  /** 批量结算指定基金的所有持仓 */
  function settleAllByFund(fundCode: string): void {
    for (const h of holdings.value) {
      if (h.fundCode === fundCode && !h.settled) settleHolding(h.id)
    }
  }

  /** 移除指定基金的所有持仓数据 */
  function removeHoldingsByFund(fundCode: string): void {
    holdings.value = holdings.value.filter(h => h.fundCode !== fundCode)
    actions.value = actions.value.filter(a => a.fundCode !== fundCode)
    pendingActions.value = pendingActions.value.filter(a => a.fundCode !== fundCode)
    immediatePersistHoldings(); persistActions(); persistPendingActions()
  }

  /** 清空所有持仓和日志 */
  function clearAllHoldings(): void {
    holdings.value = []; actions.value = []; pendingActions.value = []
    immediatePersistHoldings(); persistActions(); persistPendingActions()
  }

  // ===== T+1 待确认操作 =====
  /** 计划确认日 = 从今天起第 (delayDays - 1) 个交易日。
   *  口径：T+1 当天提交 → 按**当天**净值确认（当晚净值一公布即入账）；
   *        T+2 当天提交 → 按**下一交易日**净值确认。
   *  ⚠️ 不用 getNextNTradingDay(delayDays)：那会整整多推一天（T+1 变成次日确认），
   *     导致钱比预期晚一个交易日入账。当日提交不区分 15:00 前后，一律按当日处理。 */
  function resolveScheduledDate(delayDays: number): string {
    return getTradingDayFromToday(Math.max(0, delayDays - 1))
  }

  function createPendingAdd(fundCode: string, amount: number, referenceNav: number, delayDays: number = 1, note?: string): PendingAction {
    const action: PendingAction = {
      id: generateId(), fundCode, type: 'add', amount, referenceNav,
      scheduledDate: resolveScheduledDate(delayDays), operateTime: Date.now(),
      status: PendingActionStatus.Pending, note, createdAt: Date.now(),
    }
    pendingActions.value.push(action)
    persistPendingActions()
    return action
  }
  function createPendingReduce(fundCode: string, reduceShares: number, referenceNav: number, delayDays: number = 1, note?: string): PendingAction {
    const action: PendingAction = {
      id: generateId(), fundCode, type: 'reduce', amount: reduceShares, referenceNav,
      scheduledDate: resolveScheduledDate(delayDays), operateTime: Date.now(),
      status: PendingActionStatus.Pending, note, createdAt: Date.now(),
    }
    pendingActions.value.push(action)
    persistPendingActions()
    return action
  }
  /** 取消计划。Pending（尚未成交）与 Failed（超期未能自动入账）均可取消——
   *  Failed 已不会再自动执行，允许用户清理掉，否则会永远挂在列表里。 */
  function cancelPendingAction(actionId: string): boolean {
    const action = pendingActions.value.find(a => a.id === actionId)
    if (!action) return false
    if (action.status !== PendingActionStatus.Pending && action.status !== PendingActionStatus.Failed) return false
    action.status = PendingActionStatus.Cancelled
    persistPendingActions()
    return true
  }
  /** 执行到期的待确认操作（确认净值后自动应用）。
   *  判定基准：v.jzrq >= action.scheduledDate（计划日的确认净值已出），与 T+1/T+2 无关。
   *  ⚠️ 不看 v.isEstimated：那是「今天」是否确认，与「计划日确认数据是否已出」是不同日期维度。
   *    T+1 基金盘中今天永远 isEstimated=true，若卡此守卫会导致 scheduledDate 在今天之前的计划
   *    盘中永远执行不了，得等到次日净值确认后才能补执行。
   *  执行净值：取 [scheduledDate, today] 区间内「首个 date >= scheduledDate」的确认净值。
   *    ⚠️ 不用严格等于 scheduledDate：scheduledDate 由 A股交易日历（getNextNTradingDay）推算，
   *    而 QDII/T+2 的披露日跟随海外市场、基金可能停牌或延迟披露、A股节假日表还是硬编码（2027+ 为空），
   *    严格相等取不到时旧实现会 continue 到天荒地老——计划永久悬挂，钱既不入账也无任何提示。
   *    顺延取首个可用净值符合实际申购确认规则（按下一个可确认交易日成交）。
   *  超期保护：距 scheduledDate 超过 MAX_PENDING_WAIT_TRADING_DAYS 个交易日仍取不到净值，
   *    置 Failed 并记录原因，交 UI 提示用户手动处理，不再无限重试。 */
  async function executePendingActions(valuationMap: Map<string, FundValuation>): Promise<void> {
    const today = getTodayStr()
    let changed = false
    const { fetchFundNetValueRange } = await import('@/modules/fund/valuation/net-value-range')
    for (const action of pendingActions.value) {
      if (action.status !== PendingActionStatus.Pending) continue
      if (action.scheduledDate > today) continue
      const v = valuationMap.get(action.fundCode)
      // 计划日确认净值尚未出 → 等下次（未超期时）
      const navNotReady = !v || !v.jzrq || v.jzrq < action.scheduledDate
      if (navNotReady) {
        if (markFailedIfExpired(action, '计划日确认净值长时间未公布')) changed = true
        continue
      }
      // 取 scheduledDate 起首个已公布的确认净值执行（停牌/延迟披露时顺延）
      let confirmedNav = 0
      let navDate = ''
      try {
        const rows = await fetchFundNetValueRange(action.fundCode, action.scheduledDate, today)
        // rows 升序，首个 date >= scheduledDate 即为该计划应成交的净值
        const row = rows.find(r => r.date >= action.scheduledDate && r.nav > 0)
        confirmedNav = row?.nav ?? 0
        navDate = row?.date ?? ''
      } catch {
        confirmedNav = 0
      }
      // 净值取不到（停牌/网络失败）→ 等下次；超过最大等待窗口则置 Failed
      if (confirmedNav <= 0) {
        if (markFailedIfExpired(action, '确认净值取数失败或基金长期停牌')) changed = true
        continue
      }
      if (action.type === 'add') {
        // 传 navDate：本笔按该日确认净值成交，该日当天的涨跌不计入今日收益
        addHoldingByAmount(action.fundCode, action.amount, confirmedNav, action.note, navDate || action.scheduledDate)
        changed = true
      } else {
        // 跨笔扣减：同一基金多次加仓会产生多笔 Holding，旧实现只对 list[0] 减仓，
        // 且 reduceHolding 在 reduceShares >= 该笔份额时会整笔 settle，剩余待减份额被静默吞掉。
        const reduced = reduceSharesAcrossHoldings(action.fundCode, action.amount, action.note)
        if (reduced > 0) changed = true
      }
      action.status = PendingActionStatus.Executed
      action.executedNav = confirmedNav
      action.executedNavDate = navDate
      action.executedAt = Date.now()
      // 成交后清掉重试计数（该计划已终态，留着无意义且会干扰调试）
      action.attemptCount = undefined
      action.lastAttemptDate = undefined
    }
    if (changed) persistPendingActions()
  }

  /** 超期判定：**实际尝试**过 MAX_PENDING_ATTEMPTS 个不同日期仍未成交 → 置 Failed。
   *
   *  ⚠️ 不能只按自然日历判（旧实现 `today > scheduledDate + N 个交易日`）：
   *  本项目是纯前端应用，无 Service Worker/后台同步，关掉页面就没有任何代码在跑。
   *  用户出差两周没开 app，回来第一次打开时日历早已越过窗口——`executePendingActions`
   *  第一轮就把一个**本来能正常成交**的计划直接判 Failed，该入账的钱变成一条红色「未成交」。
   *  改为累计「确实尝试过取数并失败」的天数：同日多次刷新只计一次，没打开 app 的日子不计。
   *
   *  ⚠️ 计划日当天不计入尝试：T+1 的 scheduledDate 就是提交当天，当天净值本来就要等到晚上才公布，
   *  这属于**正常等待**而非「重试失败」。若计入，用户刚提交就会看到「已重试 1 次」，非常困惑。
   *  只有等到计划日之后仍取不到净值，才是真的异常，才开始累计。
   *
   *  @returns 是否发生了状态变更（调用方据此决定落盘） */
  function markFailedIfExpired(action: PendingAction, reason: string): boolean {
    const today = getTodayStr()
    // 计划日当天（及之前）取不到净值属正常等待，不计尝试、不提示
    if (today <= action.scheduledDate) return false
    // 同一天内重复刷新只累计一次尝试
    if (action.lastAttemptDate === today) return false
    action.lastAttemptDate = today
    action.attemptCount = (action.attemptCount ?? 0) + 1
    if (action.attemptCount < MAX_PENDING_ATTEMPTS) return true  // 记录了尝试，需落盘
    action.status = PendingActionStatus.Failed
    action.failedReason = reason
    return true
  }

  /** 按持仓创建顺序跨笔扣减份额，返回实际扣减的份额总数。
   *  逐笔扣至耗尽：单笔不足时整笔结算再继续扣下一笔，避免旧实现「只减第一笔、超出部分丢失」。 */
  function reduceSharesAcrossHoldings(fundCode: string, reduceShares: number, note?: string): number {
    let remaining = reduceShares
    let reduced = 0
    // 复制一份：reduceHolding/settleHolding 会改动 holdings，遍历中不可直接用响应式数组
    const list = [...getHoldingsByFund(fundCode)].sort((a, b) => a.createdAt - b.createdAt)
    for (const h of list) {
      if (remaining <= 0) break
      const take = Math.min(remaining, h.shares)
      if (take <= 0) continue
      if (take >= h.shares) {
        settleHolding(h.id, note)
      } else {
        reduceHolding(h.id, take, note)
      }
      remaining = safeParseFloat(remaining - take)
      reduced += take
    }
    return reduced
  }

  // ===== 昨日金额同步（净值确认后推进） =====
  /** 同步昨日持有金额 - 净值确认后按官方公布涨跌幅（2位）推进 yesterdayAmount */
  function syncYesterdayAmounts(valuationMap: Map<string, FundValuation>): void {
    let changed = false
    for (const h of activeHoldings.value) {
      const v = valuationMap.get(h.fundCode)
      if (!v || v.dwjz <= 0) continue
      // 旧数据迁移：无 lastConfirmedDate（升版本号清空带时分秒污染值，或录入时未传 jzrq）
      // 保留现有 yesterdayAmount 作基准（不基于 principal 重算，避免丢历史累计收益），
      // 只补 lastConfirmedDate 让后续单日推进正常跑。yesterdayAmount 无效时才用 principal 兜底。
      if (!h.lastConfirmedDate) {
        const principal = h.initialAmount ?? roundMoney(h.shares * h.costPrice)
        const existingAmount = (h.yesterdayAmount != null && h.yesterdayAmount > 0) ? h.yesterdayAmount : null
        const base = existingAmount ?? principal
        h.confirmedBaseAmount = base
        if (existingAmount == null) h.yesterdayAmount = base
        h.lastConfirmedDate = v.jzrq || ''
        changed = true
        continue
      }
      // 正常更新：仅确认态 + 有新净值日期
      if (v.isEstimated !== false) continue
      if (!v.jzrq || v.jzrq <= h.lastConfirmedDate) continue
      // 漏日检测：跨多交易日交由 replayGappedHoldings
      const prevTdOfJzrq = getPreviousNTradingDay(1, dayjs(v.jzrq))
      if (h.lastConfirmedDate !== prevTdOfJzrq) continue
      // 单日推进
      const oldAmount = h.yesterdayAmount ?? h.initialAmount ?? h.shares * h.costPrice
      h.confirmedBaseAmount = oldAmount
      h.yesterdayAmount = roundMoney(oldAmount * (1 + displayRateSafe(v.gszzl) / 100))
      h.lastConfirmedDate = v.jzrq
      changed = true
    }
    if (changed) immediatePersistHoldings()
  }

  /** 漏日回放：跨多个交易日时，从历史净值逐日回放到最新确认日 */
  async function replayGappedHoldings(valuationMap: Map<string, FundValuation>): Promise<void> {
    const targets: { h: Holding; v: FundValuation; baseDate: string }[] = []
    for (const h of activeHoldings.value) {
      const v = valuationMap.get(h.fundCode)
      if (!v || v.dwjz <= 0) continue
      if (v.isEstimated !== false) continue
      if (!h.lastConfirmedDate) continue
      if (!v.jzrq || v.jzrq <= h.lastConfirmedDate) continue
      const prevTdOfJzrq = getPreviousNTradingDay(1, dayjs(v.jzrq))
      if (h.lastConfirmedDate === prevTdOfJzrq) continue
      targets.push({ h, v, baseDate: h.lastConfirmedDate })
    }
    if (targets.length === 0) return
    const { fetchFundNetValueRange } = await import('@/modules/fund/valuation/net-value-range')
    let changed = false
    for (const { h, v, baseDate } of targets) {
      try {
        const rows = await fetchFundNetValueRange(h.fundCode, baseDate, v.jzrq!)
        if (rows.length < 2) continue
        const startIdx = rows[0].date <= baseDate ? 1 : 0
        const oldAmount = h.yesterdayAmount ?? h.initialAmount ?? h.shares * h.costPrice
        let base = oldAmount
        for (let i = startIdx; i < rows.length - 1; i++) {
          const rate = resolveGrowth(rows[i], rows[i - 1])
          base = roundMoney(base * (1 + rate / 100))
        }
        h.confirmedBaseAmount = base
        const lastIdx = rows.length - 1
        const lastRate = resolveGrowth(rows[lastIdx], rows[lastIdx - 1])
        h.yesterdayAmount = roundMoney(base * (1 + lastRate / 100))
        h.lastConfirmedDate = v.jzrq
        changed = true
      } catch {
        const oldAmount = h.yesterdayAmount ?? h.initialAmount ?? h.shares * h.costPrice
        h.confirmedBaseAmount = oldAmount
        h.yesterdayAmount = roundMoney(oldAmount * (1 + displayRateSafe(v.gszzl) / 100))
        h.lastConfirmedDate = v.jzrq
        changed = true
      }
    }
    if (changed) immediatePersistHoldings()
  }

  // ===== 全量重算自愈（A+B3 兜底） =====
  /** 用历史净值全量重算各持仓累计金额，补齐所有错过的交易日收益。
   *  启动/跨日重建/从后台恢复可见性时调用一次——增量推进（syncYesterdayAmounts/replayGappedHoldings）
   *  只在前台跑，错过的交易日无法补齐，本方法用 pingzhongdata 净值序列从 holdingDate 起全量累乘，
   *  一次性把 yesterdayAmount/lastConfirmedDate/confirmedBaseAmount 校准到「最新已确认净值」口径。
   *
   *  口径与 replayGappedHoldings 一致（amount × (1 + rate/100)），不改变展示规则：
   *    - 今日收益仍由 calcFundTodayProfit 独立计算（基于 confirmedBaseAmount 快照）；
   *    - 本方法只校准 yesterdayAmount 等「已确认累计」字段，不碰今日估算口径。
   *  容错：单只取数失败/序列不足 → 跳过该基金（保留原值，交增量推进兜底），不影响其它基金。 */
  async function recalibrateHoldingsFromNav(): Promise<void> {
    const active = activeHoldings.value
    if (active.length === 0) return
    // 按基金分组，每只基金只拉一次净值序列
    const byFund = new Map<string, typeof active>()
    for (const h of active) {
      const arr = byFund.get(h.fundCode) ?? []
      arr.push(h)
      byFund.set(h.fundCode, arr)
    }
    const { computeAccumulatedAmountFromRatesWithDate } = await import(
      '@/modules/fund/valuation/accumulated-amount'
    )
    let changed = false
    // 按基金分组后逐笔重算：同一基金多笔会各自拉一次 pingzhongdata.js。
    // 该 js 带 rt 时间戳，同一轮并发请求命中浏览器/CDN 缓存，重复拉取开销可接受；
    // 重算仅在启动/跨日/恢复可见性时触发，非高频路径，正确性优先于省流。
    await Promise.all(Array.from(byFund.entries()).map(async ([, list]) => {
      try {
        const results = await Promise.all(list.map(async (h) => {
          const principal = h.initialAmount ?? roundMoney(h.shares * h.costPrice)
          if (principal <= 0) return null
          return computeAccumulatedAmountFromRatesWithDate(h.fundCode, h.holdingDate, principal)
        }))
        list.forEach((h, i) => {
          const r = results[i]
          if (!r || !Number.isFinite(r.amount) || r.amount <= 0) return
          // 取数失败回退 amount=initialAmount：若等于本金且原 yesterdayAmount 已有累计值，不覆盖（避免把已有累计抹掉）
          const principal = h.initialAmount ?? roundMoney(h.shares * h.costPrice)
          if (r.amount === principal && h.yesterdayAmount != null && h.yesterdayAmount > 0 && h.yesterdayAmount !== principal) {
            return
          }
          if (r.lastConfirmedDate && r.lastConfirmedDate > (h.lastConfirmedDate ?? '')) {
            h.lastConfirmedDate = r.lastConfirmedDate
            changed = true
          }
          if (Math.abs((h.yesterdayAmount ?? 0) - r.amount) > 0.005) {
            h.confirmedBaseAmount = h.yesterdayAmount ?? r.amount
            h.yesterdayAmount = r.amount
            changed = true
          }
        })
      } catch { /* 单只失败不影响其它，静默 */ }
    }))
    if (changed) immediatePersistHoldings()
  }

  /** 从 lsjz 行取涨跌幅：优先 growth，缺失用前一行净值自算 */
  function resolveGrowth(row: { growth: number | null; nav: number }, prevRow: { nav: number } | undefined): number {
    if (Number.isFinite(row.growth)) return displayRateSafe(row.growth)
    if (prevRow && prevRow.nav > 0) return displayRateSafe((row.nav - prevRow.nav) / prevRow.nav * 100)
    return 0
  }

  // ===== 操作日志 =====
  function logAction(action: HoldingAction): void {
    actions.value.push(action)
    persistActions()
  }
  function getActionsByFund(fundCode: string): HoldingAction[] {
    return actions.value.filter(a => a.fundCode === fundCode)
  }

  // ===== 持久化（防抖 + 兜底） =====
  let persistHoldingsTimer: ReturnType<typeof setTimeout> | null = null
  function persistHoldings(): void {
    // 恢复未完成时跳过：避免空 holdings 被防抖定时器写入覆盖盘上真实持仓
    if (!restored) return
    if (persistHoldingsTimer) clearTimeout(persistHoldingsTimer)
    persistHoldingsTimer = setTimeout(() => {
      saveJSON(STORAGE_KEYS.HOLDINGS, holdings.value)
      persistHoldingsTimer = null
    }, 2000)
  }
  function immediatePersistHoldings(): void {
    if (persistHoldingsTimer) { clearTimeout(persistHoldingsTimer); persistHoldingsTimer = null }
    saveJSON(STORAGE_KEYS.HOLDINGS, holdings.value)
  }
  function persistActions(): void {
    if (actions.value.length > 100) actions.value = actions.value.slice(-100)
    saveJSON(STORAGE_KEYS.HOLDING_ACTIONS, actions.value)
  }
  function persistPendingActions(): void {
    saveJSON(STORAGE_KEYS.PENDING_ACTIONS, pendingActions.value)
  }

  // ===== 恢复 =====
  function restoreHoldings(): void {
    const storedVersion = loadString(STORAGE_KEYS.HOLDINGS_VERSION)
    const needsMigration = !storedVersion || parseInt(storedVersion) < HOLDINGS_DATA_VERSION
    const list = loadJSON<Holding[] | null>(STORAGE_KEYS.HOLDINGS, null)
    if (!Array.isArray(list)) return
    for (const h of list) {
      if (!h.settled) {
        if (needsMigration) {
          h.lastConfirmedDate = undefined
          h.confirmedBaseAmount = undefined
        }
        if (h.yesterdayAmount == null || h.yesterdayAmount <= 0) {
          h.yesterdayAmount = h.initialAmount ?? roundMoney(h.shares * h.costPrice)
        }
        if (h.initialAmount == null || h.initialAmount <= 0) {
          h.initialAmount = roundMoney(h.shares * h.costPrice)
        }
      }
    }
    holdings.value = list
    saveString(STORAGE_KEYS.HOLDINGS_VERSION, String(HOLDINGS_DATA_VERSION))
  }
  function restoreActions(): void {
    actions.value = loadJSON<HoldingAction[]>(STORAGE_KEYS.HOLDING_ACTIONS, [])
  }
  function restorePendingActions(): void {
    const all = loadJSON<PendingAction[]>(STORAGE_KEYS.PENDING_ACTIONS, [])
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    pendingActions.value = all.filter(a =>
      a.status === PendingActionStatus.Pending ||
      // Failed 需保留：这是「计划未能自动入账」的唯一线索，丢掉用户就永远不知道钱去哪了，
      // 由用户在计划列表里手动处理（重新提交/取消）后才消失。
      a.status === PendingActionStatus.Failed ||
      (a.executedAt != null && a.executedAt > cutoff),
    )
    // 三项恢复（holdings/actions/pendingActions）在 fund-bootstrap 内同步连续调用，
    // 本函数总是最后一个完成——此处置 restored=true，确保兜底/防抖落盘守卫在此之后才放行，
    // 避免刷新风暴在恢复中途用空内存覆盖盘上真实数据。
    restored = true
  }

  /** 页面关闭前兜底写入 */
  function flushAllPersist(): void {
    // 恢复未完成时跳过兜底：版本检查刷新风暴可能在此刻打断，空内存一旦落盘即覆盖真实持仓。
    // 宁可丢这一轮兜底（盘上数据仍在），也不让空数组覆盖好数据。
    if (!restored) return
    if (persistHoldingsTimer) { clearTimeout(persistHoldingsTimer); persistHoldingsTimer = null }
    saveJSON(STORAGE_KEYS.HOLDINGS, holdings.value)
    saveJSON(STORAGE_KEYS.HOLDING_ACTIONS, actions.value)
    saveJSON(STORAGE_KEYS.PENDING_ACTIONS, pendingActions.value)
  }

  return {
    holdings, actions, pendingActions, activeHoldings, settledHoldings, pendingOnly, pendingOrFailed,
    getPendingByFund, getHoldingsByFund, getTotalShares, getAvgCostPrice, getPrincipal,
    getYesterdayHoldingAmount, getFundHoldingAmount, getFundAccumulatedProfit,
    calcFundTodayProfit, calcFundTotalProfit, getProfitStatus, getDashboardStats, resolveGszzlDate,
    addHoldingByAmount, addHoldingDirect, reduceHolding, editHolding, settleHolding,
    settleAllByFund, removeHoldingsByFund, clearAllHoldings,
    createPendingAdd, createPendingReduce, cancelPendingAction, executePendingActions,
    syncYesterdayAmounts, replayGappedHoldings, recalibrateHoldingsFromNav,
    logAction, getActionsByFund,
    restoreHoldings, restoreActions, restorePendingActions, persistHoldings, persistPendingActions, flushAllPersist,
  }
})
