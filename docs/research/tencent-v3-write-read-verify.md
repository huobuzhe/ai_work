# 腾讯文档 V3 在线表格「写值 batchUpdate ↔ 读回 get_range」结构核实与「写值 200 但读回全 null」根因分析（一手取证）

> **存放理由**：循 `docs/research/` 既有取证笔记习惯（本目录已有 11 份，同属「腾讯文档云端冒烟测试」链条：[tencent-v3-batchupdate-request-shape.md](<F:/ai_work/docs/research/tencent-v3-batchupdate-request-shape.md>) 已一手核实 Step 7 写值 `batchUpdate` 的请求结构，本篇专为「一次真实持凭据实测：写值 HTTP 200 但读回全 null」核实**读回 `get_range` 的精确结构与 null 语义**，并与写值响应、sheetId 一致性对齐，解释该现象、给出可解释根因与最小修复点，与前述笔记并列存放，便于 `SMOKE-RUNBOOK.md` 的 Step 7/8 直接引用。

## 取证口径

- **只采一手**：腾讯文档开放平台官方开发文档 `docs.qq.com/open/document/app/openapi/v3/...`（`sheet/batchupdate/update.html`、`sheet/batchupdate/request.html`、`sheet/batchupdate/response.html`、`sheet/model/spreadsheet.html`、`sheet/model/a1_notation.html`、`sheet/get/get_sheet.html`、`sheet/get/get_range.html`）。逐字取自官方页面内嵌的「请求格式 / 请求包体 / 示例 / 响应包体 / 参数表」代码块。
- **本轮可达性实测**：本篇所引 `docs.qq.com/open/document/app/**/*.html` 各页均 **HTTP 200 且正文全文可取**（含代码块与参数表），未出现 SPA 空壳。正文逐字已核。
- **只用占位符，不写任何真实凭据**：所有 URL/示例中的 token、fileId 一律 `$TENCENT_*`/官方示例值（如示例 fileId `ABCDE123abcde`、`300000000$AAAAAAAAAAAA`，示例 sheetId `BB08J2` 为逐字抄录的**文档示例值**，非凭据）。
- **外部检索仅作反证**：`web_search`（`腾讯文档 get_range valueRenderOption valueType`、`site:docs.qq.com/open/document/app/openapi/v3 valueRenderOption`）返回的全是 `qq.com`/`docs.qq.com` 首页与无关站点，**未命中任何官方一手页**（与前一篇笔记 [tencent-v3-batchupdate-request-shape.md:12](<F:/ai_work/docs/research/tencent-v3-batchupdate-request-shape.md>) 记录一致）；据此不写任何字段名。
- 每条断言后紧跟一手 URL；查不到的写「未验证」并说明原因。按约束**只写本文件**，不改任何代码 / issue / 分支 / Git。

## 一句话结论

**写值结构完全正确，读回 URL/range 也正确，但读回的「全 null」是异常信号，不是「空表」语义**：官方 `get_range` 响应示例逐字证明——真实写到过内容的区域，`gridData.rows[].values[].cellValue` 必然带 `{"text":"..."}` 等对象；**即便是空单元格，官方示例也是 `{"cellValue":{"text":""},"dataType":"DATA_TYPE_UNSPECIFIED"}`（`text` 为空串），而不是 `cellValue:null`**。真实回包出现「3×3 全部 `cellValue:null` + `dataType:"DATA_TYPE_UNSPECIFIED"` + `version:"0"`」，**与官方任何示例形态都不符**，最可能是 **(c) 写入与读取不是同一张 sheet（sheetId 不一致或写到了另一张子表）**，其次是其它环境因素（写值回包 200 未打印 body，可能是 `4xx` 业务错被网关包成 200，或写到了默认 sheet 而读到的是新建/另一张 sheet）。**该修的一处：先 `GET /files/{fileId}?concise=1` 打印回包拿 `properties[].sheetId`，写与读**都用这个同一个 sheetId**，并打印写值完整回包（含 `responses`）确认 `updatedCells > 0`。**已验证写值字段名与读回键路径均正确；「全 null」不能靠改 `rows/values` 键名解释（那是对的）。**

