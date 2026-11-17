# 飞书多维表格创建类接口精确请求体（Step 2 / 3 / 4）

> **存放理由**：`SMOKE-RUNBOOK.md` 的 Step 2/3/4 需要逐字可复制的请求体 JSON，而字段名只能来自一手 SDK 模型与官方文档页；与既有 6 份 `docs/research/` 笔记同处存放，便于向导与冒烟脚本引用同一份取证结论。

## 取证口径

- 只采一手来源：官方 Go SDK `github.com/larksuite/oapi-sdk-go` 的 `v3_main` 分支（`service/bitable/v1/{resource.go,model.go,model_ext.go}`、`sample/apiall/bitablev1/*.go`、`core/apiresp.go`）；官方 Python SDK `github.com/larksuite/oapi-sdk-python` 的 `v2_main` 分支（`lark_oapi/api/bitable/v1/model/*.py`、`resource/*.py`）；官方服务端 API 文档页 `open.feishu.cn`；官方 SDK 自带 sample 示例。
- 每条断言后紧跟一手 URL，或 SDK 源码文件路径 + 符号名（Go：`type Xxx struct` / `func (a *app) Create`；Python：`class Xxx` / `_types`）。下表链接标签即「路径 · 符号名」，链接目标为对应 raw.githubusercontent.com 直链。
- 官方页均为 SPA：`web_fetch` 只回 HTTP 200 与 `<title>`，正文取不到 → 凡只能由文档页正文证明的断言一律写「**未验证**」并说明原因。不采二手转述、不编造字段名。
- 全文占位符：`<TENANT_ACCESS_TOKEN>`、`<APP_TOKEN>`、`<TABLE_ID>`、`<APP_NAME>`、`<FOLDER_TOKEN>`、`<TIME_ZONE>`、`<TABLE_NAME>`、`<VIEW_NAME>`、`<CLIENT_TOKEN>` 等，不写任何真实凭据；字段名「工时」「时薪」与数值 8 / 100 / 10 / 80 按任务要求原样保留（非凭据）。
- 业务接口公共头：`Authorization: Bearer <TENANT_ACCESS_TOKEN>` + `Content-Type: application/json; charset=utf-8`（一手依据：[Go/Python SDK 传输层 `resource/app_table_record.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/resource/app_table_record.py) 中 `option.headers[CONTENT_TYPE] = f"{APPLICATION_JSON}; charset=utf-8"`；[`docs/research/feishu-tenant-token-ip-whitelist.md:141`](F:/ai_work/docs/research/feishu-tenant-token-ip-whitelist.md#L141) 亦记录 SDK 原值带 `; charset=utf-8`）。使用者已实测换 token 成功，回包 `{"code":0,"expire":6243,"msg":"ok","tenant_access_token":...}`。
- 本仓既有结论：[`docs/research/spreadsheet-platform-capabilities.md:35`](F:/ai_work/docs/research/spreadsheet-platform-capabilities.md#L35) 已一手确认 `batch_create` 资源路径、[`:37`](F:/ai_work/docs/research/spreadsheet-platform-capabilities.md#L37) 记录单次上限 500 / 1000 冲突、[`:38`](F:/ai_work/docs/research/spreadsheet-platform-capabilities.md#L38) 明确「`app-table/create`、`app-table-field/create`、`app-table-record/create` 三个接口的逐条请求参数与配额」为未验证（本笔记专门补齐）；[`docs/research/feishu-tenant-token-ip-whitelist.md:108`](F:/ai_work/docs/research/feishu-tenant-token-ip-whitelist.md#L108) 一手确认 API Explorer 通用入口。

一手源码 URL 根（用于复核下表链接标签）：

- Go SDK：<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model_ext.go>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/apiresp.go>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/>。
- Python SDK：<https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/resource/>。
- 文件名清单（一手确认文件存在）：<https://api.github.com/repos/larksuite/oapi-sdk-go/contents/service/bitable/v1?ref=v3_main>（仅 `model.go` / `model_ext.go` / `resource.go` 三个文件）、<https://api.github.com/repos/larksuite/oapi-sdk-python/contents/lark_oapi/api/bitable/v1/model?ref=v2_main>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/__init__.py>。

---

## 1. Step 2 — 创建多维表格 `POST /open-apis/bitable/v1/apps`

**路径与请求方式**：`POST /open-apis/bitable/v1/apps`（一手：[`service/bitable/v1/resource.go · func (a *app) Create`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)，`apiReq.ApiPath = "/open-apis/bitable/v1/apps"`、`apiReq.HttpMethod = http.MethodPost`；[`model/create_app_request.py · class CreateAppRequest`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_request.py)，`http_method = HttpMethod.POST`、`uri = "/open-apis/bitable/v1/apps"`、`token_types = {AccessTokenType.USER, AccessTokenType.TENANT}`）。

**请求体层级**：请求体是**扁平的 `ReqApp` 对象**，没有 `app` / `data` 之类的外层包裹键（一手：[`service/bitable/v1/model.go · type CreateAppReq struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)，字段 `` ReqApp *ReqApp `body:""` ``；同文件 `CreateAppReqBuilder.Build()` 中 `req.apiReq.Body = builder.reqApp`；[`model/create_app_request.py · request_body()`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_request.py)，`self._create_app_request.body = request_body`；Python SDK 模型目录**不存在** `create_app_request_body.py`，见 [`model/__init__.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/__init__.py) 的导出清单）。

### 1.1 请求体字段（完整清单）

| 字段名 | 类型 | 是否必填 | 含义 | 示例值 | 一手依据 |
| --- | --- | --- | --- | --- | --- |
| `name` | string | **未验证**：Go 为 `json:"name,omitempty"`、builder 注释无「该字段必填」；Python `_types` 无必填标记；官方文档页 SPA 正文取不到，服务端实际校验规则未确认 | 多维表格 App 名称，最长 255 个字符 | `"<APP_NAME>"`（SDK builder 注释示例值原文：`一篇新的多维表格`） | [`model.go · type ReqApp struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model.go · ReqAppBuilder.Name`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model/req_app.py · class ReqApp`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/req_app.py) `_types = {"name": str, "folder_token": str, "time_zone": str}` |
| `folder_token` | string | 可选（一手：Go 注释「默认为空，表示多维表格将被创建在云空间根目录。」+ `omitempty`） | 多维表格 App 归属文件夹；注释另注「请确保调用身份拥有在该文件夹中的编辑权限。若应用使用的是 `tenant_access_token` 权限，此处仅可指定应用创建的文件夹」 | `"<FOLDER_TOKEN>"`（SDK 注释给出 `fld...` 形式示例值，本文用占位符代替） | [`model.go · type ReqApp struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model.go · ReqAppBuilder.FolderToken`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model/req_app.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/req_app.py) |
| `time_zone` | string | 可选（`omitempty`） | 文档时区 | `"<TIME_ZONE>"`（SDK builder 注释示例值：`Asia/Macau`） | [`model.go · type ReqApp struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model.go · ReqAppBuilder.TimeZone`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model/req_app.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/req_app.py) |

