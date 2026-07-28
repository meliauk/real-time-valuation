/**
 * 业务逻辑枚举
 *
 * 定义涨跌状态、刷新状态等业务语义枚举值。
 * 跨板块共用的枚举放这里；板块专属枚举留在板块内的 *-types.ts。
 */

/** 涨跌方向 - 根据涨跌幅正负值判定（UI 配色/箭头用） */
export enum ChangeDirection {
  /** 上涨（涨跌幅 > 0） */
  Rise = 'rise',
  /** 下跌（涨跌幅 < 0） */
  Fall = 'fall',
  /** 平盘（涨跌幅 = 0 或无数据） */
  Flat = 'flat',
}

/** 数据刷新状态（基金估值刷新、自选股刷新等通用） */
export enum RefreshStatus {
  /** 空闲状态 - 无刷新任务进行 */
  Idle = 'idle',
  /** 刷新中 - 正在请求数据 */
  Loading = 'loading',
  /** 刷新成功 - 数据已更新 */
  Success = 'success',
  /** 刷新失败 - 请求出错 */
  Failed = 'failed',
}

/** 估值时间有效性（判断估值是否当日有效） */
export enum ValuationValidity {
  /** 有效 - 估值时间在当日交易时段内 */
  Valid = 'valid',
  /** 跨日 - 估值数据来自前一交易日 */
  CrossDay = 'cross_day',
  /** 周末 - 当前为周末无实时估值 */
  Weekend = 'weekend',
  /** 节假日 - 当前为法定节假日 */
  Holiday = 'holiday',
}

/** 持仓盈亏状态 */
export enum ProfitStatus {
  /** 盈利 */
  Profit = 'profit',
  /** 亏损 */
  Loss = 'loss',
  /** 持平 */
  BreakEven = 'break_even',
}