---

## 1. 写值 `batchUpdate` 的 `updateRangeRequest` 精确结构 —— **已验证**

### 1.1 行/值的键名：`rows` 与 `values`，单元格是 `cellValue` —— 一手逐字

- 参数链：`gridData`（object GridData）+ `sheetId`（string，必填）是 `updateRangeRequest` 仅有的两个子字段。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
- 模型页逐字三层：
  - `GridData`：`startRow | integer | 起始行编号 （从0开始计算）`、`startColumn | integer | 起始列编号 （从0开始计算）`、`rows | array(RowData) | 各行的数据`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata ）
  - `RowData`：`values | array(CellData) | 各个单元格的数据内容`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#rowdata ）
  - `CellData`：`cellValue | object(CellValue)`、`cellFormat | object(CellFormat)`、`dataType | string`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#celldata ）
- **结论（逐字核对）**：`gridData` 里「行」的键名是 **`rows`**（不是 `values`）；每行对象里「各单元格」的键名是 **`values`**（array）；每个单元格「值」的键名是 **`cellValue`**。这三层键名在官方 schema 与官方 `UpdateRangeRequest` 示例中**完全一致、无歧义**。真实请求 `gridData.rows[].values[].cellValue` **键名正确**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#rowdata 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
- **0-based**：`startRow`/`startColumn` 官方逐字「从0开始计算」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata ）
- **官方 UpdateRangeRequest 示例逐字**（`sheetId:"BB08J2"`、`startRow:1`、`startColumn:6`、`rows[].values[].cellValue.text` / `cellValue.link`）：

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
                { "cellValue": { "text": "123" }, "cellFormat": { "textFormat": { "fontSize": 12, "bold": true } } },
                { "cellValue": { "text": "test" } },
                { "cellValue": { "text": "test123" } },
                { "cellValue": { "link": { "url": "docs.qq.com", "text": "超链接" } } }
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

### 1.2 `sheetId` 必须与查 sheet 返回的 `properties[].sheetId` 完全一致 —— **已验证（须一致）**

- `updateRangeRequest.sheetId` 逐字「工作表唯一标识」，指向 `spreadsheet.html#sheetid`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid ）
- `sheetId` 的获取方式逐字：「可以通过在线表格的链接来获取，如果一个在线表格的链接是 `https://docs.qq.com/sheet/ABCDEF12345abcdef?tab=BB08J2` ，那么对应的 **sheetId** 为 `BB08J2`」；`GET /files/{fileId}` 响应 `properties[].sheetId` 也是同一标识。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html ）
- **结论**：写值与读回必须用**同一个** `sheetId`（即同一张子表）。写到哪里、从哪里读，全靠这个字符串对齐。**这是「写值成功但从别处读到空」的第一嫌疑点。**（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）

### 1.3 不支持公式字段（与本次现象无关，附带坐实）

- `request.html` 补充说明逐字「目前单元格支持的数据类型（CellValue）只包括：`text`、`link`、`number`」；`CellValue` 表六字段 `text/number/link/time/location/select`，无任何 `formula*`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue ）

---

## 2. 写值回包（HTTP 200）的正确 body 形状与成功判据 —— **参数表已验证；外层结构未验证**

- `update.html`「响应参数」表逐字：`code | integer | 业务返回码`、`message | string | 业务返回码描述`、`data.responses | array(BatchUpdateResponse) | 请求返回结果的详细信息`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- 但同页「响应包体」示例逐字**只有顶层 `responses`**，无 `code`/`message`/`data`：

```
HTTP/1.1 200 OK
...
{"responses":[{"addSheetResponse":{"properties":{"sheetId":"neRpt4", ...}}}, {"deleteDimensionResponse":{"deleted":2}}]}
```

