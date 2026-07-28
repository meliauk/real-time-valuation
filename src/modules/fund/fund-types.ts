/**
 * 基金板块类型定义
 *
 * 只保留估值系统核心必需的类型：估值数据、持仓与推算、缓存、搜索目录、列表配置。
 * 非核心类型（持仓操作记录/T+1待确认操作/计划任务/UI聚合统计/详情子结构）不在此文件，
 * 各归各家文件管理（见 plan §4.1 剔除清单与「剔除即剔除」规则）。
 *
 * 公共类型（StockMarket/StockQuoteInfo/USSession）从 shared/types/common-types 引入，
 * 不重复定义。
 */

import type { StockQuoteInfo } from '@/shared/types/common-types'

// ===== 估值数据 =====

/** 盘中估值快照点 - 用于卡片视图当日走势缩略图 */
export interface IntradayPoint {
  /** 时间 HH:mm */
  time: string
  /** 估算净值 */
  value: number
}

/**
 * 基金估值数据 - 合并天天基金网 fundgz（盘中估算）和东方财富 F10 lsjz（确认净值）。
 *
 * 口径要点：
 *   - gszzl/gz 来自 fundgz 估算时 isEstimated=true；lsjz 确认净值已出则覆盖为真实值。
 *   - delayDays：1=国内基金(T+1)，2=QDII/FOF等(T+2)，决定确认净值滞后天数。
 *   - prevConfirmedNav/prevConfirmedGszzl：滞后 N 交易日的确认净值及配套涨跌，
 *     不随今日净值确认而前进，失败回退 dwjz。用于"昨日净值"列稳定显示。
 *   - realtimeGszzl：T+2 已确认基金在海外盘中时段的实时推算涨跌（持仓加权），
 *     仅展示，不参与持仓金额/累计收益；美股收盘或跨日时清空。
 */
export interface FundValuation {
  /** 基金代码（6位数字） */
  fundcode: string
  /** 基金名称 */
  name: string
  /** 估值时间（2024-01-15 16:00 或 2024-01-15） */
  gztime: string
  /** 估算净值 */
  gz: number
  /** 上一交易日净值 */
  dwjz: number
  /** 昨日净值 - lsjz 最新一条已确认净值（T+1=上一交易日，T+2 取其最新可得确认净值）。
   *  不论估算/确认状态恒定不变。失败回退 dwjz。 */
  prevConfirmedNav?: number
  /** 昨日涨跌幅 - 配套 prevConfirmedNav（最新条相对前一条的真实涨跌） */
  prevConfirmedGszzl?: number
  /** 估值涨跌幅（百分比） */
  gszzl: number
  /** 净值日期 - F10 lsjz 最新一条记录的日期，用于判断是否已有真实数据 */
  jzrq?: string
  /** 是否为预估值 - true 表示 gszzl/gz 来自 fundgz 估算，false 表示已确认 */
  isEstimated?: boolean
  /** 净值确认延迟天数 - 1=T+1(国内基金), 2=T+2(QDII等) */
  delayDays?: 1 | 2
  /** F10 lsjz 确认涨跌幅 - isEstimated=true 时保留 lsjz 返回的已确认涨跌幅用于成本价回算 */
  confirmedGszzl?: number
  /** T+2 已确认基金海外盘中实时推算涨跌幅（%）- 仅展示，不参与金额/累计收益。
   *  由持仓股票当日实时涨跌按占比加权得出，美股收盘或跨日时清空。 */
  realtimeGszzl?: number
  /** realtimeGszzl 的来源标签（如「美股盘中」），配合 UI 显示小标 [盘中] */
  realtimeSource?: string
  /** 实时涨跌幅的最后更新时间 HH:mm（北京时间） */
  realtimeUpdatedAt?: string
}

// ===== 持仓与推算 =====

/** 基金全部持仓 - 从 F10 FundArchivesDatas 获取 */
export interface FundAllHoldings {
  /** 报告期日期 (e.g. "2024-12-31") */
  reportDate: string
  /** 报告类型 (年报/半年报/一季报/三季报) */
  reportType: string
  /** 是否为全部持仓 (年报/半年报=true, 季报=false 仅十大) */
  isFull: boolean
  /** 持仓明细列表 */
  holdings: HoldingDetailItem[]
}

/** 持仓明细项 */
export interface HoldingDetailItem {
  /** 股票代码 */
  stockCode: string
  /** 股票名称 */
  stockName: string
  /** 占净值比例（%） */
  ratio: number
  /** 季度增减 (新增/增持/减持/不变) */
  change?: string
  /** 当日涨跌幅（%） */
  changeRate?: number | null
  /** 东方财富市场代码 */
  emMarketCode?: string
  /** stockCodesNew 原始条目字符串（如 '105.ASML'/'285A JP'/'000660'），
   *  供市场标签展示接口第一步返回的原文与调试查看。 */
  rawEntry?: string
}

/** 推算持仓项 - 在明细基础上标注是否为推算值 */
export interface EstimatedHoldingItem extends HoldingDetailItem {
  /** 是否为推算值（非前十大从全量报告按比例推算的为 true） */
  isEstimated: boolean
}

/** 优化元数据 - 记录推算采用的方法与覆盖度 */
export interface OptimizationMeta {
  /** 推算方法：optimization=单日净值约束优化，proportional-scaling=纯比例缩放 */
  method: 'optimization' | 'proportional-scaling'
  /** 使用的净值天数 */
  navDaysUsed: number
  /** 持仓股数据覆盖率（有涨跌数据的占比） */
  stockCoverage: number
  /** 被优化器剔除的股票代码 */
  droppedStocks?: string[]
}

