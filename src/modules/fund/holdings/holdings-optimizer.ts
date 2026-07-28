/**
 * 持仓权重约束优化求解器 - 投影梯度下降 + L1 正则化
 *
 * 目标：从基金单日净值涨跌 + 持仓股单日涨跌，反推各持仓股的权重（占比）。
 * 季报只披露前十大，非前十大靠此优化器结合最近年报/半年报比例推算。
 *
 * 目标函数：
 *   minimize  sum_t (r_fund[t] - sum_i w[i]*r_stock[i][t]/100)^2
 *             + lambda * sum_{i not in top10} |w[i]|
 * 约束：
 *   - 十大重仓：w[i] = w0[i]（锁定为报告值，不可修改）
 *   - 非十大：w[i] >= 0，单只上限 weightCap
 *   - 总仓位：sum_i w[i] in [totalMin, totalMax]
 *
 * 纯计算，无 I/O 依赖。参数走 config（ESTIMATE_CONFIG）。
 */

export interface OptimizationConfig {
  /** L1 正则化系数（惩罚非十大权重，鼓励稀疏） */
  lambda: number
  /** 最大迭代次数 */
  maxIter: number
  /** 收敛阈值（权重最大变化小于此值则停止） */
  tol: number
  /** 梯度下降步长 */
  stepSize: number
  /** 总仓位下限（%） */
  totalMin: number
  /** 总仓位上限（%） */
  totalMax: number
  /** 非十大单只权重上限（%） */
  weightCap: number
}

export interface OptimizationInput {
  /** 基金净值日期序列 */
  fundDates: string[]
  /** 基金净值涨跌序列（百分比） */
  fundReturns: number[]
  /** 各股票各日期涨跌（小数形式，如 0.02 = 2%） */
  stockReturns: Map<string, Map<string, number>>
  /** 初始权重（季报前十大 + 年报非十大的初始比例） */
  initialWeights: Map<string, number>
  /** 前十大股票代码集合（权重锁定） */
  top10Codes: Set<string>
  /** 配置覆盖 */
  config?: Partial<OptimizationConfig>
}

export interface OptimizationResult {
  /** 优化后的权重 Map */
  weights: Map<string, number>
  /** 各日期残差 */
  residuals: number[]
  /** 是否收敛 */
  converged: boolean
  /** 实际迭代次数 */
  iterations: number
  /** 被剔除（权重降至阈值下）的股票代码 */
  droppedCodes: string[]
}

/** 默认配置（可被 ESTIMATE_CONFIG 覆盖） */
const DEFAULT_CONFIG: OptimizationConfig = {
  lambda: 0.5,
  maxIter: 2000,
  tol: 1e-6,
  stepSize: 0.01,
  totalMin: 85,
  totalMax: 98,
  weightCap: 15,
}

/** 权重低于此值视为剔除 */
const DROP_THRESHOLD = 0.01

