# 指数板块（index）说明

> 板块定位：展示全球主要股票指数行情（A股、港股、美股、亚太、欧洲）。
> 并发架构：本板块独占 **1 个 Web Worker**（index-worker）。

---

## 一、文件结构（✅ 已落地）

```
src/modules/index/
├─ described.md        # 本文件
├─ index-worker.ts     # 占位（指数走主线程不进Worker，未启用）
├─ index-service.ts    # 主线程东财 push2 secid 批量取指数行情
├─ index-types.ts      # IndexQuote 类型
└─ index-store.ts      # 指数 Pinia store
```

> 预设指数（20个 + secid）定义在 `src/config/constants.ts` 的 INDEX_PRESETS，不单独建 index-presets.ts。
> 腾讯 qt.gtimg 指数报价虽 CORS 放行可进 Worker（已验证），但**用户决定指数保持东财 JSONP 主线程现状**（请求量小，20个）。`index-worker.ts` 保留占位，未来切腾讯 fetch 进 Worker 时启用。

---

## 二、各文件职责

| 文件 | 职责 |
|------|------|
| `index-worker.ts` | 占位（指数走主线程东财JSONP，未启用） |
| `index-service.ts` | 主线程东财 push2 secid 批量 JSONP（fetchGlobalIndexQuotes + fetchQuotesBySecid）、整体失败保留旧值不覆盖 |
| `index-types.ts` | `IndexQuote` 类型（secid/code/name/price/changeRate/changeAmount） |
| `index-store.ts` | 指数行情 Map、用户勾选指数（localStorage 持久化）、定时刷新 |

---

## 三、取数源

- **当前：东财 push2**（`ulist.np` secid 批量 JSONP，主线程）—— 用户决定保持现状
- **未来可切换**：腾讯 qt.gtimg 指数报价（已验证 CORS 放行，若想进 Worker 可切）
- **无 Yahoo 兜底**：指数 secid 是东财专有格式，Yahoo 无法替代
- 整体失败返回空 Map → **保留旧值**（避免定时刷新偶发失败清成 --）

---

## 四、与基金估值刷新的避让

`refreshAllWhenReady`（主线程调度）等基金估值刷新结束（或 5s 超时）再拉指数，避免与基金 `batchGetValuation` 的 15 个 JSONP 争抢东财连接池。指数走主线程 JSONP，此避让逻辑保留——浏览器对 `push2.eastmoney.com` 的 6 连接上限是全局的。

> 未来若指数切到腾讯 fetch 进 Worker，可解除此避让（独立事件循环 + 不占东财连接池）。
