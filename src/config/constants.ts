/**
 * 应用配置常量
 *
 * 存储键名、接口地址、刷新间隔、缓存有效期、代理候选、指数预设等固定参数。
 * 各板块从这里取接口地址和参数，避免散落硬编码。
 *
 * 数据源：
 *   - 腾讯 fetch（CORS 放行，Worker 主源）：股票日K fqkline、报价 qt.gtimg
 *   - 东财 JSONP（主线程兜底）：push2/push2his/fundgz/lsjz/F10
 *   - Yahoo fetch+代理（Worker）：chart/search
 *   - 新浪 JSONP（主线程）：盘中估值走势
 */

/** localStorage 存储键名 - 统一前缀 jgb_ 管理避免冲突 */
export const STORAGE_KEYS = {
  /** 用户关注的基金代码列表 */
  FUND_CODES: 'jgb_fund_codes',
  /** 基金代码→名称映射（搜索/目录/估值多源填充，供 fundgz 失败时兜底显示名称） */
  FUND_NAMES: 'jgb_fund_names',
  /** 全量基金代码目录缓存（24h） */
  FUND_CATALOG: 'jgb_fund_catalog',
  /** 持仓数据列表 */
  HOLDINGS: 'jgb_holdings',
  /** 持仓数据版本号 - 结构变更时递增触发迁移 */
  HOLDINGS_VERSION: 'jgb_holdings_version',
  /** 基金数据缓存 */
  FUND_CACHE: 'jgb_fund_cache',
  /** 计划任务列表 */
  TASKS: 'jgb_tasks',
  /** 持仓操作日志 */
  HOLDING_ACTIONS: 'jgb_holding_actions',
  /** 视图模式偏好 */
  VIEW_MODE: 'jgb_view_mode',
  /** 列配置偏好 */
  COLUMN_CONFIG: 'jgb_column_config',
  /** 自动刷新开关 */
  AUTO_REFRESH: 'jgb_auto_refresh',
  /** 刷新间隔秒数 */
  REFRESH_INTERVAL: 'jgb_refresh_interval',
  /** 已知基金经理记录 */
  FUND_MANAGERS: 'jgb_fund_managers',
  /** 标签筛选偏好 */
  ACTIVE_TAB: 'jgb_active_tab',
  /** T+1 待确认操作 */
  PENDING_ACTIONS: 'jgb_pending_actions',
  /** 用户勾选的指数列表 */
  SELECTED_INDICES: 'jgb_selected_indices',
  /** 自选关注股票列表 */
  WATCHLIST: 'jgb_watchlist',
  /** 自选股行情缓存（刷新后预热，避免首屏全 --） */
  STOCK_QUOTES_CACHE: 'jgb_stock_quotes_cache',
  /** 自选股行情缓存写入日期（跨日失效重拉） */
  STOCK_QUOTES_DATE: 'jgb_stock_quotes_date',
  /** 资讯来源黑名单 */
  NEWS_BLACKLIST: 'jgb_news_blacklist',
  /** 已读资讯标题集合 */
  NEWS_READ: 'jgb_news_read',
  /** Yahoo symbol 解析缓存 {code:{symbol,timestamp}}，7天有效 */
  YAHOO_SYMBOL_CACHE: 'jgb_yahoo_symbol_cache',
  /** 板块榜单市场切换：场内 / 场外 */
  SECTOR_MARKET: 'jgb_sector_market',
  /** 板块榜单维度切换：涨幅榜 / 资金流向 / 成交额 等 */
  SECTOR_METRIC: 'jgb_sector_metric',
  /** 盘中分时点缓存（刷新后预热，避免首屏缩略图空白） */
  INTRADAY_MAP: 'jgb_intraday_map',
  /** 分时点缓存写入日期（跨日失效重生成） */
  INTRADAY_MAP_DATE: 'jgb_intraday_map_date',
  /** 各市场法定节假日缓存（Nager.Date 取数，按年；跨年重取） */
  MARKET_HOLIDAYS: 'jgb_market_holidays',
  /** T+2 持仓股票收盘涨跌幅全局缓存（按交易日，跨日失效重拉） */
  STOCK_PREV_DAY_CACHE: 'jgb_stock_prev_day_cache',
  /** 收盘涨跌幅缓存写入日期（交易日校验） */
  STOCK_PREV_DAY_DATE: 'jgb_stock_prev_day_date',
  /** 持仓股票实时涨跌幅全局缓存（T+1/T+2 共享，跨日失效重拉） */
  STOCK_REALTIME_CACHE: 'jgb_stock_realtime_cache',
  /** 实时涨跌幅缓存写入日期（交易日校验） */
  STOCK_REALTIME_DATE: 'jgb_stock_realtime_date',
  /** T+2 基金持仓加权推算估值涨跌幅缓存（重启首屏预热，避免 T+2 今日涨跌长时间 --） */
  ESTIMATED_GSZZL_CACHE: 'jgb_estimated_gszzl_cache',
  /** 推算估值涨跌幅缓存写入日期（美股基准日校验，跨日失效重算） */
  ESTIMATED_GSZZL_DATE: 'jgb_estimated_gszzl_date',
  /** 推算持仓缓存（recompute 依赖它算 gszzl/realtimeGszzl，重启首屏预热） */
  ESTIMATED_HOLDINGS_CACHE: 'jgb_estimated_holdings_cache',
  /** 推算持仓缓存写入日期（今日戳校验，跨日失效重取） */
  ESTIMATED_HOLDINGS_DATE: 'jgb_estimated_holdings_date',
  /** 指数行情缓存（刷新后预热，避免首屏全 --） */
  INDEX_QUOTES_CACHE: 'jgb_index_quotes_cache',
  /** 指数行情缓存写入日期（跨日失效重拉） */
  INDEX_QUOTES_DATE: 'jgb_index_quotes_date',
  /** 用户设置（主题/海外资讯开关等） */
  USER_SETTINGS: 'jgb_user_settings',
  /** 随机用户称呼（机器特征派生，未来用户管理入口预留） */
  RANDOM_NICKNAME: 'jgb_random_nickname',
  /** 账号体系：注册用户列表 + 当前登录态（邮箱注册/登录） */
  AUTH: 'jgb_auth',
  /** 启动公告已弹标记（sessionStorage：刷新保留、重启应用清空，控制每次启动弹一次） */
  STARTUP_NOTICE_SHOWN: 'jgb_startup_notice_shown',
} as const

