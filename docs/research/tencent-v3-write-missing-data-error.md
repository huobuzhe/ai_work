# 腾讯文档 V3 batchUpdate 写值报 `call BuildRevision error: ... code:-12, msg: missing data not found.`（外层 code:10003）根因核实（一手取证）

> **存放理由**：循 `docs/research/` 既有取证笔记习惯，一个研究问题一份文档。本目录（另有 13 份）已形成「腾讯文档云端冒烟测试」链条：`tencent-create-file-request-shape.md`（建表回包 `data.ID`）、`tencent-v3-batchupdate-body-structure.md`（写值请求体逐字结构）、`tencent-v3-write-read-verify.md`（写值↔读回 sheetId 一致性 + 「写 200 读回全 null」）。本篇专为**新增的一类错误**：V3 batchUpdate 写值时业务层报 `call BuildRevision error: type:business, code:608651, msg:build command error, code:-12, msg: missing data not found.`（外层 `code:10003`）——一手核实其根因，以及写值正确的前置条件。与前述笔记并列存放，供修复时直接引用。
>
> **取证口径**：只采腾讯文档开放平台官方一手文档 `docs.qq.com/open/document/app/openapi/v3/sheet/...`（`batchupdate/request.html`、`batchupdate/update.html`、`batchupdate/response.html`、`model/spreadsheet.html`、`get/get_sheet.html`、`get/get_range.html`）、`common/code.html`、`FAQ/how_to_debug.html`、`get_started.html`。本轮各页均 **HTTP 200 且正文全文可取**（含代码块与参数表），未出现 SPA 空壳，逐字已核。外部 `web_search` 对 `-12 / missing data not found / BuildRevision` **无任何命中**（只返回腾讯首页，与此前笔记记录的「docs.qq.com 未被搜索索引」一致），故不写任何二手结论。每条断言后跟官方 URL；查不到的写「未验证」。按约束**只写本文件**，不改任何代码 / issue / 分支 / Git / sandbox。

---

## 0. 结论速览（一句话）

**`sheetId` 取值没有「另一套 ID」——`GET .../files/{fileId}?concise=1` 回包里 `properties[].sheetId`（如 `BB08J2`）就是 `updateRangeRequest.sheetId` 的正确、唯一值，可以直接用；`concise=1` 与不带 concise 只在 `rowTotal/columnTotal/rowCount/columnCount` 这类「使用行列数/总行列数」元数据上不同，绝不影响 `sheetId`。** 而 `code:-12 / msg: missing data not found / build command error` **不在腾讯任何官方错误码表里**（官方通用业务错误码只有 `400001`–`400010`，无 `-12`，也无 `10003`）。它属于服务端 `BuildRevision` 构建层的**内部/未文档化错误**，官方无法从错误码表逐字对号入座。结合官方字段约束与实测链路，**最可能根因是「写值与读 sheet 用的不是同一张表 / sheet 实际并不存在（table 对不上）」这类前置条件不满足，被服务端在构建 revision 阶段以内部错误 `-12` 抛出**；写值请求体本身（`requests[].updateRangeRequest.{sheetId,gridData}`）在字段层面是对的，无需改键名。详见第 2、3、5 节。

> ⚠️ 一个必须点名的官方文档**自身 bug**（可能正是误解来源）：`get_sheet.html` 的「响应包体」示例把 `rowTotal`/`columnTotal` 写在了 `properties` 数组的**对象外面**——
> ```
> {"properties":[{"sheetId":"BB08J2", "title":"工作表1", "rowCount":0, "columnCount":0}, "rowTotal": 150, "columnTotal": 26]}
> ```
> 这不符合 `Properties` 模型（模型页明确 `rowTotal`/`columnTotal` 是 `Properties` 的字段）。这是官方示例笔误，**不代表响应结构真的如此**，也**不改变** `properties[].sheetId` 的取值正确性。详见 §1.3。

---

## 1. `sheetId` 的正确取值：`properties[].sheetId` 能否直接用于 `updateRangeRequest.sheetId`

### 1.1 官方逐字：`sheetId` 是什么、从哪拿

`model/spreadsheet.html`「sheetId」节逐字：