export function optimizeHoldings(input: OptimizationInput): OptimizationResult {
  const cfg = { ...DEFAULT_CONFIG, ...input.config }
  const codes = [...input.initialWeights.keys()]
  const N = codes.length
  const T = input.fundDates.length

  if (N === 0 || T === 0) {
    return { weights: new Map(), residuals: [], converged: false, iterations: 0, droppedCodes: [] }
  }

  const w = new Float64Array(N)
  const lo = new Float64Array(N)
  const hi = new Float64Array(N)
  const isTop10 = new Uint8Array(N)
  const hasData = new Uint8Array(N)

  for (let i = 0; i < N; i++) {
    const code = codes[i]
    const w0 = input.initialWeights.get(code) ?? 0
    w[i] = w0
    isTop10[i] = input.top10Codes.has(code) ? 1 : 0

    const srMap = input.stockReturns.get(code)
    hasData[i] = (srMap != null && srMap.size >= 1) ? 1 : 0

    if (isTop10[i]) {
      // 十大锁定：上下界都设为报告值
      lo[i] = w0
      hi[i] = w0
    } else {
      lo[i] = 0
      hi[i] = cfg.weightCap
    }
  }

  // 股票涨跌矩阵 [i][t]
  const sr = new Float64Array(N * T)
  for (let i = 0; i < N; i++) {
    const stockMap = input.stockReturns.get(codes[i])
    for (let t = 0; t < T; t++) {
      sr[i * T + t] = stockMap?.get(input.fundDates[t]) ?? NaN
    }
  }

  let converged = false
  let iterations = 0

  for (let iter = 0; iter < cfg.maxIter; iter++) {
    iterations = iter + 1

    const grad = new Float64Array(N)

    // 残差梯度：对每个有数据的股票累积梯度
    for (let t = 0; t < T; t++) {
      let portfolioReturn = 0
      for (let i = 0; i < N; i++) {
        if (!hasData[i]) continue
        const r = sr[i * T + t]
        if (Number.isNaN(r)) continue
        portfolioReturn += w[i] * r / 100
      }
      const error = input.fundReturns[t] - portfolioReturn

      for (let i = 0; i < N; i++) {
        if (!hasData[i]) continue
        const r = sr[i * T + t]
        if (Number.isNaN(r)) continue
        grad[i] += -2 * error * r / 100
      }
    }

    // L1 正则梯度（仅非十大且有数据）
    for (let i = 0; i < N; i++) {
      if (!isTop10[i] && hasData[i]) {
        if (w[i] > 0) grad[i] += cfg.lambda
        else if (w[i] < 0) grad[i] -= cfg.lambda
      }
    }

    const wOld = Float64Array.from(w)
    // 梯度下降
    for (let i = 0; i < N; i++) {
      if (hasData[i]) {
        w[i] -= cfg.stepSize * grad[i]
      }
    }
    // 投影到 [lo, hi]
    for (let i = 0; i < N; i++) {
      w[i] = Math.max(lo[i], Math.min(hi[i], w[i]))
    }
    // 总仓位约束投影
    projectTotalWeight(w, cfg.totalMin, cfg.totalMax, lo, hi)

    // 收敛判定
    let maxChange = 0
    for (let i = 0; i < N; i++) {
      maxChange = Math.max(maxChange, Math.abs(w[i] - wOld[i]))
    }
    if (maxChange < cfg.tol) {
      converged = true
      break
    }
  }

  // 剔除权重过小的股票
  const droppedCodes: string[] = []
  for (let i = 0; i < N; i++) {
    if (w[i] < DROP_THRESHOLD) {
      if (w[i] > 0) droppedCodes.push(codes[i])
      w[i] = 0
    }
  }

  // 计算最终残差
  const residuals: number[] = []
  for (let t = 0; t < T; t++) {
    let portfolioReturn = 0
    for (let i = 0; i < N; i++) {
      if (w[i] === 0) continue
      const r = sr[i * T + t]
      if (Number.isNaN(r)) continue
      portfolioReturn += w[i] * r / 100
    }
    residuals.push(input.fundReturns[t] - portfolioReturn)
  }

  const weights = new Map<string, number>()
  for (let i = 0; i < N; i++) {
    weights.set(codes[i], Math.round(w[i] * 100) / 100)
  }

  return { weights, residuals, converged, iterations, droppedCodes }
}

/** 总仓位约束投影：缩放到 [min,max] 区间后再夹回单只上下界，迭代两次 */
function projectTotalWeight(
  w: Float64Array, min: number, max: number, lo: Float64Array, hi: Float64Array,
): void {
  for (let pass = 0; pass < 2; pass++) {
    let total = 0
    for (let i = 0; i < w.length; i++) total += w[i]

    if (total < min) {
      const scale = min / total
      for (let i = 0; i < w.length; i++) w[i] *= scale
    } else if (total > max) {
      const scale = max / total
      for (let i = 0; i < w.length; i++) w[i] *= scale
    }

    for (let i = 0; i < w.length; i++) {
      w[i] = Math.max(lo[i], Math.min(hi[i], w[i]))
    }
  }
}