（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

- `BatchUpdateResponse` 四选一：`addSheetResponse` / `updateRangeResponse` / `deleteDimensionResponse` / `deleteSheetResponse`；其中 **`UpdateRangeResponse.updatedCells | integer | 数据更新的成功的单元格数量`**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html ）
- **结论**：
  - **已验证**：成功时 HTTP `200`（`update.html` 响应包体示例为 `HTTP/1.1 200 OK`）；`responses[]` 每项对应一个 `requests` 元素的操作结果，`updateRangeResponse.updatedCells` 是「成功更新的单元格数」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html ）
  - **未验证**：`code == 0` 是否成功判据 —— 参数表有 `code` 但示例无 `code`，`code.html` 通用错误码只列 `400001`–`400010` 无 `0` 定义，故不写死 `code==0`（详见前篇笔记 §5.2）。**成功的最可靠信号：HTTP 200 + 打印 `responses` 肉眼核对 `updatedCells` 是否 >0。**（https://docs.qq.com/open/document/app/openapi/v3/common/code.html ）
- **对本次实测的意义**：真实回包「HTTP 200 但未打印 body」，故**无法确认 `responses[].updateRangeResponse.updatedCells` 到底是不是 0、有没有夹带业务错误**。这是诊断链上的一个盲点（见 §5、§7）。

---

## 3. 读回 `get_range` 的精确 URL 形状 —— **已验证**

- `get_range.html`「请求格式」逐字：`Path | /openapi/spreadsheet/v3/files/{fileId}/{sheetId}/{range}`、`Method | GET`、`Accept | application/json`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- **结论**：正确形状是 `GET .../files/{fileId}/{sheetId}/{range}` —— **`sheetId` 在路径里**，**不是** `GET .../files/{fileId}/values/{range}`，**也不是** query 参数。真实实测 URL `GET .../files/{fileId}/BB08J2/A1:C3`（`sheetId=BB08J2` 在路径、`A1:C3` 经 `encodeURIComponent` 成 `A1%3AC3`）**形状正确**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- `range` 用 **A1 表示法**：参数表逐字「查询的范围，格式遵循 A1表示法」；`A1:C3` 即第一行到第三行、A 列到 C 列的区域（`A1:B5` 表示「从单元格 `A1` 到单元格 `B5` 的区域」）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/a1_notation.html ）
- **`sheetId` 必须是路径段、必填**：参数表 `sheetId | string | 是 | 工作表ID，工作表的唯一标识`；「查询参数：无」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- **官方请求示例逐字**：`curl --location --request GET 'https://docs.qq.com/openapi/spreadsheet/v3/files/ABCDE123abcde/BB08J2/A10:D11' \`（fileId / sheetId / `A10:D11` 三段全在路径）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- **范围限制**：单次行数 `<=1000`、列数 `<=200`、总单元格 `<=10000`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- **range 是否必须 URL 编码**：官方文档未逐字要求 `:` 编码（示例 `A10:D11` 未编码）；`encodeURIComponent` 把 `:` 编成 `%3A`（`A1%3AC3`）在 HTTP 路径里等价，**不构成错误**。此项「编码是否必需」官方无逐字说明，标**未验证（但不影响正确性）**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）

---

## 4. 读回回包里承载单元格值的键路径与 null 语义 —— **已验证（关键）**

### 4.1 键路径：`gridData.rows[].values[].cellValue` —— 一手逐字（与写值同构）

- `get_range.html`「响应参数」表逐字：`code`、`message`、`gridData | object(gridData) | 请求范围内的表格信息`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- `gridData` 的结构即 `spreadsheet.html#griddata` 的 `startRow`/`startColumn`/`rows[].values[].CellData`，`CellData` 含 `cellValue`/`cellFormat`/`dataType`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#rowdata 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#celldata ）
- **结论**：读回承载单元格值的键路径**就是** `gridData.rows[].values[].cellValue`（与写值同构）。`cellValue` 是**对象**（如 `{"text":"阿岚"}` / `{"number":8}`），不是直接标量。真实回包 `gridData.rows[].values[].cellValue` 的**读取路径正确**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue ）

