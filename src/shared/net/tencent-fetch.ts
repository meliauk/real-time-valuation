/**
 * 腾讯接口 fetch 封装 - Worker 内主源（CORS 放行）
 *
 * 腾讯 fqkline（日K）/ qt.gtimg（报价）是 CORS 隐式放行的，Worker 内 fetch 可直接读取。
 * 这是东财线在 Worker 内的主源（东财 JSONP 进不了 Worker，退主线程兜底）。
 *
 * 本文件设计为"Worker 与主线程通用"——纯 fetch+解析，不依赖 DOM/Pinia，可被 Worker 直接 import。
 */

import { TENCENT_URLS, FUND_LOOP_CONFIG } from '@/config/constants'
import type { StockMarket } from '@/shared/types/common-types'
import { tencentKlineCode, tencentQuoteCode } from './tencent-codec'

/** 腾讯日K原始 bar 格式：[date, open, close, high, low, vol] 或港美股末尾多个公司行为对象 */
type TencentKlineBar = [string, string, string, string, string, string, ...unknown[]]

/**
 * 腾讯日K响应 → klines 逗号字符串数组（date,open,close,high,low,vol,vol 格式）。
 * 只取前6个字段，额缺省填 vol。供日K涨跌计算按 date+close 解析。
 *
 * 脏 bar 过滤：剔除与最新 bar 日期跨度超过 KLINE_DIRTY_BAR_MAX_DAYS 的历史脏数据。
 * 腾讯无后缀美股重试偶发返回"首条(如2011)+最新"的混合序列，跨年脏 bar 会导致
 * 涨跌算出几百%离谱值（如 usCYD 的 2011+2026 混合算出 116%）。
 */
export function klinesFromTencent(rawArr: unknown[] | undefined): string[] | null {
  if (!rawArr || !Array.isArray(rawArr) || rawArr.length === 0) return null
  // 先解析出合法 bar（date+close 校验）
  const parsed: { date: string; ts: number; line: string }[] = []
  for (const bar of rawArr) {
    if (!Array.isArray(bar) || bar.length < 6) continue
    const [date, open, close, high, low, vol] = bar as TencentKlineBar
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const c = parseFloat(close)
    if (!Number.isFinite(c) || c <= 0) continue
    const ts = Date.parse(date)
    if (!Number.isFinite(ts)) continue
    parsed.push({ date, ts, line: `${date},${open},${close},${high},${low},${vol},${vol}` })
  }
  if (parsed.length === 0) return null

  // 找最新 bar 的时间戳，剔除跨度超阈值的脏 bar
  const maxTs = parsed.reduce((max, p) => Math.max(max, p.ts), -Infinity)
  const maxDaysMs = FUND_LOOP_CONFIG.KLINE_DIRTY_BAR_MAX_DAYS * 24 * 60 * 60 * 1000
  const out = parsed
    .filter((p) => maxTs - p.ts <= maxDaysMs)
    .map((p) => p.line)
  return out.length > 0 ? out : null
}

/**
 * 腾讯 fqkline 日K单只 fetch（Worker 内主源）。
 *
 * @param code    归一化纯代码（600519/00700/AAPL）
 * @param market  A/HK/US
 * @returns klines 逗号字符串数组（date,open,close,high,low,vol,vol）；失败返回 null
 *
 * 美股 .OQ 返回空/bar<2 时退无后缀 usAAPL 重试一次（纽交所/部分股 .OQ 取不到）。
 */
export async function fetchTencentKline(
  code: string,
  market: StockMarket,
  timeoutMs: number = 5000,
): Promise<string[] | null> {
  const tCode = tencentKlineCode(code, market)
  const klines = await fetchTencentKlineByCode(tCode, timeoutMs)
  if (klines && klines.length >= 2) return klines

  // 美股 .OQ 取不到 → 退无后缀重试
  if (market === 'US' && (klines == null || klines.length < 2)) {
    const fallbackCode = `us${code.toUpperCase()}`
    const retry = await fetchTencentKlineByCode(fallbackCode, timeoutMs)
    if (retry && retry.length >= 2) return retry
  }
  return null
}

