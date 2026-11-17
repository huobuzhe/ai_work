# 腾讯文档云端冒烟测试 Step 7：V3 在线表格批量更新 `batchUpdate` 请求 / 回包精确形态（一手核实）

> **存放理由**：循 `docs/research/` 既有取证笔记习惯（本目录已有 9 份，同属「腾讯文档云端冒烟测试」的 [tencent-create-file-request-shape.md](<F:/ai_work/docs/research/tencent-create-file-request-shape.md>) 核实 Step 6 建文件、[tencent-scope-application-steps.md](<F:/ai_work/docs/research/tencent-scope-application-steps.md>) 核实 scope 申请、[spreadsheet-platform-capabilities.md](<F:/ai_work/docs/research/spreadsheet-platform-capabilities.md>) 给平台能力总览），本篇专为 Step 7（`POST /openapi/spreadsheet/v3/files/{fileId}/batchUpdate`，写入单元格值）核实 `requests` 数组的**精确结构**、单元格值/公式字段、sheetId 定位方式、响应/错误码，与前述笔记并列存放，便于 `SMOKE-RUNBOOK.md` 的 Step 7 / Step 8 / 共识 ⑲ 用例直接引用而不必再查。

## 取证口径

- **只采一手**：腾讯文档开放平台官方开发文档 `docs.qq.com/open/document/app/openapi/v3/...`（`sheet/batchupdate/update.html`、`sheet/batchupdate/request.html`、`sheet/batchupdate/response.html`、`sheet/model/spreadsheet.html`、`sheet/model/a1_notation.html`、`sheet/get/get_sheet.html`、`sheet/get/get_range.html`、`sheet/overview.html`、`common/code.html`）、`openapi/v2/` 下的 `common/req_headers.html` / `frequency_control.html` / `sheet/values/update.html`、`scope.html`、`FAQ/how_to_debug.html`、`get_started.html`、`oauth2/access_token.html`、`openapi/v3/`，以及官方 page 内嵌的示例 curl / 请求包体 / 响应包体。凡一手页正文取不到、或各一手来源互相矛盾之处，一律写「未验证」并说明原因，**不补二手转述、不编字段名或 URL**。
- **本轮可达性实测**：本轮所引 `docs.qq.com/open/document/app/**/*.html` 各页均 HTTP 200 且**正文全文可取**（含「请求格式 / 请求包体 / 示例 / 响应包体 / 错误码」代码块与参数表），未出现 SPA 空壳；这与 [tencent-create-file-request-shape.md:8](<F:/ai_work/docs/research/tencent-create-file-request-shape.md>) 记的 `https://docs.qq.com/open/developers/`、`https://docs.qq.com/open/` 是 SPA 正文取不到并不冲突（那是另外两页）。因此本篇多数断言能落到逐字原文。
- **全文只用占位符，不写任何真实凭据**：所有 curl / 请求示例中的 token、ID、Secret 一律为占位符或 `$TENCENT_*` 变量；官方示例里出现的示例文档 ID（如 `300000000$AAAAAAAAAAAA`）、示例 sheetId（如 `BB08J2`）、示例标题「测试添加子表」、示例昵称「张三」为**逐字抄录**的文档示例值，不是凭据，按「逐字抄出」要求保留原样；官方教程里那串示例 `access_token` / `client_secret=xxx` 一律不抄。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/get_started.html ）
- **控制台 / 页面按钮标签一律标「未验证、以页面实际标签为准」**：官方文档页的导航文字不等于实时控制台 UI 标签。（https://docs.qq.com/open/document/app/scope.html ）
- 每条断言后紧跟一手 URL；查不到的写「未验证」并说明原因。按约束**只写本文件**，不改动 `SMOKE-RUNBOOK.md` 等任何其它文件。
- **外部检索结论（仅作反证，不作依据）**：两次 `web_search`（`腾讯文档 OpenAPI V3 在线表格 写入公式 formula cellValue`、`site:docs.qq.com/open/document/app/openapi/v3 sheet formula`）返回的都是 `qq.com` / `docs.qq.com` 首页 / 第三方站点与词典页，**未命中任何官方「公式写入」或「API Explorer / 调试台」一手页**；按口径排除，不据此写任何字段名。

## 一句话结论

**`requests` 结构一手坐实**：`POST https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}/batchUpdate`、`Content-Type: application/json`、`fileId` 在路径、`requests` 是 `array(Request)`，每个元素只能是 `addSheetRequest` / `updateRangeRequest` / `deleteDimensionRequest` / `deleteSheetRequest` 四选一；「写入单元格区域」的确切类型名是 **`updateRangeRequest`**，子字段为 `sheetId` + `gridData`（`startRow` / `startColumn` / `rows[].values[].cellValue`），**用 0-based 网格坐标而非 A1**（A1 只用于读接口）。限制原文「单次批量更新请求的操作数量 <= 5」逐字可取。请求头与 Step 6 文件管理接口**同源**（同一 `req_headers.html` 三元组）。**但有三处必须纠正/保留「未验证」**：① 官方 `CellValue` 字段是 `text` / `number` / `link` / `time` / `location` / `select`，**没有任何公式字段**（`formulaValue` / `formula` / `userEnteredValue` / `stringValue` / `numberValue` 均不存在），且 `request.html` 明写「目前单元格支持的数据类型只包括 `text`、`link`、`number`」——共识 ⑲ `canWriteFormula` 用例 (c) 无法用一手文档构造；② 响应外层官方页**自相矛盾**：参数表写 `code` / `message` / `data.responses`，而 `update.html`「响应包体」示例只有顶层 `{"responses":[...]}`，`get_range.html` 示例又是 V2 式 `ret` / `msg` / `data`，FAQ 也用 `ret`/`msg` —— 成功判据 `code==0` 在本接口页**无逐字依据**，唯一跨页一致的成功信号是 HTTP 200；③ 新建在线表格**默认是否有 sheet / 默认 sheetId** 官方未逐字说明，须先调 `GET /openapi/spreadsheet/v3/files/{fileId}` 列 sheet 或先 `addSheetRequest`。最小 curl 的 payload 结构（除 sheetId 取值外）**已一手坐实、可直接复制**；公式与响应判据仍须标未验证。

---

## 1. 完整 URL、方法、Content-Type、请求头、fileId 位置、单次 5 个操作限制原文

### 1.1 请求格式 —— 一手确认（`update.html`「请求格式」表逐字）

| 描述 | 定义 |
| :--- | :--- |
| Path | /openapi/spreadsheet/v3/files/{fileId}/batchUpdate |
| Method | POST |
| Content-Type | application/json |
| Accept | application/json |

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

- 含域名的完整 URL 由官方「示例」curl 与「请求包体」原始报文给出，均为 `https://docs.qq.com/openapi/spreadsheet/v3/files/300000000$AAAAAAAAAAAA/batchUpdate`（`300000000$AAAAAAAAAAAA` 为官方示例 fileId，形态 `{domainID}${padID}`，与 Step 6 回包 `data.ID` 一致）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v2/file/common/file_info.html ）
- **Content-Type 是 `application/json`（JSON body），不是表单** `application/x-www-form-urlencoded`（后者是 Step 6 建文件接口）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- 官方「请求包体」原始 HTTP 块逐字含 `Content-Type: application/json`；官方「示例」curl 逐字含 `--header 'Content-Type: application/json'` 与 `--data-raw '{...}'`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- `Accept | application/json` 在「请求格式」表逐字给出，但**官方示例 curl 未带 `Accept` 头**；照官方示例最小 curl 可不写 `Accept`，需要时补。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

