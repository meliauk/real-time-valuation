/**
 * 基金估值合并（核心口径）
 *
 * 并发请求 fundgz（盘中估算）+ F10 lsjz（确认净值）+ 基金类型，合并出最终估值。
 *
 * 核心口径（T+1 / T+2 分流 + 确认状态判定）：
 *   - fundgz 提供盘中估算净值 gz 和预估涨跌 gszzl（isEstimated=true）。
 *   - lsjz 提供已确认净值 dwjz 和真实涨跌。
 *   - delayDays：1=国内基金(T+1)，2=QDII/FOF(T+2)，由基金类型判定。
 *   - 确认状态：
 *     · T+1：lsjz.jzrq >= fundgz 日期（或今日）→ 确认数据已出，用真实值覆盖估算。
 *     · T+2：lsjz.jzrq >= 上一交易日 → T+2 确认净值已出（滞后2天），覆盖估算；
 *            否则仅更新确认净值 dwjz/jzrq，保留估算 gszzl/gz，confirmedGszzl 留作成本回算。
 *   - prevConfirmedNav：滞后 delayDays 个交易日的确认净值（T+1=前1日，T+2=前2日），
 *     不随今日确认而前进，失败回退 dwjz。用于"昨日净值"列稳定显示。
 *
 * 两者都失败返回 null。fundgz 失败时仅从 lsjz 填充 dwjz/jzrq，gszzl/gz 设0（不显示过期涨跌）。
 */

import type { FundValuation } from '@/modules/fund/fund-types'
import { FUND_VALUATION_CONFIG } from '@/config/constants'
import { isValidFundCode } from '@/shared/utils/validation'
import { fetchFundgz } from './fundgz-fetch'
import { fetchLsjzRealData, type LsjzRealData } from './lsjz-fetch'
import { detectDelayDays } from './fund-type'
import { getPreviousNTradingDay, getPreviousTradingDay, getTodayStr } from './cn-trading-day'
import type { FundTypeAndName } from '@/modules/fund/catalog/fund-code-catalog'

/** 基金类型+名称取数回调（由 catalog 注入：从基金目录/搜索同时取类型字符串和名称，带缓存） */
export type FundTypeResolver = (fundCode: string) => Promise<FundTypeAndName>

/**
 * 获取基金估值数据（fundgz + lsjz + 类型 三路并发合并）。
 * @param fundCode       基金代码
 * @param getFundType    基金类型+名称取数回调（注入，避免依赖 catalog 循环）
 * @returns 合并后的估值，两者都失败返回 null
 */
export async function getFundValuation(
  fundCode: string,
  getFundType: FundTypeResolver,
): Promise<FundValuation | null> {
  if (!isValidFundCode(fundCode)) return null

  // 三路并发
  const [gzResult, lsjzResult, typeAndName] = await Promise.all([
    fetchFundgz(fundCode),
    fetchLsjzRealData(fundCode),
    getFundType(fundCode),
  ])

  // 两者都失败
  if (!gzResult && !lsjzResult) return null

  // 名称：优先 fundgz(新浪)实时名，空则用目录/搜索兜底名(typeAndName.fundName)。
  //   fundgz 失败（尤其 QDII/T+2 新浪无盘中估值）时 typeAndName.fundName 是唯一真名来源——若不补进
  //   result.name，refreshAllValuations 里 stripPlaceholderName 会把占位符"基金(code)"过滤为空、
  //   不写 fundNameMap，导致清缓存后(FUND_NAMES+FUND_CACHE.fundName 同被删)名称再也恢复不了。
  const fundName = gzResult?.name || typeAndName.fundName || ''
  const delayDays = detectDelayDays(typeAndName.fundType)

  // 构建基础 result：fundgz 成功用估算数据，失败时仅从 lsjz 填充 dwjz/jzrq
  // gszzl/gz 设0：无估算数据时不显示过期涨跌，UI 直接显示0
  const result: FundValuation = gzResult
    ? { ...gzResult, isEstimated: true }
    : {
        fundcode: fundCode,
        name: `基金(${fundCode})`,
        gztime: '',
        gz: 0,
        dwjz: lsjzResult ? lsjzResult.dwjz : 0,
        gszzl: 0,
        jzrq: lsjzResult?.jzrq ?? '',
        isEstimated: true,
      }
  result.delayDays = delayDays
  // 名称兜底：fundgz 失败(占位符)或新浪返回空名时，用算出的 fundName(含目录兜底)覆盖 result.name，
  //   使 stripPlaceholderName 能拿到真名写回 fundNameMap，resolveFundName 也能直接命中。
  if ((!result.name || result.name === `基金(${fundCode})`) && fundName) {
    result.name = fundName
  }

  // 昨日净值：按 delayDays 严格取滞后 N 个交易日的确认净值
  fillPrevConfirmedNav(result, lsjzResult, delayDays)

  // 合并 lsjz 确认数据
  if (lsjzResult) {
    mergeLsjzConfirmation(result, lsjzResult, delayDays)
  }
  return result
}

