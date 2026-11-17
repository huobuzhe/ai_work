# 腾讯文档 V3 batchUpdate 写值请求体精确结构（一手核实）

> 存放说明：按 `docs/research/` 习惯，一个研究问题一份文档；本文件是针对「服务端 proto 解析 `syntax error: unexpected token [`」bug 的一手取证记录，供修复时直接引用。只采官方一手来源（docs.qq.com 开放平台开发文档）。所有 URL 均为官方文档页，逐字抄录字段表与示例。

## 0. 结论速览

- 外层结构 **`{"requests":[{"updateRangeRequest":{...}}]}` 是正确的**，与官方示例完全一致，**不需要**再包 `{"request":{...}}` 或 `{"updateRange":{"range":...}}`。也就是说，报错的 `syntax error` **不是**外层 key 写错导致的。
- `updateRangeRequest` 内部：`sheetId`(string, 必填) + `gridData`(object, 必填)。**靶区定位用 `gridData.startRow` / `gridData.startColumn`（0 基），不是 A1 字符串 `range`**。
- `gridData.rows` 是 `array(RowData)`，RowData = `{"values": array(CellData)}`，CellData = `{"cellValue": {...,"text":"x"}, "cellFormat":..., "dataType":...}`。**`values` 的元素是 `CellData` 对象（含 `cellValue` 包一层），不是裸 cellValue，也不是裸字符串**。所以请求者的 `{"cellValue":{"text":"姓名"}}` 形状本身是对的。
- **真正可能触发 `unexpected token [` 的点**：`gridData` 或 `rows` 不是数组时。官方 `gridData` 是**对象**（含 `startRow`/`startColumn`/`rows`），**`rows` 才是数组**；`requests` 是数组。若 proto 在 line1:108 附近看到不该出现的 `[`，需核对是不是把某个应为 object 的字段写成了数组（例如把 `gridData` 写成 `[...]`），或反过来把 `rows`/`values` 写成了非数组。详见「对修复的影响」。

---

## 1. `requests` 数组元素的精确结构

**来源**：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html>

官方 `Request` 定义逐字（request.html「Request」节）：

