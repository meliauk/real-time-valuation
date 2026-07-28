/**
 * 资讯时间解析与格式化
 *
 * 东财时间字段可能是时间戳或日期字符串，需统一解析为 Unix 秒。
 * 时间戳/日期 → Unix 秒；Unix 秒 → 日期字符串 / HH:mm。
 * 所有时间按本地时区（与北京时间一致）。
 */

/** 解析东财时间字段（时间戳秒 或 YYYY-MM-DD HH:mm:ss 字符串）→ Unix 秒，失败 null */
export function parseEastmoneyTime(timeStr: string): number | null {
  if (!timeStr) return null
  // 时间戳（秒）
  const ts = parseInt(timeStr)
  if (ts > 1000000000) return ts
  // 日期字符串 "YYYY-MM-DD HH:mm:ss"
  const d = new Date(timeStr.replace(/-/g, '/'))
  if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000)
  return null
}

/** Unix 秒 → 日期字符串 YYYY-MM-DD */
export function formatTimestamp(ctime: number): string {
  const d = new Date(ctime * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Unix 秒 → HH:mm */
export function formatTime(ctime: number): string {
  const d = new Date(ctime * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
