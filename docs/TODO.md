# TODO

## v2.0.0 - 待办

- [x] PC 首页三栏布局（pcHome.vue）
  - 左 20%：指数行情纵向列表
  - 中 60%：搜索 + 仪表盘 + 基金列表
  - 右 20%：板块排行
- [x] PC 版指数条组件（index-bar-pc.vue）
- [x] DashboardStats / FundList 增加 pcMode 模式
- [x] App.vue PC 布局适配（去掉 max-width、隐藏底栏）
- [x] PC 端路由接入与测试验证
- [x] PC 端基金列表新增周期收益列（近1周/1月/3月/6月/1年）
- [x] 基金数据云端同步（Supabase `user_configs.data` + PC 指数条「一键同步」按钮）
- [x] 登录改造为仅用户名（校验 `user_configs.user_name`）
- [x] 登录入口接「我的」页用户卡（未登录跳登录、已登录显示用户名 + 退出）
- [x] 30 天登录有效期（`auth-store` 校验 `cloudLoginAt` 过期自动失效）
- [x] 首页云端加载弹框（一次性：`use-cloud-sync` + `sync-flag` 永久标记，不写入 data）
- [ ] 云端同步前置（手动）：Supabase 执行 `alter table public.user_configs add column if not exists user_name text;` 并插入授权用户行
- [ ] PC 端响应式适配优化（小屏降级）
