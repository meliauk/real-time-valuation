# 基金板块（fund）说明

> 板块定位：本项目核心板块。负责基金估值涨跌幅的全链路计算——从持仓取数、市场分流、各市场涨跌取数，到加权推算基金估值。
> 并发架构：本板块独占 **3 个 Web Worker**（东财收盘线 + 东财实时线 + Yahoo综合线），是 Worker 最多的板块。
> 拆分原则：板块内按功能分子目录，每功能一文件。

---

## 一、为什么 3 个 Worker

基金持仓股横跨全球市场，数据源和涨跌口径不同，且两类取数"脾气"相反：

- **东财覆盖的市场（A/HK/US）**：改用**腾讯 fetch 作主源**（腾讯 fqkline/qt.gtimg 是 CORS 放行的，Worker 内 `fetch` 可读），东财 JSONP 退主线程兜底。
- **东财覆盖差的市场（日韩台欧 + 美股盘前盘后）**：走 Yahoo chart + 公共代理。

拆 3 个 Worker 的依据：
1. **收盘/实时节奏不同**：收盘值稳定不变（取完转心跳），实时值在变（持续刷新）。拆开互不阻塞。
2. **东财/Yahoo 取数源不同**：东财走腾讯 fetch（快、同步节流），Yahoo 走代理（慢、易限流）。拆开互不拖累。
3. **Yahoo 不再拆**：受公共代理限流（并发×3 即全挂），单 Worker 内用并发槽控制。

> 历史背景：初版拟用 importScripts 让东财 JSONP 进 Worker，实测 `NetworkError` 失败，改"腾讯 fetch 主源"路线。详见 `plan/v2.0.md` 第二节。

---

## 二、目录结构（极致细拆）

> 与实际代码同步（2026-07-09 更新）。基金板块全部子目录已落地（36 个 .ts 文件）。

```
src/modules/fund/
├─ described.md
│
├─ workers/                      # —— Worker 线程入口（3 个，✅ 已落地）——
│   ├─ em-close-worker.ts        # Worker① 收盘线（em 为历史命名，主源腾讯 fetch）
│   ├─ em-realtime-worker.ts     # Worker② 实时线
│   └─ yahoo-worker.ts           # Worker③ Yahoo综合线（含 yahoo-quote/yahoo-search 请求类型）
│
├─ services/                     # —— 主线程侧调度（3 个 + symbol解析，✅ 已落地）——
│   ├─ em-close-service.ts       # 收盘线调度（每轮A→HK→US全处理，东财兜底节流，取不到不判failed下轮重试）
│   ├─ em-realtime-service.ts    # 实时线调度（A/HK全量，A/HK收盘转心跳）
│   ├─ yahoo-service.ts          # Yahoo线调度（symbol解析+close补缺+realtime全量，并发槽各2）
│   └─ yahoo-symbol.ts           # Yahoo symbol四级解析+localStorage缓存（search调Worker③）
│
├─ holdings/                     # —— 持仓相关（✅ 已落地）——
│   ├─ f10-apidata-loader.ts     # F10 专用 apidata 串行 JSONP（兼容 var/function 格式）
│   ├─ f10-holdings-fetch.ts     # F10 持仓取数（full topline 200/10、年份兜底、按季度查）
│   ├─ holdings-parser.ts        # F10 持仓 HTML 解析（thead 动态列定位+代码提取+emMarketCode）
│   ├─ holdings-optimizer.ts     # 约束优化求解器（投影梯度下降+L1正则，前十大锁定）
│   ├─ report-date.ts            # 报告期判定（03/06/09/12 → 季/半/三/年报 + isFull）
│   └─ estimated-holdings.ts     # T+2 推算（季报前10+年报全量比例缩放+优化器约束）
│   # 注：三档分流 classifyShare 不在此——shared/market/market-classify.ts 已有，直接复用
│
├─ calc/                         # —— 涨跌计算（纯逻辑，Worker与主线程共用，✅ 已落地）——
│   ├─ prev-day-calc.ts          # 昨日收盘涨跌（日K解析+各市场本地昨日判定+休盘）
│   ├─ realtime-em-calc.ts       # 现价vs昨收实时涨跌口径（纯计算+buildRealtimeQuote）
│   ├─ yahoo-close-calc.ts       # Yahoo 收盘涨跌（跳今日bar，本地前一日vs前二日）
│   ├─ yahoo-realtime-calc.ts    # Yahoo 实时涨跌（美股三层 marketState→Price→bar；其他直取）
│   ├─ yahoo-types.ts            # Yahoo chart 响应类型（close/realtime 共用）
│   └─ gszzl-weight.ts           # 持仓加权算估值 Σ(ratio×rate/100)
│
├─ valuation/                    # —— 基金估值/净值（东财主线程，✅ 已落地）——
│   ├─ fundgz-fetch.ts           # fundgz 实时估值取数（JSONP+重试）
│   ├─ fundgz-validate.ts        # fundgz 原始返回校验修正
│   ├─ lsjz-fetch.ts             # F10 lsjz 最近净值取数（dwjz/gszzl/jzrq/recentNavs）
│   ├─ lsjz-parser.ts            # lsjz HTML 表格解析
│   ├─ fund-type.ts              # T+2 判定纯逻辑（isT2FundType/isT2ByFundName/detectDelayDays）
│   ├─ net-value-range.ts        # 历史净值区间分页取数（per 500 去重升序）
│   ├─ accumulated-amount.ts     # 累计金额推算（净值序列逐日累加涨跌）
│   ├─ cn-trading-day.ts         # A股交易日历含节假日（净值滞后N交易日计算用）
│   ├─ nav-fetch.ts              # 最新净值涨跌取数（pingzhongdata，优化器约束用）
│   └─ fund-valuation-merge.ts   # ★估值合并核心口径（fundgz+lsjz+类型三路并发，T+1/T+2确认判定）
│
├─ intraday/                     # —— 盘中分时（✅ 已落地）——
│   ├─ intraday-estimate-fetch.ts
│   └─ intraday-points.ts
│
├─ catalog/                      # —— 基金目录/搜索（✅ 已落地）——
│   ├─ fund-search.ts            # 基金搜索
│   └─ fund-code-catalog.ts      # 基金代码目录 + getFundType（带 LRU 缓存）
│
├─ fund-types.ts                 # 基金板块类型定义（✅ 已落地）
├─ fund-store.ts                 # 基金板块 Pinia store（✅ 已落地）
├─ fund-bootstrap.ts             # 板块启动编排（恢复缓存+估值刷新+3 loop+跨日重建，✅ 已落地）
├─ misc/
│   └─ manager-check.ts          # 基金经理变更检测（每日一次，pingzhongdata 取经理，✅ 已落地）
# 注：GLM 图像识别在独立 ai 板块（modules/ai/），不在 fund/misc
```

