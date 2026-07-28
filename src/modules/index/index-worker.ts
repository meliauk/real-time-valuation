/**
 * 指数板块 Worker（占位，未启用）
 *
 * 指数走主线程东财 push2 secid 批量 JSONP（见 plan §2.4 用户决定），
 * 不进 Worker——指数请求量小（20 个）、主线程够用，且东财接口无 CORS 头 Worker 内 fetch 不可用。
 *
 * 本文件占位保留，未来若指数改走腾讯 qt.gtimg fetch 进 Worker 时启用。
 */

export {}
