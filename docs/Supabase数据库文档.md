# Supabase 数据库文档

> 项目：meliaukProject（实时估值）

## 1. 文档概述

### 1.1 数据库基本信息

| 项目          | 值                                                   |
| ----------- | --------------------------------------------------- |
| 项目名称        | meliaukProject                                      |
| 项目 ID       | mkrwnqvpdhnlixbtbikk                                |
| 部署区域        | ap-northeast-1（东京）                                  |
| 数据库         | PostgreSQL 14.5                                     |
| Project URL | <https://mkrwnqvpdhnlixbtbikk.supabase.co>          |
| REST API 地址 | <https://mkrwnqvpdhnlixbtbikk.supabase.co/rest/v1/> |
| 暴露 Schema 数 | 2（public、graphql\_public）                           |
| 数据表数量       | 5                                                   |
| 数据库函数数量     | 5                                                   |

### 1.2 说明

- 本文档基于 Supabase PostgREST OpenAPI 规范整理，字段类型为 PostgreSQL 实际类型。
- 字段「说明」列结合字段命名与项目业务（基金实时估值）上下文整理，供参考。
- API Key（anon / service\_role）属于敏感凭据，本文档不记录；获取位置见「附录」。

***

## 2. 数据表结构

### 2.1 用户配置表（user\_configs）

#### 表说明

存储用户的个性化配置数据，配置内容以 JSON 形式保存，支持多设备接管（`last_device_id`）与年初至今收益率排名（`ytd_return_rate`）。

#### 表结构

| 字段名               | 类型          | 允许空 | 默认值   | 说明                   |
| ----------------- | ----------- | --- | ----- | -------------------- |
| id                | bigint      | 否   | 自增    | 主键                   |
| created\_at       | timestamptz | 否   | now() | 创建时间                 |
| data              | json        | 是   | -     | 用户配置数据（JSON）         |
| updated\_at       | timestamptz | 是   | now() | 更新时间                 |
| user\_id          | uuid        | 否   | -     | 用户 ID（关联 auth.users） |
| last\_device\_id  | text        | 是   | -     | 最后登录设备 ID（用于设备接管判断）  |
| ytd\_return\_rate | numeric     | 是   | -     | 年初至今收益率（用于百分位排名）     |

***

### 2.2 基金证券标识表（fund\_secid）

#### 表说明

存储基金与其证券标识（secid，东方财富/腾讯行情标识）及关联板块的映射关系。

#### 表结构

| 字段名             | 类型          | 允许空 | 默认值   | 说明         |
| --------------- | ----------- | --- | ----- | ---------- |
| id              | bigint      | 否   | 自增    | 主键         |
| created\_at     | timestamptz | 否   | now() | 创建时间       |
| related\_sector | text        | 是   | -     | 关联板块       |
| secid           | varchar     | 是   | -     | 证券标识（行情代码） |

***

### 2.3 基金关联表（fund\_related）

#### 表说明

存储基金代码与其关联板块之间的对应关系。

#### 表结构

| 字段名             | 类型          | 允许空 | 默认值   | 说明   |
| --------------- | ----------- | --- | ----- | ---- |
| id              | bigint      | 否   | 自增    | 主键   |
| created\_at     | timestamptz | 否   | now() | 创建时间 |
| fund\_code      | varchar     | 是   | -     | 基金代码 |
| related\_sector | text        | 是   | -     | 关联板块 |

***

### 2.4 OCR 每日用量表（ocr\_daily\_usage）

#### 表说明

记录用户每日 OCR（持仓截图识别）使用次数，用于额度控制（对应 `check_and_increment_ocr_usage` 函数）。

#### 表结构

| 字段名         | 类型      | 允许空 | 默认值           | 说明                   |
| ----------- | ------- | --- | ------------- | -------------------- |
| id          | bigint  | 否   | 自增            | 主键                   |
| user\_id    | uuid    | 否   | -             | 用户 ID（关联 auth.users） |
| usage\_date | date    | 否   | CURRENT\_DATE | 使用日期                 |
| count       | integer | 否   | 0             | 当日使用次数               |

***

### 2.5 基金主题板块表（fund\_topic）

#### 表说明

存储基金主题/板块的行情数据，包括板块标识、更新频率、主力净流入与涨跌幅等信息。

#### 表结构

