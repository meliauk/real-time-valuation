/**
 * 股票板块类型定义
 *
 * 自选股行情 + 搜索结果。自选股走东财 push2 批量（主线程，量小够用），
 * 搜索走东财 suggest（主线程 JSONP）。
 */

/** 自选股完整行情（卡片展示用） */
export interface StockQuote {
  /** 股票代码（归一化） */
  code: string
  /** 股票名称 */
  name: string
  /** 最新价 */
  price: number
  /** 涨跌幅（百分比） */
  changeRate: number
  /** 涨跌额 */
  changeAmount: number
  /** 今开 */
  open?: number
  /** 最高 */
  high?: number
  /** 最低 */
  low?: number
  /** 成交额（元） */
  turnover?: number
  /** 换手率（%） */
  turnoverRate?: number
  /** 市盈率（动态） */
  peRatio?: number
  /** 市净率 */
  pbRatio?: number
  /** 东财市场代码（1/0/116/105 等） */
  emMarketCode?: string
}

/** 股票搜索结果项 */
export interface StockSearchItem {
  /** 股票代码 */
  code: string
  /** 股票名称 */
  name: string
  /** 市场标签（沪/深/港/美/日/韩/台/德/法/英） */
  market: string
  /** 东财市场代码（1/0/116/105/124/130/118 等） */
  rawMarket: string
}