### 1.2 三个自定义头是否与文件管理接口相同 —— 一手确认：**相同、同源**

- `update.html`「请求头部」逐字：「详见[Headers](/open/document/app/openapi/v2/file/common/req_headers.html)」，链到的正是 Step 6 建文件接口引用的**同一页** `req_headers.html`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v2/file/common/req_headers.html ）
- `req_headers.html`「请求头部」表逐字：`Access-Token | string | 是 | 访问令牌，用于标识用户和接口鉴权`、`Client-Id | string | 是 | 应用 ID，用于标识应用和接口鉴权`、`Open-Id | string | 是 | 开放平台用户 ID，用于标识用户和接口鉴权`，三者**全部必选**。（https://docs.qq.com/open/document/app/openapi/v2/file/common/req_headers.html ）
- V3 介绍页「请求规范说明」表同样逐字列出 `Access-Token` / `Client-Id` / `Open-Id` 三项（均标「是」），并逐字「请求头部：需要携带 `Client ID`、`Open ID` 和 `Access Token` 三元组，后台用来做认证与鉴权」。（https://docs.qq.com/open/document/app/openapi/v3/ ）
- `update.html` 的请求包体与示例 curl、官方 `get_sheet.html` / `get_range.html` 示例 curl，大小写均逐字为 `Access-Token:` / `Client-Id:` / `Open-Id:`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- 三者对应 OAuth 回包的哪个字段（沿用 [tencent-create-file-request-shape.md:196](<F:/ai_work/docs/research/tencent-create-file-request-shape.md>) 的一手核实）：`Access-Token` = 回包 `access_token`，`Open-Id` = 回包 `user_id`，`Client-Id` = 应用注册获得；`get_started.html` §5「对应关系」表与 `oauth2/access_token.html` 响应体表逐字可查。（https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/access_token.html ）
- **结论**：Step 7 三个头与 Step 6 **完全相同**（同一份 `req_headers.html`），可直接照抄 Step 6 的三行 `--header`。

### 1.3 `fileId` 在路径还是 query —— 一手确认：**路径参数，query 为空**

- `update.html`「请求参数」表逐字：`| fileId | string | 是 | 在线表格的唯一标识 |`；紧接「#### 查询参数」逐字「**无**」；「请求体」表只有 `requests`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- 路径参数定义链到 `id.html`（「fileID 表示在线文档的 ID」）；V3 介绍「请求参数：支持 `Path Parameters`、`Query Parameters`、`Body Parameters` 三种」。（https://docs.qq.com/open/document/app/openapi/v2/file/common/id.html 、https://docs.qq.com/open/document/app/openapi/v3/ ）
- **结论**：`fileId` 放**路径** `/files/{fileId}/batchUpdate`，**不要**写成 `?fileId=...`。值填 Step 6 回包 `data.ID`（`300000000$XXXXXXXXXXXX`）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

### 1.4 单次 5 个操作的限制原文 —— 一手确认，逐字

- `update.html`「接口说明」末行逐字：「`限制`：单次批量更新请求的操作数量 <= 5」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- 同节「接口说明」另逐字说明执行语义（与 ≤5 配套）：「1. 批量更新请求中的各个操作会逐个按顺序执行，直到全部执行完成则请求返回，或者其中一个操作报错则不再继续执行后续的操作。2. 每一个更新操作在执行之前都会做请求校验（包括权限校验、参数校验等等），如果校验未通过则该更新操作会报错并返回，不再执行后续操作。3. 因为在线表格本身的协作属性，即便是更新操作被成功执行，在线表格看到的最终结果也不一定是请求操作的结果，其他的编辑行为都可能改变表格数据。」（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- **注意**：≤5 限制的是 `requests` **数组元素个数（操作数）**，不是单元格数；单元格数限制在 `UpdateRangeRequest` 另给（范围行数 <=1000 / 列数 <=200 / 总单元格 <=10000，见 §2.3）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
- **附带记录一处官方频控数值矛盾（标未验证）**：`update.html` 页头频控标签逐字为 `[fileID] [50]`（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）；而 `frequency_control.html`「对于文档操作的频率控制约定」表逐字 `fileID | 150`（次/分钟）、频控标签 `[fileID] [150]`（https://docs.qq.com/open/document/app/openapi/v2/frequency_control.html ）；`get_sheet.html` / `get_range.html` 页头又都是 `[fileID] [100]`（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）。三处不一致，哪一档适用于 batchUpdate **未验证**，不写死；错误码 `429 / 400007`「请求数超过限制」可佐证存在限频。（https://docs.qq.com/open/document/app/openapi/v3/common/code.html ）

---

## 2. 请求体 `requests` 数组元素的精确结构

### 2.1 `requests` 本身与 Request 对象 —— 一手确认，逐字

- `update.html`「请求体」表逐字：`| requests | array([Request](/open/document/app/openapi/v3/sheet/batchupdate/request.html)) | 是 | 要执行的批量更新操作 |`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- `request.html` 的 `Request` 定义逐字（`**参数说明：** 在线表格（spreadsheet）更新操作的请求类型`）：

```
{
  // 下列字段只能填写其中一个，若填写多个则排序优先的字段生效，其余字段无效
  "addSheetRequest": {
    Object(AddSheetRequest)
  },
  "updateRangeRequest": {
    Object(UpdateRangeRequest)
  },
  "deleteDimensionRequest": {
    Object(DeleteDimensionRequest)
  },
  "deleteSheetRequest": {
    Object(DeleteSheetRequest)
  }
}
```

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）

- **操作类型枚举（一手全集，`request.html` 页内目录逐字）**：`AddSheetRequest`、`UpdateRangeRequest`、`DeleteDimensionRequest`、`DeleteSheetRequest` —— **共 4 种，无公式类、无其它类型**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
- 每个元素**只能填其中一个字段**（原文「只能填写其中一个，若填写多个则排序优先的字段生效，其余字段无效」）；`requests` 数组可混排多种操作，官方示例即 `addSheetRequest` + `deleteDimensionRequest` 两个元素。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

### 2.2 官方页原文的请求体 JSON 示例 —— 逐字抄出（一手确认）

`update.html`「请求包体」原始 HTTP 报文逐字（含三个自定义头）：

```
POST /openapi/spreadsheet/v3/files/300000000$AAAAAAAAAAAA/batchUpdate HTTP/1.1
Host: docs.qq.com
Access-Token: ACCESS_TOKEN
Client-Id: CLIENT_ID
Open-Id: OPEN_ID
Content-Type: application/json
Content-Length: 195

{"requests":[{"addSheetRequest":{"title":"测试添加子表","rowCount":10,"columnCount":10}}]}
```

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

`update.html`「示例」curl 逐字（两个 `requests` 元素，`addSheetRequest` + `deleteDimensionRequest`）：

```
curl --location --request POST 'https://docs.qq.com/openapi/spreadsheet/v3/files/300000000$AAAAAAAAAAAA/batchUpdate' \
--header 'Access-Token: ACCESS_TOKEN' \
--header 'Client-Id: CLIENT_ID' \
--header 'Open-Id: OPEN_ID' \
--header 'Content-Type: application/json' \
--data-raw '{
    "requests": [
        {
            "addSheetRequest":{
                "title": "测试添加子表",
                "rowCount": 10,
                "columnCount": 10 
            }
        },
        {
            "deleteDimensionRequest": {
                "sheetId": "BB08J2",
                "dimension": "COLUMN",
                "startIndex": 1,
                "endIndex": 3
            }
        }
    ]
}'
```

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

