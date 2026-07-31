/**
 * 移动端前十大持仓取数（含占比）
 *
 * 东财电脑端 F10 FundArchivesDatas（jjcc）在纯前端被 Referer 拦截（script 注入 onerror、
 * 公共代理全超时）。改用东财**移动端**接口 FundMNInverstPosition：
 *   https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition
 *     ?FCODE={code}&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0
 *
 * 关键：用 deviceid=Wap&plat=WAP（手机网页口径），浏览器 fetch（非 script 注入）即可直连成功，
 * 东财对 WAP 口径放行 CORS——本项目部署在 GitHub Pages（纯静态），与该接口同构（浏览器 fetch），
 * 无需服务端代理。字段：Datas.fundStocks[] 每项 GPDM(代码)/GPJC(名称)/JZBL(占比%)，报告期在 Expansion。
 *
 * ⚠️ 该接口无 emMarketCode（东财市场代码），只有 GPDM 股票代码，且是裸码（无市场前缀）。
 *   本项目 classifyShare/行情分流依赖 emMarketCode，但**不据 GPDM 位数/格式猜市场**——
 *   韩股海力士 000660、三星 005930 都是 6 位数字，与深市 A 股撞码，按位数猜必误判。
 *   统一留空 emMarketCode，市场归属交 pingzhong stockCodesNew（带 emCode 前缀，权威）补全：
 *     - pingzhong 匹配上 → 用其 emCode 走对应接口（A/HK/US→东财，其余海外→Yahoo）
 *     - pingzhong 未匹配 → emCode 保持空 → classifyShare 返回 unknown → Yahoo Search
 *   parseGpdm 只做 stockCode 归一化（去前缀/后缀），不判市场。
 *   GPDM 格式（仅用于归一化代码，不判市场）：
 *     - 带前缀：sh600519/sz000001/hk00700/usAAPL
 *     - 带后缀：0700.HK/00001.HK/TSLA.US/AAPL.O
 *     - 裸码：6位数字(600519/000660)、5位数字(00700)、纯字母(AAPL)
 *
 * 失败回退由调用方处理（pingzhong stockCodesNew 兜底：有代码无占比）。
 */

import type { FundAllHoldings, HoldingDetailItem } from '@/modules/fund/fund-types'
import { F10_CONFIG } from '@/config/constants'
import { isValidFundCode } from '@/shared/utils/validation'
import { beijingNow } from '@/shared/utils/date-format'
import dayjs from 'dayjs'

/** 移动端 API 单条持仓 */
interface MobileFundStock {
  /** 股票代码（GPDM） */
  GPDM?: string
  /** 股票简称（GPJC） */
  GPJC?: string
  /** 占净值比例（JZBL，数字） */
  JZBL?: number | string
}

/** 移动端 API 响应 */
interface MobileHoldingsResponse {
  Success?: boolean
  ErrCode?: number
  ErrMsg?: string
  /** 报告期（如 "2024-12-31"） */
  Expansion?: string
  Datas?: { fundStocks?: MobileFundStock[] }
}

/**
 * 从移动端 API 取前十大持仓（含占比）。
 * @param fundCode 基金代码
 * @returns FundAllHoldings（isFull=false，10 项 holdings，含 ratio/名称/emMarketCode），失败返回 null
 */