> 工作表的唯一标识，可以通过在线表格的链接来获取，如果一个在线表格的链接是 `https://docs.qq.com/sheet/ABCDEF12345abcdef?tab=BB08J2` ， 那么对应的 **sheetId** 为 `BB08J2`。

（<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid>）

`model/spreadsheet.html`「Properties」表逐字：

| 字段名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| sheetId | string | 工作表ID，工作表的唯一标识 |
| title | string | 工作表名称 |
| rowCount | integer | 表格有内容的区域边界的行数 |
| columnCount | integer | 表格的内容的区域边界的列数 |
| rowTotal | integer | 表格的总行数 |
| columnTotal | integer | 表格的总列数 |

（<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#properties>）

### 1.2 `concise=1` 与不带 concise 的唯一差别：**不影响 sheetId**

`get/get_sheet.html`「接口说明」逐字：

> 本接口用于查询工作表的基本信息：1. 所有子表的 `sheetID` 2. 所有子表标题 3. 所有子表大小（行列数） 4. 所有子表已使用的行列数 **（耗时可能较长，若不需要该数据可以通过设置路径参数 `concise=1` 快速返回其他信息）**

`get/get_sheet.html`「查询参数」表逐字：

| 参数名 | 类型 | 必选 | 描述 |
| :--- | :--- | :--- | :--- |
| concise | int | 否 | `0`: 返回完整的子表信息 <br>`1`: 返回不包含子表使用行列数的子表信息 |

（<https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html>）

**结论（逐字核对）**：
- `concise=1` 只是省掉「子表**已使用**行列数」（即 `rowCount`/`columnCount` 这类「有内容区域边界」的统计，且该统计耗时），**`sheetId` 在两种模式下都会返回**，且是同一个值。
- 官方从**未**说存在「deprecated sheetId」或「另一套写值专用 ID」。`sheetId` 在整个 V3 在线表格文档中**只有一种定义**：工作表唯一标识（链接里 `?tab=` 的值 = `properties[].sheetId`）。

### 1.3 ⚠️ `get_sheet.html` 响应示例的笔误（澄清误解）

`get/get_sheet.html`「响应包体」官方示例逐字（**原文如此，含笔误**）：

```
HTTP/1.1 200 OK
Date: Thu, 28 Jul 2022 15:34:46 GMT
Content-Type: text/plain; charset=utf-8
Content-Length: 3
Connection: keep-alive
 
{"properties":[{"sheetId":"BB08J2", "title":"工作表1", "rowCount":0, "columnCount":0}, "rowTotal": 150, "columnTotal": 26]}
```

（<https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html#响应包体>）

- 逐字看：`properties` 是数组，数组里第一个元素是**对象** `{"sheetId":"BB08J2", "title":"工作表1", "rowCount":0, "columnCount":0}`；随后 `}, "rowTotal": 150, "columnTotal": 26]` —— **`rowTotal`/`columnTotal` 落在了对象外面、贴着数组闭合括号**。这在 JSON 语法上都是**非法**的（数组元素之间不能直接出现 `"key": value`）。
- 对照 `model/spreadsheet.html` 的 `Properties` 表（§1.1）：`rowTotal`/`columnTotal` 本应是 `Properties` 对象内的字段；`batchupdate/update.html` 的 `addSheetResponse.properties` 示例也把它们放在对象内：`{"properties":{"sheetId":"neRpt4", "title":"测试添加子表", "rowCount":0, "columnCount":0, "rowTotal":10, "columnTotal":10}}`（<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html#响应包体>）。
- **判定**：`get_sheet.html` 该行是**官方示例笔误（JSON 残缺）**，不是真实响应结构。真实响应里 `properties` 应是 `array(Properties)`，每个元素含 `sheetId/title/rowCount/columnCount/rowTotal/columnTotal` 全套（参考 `batchupdate/update.html` 的 properties 示例形态）。
- **对我们的意义**：`properties[0].sheetId`（`BB08J2`）这条取值路径**在任何示例里都成立**；示例的括号笔误只干扰「`rowTotal` 在哪一层」的判读，**不构成「sheetId 另有来源」的任何依据**。

### 1.4 小结（对问题 1）

