/**
 * AI 板块类型定义
 *
 * GLM 视觉模型识别结果。主要针对支付宝基金持仓截图（其他持仓 App 截图也支持），
 * 识别图中的基金名称、基金代码、持有金额、累计收益。
 * 识别结果用于持仓编辑——持有金额/累计收益填入持仓记录，其余（收益率等）由系统自行计算。
 */

/** 图像识别状态 */
export type RecognitionStatus = 'idle' | 'reading' | 'recognizing' | 'done' | 'error'

/** 识别出的基金数据（从持仓截图提取，用于持仓编辑） */
export interface RecognizedFund {
  /** 基金代码（6位数字） */
  fundCode: string
  /** 基金名称 */
  fundName: string
  /** 持有金额（元）——对应持仓编辑的持有金额 */
  holdingAmount?: number
  /** 累计收益（元，亏损为负）——对应持仓编辑的累计收益 */
  accumulatedProfit?: number
}
