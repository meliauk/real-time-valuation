# 股票板块（stock）说明

> 板块定位：用户自选股行情展示 + 股票搜索（添加自选）。
> 并发架构：本板块独占 **1 个 Web Worker**（stock-worker）。
> 拆分原则：板块内按功能分子目录，每功能一文件。

---

## 二、目录结构（✅ 已落地，精简）

```
src/modules/stock/
├─ described.md
├─ search/
│   ├─ stock-search.ts            # 股票搜索（东财suggest，过滤ETF/基金）
│   └─ fund-filter.ts             # ETF/基金识别过滤 isFundOrEtf
├─ services/
│   └─ stock-service.ts           # 自选股批量行情（东财push2主线程）
├─ stock-types.ts                 # StockQuote/StockSearchItem 类型
└─ stock-store.ts                 # 自选股 Pinia store
```

> 精简说明：自选股量小（用户几十只），走主线程东财 push2 批量（与指数一致），不进 Worker。
> 代码归一化/secid 构造复用 shared（`shared/net/tencent-codec` 的 normalizeStockCodeTencent、`shared/market/secid` 的 secidFor），不建板块内 codec。
> 不建 stock-worker（自选股主线程够用，未来量大再进 Worker）。

---

## 二、各文件职责

### search/

| 文件 | 职责 |
|------|------|
| `stock-search.ts` | `searchStocks`：东财 suggest 搜索（JSONP 主线程），只返回股票过滤 ETF/基金 |
| `fund-filter.ts` | `isFundOrEtf`：ETF/基金识别（代码前缀+名称关键词双过滤） |

### services/

| 文件 | 职责 |
|------|------|
| `stock-service.ts` | `fetchFullStockQuotes`：自选股批量完整行情（东财 push2，价格/涨跌/开高低/成交额/换手/PE/PB），双 key 写入 |

### 类型与状态

| 文件 | 职责 |
|------|------|
| `stock-types.ts` | `StockQuote`（完整行情）/ `StockSearchItem`（搜索结果） |
| `stock-store.ts` | 自选股列表（watchlist 持久化，存 code+emMarketCode）、行情 Map、添加/移除/刷新 |

---

## 三、取数源

| 场景 | 取数源 |
|------|--------|
| 自选股行情 | 东财 push2 批量（主线程 JSONP，secid 精确构造） |
| 股票搜索 | 东财 suggest（主线程 JSONP） |

- watchlist 存 `code` + `emMarketCode`，下次精确构造 secid，省去市场猜测
- 整体失败保留旧值（不覆盖成 0）

---

## 四、与基金板块的关系

股票板块取数逻辑与基金东财线有重叠（都用腾讯取 A/HK/US 行情），但职责不同：
- 基金东财线：为基金估值服务，取**基金持仓股**涨跌，写**双全局缓存**供加权
- 股票板块：为自选股服务，取**用户手动添加的股**完整行情，写**自选股 store**

两者 Worker 独立、缓存独立，互不干扰。公共的代码归一化/secid 构造下沉到 `shared/market/` 复用（板块内 codec 是对 shared 的薄封装）。
