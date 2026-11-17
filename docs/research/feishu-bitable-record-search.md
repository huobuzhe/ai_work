# 飞书多维表格「查询记录」精确最小请求体与回包（Step 5）

> **存放理由**：`SMOKE-RUNBOOK.md` 的 Step 5 要把「读回两行」从散文换成逐字可复制的 curl，而 HTTP 方法/路径、请求体 JSON 键名、回包 JSON 键名只能来自一手 SDK 模型与官方文档页，故与既有 7 份 `docs/research/` 笔记同处存放，便于向导与冒烟脚本引用同一份取证结论。

## 取证口径

- 只采一手来源：官方 Go SDK `github.com/larksuite/oapi-sdk-go` 的 `v3_main` 分支（`service/bitable/v1/{resource.go,model.go,model_ext.go}`、`sample/apiall/bitablev1/search_appTableRecord.go`、`core/apiresp.go`）；官方 Python SDK `github.com/larksuite/oapi-sdk-python` 的 `v2_main` 分支（`lark_oapi/api/bitable/v1/model/*.py`、`resource/app_table_record.py`）；官方服务端 API 文档页 `open.feishu.cn` / `open.larksuite.com`。
- 每条断言后紧跟一手 URL，或 SDK 源码文件路径 + 符号名 + 行号（Go：`type Xxx struct` / `func (a *appTableRecord) Search`；Python：`class Xxx` / `_types`）。下表链接标签即「路径 · 符号名 · 行号」，链接目标为同一仓库同一分支的 GitHub 逐行视图或 raw 直链。
- 官方页均为 SPA：`web_fetch` 只回 HTTP 200 与 `<title>`，正文取不到 → 凡只能由文档页正文证明的断言一律写「**未验证**」并说明原因。不采二手转述、不编造 JSON 键名、不编造深链参数。
- 全文占位符：`<APP_TOKEN>`、`<TABLE_ID>`、`$FEISHU_TENANT_ACCESS_TOKEN`，不写任何真实凭据；字段名「工时」「时薪」与数值 8 / 100 / 10 / 80 按任务要求原样保留（非凭据）。§5 描述单记录路径时保留 SDK 原样的 `:record_id` 路径参数写法，不引入新占位符、不进正文 curl。
- 本轮相对 [`docs/research/feishu-bitable-create-request-bodies.md`](F:/ai_work/docs/research/feishu-bitable-create-request-bodies.md) 只补 Step 5；该笔记 §5 已推荐 `records/search`，其「未验证汇总」两项本轮的处理见下文「未验证汇总」。

一手源码 URL 根（用于复核下表链接）：

- Go SDK：<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/resource.go>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/search_appTableRecord.go>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/apiresp.go>。
- Python SDK：<https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/>、<https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/resource/app_table_record.py>。
- 目录清单（一手确认文件存在）：<https://api.github.com/repos/larksuite/oapi-sdk-go/contents/service/bitable/v1?ref=v3_main>（仅 `model.go` / `model_ext.go` / `resource.go` 三个文件，`model.go` 424800 bytes）。

---

## 1. HTTP 方法与路径（一手坐实）

**断言**：查询记录接口为 `POST /open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/records/search`。

- [Go `service/bitable/v1/resource.go` · `func (a *appTableRecord) Search` :1246–1250](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1246-L1250) 逐字：`apiReq.ApiPath = "/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/search"`（:1249）、`apiReq.HttpMethod = http.MethodPost`（:1250）。
- [Python `lark_oapi/api/bitable/v1/model/search_app_table_record_request.py` · `class SearchAppTableRecordRequestBuilder`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_request.py)：`http_method = HttpMethod.POST`、`uri = "/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/search"`；`class SearchAppTableRecordRequest` 字段为 `user_id_type` / `page_token` / `page_size` / `app_token` / `table_id` / `request_body`。
- [Go SDK sample `sample/apiall/bitablev1/search_appTableRecord.go` · 文件头注释](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/search_appTableRecord.go)：`// POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/search`。
- [Go `resource.go` :1251](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1251)：`apiReq.SupportedAccessTokenTypes = []larkcore.AccessTokenType{larkcore.AccessTokenTypeTenant, larkcore.AccessTokenTypeUser}` → 支持 tenant_access_token；Python 同文件 `token_types = {AccessTokenType.TENANT, AccessTokenType.USER}` 一致。