| 疑问 | 一手核实结论 |
| :--- | :--- |
| `properties[].sheetId`（`BB08J2`）能否直接作 `updateRangeRequest.sheetId`？ | **能。** `sheetId` 只有一种定义，`concise=1` 也返回它（§1.2）。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid>） |
| 是否 deprecated / 另有写值专用 id？ | **否。** 全站无「另一套 ID」的任何逐字说明，属**未验证不存在**。 |
| 不带 concise 才有正确 id？ | **否。** concise 只影响「已用行列数」，不影响 sheetId（§1.2）。 |

---

## 2. `missing data not found` / `code:-12` / `build command error` 在官方错误码里的对应

### 2.1 官方错误码表**没有** `-12`、`608651`、`10003`、`missing data not found`

`common/code.html`「通用错误码」表逐字（完整 10 条）：

| HTTP 状态码 | 业务错误码 | 描述 | 排查建议 |
| :--- | :--- | :--- | :--- |
| 400 | 400001 | 请求参数错误 | 确认传入的参数是否合法 |
| 504 | 400002 | 服务端请求超时 | 服务端错误，请联系开发者 |
| 404 | 400003 | 访问的资源不存在 | 确认请求的资源是否被删除 |
| 409 | 400004 | 创建的资源已存在 | 确认传入的资源是否已经存在 |
| 403 | 400005 | 不允许访问该资源 | 确认是否拥有合法权限 |
| 401 | 400006 | 资源操作未授权 | 确认鉴权三元组是否合法有效 |
| 429 | 400007 | 请求数超过限制 | 请求数超过限频，请降低调用频率 |
| 400 | 400008 | 访问了超过范围的资源 | 确认操作的范围是否越界 |
| 503 | 400009 | 服务处于不可用状态 | 服务端错误，请联系开发者 |
| 500 | 400010 | 服务内部错误 | 服务端错误，请联系开发者 |

（<https://docs.qq.com/open/document/app/openapi/v3/common/code.html#通用错误码>）

- 逐字核对：**业务错误码只有 `400001`–`400010`；无 `-12`、无 `608651`、无 `10003`。** `missing data not found` / `build command error` / `BuildRevision` 这些字符串在 `common/code.html`、`batchupdate/update.html#错误码`、`get/get_sheet.html#错误码`、`get/get_range.html#错误码` 中**均未出现**。
- 各接口「错误码」小节也都只列 `400001/400006/400007/400010` 四类（例：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html#错误码>）。

### 2.2 最接近的、可对号入座的「官方语义」

虽然 `-12` 本身无官方定义，但官方错误码表里有两条语义与我们链路的候选根因**直接对应**（供推断，非逐字等同）：

| 官方错误码 | 描述 | 与本错误的关系 |
| :--- | :--- | :--- |
| `400003`（HTTP 404） | 访问的资源不存在：确认请求的资源是否被删除 | 若 `sheetId` 指向**不存在**的工作表 → 语义吻合「missing data not found」 |
| `400008`（HTTP 400） | 访问了超过范围的资源：确认操作的范围是否越界 | 若写入区域**超出**表当前行列范围 → 「越界」语义 |

（<https://docs.qq.com/open/document/app/openapi/v3/common/code.html#通用错误码>）

- **判定（证据等级分层）**：
  - **已验证**：`-12`/`missing data not found`/`build command error`/`608651`/`10003` **均不是官方文档化业务错误码**（§2.1）。
  - **已验证**：官方把「资源不存在」定义为 `400003`、「越界」定义为 `400008`（上表）。
  - **合理推断（非一手）**：`-12 missing data not found` / `build command error` 是服务端 **`BuildRevision` 构建层**在「拿不到目标表/目标数据」时抛出的**内部兜底错误**，其语义与「**目标 sheet 不存在**」或「**找不到要挂的底层数据（table/revision）**」最贴。它**不是**标准业务码，所以不能逐字断言「= 目标 sheet 不存在」，只能说「语义上最像资源/数据不存在」。**无法从官方错误码表逐字对号**——此项标为推断。
  - **不能直接确认**：`-12` 是否精确等于「写入区域越界」。越界在官方有独立码 `400008`，若真是越界通常应先报 `400008` 而非走到 `-12 BuildRevision`。故「越界」是**次一级**嫌疑。

### 2.3 官方给的排查手段（可执行）

`FAQ/how_to_debug.html`「如何排查问题/反馈问题」逐字要点：