必填性的判读边界（一手）：同一份 Go `model.go` 的 [`type ReqTable struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go) 对 `Name` 明确注释「数据表名称。该字段必填。」，说明 SDK 生成注释在必填时会标注；`ReqApp` 三个字段均无此标注 → SDK 层可坐实「无字段被标注必填」，但「服务端是否强制要求 `name`」仍 **未验证**（[创建多维表格官方页](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create?lang=zh-CN) 为 SPA，只回 HTTP 200 + 标题「创建多维表格 - 服务端 API - 飞书开放平台」，正文取不到）。

### 1.2 可选查询参数（不是请求体）

Go SDK `CreateAppReqBuilder` 另外暴露 4 个查询参数（一手：[`service/bitable/v1/model.go · type CreateAppReqBuilder struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)；[Go sample `create_app.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/create_app.go) 四个都填了示例值）：`customized_config`（bool，示例 `false`）、`source_app_token`（string，示例 `"<SOURCE_APP_TOKEN>"`）、`copy_types`（string 数组，示例 `[]`）、`api_type`（string，示例 `"new"`）。**Python SDK 的 `CreateAppRequest` 未暴露任何查询参数**（一手：[`model/create_app_request.py · class CreateAppRequest`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_request.py) 只有 `request_body`），属跨 SDK 差异，最小请求（本文第末节）一个都不需要。

### 1.3 回包字段与层级

- 顶层 `code` / `msg`：[`core/apiresp.go · type CodeError struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/apiresp.go) 逐字为 `` Code int `json:"code"` ``、`` Msg string `json:"msg"` ``；[`service/bitable/v1/model.go · type CreateAppResp struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go) 嵌入 `larkcore.CodeError`，并带 `` Data *CreateAppRespData `json:"data"` ``，且 `func (resp *CreateAppResp) Success() bool { return resp.Code == 0 }` → `code == 0` 才算成功，`msg` 原样展示。
- `data` → `data.app`：[`model.go · type CreateAppRespData struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go) `` App *App `json:"app,omitempty"` ``；[`model/create_app_response_body.py · class CreateAppResponseBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_response_body.py) `_types = {"app": App}`。

| 回包字段 | 类型 | 层级 | 含义 | 一手依据 |
| --- | --- | --- | --- | --- |
| `code` | int | 顶层 | 业务返回码，`0` 为成功 | [`core/apiresp.go · type CodeError struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/apiresp.go)、[`model.go · type CreateAppResp struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go) |
| `msg` | string | 顶层 | 返回信息 | 同上 |
| `data.app.app_token` | string | `data` → `app` | 多维表格 app token，后续 URL 里的 `<APP_TOKEN>` | [`model.go · type App struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model/app.py · class App`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/app.py) `_types` |
| `data.app.name` | string | `data` → `app` | 多维表格 App 名字 | 同上 |
| `data.app.revision` | int | `data` → `app` | 多维表格 App 版本号 | 同上 |
| `data.app.folder_token` | string | `data` → `app` | 归属文件夹 | 同上 |
| `data.app.url` | string | `data` → `app` | 多维表格 App URL | 同上 |
| `data.app.default_table_id` | string | `data` → `app` | **默认的表格 id**（注释原文「默认的表格id」） | 同上 |
| `data.app.time_zone` | string | `data` → `app` | 文档时区 | 同上 |

**关键更正：创建多维表格的回包里没有 `table_id` 字段**。Go `App` struct 与 Python `app.py` 的 `_types = {"app_token": str, "name": str, "revision": int, "folder_token": str, "url": str, "default_table_id": str, "time_zone": str}` 都只列 `default_table_id`，没有 `table_id`（一手：[`model.go · type App struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model/app.py · class App`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/app.py)）。因此 Step 3/4 路径中的 `<TABLE_ID>` 应取 `data.app.default_table_id`，或取第 2 节建表回包的 `data.table_id`。

文档页状态：[创建多维表格](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create?lang=zh-CN) HTTP 200，仅标题「创建多维表格 - 服务端 API - 飞书开放平台」，正文取不到 → 文档页对字段清单、必填性、回包字段的文字描述 **未验证**。

---

## 2. 创建后是否自带默认数据表与 `table_id`

- **自带一个空白数据表**：一手 [`service/bitable/v1/resource.go · func (a *app) Create`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go) 方法注释逐字为「在指定文件夹中创建一个多维表格，包含一个空白的数据表。」；本仓 [`docs/research/spreadsheet-platform-capabilities.md:17`](F:/ai_work/docs/research/spreadsheet-platform-capabilities.md#L17) 也已记录同一结论。
- **它的 `table_id` 从哪来**：`data.app.default_table_id`（第 1.3 节，一手 Go `type App struct` / Python `app.py`）。**未验证**：该默认数据表的初始字段清单（是否只有一个索引字段、字段名是什么）——Go `ReqTable` 注释描述的是「新建数据表」接口的空表行为，不是「创建多维表格」自带的默认表；官方页 SPA 正文取不到，不能把两者等同。
- **若需另建数据表**（不是冒烟必需，因已自带一张表）：`POST /open-apis/bitable/v1/apps/<APP_TOKEN>/tables`（一手：[`service/bitable/v1/resource.go · func (a *appTable) Create`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)，`apiReq.ApiPath = "/open-apis/bitable/v1/apps/:app_token/tables"`、`http.MethodPost`；[`model/create_app_table_request.py · class CreateAppTableRequest`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_request.py) `uri` 同上、POST；[Go sample `create_appTable.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/create_appTable.go)）。

