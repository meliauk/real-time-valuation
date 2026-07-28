# 预留板块（reserved）说明

> 板块定位：**预留扩展位**，当前为空壳。为未来新增板块提供标准模板。
> 并发架构：本板块独占 **1 个 Web Worker**（reserved-worker，当前空实现）。

---

## 一、为什么留这个空壳

你的需求明确提到"还有一个预留的板块为空"。预留板块有两个作用：

1. **占位**：保持 5 板块并发架构的完整性，架构图上始终有第 5 个并发单元。
2. **模板**：未来新增板块时，复制本文件夹改名即可，照着标准模式落地，不用从头想结构。

---

## 二、文件结构

```
src/modules/reserved/
├─ described.md          # 本文件
└─ reserved-worker.ts    # 空壳 Worker（仅回声请求，待扩展）
```

> 当前只有 Worker 空壳。真正扩展时再补 `reserved-service.ts` / `reserved-types.ts` / `reserved-store.ts` 等。

---

## 三、空壳 Worker 的实际内容

`reserved-worker.ts` 当前实现（阶段 1 最小链路验证载体）：
- `echo`：原样回显 payload，验证主线程↔Worker 通信协议
- `ping-tencent-kline`：Worker 内 fetch 腾讯 fqkline 日K，返回条数
- `ping-tencent-quote`：Worker 内 fetch 腾讯报价，验证直连 fetch
- 其他请求类型 → 回 `{ok:false, err:'reserved 板块未实现该请求类型'}`

这三类是阶段 1 验证 Worker fetch 链路用的，未来扩展新板块时删除，换成真实取数逻辑。
这样即使不实现业务，整个 Worker 调度框架也能跑通（验证链路对空板块也成立）。

---

## 四、扩展新板块的标准动作

1. 复制 `src/modules/reserved/` → `src/modules/<新板块>/`
2. `reserved-worker.ts` → `<新板块>-worker.ts`，写入真实取数逻辑
3. 新增 `<新板块>-service.ts` / `<新板块>-store.ts` 等
4. 改 `described.md` 为新板块说明
5. 在 `WorkerManager` 注册新板块名（一行）
6. 其他板块代码**完全不动**

> 原则：新增板块 = 新增文件夹 + 一行注册，零侵入。
