/**
 * fundgz 估值数据校验
 *
 * 天天基金 fundgz 接口返回的原始对象可能字段缺失/类型异常，
 * 校验并修正：fundcode 缺失直接丢弃；name 缺失给默认值；数值字段 safeParseFloat 兜底。
 * 防止脏数据进入估值流程。
 */

import type { FundValuation } from '@/modules/fund/fund-types'
import { safeParseFloat } from '@/shared/utils/safe-math'

/** 校验 fundgz 原始返回 → FundValuation；fundcode 缺失返回 null（丢弃） */
export function validateFundValuation(raw: Partial<FundValuation>): FundValuation | null {
  if (!raw.fundcode) return null
  return {
    fundcode: raw.fundcode,
    name: raw.name || `基金(${raw.fundcode})`,
    gztime: raw.gztime ?? '',
    gz: safeParseFloat(raw.gz),
    dwjz: safeParseFloat(raw.dwjz),
    gszzl: safeParseFloat(raw.gszzl),
    jzrq: raw.jzrq ?? '',
    isEstimated: raw.isEstimated ?? true,
    delayDays: raw.delayDays ?? 1,
  }
}