---

## 三、各文件职责详解

### workers/ — Worker 线程入口（✅ 已落地）

| 文件 | 职责 | Worker 内取数源 |
|------|------|----------------|
| `em-close-worker.ts` | 持仓取数、昨日收盘(A/HK/US) | 腾讯 fqkline 日K（fetch，ifzq.gtimg.cn 主源）；东财 JSONP 由主线程 service 兜底 |
| `em-realtime-worker.ts` | 实时(A/HK) 持续刷新 | 腾讯 qt.gtimg 报价（fetch）；东财 push2 f3 由主线程 service 兜底 |
| `yahoo-worker.ts` | 昨日收盘(其他市场) + 实时(其他市场+美股盘前盘后) + Yahoo搜索 | Yahoo chart/search + 公共代理（内部并发槽 close/realtime 各 1） |

> em-close/em-realtime 的 em 为历史命名（主源实为腾讯 fetch，东财退主线程兜底）。Worker 内不写 store（Worker 无 Pinia），结果 `postMessage` 回主线程，由 service 写 store。

### services/ — 主线程侧调度（✅ 已落地）

| 文件 | 职责 |
|------|------|
| `em-close-service.ts` | 收盘线调度：收集A/HK/US缺失→Worker①分批20只→merge prevDayCache→recompute；每轮A→HK→US全组依次处理（死股重试不阻塞后序组）；东财push2his兜底（节流防挤搜索）；取不到不写缓存下轮重试（不判failed）；接力loop |
| `em-realtime-service.ts` | 实时线调度：A/HK全量刷新→Worker②→merge realtimeCache→recompute；A/HK全收盘转心跳；东财push2兜底 |
| `yahoo-service.ts` | Yahoo线调度：symbol解析+close补缺+realtime全量→Worker③→merge→recompute；并发槽各1；代理熔断降频；首屏realtimeGszzl占位 |
| `yahoo-symbol.ts` | Yahoo symbol四级解析（emCode映射→缓存→pattern→search）+localStorage缓存；search调Worker③ |

### holdings/ — 持仓（✅ 已落地）

| 文件 | 职责 |
|------|------|
| `f10-apidata-loader.ts` | F10 专用 apidata 串行 JSONP（window.apidata 全局回调并发会覆盖，需串行；兼容 var apidata={} 和 apidata(){} 两种格式） |
| `f10-holdings-fetch.ts` | F10 持仓取数（full topline 200/10、年份兜底重试、按季度查），调 apidata-loader+parser+report-date |
| `holdings-parser.ts` | F10 持仓 HTML 解析：thead 动态列定位（代码/名称/比例）、A股6位/港股4-5位/美股字母提取、emMarketCode 从链接提取 |
| `holdings-optimizer.ts` | 约束优化求解器：投影梯度下降+L1正则，前十大锁定，非十大可调（纯计算，T+2推算用） |
| `report-date.ts` | 报告期判定：detectReportType（03一季/06半年/09三季/12年报）、isFull（半年报/年报=true）、extractAvailableYears |
| `estimated-holdings.ts` | T+2 推算：季报前10+年报全量比例缩放+优化器约束。持仓股票行情通过 FetchStockQuotes 回调注入（service 层接线，不硬依赖 Worker） |