/** 腾讯接口地址（CORS 放行，Worker 内 fetch 主源） */
export const TENCENT_URLS = {
  /**
   * 腾讯日K线 fqkline（A股 qfqday / 港美 day），收盘涨跌用。
   * ⚠️ 必须用 ifzq.gtimg.cn（无 web. 前缀）：web.ifzq.gtimg.cn 不发 CORS 头被拦，
   *    Worker 内 fetch 报 Failed to fetch；ifzq.gtimg.cn 隐式放行可读 body。
   */
  FQKLINE: 'https://ifzq.gtimg.cn/appstock/app/fqkline/get',
  /** 腾讯实时报价 qt.gtimg（GBK，按 ~ split），实时涨跌用 */
  QUOTE: 'https://qt.gtimg.cn/q=',
} as const

/** 天天基金网 / 东方财富接口地址（JSONP，主线程兜底用） */
export const API_URLS = {
  /** 实时估值 - 天天基金网 JSONP，返回估值净值和涨跌幅 */
  VALUATION: 'https://fundgz.1234567.com.cn/js/',
  /** 基金详情 - 东方财富 pingzhongdata */
  FUND_DETAIL: 'https://fund.eastmoney.com/pingzhongdata/',
  /** 历史净值 - 东方财富 F10 lsjz（fundgz 失败时回退） */
  F10_LSJZ: 'https://fundf10.eastmoney.com/F10DataApi.aspx',
  /** 基金搜索 - 东方财富搜索 API */
  SEARCH: 'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx',
  /** 基金基本信息 - 东方财富基金概览 JS */
  FUND_INFO: 'https://fund.eastmoney.com/js/',
  /** 基金代码目录 - 东方财富全量基金代码+名称+类型 */
  FUND_CODE_SEARCH: 'https://fund.eastmoney.com/js/fundcode_search.js',
  /** 基金持仓明细 - 东方财富 F10 FundArchivesDatas（JSONP callback=apidata） */
  F10_HOLDINGS: 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx',
  /** 新浪盘中估值走势（当日开盘到当前时刻序列，JSONP） */
  INTRADAY_ESTIMATE: 'https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getEstimateNetworthPic',
  /** 股票行情批量 - 东方财富 Push2（实时价格/涨跌幅，JSONP，主线程兜底） */
  STOCK_QUOTES: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
  /** 股票历史K线 - 东方财富 push2his（日K，JSONP，主线程兜底） */
  STOCK_KLINE: 'https://push2his.eastmoney.com/api/qt/stock/kline/get',
  /** 东方财富快讯（JSONP） */
  EASTMONEY_NEWS: 'https://push2.eastmoney.com/api/qt/clist/get',
  /** 板块热门榜 - 东方财富 clist（场内 ETF，JSONP cb=）
   *  涨幅榜 fid=f3、资金流向榜 fid=f62，同接口不同排序字段 */
  SECTOR_RANK: 'https://push2.eastmoney.com/api/qt/clist/get',
  /** 东方财富股票搜索 suggest（JSONP） */
  STOCK_SEARCH: 'https://searchapi.eastmoney.com/api/suggest/get',
  /** Yahoo Finance chart API（行情+历史K线，需 CORS 代理） */
  YAHOO_CHART: 'https://query1.finance.yahoo.com/v8/finance/chart',
  /** Yahoo Finance search API（股票搜索/符号解析，需 CORS 代理） */
  YAHOO_SEARCH: 'https://query1.finance.yahoo.com/v1/finance/search',
  /** GLM 视觉模型 API（走 vite proxy /api/glm → open.bigmodel.cn，规避 CORS） */
  GLM_API: '/api/glm/chat/completions',
  /** Nager.Date 公共节假日 API（带 CORS 头，主线程 fetch 直接可用，无需代理） */
  NAGER_HOLIDAYS: 'https://date.nager.at/api/v3/PublicHolidays',
} as const

