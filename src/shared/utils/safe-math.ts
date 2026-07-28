/**
 * 安全数学运算 - 金融数据计算专用
 *
 * 避免浮点数精度丢失，所有金额/净值/份额运算必须走此模块。
 * 核心原理：乘 10^n 转整数运算后再除回来，消除浮点误差。
 */

const PRECISION = 1000000 // 6位精度因子（避免多步运算的浮点误差累积）

/** 将任意值安全转为浮点数，NaN 或 undefined 返回 0 */
export function safeParseFloat(value: unknown): number {
  if (value === null || value === undefined) return 0
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  return isNaN(num) ? 0 : num
}

/** 安全乘法 - 避免浮点精度丢失（如 0.1 * 0.2 ≠ 0.02） */
export function safeMultiply(a: unknown, b: unknown): number {
  const numA = safeParseFloat(a)
  const numB = safeParseFloat(b)
  return Math.round(numA * PRECISION * numB) / PRECISION
}

/** 安全除法 - 避免除零错误和浮点精度丢失 */
export function safeDivide(a: unknown, b: unknown): number {
  const numA = safeParseFloat(a)
  const numB = safeParseFloat(b)
  if (numB === 0) return 0
  return Math.round((numA * PRECISION) / numB) / PRECISION
}

/** 安全加法 - 避免浮点精度丢失（如 0.1 + 0.2 ≠ 0.3） */
export function safeAdd(a: unknown, b: unknown): number {
  const numA = safeParseFloat(a)
  const numB = safeParseFloat(b)
  return Math.round((numA + numB) * PRECISION) / PRECISION
}

/** 安全减法 - 避免浮点精度丢失 */
export function safeSubtract(a: unknown, b: unknown): number {
  const numA = safeParseFloat(a)
  const numB = safeParseFloat(b)
  return Math.round((numA - numB) * PRECISION) / PRECISION
}

/** 金额四舍五入到 2 位小数，消除浮点累积误差（如 545.990001 → 546.00） */
export function roundMoney(value: unknown): number {
  return Math.round(safeParseFloat(value) * 100) / 100
}

/**
 * 显示精度涨跌幅（截 2 位）。
 * 完全按真正公布的涨跌幅精度截断，不施加任何偏置——
 * 涨跌幅驱动模型的唯一数据源，今日收益/持有金额/累计收益三者基于此 2 位涨跌幅自洽。
 */
export function displayRate(gszzl: number): number {
  return Math.round(gszzl * 100) / 100
}

/** 计算涨跌幅 - (当前值 - 上期值) / 上期值 * 100 */
export function calcChangeRate(current: unknown, previous: unknown): number {
  const numCurrent = safeParseFloat(current)
  const numPrevious = safeParseFloat(previous)
  if (numPrevious === 0) return 0
  return safeDivide(safeSubtract(numCurrent, numPrevious) * 100, numPrevious)
}

/** 批量求和 - 对一组数值做安全累加 */
export function safeSum(values: unknown[]): number {
  return values.reduce<number>((sum, val) => safeAdd(sum, val), 0)
}

/** 计算今日盈亏金额 = 份额 × (今日估值 - 昨日净值) */
export function calcTodayProfit(shares: unknown, valuation: unknown, lastNetValue: unknown): number {
  return safeMultiply(safeParseFloat(shares), safeSubtract(safeParseFloat(valuation), safeParseFloat(lastNetValue)))
}

/** 计算累计盈亏金额 = 份额 × (当前净值 - 成本价) */
export function calcTotalProfit(shares: unknown, currentNetValue: unknown, costPrice: unknown): number {
  return safeMultiply(safeParseFloat(shares), safeSubtract(safeParseFloat(currentNetValue), safeParseFloat(costPrice)))
}

/** 计算持仓成本总额 = 份额 × 成本价 */
export function calcCostTotal(shares: unknown, costPrice: unknown): number {
  return safeMultiply(safeParseFloat(shares), safeParseFloat(costPrice))
}
