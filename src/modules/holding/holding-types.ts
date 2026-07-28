/**
 * 持仓板块类型定义
 *
 * 持仓操作记录 + T+1 待确认操作（用户加仓/减仓/编辑的变更日志与延迟执行）。
 * 持仓记录本身（Holding）在 fund-types，因估值流程依赖；操作记录归此板块。
 */

/** 持仓操作类型枚举 */
export enum HoldingActionType {
  /** 加仓 */
  Add = 'add',
  /** 减仓 */
  Reduce = 'reduce',
  /** 编辑修改 */
  Edit = 'edit',
  /** 结算清仓 */
  Settle = 'settle',
}

/** 持仓操作记录 - 加仓/减仓/编辑的变更日志 */
export interface HoldingAction {
  /** 操作唯一ID */
  id: string
  /** 基金代码 */
  fundCode: string
  /** 操作类型 */
  type: HoldingActionType
  /** 操作前份额 */
  sharesBefore: number
  /** 操作后份额 */
  sharesAfter: number
  /** 操作前成本 */
  costBefore: number
  /** 操作后成本 */
  costAfter: number
  /** 操作时间戳 */
  timestamp: number
  /** 备注 */
  note?: string
}

/** T+1 待确认操作状态枚举 */
export enum PendingActionStatus {
  /** 待执行 - 等待确认净值后自动执行 */
  Pending = 'pending',
  /** 已执行 - 确认净值后已自动应用 */
  Executed = 'executed',
  /** 已取消 - 用户手动取消 */
  Cancelled = 'cancelled',
}

/** T+1 待确认操作 - 加仓/减仓延迟到确认净值后执行 */
export interface PendingAction {
  /** 操作唯一ID */
  id: string
  /** 基金代码 */
  fundCode: string
  /** 操作类型 */
  type: 'add' | 'reduce'
  /** 加仓金额（type=add）或 减仓份额（type=reduce） */
  amount: number
  /** 操作时的参考净值 */
  referenceNav: number
  /** 预计确认日期 YYYY-MM-DD（下一交易日） */
  scheduledDate: string
  /** 用户操作时间戳 */
  operateTime: number
  /** 操作状态 */
  status: PendingActionStatus
  /** 执行时使用的确认净值 */
  executedNav?: number
  /** 执行时间戳 */
  executedAt?: number
  /** 备注 */
  note?: string
  /** 创建时间戳 */
  createdAt: number
}

/** 仪表盘统计数据（涨跌幅驱动模型聚合） */
export interface DashboardStats {
  /** 持有金额 */
  totalHoldingAmount: number
  /** 今日收益金额 */
  todayProfit: number
  /** 累计收益金额 */
  totalProfit: number
  /** 收益率（累计收益 / 投入本金，百分比） */
  overallChangeRate: number
  /** 投入本金合计 */
  totalCost: number
  /** 今日收益率（今日收益 / 昨日持有金额，百分比） */
  todayReturnRate: number
}