### 4.2 官方响应示例逐字：非空格带对象、空单元格是 `{"text":""}` 而非 `null` —— **决定性证据**

`get_range.html`「响应包体」示例逐字（节选，`A10:D11` 两行）：

```
{
  "ret": 0,
  "msg": "Succeed",
  "data": {
    "gridData": {
      "columnMetadata": [],
      "rowMetadata": [],
      "rows": [
        {
          "values": [
            { "cellFormat": null, "cellValue": { "location": {...} }, "dataType": "LOCATION" },
            { "cellFormat": null, "cellValue": { "text": "test"     }, "dataType": "DATA_TYPE_UNSPECIFIED" },
            { "cellFormat": null, "cellValue": { "text": "testing"  }, "dataType": "DATA_TYPE_UNSPECIFIED" },
            { "cellFormat": null, "cellValue": { "text": ""         }, "dataType": "DATA_TYPE_UNSPECIFIED" }
          ]
        },
        {
          "values": [
            { "cellFormat": null, "cellValue": { "text": "this is not empty" }, "dataType": "DATA_TYPE_UNSPECIFIED" },
            ...
          ]
        }
      ],
      "startColumn": 0,
      "startRow": 9
    }
  }
}
```

（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）

- **逐字要点（关键）**：
  1. 外层是 **`ret` / `msg` / `data.gridData`**（V2 式的 `ret`/`msg` 外壳，不是 §2 参数表写的 `code`/`message`/`gridData` 顶层）——**读回接口的响应参数表（`code`/`message`/`gridData`）与响应包体示例（`ret`/`msg`/`data`）自相矛盾**，标**未验证（外层结构）**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
  2. **空单元格 = `{"cellValue":{"text":""},"dataType":"DATA_TYPE_UNSPECIFIED"}`**（`text` 为空串），官方示例第 4 格逐字如此 —— **官方示例里没有任何一格是 `cellValue:null`**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
  3. `dataType:"DATA_TYPE_UNSPECIFIED"` 的官方含义逐字是「**单元格未设置数据验证，没有指定类型**」——它是**数据验证类型**的默认值，**不是「单元格为空」的标记**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#datatype ）

### 4.3 `cellValue:null` + `dataType:"DATA_TYPE_UNSPECIFIED"` 是否等于「该格确实为空」—— **未验证，且与官方示例不符**

- **已验证**：`dataType:"DATA_TYPE_UNSPECIFIED"` 只表示「未设置数据验证」，与「有没有值」无关（见 4.2 第 3 点）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#datatype ）
- **未验证**：`cellValue` 为 `null`（整个对象缺失）究竟表示什么 —— 官方**唯一**读回示例中，即使空单元格也是 `{"text":""}` 对象而非 `null`；官方文档**没有任何逐字说明**「`cellValue:null` = 该格为空」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- **合理推断（标为推断，非一手断言）**：真实回包「3×3 每格都 `cellValue:null`」**既不是官方示例的空值形态（`{"text":""}`），也不是有值形态（`{"text":"..."}`）**，说明这些格要么从未被写过、要么这张 sheet/这个 range 与写入目标根本不对应。单凭 `dataType:"DATA_TYPE_UNSPECIFIED"` 不能反推「写进去了但读成空」，因为它对所有未设数据验证的格都成立。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#datatype ）

---

## 5. 关键判断：「写值 200 但读回全 null」最可能的官方可解释原因

把 §1–§4 的一手事实代入四种候选：

