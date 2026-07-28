/**
 * 通用数据校验 - 不依赖板块类型的基础校验
 *
 * 板块专属校验（如 validateFundValuation）留在各板块内。
 * 这里只放跨板块的代码/价格/比率等基础合法性校验。
 */

/** 校验基金代码格式 - 必须为 6 位数字 */
export function isValidFundCode(code: string): boolean {
  return /^\d{6}$/.test(code)
}

/** 校验股票代码非空且为合理长度（A/HK/US 通用粗校验，精确判定在 market-classify） */
export function isValidStockCode(code: string): boolean {
  if (!code) return false
  return /^\d{4,6}$/.test(code) || /^[A-Za-z]{1,6}$/.test(code)
}

/** 校验价格合法：有限正数 */
export function isValidPrice(value: unknown): boolean {
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(n) && n > 0
}

/** 校验涨跌幅合法：有限数（允许负数和 0） */
export function isValidRate(value: unknown): boolean {
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(n)
}

/** 校验比率合法：0~100 之间的有限数 */
export function isValidRatio(value: unknown): boolean {
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(n) && n >= 0 && n <= 100
}

/** 生成唯一 ID - 时间戳 + 随机后缀 */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}