> 建议开发者在自己的程序或脚本中打印完整的 `Request` 和 `Response` 信息…… 当接口返回 `Server-Side Error` 类型的报错时，可以到反馈平台反馈问题……【请求内容】url / request header / request body；【错误信息】traceID / response body。`traceID`：请求的流水号。通过回包 header 的 `X-Trace-Id` 字段返回给调用者。

（<https://docs.qq.com/open/document/app/FAQ/how_to_debug.html>）

- **可执行动作**：`-12 BuildRevision` 属服务端内部错，官方唯一的官方处置是**带 `X-Trace-Id` + 完整 Request/Response 去 [反馈平台](https://docs.qq.com/open/#/feedback) 提工单**。这条是官方逐字支持的路径。
- 注意：FAQ 举的排查示例用的是 V2 的 `ret`/`msg`（`{'ret':10002, msg:'Input parameter verification failed'}`），与 V3 的 `code`/`message` 外壳不同——这属官方 FAQ 未随 V3 更新，**不影响**「打印完整 Request/Response + traceID」的排查原则。

---

## 3. 新建 sheet（type=sheet 建出来的默认表）是否已有可写 sheet？其 sheetId 与 rowTotal/columnTotal=200/26

### 3.1 新建表默认是否自带一张可写工作表 —— **官方无逐字声明（未验证）**

- 通读 `overview.html`、`model/spreadsheet.html`、`get_started.html`、`batchupdate/update.html`：**没有任何一句逐字说明「新建 type=sheet 的在线表格默认包含几张工作表、默认 sheetId 是什么」**。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html> 、<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html> 、<https://docs.qq.com/open/document/app/get_started.html>）
- **未验证**：默认表是否存在、默认 sheetId 取值 —— 官方无一手依据，**不得猜**。**唯一可靠来源**：建表后 `GET .../files/{fileId}?concise=1`，从回包 `properties[].sheetId` 逐条读取（§1）。
- 可以确定的是：**一个在线表格由多个工作表组成，工作表是子表（tab）**（`overview.html`「名词解释」逐字：「在线表格由多个工作表（子表）组成……一个工作表对应在线表格的一个tab」）。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html#名词解释>）

### 3.2 `rowTotal/columnTotal = 200/26` 是否意味着能直接写 A1:B2（不越界）—— **是（在行/列维度上）**

- `Properties` 字段逐字：`rowTotal` = 表格的总行数、`columnTotal` = 表格的总列数；`rowCount` = 有内容区域边界的行数、`columnCount` = 有内容区域边界的列数。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#properties>）
- `updateRangeRequest` 范围限制逐字：范围行数 `<=1000`、范围列数 `<=200`、范围内总单元格 `<=10000`。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html#updaterangerequest>）
- **结论**：`rowTotal=200, columnTotal=26` 表示该表**总容量**是 200 行 × 26 列；写 `A1:B2`（`startRow=0,startColumn=0`，2 行 2 列）**远小于** 200×26，也满足 `<=1000 行 / <=200 列 / <=10000 格` 的接口限制，**在行列维度上不越界**。
- **但要注意区分两个「行列数」**：
  - `rowTotal/columnTotal`（总行/列）——决定「表能不能容纳」到你写的坐标。
  - `rowCount/columnCount`（有内容区域边界）——只描述「已用区域」，**不是**写值上限。
  - 写 `startRow=0,startColumn=0` 落在总行列范围内 → 不越界。**`rowTotal=200≥2`、`columnTotal=26≥2`，A1:B2 安全。**
- **未验证的边界**：`rowTotal/columnTotal` 是否随 `concise=1` 一起返回 —— `get_sheet.html` 示例疑似有笔误（§1.3），无法逐字确认 `concise=1` 时 `rowTotal/columnTotal` 是否在 `properties[].` 内。但无论哪种模式，`sheetId` 一定在（§1.2），写 A1:B2 所需的只是 sheetId + 一个≥2×2 的表，实测已拿到 200×26，容量没问题。

---

## 4. `updateRangeRequest` 是否有「必填但漏掉」的字段

### 4.1 官方字段表：`updateRangeRequest` **只有** `sheetId` + `gridData` 两个字段

`batchupdate/request.html#updaterangerequest` 参数表逐字：

| 参数名称 | 数据类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| sheetId | string | 是 | 工作表唯一标识 |
| gridData | object(GridData) | 是 | 写入指定区域的数据 |

（<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html#updaterangerequest>）

> 「目前单元格支持的数据类型（CellValue）只包括：`text`、`link`、`number`」

- **结论（逐字）**：`updateRangeRequest` 必填字段**只有两个**：`sheetId`、`gridData`。**没有**独立的 `range`（A1 字符串）字段、**没有** `tabId` 字段、**没有**别的必填项。`startRow`/`startColumn` 在 `gridData` 内部（见 4.2），不在 updateRangeRequest 层。

### 4.2 `gridData` 结构（逐字）：只要 `startRow/startColumn/rows`，**无需** `rowTotal/columnTotal`

`model/spreadsheet.html` 逐字三层：

- **GridData**：`startRow | integer | 起始行编号（从0开始计算）`、`startColumn | integer | 起始列编号（从0开始计算）`、`rows | array(RowData) | 各行的数据`。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata>）
- **RowData**：`values | array(CellData) | 各个单元格的数据内容`。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#rowdata>）
- **CellData**：`cellValue | object(CellValue)`、`cellFormat | object(CellFormat)`、`dataType | string`。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#celldata>）
- **CellValue**：`text | string`、`number | float`、`link | object(Link)`、`time`、`location`、`select`（每个 cellValue 只用其中一个）。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue>）

- **结论**：`gridData` 里**没有** `rowTotal`/`columnTotal` 字段；写值**不需要**在 `gridData` 里填总行总列。`gridData` = `{startRow, startColumn, rows}`，`rows[].values[].cellValue`。请求者的 body 形状（`{"cellValue":{"text":"姓名"}}` 等）在字段层面是**正确**的；`{"cellValue":{"number":8}}` 用 `number` 也合法。

### 4.3 我们对 body 的逐字核对（对照官方 request.html 示例）

官方 `UpdateRangeRequest` 示例逐字（`sheetId:"BB08J2"`、`startRow:1`、`startColumn:6`、`rows[].values[].cellValue.text/link`）：
（<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html#updaterangerequest>）

我们实际发的 body（`startRow:0,startColumn:0`，A1:B2，`text` + `number`）：

```json
{"requests":[{"updateRangeRequest":{"sheetId":"BB08J2","gridData":{"startRow":0,"startColumn":0,"rows":[{"values":[{"cellValue":{"text":"姓名"}},{"cellValue":{"text":"工时"}}]},{"values":[{"cellValue":{"text":"张三"}},{"cellValue":{"number":8}}]}]}}}]}
```

- **逐字比对**：外层 `{"requests":[{"updateRangeRequest":{...}}]}` ✔（官方 Request 四选一 key，<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html#request>）；`sheetId` + `gridData` 两字段 ✔；`gridData.startRow/startColumn` 0 基 ✔；`gridData.rows[].values[].cellValue.text/number` ✔。
- **结论**：**没有漏掉任何必填字段。** 写值请求体结构合法。所以 `-12 BuildRevision` **不是「漏了 range/tabId/rowTotal」导致的**——这些字段在官方模型里根本不存在或非必填。

---

## 5. 从建表到写值的「最小可跑」示例（含真实 sheetId 来源）

官方**没有**一篇把「建表→查 sheet→写值→读回」串起来的完整 runnable 示例（`get_started.html` 只演示到「建一篇 doc」为止，且是 `type=doc` 不是 `type=sheet`：<https://docs.qq.com/open/document/app/get_started.html>）。但官方各页已把每一步的**逐字请求形状**给全，按官方字段拼出的最小可跑序列如下（**每一步都标官方来源；sheetId 必须来自 Step 2 回包，不得硬编码**）：

**Step 1 — 建表（type=sheet）**（来源：`get_started.html` 建 doc 的请求形状 + 回包 `data.ID`）
```
POST https://docs.qq.com/openapi/drive/v2/files
Content-Type: application/x-www-form-urlencoded
  title=<你的表名>&type=sheet
→ 回包: {"ret":0,"msg":"Succeed","data":{"ID":"300000000$xxxxxx", ...}}
```
（<https://docs.qq.com/open/document/app/get_started.html#_5-调用-openapi-创建一篇在线文档>，`data.ID` 即 fileId）

**Step 2 — 查 sheet，拿真实 sheetId**（来源：`get_sheet.html` 逐字）
```
GET https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}?concise=1
→ 回包 properties[] 里取 properties[0].sheetId  （形如 BB08J2）
```
（<https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html#请求包体>）

**Step 3 — 写值 batchUpdate（用 Step 2 拿到的 sheetId）**（来源：`request.html` 逐字字段 + `update.html` 路径）
```
POST https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}/batchUpdate
Content-Type: application/json
{"requests":[{"updateRangeRequest":{"sheetId":"<Step2 的 sheetId>","gridData":{"startRow":0,"startColumn":0,"rows":[{"values":[{"cellValue":{"text":"姓名"}},{"cellValue":{"text":"工时"}}]},{"values":[{"cellValue":{"text":"张三"}},{"cellValue":{"number":8}}]}]}}}]}
→ 期望回包: {"responses":[{"updateRangeResponse":{"updatedCells":4}}]}  （updatedCells>0 才算真写进）
```
（<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html#updaterangerequest> 、<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html#请求格式> 、`UpdateRangeResponse.updatedCells`：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html>）

**Step 4 — 读回校验**（来源：`get_range.html` 逐字，sheetId 在路径）
```
GET https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}/{sheetId}/A1:B2
```
（<https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html#请求示例>）

> **关键约束（贯穿全程）**：Step 3 写入的 `sheetId` 与 Step 4 读回的 `sheetId`（路径段）**必须同为 Step 2 逐字返回的那一个真实值**。这是此前笔记 [tencent-v3-write-read-verify.md](<F:/ai_work/docs/research/tencent-v3-write-read-verify.md>) 反复强调的「写与读同一张表」原则，也是本错误首要排查点。

---

## 6. 根因推断（把 §1–§5 代入）

把「`sheetId` 取值无另套 ID（§1）」「`-12` 非官方业务码、是 BuildRevision 内部兜底（§2）」「body 字段无漏项（§4）」这三条一手事实代入，`code:-12 missing data not found / build command error` 的候选根因按嫌疑排序：

- **(A) 目标 sheet 不存在 / 写与读不是同一张表** —— **首位嫌疑**。若 Step 3 用的 `sheetId` 是硬编码/猜测/旧值，而真实表是新 sheet（或该 fileId 下根本没有这个 sheet），服务端 `BuildRevision` 去「找目标表/底层数据」时找不准 → 抛 `-12 missing data not found`（字面「找不到数据」）。**依据**：`sheetId` 唯一来源是 Step 2 回包（§1.2），官方明令「工作表唯一标识」（§1.1）；官方向「资源不存在」对应 `400003`（§2.2 语义贴近）。这是本错误最典型的官方可解释路径，但**具体是否如此=推断，因实测未记录 Step 2 回包与 Step 3 实际 sheetId 是否逐字一致**。
- **(B) fileId 不是 online 表格 / 类型不对** —— 次位。若用 doc/其他类型（建表时 `type` 没传 `sheet`）的 ID 当表格 fileId，`batchUpdate` 找不到 sheet 数据 → 可能走到 `BuildRevision` 内部错。需核 Step 1 是否 `type=sheet`。
- **(C) 写入区域越界** —— 较低。越界在官方有独立码 `400008`（§2.2），正常应先报 `400008` 而非 `-12`；且实测 A1:B2 在 200×26 内（§3.2），通常不越界。除非 `rowTotal/columnTotal` 读错（§1.3 笔误陷阱）导致误判。
- **(D) body 字段/键名错误** —— **已排除**（§4.3）。`requests[].updateRangeRequest.{sheetId,gridData}` + `gridData.rows[].values[].cellValue` 与官方逐字一致，无漏字段、无错键名。此逻辑同 [tencent-v3-batchupdate-body-structure.md](<F:/ai_work/docs/research/tencent-v3-batchupdate-body-structure.md>)。
- **(E) 服务端内部故障** —— 不能排除。`-12` 无官方定义，也可能是纯服务端 BuildRevision 故障；此时唯一官方处置是带 `X-Trace-Id` 提工单（§2.3）。

**一句话**：最可能是 **(A) 写值用的 sheetId 不是这张表真实的、活的 sheet**（或 fileId 不是 sheet 类型），导致服务端 `BuildRevision` 在「找目标表/底层数据」时 `missing data not found`；写值 body 结构本身没错。修的时候先打印 Step 2 回包逐字核对 sheetId、加 Step 3 完整回包（看 `updatedCells` 与 `X-Trace-Id`），再决定是否提工单。

---

## 对修复的影响

1. **先打印 Step 2 的 `GET .../files/{fileId}?concise=1` 完整回包，把 `properties[].sheetId` 逐字抄出来**，确认它不是硬编码/旧值/猜测值；写值（Step 3 `sheetId`）与读回（Step 4 路径 `{sheetId}`）**都锚定这一条真实值**。`properties[].sheetId` 就是正确值，没有「另一套 ID」（§1）。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html> 、<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid>）

2. **不要相信 `get_sheet.html` 示例里 `rowTotal` 排在 properties 对象外的写法**——那是官方示例 JSON 笔误（§1.3）。真实 `properties` 是 `array(Properties)`，每项含 `sheetId/title/rowCount/columnCount/rowTotal/columnTotal`。解析时按对象内取字段，别被笔误带偏把 sheetId 取错。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html#响应包体> 、<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html#响应包体>）

3. **写值 body 不用改**：`updateRangeRequest` 只有 `sheetId`+`gridData` 两个必填字段，没有 `range`/`tabId`/`rowTotal` 之类（§4）。`-12` 不是「漏字段」引起的。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html#updaterangerequest>）

4. **打印 Step 3 写值完整回包（含 `responses` 与 HTTP header 的 `X-Trace-Id`）**：成功时` responses[].updateRangeResponse.updatedCells` 应 >0；若 `-12` 复现，凭 `X-Trace-Id` + 完整 Request/Response 去[反馈平台](https://docs.qq.com/open/#/feedback)提工单——这是 `-12` 这类**未文档化服务端内部错**的官方唯一处置路径（§2.3）。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html> 、<https://docs.qq.com/open/document/app/FAQ/how_to_debug.html>）

5. **核对 Step 1 建的是不是 `type=sheet`**：若 fileId 来自 `type=doc` 等非表格类型，`batchUpdate` 找不到表数据也会走到 BuildRevision 内部错。建表务必 `type=sheet`（§5 Step 1）。（<https://docs.qq.com/open/document/app/get_started.html>）

---

## 结论：sheetId 正确取法 / 写值最小可跑示例

**sheetId 正确取法（唯一）：**
`POST /openapi/drive/v2/files`（`type=sheet`）建表 → 回包 `data.ID` 作 fileId → `GET /openapi/spreadsheet/v3/files/{fileId}?concise=1` → 取回包 **`properties[].sheetId`**（形如 `BB08J2`，即官方链接 `?tab=BB08J2` 的那个值）。**这个值可直接作 `updateRangeRequest.sheetId`**；没有 deprecated、没有「另一套写值 ID」，`concise=1` 与不带 concise 只差「已用行列数」元数据，`sheetId` 恒定。（<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid> 、<https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html>）

**写值最小可跑示例（sheetId 来自上一步回包，非硬编码）：**
```json
POST https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}/batchUpdate
Content-Type: application/json

{"requests":[{"updateRangeRequest":{"sheetId":"<GET files/{fileId}?concise=1 回包的 properties[0].sheetId>","gridData":{"startRow":0,"startColumn":0,"rows":[{"values":[{"cellValue":{"text":"姓名"}},{"cellValue":{"text":"工时"}}]},{"values":[{"cellValue":{"text":"张三"}},{"cellValue":{"number":8}}]}]}}}]}
```
期望回包 `{"responses":[{"updateRangeResponse":{"updatedCells":4}}]}`（`updatedCells>0` 才算真写入）。
（body 字段逐字：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html#updaterangerequest> ；路径：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html#请求格式> ；`updatedCells`：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html>）

**`-12 missing data not found` 的官方定位：** 非文档化业务码（官方业务码只 `400001`–`400010`，无 `-12`/无 `10003`），属服务端 `BuildRevision` 构建层内部/兜底错误；语义最贴近「目标 sheet/底层数据找不到」，故优先排查「写值 sheetId 不是这张表真实活的 sheet」或「fileId 不是 sheet 类型」，而非 body 结构。（<https://docs.qq.com/open/document/app/openapi/v3/common/code.html#通用错误码>）