建表请求体是 `{"table": {...}}` 一层包裹（一手：[`model/create_app_table_request_body.py · class CreateAppTableRequestBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_request_body.py) `_types = {"table": ReqTable}`；[Go sample `create_appTable.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/create_appTable.go) `NewCreateAppTableReqBodyBuilder().Table(...)`）：

| 字段名 | 类型 | 是否必填 | 含义 | 示例值 | 一手依据 |
| --- | --- | --- | --- | --- | --- |
| `table` | object | **未验证**（Python `self.table: Optional[ReqTable] = None` 为可选声明；Go SDK 该 body 的 tag 本轮未逐字抄录；官方页 SPA 正文取不到）。但它是 body 的唯一顶层键，最小请求必填它才能带出表名 | 数据表描述对象 | `{"name":"<TABLE_NAME>"}` | [`model/create_app_table_request_body.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_request_body.py)、[Go sample `create_appTable.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/create_appTable.go) |
| `table.name` | string | **必填**（一手：Go 注释原文「数据表名称。该字段必填。」） | 数据表名称；首尾空格会被去除；不可包含 `/ \ ? * : [ ]` 等特殊字符 | `"<TABLE_NAME>"`（SDK 示例值 `一个新的数据表`） | [`service/bitable/v1/model.go · type ReqTable struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model/req_table.py · class ReqTable`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/req_table.py) `_types = {"name": str, "default_view_name": str, "fields": List[AppTableCreateHeader]}` |
| `table.default_view_name` | string | 可选；若传则**必须同时传 `fields`**（一手：Go `ReqTable` 注释「如果传入了 `default_view_name` 字段，则必须传入 `fields` 字段」） | 默认视图名 | `"<VIEW_NAME>"`（SDK 示例值 `表格视图`） | 同上 |
| `table.fields` | 数组 | 可选（不传 `default_view_name` 时）；都不传则创建「仅包含索引字段的空数据表」 | 初始字段；第一个字段为索引字段，仅支持类型 `1 / 2 / 5 / 13 / 15 / 20 / 22`（多行文本 / 数字 / 日期 / 电话号码 / 超链接 / 公式 / 地理位置） | **未验证**（数组元素的完整字段清单未逐字抄录；元素类型 `AppTableCreateHeader` 的字段名一手见 [`model.go · type AppTableCreateHeader struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)：`field_name` / `type` / `ui_type` / `field_id` / `property` / `description`） | [`service/bitable/v1/model.go · type ReqTable struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model/req_table.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/req_table.py) |