/** GLM 视觉识别配置 */
export const GLM_CONFIG = {
  /** 模型名（glm-4v-flash 免费视觉模型） */
  MODEL: 'glm-4v-flash',
  /** 请求超时（毫秒，视觉识别较慢） */
  TIMEOUT: 30000,
  /** API Key（硬编码，build 后进 bundle 明文——前端零后端固有限制） */
  API_KEY: '5f5d5b56a328816a3e3cf764affbb7b8.31N6wWUNZjAtNqi4',
} as const

/**
 * EmailJS 邮件服务配置 - 注册验证码发信用。
 *
 * EmailJS 允许浏览器直调其 REST API 发邮件（CORS 放行），无需后端；在 EmailJS 后台
 * 接入 QQ 邮箱 SMTP（2831140538@qq.com）作为发件源。免费层 200 封/月。
 *
 * ⚠️ PUBLIC_KEY 是 EmailJS 公钥（非 QQ 邮箱 SMTP 授权码），build 后进 bundle 明文可被
 *    任何人读出滥用刷邮件额度——与 GLM API Key 同等风险等级，本项目既有先例。
 *
 * 接入步骤见 plan 文件：注册 emailjs.com → Custom SMTP 填 QQ 邮箱授权码 → 建模板
 * （变量 {{to_email}} {{code}} {{expire}}）→ 拿 service_id/template_id/public_key 填下方。
 * 三项任一为空 → email-service 自动降级为「控制台打印验证码 + Toast 提示」，UI 流程照常跑通。
 */
