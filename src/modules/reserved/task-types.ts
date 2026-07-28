/**
 * 计划任务类型定义（占位）
 *
 * 旧项目有定时任务功能（估值刷新/收盘提醒/净值更新），新项目阶段2未迁移 task store。
 * 本文件仅提供类型骨架，供 task-manager.vue 组件迁移后类型自洽。
 * task store 实际逻辑（任务创建/调度/执行）后续迭代补全。
 */

/** 计划任务 - 定时刷新/提醒任务 */
export interface ScheduledTask {
  /** 任务唯一ID */
  id: string
  /** 基金代码 */
  fundCode: string
  /** 基金名称 */
  fundName: string
  /** 任务类型 */
  type: TaskType
  /** 任务状态 */
  status: TaskStatus
  /** 计划执行时间 */
  scheduledTime: string
  /** 重复模式 */
  repeatMode: TaskRepeatMode
  /** 创建时间戳 */
  createdAt: number
  /** 执行次数 */
  executionCount: number
  /** 最后执行时间戳 */
  lastExecutedAt: number | null
  /** 备注 */
  note?: string
}

/** 任务类型枚举 */
export enum TaskType {
  /** 定时估值刷新 */
  RefreshValuation = 'refresh_valuation',
  /** 收盘提醒 */
  ClosingReminder = 'closing_reminder',
  /** 定时净值更新 */
  NetValueUpdate = 'net_value_update',
}

/** 任务状态枚举 */
export enum TaskStatus {
  /** 待执行 */
  Pending = 'pending',
  /** 执行中 */
  Running = 'running',
  /** 已完成 */
  Completed = 'completed',
  /** 已取消 */
  Cancelled = 'cancelled',
  /** 执行失败 */
  Failed = 'failed',
}

/** 任务重复模式枚举 */
export enum TaskRepeatMode {
  /** 仅执行一次 */
  Once = 'once',
  /** 每日重复 */
  Daily = 'daily',
  /** 工作日重复 */
  Workday = 'workday',
}
