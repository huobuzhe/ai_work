# 飞书（Lark）多维表格 Bitable 字段类型数字码对照表（一手核实）

**存放理由**：本仓 `docs/research/` 是研究笔记目录，一研究问题一份（参考同目录既有 12 份笔记，如 `feishu-bitable-create-request-bodies.md`、`feishu-bitable-record-search.md`、`tencent-v3-batchupdate-request-shape.md` 等的写法）。本笔记单独成篇，专攻「字段类型 → 数字码」这一张表，因为它是 `workbench/lib/feishu-adapter.js` 里 `FEISHU_CODE_BY_NAME` 表正确性的唯一依据，也是 `scripts/feishu-adapter.js --live` 安全护栏 `unverifiedTypes` 能否放行的判据。

---

## 0. 结论速览（TL;DR）

| 我们用的名字 | 我们代码里的码 | **一手核实的正确码** | 结论 | 一手依据 |
| --- | --- | --- | --- | --- |
| `text` | 1（未验证） | **1** | ✅ **正确**（`TypeText = 1`，官方枚举释义为「多行文本」） | Go SDK `model.go` 常量区 / 枚举注释 |
| `number` | 2（已验证） | **2** | ✅ 正确（票 #5 实测 + 常量双证） | Go SDK `model.go` `TypeNumber = 2` |
| `date` | 5（未验证） | **5** | ✅ **正确**（`TypeDateTime = 5`，注释「日期」） | Go SDK `model.go` `TypeDateTime = 5` |
| `checkbox` | 7（未验证） | **7** | ✅ **正确**（`TypeCheckbox = 7`） | Go SDK `model.go` `TypeCheckbox = 7` |
| `single_select` | 3（未验证） | **3** | ✅ **正确**（`TypeSingleSelect = 3`） | Go SDK `model.go` `TypeSingleSelect = 3` |

**一句话结论**：我们表里的 5 个数字码 **全部正确，无需改动任何一个**——`text=1 / number=2 / date=5 / checkbox=7 / single_select=3`。缺的不是「改码」，而是「把 verified 标记从 false 翻成 true 并附一手 URL」。因为官方文档站是 SPA、正文抓不到，最强的一手证据是官方 Go SDK 源码里的常量逐字定义（见下）。

---

## 1. 问题一：FieldType 完整枚举与数字码的官方一手来源

### 1.1 一手来源层面的现实：官方文档站是 SPA

- `https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/guide` 抓取 HTTP 200，但正文只有标题「字段编辑指南 - 服务端 API - 飞书开放平台」，SPA 正文取不到 → 官方文档页对枚举数字码的**文字描述未能取到正文**（已实测）。
- 因此本笔记以**官方 SDK 源码**（GitHub `larksuite/oapi-sdk-go`）作为最强一手：SDK 由飞书官方维护、自动生成，其常量逐字就是 API 契约。

### 1.2 官方 Go SDK 常量逐字（最强一手）

来源文件：`service/bitable/v1/model.go`
URL：<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go>

逐字常量块（`const (...)`，与 API 的 `AppTableField.type` 取值一致）：

```go
TypeText         = 1    // 文本
TypeNumber       = 2    // 数字
TypeSingleSelect = 3    // 单选
TypeMultiSelect  = 4    // 多选
TypeDateTime     = 5    // 日期
TypeCheckbox     = 7    // 复选框
TypeUser         = 11   // 人员
TypePhoneNumber  = 13   // 电话号码
TypeUrl          = 15   // 超链接
TypeAttachment   = 17   // 附件
TypeLink         = 18   // 单向关联
TypeFormula      = 20   // 公式
TypeDuplexLink   = 21   // 双向关联
TypeLocation     = 22   // 地理位置
TypeGroupChat    = 23   // 群组
TypeCreatedTime  = 1001 // 创建时间
TypeModifiedTime = 1002 // 最后更新时间
TypeCreatedUser  = 1003 // 创建人
TypeModifiedUser = 1004 // 修改人
TypeAutoSerial   = 1005 // 自动编号
```

> 备注：同一文件里另有一组 `TypeUpdateAppTableField*` 常量，值完全相同（`Text=1/Number=2/SingleSelect=3/MultiSelect=4/DateTime=5/Checkbox=7/User=11/PhoneNumber=13/Url=15/Attachment=17/Link=18/Formula=20/DuplexLink=21/Location=22/GroupChat=23/CreatedTime=1001/...`），是「更新字段」接口用的同值别名——两处互相印证，无冲突。

### 1.3 同一 SDK 的另一处枚举释义注释（补上 19=查找引用）