export const EMAILJS_CONFIG = {
  /** EmailJS Service ID（接入 QQ 邮箱 SMTP 后获得） */
  SERVICE_ID: '',
  /** EmailJS Template ID（模板正文用 {{code}} {{to_email}} {{expire}} 变量） */
  TEMPLATE_ID: '',
  /** EmailJS Public Key（Account → API Keys，非 SMTP 授权码） */
  PUBLIC_KEY: '',
  /** EmailJS REST 发信端点 */
  SEND_URL: 'https://api.emailjs.com/api/v1.0/email/send',
  /** 发件邮箱（EmailJS 后台 SMTP 配置的 From） */
  FROM_EMAIL: '2831140538@qq.com',
  /** 验证码有效期（分钟） */
  CODE_EXPIRE_MIN: 5,
  /** 同邮箱重发间隔限制（秒） */
  RESEND_LIMIT_SEC: 60,
} as const

/** 账号体系通用配置 */
export const AUTH_CONFIG = {
  /** 密码最小长度 */
  PASSWORD_MIN_LEN: 8,
  /** 验证码长度（位数） */
  CODE_LENGTH: 6,
  /** 密码盐字节数 */
  SALT_BYTES: 16,
} as const

/**
 * Yahoo/RSS 请求用的 CORS 代理候选列表（按优先级）。
 * 实测仅 allorigins 的 /get 端点稳定可用：
 *   - corsproxy 对 Yahoo chart 返 404；allorigins-raw 在 Worker 内被 CORS 拦截；thingproxy 经常宕机。
 * 故只保留 allorigins-get，配合 proxy-rotation 的循环重试（单代理失败靠重试而非切换）。
 * 每项：
 *   build(targetUrl) → 完整代理 URL
 *   wrap             → true=响应 {contents,status} 包裹(需二次 parse)；false=直传原始内容
 */
export const YAHOO_PROXY_CANDIDATES: ReadonlyArray<{
  name: string
  build: (targetUrl: string) => string
  /** true=响应是 {contents,status} 包裹(需二次 parse)；false=直传原始内容 */
  wrap: boolean
}> = [
  { name: 'allorigins-get', build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, wrap: true },
]

/** 单个代理连续失败多少次后熔断（冷却期内跳过该代理） */
export const PROXY_BREAK_THRESHOLD = 3
/** 代理熔断冷却时长（毫秒）——缩短到20s：代理限流通常短暂，激进熔断快速止血的同时尽快恢复重试（旧代码60s过保守） */
export const PROXY_BREAK_COOLDOWN_MS = 20 * 1000
/** Yahoo 代理全局熔断冷却（所有候选都失败时，overseasLoop 转长心跳降频）——同20s，尽快恢复 */
export const PROXY_GLOBAL_COOLDOWN_MS = 20 * 1000

/** Yahoo symbol 解析与取数配置 */
export const YAHOO_CONFIG = {
  /** symbol 缓存有效期（毫秒，7天） */
  SYMBOL_CACHE_TTL: 7 * 24 * 60 * 60 * 1000,
  /** Yahoo chart close 模式 range */
  CHART_CLOSE_RANGE: '1mo',
  /** Yahoo 取数并发槽（close/realtime 各 2，经实测调大可提速且未明显加剧代理限流） */
  SLOT_CAP_PER_SOURCE: 2,
  /** Yahoo 取数超时（毫秒） */
  FETCH_TIMEOUT: 3000,
  /** Yahoo 取数重试次数（非代理层失败） */
  RETRIES: 1,
  /** Yahoo symbol 解析并发数（调大加速 symbol 解析阶段） */
  SYMBOL_CONCURRENCY: 3,
  /** Yahoo Search 单次取条数（多取几条按 code 前缀校验挑吻合，提高纯数字台韩股命中率） */
  SEARCH_MATCH_COUNT: 5,
} as const

