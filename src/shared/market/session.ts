/**
 * 美股交易时段分类（PRE/REGULAR/POST/OFF）
 *
 * 用于 Yahoo realtime 模式：marketState 缺失（盘外）时从 2m bar 序列取"最新可得"时段数据。
 *
 * 边界（美东本地 HH:mm，夏令时在内处理）：
 *   PRE     04:00 ~ 09:30  盘前
 *   REGULAR 09:30 ~ 16:00  盘中
 *   POST    16:00 ~ 20:00  盘后
 *   OFF     其余           盘外（无实时 bar）
 *
 * 提供两个入口：按 UTC 毫秒、按 Yahoo bar 时间戳（秒）分类到美东时段。
 */

export {
  /** UTC 毫秒 → 美东时段 */
  classifyUSSessionByMs,
  /** Yahoo bar 时间戳（秒）→ 美东时段 */
  classifyUSSessionByTs,
} from './trading-day'
