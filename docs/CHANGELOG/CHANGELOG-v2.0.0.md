# CHANGELOG v2.0.0

## 新增

- **PC 首页三栏布局**：`pcHome.vue` 重构为左中右三栏（20%/60%/20%），适配桌面端体验
  - 左栏：PC 版指数行情纵向列表（`index-bar-pc.vue`）
  - 中栏：搜索栏 + 刷新按钮 + 仪表盘 + 基金列表
  - 右栏：板块排行（`sector-full.vue` 完整嵌入）

- **PC 版指数条组件**：`src/components/market/index-bar-pc.vue`
  - 选中指数以纵向行列表展示（市场徽章 | 名称 | 最新价 | 涨跌幅 | 涨跌额）
  - 保留 keep-alive 生命周期定时刷新，避免与 stock-full 双套定时器竞争

- **PC 端基金列表周期收益列**：`src/modules/fund/services/fund-period-returns.ts`
  - 独立 JSONP 取数服务，串行获取 `Data_netWorthTrend` + `syl_*` 计算周期收益
  - 表格新增 5 列：近1周 / 近1月 / 近3月 / 近6月 / 近1年，红涨绿跌

## 修改

- **DashboardStats**（`dashboard-stats.vue`）：新增 `pcMode` prop，PC 模式始终展开、不可折叠、更紧凑布局
- **FundList**（`fund-list.vue`）：新增 `pcMode` prop，PC 模式强制表格视图、隐藏视图切换按钮、基金名全展示
- **App.vue**（`App.vue`）：PC 路由 `/pc` 隐藏底部导航栏与跑马灯，`.app-main` 去掉 `max-width: 640px` 限制

## 修复

- **prop 命名冲突**：`isPC` → `pcMode`，`is` 前缀与 Vue 内部属性解析冲突导致 prop 无法正确传递
- **净值确认后持有金额漏推**：`syncYesterdayAmounts` 迁移分支此前把 `lastConfirmedDate` 直接设为最新确认日 `v.jzrq` 但不推进金额，导致该确认日涨跌被永久跳过（持有金额/累计收益不随当日收益增长）。现改为补「最新确认日的前一交易日」并落到下方单日推进逻辑、本轮即推进；同时 `addHoldingByAmount` 初始化 `lastConfirmedDate` 为成交净值日期，从源头避免走迁移分支