同一 `model.go` 里，字段过滤器 `FieldType *int // 用于过滤的字段类型` 的注释给出完整中文释义（一手，逐字）：

```
1：多行文本；2：数字；3：单选；4：多选；5：日期；7：复选框；11：人员；
13：电话号码；15：超链接；17：附件；18：单向关联；19：查找引用；20：公式；
21：双向关联；22：地理位置；23：群组；1001：创建时间；1002：最后更新时间；
1003：创建人；1004：修改人；1005：自动编号
```

要点：
- 这份释义**比常量块多一个 `19：查找引用`**（Lookup，无对应独立常量，因为它是由关联字段派生的引用类型）。
- 数字码 `6 / 8 / 9 / 10 / 12 / 14 / 16` **未被占用**（官方枚举里没有这些值），是历史空号，勿臆造。
- 常量块（1.2）与释义注释（1.3）在共同出现的码上**完全一致**，无冲突。

### 1.4 完整「字段类型 → 数字码」对照表（合并命名）

| 数字码 | 中文名 | 英文语义 | 一手依据 |
| --- | --- | --- | --- |
| 1 | 多行文本 / 文本 | Text | `TypeText = 1`（常量注释写「文本」，枚举释义写「多行文本」） |
| 2 | 数字 | Number | `TypeNumber = 2` |
| 3 | 单选 | Single select | `TypeSingleSelect = 3` |
| 4 | 多选 | Multi select | `TypeMultiSelect = 4` |
| 5 | 日期 / 日期时间 | Date/DateTime | `TypeDateTime = 5` |
| 7 | 复选框 | Checkbox | `TypeCheckbox = 7` |
| 11 | 人员 | User/Person | `TypeUser = 11` |
| 13 | 电话号码 | Phone number | `TypePhoneNumber = 13` |
| 15 | 超链接 | URL | `TypeUrl = 15` |
| 17 | 附件 | Attachment | `TypeAttachment = 17` |
| 18 | 单向关联 | Link (one-way) | `TypeLink = 18` |
| 19 | 查找引用 | Lookup reference | 仅见于枚举释义注释，无独立常量 |
| 20 | 公式 | Formula | `TypeFormula = 20` |
| 21 | 双向关联 | Duplex link (two-way) | `TypeDuplexLink = 21` |
| 22 | 地理位置 | Location | `TypeLocation = 22` |
| 23 | 群组 | Group chat | `TypeGroupChat = 23` |
| 1001 | 创建时间 | Created time | `TypeCreatedTime = 1001` |
| 1002 | 最后更新时间 | Modified time | `TypeModifiedTime = 1002` |
| 1003 | 创建人 | Created user | `TypeCreatedUser = 1003` |
| 1004 | 修改人 | Modified user | `TypeModifiedUser = 1004` |
| 1005 | 自动编号 | Auto serial number | `TypeAutoSerial = 1005` |

---

## 2. 问题二：建字段接口请求体里 `type` 就是这些数字码吗？

**是。** 接口：`POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields`，请求体里的 `AppTableField.type`（整型）即上表数字码。

一手证据（官方 Go SDK 示例源码）：
URL：<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/sample/apiall/bitablev1/create_appTableField.go>

逐字（关键行）：

```go
// POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields
req := larkbitable.NewCreateAppTableFieldReqBuilder().
    AppToken("appbcbWCzen6D8dezhoCH2RpMAh").
    TableId("tblsRc9GRRXKqhvW").
    ClientToken("fe599b60-450f-46ff-b2ef-9f6675625b97").
    AppTableField(larkbitable.NewAppTableFieldBuilder().
        FieldName("字段名称").
        Type(0).                // 占位示例值，0 不是有效类型；有效值见第 1 节枚举
        Property(...).
        Description(...).
        IsPrimary(true).
        FieldId("fldWJyCkFQ").
        UiType("Progress").
        IsHidden(false).
        Build()).
    Build()
```

> 注意：示例里 `Type(0)` 是代码生成器的占位值（不是合法字段类型）。真正取值必须用第 1 节枚举。请求体 JSON 形如 `{"field_name":"...","type":<数字码>,"ui_type":"...","property":{...}}`。

补证：Python SDK 的 `AppTableField._types` 明确声明 `"type": int`（即 `type` 是整型，与数字码一致）：
URL：<https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/bitable/v1/model/app_table_field.py>（逐字：`_types = {"field_name": str, "type": int, "property": AppTableFieldProperty, "description": AppTableFieldDescription, "is_primary": bool, "field_id": str, "ui_type": str, "is_hidden": bool}`）。