### 2.3 「写入单元格区域 / 更新范围值」的确切 request type 名与子字段 —— 一手确认（本篇核心）

- 确切类型名 **`updateRangeRequest`**，`request.html`「UpdateRangeRequest」节逐字：「更新范围内单元格内容请求，单次更新的范围大小需满足以下限制：1. 范围行数 `<=1000` 2. 范围列数 `<=200` 3. 范围内的总单元格数量 `<=10000`」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
- 参数表逐字：

| 参数名称 | 数据类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `sheetId` | string | 是 | 工作表唯一标识 |
| `gridData` | object(GridData) | 是 | 写入指定区域的数据 |

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）

- **`gridData` / `rows` / `values` / `cellValue` 的精确结构**（`spreadsheet.html` 模型页逐字）：
  - `GridData`：`startRow | integer | 起始行编号（从0开始计算）`、`startColumn | integer | 起始列编号（从0开始计算）`、`rows | array(RowData) | 各行的数据`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata ）
  - `RowData`：`values | array(CellData) | 各个单元格的数据内容`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#rowdata ）
  - `CellData`：`cellValue | object(CellValue)`、`cellFormat | object(CellFormat)`、`dataType | string`（枚举见 `DataType`）。三者**均未标必填**；官方写入示例的单元格省略了 `dataType`、部分省略 `cellFormat`，故最小 `CellData` 只需 `{"cellValue": {...}}`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#celldata 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
- `request.html`「UpdateRangeRequest 示例」逐字抄出（**官方唯一逐字写入示例**，含 `cellValue.text` / `cellValue.link` 与 `cellFormat.textFormat`）：

```
{
  "requests": [
    {
      "updateRangeRequest": {
        "sheetId": "BB08J2",
        "gridData": {
          "startRow": 1,
          "startColumn": 6,
          "rows": [
            {
              "values": [
                {
                  "cellValue": {
                    "text": "123"
                  },
                  "cellFormat": {
                    "textFormat": {
                      "fontSize": 12,
                      "bold": true
                    }
                  }
                },
                {
                  "cellValue": {
                    "text": "test"
                  },
                  "cellFormat": {
                    "textFormat": {
                      "fontSize": 20,
                      "bold": true,
                      "underline": true,
                      "italic": true,
                      "color": {
                        "red": 255,
                        "green": 100
                      }
                    }
                  }
                },
                {
                  "cellValue": {
                    "text": "test123"
                  },
                  "cellFormat": {
                    "textFormat": {
                      "bold": true,
                      "underline": true,
                      "italic": true,
                      "color": {
                        "red": 255
                      }
                    }
                  }
                },
                {
                  "cellValue": {
                    "link": {
                      "url": "docs.qq.com",
                      "text": "超链接"
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）

- 四种操作各自的字段（供对照，`request.html` 逐字）：
  - `AddSheetRequest`：`title`（string，是，「工作表名称，长度限制31个字符」）、`rowCount`（integer，否，默认 `200`）、`columnCount`（integer，否，默认 `20`）；限制「行数 `<=10000`、列数 `<=200`、单元格总数 `10000`」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
  - `DeleteDimensionRequest`：`sheetId`（是）、`dimension`（是，枚举 `ROW` / `COLUMN`，见 `spreadsheet.html#dimension`）、`startIndex`（是，从1开始）、`endIndex`（是，从1开始）；「删除的范围遵循`左闭右开` ———— `[startIndex,endIndex)`」。注意此处下标**从 1 开始**，与 `gridData` 的 0-based 不同。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#dimension ）
  - `DeleteSheetRequest`：`sheetId`（是）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
- **结论**：`requests` 元素结构 = `{ "<操作名>": { <该操作子字段> } }`；写值用 `{"updateRangeRequest":{"sheetId":"...","gridData":{"startRow":0,"startColumn":0,"rows":[{"values":[{"cellValue":{...}}]}]}}}`。所有字段名一手坐实，**无需猜测**。

---

## 3. 如何定位「写到哪张 sheet 的哪个区域」：sheetId / range / 默认 sheet

### 3.1 写入用 `sheetId` + 0-based 网格坐标，不是 A1 —— 一手确认

- 写操作 `updateRangeRequest` 的两个必填子字段是 `sheetId` + `gridData`，`gridData` 用 `startRow` / `startColumn`（**「从0开始计算」**）定位左上角，配合 `rows[].values[]` 逐格给出数据。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata ）
- 模型页另有 `GridRange`（`sheetId` / `startRow` / `endRow` / `startColumn` / `endColumn`），逐字「行列序号从`0`开始计算，遵循 `左闭右开` ———— `[start,end)`」，并逐字给出 `A1` 单元格对应的网格表示 `{"startRow":0,"endRow":1,"startColumn":0,"endColumn":1}`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#gridrange ）
- **A1 表示法只用于「读」接口的路径参数**：`get_range.html`「请求格式」逐字 `Path | /openapi/spreadsheet/v3/files/{fileId}/{sheetId}/{range}`、`Method | GET`；`range` 描述逐字「查询的范围，格式遵循 [A1表示法](/open/document/app/openapi/v3/sheet/model/a1_notation.html)」，示例 curl 逐字 `GET '.../ABCDE123abcde/BB08J2/A10:D11'`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/a1_notation.html ）
- `a1_notation.html` 逐字表：`A1:A1` 表示一个单元格、`A1:B5` 从 A1 到 B5、`A1:D1` 第一行 4 个单元格、`A1:A3` 第一列 3 个单元格、`B5:A1`「不合法的表示，因为 `B5` 在 `A1` 的右下方」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/a1_notation.html ）
- **结论（写入 vs 读取口径不同，别混用）**：Step 7 **写**用 `gridData.startRow/startColumn`（0-based，如 A1 = `startRow:0, startColumn:0`）；Step 8 **读**用路径 `range` 的 A1 表示法（如 `A1:C3`）。官方未给「A1 ↔ 0-based 网格」的换算工具，只分别定义，按各接口原文照写即可；把 `range: "A1:C3"` 塞进 `updateRangeRequest` **无一手依据**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- **未验证**：`gridData` 是否支持在一个 `rows[]` 内跳列 / 稀疏写入 / 只更新部分单元格（官方示例是连续填满 4 个 `values`，未讨论留空语义）。不擅自补。

### 3.2 新建的在线表格默认是否有 sheet —— **未验证**（官方无逐字说明）

- 官方 `overview.html` 逐字「在线表格由多个工作表（子表）组成」「一个在线表格可以包含多个工作表」「一个工作表对应在线表格的一个tab」，但**没有**「新建空白表格默认自带 1 张工作表」或「默认 sheetId 是什么」的逐字句。（https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html ）
- Step 6 建文件回包 `data.url` 逐字形如 `https://docs.qq.com/sheet/DAAAAAAAAAAAA`（**不含 `?tab=` 参数**），而官方取 sheetId 的方法之一正是从链接的 `?tab=` 取（见 3.3），故**无法从 Step 6 回包直接推出默认 sheetId**。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid ）
- **未验证（原因）**：官方 `create.html` / `get_started.html` §5 / `overview.html` / `spreadsheet.html` 均未逐字声明「新建空白在线表格默认带一张 sheet 及其 sheetId」；不能凭常识补「默认 sheetId 固定为某值」。Step 7 运行前**必须**先取得一个有效 `sheetId`（见 3.3）。

### 3.3 怎么拿到默认 sheetId —— 一手给出两条官方途径