建表回包：`data.table_id`、`data.default_view_id`、`data.field_id_list`（一手：[`model/create_app_table_response_body.py · class CreateAppTableResponseBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_response_body.py) `_types = {"table_id": str, "default_view_id": str, "field_id_list": List[str]}`）。Go SDK 另有「新增多个数据表」`POST /open-apis/bitable/v1/apps/:app_token/tables/batch_create`，注释「新增多个数据表，仅可指定数据表名称」「每个多维表格中，数据表与仪表盘的总数量上限为 100」（一手：[`service/bitable/v1/resource.go · func (a *appTable) BatchCreate`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)）。

文档页状态：[新增一个数据表](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table/create?lang=zh-CN) HTTP 200，仅标题「新增一个数据表 - 服务端 API - 飞书开放平台」，正文取不到 → 文档页逐条参数 **未验证**。

---

## 3. Step 3 — 新增字段 `POST /open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/fields`

**路径与请求方式**：`POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields`（一手：[`service/bitable/v1/resource.go · func (a *appTableField) Create`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)；[`model/create_app_table_field_request.py · class CreateAppTableFieldRequest`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_field_request.py) `http_method = HttpMethod.POST`、`uri = "/open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields"`、`token_types = {USER, TENANT}`；[Go sample `create_appTableField.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/create_appTableField.go) 注释 `// POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields`）。