| 字段名             | 类型          | 允许空 | 默认值   | 说明    |
| --------------- | ----------- | --- | ----- | ----- |
| id              | bigint      | 否   | 自增    | 主键    |
| created\_at     | timestamptz | 否   | now() | 创建时间  |
| update\_at      | timestamptz | 是   | -     | 更新时间  |
| sector\_type    | text        | 是   | -     | 板块类型  |
| sector\_id      | text        | 是   | -     | 板块 ID |
| sector\_name    | text        | 是   | -     | 板块名称  |
| updateFrequency | text        | 是   | -     | 更新频率  |
| net\_inflow     | bigint      | 是   | -     | 主力净流入 |
| change\_pct     | real        | 是   | -     | 涨跌幅   |

***

## 3. 数据库函数（RPC）

通过 `POST /rest/v1/rpc/{函数名}` 调用，参数以 JSON body 传入。

### 3.1 update\_user\_config\_partial

- **说明**：部分更新用户配置。
- **参数**：

| 参数名                 | 类型      | 必填 | 说明       |
| ------------------- | ------- | -- | -------- |
| payload             | jsonb   | 是  | 待更新的配置数据 |
| p\_force\_takeover  | boolean | 否  | 是否强制接管设备 |
| p\_last\_device\_id | text    | 否  | 最后设备 ID  |

### 3.2 update\_user\_config\_full

- **说明**：全量更新用户配置。
- **参数**：

| 参数名                 | 类型      | 必填 | 说明       |
| ------------------- | ------- | -- | -------- |
| payload             | jsonb   | 是  | 完整配置数据   |
| p\_force\_takeover  | boolean | 否  | 是否强制接管设备 |
| p\_last\_device\_id | text    | 否  | 最后设备 ID  |

### 3.3 get\_ytd\_percentile

- **说明**：根据年初至今收益率计算百分位排名。
- **参数**：

| 参数名          | 类型      | 必填 | 说明      |
| ------------ | ------- | -- | ------- |
| p\_ytd\_rate | numeric | 是  | 年初至今收益率 |

### 3.4 check\_and\_increment\_ocr\_usage

- **说明**：检查并递增当日 OCR 使用次数，用于额度控制。
- **参数**：

| 参数名           | 类型      | 必填 | 说明         |
| ------------- | ------- | -- | ---------- |
| p\_max\_limit | integer | 否  | 每日最大使用次数上限 |

### 3.5 get\_fund\_sector\_ids\_batch

- **说明**：批量获取多个基金代码对应的板块 ID。
- **参数**：

| 参数名            | 类型      | 必填 | 说明     |
| -------------- | ------- | -- | ------ |
| p\_fund\_codes | text\[] | 是  | 基金代码数组 |

***

## 4. 表关系说明

> 以下关系基于字段命名推断，实际外键约束需在 Supabase 控制台 Database → 表详情中确认。

| 表 A         | 关系  | 表 B               | 关联字段                                                   | 说明           |
| ----------- | --- | ----------------- | ------------------------------------------------------ | ------------ |
| auth.users  | 一对多 | user\_configs     | auth.users.id → user\_configs.user\_id                 | 用户与其配置       |
| auth.users  | 一对多 | ocr\_daily\_usage | auth.users.id → ocr\_daily\_usage.user\_id             | 用户与其 OCR 用量  |
| fund\_topic | 一对多 | fund\_related     | fund\_topic.sector\_id → fund\_related.related\_sector | 板块与其关联基金（推断） |
| fund\_topic | 一对多 | fund\_secid       | fund\_topic.sector\_id → fund\_secid.related\_sector   | 板块与其证券标识（推断） |

***

## 5. 附录：API Key 获取方式

1. 登录 [Supabase 控制台](https://supabase.com/dashboard)。
2. 进入项目 `meliaukProject`。
3. 左侧 **Project Settings → API Keys**。
4. 在 **Legacy anon, service\_role API keys** 标签页可查看/复制：
   - **anon key**（Publishable key）：浏览器端使用，受 RLS 策略限制。
   - **service\_role key**（Secret key）：服务端使用，拥有最高权限，**切勿暴露到前端**。

> 安全提醒：service\_role key 可绕过行级安全（RLS）访问全部数据，请妥善保管，避免写入代码仓库或文档。