- **途径 A（列 sheet，推荐给 Step 7）**：`GET /openapi/spreadsheet/v3/files/{fileId}`，即「查询工作表信息接口」。`get_sheet.html`「接口说明」逐字：「本接口用于查询工作表的基本信息：1. 所有子表的 `sheetID` 2. 所有子表标题 3. 所有子表大小（行列数）4. 所有子表已使用的行列数（耗时可能较长，若不需要该数据可以通过设置路径参数 `concise=1` 快速返回其他信息）」；「请求格式」表逐字 `Path | /openapi/spreadsheet/v3/files/{fileId}`、`Method | GET`、`Accept | application/json`；查询参数 `concise | int | 否 | 0: 返回完整的子表信息 / 1: 返回不包含子表使用行列数的子表信息`；「示例」curl 逐字 `curl --location --request GET 'https://docs.qq.com/openapi/spreadsheet/v3/files/300000000$AAAAAAAAAAAA?concise=1' \`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html ）
  - 权限逐字：`scope.sheet` / `scope.sheet.readonly`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html ）
  - 「响应参数」表逐字：`code | integer | 业务返回码`、`message | string | 业务返回码描述`、`properties | array(Properties) | 在线表格中各工作表的元数据`；`Properties` 含 `sheetId` / `title` / `rowCount` / `columnCount` / `rowTotal` / `columnTotal`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#properties ）
  - 「响应包体」示例逐字：`{"properties":[{"sheetId":"BB08J2", "title":"工作表1", "rowCount":0, "columnCount":0}, "rowTotal": 150, "columnTotal": 26]}`（注意该示例本身 JSON 结构可疑：`rowTotal`/`columnTotal` 落在了数组第二项的位置，疑为官方示例笔误，照抄不修饰）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html ）
  - 官方页内部笔误：`get_sheet.html`「请求包体」写 `?consie=1`，「示例」curl 写 `?concise=1`；按参数表与 curl 用 **`concise`**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html ）
- **途径 B（从在线表格链接取）**：`spreadsheet.html#sheetid` 逐字「工作表的唯一标识，可以通过在线表格的链接来获取，如果一个在线表格的链接是 `https://docs.qq.com/sheet/ABCDEF12345abcdef?tab=BB08J2` ， 那么对应的 **sheetId** 为 `BB08J2`」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid ）
- **途径 C（先建子表再写）**：同一 `batchUpdate` 里先发 `addSheetRequest`，其响应 `AddSheetResponse.properties.sheetId` 给出新 sheetId（`response.html` 逐字「`properties | object(Properties) | 新增子表的属性」」，`update.html` 响应包体示例逐字含 `"addSheetResponse":{"properties":{"sheetId":"neRpt4", ...}}`）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- **未验证（重要实践边界）**：官方只说「各个操作会逐个按顺序执行」（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ），**未**逐字说明「同一 batch 内后一个 `updateRangeRequest` 可以引用前一个 `addSheetRequest` 运行时产出的 `sheetId`」；请求体是静态 JSON、官方无变量/占位符引用机制。故**不要**假设一次调用能「先建 sheet 再写该 sheet」；稳妥做法是分两次调用：先 `addSheetRequest`（或 `get_sheet`）拿到 `sheetId`，再发 `updateRangeRequest`。此链式引用能力标**未验证**。

---

## 4. 单元格值的表示：文本 / 数字 / 公式的确切键名（共识 ⑲ 关键）

### 4.1 `CellValue` 官方字段全集 —— 一手确认，**没有公式字段**

- `spreadsheet.html#cellvalue` 表逐字（「单元格的数据内容，支持以下几种数据类型（注：每个cellValue只能使用一下的其中一个字段来表示单元格的数据类型，若同时使用多个类型，则只有排序靠前的字段会生效）」）：

| 字段名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `text` | string | 文本内容 |
| `number` | float | 数值数据 |
| `link` | object(Link) | 超链接 |
| `time` | object(Time) | 时间 |
| `location` | object(Location) | 位置信息 |
| `select` | object(Select) | 单选\多选 |

（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue ）

- `Link` 逐字：`url | string | 是 | 链接url`、`text | string | 是 | 链接展示的文本`；`Time`：`year/month/day/hour/minute/second`（integer）；`Color`：`red/green/blue/alpha`（[0,255]，RGBA）；`TextFormat`：`font/fontSize/bold/italic/strikethrough/underline/color`；`DataType` 枚举：`DATA_TYPE_UNSPECIFIED / SELECT / TIME / LOCATION / STAR`（这是「数据验证」类型，不是 CellValue 值类型）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#link 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#time 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#color 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#textformat 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#datatype ）
- **确切键名结论**：文本 `{"cellValue":{"text":"工时"}}`；数字 `{"cellValue":{"number":8}}`（`number` 是 float）；超链接 `{"cellValue":{"link":{"url":"...","text":"..."}}}`。**`userEnteredValue` / `stringValue` / `numberValue` / `formulaValue` / `formula` 这些键在官方一手 schema 里均不存在**，不要使用（那些是 Google Sheets / 其它 API 的命名，按「只采一手」口径排除）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
- **官方内部矛盾（标未验证）**：`request.html`「UpdateRangeRequest 补充说明」逐字「目前单元格支持的数据类型（[CellValue]）只包括：`text`、`link`、`number`」（3 种），而 `spreadsheet.html#cellvalue` 表列 6 种（多 `time` / `location` / `select`）。`request.html` 上次编辑 2023-07-25、`spreadsheet.html` 上次编辑 2026-01-26。写入时 `time`/`location`/`select` 是否被 `updateRangeRequest` 接受**未验证**；但 `text` 与 `number` 同时出现在两处，**无歧义、可放心使用**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue ）
- **未验证**：官方唯一逐字写入示例只演示了 `cellValue.text` 与 `cellValue.link`（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ），**没有** `cellValue.number` 的逐字写入示例；`number` 键名由 `CellValue` 表 + `request.html` 补充说明两处坐实，但「数字单元格的确切写入形态是否有额外约束」无逐字示例。若实跑报 `400001 请求参数错误`，可回退为全部用 `text`（官方示例已逐字验证的形态）。

### 4.2 「写 `=A2*B2` 公式」的字段形态 —— **未验证，且一手文档不支持公式写入**

- **Request 类型全集里没有公式类操作**：`Request` 只有 `addSheetRequest` / `updateRangeRequest` / `deleteDimensionRequest` / `deleteSheetRequest` 四种（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）；`BatchUpdateResponse` 也只有对应的四种响应，无公式响应。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html ）
- **`CellValue` 字段全集里没有公式值类型**：6 个字段为 `text` / `number` / `link` / `time` / `location` / `select`，无 `formula` / `formulaValue`；`DataType` 枚举也不含公式。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#datatype ）
- **V2（已废弃）同样没有公式字段**：`update.html`（V2）请求体逐字 `values | array(array(string)) | 是 | 二维数组，表示需要更新的单元格的内容`，示例 `{'values': [['123'], ['test']]}` —— 纯字符串二维数组，无公式字段。（https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html ）
- **结论（对共识 ⑲ `canWriteFormula` 用例 (c) 的直接影响）**：**无法用一手坐实的字段写出 `=A2*B2` 公式**。把 `=A2*B2` 作为 `{"cellValue":{"text":"=A2*B2"}}` 写入、服务端是否会把它**当作公式计算**（而非纯文本），官方**没有任何逐字依据**，标**未验证**，绝不写成确定能力。因此 Step 7 的最小 curl **只写常量值**（表头文本 + 数字），不写公式；共识 ⑲ 用例 (c) 必须继续标「未验证 / 无一手依据」，**不得**据此把 `canWriteFormula` 判为 true，也不得编造 `formulaValue` 之类字段去凑用例。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- **未验证**：是否存在未挂进 V3 在线表格导航的官方「公式写入」接口 / SaaS 通道公式能力（本轮 `web_search` 未命中任何官方一手页，V3 sheet 导航只有「总览 / 在线表格资源描述 / 批量更新接口 / 查询工作表信息接口 / 范围内容查询接口」及 model 子页）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html ）

