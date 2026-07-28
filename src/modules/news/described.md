# 资讯板块（news）说明

> 板块定位：抓取财经快讯（国内东财 + 海外 RSS），按黑名单过滤展示。
> 并发架构：本板块独占 **1 个 Web Worker**（news-worker）。

---

## 一、文件结构（✅ 已落地，细拆）

```
src/modules/news/
├─ described.md
├─ sources/
│   ├─ sina-news.ts          # 新浪财经 roll 接口（JSONP主线程）
│   ├─ eastmoney-news.ts     # 东财 clist 24h滚动（JSONP主线程）
│   └─ overseas-rss.ts       # 海外RSS（rss2json代理fetch主线程）
├─ filter/
│   ├─ news-merge.ts         # 多源合并去重（按时间倒序+标题去重）
│   └─ news-blacklist.ts     # 黑名单过滤
├─ format/
│   └─ news-time.ts          # 时间解析（东财时间戳/日期串→Unix秒）+格式化
├─ services/
│   └─ news-service.ts       # 聚合入口（fetchTodayNews/fetchMoreNews）
├─ news-types.ts             # NewsItem 类型
└─ news-store.ts             # 资讯 Pinia store
```

> 不建 news-worker：资讯量小（每日几百条）、JSONP 主线程够用，海外 RSS 走 rss2json 代理（有 CORS 头主线程可读）。未来量大再进 Worker。

---

## 二、各文件职责

### sources/

| 文件 | 职责 |
|------|------|
| `sina-news.ts` | 新浪 roll（5个lid分类），JSONP主线程，只保留今日；含深度拉取（加载更多） |
| `eastmoney-news.ts` | 东财 clist（7个fs分类），JSONP主线程，只保留今日；含深度拉取 |
| `overseas-rss.ts` | 海外RSS（Yahoo/CNBC/MarketWatch），rss2json代理fetch，只保留今日 |

### filter/

| 文件 | 职责 |
|------|------|
| `news-merge.ts` | `mergeAndDedup`：多源合并→时间倒序→标题去重 |
| `news-blacklist.ts` | `isBlacklisted`/`filterByBlacklist`：来源包含匹配过滤 |

### format/ + services/ + 状态

| 文件 | 职责 |
|------|------|
| `news-time.ts` | `parseEastmoneyTime`（时间戳/日期串→Unix秒）+ `formatTimestamp`/`formatTime` |
| `news-service.ts` | `fetchTodayNews`（多源并发聚合）/ `fetchMoreNews`（加载更早今日） |
| `news-types.ts` | `NewsItem` / `NewsItemWithTime` |
| `news-store.ts` | 资讯列表、黑名单、已读集合、海外开关、刷新/加载更多 |

---

## 三、取数源

| 来源 | 方式 | 说明 |
|------|------|------|
| 新浪财经 | JSONP 主线程（roll 接口） | 国内财经快讯，5个分类 |
| 东财快讯 | JSONP 主线程（clist） | 24h滚动，7个分类 |
| 海外 RSS | fetch + rss2json 代理 | Yahoo/CNBC/MarketWatch，用户设置开关 |

- 任一源失败不影响其他，整体失败保留旧值
- 黑名单过滤在 store 的 computed 层（不污染原始数据）