/**
 * 推算持仓结果 - 基于季报前十大 + 最近全量报告（年报/半年报）按比例缩放，
 * 再以单日净值约束优化调整。
 *
 * stockQuoteMap 为推算过程中已拉取的股票行情，供缓存复用避免重复请求；
 * 后台 Yahoo 涨跌异步填充此 Map，stockQuotesReady resolve 后才完整。
 */
export interface EstimatedHoldings {
  fundCode: string
  quarterReportDate: string
  annualReportDate: string
  description: string
  holdings: EstimatedHoldingItem[]
  optimizationMeta: OptimizationMeta
  /** 推算过程已拉取的股票行情 - 供缓存复用；Yahoo 后台异步填充 */
  stockQuoteMap?: Map<string, StockQuoteInfo>
  /** 后台 Yahoo 涨跌填充完成的信号（resolve 后 stockQuoteMap 完整）；无后台任务时 undefined */
  stockQuotesReady?: Promise<void>
}

/** 年度持仓查询结果 - 按年份查各季度报告 */
export interface YearlyHoldingsResult {
  year: string
  reports: FundAllHoldings[]
  error?: string
}

// ===== 基金详情（精简，仅估值流程用到的顶层字段）=====
// 详情子结构（资产配置/十大重仓/持有人结构/排名/业绩评价）阶段2不实现，
// 阶段4 UI 迁移时按需再补类型，不在此预留骨架。

/** 基金基本信息 - 仅保留估值流程实际用到的顶层字段 */
export interface FundInfo {
  /** 基金代码 */
  fundCode: string
  /** 基金名称 */
  fundName: string
  /** 基金类型（如：混合型-偏债、股票型等） */
  fundType: string
  /** 成立日期 */
  establishDate?: string
  /** 基金规模（亿元） */
  fundScale?: string
  /** 基金经理 */
  fundManager?: string
}

// ===== 缓存 =====

/** 基金缓存数据 - localStorage 存储结构 */
export interface FundCache {
  /** 基金代码 */
  fundCode: string
  /** 基金名称 */
  fundName: string
  /** 缓存的估值数据 */
  valuation: FundValuation | null
  /** 缓存的详细信息 */
  info: FundInfo | null
  /** 缓存时间戳（毫秒） */
  cachedAt: number
  /** 缓存日期字符串（格式：2024-01-15） */
  cachedDate: string
}

// ===== 搜索与目录 =====

/** 基金搜索结果项 */
export interface SearchResult {
  /** 基金代码 */
  fundCode: string
  /** 基金名称 */
  fundName: string
  /** 基金类型 */
  fundType: string
}

/** 基金目录条目 - fundcode_search.js 返回的每条记录 */
export interface FundCatalogItem {
  /** 基金代码 */
  fundCode: string
  /** 拼音 */
  pinyin: string
  /** 基金名称 */
  fundName: string
  /** 基金类型 */
  fundType: string
}

/** 已知基金经理记录 - 用于变更检测 */
export interface KnownManager {
  /** 基金代码 */
  fundCode: string
  /** 基金名称 */
  fundName: string
  /** 基金经理姓名 */
  managerName: string
  /** 上次检测日期 (YYYY-MM-DD) */
  updatedAt: string
}

/** 基金经理变更记录（检测到变更时产生） */
export interface ManagerChange {
  /** 基金代码 */
  fundCode: string
  /** 基金名称 */
  fundName: string
  /** 原经理 */
  oldManager: string
  /** 新经理 */
  newManager: string
}

// ===== 用户持仓 =====

/**
 * 持仓记录 - 用户手动录入的基金持有信息。
 * 持仓金额/累计收益统一由涨跌幅驱动实时计算，不存遗留的 holdingAmount/accumulatedProfit/lastConfirmedNav 字段。
 */
export interface Holding {
  /** 持仓唯一ID */
  id: string
  /** 基金代码 */
  fundCode: string
  /** 持有份额 */
  shares: number
  /** 每份成本价 */
  costPrice: number
  /** 持仓日期（格式：2024-01-15） */
  holdingDate: string
  /** 添加时间戳 */
  createdAt: number
  /** 是否已结算 */
  settled: boolean
  /** 投入金额（用于精确计算，避免 shares 浮点来回传播误差） */
  initialAmount?: number
  /** 昨日持有金额 - 上一次确认后的持有金额，用于涨跌幅驱动计算 */
  yesterdayAmount?: number
  /** 最后确认日期 - jzrq 格式，用于防止重复更新 yesterdayAmount */
  lastConfirmedDate?: string
  /** 确认时的基数金额 - syncYesterdayAmounts 推进前的值，
   *  用于保证今日收益数值不受推进影响 */
  confirmedBaseAmount?: number
}

// ===== 列表配置 =====

/** 视图模式 */
export type ViewMode = 'table' | 'card'

/** 排序字段 */
export type SortField = 'fundCode' | 'fundName' | 'changeRate' | 'holdingAmount' | 'lastNetValue' | 'todayProfit' | 'totalProfit' | 'totalReturnRate' | 'costPrice'

/** 排序方向 */
export type SortDirection = 'asc' | 'desc'

/** 表格列配置 */
export interface ColumnConfig {
  /** 列唯一标识 */
  key: string
  /** 列标题 */
  title: string
  /** 列宽度（像素） */
  width: number
  /** 是否可排序 */
  sortable: boolean
  /** 是否默认可见 */
  visible: boolean
  /** 排序方向 */
  sortDirection?: 'asc' | 'desc' | null
}