> 三档分流 classifyShare 不在此文件——`shared/market/market-classify.ts` 已有，直接复用。

### calc/ — 涨跌计算（纯逻辑，✅ 已落地）

| 文件 | 职责 |
|------|------|
| `prev-day-calc.ts` | `calcPrevDayFromKlines`：日K数组按市场本地时区算昨日收盘涨跌+休盘判定（A/港=previousClosedDay、美=lastClosedDay） |
| `realtime-em-calc.ts` | 现价vs昨收实时涨跌口径（纯计算 `calcRealtimeRate` + `buildRealtimeQuote` 组装）。取数+正则留 shared/net/tencent-fetch |
| `yahoo-close-calc.ts` | `calcCloseChangeRateByMarket`：Yahoo chart 收盘序列算日涨跌（跳过今日bar，取本地前一日vs前二日） |
| `yahoo-realtime-calc.ts` | 美股三层（marketState路由→Price自算→bar回退，PRE/REGULAR/POST）/ 其他海外 `calcRealtimeSimple` 直取 regularMarketChangePercent |
| `yahoo-types.ts` | Yahoo chart 响应类型定义（meta/timestamp/indicators，close/realtime 共用） |
| `gszzl-weight.ts` | `computeEstimatedGszzlFromPrevDay`：Σ(ratio×rate/100)，跳过 null（休盘/失败不参与加权） |

### valuation/ — 基金估值/净值（东财主线程 JSONP，✅ 已落地）

| 文件 | 职责 |
|------|------|
| `fundgz-fetch.ts` | 天天基金 fundgz 实时估值（JSONP+重试，走 jsonpgz dispatcher） |
| `fundgz-validate.ts` | fundgz 原始返回校验修正（fundcode 缺失丢弃，数值 safeParseFloat） |
| `lsjz-fetch.ts` | F10 lsjz 最近净值取数（dwjz/gszzl/jzrq/recentNavs4），走 f10-apidata-loader |
| `lsjz-parser.ts` | `parseLsjzContent`：lsjz HTML 表格解析为净值行（升序） |
| `fund-type.ts` | T+2 判定纯逻辑：`isT2FundType`/`isT2ByFundName`/`detectDelayDays`。getFundType 取数留 catalog |
| `net-value-range.ts` | `fetchFundNetValueRange`：历史净值区间分页（per 500 去重升序） |
| `accumulated-amount.ts` | `computeAccumulatedAmountFromRates`：累计金额推算（净值序列逐日累加涨跌，不做 shares×nav） |
| `cn-trading-day.ts` | A股交易日历含节假日2024-2026（getPreviousNTradingDay，净值滞后N交易日计算用） |
| `nav-fetch.ts` | `fetchLatestNavChange`：最新净值涨跌取数（pingzhongdata，优化器单日约束用） |
| `fund-valuation-merge.ts` | ★**估值合并核心口径**：fundgz+lsjz+类型三路并发，T+1/T+2确认状态判定，prevConfirmedNav滞后N交易日。getFundType 通过 FundTypeResolver 注入。batchGetValuation 批量并发 |

> cn-trading-day 与 shared/market/trading-day 区别：shared 只跳周末不含节假日（股票涨跌用），cn-trading-day 含节假日（基金净值滞后必须跳节假日）。

### intraday/ — 盘中分时（✅ 已落地）

| 文件 | 职责 |
|------|------|
| `intraday-estimate-fetch.ts` | `fetchIntradayEstimate`：新浪盘中估值走势取数（当日开盘到当前时刻序列） |
| `intraday-points.ts` | `generateIntradayPoints`：分时点生成（T+2水平线15分钟间隔+T+1按gztime追加），纯计算接受历史点参数 |

### catalog/ — 基金目录/搜索（✅ 已落地）

| 文件 | 职责 |
|------|------|
| `fund-search.ts` | `searchFunds`：基金搜索（东财 FundSearchAPI JSONP） |
| `fund-code-catalog.ts` | `fetchFundCodeCatalog`：全量基金代码+名称+类型目录（24h localStorage 缓存）；`getFundType`：从目录取基金类型（LRU 缓存，供估值合并注入） |

### 启动编排（✅ 已落地）

| 文件 | 职责 |
|------|------|
| `fund-bootstrap.ts` | `startFundModule`：恢复缓存→预热目录→估值刷新→启动3 service loop；`rebuildFundModuleOnCrossDay`：跨日清缓存+重建Worker+重启。main.ts 挂载后调用 |