---

## 5. 响应体精确结构、成功判据、错误码、`X-Trace-Id`

### 5.1 响应参数表 —— 一手逐字（`update.html`）

| 参数名 | 类型 | 描述 |
| :--- | :--- | :--- |
| `code` | integer | 业务返回码 |
| `message` | string | 业务返回码描述 |
| `data.responses` | array([BatchUpdateResponse](/open/document/app/openapi/v3/sheet/batchupdate/response.html)) | 请求返回结果的详细信息 |

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

- `response.html` 的 `BatchUpdateResponse` 逐字：每元素四选一 `addSheetResponse` / `updateRangeResponse` / `deleteDimensionResponse` / `deleteSheetResponse`；其中 **`UpdateRangeResponse`** 逐字「`updatedCells | integer | 数据更新的成功的单元格数量」」；`AddSheetResponse | properties`、`DeleteDimensionResponse | deleted | integer | 被删除的行数（或列数）`、`DeleteSheetResponse | sheetId | string | 被删除的工作表的唯一标识」`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html ）

### 5.2 **响应外层自相矛盾 —— 必须标「未验证」，不得写死 `code==0`**

- `update.html`「响应包体」示例逐字（**顶层只有 `responses`，没有 `code` / `message` / `data`**）：

```
HTTP/1.1 200 OK
Date: Thu, 28 Jul 2022 15:34:46 GMT
Content-Type: text/plain; charset=utf-8
Content-Length: 3
Connection: keep-alive

{"responses":[{"addSheetResponse":{"properties":{"sheetId":"neRpt4", "title":"测试添加子表", "rowCount":0, "columnCount":0, "rowTotal":10, "columnTotal":10}}}, {"deleteDimensionResponse":{"deleted":2}}]}
```

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

- 与参数表 `code` / `message` / **`data.responses`** 对照：示例是**顶层 `responses`**，参数表是 **`data.responses`** —— 连 `responses` 的层级都不一致。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- 同族接口进一步矛盾：`get_sheet.html` 参数表 `code`/`message`/`properties`，响应包体示例却是顶层 `{"properties":[...]}`（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html ）；`get_range.html` 参数表 `code`/`message`/`gridData`，响应包体示例却是 **V2 式** `{"ret": 0, "msg": "Succeed", "data": {"gridData": {...}}}`（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）。
- V3 介绍页逐字：「响应结果：`JSON` 数据格式。如果接口请求成功，则 `HTTP Status Code` 为 `200`, 并且返回对应接口定义的回包结构体；如果接口请求不成功，则 `HTTP Status Code` 不为 `200`，并且返回的错误响应结构包含 `code、message、details` 三个部分。其中 `code` 为错误码，`msg` 为错误码描述， `details` 为错误详情。」（该句自身 `message` / `msg` 混用）。（https://docs.qq.com/open/document/app/openapi/v3/ ）
- FAQ「问题排查」逐字：「通过查看请求的响应体来判断请求是否成功，请求的响应体中包含了 `ret` 和 `msg` 两个字段，分别代表`请求返回码` 和 `请求状态描述`」，成功示例 `{'ret': 0, 'msg': 'Succeed'}`。（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）
- **成功判据结论**：
  - **一手可写死**：HTTP 状态码 `200`（V3 介绍逐字「如果接口请求成功，则 `HTTP Status Code` 为 `200`」，https://docs.qq.com/open/document/app/openapi/v3/ ；`update.html` 响应包体示例亦为 `HTTP/1.1 200 OK`）。
  - **未验证**：`code == 0` 是否为该接口成功判据 —— `update.html` 参数表把 `code` 标为「业务返回码」但**未逐字写「`code==0` 表示成功」**，且「响应包体」示例根本没有 `code` 字段；`code.html`「通用错误码」表只列 `400001`–`400010` 的错误码，**无 `0` 的定义**（https://docs.qq.com/open/document/app/openapi/v3/common/code.html ）。V2 介绍页的「如果 `ret` 不为 `0` 则认为请求失败」是 **V2** 口径（https://docs.qq.com/open/document/app/openapi/v2/ ），不可直接套到 V3。→ 按取证口径**不写 `code==0` 为成功判据**，只写「HTTP 200 + 肉眼核对 `responses`」，并注明官方页结构矛盾。
  - **未验证**：`data.responses` 与顶层 `responses` 哪个是真实回包路径、失败响应 `code/message/details` 与 FAQ `ret/msg` 的适用边界。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/ 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）
- 保守做法（实跑回包与官方任一示例都对不上时）：按 FAQ 逐字「为了方便定位问题和反馈问题，建议开发者在自己的程序或脚本中**打印完整的 `Request` 和 `Response` 信息**」（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ），肉眼核对 HTTP 200 与 `responses` 内容，并把整份回包连同 `X-Trace-Id` 留档，不要猜键名。

### 5.3 常见错误码 —— 一手逐字

- `update.html`「错误码」表逐字：

| HTTP 状态码 | 业务错误码 | 描述 | 排查建议 |
| :--- | :--- | :--- | :--- |
| 400 | 400001 | 请求参数错误 | 确认传入的参数是否合法 |
| 401 | 400006 | 该操作未授权 | 确认对操作的资源是否具有相应的授权，以及用户票据是否正确 |
| 429 | 400007 | 请求数超过限制 | 请求数超过限频，请降低调用频率 |
| 500 | 400010 | 服务内部错误 | 服务端错误，请联系开发者 |

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

- 完整「通用错误码」表（`code.html` 逐字，10 行）：`400/400001` 请求参数错误、`504/400002` 服务端请求超时、`404/400003` 访问的资源不存在、`409/400004` 创建的资源已存在、`403/400005` 不允许访问该资源、`401/400006` 资源操作未授权（排查建议逐字「确认鉴权三元组是否合法有效」）、`429/400007` 请求数超过限制、`400/400008` 访问了超过范围的资源、`503/400009` 服务处于不可用状态、`500/400010` 服务内部错误。（https://docs.qq.com/open/document/app/openapi/v3/common/code.html ）
- 注意 **`401/400006` 在两页描述不同**：`update.html` 写「该操作未授权」，`code.html` 写「资源操作未授权」，且 `update.html` 排查建议多「以及用户票据是否正确」。照各自原文引用，不合并。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/common/code.html ）
- V2 的 `10313`（Access-Token 为空）/ `10303`（Open-Id 错误）/ `10302`（Client-Id 错误）/ `37019`（Token 校验失败，错误或过期）出自 V2 页，供对照但**不是** V3 batchUpdate 的错误码表。（https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html 、https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

### 5.4 `X-Trace-Id` 排障头 —— 官方 FAQ 一手逐字

- FAQ「问题排查」逐字：「`traceID`： 请求的流水号。通过回包 header 的 `X-Trace-Id` 字段返回给调用者。」；同一页「如何反馈问题」给出的提问模板逐字含 `- traceID: xxxxxxxxxxxxx` 与三元组请求头、`request body`。（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）
- **边界说明**：`X-Trace-Id` 出自官方 FAQ（通用排障页），**`update.html` 接口页本身未逐字写该头**；按「只采一手」可作「官方有此排障头」的依据，但不写成「batchUpdate 接口页声明了 `X-Trace-Id`」。（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

---

## 6. 官方 API Explorer / 调试台 URL —— 未验证

- **未验证**：本轮取到全文的官方各页，顶栏一致为「Open API / 小程序 / MCP / 腾讯文档SaaS版(限免) / 腾讯文档 SDK / 我要反馈」，侧栏一致为「开放接口概述 / 用户授权 / 文件管理 / 在线表格 / 在线智能表 / 在线文档 / 在线收集表 / FAQ / 常见错误码」，**未出现「API Explorer」「调试台」「在线调试」任何条目**。（例：https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/common/code.html 、https://docs.qq.com/open/document/app/ 、https://docs.qq.com/open/document/app/scope.html ）
- 唯一 hash 路由是「我要反馈」`https://docs.qq.com/open/#/feedback`，FAQ 逐字称其为「反馈平台」，**不是**可交互调试台。（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）
- 官方 FAQ **「问题排查」**页 `https://docs.qq.com/open/document/app/FAQ/how_to_debug.html` 内容是「打印完整 Request / Response」「看 `ret`/`msg`」「到反馈平台提 `traceID`」的说明，**不是可交互 API Explorer / 调试台**，页内也没有调试台 URL。（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）
- 外部检索（两次 `web_search`）未命中腾讯文档官方 OpenAPI 调试台的一手 URL（命中的是 `qq.com` / `docs.qq.com` 首页 / 第三方站点，按口径排除）。→ **不给任何调试台 URL，也不断言「一定没有」**；与 [tencent-create-file-request-shape.md:231-234](<F:/ai_work/docs/research/tencent-create-file-request-shape.md>)、[tencent-scope-application-steps.md:147](<F:/ai_work/docs/research/tencent-scope-application-steps.md>) 一致。
- **控制台 / 页面按钮标签一律标「未验证、以页面实际标签为准」**：实时控制台 `https://docs.qq.com/open/developers/` 为 SPA、正文取不到；官方 `scope.html` 只给权限规则 + 一张内嵌截图 `https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670`。（https://docs.qq.com/open/document/app/scope.html ）
- **未验证**：官方服务端 OpenAPI SDK / 官方示例代码仓库是否含 `requests` 结构示例。顶栏「腾讯文档 SDK」指向 `https://docs.qq.com/open/document/websdk/`（前端 JS-SDK「在线预览服务」，能力表为文档/表格/幻灯片/PDF 的预览与视图操作，不含 OpenAPI 批量更新），沿用 [tencent-create-file-request-shape.md:37](<F:/ai_work/docs/research/tencent-create-file-request-shape.md>) 的核实；外部检索命中的 GitHub 仓库为第三方社区 SDK，按「只采一手」排除。（https://docs.qq.com/open/document/websdk/ ）