/** F10 持仓/净值接口配置（东方财富 fundf10，JSONP，主线程串行） */
export const F10_CONFIG = {
  /** 全量持仓请求条数上限（年报/半年报） */
  TOPLINE_FULL: 200,
  /** 十大重仓请求条数上限（季报） */
  TOPLINE_TOP10: 10,
  /** F10 加载超时（毫秒）- 兼容 var apidata 和 apidata() 两种格式 */
  TIMEOUT: 6000,
} as const

/** F10 历史净值分页配置（lsjz，JSONP 串行） */
export const LSJZ_CONFIG = {
  /** 每页净值记录数 */
  PER_PAGE: 500,
  /** 单页加载超时（毫秒） */
  TIMEOUT: 8000,
} as const

/** T+2 持仓推算配置（季报前十大 + 年报全量比例缩放 + 优化器约束） */
export const ESTIMATE_CONFIG = {
  /** 季报查询年份回溯上限（从当年往前找最近季报） */
  QUARTER_YEAR_OFFSET_MAX: 2,
  /** 年报查询年份回溯上限（从季报年份往前找最近全量报告） */
  ANNUAL_YEAR_OFFSET_MAX: 3,
  /** 优化器触发门槛：有涨跌数据的股票数少于则不优化（用纯比例缩放） */
  STOCKS_WITH_DATA_MIN: 5,
  /** 优化器触发门槛：有数据股票的总权重低于则不优化（%） */
  WEIGHT_WITH_DATA_MIN: 20,
  /** 推算持仓/T+1持仓缓存 LRU 上限 */
  MAX_ESTIMATED_CACHE: 50,
  /** 优化器参数（见 holdings-optimizer.ts OptimizationConfig） */
  OPTIMIZER: {
    lambda: 0.01,
    maxIter: 3000,
    tol: 1e-6,
    stepSize: 0.01,
    totalMin: 85,
    totalMax: 98,
    weightCap: 15,
  },
} as const

/** 基金估值取数配置（fundgz JSONP + lsjz，主线程） */
export const FUND_VALUATION_CONFIG = {
  /** fundgz 请求超时（毫秒） */
  FUNDGZ_TIMEOUT: 4000,
  /** fundgz 失败重试次数（含首次） */
  FUNDGZ_RETRIES: 2,
  /** fundgz 重试退避基数（毫秒，递增 attempt × 基数） */
  FUNDGZ_RETRY_BACKOFF: 300,
  /** 基金类型缓存 LRU 上限 */
  FUND_TYPE_CACHE_MAX: 200,
  /** 批量估值并发数（lsjz 走 window.apidata 全局串行回调队列，并发过大会排队争抢导致超时；
   *  手机端并发能力弱，取 3 兼顾速度与稳定，避免触发 fundgz 重试堆积） */
  BATCH_CONCURRENCY: 3,
  /** 基金经理检测并发数（取 pingzhongdata，避免串行队列撑满） */
  MANAGER_CHECK_CONCURRENCY: 3,
} as const

/** 盘中分时走势配置 */
export const INTRADAY_CONFIG = {
  /** 分时点时间间隔（分钟） */
  INTERVAL_MINUTES: 15,
  /** 新浪盘中估值取数超时（毫秒） */
  FETCH_TIMEOUT: 4000,
  /** 新浪分时走势批量拉取并发数（防新浪限流） */
  FETCH_BATCH: 5,
} as const

/** 各市场法定节假日取数配置（Nager.Date） */
export const HOLIDAY_CONFIG = {
  /** Nager 取数超时（毫秒） */
  FETCH_TIMEOUT: 6000,
  /** 批量取各市场节假日的并发数（9 个市场，分批取） */
  FETCH_CONCURRENCY: 3,
  /** 需取节假日的主要市场（国家码映射在 holiday-service） */
  MARKETS: ['A', 'HK', 'US', 'JP', 'KR', 'TW', 'DE', 'FR', 'UK'] as const,
} as const

