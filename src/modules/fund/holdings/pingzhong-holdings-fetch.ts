/**
 * 前十大持仓取数（替代失效的 F10 FundArchivesDatas）
 *
 * 天天基金 F10 持仓接口（FundArchivesDatas.aspx）已失效，移动端 API
 * FundMNInverstPosition 又被 Referer 拦截（ErrCode 61136403）。
 * 改用 pingzhongdata 的全局变量 stockCodesNew 取前十大重仓股票代码。
 *
 * stockCodesNew 格式：`{市场代码}.{股票代码}` 的逗号分隔串，如：
 *   - A股沪市：`1.603667`（emMarketCode=1 沪A）
 *   - 美股：`105.ASML`（emMarketCode=105 美股）
 *   - 港股：`116.00700`
 * 市场代码与项目 classifyShare 认的 emMarketCode 完全一致。
 *
 * ⚠️ 只有代码，无持仓比例、无股票名称。本模块只做第一步解析，不做名称回填/
 * 占比合并——持仓表展示 pingzhong 第一步原始结果（代码列显示 stockCode，
 * 市场列显示 rawEntry 原文，占比/名称无数据显示 --）。
 *
 * 完整全量持仓报告数据源缺失，暂只展示前十大。
 */

import type { FundAllHoldings, HoldingDetailItem } from '@/modules/fund/fund-types'
import { API_URLS, LSJZ_CONFIG } from '@/config/constants'
import { isValidFundCode } from '@/shared/utils/validation'
import { runScriptTask } from '@/shared/net/script-data-locks'

/**
 * 预加载的 pingzhongdata 持仓数据片段（来自 getFundFullData 透出，避免二次 script 注入）。
 * - stockCodesNew：前十大重仓代码串（{emCode}.{code}）
 * - fundSharesPositions：Data_fundSharesPositions，末项 fundSharesPositionsList 含股票中文名
 *   （接口提供的 name，按 code 关联填入持仓项，不从其他地方取）
 */
export interface PingzhongPreloaded {
  stockCodesNew?: unknown
  fundSharesPositions?: unknown[]
}

/**
 * 从 pingzhongdata 的 stockCodesNew 取前十大重仓。
 * @param fundCode  基金代码
 * @param preloaded 预加载的 pingzhong 数据（来自 getFundFullData 透出），
 *                  传入则复用不再注入 script；不传则走 loadPingzhongGlobal 兜底
 * @returns FundAllHoldings（isFull=false，10 项 holdings，ratio=0 名称空），失败返回 null
 */
export async function fetchTop10FromPingzhong(
  fundCode: string,
  preloaded?: PingzhongPreloaded,
): Promise<FundAllHoldings | null> {
  if (!isValidFundCode(fundCode)) return null

  const stockCodesNew = preloaded?.stockCodesNew ?? await loadPingzhongGlobal<unknown>(fundCode, 'stockCodesNew')
  // stockCodesNew 是数组（如 ['105.ASML','1.688361',...]）或逗号分隔字符串，统一归一化为字符串数组
  let entries: string[]
  if (Array.isArray(stockCodesNew)) {
    entries = stockCodesNew.map(s => String(s).trim()).filter(Boolean)
  } else if (typeof stockCodesNew === 'string' && stockCodesNew) {
    entries = stockCodesNew.split(',').map(s => s.trim()).filter(Boolean)
  } else {
    return null
  }
  if (entries.length === 0) return null

  const holdings: HoldingDetailItem[] = []
  for (const entry of entries.slice(0, 10)) {
    // stockCodesNew 条目格式：
    //   - '{emMarketCode}.{code}'：如 105.ASML(美股)、1.603667(沪A)、116.00700(港股)
    //   - '{code} {market}'：如 285A JP(日股，空格分隔，腾讯无行情)
    //   - 纯代码：如 000660(港股/韩股无前缀)
    const dot = entry.indexOf('.')
    if (dot > 0) {
      // {emMarketCode}.{stockCode}
      const emMarketCode = entry.substring(0, dot)
      const stockCode = entry.substring(dot + 1)
      if (stockCode) {
        holdings.push({ stockCode, stockName: '', ratio: 0, emMarketCode, rawEntry: entry })
        continue
      }
    }
    // 无点号格式：纯代码（含空格的取首段），无 emMarketCode，市场判 unknown（腾讯无行情，名称留空）
    const bareCode = entry.split(/\s+/)[0]
    if (bareCode) {
      holdings.push({ stockCode: bareCode, stockName: '', ratio: 0, emMarketCode: '', rawEntry: entry })
    }
  }

  if (holdings.length === 0) return null

  // 用 Data_fundSharesPositions 接口提供的 name 填股票中文名（按 code 关联，不从其他地方取）。
  // 占比仍保留第一步原始结果（stockCodesNew 无 ratio → 显示 --），只补名称。
  enrichNamesFromFundSharesPositions(holdings, preloaded?.fundSharesPositions)

  return {
    reportDate: '',  // pingzhongdata 的 stockCodesNew 无明确报告期，留空
    reportType: '季报',
    isFull: false,   // 仅前十大，非全量
    holdings,
  }
}