```json
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

**结论**：`requests` 数组元素的 key 就是 `updateRangeRequest`（以及 `addSheetRequest` / `deleteDimensionRequest` / `deleteSheetRequest` 四选一）。**不需要**额外包 `{"request":{...}}`，也不存在 `{"updateRange":{"range":...}}` 这种形状。请求者现有的 `{"requests":[{"updateRangeRequest":{...}}]}` 外层是对的。

**来源**（请求体顶层）：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html> 「请求体」表：
| 参数名 | 类型 | 必选 | 描述 |
| --- | --- | --- | --- |
| requests | array(Request) | 是 | 要执行的批量更新操作 |

> 限制（update.html「接口说明」）：单次批量更新请求的操作数量 `<= 5`。

---

## 2. `UpdateRangeRequest` 内部字段与靶区定位

**来源**：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html#updaterangerequest>

「UpdateRangeRequest」参数表逐字：

| 参数名称 | 数据类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| sheetId | string | 是 | 工作表唯一标识 |
| gridData | object([GridData](.../model/spreadsheet.html#griddata)) | 是 | 写入指定区域的数据 |

补充说明（原文）：目前单元格支持的数据类型（CellValue）只包括：`text`、`link`、`number`。

**结论**：
- `UpdateRangeRequest` 只有两个字段：`sheetId` + `gridData`。**没有 `range`（A1 字符串）字段**，也没有独立的 `startRow/startColumn`（它们在 `gridData` 里）。
- `gridData` 确实是这个名字、这个层级（`updateRangeRequest.gridData`）。
- 靶区定位：`sheetId`（在 updateRangeRequest 层）+ `gridData.startRow` / `gridData.startColumn`（0 基）。**不是** A1 `range`。

官方示例（request.html「UpdateRangeRequest」示例，逐字节选）：

```json
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
                  "cellValue": { "text": "123" },
                  "cellFormat": { "textFormat": { "fontSize": 12, "bold": true } }
                },
                {
                  "cellValue": { "text": "test" },
                  "cellFormat": { "textFormat": { "fontSize": 20, "bold": true, "underline": true, "italic": true, "color": { "red": 255, "green": 100 } } }
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

> 注意：示例中 `startRow`/`startColumn` 均为 0 基（model 页明确「从0开始计算」）。

---

## 3. `gridData.rows` 与 `values` 的精确类型（逐字字段表）

**来源**：<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html>

### GridData（spreadsheet.html#griddata）

| 字段名 | 数据类型 | 描述 |
| --- | --- | --- |
| startRow | integer | 起始行编号 （从0开始计算） |
| startColumn | integer | 起始列编号 （从0开始计算） |
| rows | array(RowData) | 各行的数据 |

> `gridData` 是**对象**（不是数组）；其中 `rows` 才是**数组**，元素类型 `RowData`。

### RowData（spreadsheet.html#rowdata）

| 字段名 | 数据类型 | 描述 |
| --- | --- | --- |
| values | array(CellData) | 各个单元格的数据内容 |

> `rows` 的元素 key 是 **`values`**（不是 `cells`），类型 `array(CellData)`。

### CellData（spreadsheet.html#celldata）

| 字段名 | 数据类型 | 描述 |
| --- | --- | --- |
| cellValue | object(CellValue) | 单元格的数据内容 |
| cellFormat | object(CellFormat) | 单元格的样式信息 |
| dataType | string | 单元格的数据类型，枚举值参考 DataType |

> `values` 的元素是 **`CellData` 对象**，其数据内容在 `cellValue` 里再包一层。**不是**裸 `CellValue`，也**不是**裸字符串。

### CellValue（spreadsheet.html#cellvalue）

| 字段名 | 数据类型 | 描述 |
| --- | --- | --- |
| text | string | 文本内容 |
| number | float | 数值数据 |
| link | object(Link) | 超链接 |
| time | object(Time) | 时间 |
| location | object(Location) | 位置信息 |
| select | object(Select) | 单选\多选 |

> 每个 `cellValue` 只能用其中一个字段。

**结论**：请求者写的 `{"cellValue":{"text":"姓名"}}` 作为 `values` 元素（CellData）是**正确**的；`rows` 元素 key 是 `values`（非 `cells`）也是**正确**的。

---

## 4. 可直接照抄的完整合法 minimal batchUpdate 写值请求体

官方字段表约束下的最小两行两列写值（A1:B2，`startRow=0,startColumn=0`）：

```json
{
  "requests": [
    {
      "updateRangeRequest": {
        "sheetId": "BB08J2",
        "gridData": {
          "startRow": 0,
          "startColumn": 0,
          "rows": [
            {
              "values": [
                { "cellValue": { "text": "姓名" } },
                { "cellValue": { "text": "工时" } }
              ]
            },
            {
              "values": [
                { "cellValue": { "text": "张三" } },
                { "cellValue": { "text": "8" } }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

**来源**：结构完全由 `request.html` 的 UpdateRangeRequest 示例 + `model/spreadsheet.html` 的 GridData/RowData/CellData/CellValue 字段表推导；每个 key、每个嵌套层级都与官方逐字一致。上述对象仅省略了可选的 `cellFormat`/`dataType`（两者均非必填）。

---

## 5. 成功回包结构确认

**来源**：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html> 「响应包体」+ <https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/response.html>

response.html「UpdateRangeResponse」表逐字：

| 参数名 | 数据类型 | 描述 |
| --- | --- | --- |
| updatedCells | integer | 数据更新的成功的单元格数量 |

`BatchUpdateResponse` 是四选一：`addSheetResponse` / `updateRangeResponse` / `deleteDimensionResponse` / `deleteSheetResponse`。

update.html「响应包体」官方示例（逐字）：
```json
{"responses":[{"addSheetResponse":{"properties":{"sheetId":"neRpt4", "title":"测试添加子表", "rowCount":0, "columnCount":0, "rowTotal":10, "columnTotal":10}}}, {"deleteDimensionResponse":{"deleted":2}}]}
```

**结论与一处需注意的出入**：
- `responses[]` 元素的 key 为 `updateRangeResponse`，其内只有 `updatedCells`(integer)。**`responses[].updateRangeResponse.updatedCells` 这个路径是准确的。**
- **但顶层包装存在文档自相矛盾**：update.html「响应体（响应参数）」表写的是 `data.responses | array(BatchUpdateResponse)`（即 `data.responses`）；而紧邻的「响应包体」HTTP 示例给的实际 JSON 是**根级** `{"responses":[...]}`（没有 `data` 外层）。
  - 即：`data.responses`（参数表说法，同时伴有 `code`/`message`）vs `{"responses":[...]}`（实际 HTTP 示例）。
  - 建议解析时**同时兼容** `resp.get("data",{}).get("responses")` 与 `resp.get("responses")`，并以真实联调回包为准。

---

## 对修复的影响

1. **外层 `updateRangeRequest` 写法正确，不要在 key 上瞎改**：`{"requests":[{"updateRangeRequest":{...}}]}` 与官方 request.html 逐字一致；bug 不在外层 key。

2. **`gridData` 必须是对象、`rows` 才是数组**：`gridData` = `{startRow, startColumn, rows}`（对象），`rows` = `[RowData...]`，`RowData` = `{values:[...]}`。若把 `gridData` 误写成数组（`"gridData":[...]`）或把 `rows`/`values` 误写成对象，proto 就会在数组应出现/不应出现的位置报 `unexpected token [`。line 1:108 落在 `"rows":[` 或 `"values":[` 附近，**优先排查这层括号是否与 proto 期望的序列化类型一致**（尤其 `values` 元素必须是含 `cellValue` 的对象，不能是裸字符串——裸字符串序列化时会在 `values` 内部产生不该有的标量/结构错位）。

3. **靶区定位没有 `range` 字段**：服务端模型里 `UpdateRangeRequest` 只有 `sheetId`+`gridData`；`startRow`/`startColumn` 在 `gridData` 内，0 基。若代码里传了 `"range":"A1:B2"` 之类，属于多余/非法字段，应删除改成 `gridData.startRow/startColumn`。

4. **`values` 元素是 `CellData`（含 `cellValue` 包一层），不是裸 cellValue/裸字符串**：现有 `{"cellValue":{"text":"姓名"}}` 正确，保持不变；`rows` 元素 key 用 `values`（非 `cells`）。

5. **成功回包路径按 `responses[].updateRangeResponse.updatedCells` 取，但要兼容 `data.responses` 与根级 `responses` 两种形状**（官方参数表与 HTTP 示例不一致，见第 5 节）。

## 可直接照抄的 minimal 写值请求体

```json
{"requests":[{"updateRangeRequest":{"sheetId":"BB08J2","gridData":{"startRow":0,"startColumn":0,"rows":[{"values":[{"cellValue":{"text":"姓名"}},{"cellValue":{"text":"工时"}}]},{"values":[{"cellValue":{"text":"张三"}},{"cellValue":{"text":"8"}}]}]}}}]}
```

（单行版，等价于第 4 节 pretty 版；两行两列 A1:B2。所有 key 与嵌套层级均与官方 request.html + model/spreadsheet.html 逐字一致。）
