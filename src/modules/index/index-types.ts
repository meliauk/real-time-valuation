/**
 * 指数板块类型定义
 *
 * 全球指数行情数据结构。指数走主线程东财 push2 批量行情（secid 查询），
 * 不进 Worker（请求量小、主线程够用，见 plan §2.4）。
 */

/** 全球指数行情 */
export interface IndexQuote {
  /** 东财 secid（如 1.000001、100.HSI） */
  secid: string
  /** 指数代码（如 000001、HSI） */
  code: string
  /** 指数名称 */
  name: string
  /** 最新点位 */
  price: number
  /** 涨跌幅（百分比） */
  changeRate: number
  /** 涨跌额 */
  changeAmount: number
}