---

## 7. 官方 scope 名在本接口上的精确写法、是否需审核、命名矛盾

### 7.1 本接口（写入）的精确写法 —— 一手确认

- `update.html`「权限说明」逐字：「本接口需要拥有以下任意一项权限：`scope.sheet` / `scope.sheet.editable`」→ **精确字符串 `scope.sheet` 或 `scope.sheet.editable`，任意一项**，「以下任意一项」意味着不是两个都要。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- 读接口对照（一手逐字）：`get_sheet.html` 与 `get_range.html`「权限说明」均为「`scope.sheet` / `scope.sheet.readonly`」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- V2（已废弃）写入接口对照：`update.html`（V2）「权限说明」逐字只有 `scope.sheet`。（https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html ）
- V3 介绍逐字「每个接口描述会标注 `Access Token` 需要的 `scope`，而 `scope` 则依赖第三方应用的所获得的 `scope` 和发起授权时指定的 `scope`」；授权链接 `scope` 参数**固定 `all`**（`get_started.html` §1 逐字 `scope | all`）。（https://docs.qq.com/open/document/app/openapi/v3/ 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/authorize.html ）

### 7.2 是否需审核 —— **未验证**

- `scope.html`「注意」第 1 条逐字：「腾讯文档OPEN API将分为「免审核」与「需审核」两类，第三方应用将默认开通免审核权限，管理员要根据**最少必要原则**，为第三方应用勾选需审核的权限。」；第 2/3/4 条分别讲授权目的披露、`授权目的说明` 按最少必要原则审核、权限变动后需让用户重新授权。（https://docs.qq.com/open/document/app/scope.html ）
- **未验证（原因）**：`scope.html` 全文**没有列出任何 scope 名称与含义的文字清单，也没有逐 scope 标注「免审核 / 需审核」**，本轮全文取到、只有规则 + 1 张截图 + 4 条注意；因此 `scope.sheet` / `scope.sheet.editable` 究竟属免审核还是需审核**无法从一手判定**，控制台里该行「权限类型」列显示成什么**以页面实际标签为准**。（https://docs.qq.com/open/document/app/scope.html ）
- 授权链接里的 `scope=all` 与接口所需 scope 是两件事（沿用 [tencent-create-file-request-shape.md:182](<F:/ai_work/docs/research/tencent-create-file-request-shape.md>)）：`scope=all` 只是发起授权的固定参数，Token 实际拿到的 `scope` 来自应用已获权限、回包逗号分隔。（https://docs.qq.com/open/document/app/oauth2/authorize.html 、https://docs.qq.com/open/document/app/oauth2/access_token.html ）

### 7.3 命名矛盾 —— 如实并列，不合并（一手 URL 逐条）

| 出现位置 | 逐字 scope 名 | 一手 URL |
| :--- | :--- | :--- |
| V3 batchUpdate（写） | `scope.sheet`、`scope.sheet.editable` | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html |
| V3 get_sheet / get_range（读） | `scope.sheet`、`scope.sheet.readonly` | https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html |
| V2 更新区域内容（废弃） | `scope.sheet` | https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html |
| V2 新建文档（Step 6） | `scope.drive.creatable` | https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html |
| 接入教程 §4 Token 回包 | `scope.sheet.editable`、`scope.sheet.readonly`、`scope.file.creatable`、`scope.folder.creatable`、`scope.drive.form`、`scope.doc.editable` 等（**无单独的 `scope.sheet`**） | https://docs.qq.com/open/document/app/get_started.html |
| 获取 Access Token 响应示例 | `"scope": "scope.file.editable,scope.folder.creatable"`（**无任何 `scope.sheet.*`**） | https://docs.qq.com/open/document/app/oauth2/access_token.html |
| 应用权限总表 | **正文不列任何 scope 名** | https://docs.qq.com/open/document/app/scope.html |

- **未验证**：是否存在一份把上述名字对齐的官方总表；以及「`scope.sheet`（不带后缀）」是否会被真实签发（接口权限说明写它，但两处 Token 回包示例都不含它，只有 `scope.sheet.editable` / `scope.sheet.readonly`）。**不擅自合并、不硬编码控制台应显示哪个字符串**；控制台「权限名称」列实际显示以页面实际标签为准。（https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/access_token.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

---

## 综合结论（可直接替换进 Step 7 的确定项）