/** 不做后缀兜底的裸 fetch（供美股无后缀重试，避免无限递归） */
async function fetchTencentKlineByCode(tCode: string, timeoutMs: number): Promise<string[] | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(`${TENCENT_URLS.FQKLINE}?param=${tCode},day,,,8,qfq`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!resp.ok) return null
    const payload = await resp.json() as any
    const block = payload?.data?.[tCode]
    const rawArr = block?.qfqday || block?.day
    return klinesFromTencent(rawArr)
  } catch {
    clearTimeout(timer)
    return null
  }
}

/**
 * 腾讯 qt.gtimg 批量报价 → Map<normalizedCode, {price, prevClose, rate, name}>。
 * 响应 var v_sh600519="1~名称~代码~现价~昨收~..." GBK 编码，按 ~ split 取第4(现价)/第5(昨收)。
 * 用 arrayBuffer + TextDecoder('gbk') 解码全文，使 A股中文名称(parts[1])正确显示。
 * 数字字段 ASCII 不受 GBK 解码影响。
 *
 * 名称取数：
 *   - A股/港股：parts[1]（GBK 解码后为中文）
 *   - 美股：parts[1] 若有效用之，否则 parts[46]（ASCII 英文名，如 "Asml Holding..."）
 *
 * @param entries [{code, market}] 仅 A/HK/US（其他市场腾讯无对应）
 * @returns Map<归一化code, {price, prevClose, changeRate, name?}>；失败的股不写入
 */
export async function fetchTencentRealtimeBatch(
  entries: { code: string; market: StockMarket }[],
  timeoutMs: number = 5000,
): Promise<Map<string, { price: number; prevClose: number; changeRate: number; name?: string }>> {
  const result = new Map<string, { price: number; prevClose: number; changeRate: number; name?: string }>()
  if (entries.length === 0) return result

  const codeToEntry = new Map<string, { code: string; market: StockMarket }>()
  const qParams: string[] = []
  for (const e of entries) {
    const tCode = tencentQuoteCode(e.code, e.market)
    codeToEntry.set(tCode, e)
    qParams.push(tCode)
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let text: string
  try {
    const resp = await fetch(`${TENCENT_URLS.QUOTE}${qParams.join(',')}`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!resp.ok) return result
    // GBK 解码：A股票名称(parts[1])为中文，必须 arrayBuffer + TextDecoder('gbk')。
    // 数字字段 ASCII 不受影响。Worker 内 TextDecoder('gbk') 原生支持。
    const buf = await resp.arrayBuffer()
    try {
      text = new TextDecoder('gbk').decode(buf)
    } catch {
      // TextDecoder('gbk') 不可用时退回 UTF-8（名称乱码，数字仍可用）
      text = new TextDecoder().decode(buf)
    }
  } catch {
    clearTimeout(timer)
    return result
  }
  if (!text) return result

  // 提取每段 v_<code>="<...>"，按 ~ split 取第4(现价)/第5(昨收)
  // v_pv_none_match（代码不匹配）整段值为 "1"，split 后长度<5 跳过
  const re = /v_([^=]+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const tCode = m[1]
    const val = m[2]
    const entry = codeToEntry.get(tCode)
    if (!entry) continue
    const parts = val.split('~')
    if (parts.length < 5) continue
    const price = parseFloat(parts[3])
    const prevClose = parseFloat(parts[4])
    if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose <= 0) continue
    const changeRate = Math.round((price - prevClose) / prevClose * 100 * 100) / 100
    const name = extractStockName(parts, entry.market)
    result.set(entry.code, { price, prevClose, changeRate, ...(name ? { name } : {}) })
  }
  return result
}

/**
 * 从腾讯报价 parts 提取股票名称。
 * @param parts 按 ~ split 的响应段
 * @param market 股票市场
 *   - A股/港股：parts[1]（GBK 解码后为中文）
 *   - 美股：parts[1] 有效用之，否则 parts[46]（ASCII 英文名）
 * @returns 名称，取不到返回空串
 */
function extractStockName(parts: string[], market: StockMarket): string {
  const clean = (s: string | undefined): string => {
    if (!s) return ''
    // 去掉 GBK 解码失败产生的替换符 � 及首尾空白
    return s.replace(/�/g, '').trim()
  }
  if (market === 'US') {
    const p1 = clean(parts[1])
    if (p1) return p1
    // 美股 parts[46] 为 ASCII 英文全称（如 "Asml Holding Nv..."）
    const p46 = clean(parts[46])
    return p46
  }
  // A股/港股：parts[1] 为中文（GBK 解码后）
  return clean(parts[1])
}
