/**
 * 金额格式化工具 - 金融数据显示专用
 *
 * 所有需要展示给用户的金额/净值/涨跌幅都必须经过格式化。
 */

import { NUMBER_FORMAT } from '@/config/constants'

/** 格式化金额 - 保留2位小数 */
export function formatMoney(value: number): string {
  return value.toFixed(NUMBER_FORMAT.MONEY_DECIMALS)
}

/** 格式化涨跌幅 - 带%号和正负号，如 +1.23% / -0.56% */
export function formatChangeRate(value: number): string {
  if (value === 0) return '0.00%'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(NUMBER_FORMAT.RATE_DECIMALS)}%`
}

/** 格式化净值 - 保留4位小数 */
export function formatNetValue(value: number): string {
  return value.toFixed(NUMBER_FORMAT.NET_VALUE_DECIMALS)
}

/** 格式化份额 - 保留2位小数 */
export function formatShares(value: number): string {
  return value.toFixed(NUMBER_FORMAT.SHARES_DECIMALS)
}

/** 格式化金额带符号色彩 - 返回 {文本, CSS类名} */
export function formatProfitWithColor(value: number): { text: string; cssClass: string } {
  if (value > 0) return { text: `+${formatMoney(value)}`, cssClass: 'text-rise' }
  if (value < 0) return { text: formatMoney(value), cssClass: 'text-fall' }
  return { text: formatMoney(0), cssClass: 'text-flat' }
}

/** 格式化涨跌幅带符号色彩 - 返回 {文本, CSS类名} */
export function formatRateWithColor(value: number): { text: string; cssClass: string } {
  if (value > 0) return { text: formatChangeRate(value), cssClass: 'text-rise' }
  if (value < 0) return { text: formatChangeRate(value), cssClass: 'text-fall' }
  return { text: '0.00%', cssClass: 'text-flat' }
}

/** 紧凑金额（不带符号）- 空间受限处展示，避免长数字溢出：≥1亿→1.23亿 / ≥1万→1.23万 / 否则2位小数 */
export function formatCompactMoney(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)}万`
  return formatMoney(value)
}

/** 紧凑收益（带正负号）- 列表/小卡片收益展示用，避免长数字溢出遮挡相邻项 */
export function formatProfitCompact(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatCompactMoney(value)}`
}

/** 格式化大额金额 - 万元为单位，如 12.34万 */
export function formatLargeMoney(value: number): string {
  if (Math.abs(value) >= 10000) {
    const wan = value / 10000
    return `${wan.toFixed(2)}万`
  }
  return formatMoney(value)
}

/** 格式化成交额 - 亿元/万元为单位，如 1.23亿 / 8.50万 */
export function formatTurnover(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)}万`
  return formatMoney(value)
}

/** 格式化百分比（不带正负号） - 用于持仓比例等 */
export function formatPercent(value: number): string {
  return `${value.toFixed(NUMBER_FORMAT.RATE_DECIMALS)}%`
}
