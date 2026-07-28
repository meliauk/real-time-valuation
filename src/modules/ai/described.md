# AI 板块（ai）说明

> 板块定位：通用 AI 能力板块，当前提供 GLM 视觉模型图像识别。不绑定具体业务，各业务板块按需调用。
> 并发架构：本板块不独占 Worker（AI 识别是低频用户触发操作，主线程 fetch 即可，无需物理隔离）。

---

## 一、识别场景

主要针对**支付宝基金持仓截图**（其他持仓 App 截图同样支持），识别图中每只基金的：

| 识别字段 | 说明 | 用途 |
|---------|------|------|
| `fundCode` | 基金代码（6位纯数字） | 定位基金 |
| `fundName` | 基金名称（完整名称） | 展示/校验 |
| `holdingAmount` | 持有金额（元） | **持仓编辑**——填入持仓记录的持有金额 |
| `accumulatedProfit` | 累计收益（元，亏损为负） | **持仓编辑**——填入持仓记录的累计收益 |

> 只识别这 4 个字段。收益率/涨跌幅/当日收益等**不识别**——由系统根据持有金额/累计收益自行计算。
> 识别结果用于**持仓编辑**：用户上传支付宝截图 → 批量识别 → 识别出的金额/收益填入持仓编辑表单，免去手动录入。

---

## 二、文件结构

```
src/modules/ai/
├─ described.md        # 本文件
├─ glm-vision.ts       # GLM 视觉模型识别核心
└─ ai-types.ts         # RecognizedFund / RecognitionStatus 类型
```

---

## 三、各文件职责

| 文件 | 职责 |
|------|------|
| `glm-vision.ts` | `recognizeFundFromImage`：调 GLM-4V-Flash 视觉模型，识别支付宝持仓截图→基金数据（代码/名称/持有金额/累计收益）；prompt 约束只返回4字段JSON数组；超时/取消/CORS 错误处理；fundCode 非6位过滤 |
| `ai-types.ts` | `RecognizedFund`（识别结果，4字段）、`RecognitionStatus`（识别状态） |

---

## 四、GLM 视觉模型

- **模型**：glm-4v-flash（智谱清言免费视觉模型，配置在 GLM_CONFIG.MODEL）
- **API Key**：硬编码在 `GLM_CONFIG.API_KEY`（build 后进 bundle 明文——前端零后端无法真正加密，这是固有限制）
- **API 地址**：`/api/glm/chat/completions`（走 vite proxy 规避 CORS）
- **prompt 要点**：强调支付宝截图特征、只识别4字段、亏损为负、fundCode 必须6位纯数字、不返回文字说明
- **超时**：30s（视觉识别较慢，GLM_CONFIG.TIMEOUT）

---

## 五、CORS 处理

智谱 API（open.bigmodel.cn）不放行浏览器跨域。通过 **vite proxy** 规避：
- 开发：`vite.config.ts` 配 `/api/glm` → `https://open.bigmodel.cn`，rewrite 成 `/api/paas/v4`
- 生产（GitHub Pages）：无 vite proxy，需另配 CORS 代理或轻量后端中转（待定）

> 本地开发已可用（vite proxy 配好）。生产 CORS 问题待部署阶段解决。

---

## 六、使用方式

调用方：基金板块持仓编辑 UI（未来 image-recognition 组件）。
- 用户上传支付宝持仓截图 → `recognizeFundFromImage(base64)` → RecognizedFund[]
- 识别出的 holdingAmount/accumulatedProfit 填入持仓编辑表单
- fundCode 用于定位基金（若已在关注列表直接编辑，否则先添加）
