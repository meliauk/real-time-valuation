/**
 * 东财/腾讯实时涨跌计算
 *
 * 实时涨跌口径：当日现价 vs 昨收价 → 涨跌幅。
 * 腾讯 qt.gtimg 报价返回 "v_<code>=\"1~名称~代码~现价~昨收~...\"" 格式，
 * 第4段(现价)第5段(昨收)算涨跌。GBK 乱码不影响数字字段。
 *
 * 本文件是纯计算：现价+昨收 → rate（截2位）。取数+正则提取在 shared/net/tencent-fetch.ts。
 * 这里提供口径函数供 Worker 内复用，以及 v_pv_none_match（代码不匹配，整段值为"1"）的判定。
 */

import type { StockMarket, StockQuoteInfo } from '@/shared/types/common-types'
import { resolveMarketTradingDays } from '@/shared/market/trading-day'
import { stockMarketToTz } from '@/shared/market/market-classify'

/** 现价 vs 昨收 → 实时涨跌幅（截2位小数）。prevClose<=0 或价格非法返回 null。 */
export function calcRealtimeRate(price: number, prevClose: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose <= 0) return null
  return Math.round((price - prevClose) / prevClose * 100 * 100) / 100
}

/**
 * 构造实时 StockQuoteInfo（供 Worker 取数后组装返回）。
 * @param code      归一化代码
 * @param market    市场
 * @param rate      涨跌幅（null=取数失败）
 * @param source    数据来源标签（东财/腾讯）
 */
export function buildRealtimeQuote(
  code: string,
  market: StockMarket,
  rate: number | null,
  source: string,
): StockQuoteInfo {
  const tz = stockMarketToTz(market)
  const td = resolveMarketTradingDays(tz)
  // 休市（周末/节假日）：当日无交易，实时列显示 --，不显 stale。返回 closed 占位。
  if (td.isNonTradingDay) {
    return { changeRate: null, date: null, market, source: null, closed: true, updatedAt: Date.now() }
  }
  return {
    changeRate: rate,
    date: rate != null ? td.currentTradingDay : null,
    market,
    source: rate != null ? source : null,
    updatedAt: Date.now(),
  }
}