**请求体层级**：扁平的单个 `AppTableField` 对象，**无外层包裹键**（一手：[Go sample `create_appTableField.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/create_appTableField.go) `NewCreateAppTableFieldReqBuilder().AppTableField(NewAppTableFieldBuilder()...Build())`；[`model/create_app_table_field_request.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_field_request.py) `request_body: Optional[AppTableField]` 且 `request_body()` 直接 `self._create_app_table_field_request.body = request_body`；Python 模型目录不存在 `create_app_table_field_request_body.py`，见 [`model/__init__.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/__init__.py)）。即**一次调用只建一个字段**；「是否存在批量新增字段接口」本轮未取证，**未验证**。

### 3.1 请求体字段

| 字段名 | 类型 | 是否必填 | 含义 | 示例值 | 一手依据 |
| --- | --- | --- | --- | --- | --- |
| `field_name` | string | **未验证**（SDK 全部字段均 `omitempty`、无「该字段必填」标注；官方页 SPA 正文取不到） | 字段名 | `"工时"` / `"时薪"`（SDK 示例值 `字段名称`） | [`service/bitable/v1/model.go · type AppTableField struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go) `` FieldName *string `json:"field_name,omitempty"` // 字段名 ``、[`model/app_table_field.py · class AppTableField`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/app_table_field.py) `_types = {"field_name": str, "type": int, "property": AppTableFieldProperty, "description": AppTableFieldDescription, "is_primary": bool, "field_id": str, "ui_type": str, "is_hidden": bool}` |
| `type` | int | 同上 | 字段类型枚举（见 3.2），数字 = `2` | `2` | 同上（`` Type *int `json:"type,omitempty"` // 字段类型 ``）；[`service/bitable/v1/model.go · TypeNumber`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go) |
| `ui_type` | string | 可选 | 字段 UI 类型；数字对应常量 `UiTypeNumber = "Number"` | `"Number"` | [`service/bitable/v1/model.go · UiTypeNumber`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model.go · type AppTableField struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go) `` UiType *string `json:"ui_type,omitempty"` `` |
| `property` | object | 可选 | 字段属性；`formatter` 为「数字和公式字段的显示格式」 | 冒烟不需要 | [`service/bitable/v1/model.go · type AppTableFieldProperty struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)（键含 `formatter` / `options` / `min` / `max` / `currency_code` 等）；[`model/app_table_field_property.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/app_table_field_property.py) |
| `description` | object | 可选 | 字段描述 | 冒烟不需要 | [`model.go · type AppTableField struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model/app_table_field.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/app_table_field.py) |
| `is_primary` | bool | 可选 | 是否是索引列 | `false` | 同上 |
| `field_id` | string | 可选 | 字段 id（回包字段，请求中不该手填） | 冒烟不需要 | 同上 |
| `is_hidden` | bool | 可选 | 是否隐藏 | `false` | 同上 |

**`client_token` 是查询参数，不是请求体字段**（一手：[`model/create_app_table_field_request.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_field_request.py) `client_token` 走 `add_query("client_token", ...)`；[Go sample `create_appTableField.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/create_appTableField.go) `.ClientToken("<CLIENT_TOKEN>")`）。`app_token` / `table_id` 都是路径参数（一手：同 Python 文件 `paths[...]`）。

### 3.2 字段类型枚举（数字 = 2，一手坐实）

- 常量逐字：`TypeText = 1 // 文本`、`TypeNumber = 2 // 数字`、`TypeSingleSelect = 3`、`TypeMultiSelect = 4`、`TypeDateTime = 5`、`TypeCheckbox = 7`、`TypeUser = 11`、`TypePhoneNumber = 13`、`TypeUrl = 15`、`TypeAttachment = 17`、`TypeLink = 18`、`TypeFormula = 20`、`TypeDuplexLink = 21`、`TypeLocation = 22`、`TypeGroupChat = 23`、`TypeCreatedTime = 1001`、`TypeModifiedTime = 1002`、`TypeCreatedUser = 1003`、`TypeModifiedUser = 1004`、`TypeAutoSerial = 1005`（一手：[`service/bitable/v1/model.go · 常量区`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)）。
- 另一处一手注释给出完整枚举释义（[`service/bitable/v1/model.go · FieldType 注释`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)）：`1：多行文本`、`2：数字`、`3：单选`、`4：多选`、`5：日期`、`7：复选框`、`11：人员`、`13：电话号码`、`15：超链接`、`17：附件`、`18：单向关联`、`19：查找引用`、`20：公式`、`21：双向关联`、`22：地理位置`、`23：群组`、`1001：创建时间`、`1002：最后更新时间`、`1003：创建人`、`1004：修改人`、`1005：自动编号`。→ **数字类型对应数值 = 2**（与常量 `TypeNumber = 2` 一致）。
- 注意 Go sample 里写的是 `Type(0)`（占位示例，不是有效类型值）；有效值应以常量/枚举注释为准（一手：[Go sample `create_appTableField.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/create_appTableField.go)）。

### 3.3 回包

`data.field`，类型为 `AppTableField`（一手：[`model/create_app_table_field_response_body.py · class CreateAppTableFieldResponseBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/create_app_table_field_response_body.py) `_types = {"field": AppTableField}`），即回包里可拿到新字段的 `field_id` / `field_name` / `type`。顶层 `code` / `msg` 层级同第 1.3 节（同为 Go SDK `larkcore.CodeError` 生成模型）。

**建出「工时」「时薪」两个数值列的最小 JSON**：因为一次调用只建一个字段，需 POST 两次，请求体分别为 `{"field_name":"工时","type":2}` 与 `{"field_name":"时薪","type":2}`（见末节）。文档页状态：[新增字段](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/create?lang=zh-CN) HTTP 200，仅标题「新增字段 - 服务端 API - 飞书开放平台」，正文取不到 → 文档页对枚举值、必填性、回包的文字描述 **未验证**；本仓既有笔记 [`docs/research/spreadsheet-platform-capabilities.md:33`](F:/ai_work/docs/research/spreadsheet-platform-capabilities.md#L33) 记录的前提条件为「当前调用身份已有多维表格的编辑等文档权限，否则返回 HTTP 403 或 400」。

---

## 4. Step 4 — 批量新增记录 `POST /open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/records/batch_create`

**路径与请求方式**：`POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/batch_create`（一手：[`service/bitable/v1/resource.go · func (a *appTableRecord) BatchCreate`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go) `apiReq.ApiPath = "/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/batch_create"`、`http.MethodPost`；[`model/batch_create_app_table_record_request.py · class BatchCreateAppTableRecordRequest`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/batch_create_app_table_record_request.py) `HttpMethod.POST`、`uri` 同上、`token_types = {USER, TENANT}`；资源路径已由 [`docs/research/spreadsheet-platform-capabilities.md:35`](F:/ai_work/docs/research/spreadsheet-platform-capabilities.md#L35) 一手确认）。

### 4.1 请求体字段

| 字段名 | 类型 | 是否必填 | 含义 | 示例值 | 一手依据 |
| --- | --- | --- | --- | --- | --- |
| `records` | 数组 | **未验证**（SDK `_types` 只声明类型、无必填标注；官方页 SPA 正文取不到） | 待新增的记录数组，元素为 `AppTableRecord` | `[{"fields":{...}}, {"fields":{...}}]` | [`model/batch_create_app_table_record_request_body.py · class BatchCreateAppTableRecordRequestBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/batch_create_app_table_record_request_body.py) `_types = {"records": List[AppTableRecord]}`；[Go sample `batchCreate_appTableRecord.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/batchCreate_appTableRecord.go) `NewBatchCreateAppTableRecordReqBodyBuilder().Records(...)` |
| `records[].fields` | object（`map[string]interface{}` / `Dict[str, Any]`） | 同上 | **记录字段**，键为**字段名**（中文列名），值可为任意 JSON | `{"工时":8,"时薪":100}` | [`service/bitable/v1/model.go · type AppTableRecord struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go) `` Fields map[string]interface{} `json:"fields,omitempty"` // 记录字段 ``；[`model/app_table_record.py · class AppTableRecord`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/app_table_record.py) `_types = {"fields": Dict[str, Any], "record_id": str, ...}`；[`service/bitable/v1/model_ext.go · StringField(key string)`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model_ext.go) 按 `a.Fields[key]` 取值 |
| `records[].record_id` / `created_by` / `created_time` / `last_modified_by` / `last_modified_time` / `shared_url` / `record_url` | string / int / object | 可选，写入时不需要 | 回包带回的记录元信息 | 冒烟不需要 | [`model/app_table_record.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/app_table_record.py)、[`service/bitable/v1/model.go · type AppTableRecord struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go) |

「`fields` 的键是字段名而非 `field_id`」的旁证：[`service/bitable/v1/resource.go · func (a *appTableRecord) Update`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go) 注释里的 JSON 示例逐字为 `{"fields": {"文本字段": null}}`（一手）；但「服务端是否也接受 `field_id` 作键」**未验证**（官方页 SPA 正文取不到）。

**可选查询参数（不是请求体）**：`user_id_type`、`client_token`、`ignore_consistency_check`（一手：[`model/batch_create_app_table_record_request.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/batch_create_app_table_record_request.py) 三者均走 `add_query(...)`；[Go sample `batchCreate_appTableRecord.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/batchCreate_appTableRecord.go) `.UserIdType("user_id").ClientToken(...).IgnoreConsistencyCheck(true)`）。最小请求一个都不需要。

### 4.2 回包

`data.records`，元素为 `AppTableRecord`（一手：[`model/batch_create_app_table_record_response_body.py · class BatchCreateAppTableRecordResponseBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/batch_create_app_table_record_response_body.py) `_types = {"records": List[AppTableRecord]}`），即可读回每条记录的 `record_id` 与 `fields`。顶层 `code` / `msg` 同第 1.3 节。

### 4.3 单次调用条数上限

- **官方 Go SDK 一手注释 = 1,000 条**：[`service/bitable/v1/resource.go · func (a *appTableRecord) BatchCreate`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go) 注释逐字「在多维表格数据表中新增多条记录，单次调用最多新增 1,000 条记录。」；同文件 `BatchUpdate` 注释亦为 1,000。
- **500 的来源（一手可解释，但不是新增上限）**：同一文件 [`func (a *appTableRecord) BatchDelete`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go) 注释逐字「单次调用中最多删除 500 条记录」——是**批量删除**的上限；`BatchGet` 注释「该接口最多支持查询 100 条记录」。本仓既有笔记 [`docs/research/spreadsheet-platform-capabilities.md:37`](F:/ai_work/docs/research/spreadsheet-platform-capabilities.md#L37) 记录的 500 / 1000 冲突来自两份**非官方** SDK（chyroc/lark 与 fengchenggang1995/lark）的注释，不是官方 SDK。
- **文档级上限仍标「未验证」**：[新增多条记录官方页](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/batch_create?lang=zh-CN) 为 SPA，HTTP 200 仅标题「新增多条记录 - 服务端 API - 飞书开放平台」，正文取不到；官方 Python SDK 的 `resource/` 传输层与 `model/` 模型文件里**没有**任何条数上限注释（一手：[`lark_oapi/api/bitable/v1/resource/app_table_record.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/resource/app_table_record.py)、[`model/batch_create_app_table_record_request_body.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/batch_create_app_table_record_request_body.py)）。
- 结论：按官方 Go SDK 可写「单次 ≤ 1,000 条」（SDK 层一手坐实），但**「官方文档页白纸黑字的上限」未验证，SDK 注释 500 与 1000 冲突的说法按上条更正为：官方 SDK 内 1,000（新增）/ 500（删除），冲突只存在于两份非官方 SDK 之间**。冒烟只写 2 行，无论 500 还是 1,000 都可行，不依赖该结论。

---

## 5. Step 5 — 查询记录 / 读回（一手确认到什么程度）

| 接口 | 请求方式与路径 | 请求体字段（一手） | 回包字段（一手） | 一手依据 |
| --- | --- | --- | --- | --- |
| 查询记录（推荐） | `POST /open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/records/search` | body 为 `SearchAppTableRecordRequestBody`：`view_id`、`field_names`、`sort`、`filter`、`automatic_fields`；`request_body` 声明为 `Optional[...]`（body 可省略）；查询参数 `user_id_type`、`page_token`、`page_size` | `data.items`（`List[AppTableRecord]`）、`data.has_more`（bool）、`data.page_token`（string）、`data.total`（int） | [`model/search_app_table_record_request.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_request.py)、[`model/search_app_table_record_request_body.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_request_body.py)、[`model/search_app_table_record_response_body.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_response_body.py)、[`service/bitable/v1/resource.go · func (a *appTableRecord) Search`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)（`POST .../records/search`，注释「单次最多查询 500 行记录，支持分页获取。」）、[Go sample `search_appTableRecord.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/search_appTableRecord.go) |
| 列出记录（已废弃） | `GET /open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/records` | 查询参数 `view_id`、`filter`、`sort`、`field_names`、`text_field_as_array`、`user_id_type`、`display_formula_ref`、`automatic_fields`、`page_token`、`page_size` | **未验证**（`list_app_table_record_response_body.py` 本轮未逐字抄录） | [`model/list_app_table_record_request.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/list_app_table_record_request.py)（`HttpMethod.GET`）、[`service/bitable/v1/resource.go · func (a *appTableRecord) List`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)（`GET .../records`，注释「单次最多列出 500 行记录」且标注废弃、建议改用 Search） |

一手确认程度：**路径、HTTP 方法、请求体键名、查询参数、回包键名均由两个官方 SDK 的模型/资源文件逐字坐实**（上表链接）；Go SDK 注释另给出 Search / List 的 500 行分页上限。**未验证**：官方文档页对读回接口的完整参数说明与最小可复制读回请求体（[`https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/search?lang=zh-CN`](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/search?lang=zh-CN) 为 SPA，HTTP 200 仅通用标题「开发文档 - 飞书开放平台」，正文取不到）；`List` 回包字段本轮未取证。冒烟读回请优先用 `POST .../records/search`，并按 `code == 0` + `data.items` 判断。

---

## 6. 飞书 API Explorer（API 调试台）入口与深链

- **通用入口**：`https://open.feishu.cn/api-explorer`（一手：[`docs/research/feishu-tenant-token-ip-whitelist.md:108`](F:/ai_work/docs/research/feishu-tenant-token-ip-whitelist.md#L108)，其依据为 Go SDK `service/auth/v3/resource.go` 注释逐字给出的带参完整 URL `https://open.feishu.cn/api-explorer?from=op_doc_tab&apiName=internal&project=auth&resource=tenant_access_token&version=v3`，<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/resource.go>）。该页为 SPA，正文取不到。
- **「创建多维表格」深链（一手坐实，非编造）**：`https://open.feishu.cn/api-explorer?from=op_doc_tab&apiName=create&project=bitable&resource=app&version=v1`，逐字来自 [`service/bitable/v1/resource.go · func (a *app) Create`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go) 方法注释。
- 同批一手深链（同一文件各方法注释）：新增数据表 `?from=op_doc_tab&apiName=create&project=bitable&resource=app.table&version=v1`（[`func (a *appTable) Create`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)）、新增字段 `?from=op_doc_tab&apiName=create&project=bitable&resource=app.table.field&version=v1`（[`func (a *appTableField) Create`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)）、批量新增记录 `?from=op_doc_tab&apiName=batch_create&project=bitable&resource=app.table.record&version=v1`（[`func (a *appTableRecord) BatchCreate`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)）、查询记录 `?from=op_doc_tab&apiName=search&project=bitable&resource=app.table.record&version=v1`（[`func (a *appTableRecord) Search`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)）。
- 边界：以上深链是**SDK 注释逐字给出的 URL**，可一手确认；但「API Explorer 页面是否按此参数渲染出对应接口、页面上的按钮/菜单标签叫什么」**未验证、以页面实际标签为准**（`https://open.feishu.cn/api-explorer` 为 SPA，正文取不到）。导航式说明：打开通用入口 → 在页面内按实际标签找到「服务端 API / 多维表格 / 创建多维表格」类目 → 用页面自带的调试表单填写参数；不要写死按钮或菜单文案。

---

## 相关官方页面精确 URL（逐条标注正文是否取到）

| 页面 | 精确 URL | HTTP / 标题 | 正文是否取到 |
| --- | --- | --- | --- |
| 创建多维表格 | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create?lang=zh-CN | 200 /「创建多维表格 - 服务端 API - 飞书开放平台」 | 否：SPA，仅标题 |
| 新增一个数据表 | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table/create?lang=zh-CN | 200 /「新增一个数据表 - 服务端 API - 飞书开放平台」 | 否：SPA，仅标题 |
| 新增字段 | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/create?lang=zh-CN | 200 /「新增字段 - 服务端 API - 飞书开放平台」 | 否：SPA，仅标题 |
| 新增多条记录 | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/batch_create?lang=zh-CN | 200 /「新增多条记录 - 服务端 API - 飞书开放平台」 | 否：SPA，仅标题 |
| 查询记录 | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/search?lang=zh-CN | 200 /「开发文档 - 飞书开放平台」 | 否：SPA，仅通用标题 |
| API Explorer 通用入口 | https://open.feishu.cn/api-explorer | 200 /（SPA，见 `feishu-tenant-token-ip-whitelist.md:108`） | 否 |

---

## 未验证汇总

| 项 | 原因 |
| --- | --- |
| Step 2 请求体三个字段的服务端必填性（`name` 是否强制） | 官方页 SPA 正文取不到；SDK 全部 `omitempty` 且无「该字段必填」标注（对照 `ReqTable.Name` 有标注，可确认 SDK 层无必填字段，但不等于服务端不要求） |
| 创建多维表格自带的默认数据表的初始字段清单 | Go SDK 只说「包含一个空白的数据表」，未列字段；`ReqTable` 的空表规则属于另一接口，不能等同；官方页 SPA |
| `table.name` 之外 `fields` 数组元素的完整必填规则与服务端校验 | 元素类型 `AppTableCreateHeader` 字段名一手可见，但官方文档页 SPA 正文取不到；最小请求不用该字段 |
| 新增字段 `field_name` / `type` 的服务端必填性、`type` 枚举在文档页的逐条释义 | 官方页 SPA；枚举数值来自 SDK 常量与注释（一手） |
| 是否存在「批量新增字段」接口 | 本轮只取证到单个字段的 create 模型，未查批量接口 |
| `fields` 键是否也接受 `field_id`（而非中文列名） | SDK 注释示例用字段名，官方页 SPA 正文取不到 |
| 批量新增记录的文档级单次上限 | 官方页 SPA；官方 Go SDK 注释 = 1,000（新增）/ 500（删除），Python SDK 无上限注释；既有笔记的 500/1000 冲突来自两份非官方 SDK |
| `List` 读回接口回包字段、最小读回请求体的服务端接受度 | `list_app_table_record_response_body.py` 本轮未逐字抄录；官方页 SPA |
| API Explorer 页面按钮/菜单标签、深链在页面上的实际渲染 | 通用入口 SPA 正文取不到；深链 URL 本身由 SDK 注释一手给出 |
| 控制台内任何按钮/菜单标签 | 无一手来源，一律「未验证、以页面实际标签为准」 |

---

## 对决策的影响

1. **SMOKE-RUNBOOK.md 的 Step 2 可以从占位符换成可直接复制的 JSON**：请求体逐字为扁平 `{"name":"<APP_NAME>","folder_token":"<FOLDER_TOKEN>","time_zone":"<TIME_ZONE>"}`（三个键全部来自官方 Go `ReqApp` + Python `req_app.py`），回包按顶层 `code`/`msg` + `data.app.*` 解析；**必须把「`table_id`」改成 `data.app.default_table_id`**——创建回包里没有 `table_id`（一手 Go `App` / Python `app.py`）。唯一要留余地的是三个字段的服务端必填性（未验证）：脚本应保留三个键并允许按需删去 `folder_token` / `time_zone`，用 `code == 0` 判定成功。
2. **Step 3 可以从占位符换成可直接复制的 JSON，但要写成「两次调用」**：新增字段 body 是扁平单个 `AppTableField`，`field_name` + `type` 两个键一手坐实，数字类型 `2` 由官方 SDK 常量 `TypeNumber = 2` 与枚举注释双重坐实；`client_token` 是查询参数不是 body 字段。仍须标未验证的是 `field_name`/`type` 的服务端必填性与枚举的文档页释义；`ui_type:"Number"` / `property.formatter` 属可选装饰，冒烟可不写。
3. **Step 4 可以从占位符换成可直接复制的 JSON**：`{"records":[{"fields":{...}},{"fields":{...}}]}` 与 `fields` 键名一手坐实（Go `AppTableRecord` + Python `app_table_record.py`），回包 `data.records`；两行示例（`工时=8,时薪=100` / `工时=10,时薪=80`）远低于任何候选上限，**单次上限本身不必写死**：文档级上限未验证，官方 Go SDK 注释 1,000（新增）/ 500（删除），既有 500/1000 冲突来自非官方 SDK，脚本按「单次 ≤ 1,000」保守执行并在超量时分页。
4. **Step 5 读回可写成 SDK 层一手坐实的指令**：优先 `POST /open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/records/search`，按 `data.items` + `data.has_more` / `data.page_token` 分页；`GET .../records` 已废弃。仍须标未验证的是文档页的参数说明、最小读回 body 的服务端接受度与 `List` 回包字段。
5. **向导里凡涉及控制台页面标签、API Explorer 深链渲染效果、必填性/枚举/上限的文档级规则，一律保留「未验证、以页面实际标签为准」后缀**；只有本文链接标注的 SDK 源码（路径、方法、JSON 键名、常量数值）可以写成确定句。`SMOKE-RUNBOOK.md` 目前不在本工作区（本轮未读到该文件），落地时应把上述三段 JSON 与 `default_table_id` 的取值说明一并抄入。

---

## 可直接复制的请求体（Step 2 / 3 / 4）

统一请求头（占位符，非 JSON 请求体）：`Authorization: Bearer <TENANT_ACCESS_TOKEN>`、`Content-Type: application/json; charset=utf-8`。三段 JSON 均只用占位符；字段名「工时」「时薪」与数值 8 / 100 / 10 / 80 为任务给定的业务内容，不是凭据。

**Step 2 — 创建多维表格**　`POST https://open.feishu.cn/open-apis/bitable/v1/apps`

```json
{
  "name": "<APP_NAME>",
  "folder_token": "<FOLDER_TOKEN>",
  "time_zone": "<TIME_ZONE>"
}
```

回包取 `data.app.app_token` → `<APP_TOKEN>`，`data.app.default_table_id` → `<TABLE_ID>`；`code == 0` 才算成功。三个键的服务端必填性未验证，若该文件夹权限/时区不适用，可删去 `folder_token`、`time_zone` 再试（一手：[`model.go · type ReqApp struct`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)、[`model/req_app.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/req_app.py)）。

**Step 3 — 新增字段**　`POST https://open.feishu.cn/open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/fields`

一次调用只建一个字段，故 POST 两次（仅 body 不同）。以下两段合起来是 Step 3 的完整最小 JSON：

**Step 3（调用 1/2 · 工时）**

```json
{
  "field_name": "工时",
  "type": 2
}
```

**Step 3（调用 2/2 · 时薪）**

```json
{
  "field_name": "时薪",
  "type": 2
}
```

`type: 2` = 数字（一手：[`model.go · TypeNumber`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go)；`client_token` 如需要请放查询参数而非 body）。回包 `data.field`。

**Step 4 — 批量新增记录**　`POST https://open.feishu.cn/open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/records/batch_create`

```json
{
  "records": [
    { "fields": { "工时": 8, "时薪": 100 } },
    { "fields": { "工时": 10, "时薪": 80 } }
  ]
}
```

回包 `data.records`；`code == 0` 才算成功。单次上限的文档级依据未验证，官方 Go SDK 注释为 1,000 条（新增），两行示例不受该争议影响（一手：[`model/batch_create_app_table_record_request_body.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/batch_create_app_table_record_request_body.py)、[`service/bitable/v1/resource.go · func (a *appTableRecord) BatchCreate`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go)）。
