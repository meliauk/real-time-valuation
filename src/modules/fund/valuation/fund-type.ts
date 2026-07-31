/**
 * 基金类型判定（T+2 延迟确认）
 *
 * 判定基金是否为 T+2 延迟确认类型，用于估值合并时决定净值滞后天数
 * （delayDays=1 国内基金 / 2 T+2 基金）。
 *
 * 规则：fundType 精确等于下列 T+2 白名单其一 → T+2，其余全部 T+1。
 *   - QDII 各细分（QDII-纯债/混合偏股/混合债/混合灵活/商品/混合平衡/REITs/FOF）
 *   - FOF 各细分（FOF-稳健型/进取型/均衡型）
 *   - 商品
 *
 * ⚠️ 用「精确等于」而非「包含关键词」：旧版含「海外」会把「指数型-海外股票」
 *   这类港股指数基金误判 T+2（如恒生科技 013309 实为 T+1 当日确认）。
 *   白名单由实测东财目录 fundType 取值整理而来，覆盖所有真实 T+2 类型。
 *   fundType 取不到（空串）按 T+1 兜底。
 */

/** T+2 精确白名单：fundType 须完全等于其一才算 T+2（来自东财目录实测整理） */
const T2_EXACT_TYPES = new Set<string>([
  'QDII-纯债',
  'QDII-混合偏股',
  'QDII-混合债',
  'QDII-混合灵活',
  'QDII-商品',
  'QDII-混合平衡',
  'QDII-REITs',
  'QDII-FOF',
  "QDII-普通股票",
  'FOF-稳健型',
  'FOF-进取型',
  'FOF-均衡型',
  '商品',
])

/** 判断基金类型是否为 T+2（fundType 精确等于白名单其一） */
export function isT2FundType(fundType: string): boolean {
  if (!fundType) return false
  return T2_EXACT_TYPES.has(fundType.trim())
}

/**
 * 综合判定基金的 T+2 延迟天数。
 * @param fundType 基金类型字符串（可能为空，空按 T+1 兜底）
 * @returns 1=T+1（国内基金），2=T+2（海外/QDII/FOF/商品等）
 */
export function detectDelayDays(fundType: string): 1 | 2 {
  return isT2FundType(fundType) ? 2 : 1
}

// ===== 基金确认类型（语义化命名，UI 文案统一走此层）=====
//
// delayDays（1/2）是内部实现字段，散布于 20+ 处计算逻辑，不重命名以控风险。
// 此层为 delayDays 的语义化映射，供 UI 显示「这是什么确认节奏的基金」时使用，
// 用「当日确认 / 次日确认」替代不直观的「T+1 / T+2」：
//   - 当日确认（delayDays=1）：国内基金，今天基金公司会更新出【今日】净值（如今天 7.20 更新 7.20）。
//   - 次日确认（delayDays=2）：QDII/FOF 等，今天基金公司会更新出【昨日】净值（如今天 7.20 更新 7.19）。
// 「当日/次日」指"今天能看到哪一天的确认净值"，是用户可感知的数据更新节奏。

/** 基金确认类型：当日确认（国内基金）/ 次日确认（QDII/FOF 等） */
export type FundConfirmType = 'sameDay' | 'nextDay'

/** 由 delayDays 推导确认类型。delayDays 缺失按当日确认兜底。 */
export function getConfirmType(delayDays: 1 | 2 | undefined | null): FundConfirmType {
  return delayDays === 2 ? 'nextDay' : 'sameDay'
}

/** 确认类型的中文短标签（列表/胶囊等紧凑场景）。 */
export function confirmTypeLabel(t: FundConfirmType): string {
  return t === 'nextDay' ? '次日确认' : '当日确认'
}

/** 确认类型的说明文案（详情页/提示等场景，描述"今天能看到哪天的净值"）。 */
export function confirmTypeDesc(t: FundConfirmType): string {
  return t === 'nextDay'
    ? '次日确认：今日更新昨日净值'
    : '当日确认：今日更新今日净值'
}