/** 基金目录/搜索配置 */
export const FUND_CATALOG_CONFIG = {
  /** 基金搜索关键词最小长度（短于此不搜） */
  SEARCH_MIN_KEYWORD: 2,
  /** 搜索返回条数 */
  SEARCH_PAGE_SIZE: 50,
  /** 搜索 JSONP 超时（毫秒） */
  SEARCH_TIMEOUT: 6000,
  /** 全量目录 localStorage 缓存有效期（毫秒，24h） */
  CATALOG_CACHE_DURATION: 24 * 60 * 1000 * 60,
  /** 目录加载超时（毫秒） */
  CATALOG_TIMEOUT: 4000,
} as const

/** 基金板块 loop 调度配置（service 层用） */
export const FUND_LOOP_CONFIG = {
  /** 收盘线日K取数：service 层每批发给 Worker 的只数 */
  KLINE_SERVICE_BATCH: 20,
  /** 收盘线日K取数：Worker 内并发数（每批内同时 fetch 腾讯的只数） */
  KLINE_WORKER_CONCURRENCY: 6,
  /** 收盘线日K兜底批大小（东财 push2his JSONP） */
  KLINE_BATCH: 4,
  /** 收盘线日K兜底批间隔（毫秒） */
  KLINE_BATCH_GAP: 400,
  /** 实时线报价每批只数（push2 批量支持多只） */
  REALTIME_BATCH: 80,
  /** 全齐后心跳复查间隔（毫秒） */
  HEARTBEAT_INTERVAL: 60 * 1000,
  /** 东财 JSONP 兜底超时（毫秒） */
  EM_FALLBACK_TIMEOUT: 5000,
  /** Worker 请求超时（毫秒）——需容纳 batch 内8路串行处理全量(每只代理fetch+重试)，
   *  故调大到30s，避免 batch 整体超时导致 service 拿不到已取数据。单轮慢但成功率高，靠 loop 接力无限重试。 */
  WORKER_TIMEOUT: 30 * 1000,
  /**
   * 日K脏 bar 过滤阈值（天）：与最新 bar 日期跨度超过此值的视为历史脏数据剔除。
   * 腾讯无后缀美股重试偶发返回"首条(如2011)+最新"的混合序列，跨年脏 bar 会导致
   * 涨跌算出几百%的离谱值。正常连续交易日 bar 都在最近几天，不会误剔。
   */
  KLINE_DIRTY_BAR_MAX_DAYS: 60,
} as const

/** 应用默认设置 */
export const DEFAULT_SETTINGS = {
  /** 默认自动刷新开关 */
  AUTO_REFRESH: true,
  /** 默认刷新间隔（秒） */
  REFRESH_INTERVAL: 5,
  /** 缓存有效期（毫秒）- 4小时后缓存失效 */
  CACHE_DURATION: 4 * 60 * 60 * 1000,
  /** 估值数据有效期（毫秒）- 估值仅在交易日当天内有效 */
  VALUATION_DURATION: 24 * 60 * 60 * 1000,
  /** 请求超时时间（毫秒） */
  REQUEST_TIMEOUT: 4000,
  /** 默认视图模式 */
  VIEW_MODE: 'table',
  /** 默认列配置（可见列及顺序） */
  VISIBLE_COLUMNS: [
    'fundCode', 'fundName', 'changeRate', 'todayProfit',
    'holdingAmount', 'totalProfit',
    'lastNetValue', 'costPrice', 'holdingDate', 'valuationTime', 'actions',
  ] as readonly string[],
} as const

/** 交易时间段（A股，仅在这些时段内请求实时估值） */
export const TRADING_HOURS = {
  MORNING_OPEN: '09:30',
  MORNING_CLOSE: '11:30',
  AFTERNOON_OPEN: '13:00',
  AFTERNOON_CLOSE: '16:00',
} as const

/** 数字格式化配置 */
export const NUMBER_FORMAT = {
  /** 金额显示小数位数 */
  MONEY_DECIMALS: 2,
  /** 涨跌幅显示小数位数 */
  RATE_DECIMALS: 2,
  /** 净值显示小数位数 */
  NET_VALUE_DECIMALS: 4,
  /** 份额显示小数位数 */
  SHARES_DECIMALS: 2,
} as const