- **(a) 写值 `rows` 键名用错** → **排除（已验证）**。真实请求 `gridData.rows[].values[].cellValue` 与官方 schema/示例**逐字一致**（§1.1）；键名 `rows`/`values` 是对的，不存在「写到别处」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
- **(b) 读回 URL/range 格式不对读到空区** → **基本排除（已验证 URL 形状正确）**。真实 URL `GET .../files/{fileId}/BB08J2/A1:C3` 形状与官方 `.../files/{fileId}/{sheetId}/{range}` 一致，`sheetId` 在路径、`A1:C3` 是合法 A1 表示法（§3）。**唯一未能排除的细微点**：若写入的 `startRow/startColumn` 不是 0,0 而是别处（本例写 0,0，读 A1:C3=0,0 起，区域是对齐的），或 range 编码方式被服务端错误解析（官方未要求编码，`%3A` 理论上等价，标未验证）。**但 range 本身没错，不太可能读到「完全不相干的空区」。**（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/a1_notation.html ）
- **(c) 写入与读取不是同一张 sheet** → **首位嫌疑**。写用 `sheetId:"BB08J2"`、读用路径 `BB08J2`，**表面一致**；但若这个 `BB08J2` 是**硬编码/猜测的默认 sheetId**，而真实表格的 sheet 是新 `addSheetRequest` 建的（得到另一 sheetId，如示例 `neRpt4`），则写入可能落在「不存在的 BB08J2」或在别处，读 `BB08J2` 得全空。官方明确要求两者用同一真实 sheetId（§1.2）。**这是「写 200 但读不到」最典型的官方可解释路径。**（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html ）
- **(d) 需先 `addSheet` 到指定 sheetId 才能写** → **不能作为根因（未验证，且逻辑不符）**。`updateRangeRequest` 的 `sheetId` 必须指向**已存在**的工作表；若 `BB08J2` 不存在，写值**应当报错**（`400003` 访问的资源不存在 / `400001` 参数错误），而非静默 200 后读空。官方没有「先 addSheet 才能写同一 sheetId」的任何逐字机制；`addSheetRequest` 是**新建一张新 sheet**（返回**新** sheetId），不是「把 sheetId 指派成 BB08J2」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html 、https://docs.qq.com/open/document/app/openapi/v3/common/code.html ）

### 5.1 我的判断（明确标注证据等级）

- **可解释、最可能的根因：(c) 写与读不是同一张 sheet**（`sheetId` 取值/来源不一致，或写到了一张、读的是另一张/默认空 sheet）。**依据等级：官方逻辑可解释、字段语义已验证；但「本例真实发生了什么」属推断，因为原始运行未打印写值回包 body、也未记录读 sheet 列表回包。**（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- **另一条同等嫌疑（环境/判读类，非字段错误）：写值回包 200 但 body 未打印，可能实际是业务错（`responses` 里 `updatedCells` 缺失/为 0，或网关把 4xx 包成 200）。** 因 §2 已确认真实成功时 `updateRangeResponse.updatedCells` 应 >0，若为 0 则说明写根本没落。**依据等级：未验证（缺 body）。**（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html ）
- **已排除：(a) 键名错误、（b）range 形状错误、（d）必须先 addSheet。** 前两者分别被 §1.1、§3 的一手结构坐实为正确；后者与 200 静默不符。
- **一句话：最可能是「sheetId 不是这张表真实的那张」或「写值其实没落（updatedCells=0，只是没打印）」，而不是写值结构或读回 URL 写错了。** 修复点见 §7。

---

## 6. 是否存在 `values` 顶层值 / `valueRenderOption` / `valueType` 参数 —— **未验证存在；官方 V3 sheet 文档中均无**