### misc/

| 文件 | 职责 |
|------|------|
| `manager-check.ts` | `checkManagerChanges`：每日检测基金经理变更（pingzhongdata 取 Data_currentFundManager，与已知记录对比，变更收集到列表）；按日去重、并发检测、localStorage 持久化已知记录。不耦合 UI 通知层，只返回变更列表 |

> GLM 图像识别在独立 ai 板块（`modules/ai/glm-vision.ts`），不在 fund/misc。

### 类型与状态（✅ 已落地）

| 文件 | 职责 |
|------|------|
| `fund-types.ts` | FundValuation / FundAllHoldings / EstimatedHoldings / FundCache / Holding / 列表配置（剔除 HoldingAction/PendingAction/DashboardStats/详情子结构/@deprecated字段） |
| `fund-store.ts` | 估值Map/推算持仓缓存(LRU50)/双全局缓存(prevDay/realtime,shallowRef)/merge双key/recompute事件驱动/getEstimatedHoldings去重/collectMissing(供service)/跨日清理 |

---

## 四、3 Worker 分工矩阵

| 数据类别 | A股 | 港股 | 美股 | 日韩台欧 |
|---------|-----|------|------|----------|
| 昨日收盘 | ① 收盘线（腾讯日K）| ① 收盘线（腾讯日K）| ① 收盘线（腾讯日K）| ③ Yahoo |
| 实时 | ② 实时线（腾讯报价）| ② 实时线（腾讯报价）| ③ Yahoo（盘前盘后）| ③ Yahoo（直取） |

> 美股特殊：昨日收盘走①（腾讯日K可用），实时走③（需 Yahoo 时段模式取盘前盘后）。

### 4.1 取数批次与限流控制（防封IP/限流）

各接口批次配置（均在 config，可调）：

| 接口 | 数据源 | 批次/并发 | 风险 |
|------|--------|----------|------|
| 基金估值 fundgz | 天天基金 JSONP | BATCH_CONCURRENCY=5（5只并发） | 低 |
| 基金估值 lsjz / F10持仓 | 东财 apidata | **串行队列**（一次一个） | 低，最安全 |
| 腾讯日K（Worker①） | 腾讯 ifzq.gtimg | service批12只 / Worker内并发3 | 中，已调低 |
| 腾讯报价（Worker②） | 腾讯 qt.gtimg | REALTIME_BATCH=50/批（批量接口） | 低 |
| 东财日K兜底 | 东财 push2his | KLINE_BATCH=3/批 + 200ms间隔 | 低 |
| Yahoo chart（Worker③） | allorigins代理 | SLOT_CAP=1（close/realtime各1） | 低，单并发防代理限流 |
| Yahoo symbol解析 | Yahoo search代理 | SYMBOL_CONCURRENCY=4 | 中，并发×3全挂故保守取4 |

> 限流红线：Yahoo 公共代理(allorigins/corsproxy)对高并发极敏感，并发×3即触发限流全挂。Yahoo 线全程单并发槽控制。腾讯不限IP但密集打不礼貌，日K取数分批+Worker内限并发。

---

## 五、启动与数据流

```
app 启动
  └─ fund-store 触发估值刷新（fundgz/lsjz 主线程 JSONP）
  └─ ① 东财收盘线：取 F10 持仓 → 回传 → 写 store
  └─ 持仓就绪 → holdings-classify 三档分流
      ├─ A/HK/US 持仓 → ①（昨日收盘）+ ②（A/HK 实时）
      └─ 其他持仓   → ③（昨日收盘 + 实时）
  └─ ①②③ 各自取数 → 每批 postMessage 回 → merge 双缓存 → recompute 加权
```

---

## 六、兜底取数链路（东财 JSONP 主线程）

Worker 内腾讯 fetch 失败时，service 在主线程用 `shared/net/jsonp-main.ts` 补一次东财 JSONP：

```
service.request('em-close', ...) 
  → Worker 内腾讯 fqkline fetch 
  → 失败 → service 主线程 jsonp-main 东财 push2his 兜底 
  → 仍失败 → 留 null 下轮重试
```

---

## 七、口径统一（关键设计）

- **昨日收盘**：跳过今日 bar，取本地前一交易日收盘 vs 其前一交易日收盘。A/港用 previousClosedDay，美股用 lastClosedDay（跨时区）。
- **实时**：各市场当日交易日相对昨收。美股走时段模式，其他直取。
- **收盘列与实时列日期可不同**（如A股收盘列7.1、实时列7.2），二者本就是不同口径，属预期行为。
- **休盘**：`closed:true` 写缓存，UI 显示 --，加权跳过，loop 不重试。

口径逻辑下沉到 `shared/market/trading-day.ts`，本板块 calc 文件复用。