| 待核实项 | 一手结论 | 一手 URL |
| :--- | :--- | :--- |
| 完整 URL | `https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}/batchUpdate` | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html |
| HTTP 方法 | `POST` | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html |
| Content-Type | `application/json`（JSON body，非表单） | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html |
| fileId 位置 | 路径参数；官方「查询参数 无」 | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html |
| 单次限制 | 逐字「`限制`：单次批量更新请求的操作数量 <= 5」 | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html |
| 请求头 | `Access-Token` / `Client-Id` / `Open-Id`（同 Step 6，同一 `req_headers.html`） | https://docs.qq.com/open/document/app/openapi/v2/file/common/req_headers.html 、https://docs.qq.com/open/document/app/openapi/v3/ |
| 请求体 | `requests`: `array(Request)`，必填 | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html |
| 操作类型枚举 | `addSheetRequest` / `updateRangeRequest` / `deleteDimensionRequest` / `deleteSheetRequest`（四选一） | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html |
| 写值类型名 | `updateRangeRequest`，子字段 `sheetId` + `gridData` | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html |
| 区域定位 | `gridData.startRow/startColumn`（0-based）+ `rows[].values[].cellValue`；**不是 A1** | https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#gridrange |
| 单元格值键名 | `text` / `number` / `link` / `time` / `location` / `select`；**无公式字段** | https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue |
| 默认 sheetId | **未验证**；用 `GET /openapi/spreadsheet/v3/files/{fileId}` 列 sheet | https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid |
| 响应 | 参数表 `code`/`message`/`data.responses`，但示例是顶层 `{"responses":[...]}` —— 结构**未验证**；成功信号 HTTP 200 | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/ |
| 错误码 | `400001` / `400006` / `400007` / `400010` 等，详见 `code.html` | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/common/code.html |
| X-Trace-Id | 官方 FAQ 逐字「通过回包 header 的 `X-Trace-Id` 字段返回」 | https://docs.qq.com/open/document/app/FAQ/how_to_debug.html |
| scope | 写入 `scope.sheet` 或 `scope.sheet.editable`（任意一项）；是否需审核未验证 | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/scope.html |
| 官方调试台 | 未验证 | https://docs.qq.com/open/document/app/ 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html |

---

## 未验证汇总

| 项 | 原因 |
| :--- | :--- |
| `code == 0` 是否为 batchUpdate 成功判据 / 响应外层确切结构 | 参数表 `code`/`message`/`data.responses` vs 响应包体示例顶层 `{"responses":[...]}` 矛盾；`code.html` 只列 400001–400010 无 `0` 定义；V2 的 `ret==0` 口径不可套 V3（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/common/code.html 、https://docs.qq.com/open/document/app/openapi/v3/ 、https://docs.qq.com/open/document/app/openapi/v2/ ） |
| `data.responses` 与顶层 `responses` 哪个是真实路径；失败体 `code/message/details` 与 FAQ `ret/msg` 的边界 | 同上，官方多页互相矛盾（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ） |
| 新建在线表格默认是否带一张 sheet / 默认 sheetId | 官方 `overview.html` / `create.html` / `spreadsheet.html` 无逐字声明；Step 6 回包 `data.url` 不含 `?tab=`（https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html 、https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ） |
| 同一 batch 内后一操作能否引用前一 `addSheetRequest` 运行时产出的 sheetId | 官方只写「逐个按顺序执行」，无变量/占位符引用机制（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ） |
| 公式写入字段形态 / `=A2*B2` 作为 `text` 是否被当公式计算 | Request 四类型与 CellValue 六字段均无 `formula`/`formulaValue`；V2 也是纯字符串数组；官方无任何逐字依据（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue 、https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html ） |
| `cellValue.number` 的逐字写入示例 | 官方唯一写入示例只演示 `text` 与 `link`；`number` 键名由两处表/说明坐实但无示例（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ） |
| `updateRangeRequest` 支持的 CellValue 类型究竟 3 种还是 6 种 | `request.html`「只包括 text、link、number」vs `spreadsheet.html#cellvalue` 列 6 种（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue ） |
| `gridData.rows[]` 稀疏/跳列/部分留空写入语义 | 官方示例连续填满 `values`，未讨论留空（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ） |
| 官方 scope 总表；`scope.sheet`（无后缀）是否真实签发；这几个 scope 是否「需审核」 | `scope.html` 无清单；接口页与两处 Token 回包示例命名不一致（https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/access_token.html ） |
| batchUpdate 适用频控档位（50 / 100 / 150 次·分钟⁻¹） | `update.html` 页头 `[fileID][50]` vs `frequency_control.html` `[fileID][150]` vs get 页 `[fileID][100]`（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v2/frequency_control.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html ） |
| 官方 API Explorer / 调试台 URL | 官方导航、正文、外部检索均未检得；FAQ「问题排查」不是调试台（https://docs.qq.com/open/document/app/ 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ） |
| 控制台 / 页面按钮标签 | 实时控制台为 SPA，正文取不到；一律「未验证、以页面实际标签为准」（https://docs.qq.com/open/document/app/scope.html ） |
| 官方服务端 OpenAPI SDK / 官方示例代码仓库含 `requests` 结构 | `websdk/` 是前端预览 JS-SDK；命中的 GitHub 仓库为第三方社区 SDK（https://docs.qq.com/open/document/websdk/ 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ） |
| V3 是否完整覆盖 V2 全部写入动作（含公式） | `openapi/v3/`「文件管理、在线表格…请查阅 OpenAPI V2 介绍」与 V3 确有 sheet 批量更新接口口径不一致；本轮进一步确认 V3 无公式写入（https://docs.qq.com/open/document/app/openapi/v3/ 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ） |
| `get_sheet` 响应结构（`code`/`message`/`properties` vs 顶层 `{"properties":[...]}`） | 官方参数表与响应包体示例不一致，且示例 JSON 疑似笔误（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html ） |

---

## 对决策的影响

1. **Step 7 的 URL / 方法 / 头 / Content-Type / `fileId` 位置 / ≤5 限制 / `requests` 结构可从占位符换成确定指令**：`POST https://docs.qq.com/openapi/spreadsheet/v3/files/$TENCENT_FILE_ID/batchUpdate`、`Content-Type: application/json`、三元组请求头照抄 Step 6、`fileId` 走路径、`requests` 是 `array(Request)` 且每元素四选一、「单次批量更新请求的操作数量 <= 5」逐字可查。这些在 `update.html`、`request.html`、`req_headers.html`、`openapi/v3/` 逐字可查，可直接落进 `SMOKE-RUNBOOK.md` 的 Step 7，不再写「待确认」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v2/file/common/req_headers.html ）
2. **「写入单元格值」的确切 payload 已一手坐实，可给出可直接复制的 curl**：写值类型名是 `updateRangeRequest`，子字段 `sheetId` + `gridData.startRow/startColumn/rows[].values[].cellValue`；文本 `{"cellValue":{"text":"..."}}`、数字 `{"cellValue":{"number":8}}` 均有官方 schema 依据；官方「请求包体」与「示例」curl 逐字可取。唯一运行前需补齐的是 `$TENCENT_SHEET_ID`（官方给 `GET /openapi/spreadsheet/v3/files/{fileId}` 列 sheet 与 `?tab=` 两条一手途径）。**注意写入用 0-based 网格、Step 8 读回用 A1 路径 `range`，两者口径不同别混用**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
3. **共识 ⑲ `canWriteFormula` 用例 (c) 必须继续标「未验证」，且不得据此把能力位判为 true**：官方 `Request` 四类型、`CellValue` 六字段、V2 `values` 二维数组**都没有公式字段**（`formulaValue` / `formula` 等一律不存在，按「只采一手」不得编造）；把 `=A2*B2` 当 `text` 写入是否被计算无任何一手依据。因此 Step 7 的最小 curl **只写常量值**（表头 + 数字），用例 (c) 无法构造，应记为「官方 V3 batchUpdate 一手文档不支持公式写入 / 未验证」，并在共识 ⑲ 结论里明确这一能力位缺少一手正例。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue 、https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html ）
4. **成功判据与响应解析仍必须标「未验证」，别沿用背景里的 `code==0`**：`update.html` 参数表写 `code`/`message`/`data.responses`，但同页「响应包体」示例只有顶层 `{"responses":[...]}`，`get_range.html` 示例又是 `ret`/`msg`/`data`，FAQ 用 `ret`/`msg`，V3 介绍把 `code`/`message`/`details` 归给失败体；`code.html` 无 `0` 定义。Step 7 应写「HTTP 200 + 打印完整 Response 肉眼核对 `responses`」，**不要**硬编码 `.code == 0`；同时把外层 `ret`（V2 建文件）与 V3 的 `code`/`responses` 区分清楚。官方 `X-Trace-Id` 排障头可写进注意事项（出自 FAQ，非接口页）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/ 、https://docs.qq.com/open/document/app/openapi/v3/common/code.html 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）
5. **仍必须保留「未验证」的项**：新建表格默认 sheet / 默认 sheetId、同一 batch 内链式引用 sheetId、`number` 单元格逐字写入示例、CellValue 支持类型 3 种 vs 6 种、scope 总表与「是否需审核」、batchUpdate 频控档位、官方 API Explorer / 调试台 URL、官方服务端 SDK / 示例仓库、控制台按钮标签、V3 是否完整覆盖 V2 写入动作。scope 可写确定值「`scope.sheet` 或 `scope.sheet.editable`（任意一项）」，但控制台「权限名称」列显示成什么仍**必须标「未验证、以页面实际标签为准」**，授权链接 `scope` 仍固定 `all`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/access_token.html 、https://docs.qq.com/open/document/app/openapi/v2/frequency_control.html ）