- 官方 V3 在线表格侧栏仅 5 页：总览 / 在线表格资源描述 / 批量更新接口 / 查询工作表信息接口 / 范围内容查询接口；**没有**「值在 `values` 顶层」的读接口，也没有 `valueRenderOption`/`valueType`/`ValueInputOption` 之类参数的任何页面。（https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- `get_range.html` 参数表只有 `fileId` / `sheetId` / `range`，「查询参数：无」，**没有任何 `valueRenderOption`/`valueType`**。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
- `CellValue` 六字段（`text`/`number`/`link`/`time`/`location`/`select`）是「只有排序靠前的字段生效」，**没有**「公式 vs 计算值 vs 原始值」的三态渲染概念。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue ）
- **结论**：值**只能**从 `gridData.rows[].values[].cellValue` 取，**不存在**「顶层 `values` 字段」或「需 `valueRenderOption`/`valueType` 才能返回实际值」的官方机制。`web_search` 两轮均未命中官方页佐证存在此类参数（详见取证口径）。若确有此参数，属**未文档化/未验证**，不得据以诊断。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#cellvalue ）

---

## 对诊断的影响

1. **别改 `rows`/`values` 键名——它们是对的。** 真实请求 `gridData.rows[].values[].cellValue` 与官方 `GridData`/`RowData`/`CellData` schema 及 `UpdateRangeRequest` 示例逐字一致（§1.1），键名不可能是根因。（https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#griddata 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html ）
2. **别改读回 URL 形状——它也是对的。** `GET .../files/{fileId}/{sheetId}/{range}`（`sheetId` 在路径、`A1:C3` A1 表示法）与官方请求格式一致（§3）；`A1%3AC3` 编码不影响正确性。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ）
3. **首查 sheetId 一致性：写与读是否真的指向同一张子表。** 先 `GET /openapi/spreadsheet/v3/files/{fileId}?concise=1`，打印回包拿 `properties[].sheetId`，把写值和读回的 `sheetId` 都锚定到这一条真实值，**不要硬编码/猜测默认 sheetId**。这是最可能的根因（§5）。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_sheet.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid ）
4. **打印写值完整回包，核 `updatedCells`。** 「HTTP 200 未打印 body」是诊断盲点：成功时 `responses[].updateRangeResponse.updatedCells` 应 >0；应为 0 或缺失则说明写根本没落（§2、§5.1）。同时按官方 FAQ 打印完整 Request/Response 并留 `X-Trace-Id`。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）
5. **不要把 `cellValue:null`+`DATA_TYPE_UNSPECIFIED` 当「空表」或「写成功但读空」的定论。** 官方读回示例中空单元格是 `{"text":""}` 对象、非 `null`；`DATA_TYPE_UNSPECIFIED` 只表示未设数据验证，与值无关（§4.2/4.3）。出现全 `null` 是异常信号，指向「格根本未被这张表写过 / 表对不上」，而不是「写对了但渲染不出」。（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#datatype ）

---

## 未验证汇总

| 项 | 原因 |
| :--- | :--- |
| `code == 0` 是否为 batchUpdate 成功判据 / 外层结构 | `update.html` 参数表 `code`/`message`/`data.responses` vs 响应包体示例顶层 `{"responses":[...]}` 矛盾；`code.html` 无 `0` 定义（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v3/common/code.html ） |
| `get_range` 响应外层是 `code/message/gridData` 还是 `ret/msg/data.gridData` | 参数表写 `code`/`message`/`gridData`，响应包体示例却是 `ret`/`msg`/`data.gridData`（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ） |
| `cellValue:null` 的精确语义 | 官方唯一读回示例空单元格为 `{"text":""}` 而非 `null`，无逐字说明 `null` 含义（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ） |
| `range` 中 `:` 是否必须 URL 编码 | 官方示例 `A10:D11` 未编码，无逐字要求；`%3A` 理论上等价（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ） |
| 是否存在 `valueRenderOption`/`valueType` 参数 | 官方 V3 sheet 全站无此参数；`web_search` 未命中官方页（https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html ） |
| 本次实测写值是否真的落表（`updatedCells` 值） | 原始运行未打印写值回包 body（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html ） |
| 新建在线表格默认是否带一张 sheet / 默认 sheetId | 官方无逐字声明（https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html#sheetid ） |
