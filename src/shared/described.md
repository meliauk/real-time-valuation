# 公共能力（shared）说明

> 定位：跨板块复用的通用能力。每子目录一类能力，每功能一个文件，大量中文注释。
> 原则：被 ≥2 个板块用到的能力才进 `shared/`；只一个板块用的留在该板块内。

---

## 目录结构

```
src/shared/
├─ worker/          # Worker 调度基础设施（整个并发架构的中枢）
├─ net/             # 网络取数工具（JSONP/fetch/代理/节流）
├─ market/          # 市场相关纯逻辑（交易日/分流/secid/时段）
├─ cache/           # 缓存与跨日清理
├─ utils/           # 通用工具（数值/格式化/校验）
└─ types/           # 全局公共类型
```

---

## worker/ — Worker 调度中枢（最关键）

| 文件 | 职责 |
|------|------|
| `worker-manager.ts` | 统一 Worker 调度器：懒创建、请求分发（请求ID回调匹配）、看门狗超时、terminate 重建、生命周期。各板块 service 通过它发请求，不直接碰 Worker |
| `worker-protocol.ts` | 主线程↔Worker 通信协议：`{id, type, payload}` 请求 / `{id, ok, data, err}` 响应 |
| `worker-fetch.ts` | Worker 内 fetch 封装：超时、代理解析、错误识别（腾讯/Yahoo 通用） |

> importScripts 路线已废弃（实测 NetworkError），Worker 内取数统一走 fetch。`worker-manager.ts` 是 5 板块并发的根基。详见 `plan/v2.0.md` 第二节。

## net/ — 网络取数工具

| 文件 | 职责 |
|------|------|
| `tencent-fetch.ts` | 腾讯 fetch 封装（fqkline 日K / qt.gtimg 报价，CORS 放行，**Worker 内主源**） |
| `proxy-rotation.ts` | Yahoo/RSS 多代理轮换 + 熔断（allorigins/corsproxy/thingproxy） |
| `jsonp-main.ts` | **主线程 JSONP**（东财 push2/push2his/fundgz 兜底用，仅主线程，Worker 用不了） |
| `rate-limiter.ts` | 通用请求节流（批大小/间隔，东财线 3只/批200ms） |

> 关键：Worker 内取数统一走 `fetch`（腾讯 / Yahoo 代理），不依赖 JSONP。JSONP 只在主线程作东财兜底，定位明确"仅主线程兜底用"。

## market/ — 市场纯逻辑

| 文件 | 职责 |
|------|------|
| `trading-day.ts` | 交易日判定：9 市场时区 + 夏令时，返回 currentTradingDay/lastClosedDay/previousClosedDay/isClosed |
| `market-classify.ts` | `classifyShare`：emMarketCode + 代码特征 → A/HK/US/其他 |
| `secid.ts` | secid 构造（A/HK/US 三档） |
| `session.ts` | 美股时段分类（PRE/REGULAR/POST/OFF） |

> 这套口径逻辑是所有涨跌计算的基石，下沉到 shared 供各板块 calc 复用。

## cache/ — 缓存与跨日

| 文件 | 职责 |
|------|------|
| `lru-cache.ts` | LRU 缓存通用实现（持仓/净值缓存用） |
| `cross-day.ts` | 跨日清理：定时校验日期变化、触发各板块缓存失效重拉 |

## utils/ — 通用工具

| 文件 | 职责 |
|------|------|
| `safe-math.ts` | 安全数值运算（避免浮点精度） |
| `money-format.ts` | 金额/涨跌格式化 |
| `date-format.ts` | 日期格式化（北京时间 UTC+8 一致性） |
| `validation.ts` | 数据校验（代码/价格/比率合法性） |

## types/ — 公共类型

| 文件 | 职责 |
|------|------|
| `common-types.ts` | `StockQuoteInfo` / `StockMarket` 等跨板块共享类型 |