/**
 * 预设指数列表 - 用于滚动条和行情页。
 * 当前指数保持东财 JSONP 主线程取数（secid 批量）；未来可切腾讯 qt.gtimg。
 * secid 前缀：1=沪,0=深,100=全球指数,124=日,130=韩,118=台...
 */
export const INDEX_PRESETS = [
  // A 股
  { secid: '1.000001', code: '000001', name: '上证指数', market: 'sh' },
  { secid: '0.399001', code: '399001', name: '深证成指', market: 'sz' },
  { secid: '0.399006', code: '399006', name: '创业板指', market: 'sz' },
  { secid: '1.000688', code: '000688', name: '科创50', market: 'sh' },
  { secid: '1.000300', code: '000300', name: '沪深300', market: 'sh' },
  { secid: '1.000905', code: '000905', name: '中证500', market: 'sh' },
  { secid: '1.000016', code: '000016', name: '上证50', market: 'sh' },
  { secid: '0.399673', code: '399673', name: '创业板50', market: 'sz' },
  // 港股
  { secid: '100.HSI', code: 'HSI', name: '恒生指数', market: 'hk' },
  { secid: '100.HSCEI', code: 'HSCEI', name: '国企指数', market: 'hk' },
  { secid: '124.HSTECH', code: 'HSTECH', name: '恒生科技', market: 'hk' },
  // 美股
  { secid: '100.DJIA', code: 'DJIA', name: '道琼斯', market: 'us' },
  { secid: '100.NDX', code: 'NDX', name: '纳斯达克', market: 'us' },
  { secid: '100.SPX', code: 'SPX', name: '标普500', market: 'us' },
  // 亚太
  { secid: '100.N225', code: 'N225', name: '日经225', market: 'jp' },
  { secid: '100.KS11', code: 'KS11', name: '韩国KOSPI', market: 'kr' },
  { secid: '100.TWII', code: 'TWII', name: '台湾加权', market: 'tw' },
  // 欧洲
  { secid: '100.FTSE', code: 'FTSE', name: '英国富时100', market: 'uk' },
  { secid: '100.GDAXI', code: 'GDAXI', name: '德国DAX30', market: 'de' },
  { secid: '100.FCHI', code: 'FCHI', name: '法国CAC40', market: 'fr' },
] as const

/** 默认勾选的指数 */
export const DEFAULT_SELECTED_INDICES = ['1.000001', '0.399001', '0.399006', '100.HSI', '100.DJIA', '100.NDX']

/** 基金类型分类标签（UI 配色） */
export const FUND_TYPE_TAGS = {
  '股票型': { color: '#ef4444', label: '股' },
  '混合型-偏股': { color: '#f97316', label: '偏股' },
  '混合型-平衡': { color: '#eab308', label: '平衡' },
  '混合型-偏债': { color: '#22c55e', label: '偏债' },
  '债券型': { color: '#3b82f6', label: '债' },
  '指数型': { color: '#8b5cf6', label: '指' },
  'QDII': { color: '#06b6d4', label: 'QDII' },
  'FOF': { color: '#ec4899', label: 'FOF' },
  '货币型': { color: '#14b8a6', label: '货' },
} as const

/**
 * Worker 名称注册表。
 * WorkerManager 用这些名字创建/调度对应 Worker。
 * 新增板块只需在此加一行 + 建 worker 文件。
 */
export const WORKER_NAMES = {
  /** 基金-东财收盘线 */
  FUND_EM_CLOSE: 'fund-em-close',
  /** 基金-东财实时线 */
  FUND_EM_REALTIME: 'fund-em-realtime',
  /** 基金-Yahoo综合线 */
  FUND_YAHOO: 'fund-yahoo',
  /** 指数板块（占位，当前主线程） */
  INDEX: 'index',
  /** 股票板块 */
  STOCK: 'stock',
  /** 资讯板块 */
  NEWS: 'news',
  /** 预留板块 */
  RESERVED: 'reserved',
} as const