export async function fetchTop10FromMobileApi(fundCode: string): Promise<FundAllHoldings | null> {
  if (!isValidFundCode(fundCode)) return null
  const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?FCODE=${fundCode}&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), F10_CONFIG.TIMEOUT)
  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) return null
    const json = (await resp.json()) as MobileHoldingsResponse
    if (!json || !json.Success) return null

    // 报告期新鲜度校验（近 6 个月 + 不超今天+7天）：超过 6 个月的旧披露视为过期，
    // 返回 null 让调用方回退 pingzhong——避免展示陈旧占比误导加权推算。
    const reportDate = String(json.Expansion || '')
    if (!isReportFresh(reportDate)) return null

    const fundStocks = json.Datas?.fundStocks || []
    if (!Array.isArray(fundStocks) || fundStocks.length === 0) return null

    const holdings: HoldingDetailItem[] = []
    for (const s of fundStocks) {
      const rawCode = String(s.GPDM || '').trim()
      const name = String(s.GPJC || '').trim()
      const ratio = parseRatio(s.JZBL)
      if (!rawCode && !name && ratio <= 0) continue
      const { stockCode, emMarketCode } = parseGpdm(rawCode)
      holdings.push({
        stockCode,
        stockName: name,
        ratio,
        emMarketCode,
        rawEntry: rawCode,
      })
    }

    if (holdings.length === 0) return null

    return {
      reportDate,
      reportType: detectReportType(reportDate),
      isFull: false, // 移动端接口仅前十大，非全量
      holdings: holdings.slice(0, 10),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 报告期新鲜度：近 6 个月内（覆盖上一/上上季度，兼容披露延迟）且不超未来 7 天。
 *  无报告期或格式非法 → false（过期，不展示陈旧占比）。 */
function isReportFresh(reportDate: string): boolean {
  if (!reportDate) return false
  const report = dayjs(reportDate, 'YYYY-MM-DD')
  if (!report.isValid()) return false
  const now = beijingNow()
  return report.isAfter(now.subtract(6, 'month')) && report.isBefore(now.add(7, 'day'))
}

/** JZBL 占比转数字（截2位）。无效返回 0。 */
function parseRatio(raw: number | string | undefined): number {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

/** 报告期 → 报告类型（按月份推断：年报12月、半年报6月、季报3/9月）。空返回空串。 */
function detectReportType(reportDate?: string): string {
  const m = String(reportDate || '').match(/-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const mm = m[1]
  if (mm === '12') return '年报'
  if (mm === '06') return '半年报'
  if (mm === '03') return '一季报'
  if (mm === '09') return '三季报'
  return '季报'
}

/**
 * GPDM 股票代码 → { stockCode, emMarketCode }。
 * **只归一化 stockCode，不判市场**（emMarketCode 恒为 ''）。
 * 缘由：移动端 GPDM 是裸码，韩股 000660/005930 与深市 A 股同为 6 位数字，按位数猜必误判。
 *   市场归属统一交 pingzhong stockCodesNew（带 emCode 前缀，权威）补全；补不到的走 Yahoo Search。
 * stockCode 归一化为纯代码（去掉前缀/后缀），与 pingzhong stockCodesNew 剥前缀后的口径一致，
 * 供 enrichMarketCodeFromPingzhong 按 stockCode 匹配覆盖市场。
 */
function parseGpdm(rawCode: string): { stockCode: string; emMarketCode: string } {
  const raw = rawCode.trim()
  if (!raw) return { stockCode: '', emMarketCode: '' }

  // 市场前缀格式：sh600519/sz000001/bj000001/hk00700/usAAPL → 剥前缀取纯代码（不据此判市场，统一留空）
  const mPref = raw.match(/^(sh|sz|bj|hk|us)(.+)$/i)
  if (mPref) {
    const p = mPref[1].toLowerCase()
    const rest = String(mPref[2] || '').trim()
    if (p === 'hk') return { stockCode: rest.padStart(5, '0'), emMarketCode: '' }
    if (p === 'us') return { stockCode: rest.toUpperCase(), emMarketCode: '' }
    return { stockCode: rest, emMarketCode: '' }
  }
  // 港股带后缀：0700.HK / 00001.HK → 剥后缀补 5 位
  const hkDot = raw.match(/^(\d{4,5})\.HK$/i)
  if (hkDot) return { stockCode: hkDot[1].padStart(5, '0'), emMarketCode: '' }
  // 美股带后缀：TSLA.US / AAPL.O / BRK.B → 取主代码大写
  const usDot = raw.match(/^([A-Za-z]{1,10})\.[A-Za-z]{1,6}$/)
  if (usDot) return { stockCode: usDot[1].toUpperCase(), emMarketCode: '' }
  // 裸码：纯数字（A 股 6 位/港股 5 位/韩股 6 位等）或纯字母（美股）→ 原样，市场留空
  return { stockCode: raw, emMarketCode: '' }
}
