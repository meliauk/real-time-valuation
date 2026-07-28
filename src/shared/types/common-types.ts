/**
 * 全局公共类型定义
 *
 * 只放"被 ≥2 个板块用到"的类型。板块专属类型留在各板块的 `*-types.ts`。
 * 这是 shared 层的底座，所有板块的 calc / worker / service 都可能引用。
 *
 * 口径说明（与 shared/market/trading-day.ts 一致）：
 *   - 收盘列（close）：跳过今日 bar，取本地前一交易日收盘 vs 其前一交易日收盘。
 *   - 实时列（realtime）：各市场当日交易日相对昨收，美股走时段模式，其他直取。
 *   - 收盘列与实时列日期可不同，二者本就是不同口径。
 */

/**
 * 股票市场标识。
 * A=沪深京A股, HK=港股, US=美股,
 * JP/KR/TW=日韩台, DE/FR/UK=德法英,
 * BR/IN/SG/AU=巴西印度新加坡澳洲, unknown=未识别。
 *
 * 判定由 shared/market/market-classify.ts 的 classifyShare 完成。
 */
export type StockMarket =
  | 'A' | 'HK' | 'US'
  | 'JP' | 'KR' | 'TW'
  | 'DE' | 'FR' | 'UK'
  | 'BR' | 'IN' | 'SG' | 'AU'
  | 'unknown'

/**
 * 市场时区标识（交易日判定用）。
 * 与 StockMarket 的子集对应——只覆盖有交易日判定逻辑的市场。
 * 详细时区/夏令时由 shared/market/trading-day.ts 处理。
 */
export type MarketTz =
  | 'A' | 'HK' | 'US'
  | 'JP' | 'KR' | 'TW'
  | 'DE' | 'FR' | 'UK'
  | 'unknown'

/**
 * 美股交易时段（仅 Yahoo realtime 美股有意义）。
 * PRE=盘前(美东04:00~09:30), REGULAR=盘中(09:30~16:00), POST=盘后(16:00~20:00), OFF=盘外。
 * 由 shared/market/session.ts 的 classifyUSSessionByMs/Ts 判定。
 */
export type USSession = 'PRE' | 'REGULAR' | 'POST' | 'OFF'

/**
 * 股票行情信息（统一口径，东财线/Yahoo线共用）。
 *
 * 这是双全局缓存（stockPrevDayCache / stockRealtimeCache）的值类型，
 * 各 Worker 取数后 postMessage 回主线程，merge 进缓存，触发受影响基金 recompute。
 */
export interface StockQuoteInfo {
  /** 涨跌幅（百分比，2位小数）。null=取数失败或休盘。 */
  changeRate: number | null
  /** 数据日期 YYYY-MM-DD。close=昨日交易日，realtime=当日交易日。null=取数失败。 */
  date: string | null
  /** 股票所属市场（A/HK/US/JP...）。 */
  market: StockMarket
  /** 数据来源标签（东财/腾讯/Yahoo/休盘），供 UI 展示。 */
  source: string | null
  /**
   * true=该市场昨日休盘（确定无数据，不重试 Yahoo）；缺省=取数失败（可重试）。
   * UI 两者都显示 --，但 loop 用此标记区分：closed=true 不丢 Yahoo 重试。
   * 加权时 changeRate=null（休盘和失败都是 null）都跳过，符合"休盘不参与加权"。
   */
  closed?: boolean
  /**
   * 美股实时时段标签（仅 Yahoo realtime 模式美股有意义）：PRE/REGULAR/POST。
   * A/港股、东财源、close 模式均为 undefined（UI 不显示标签）。
   */
  session?: 'PRE' | 'REGULAR' | 'POST'
  /**
   * 实时数据时间戳（Unix ms）：Yahoo 用 meta.regularMarketTime，东财实时用取数时刻。
   * close 模式无时间戳（非实时）。供 UI 显示数据时间节点。
   */
  updatedAt?: number
}