/**
 * 用 Data_fundSharesPositions 的 name 填充持仓项中文名（接口提供的名称，不从其他地方取）。
 *
 * 两源代码格式不同：stockCodesNew 是 'emCode.code'（如 116.00700），
 * fundSharesPositionsList 是纯 code（如 '700'）。按 code 分级匹配，避免前导零误配：
 *   1. 原值精确匹配
 *   2. toUpperCase() 匹配（美股 ASML vs asml）
 *   3. 纯数字且非6位（非A股）去前导零匹配（港股 00700→700）；
 *      A股6位代码不去前导零（000001→1 会错配）
 * 命中补：stockName = raw.name（仅当当前为空）。其余字段（ratio/emMarketCode/rawEntry）不动。
 */
function enrichNamesFromFundSharesPositions(holdings: HoldingDetailItem[], fundSharesPositionsRaw?: unknown): void {
  if (!holdings.length || !fundSharesPositionsRaw || !Array.isArray(fundSharesPositionsRaw)) return
  const reports = fundSharesPositionsRaw as Array<{ fundSharesPositionsList?: Array<{ code?: string; name?: string }> }>
  const latest = reports[reports.length - 1]
  const list = latest?.fundSharesPositionsList
  if (!Array.isArray(list) || list.length === 0) return

  // 三级匹配索引：原值 / upper / 去前导零（仅非6位数字）
  const byCode = new Map<string, string>()
  const byUpper = new Map<string, string>()
  const byNumTrimmed = new Map<string, string>()
  for (const item of list) {
    const code = typeof item?.code === 'string' ? item.code : ''
    const name = typeof item?.name === 'string' ? item.name : ''
    if (!code || !name) continue
    byCode.set(code, name)
    byUpper.set(code.toUpperCase(), name)
    if (/^\d+$/.test(code) && code.length !== 6) {
      byNumTrimmed.set(String(parseInt(code, 10)), name)
    }
  }

  for (const h of holdings) {
    if (h.stockName) continue  // 已有名称不覆盖
    const c = h.stockCode
    const matched =
      byCode.get(c) ??
      byUpper.get(c.toUpperCase()) ??
      (/^\d+$/.test(c) && c.length !== 6 ? byNumTrimmed.get(String(parseInt(c, 10))) : undefined)
    if (matched) h.stockName = matched
  }
}

/**
 * 加载 pingzhongdata，读取单个全局变量（如 stockCodesNew）。
 * script 注入 onload 后从 window 取值，清理全局变量避免污染。
 * 复用 pingzhongdata-fetch.ts 的加载模式。
 * 通过 runScriptTask('pz:'+code) 串行：与 pingzhongdata 另两处加载器共享同一锁，
 * 保证 window 全局变量任一时刻只属于一个基金（详情页左右滑动双 pane 并发时防串扰）。
 */
function loadPingzhongGlobal<T>(fundCode: string, globalKey: string): Promise<T | null> {
  return runScriptTask(`pz:${fundCode}`, () => loadPingzhongGlobalRaw<T>(fundCode, globalKey))
}

function loadPingzhongGlobalRaw<T>(fundCode: string, globalKey: string): Promise<T | null> {
  return new Promise((resolve) => {
    const w = window as any
    const url = `${API_URLS.FUND_DETAIL}${fundCode}.js?rt=${Date.now()}`
    const script = document.createElement('script')
    let done = false

    const timer = setTimeout(() => {
      if (done) return
      done = true
      cleanup()
      resolve(null)
    }, LSJZ_CONFIG.TIMEOUT)

    function cleanup(): void {
      clearTimeout(timer)
      script.onload = null
      script.onerror = null
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    script.onload = () => {
      if (done) return
      done = true
      const val = w[globalKey]
      cleanup()
      // 清理本次加载的全局变量，避免污染下一次
      const keysToClean = ['stockCodesNew', 'stockCodes', 'zqCodesNew', 'zqCodes', 'fS_name', 'fS_code', 'Data_netWorthTrend', 'Data_fundSharesPositions']
      for (const k of keysToClean) {
        try { delete w[k] } catch { w[k] = undefined }
      }
      resolve(val ?? null)
    }
    script.onerror = () => {
      if (done) return
      done = true
      cleanup()
      resolve(null)
    }
    script.src = url
    document.head.appendChild(script)
  })
}