**「`GET .../records` 已废弃」有没有一手依据**：有，但措辞需精确。Go SDK 对 `List`（`GET .../records`）的注释逐字为「该接口为历史接口，已不推荐使用。你可使用[查询记录]替代。」（[Go `resource.go` :1205](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1205)；[:1210–1214](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1210-L1214) 给出 `func (a *appTableRecord) List` 与 `apiReq.ApiPath = "/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records"`、`apiReq.HttpMethod = http.MethodGet`）。SDK 原文用「历史接口，已不推荐使用」，**未出现「已废弃」字面词**——「已废弃」是对其的概括，RUNBOOK 宜写成「官方 Go SDK 注释标为历史接口、不推荐使用，并建议用查询记录替代」。另外单记录 `Get` 接口（[Go `resource.go` :1177](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1177)）亦逐字标「该接口为历史版本接口，已不推荐使用」。Python `list_app_table_record_request.py` 仍保留 `http_method = HttpMethod.GET` / `uri = ".../records"`，生成代码里没有废弃注释（不作反证）。

---

## 2. `SearchAppTableRecordRequestBody` 完整字段清单（一手坐实）

**断言**：请求体 struct 只有 5 个字段，全部带 `omitempty`（Go）/ 声明为 `Optional[...] = None`（Python），SDK 层无「该字段必填」标注；`field_names` 的 json tag 确为 `field_names`、类型确为字符串数组；`automatic_fields` 类型为布尔；请求体内**没有** `page_token` / `page_size`（二者是查询参数）。

| # | 字段名（Go / Python） | json tag（逐字） | Go 类型 | Python `_types` | SDK 层必填? | 一手依据 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `ViewId` / `view_id` | `json:"view_id,omitempty"` | `*string` | `str` | 否（`omitempty` / `Optional`） | [Go `model.go` :10631](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10631)；[Python `search_app_table_record_request_body.py` · `class SearchAppTableRecordRequestBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_request_body.py) |
| 2 | `FieldNames` / `field_names` | `json:"field_names,omitempty"` | `[]string` | `List[str]` | 否 | [Go `model.go` :10633](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10633)；同上 Python 文件 |
| 3 | `Sort` / `sort` | `json:"sort,omitempty"` | `[]*Sort` | `List[Sort]` | 否 | [Go `model.go` :10635](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10635)；同上 Python 文件 |
| 4 | `Filter` / `filter` | `json:"filter,omitempty"` | `*FilterInfo` | `FilterInfo` | 否 | [Go `model.go` :10637](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10637)；同上 Python 文件 |
| 5 | `AutomaticFields` / `automatic_fields` | `json:"automatic_fields,omitempty"` | `*bool` | `bool` | 否 | [Go `model.go` :10639](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10639)；同上 Python 文件 |

[Go `service/bitable/v1/model.go` · `type SearchAppTableRecordReqBody struct` :10630–10640](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10630-L10640) 字段行逐字：

```go
ViewId *string `json:"view_id,omitempty"`
FieldNames []string `json:"field_names,omitempty"` // 字段名称，用于指定本次查询返回记录中包含的字段
Sort []*Sort `json:"sort,omitempty"`
Filter *FilterInfo `json:"filter,omitempty"`
AutomaticFields *bool `json:"automatic_fields,omitempty"`
```