其它建字段细节（`field_name`/`ui_type`/`property`/`is_primary` 等）本仓既有笔记已一手坐实，见 [`docs/research/feishu-bitable-create-request-bodies.md:95-117`](F:/ai_work/docs/research/feishu-bitable-create-request-bodies.md#L95-L117)，此处不重复。

---

## 3. 问题三：官方 SDK 源码里的逐字常量定义

已给出，见 **第 1.2 节**（Go SDK `service/bitable/v1/model.go` 常量区逐字抄录）。这是本笔记认定的**最强一手证据**：

- 官方仓库：<https://github.com/larksuite/oapi-sdk-go>
- 逐字文件：<https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go>
- 关键常量：`TypeText = 1`、`TypeNumber = 2`、`TypeSingleSelect = 3`、`TypeMultiSelect = 4`、`TypeDateTime = 5`、`TypeCheckbox = 7`、`TypeUser = 11`、`TypePhoneNumber = 13`、`TypeUrl = 15`、`TypeAttachment = 17`。

Python SDK 侧：字段类型常量不以「数字常量名」形式出现，`type` 只是一个 `int`（见第 2 节 `app_table_field.py` 的 `_types`）；Python SDK 不导出 `FieldTypeText = 1` 这类具名常量，因此**「逐字具名常量」证据只能取自 Go SDK**（这也是本仓既有笔记一贯的做法）。Python 侧可用的旁证是 `type` 为 int，且回包/请求模型一致。

---

## 4. 问题四：多行文本 vs 文本、日期 vs 日期时间 的细分

### 4.1 「多行文本」与「文本」是否不同数字码？—— **共用一个码 `1`**

- Go SDK 常量块：`TypeText = 1 // 文本`。
- Go SDK 枚举释义注释：`1：多行文本`（见第 1.3 节）。两处指向同一码 `1`，只是措辞一个叫「文本」一个叫「多行文本」。
- **官方 FieldType 枚举里没有为「单行文本」单独留一个数字码**。单行/多行/邮箱/条码的差异在 `ui_type` 上，而它们的 `type` 都是 `1`：
  - `UiTypeText = "Text"`、`UiTypeEmail = "Email"`、`UiTypeBarcode = "Barcode"`（Go SDK `model.go` 的 `UiType*` 常量块，逐字，见第 1.2 节同文件的 `const ( UiTypeText = "Text" ... )`）。
- 结论：我们叫 `text` 的列，用 `type=1` 正确。若需要单行/邮箱/条码等细分，靠 `ui_type` 指定，不是靠另一个数字码。

### 4.2 日期是否分「日期」与「日期时间」？—— **共用 `5`**

- 只有 `TypeDateTime = 5 // 日期`（枚举释义「5：日期」）。**没有单独的「日期时间」数字码**——飞书把「日期」与「日期时间」视为同一字段类型的两种显示样式（在 `property`/`ui_type` 层面控制），数字码统一为 `5`。
- 结论：我们叫 `date` 的列，`type=5` 正确。

### 4.3 我们这 5 类精确对齐

| 我们（engine 规范名） | 飞书 FieldType 数字码 | 飞书 UI 类型（ui_type，可选） | 一手 |
| --- | --- | --- | --- |
| text | 1 | `Text` | `TypeText = 1` / `UiTypeText` |
| number | 2 | `Number` | `TypeNumber = 2` / `UiTypeNumber` |
| date | 5 | `DateTime` | `TypeDateTime = 5` / `UiTypeDateTime` |
| checkbox | 7 | `Checkbox` | `TypeCheckbox = 7` / `UiTypeCheckbox` |
| single_select | 3 | `SingleSelect` | `TypeSingleSelect = 3` / `UiTypeSingleSelect` |

---

## 5. 问题五：不同官方页面/版本间的冲突

- **未发现冲突**。Go SDK 常量块、Go SDK 枚举释义注释、`TypeUpdateAppTableField*` 同值别名三处互相印证；我们代码里 5 个码全部落在这套枚举内。
- 唯一「缺口」不是冲突而是：`open.feishu.cn` 文档页是 SPA，正文取不到（已实测 HTTP 200 仅标题），所以**官方文档的文字表述本身未能逐条取到正文**；数字码依据来自官方 SDK 源码（一手）。这一点如实标注为「文档页正文未验证，SDK 源码已验证」。
- 另注：SDK 里 `TypeText` 注释为「文本」、枚举释义为「多行文本」，属**同一码 `1` 的两种叫法**，非冲突。

---

## 6. 对修复的影响

1. **`workbench/lib/feishu-adapter.js` 里 `FEISHU_CODE_BY_NAME` 的 5 个码全部正确，无需改码。** 逐个核实结论：
   - `text: 1` → ✅ 正确（`TypeText = 1`；官方枚举「1：多行文本」）。
   - `number: 2` → ✅ 正确（`TypeNumber = 2`，原本已 verified，维持）。
   - `date: 5` → ✅ 正确（`TypeDateTime = 5`，注释「日期」）。
   - `checkbox: 7` → ✅ 正确（`TypeCheckbox = 7`）。
   - `single_select: 3` → ✅ 正确（`TypeSingleSelect = 3`）。
2. **要改的是 `verified` 标记，不是数字码。** 把 `text/date/checkbox/single_select` 四条的 `verified: false` 翻成 `true`，并更新 `note` 附上一手 URL（见第 7 节建议表）。这是解开 `scripts/feishu-adapter.js --live` 的 `unverifiedTypes` 护栏的真正动作——护栏按 `verified` 拦，不是按码拦。
3. **把 note 里的「官方页 SPA 抓不到」升级为「已由官方 Go SDK 常量坐实」。** 之前 text/date/checkbox/single_select 是「按惯例记、未验证」的猜测；现在有 `TypeText=1 / TypeDateTime=5 / TypeCheckbox=7 / TypeSingleSelect=3` 的逐字常量，标记应从「未验证」改「已验证（SDK 源码）」。
4. **`--live` 真跑一次性放行的最小改动**：翻四个 `verified` 即可；不必再传 `--allow-unverified-types` 绕过护栏。（是否保留该逃生开关由主 seam 决定，但修复后正常路径不应再需要它。）
5. **单行/多行文本、日期/日期时间的细分不在数字码层面**，如果后续 engine 需要区分（如单行 vs 多行、纯日期 vs 日期时间），要扩的是 `ui_type`/`property`，不要把 `text` 改成别的数字码，也不存在「日期时间=某独立码」。

---

## 7. 建议的 FEISHU_CODE_BY_NAME 表

逐字给出每个类型应填的 `{code, verified, note}`（note 内附一手 URL）。这份可直接替换 `workbench/lib/feishu-adapter.js:38-44` 的现有表：

```js
const FEISHU_CODE_BY_NAME = {
  text:   { code: 1, verified: true, note: '文本/多行文本；官方 Go SDK TypeText = 1（枚举释义「1：多行文本」） https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go' },
  number: { code: 2, verified: true, note: '数字；票 #5 实测 + 官方 Go SDK TypeNumber = 2 https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go' },
  date:   { code: 5, verified: true, note: '日期（含日期时间显示样式）；官方 Go SDK TypeDateTime = 5 https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go' },
  checkbox: { code: 7, verified: true, note: '复选框；官方 Go SDK TypeCheckbox = 7 https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go' },
  single_select: { code: 3, verified: true, note: '单选；官方 Go SDK TypeSingleSelect = 3 https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go' }
};
```

**映射速查（名字 → 码，verified 全 true）**：

| name | code | verified | 一手 URL |
| --- | --- | --- | --- |
| text | 1 | ✅ true | <https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/bitable/v1/model.go>（`TypeText = 1`） |
| number | 2 | ✅ true | 同上（`TypeNumber = 2`） |
| date | 5 | ✅ true | 同上（`TypeDateTime = 5`） |
| checkbox | 7 | ✅ true | 同上（`TypeCheckbox = 7`） |
| single_select | 3 | ✅ true | 同上（`TypeSingleSelect = 3`） |

---

## 8. 仍未验证 / 局限（如实标注）

- **`open.feishu.cn` 官方文档页正文未取到**：`https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/guide` 为 SPA，抓取 HTTP 200 但只有标题，正文（含枚举文字表述）未能逐字取到 → 该页面的「文字描述」未验证。数字码结论改由官方 Go SDK 源码坐实。
- **Python SDK 无「逐字具名数字常量」**：`lark_oapi` 的字段 `type` 只是 `int`，不导出 `FieldTypeText = 1` 这类常量，故 Python 侧仅作 `type: int` 的类型旁证，不作数字码一手。
- **`19：查找引用` 无独立 Go 常量**：仅见于枚举释义注释，属派生类型；若将来要用，需以官方该注释为准（已逐字记录在第 1.3 节），不臆造常量。
- **本笔记的实测边界**：只静态核对了 SDK 源码与文档页可达性，**未真正调 API 建字段做端到端实测**（本轮不改其它文件、不发起真实请求）。`number=2` 的端到端实测来自票 #5（既有记录），其余四个是「SDK 源码一级证据」，属静态一手，非运行期实测——这一点与票 #5 的区别已在 note 中体现。