---

## 可直接复制的 Step 7 最小 curl

> 前置：`$TENCENT_ACCESS_TOKEN` / `$TENCENT_CLIENT_ID` / `$TENCENT_OPEN_ID` 已由**后台服务**持有（沿用 Step 6 变量约定），`$TENCENT_FILE_ID` = Step 6 回包 `data.ID`；全文只用占位符与变量，无任何真实凭据。官方所有 OpenAPI 请求须由后台服务发起（https://docs.qq.com/open/document/app/oauth2/ ）。
>
> **`$TENCENT_SHEET_ID` 的取得（一手途径，运行前必做）**：官方未逐字说明新建表格默认 sheetId，故先列 sheet——
> `curl --location --request GET "https://docs.qq.com/openapi/spreadsheet/v3/files/${TENCENT_FILE_ID}?concise=1" --header "Access-Token: $TENCENT_ACCESS_TOKEN" --header "Client-Id: $TENCENT_CLIENT_ID" --header "Open-Id: $TENCENT_OPEN_ID"`，从回包 `properties[].sheetId` 取（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html ）；或按 `spreadsheet.html#sheetid` 从表格链接 `?tab=BB08J2` 取（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid ）；或先发一次 `addSheetRequest` 从 `addSheetResponse.properties.sheetId` 取（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html ）。**不要**假设同一 batch 内「先建 sheet 再写该 sheet」可行（未验证，见 §3.3）。

**payload 结构已一手坐实**（`requests` 仅 1 个元素 ≤5；`updateRangeRequest` / `gridData` / `cellValue.text` / `cellValue.number` 全部取自官方 schema；`cellValue.number` 无逐字写入示例，若实跑报 `400001` 可把数字格回退成 `text`）。**不写任何公式**——官方无公式字段（见 §4.2）。

```bash
curl --location --request POST "https://docs.qq.com/openapi/spreadsheet/v3/files/${TENCENT_FILE_ID}/batchUpdate" \
  --header "Access-Token: $TENCENT_ACCESS_TOKEN" \
  --header "Client-Id: $TENCENT_CLIENT_ID" \
  --header "Open-Id: $TENCENT_OPEN_ID" \
  --header 'Content-Type: application/json' \
  --data-raw "{
    \"requests\": [
      {
        \"updateRangeRequest\": {
          \"sheetId\": \"$TENCENT_SHEET_ID\",
          \"gridData\": {
            \"startRow\": 0,
            \"startColumn\": 0,
            \"rows\": [
              {\"values\": [
                {\"cellValue\": {\"text\": \"工时\"}},
                {\"cellValue\": {\"text\": \"时薪\"}},
                {\"cellValue\": {\"text\": \"应发\"}}
              ]},
              {\"values\": [
                {\"cellValue\": {\"number\": 8}},
                {\"cellValue\": {\"number\": 100}},
                {\"cellValue\": {\"text\": \"\"}}
              ]},
              {\"values\": [
                {\"cellValue\": {\"number\": 10}},
                {\"cellValue\": {\"number\": 80}},
                {\"cellValue\": {\"text\": \"\"}}
              ]}
            ]
          }
        }
      }
    ]
  }"
```

（形态照抄官方 `update.html`「示例」curl 与 `request.html`「UpdateRangeRequest 示例」：仅把官方 `ACCESS_TOKEN`/`CLIENT_ID`/`OPEN_ID` 换成变量、把 `300000000$AAAAAAAAAAAA` 换成 `$TENCENT_FILE_ID`、把 `addSheetRequest`/`deleteDimensionRequest` 换成一个 `updateRangeRequest`、把 `startRow:1,startColumn:6` 换成 `0,0`（A1 左上角）、把示例的 `text`/`link` 单元格换成表头 `text` 与数字 `number`。`--data-raw` 用双引号多行字符串以便 `$TENCENT_SHEET_ID` 展开，属 shell 行为，非腾讯官方文档内容。https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata ）

**成功判据（逐条，按官方原文）**：

- HTTP 状态码 `200`（`openapi/v3/` 逐字「如果接口请求成功，则 `HTTP Status Code` 为 `200`」，https://docs.qq.com/open/document/app/openapi/v3/ ；`update.html` 响应包体示例亦为 `HTTP/1.1 200 OK`）。
- 按 FAQ 逐字「打印完整的 `Request` 和 `Response` 信息」，肉眼核对回包里的 `responses`（官方 `update.html` 响应包体示例为顶层 `{"responses":[{...}]}`；`UpdateRangeResponse.updatedCells` 逐字为「数据更新的成功的单元格数量」）。（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html ）
- **不要**写死 `code == 0` / `ret == 0` 作为本接口成功判据：官方各页响应外层互相矛盾、`code.html` 未定义 `0`，属未验证（见 §5.2）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/common/code.html ）
- 失败时按 `update.html` 错误码表排查：`400/400001` 请求参数错误、`401/400006` 该操作未授权、`429/400007` 请求数超过限制、`500/400010` 服务内部错误；更多见 `code.html` 通用错误码表。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/common/code.html ）需要提反馈时留回包 header 的 `X-Trace-Id`（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）。
- Step 8 读回用**另一个**接口 `GET /openapi/spreadsheet/v3/files/{fileId}/{sheetId}/{range}`，`range` 用 A1（如 `A1:C3`），**不是**把 A1 塞进本写入请求（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/a1_notation.html ）。

**共识 ⑲ `canWriteFormula` 用例 (c)**：以上 curl **不含公式**，且官方 V3 `batchUpdate` 一手文档无任何公式字段，故该用例 (c)（写 `=A2*B2`）**无法构造、必须标未验证**，不得据此判定 `canWriteFormula = true`（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue ）。

冒烟调用计入「自 2025-07-01 起每应用限免 20000 次 API」额度（https://docs.qq.com/open/document/app/ ），并受文件级频控约束（档位 50/100/150 官方页不一致，标未验证，https://docs.qq.com/open/document/app/openapi/v2/frequency_control.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）。