[Python `search_app_table_record_request_body.py` · `class SearchAppTableRecordRequestBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_request_body.py) 逐字：`_types = {"view_id": str, "field_names": List[str], "sort": List[Sort], "filter": FilterInfo, "automatic_fields": bool}`；`__init__` 全部为 `Optional[...] = None`；`from .sort import Sort`、`from .filter_info import FilterInfo`。

**特别确认**：

- `field_names` 的 json tag 确实是 `field_names`（不是 `fieldNames` / `fields`），类型确实是字符串数组 `[]string` / `List[str]`（[Go `model.go` :10633](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10633)、[Go `model.go` :10417](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10417) `func (builder *SearchAppTableRecordReqBodyBuilder) FieldNames(fieldNames []string)`、Python `_types`）。
- `automatic_fields` 类型是 `*bool` / `bool`（布尔，不是字符串或整数）（[Go `model.go` :10639](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10639)、[Go `model.go` :10444](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10444) `func (builder *SearchAppTableRecordReqBodyBuilder) AutomaticFields(automaticFields bool)`、Python `_types`）。SDK 注释 [:10396](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10396) 逐字：「是否自动计算并返回创建时间（created_time）、修改时间（last_modified_time）、创建人（created_by）、修改人（last_modified_by）这四类字段。默认为 false，表示不返回。」
- `field_names` 语义（SDK 注释逐字，非服务端文档）：[Go `model.go` :10633](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10633) `// 字段名称，用于指定本次查询返回记录中包含的字段`。
- 请求体内**没有** `page_token` / `page_size`：它们在 [Python `search_app_table_record_request.py` · `class SearchAppTableRecordRequestBuilder`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_request.py) 中作为查询参数（query）声明，在 [Go `model.go` · `type SearchAppTableRecordReqBuilder` :10601 / :10609](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10601) 中由 `PageToken` / `PageSize` 写 `QueryParams.Set`，不是 body 键。
- 嵌套结构（只坐实键名，不展开）：[Go `model.go` · `type Sort struct` :6187](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L6187) = `` {FieldName *string `json:"field_name,omitempty"`, Desc *bool `json:"desc,omitempty"`} ``；[Go `model.go` · `type FilterInfo struct` :4846](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L4846) = `` {Conjunction *string `json:"conjunction,omitempty"`, Conditions []*Condition `json:"conditions,omitempty"`, Children []*ChildrenFilter `json:"children,omitempty"`} ``。更深层 `Condition` / `ChildrenFilter` 本轮未逐字抄录 → **未验证**。
- 服务端对各字段的必填性/校验规则 → **未验证**（官方 SPA 文档页正文取不到；SDK 只声明模型与注释，不声明服务端校验）。

---

## 3. 最小请求体能否是空 `{}`：未验证

**结论：未验证，不能断言空 body 可接受。**

一手依据只到「SDK 允许省略 body」，不到「服务端接受空 body」：

- [Python `search_app_table_record_request.py` · `class SearchAppTableRecordRequest`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_request.py)：`request_body: Optional[SearchAppTableRecordRequestBody] = None`（body 可为 None）；builder 的 `request_body()` 仅在调用时把值赋给 `self._search_app_table_record_request.body`。
- [Python `lark_oapi/api/bitable/v1/resource/app_table_record.py` · `def search` :426–442](https://github.com/larksuite/oapi-sdk-python/blob/v2_main/lark_oapi/api/bitable/v1/resource/app_table_record.py#L426-L442)：`:438 if request.body is not None:`、`:439 option.headers[CONTENT_TYPE] = f"{APPLICATION_JSON}; charset=utf-8"` → body 为 None 时 SDK 连 Content-Type 都不加，说明可构造无 body 请求。
- [Go `model.go` · `type SearchAppTableRecordReq struct` :10642–10647](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10642-L10647)：`` Body *SearchAppTableRecordReqBody `body:""` `` 是指针，可为 nil；[Go `model.go` · `SearchAppTableRecordReqBuilder.Build()` :10620–10626](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10620-L10626) 里 `req.apiReq.Body = builder.body`，不强制非 nil。
- 反方向的一手事实：[Go SDK sample `sample/apiall/bitablev1/search_appTableRecord.go`](https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/search_appTableRecord.go) 的示例总是显式调用 `.Body(...)` 并填入 5 个字段 —— SDK 示例没有演示省略 body。

**没有任何一手依据说明服务端接受空 `{}` 或省略 body**：三个官方页（[飞书 server-docs 查询记录](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/search?lang=zh-CN)、[飞书 uAjLw4CM 查询记录](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/search)、[Lark 查询记录](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/search)）经 `web_fetch` 均只回 HTTP 200 与 `<title>`，正文取不到；SDK 源码里没有「body 可为空 / 可省略」的服务端语义声明。故沿用背景笔记判读：**未验证，不能断言空 body 可接受**（[`docs/research/feishu-bitable-create-request-bodies.md:183–196`](F:/ai_work/docs/research/feishu-bitable-create-request-bodies.md#L183-L196)）。

**字段最少、最可能成功且只用已坐实键名的请求体**：

```json
{"field_names":["工时","时薪"]}
```

理由：`field_names` 是唯一同时被 Go/Python struct 逐字坐实、类型为字符串数组、且 SDK 注释明确说明「用于指定本次查询返回记录中包含的字段」的键；只带它可让回包 `items[].fields` 聚焦到 Step 3 建的两个 `type:2` 数字字段。该 body 的**服务端接受度仍属未验证**（同上），只是把未验证面缩到最小。

---

## 4. 回包结构（一手坐实）

**顶层**：

- [Go `core/apiresp.go` · `type CodeError struct` :71–73](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/core/apiresp.go#L71-L73)：`` Code int `json:"code"` ``、`` Msg string `json:"msg"` `` → 顶层键 `code` / `msg`。
- [Go `model.go` · `type SearchAppTableRecordResp struct` :10659–10667](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10659-L10667)：含 `` Data *SearchAppTableRecordRespData `json:"data"` // 业务数据 ``（:10662）；`func (resp *SearchAppTableRecordResp) Success() bool { return resp.Code == 0 }`（:10665–10667）→ 成功判据 `code == 0` 一手坐实。
- [Python `model/search_app_table_record_response.py` · `class SearchAppTableRecordResponse`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_response.py)：`_types = {"data": SearchAppTableRecordResponseBody}`。

**`data` 下 4 个字段**，逐字 [Go `model.go` · `type SearchAppTableRecordRespData struct` :10649–10657](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10649-L10657)：

```
:10650 Items     []*AppTableRecord `json:"items,omitempty"`      // 数组类型。record 结果。
:10652 HasMore   *bool             `json:"has_more,omitempty"`   // 是否有下一页数据
:10654 PageToken *string           `json:"page_token,omitempty"` // 下一页分页的token
:10656 Total     *int              `json:"total,omitempty"`      // 记录总数
```

[Python `model/search_app_table_record_response_body.py` · `class SearchAppTableRecordResponseBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_response_body.py) 逐字：`_types = {"items": List[AppTableRecord], "has_more": bool, "page_token": str, "total": int}`。→ 键名 `items`（记录数组）、`has_more`（bool）、`page_token`（string）、`total`（int）全部一手坐实。

**`items` 每条记录的结构**，逐字 [Go `model.go` · `type AppTableRecord struct` :2983–2999](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L2983-L2999)：

```
:2984 Fields           map[string]interface{} `json:"fields,omitempty"`            // 记录字段
:2986 RecordId         *string                `json:"record_id,omitempty"`         // 记录Id
:2988 CreatedBy        *Person                `json:"created_by,omitempty"`
:2990 CreatedTime      *int64                 `json:"created_time,omitempty"`
:2992 LastModifiedBy   *Person                `json:"last_modified_by,omitempty"`
:2994 LastModifiedTime *int64                 `json:"last_modified_time,omitempty"`
:2996 SharedUrl        *string                `json:"shared_url,omitempty"`
:2998 RecordUrl        *string                `json:"record_url,omitempty"`
```

[Python `model/app_table_record.py` · `class AppTableRecord`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/app_table_record.py) 逐字：`_types = {"fields": Dict[str, Any], "record_id": str, "created_by": Person, "created_time": int, "last_modified_by": Person, "last_modified_time": int, "shared_url": str, "record_url": str}`。→ `fields` 是「字段名 → 值」的映射（`map[string]interface{}` / `Dict[str, Any]`），`record_id` 是字符串；其余 6 个为自动/分享/URL 字段，四类自动字段默认不返回（[Go `model.go` :10396](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10396)）。

**分页机制（500 行上限有一手依据）**：

- [Go `resource.go` · `func (a *appTableRecord) Search` 注释 :1239](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1239)：逐字「该接口用于查询数据表中的现有记录，单次最多查询 500 行记录，支持分页获取。」
- [Go `model.go` · `SearchAppTableRecordReqBuilder` 注释 :10606](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10606)：逐字「分页大小。最大值为 500」；[:10614](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10614) 重复「单次最多查询 500 行记录，支持分页获取。」
- [Go `resource.go` · `List` 注释 :1203](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1203)：逐字「该接口用于列出数据表中的现有记录，单次最多列出 500 行记录，支持分页获取。」（对已不推荐使用的 List 同样适用）
- 分页参数 `page_token` / `page_size` 是**查询参数**：[Python `search_app_table_record_request.py` · `class SearchAppTableRecordRequestBuilder`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_request.py) 把 `user_id_type` / `page_token` / `page_size` 声明为 query；[Go `model.go` :10601 / :10609](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10601) `PageToken` / `PageSize` 走 `QueryParams.Set`。流程：首次不带 `page_token`；若回包 `has_more == true`，取 `data.page_token` 作为下次请求的 `?page_token=...`（可带 `page_size`，最大 500）。`page_size` 缺省值 → **未验证**（SDK 无默认值声明，文档页正文取不到）。

**顺带补齐背景笔记的未验证项**：[`docs/research/feishu-bitable-create-request-bodies.md:183–196`](F:/ai_work/docs/research/feishu-bitable-create-request-bodies.md#L183-L196) 标「`List` 读回接口回包字段」未验证；本轮已逐字抄录 [Python `model/list_app_table_record_response_body.py` · `class ListAppTableRecordResponseBody`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/list_app_table_record_response_body.py)：`_types = {"has_more": bool, "page_token": str, "total": int, "items": List[AppTableRecord]}`；[Go `model.go` · `type ListAppTableRecordRespData struct` :10363–10370](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10363-L10370) 同为 `has_more` / `page_token` / `total` / `items`。→ 该项前半（回包字段）现可坐实；后半（最小读回请求体的服务端接受度）仍 **未验证**。

---

## 5. 更简单的官方「读回」方式（简要，不展开）

**断言**：另有单记录 `GET /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/:record_id`（SDK 原样路径，占位符同上）。

依据：[Go `resource.go` · `func (a *appTableRecord) Get` :1182–1186](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1182-L1186) 逐字 `apiReq.ApiPath = "/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/:record_id"`、`apiReq.HttpMethod = http.MethodGet`；[Python `model/get_app_table_record_request.py` · `class GetAppTableRecordRequestBuilder`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/get_app_table_record_request.py) `http_method = HttpMethod.GET`、同 `uri`，查询参数 `text_field_as_array` / `user_id_type` / `display_formula_ref` / `with_shared_url` / `automatic_fields`，paths 为 `app_token` / `table_id` / `record_id`。回包为 `data.record`（[Go `model.go` :10218–10219](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10218-L10219)：`` Record *AppTableRecord `json:"record,omitempty"` // 记录 ``）。

但 [Go `resource.go` :1177](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1177) 逐字标「该接口为历史版本接口，已不推荐使用」；且 Step 4 拿到的是两个 `record_id`，需两次调用。另有 `POST .../records/batch_get`（[Go `resource.go` :1073–1074](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1073-L1074)）可按 `record_id` 批量取（注释「最多支持查询 100 条记录」）。**任务已说明第一步够即可，故不展开**；Step 5 仍用 `records/search` 一次读回两行。

---

## 6. 控制台 / API Explorer 页面标签：未验证

- 控制台、API Explorer 的**按钮/菜单标签一律「未验证、以页面实际标签为准」**：<https://open.feishu.cn/api-explorer>、<https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/search?lang=zh-CN>、<https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/search>、<https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/search> 经 `web_fetch` 均只回 HTTP 200 与 `<title>`（分别为「开发文档 - 飞书开放平台」「查询记录 - 服务端 API - 飞书开放平台」「开发文档 - Lark开放平台」），正文取不到。
- `records/search` 的 api-explorer 深链**不是编造**：[Go `resource.go` :1243](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1243) 逐字给出 `https://open.feishu.cn/api-explorer?from=op_doc_tab&apiName=search&project=bitable&resource=app.table.record&version=v1`（SDK 注释「官网API文档链接」）。但该 URL 的**页面渲染结果、标签、是否需要登录**均 **未验证、以页面实际标签为准**；保守用法只给通用入口 <https://open.feishu.cn/api-explorer>（该入口亦见 [`docs/research/feishu-tenant-token-ip-whitelist.md:108`](F:/ai_work/docs/research/feishu-tenant-token-ip-whitelist.md#L108)）。不新造任何深链参数。

---

## 未验证汇总

| # | 事项 | 状态与原因 |
| --- | --- | --- |
| 1 | 服务端是否接受空 `{}` body / 省略 body | **未验证**。官方 SPA 文档页正文取不到；SDK 只证明可构造无 body 请求（`request_body: Optional[...] = None`、`if request.body is not None`、Go `Body *SearchAppTableRecordReqBody` 指针），未声明服务端语义。见 §3。 |
| 2 | §2 五个字段的服务端必填性/校验规则、`field_names` 指定字段后 `record_id` 是否仍返回 | **未验证**。同上，文档页正文取不到；SDK 只有模型与注释。 |
| 3 | `page_size` 缺省值、`page_token` 有效期与失效行为 | **未验证**。SDK 无默认值/有效期声明；文档页正文取不到。500 为「最大值」有一手 SDK 注释依据（§4）。 |
| 4 | `items[].fields` 内数字字段值的 JSON 类型（number 还是 string） | **未验证**。SDK 只声明 `map[string]interface{}` / `Dict[str, Any]`；成功判据按数值 8/100、10/80 写，实际比对按值等价即可。 |
| 5 | 控制台 / API Explorer 按钮标签、深链页面渲染 | **未验证、以页面实际标签为准**（SPA 正文取不到）。深链字符串本身有 SDK 注释一手依据（§6）。 |
| 6 | 背景笔记「`List` 读回接口回包字段、最小读回请求体的服务端接受度」 | **前半已坐实**（§4 末补抄 `list_app_table_record_response_body.py` 与 Go `ListAppTableRecordRespData`）；**后半仍「未验证」**（同 #1）。 |
| 7 | 官方页正文对 `records/search` 请求/回包字段的正式表述 | **未验证**（SPA 正文取不到）。本文所有字段断言的一手依据均为 Go/Python SDK 源码，非文档页。 |

---

## 对决策的影响

1. **方法/路径/请求头已可落 curl**：`POST .../records/search`、`Authorization: Bearer $FEISHU_TENANT_ACCESS_TOKEN`、`Content-Type: application/json; charset=utf-8` 三条都有一手依据（[Go `resource.go` :1246–1251](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1246-L1251)、[Python `resource/app_table_record.py` :439](https://github.com/larksuite/oapi-sdk-python/blob/v2_main/lark_oapi/api/bitable/v1/resource/app_table_record.py#L439)、[`feishu-bitable-create-request-bodies.md:11`](F:/ai_work/docs/research/feishu-bitable-create-request-bodies.md#L11)）→ `SMOKE-RUNBOOK.md` Step 5 的散文可换成可复制的 curl 骨架。
2. **回包字段名与 `code == 0` 已可写进判据**：`data.items` / `data.has_more` / `data.page_token` / `data.total` 及 `items[].fields` / `items[].record_id` 全部逐字坐实（[Go `model.go` :10649–10657](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10649-L10657)、[Go `model.go` :2983–2999](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L2983-L2999) 与对应 Python model）→ Step 5 的成功判据（2 行、8/100 与 10/80、`code == 0`）可落成确定断言，不必再标未验证。
3. **请求体必须保留一处未验证**：空 `{}` / 省略 body 仍「未验证，不能断言可接受」；Step 5 采用只用坐实键名的最小 body `{"field_names":["工时","时薪"]}`，RUNBOOK 里保留一行「该 body 的服务端接受度未验证，首次执行若报错再试其它已坐实字段组合」，不得写成 `{}` 万无一失。
4. **「已废弃」措辞需修正**：背景笔记 §5 的「`GET .../records` 已废弃」应改为「官方 Go SDK 注释标为『历史接口，已不推荐使用』并建议用查询记录替代」（一手 [Go `resource.go` :1205](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1205)）；「已废弃」无 SDK 字面依据。分页 500 行上限有一手 SDK 注释（[Go `resource.go` :1239](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1239)、[Go `model.go` :10606](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10606)）可写进 RUNBOOK。
5. **页面操作仍需人眼核对**：控制台 / API Explorer 按钮标签与深链渲染一律「未验证、以页面实际标签为准」，只给通用入口；不改向导里任何页面标签文案，也不新增深链参数。

---

## 可直接复制的 Step 5 最小 curl

```bash
curl -sS -X POST \
  "https://open.feishu.cn/open-apis/bitable/v1/apps/<APP_TOKEN>/tables/<TABLE_ID>/records/search" \
  -H "Authorization: Bearer $FEISHU_TENANT_ACCESS_TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"field_names":["工时","时薪"]}'
```

- `<APP_TOKEN>` / `<TABLE_ID>` 取 Step 2 回包 `data.app.app_token` / `data.app.default_table_id`；`$FEISHU_TENANT_ACCESS_TOKEN` 取 Step 1 换到的 tenant_access_token（[`docs/research/feishu-bitable-create-request-bodies.md:11`](F:/ai_work/docs/research/feishu-bitable-create-request-bodies.md#L11)）。
- 一手依据：[方法/路径](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1249-L1250) `Go resource.go:1249–1250`；[请求头](https://github.com/larksuite/oapi-sdk-python/blob/v2_main/lark_oapi/api/bitable/v1/resource/app_table_record.py#L439) `Python resource/app_table_record.py:439` + [Go `resource.go` :1251](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go#L1251)；[body 键 `field_names` 与类型](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10633) `Go model.go:10633` + [Python `search_app_table_record_request_body.py`](https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/search_app_table_record_request_body.py)。
- 注意：`field_names` 是唯一字段，**不是**空 `{}`；空 body 的服务端接受度 **未验证**（§3）。

**成功判据**（`code == 0` 一手：[Go `model.go` :10665–10667](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10665-L10667) `func (resp *SearchAppTableRecordResp) Success() bool { return resp.Code == 0 }`）：

1. 顶层 `"code": 0`（`"msg"` 键见 [Go `core/apiresp.go` :71–73](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/core/apiresp.go#L71-L73)）。
2. `data.items` 为数组且长度 **2**，读回 Step 4 写入的两行（按 `record_id` 对应）。
3. 两行 `fields` 中「工时」/「时薪」的值分别为 **8 / 100** 与 **10 / 80**（顺序不保证）。
4. 分页辅助（非本次硬判据）：`data.has_more` / `data.page_token` / `data.total` 为 SDK 声明的键（带 `omitempty`，服务端是否一定返回 **未验证**）；若 `has_more == true`，把 `data.page_token` 作为下次请求的 `?page_token=` 查询参数，`page_size` 最大 500（[Go `model.go` :10606](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go#L10606)）。
5. 若返回非 0 `code`：本笔记未提供任何服务端错误码的一手依据 → **未验证**，按回包 `msg` 与官方页实际内容排查，不臆测错误码含义。