/** 填充昨日确认净值 prevConfirmedNav/prevConfirmedGszzl（滞后 delayDays 个交易日） */
function fillPrevConfirmedNav(
  result: FundValuation,
  lsjzResult: LsjzRealData | null,
  delayDays: 1 | 2,
): void {
  // T+1=前1个交易日，T+2=前2个交易日
  const cutoffDate = getPreviousNTradingDay(delayDays)
  if (lsjzResult?.recentNavs?.length) {
    const recent = lsjzResult.recentNavs // 升序
    // 找 ≤ cutoffDate 的最新一条
    let idx = -1
    for (let i = recent.length - 1; i >= 0; i--) {
      if (recent[i].date <= cutoffDate) { idx = i; break }
    }
    if (idx >= 0 && recent[idx].nav > 0) {
      result.prevConfirmedNav = recent[idx].nav
      // 配套涨跌：优先官方 growth，缺失自算截2位
      if (Number.isFinite(recent[idx].growth)) {
        result.prevConfirmedGszzl = recent[idx].growth ?? 0
      } else if (idx >= 1 && recent[idx - 1].nav > 0) {
        result.prevConfirmedGszzl = Math.round(((recent[idx].nav - recent[idx - 1].nav) / recent[idx - 1].nav * 100) * 100) / 100
      } else {
        result.prevConfirmedGszzl = 0
      }
      return
    }
  }
  // 回退策略：基金曲线取不到指定日期（cutoffDate）之前的净值时，不回退到最新条 dwjz——
  // 回退会让"今日确认净值"被当成"昨日净值"显示，是会引起错误的策略。
  // 此处留空（undefined），UI「昨日净值」列显示 --，而非用错误日期的数据顶替。
  result.prevConfirmedNav = undefined
  result.prevConfirmedGszzl = undefined
}

/** 合并 lsjz 确认数据：按 delayDays + jzrq 判定确认状态，覆盖或保留估算 */
function mergeLsjzConfirmation(
  result: FundValuation,
  lsjzResult: LsjzRealData,
  delayDays: 1 | 2,
): void {
  if (delayDays === 2) {
    // T+2：lsjz.jzrq >= 上一交易日 → 确认净值已出（滞后2个交易日）
    const prevTradingDay = getPreviousTradingDay()
    if (lsjzResult.jzrq >= prevTradingDay) {
      result.dwjz = lsjzResult.dwjz
      result.gszzl = lsjzResult.gszzl
      result.gz = lsjzResult.gz
      result.jzrq = lsjzResult.jzrq
      result.isEstimated = false
      result.gztime = lsjzResult.jzrq
    } else {
      // T+2 确认数据未出：仅更新确认净值 dwjz/jzrq，保留估算 gszzl/gz
      result.dwjz = lsjzResult.dwjz
      result.jzrq = lsjzResult.jzrq
      result.confirmedGszzl = lsjzResult.gszzl // 留作成本价回算
    }
    // fundgz 有盘中估值时 gszzl/gz 保留；fundgz 失败时 gszzl=0/gz=0
  } else {
    // T+1：判断真实净值是否已出
    //   fundgz 成功时：jzrq >= gzDate → 确认数据已出，覆盖估算
    //   fundgz 失败时：gzDate 为空，用 jzrq >= today 判断当天确认数据是否已出
    const gzDate = result.gztime?.substring(0, 10)
    const today = getTodayStr()
    const isConfirmed = gzDate
      ? lsjzResult.jzrq >= gzDate
      : lsjzResult.jzrq >= today
    if (isConfirmed) {
      result.dwjz = lsjzResult.dwjz
      result.gszzl = lsjzResult.gszzl
      result.gz = lsjzResult.gz
      result.jzrq = lsjzResult.jzrq
      result.isEstimated = false
    } else {
      result.dwjz = lsjzResult.dwjz
      result.jzrq = lsjzResult.jzrq
      result.confirmedGszzl = lsjzResult.gszzl // 留作成本价回算
    }
  }
}

/**
 * 批量获取基金估值（并发池，最多 BATCH_CONCURRENCY 只并发）。
 * @param fundCodes    基金代码列表
 * @param getFundType  基金类型取数回调（注入）
 * @returns Map<fundCode, FundValuation>，失败的基金不入 Map
 */
export async function batchGetValuation(
  fundCodes: string[],
  getFundType: FundTypeResolver,
): Promise<Map<string, FundValuation>> {
  const result = new Map<string, FundValuation>()
  if (fundCodes.length === 0) return result

  const concurrency = FUND_VALUATION_CONFIG.BATCH_CONCURRENCY
  for (let i = 0; i < fundCodes.length; i += concurrency) {
    const batch = fundCodes.slice(i, i + concurrency)
    const settled = await Promise.allSettled(batch.map((code) => getFundValuation(code, getFundType)))
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j]
      if (r.status === 'fulfilled' && r.value) {
        result.set(batch[j], r.value)
      }
    }
  }
  return result
}
