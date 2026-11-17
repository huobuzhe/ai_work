> **存放理由**：循 `docs/research/` 既有约定，与首份 [spreadsheet-platform-capabilities.md](<docs/research/spreadsheet-platform-capabilities.md>)、第二份 [official-skill-mcp-button-reuse.md](<docs/research/official-skill-mcp-button-reuse.md>) 并列，本篇作为仓内第三份研究笔记放在此处。

# 云端 adapter：原生公式「写入 → 平台重算 → 读回计算值」能力核查

> 本文是一次 AFK 事实核查，只核实「云端 adapter 能否写入原生公式、让平台重算、并读回计算结果」，不做决策；取舍在「## 对决策的影响」里仅列为供使用者判断的信息。背景：首份笔记已确认飞书与腾讯文档有建表 + 写值 API，但未查「写公式 → 重算 → 读回计算值」这一环；本仓库地图 #2 的共识是本地侧「自定义函数计算」= 把目标表格的原生公式写进输出列、由表格引擎求值（本机 univer `executeCalculation()` / office-recalculate 的 LibreOffice 重算闭环），云端 adapter 是否同样可行尚未验证、且按共识要等真实凭据冒烟测试。本篇只补这一环，不改地图 #2 正文、不改任何 issue。

## 取证口径

- 只采一手来源：官方文档 / 官方 API 参考 / 官方 SDK 源码（`github.com/larksuite/oapi-sdk-go`、`github.com/larksuite/oapi-sdk-python`）。
- 每条断言后跟一手来源 URL；页面正文取不到写「未验证」并说明原因，**不补二手转述**（第三方文档镜像、腾讯文库用户上传文档、搜索引擎摘要一律不作为证据）。
- 「三家平台」按本任务 ①②③ 的三个公式引擎取值：飞书电子表格 Sheets、飞书多维表格 Bitable、腾讯文档在线表格；Excel 为参照基线。
- 可达性：飞书开放平台文档页 `open.feishu.cn` / `open.larksuite.com` / `open.larkoffice.com` 与帮助中心 `www.feishu.cn/hc` 在本环境一律是 SPA，HTTP 200 但只返回页面标题，正文取不到（与首份笔记第 5 行「取证口径」一致）；`docs.qq.com`、`support.microsoft.com`、GitHub `raw.githubusercontent.com` / `github.com/larksuite/*` 可取回全文。
- 全部「未验证」项汇总见文末表格，共 **9** 条。

## ① 飞书电子表格 sheets-v3「向单个范围写入数据」

**（已验证）飞书 sheets 的单元格数据模型原生支持「公式」与「公式结果」两个字段。** 官方 Go SDK `service/sheets/v3/model.go` 定义 `type CellValue struct` 含 `Formula *Formula json:"formula,omitempty"`（第 761 行），`type Formula struct`（第 2652 行）三字段逐字为 `Formula *string json:"formula,omitempty" // 公式`（builder 示例值 `=SUM(A:A)`）、`FormulaValue *string json:"formula_value,omitempty" // 公式结果`（builder 示例值 `123`）、`AffectedRange *string json:"affected_range,omitempty" // 公式影响的范围`（builder 示例值 `Xkhr2d!A1:B2`）（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/model.go>）。

**（已验证）富文本区域可承载上述 CellValue。** `RichTextValueRange.Values [][][]*CellValue json:"values,omitempty" // 数据`（第 4447 行）、`PlainTextValueRange.Values [][]string json:"values,omitempty" // 数据`（第 3877 行）（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/model.go>）。

**（已验证）查找/替换接口区分「公式」与「单元格内容」。** `FindCondition.IncludeFormulas *bool json:"include_formulas,omitempty" // 是否仅搜索单元格公式，默认值为 false`（第 2351 行）、`FindReplaceResult.MatchedFormulaCells []string json:"matched_formula_cells,omitempty" // 符合查找条件的含有公式的单元格数组`（第 2449 行）（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/model.go>）。

**（已验证，负面）官方 Go SDK 的 sheets `v3` 资源清单里没有「向单个范围写入/读取数据」资源，也没有独立重算资源。** `service/sheets/` 下只有 `service.go` 与 `v3/`（来源：<https://github.com/larksuite/oapi-sdk-go/tree/v3_main/service/sheets>）；`service/sheets/v3/resource.go` 的 `V3` 资源清单只有 `Spreadsheet / SpreadsheetSheet / SpreadsheetSheetFilter / SpreadsheetSheetFilterView / SpreadsheetSheetFilterViewCondition / SpreadsheetSheetFloatImage`（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/resource.go>）；`model.go` 中带 `body:""` 的请求体只有 Spreadsheet / UpdateSpreadsheetProperties / Find / MoveDimension / Replace / CreateSheetFilter / UpdateSheetFilter / FilterView / FilterViewCondition / FloatImage，无 values 请求体（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/model.go>）。

**未验证 #1：「向单个范围写入数据」是否接受 `=A2*B2` 这类公式字符串并被平台求值。** 官方 API 页是 SPA，本环境只取回标题「向单个范围写入数据 - 服务端 API - 飞书开放平台」，正文取不到（来源：<https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range?lang=zh-CN>）；「支持写入数据类型」页同样只返回标题（来源：<https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-types-supported-by-sheets?lang=zh-CN>）。官方 SDK 只证明数据模型有 `Formula`/`FormulaValue` 类型，不证明该写入接口会把纯字符串当公式求值，也不证明该接口位于 `sheets/v3`（文档栏目叫 `sheets-v3`，但 SDK 只有 `service/sheets/v3` 且其中无 values 资源，版本/命名口径不一致）。

**未验证 #2：是否有「触发重算」接口。** 「向单个范围写入数据」/「支持写入数据类型」官方页正文取不到（来源：<https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range?lang=zh-CN>）；SDK `v3` 资源清单无重算资源（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/resource.go>）。缺一手正文，不能据此断言平台有或没有重算接口。

**未验证 #3：是否有「读取计算值 / valueRenderOption」类接口及参数。** 「读取单个范围」官方页是 SPA，只取回标题（来源：<https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/reading-a-single-range?lang=zh-CN>）；SDK `v3` 无 values 资源、无 `valueRenderOption` / 重算查询参数（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/model.go>）。SDK 的 `FormulaValue`「公式结果」字段暗示读取可带结果，但哪个接口返回、是否需要参数，一手正文取不到。

## ② 飞书多维表格 bitable「公式字段」

**（已验证）bitable 有「公式字段」类型，枚举值 20。** 官方 Go SDK `service/bitable/v1/model.go` 前部 const 块逐字含 `TypeFormula = 20 // 公式`、`UiTypeFormula = "Formula" // 公式`、`TypeUpdateAppTableFieldFormula = 20 // 公式`（更新字段用）（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go>）；过滤条件 `FieldType` 注释枚举含 `- 20：公式`（来源同上）；`AppTableCreateHeader` 建表初始索引字段注释「索引字段仅支持以下类型：… - 20：公式 …」（来源同上）。**字段类型枚举就在该 SDK 源码的 const 块**；SDK 注释另指向官方「字段编辑指南」页 <https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-field/guide>，但该页正文本次未取回（SPA 域）。官方 Python SDK 同证：`AppTableField.type` 为 `int`（来源：<https://github.com/larksuite/oapi-sdk-python/blob/v2_main/lark_oapi/api/bitable/v1/model/app_table_field.py>）。

**（已验证）可通过「新增字段」写入公式表达式。** `AppTableFieldProperty` 含 `FormulaExpression *string json:"formula_expression,omitempty" // 公式字段的表达式`，builder 方法 `func (builder *AppTableFieldPropertyBuilder) FormulaExpression(formulaExpression string) *AppTableFieldPropertyBuilder`（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go>）；配套 `Formatter *string // 数字和公式字段的显示格式`、`Type *AppTableFieldPropertyType // 设置公式字段的数据类型`（注释：非所有多维表格都支持，需按「获取多维表格元数据」返回的 `formula_type` 判断，等于 2 时需设置该字段）、`AppTableFieldPropertyType.DataType *int // 公式字段对应的数据类型`（来源同上）；新增字段接口 `POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields`（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go>）。SDK 注释指向的一手帮助中心页 <https://www.feishu.cn/hc/zh-CN/articles/360049067853-%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E5%85%AC%E5%BC%8F%E5%AD%97%E6%AE%B5%E6%A6%82%E8%BF%B0> 为 SPA，正文取不到。

**（已验证，结构性观察）记录侧的公式字段值未做类型化声明。** `AppTableRecord.Fields map[string]interface{} json:"fields,omitempty" // 记录字段`（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go>）；记录接口 `Create / BatchCreate / BatchGet / List / Search / Update` 均在（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go>）。SDK 全文中「只读 / 计算值 / 计算结果 / 不可写」的检索只命中「分享 Meta Token(可读不可写)」等无关行，没有「公式字段计算结果随记录返回」的声明（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go>）。注意 bitable 的公式是**字段级表达式**（挂在 `AppTableFieldProperty.formula_expression` 上），与 sheets 的单元格公式是两种模型。

**未验证 #4：能否「新增记录写公式」并把公式字段的计算结果「读回」。** 官方 API 文档页为 SPA，正文取不到（来源：<https://open.larksuite.com/document/server-docs/docs/bitable-v1/bitable-structure>）；上述 SDK 源码只证明「新增字段可写公式表达式」，未声明记录写入支持公式、也未声明公式字段计算值随记录查询返回。

**未验证 #5：公式字段是否由平台自动重算、有无触发重算接口。** SDK `bitable/v1` 资源清单为 `App / AppBlockWorkflow / AppDashboard / AppRole / AppRoleMember / AppTable / AppTableField / AppTableFieldGroup / AppTableForm / AppTableFormField / AppTableRecord / AppTableView / AppWorkflow`，无独立「重算/计算」资源（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go>）；「自动重算」这一行为本身在一手正文里没有明确说明，故不写成已验证结论。

## ③ 腾讯文档 V3 `batchUpdate`

**（已验证，负面）V3 写侧 `CellValue` 不含公式字段，且 `updateRangeRequest` 明文限定只支持三种类型。** `request.html` 原文「**补充说明**：目前单元格支持的数据类型（CellValue）只包括：`text`、`link`、`number`」，Request 只含 `addSheetRequest`/`updateRangeRequest`/`deleteDimensionRequest`/`deleteSheetRequest`（来源：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html>）；`model/spreadsheet.html` 的 `CellValue` 字段为 `text`/`number`/`link`/`time`/`location`/`select`，无 `formula`（`DataType` 枚举 `DATA_TYPE_UNSPECIFIED`/`SELECT`/`TIME`/`LOCATION`/`STAR` 是「数据验证」类型，与公式无关）（来源：<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html>）。注：写侧限定 3 种、模型页列 6 种，两处口径不一致，但均不含公式。

**（已验证，负面）V3 没有重算接口，也没有读取计算值接口。** `overview.html` 的 V3「接口列表」只有 3 个——批量更新接口 / 工作表元数据查询接口 / 范围查询接口，无重算接口（来源：<https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html>）；`get_range.html`「查询参数：无」（无 `valueRenderOption`、无重算参数），响应 `gridData.values[].cellValue` 无「计算值/公式结果」字段（来源：<https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html>）；`batchUpdate` 端点 `POST /openapi/spreadsheet/v3/files/{fileId}/batchUpdate`，单次操作 ≤5（来源：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html>）；已废弃的 V2 `PUT /openapi/sheetbook/v2/{bookID}/values/{range}` 请求体 `values: array(array(string))`，同样无公式类型声明（来源：<https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html>）。

**未验证 #6：以 `text` 写入 `=A2*B2` 字符串后，是否被表格引擎当作公式解释并求值。** V3 官方 API 参考未说明该行为；写侧明文只支持 `text`/`link`/`number`（来源：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html>），且 `overview.html` 正文只泛述「在线表格…支持数据的存储、计算和展示」（来源：<https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html>），未给出「=前缀文本按公式求值」的契约。

## ④ 三家平台公式语法 / 函数集与 Excel 差异的官方说明

**（已验证，仅基线）Excel 自身的官方函数清单可取回全文，但不是「与飞书/腾讯差异」的对比说明。** `support.microsoft.com`「Excel 函数（按字母顺序）」列出 ABS…ZTEST 全量函数，适用 Microsoft 365 / 2024 / 2021 / 2019 / 2016 / Web App，带「版本标记表示介绍函数的 Excel 版本」，多处注「此函数在 Excel 网页版中不可用」，并说明「公式和某些 Excel 工作表函数的计算结果在采用 x86 或 x86-64 架构的 Windows PC 与采用 ARM 架构的 Windows RT PC 之间略有不同」（来源：<https://support.microsoft.com/zh-cn/excel/excel-functions-alphabetical>）。

**（已验证，一手可达性）飞书 SDK 注释把公式字段的写法指向帮助中心，但该页正文取不到。** `FormulaExpression` 注释「参考[飞书帮助中心文档]了解如何设置公式」，链接为 <https://www.feishu.cn/hc/zh-CN/articles/360049067853-%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E5%85%AC%E5%BC%8F%E5%AD%97%E6%AE%B5%E6%A6%82%E8%BF%B0>（来源：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go>）。

**未验证 #7：飞书电子表格 Sheets 的公式语法 / 函数集与 Excel 差异的官方说明。** 官方帮助中心与 API 页均为 SPA、只返回标题（来源：<https://www.feishu.cn/hc/zh-CN/academy/learn_functions_of_Bitable>、<https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-types-supported-by-sheets?lang=zh-CN>），正文取不到；不补二手转述。

**未验证 #8：飞书多维表格 Bitable 的公式语法 / 函数集与 Excel 差异的官方说明。** 帮助中心「使用多维表格公式字段捷径」「多维表格，一学就会｜函数篇」「多维表格公式字段概述」均只返回标题（来源：<https://www.feishu.cn/hc/zh-CN/articles/962259873941-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E5%85%AC%E5%BC%8F%E5%AD%97%E6%AE%B5%E6%8D%B7%E5%BE%84>、<https://www.feishu.cn/hc/zh-CN/academy/learn_functions_of_Bitable>、<https://www.feishu.cn/hc/zh-CN/articles/360049067853-%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E5%85%AC%E5%BC%8F%E5%AD%97%E6%AE%B5%E6%A6%82%E8%BF%B0>），正文取不到。

**未验证 #9：腾讯文档在线表格的公式语法 / 函数集与 Excel 差异的官方说明。** 已检索 `docs.qq.com` 开放平台，只命中 V3 资源模型 / V2 参数 / 插件 Sheet 对象页（来源：<https://docs.qq.com/open/document/app/openapi/v3/sheet/model/spreadsheet.html>、<https://docs.qq.com/open/document/app/openapi/v2/sheet/common/params.html>、<https://docs.qq.com/open/document/addon/addon-api/docs-app-services/sheet/sheet.html>），未找到官方公式函数列表 / 差异说明页；腾讯文库用户上传文档不是官方 API/产品说明，不作证据。

## 未验证项汇总（共 9 条）

| # | 未验证的断言 | 原因 | 一手来源 URL |
|---|---|---|---|
| 1 | 飞书 sheets「向单个范围写入数据」是否接受 `=A2*B2` 并求值 | 官方 API 页 SPA，只返回标题；SDK 只证数据模型有 Formula 字段 | <https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range?lang=zh-CN> |
| 2 | 飞书 sheets 是否有「触发重算」接口 | 官方页 SPA；SDK v3 资源清单无重算资源 | <https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/resource.go> |
| 3 | 飞书 sheets 是否有「读取计算值 / valueRenderOption」接口及参数 | 「读取单个范围」页 SPA；SDK v3 无 values 资源 | <https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/reading-a-single-range?lang=zh-CN> |
| 4 | bitable 能否「新增记录写公式」并读回公式字段计算结果 | 官方 API 页 SPA；SDK 无「公式字段计算值随记录返回」声明 | <https://open.larksuite.com/document/server-docs/docs/bitable-v1/bitable-structure> |
| 5 | bitable 公式字段是否平台自动重算、有无触发重算接口 | SDK 资源清单无重算资源；一手正文未说明自动重算 | <https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go> |
| 6 | 腾讯 V3 以 `text` 写 `=A2*B2` 是否被当公式求值 | V3 API 参考未说明该行为 | <https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html> |
| 7 | 飞书 Sheets 公式语法/函数集与 Excel 差异的官方说明 | 帮助中心/API 页 SPA，正文取不到 | <https://www.feishu.cn/hc/zh-CN/academy/learn_functions_of_Bitable> |
| 8 | 飞书 Bitable 公式语法/函数集与 Excel 差异的官方说明 | 帮助中心页 SPA，正文取不到 | <https://www.feishu.cn/hc/zh-CN/articles/962259873941-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E5%85%AC%E5%BC%8F%E5%AD%97%E6%AE%B5%E6%8D%B7%E5%BE%84> |
| 9 | 腾讯文档在线表格公式语法/函数集与 Excel 差异的官方说明 | 未找到官方公式函数列表/差异页 | <https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html> |

## 对决策的影响

1. **第一版云端公式能力契约建议维持「待真实凭据冒烟测试」，不据现有文档定稿**（信息，非决定）。一手源码坐实的只有三件：飞书 sheets 单元格数据模型含 `formula` + `formula_value`（公式结果）字段、飞书 bitable 有公式字段类型 `TypeFormula = 20` 且新增字段可写 `formula_expression`、腾讯 V3 写侧 `CellValue` 不含公式字段；而「写入 `=A2*B2` 是否被求值 / 平台是否重算 / 计算值能否读回」这三个闭环环节，在三家一手正文里都没有可验证的接口说明（9 项未验证）。这与地图 #2「等真实凭据冒烟测试」的共识一致。
2. **冒烟测试的最小验证集可把 9 项未验证收敛成 4 个可执行动作**：(a) 飞书 sheets 用「向单个范围写入数据」写 `=A2*B2` 再读回，看是公式文本还是计算值；(b) 飞书 bitable 建公式字段后查记录，看计算值是否随记录返回；(c) 腾讯 V3 以 `text` 写 `=A2*B2`，看是否被解释求值；(d) 三家各测一次「改源数据后计算值是否自动刷新」，判定重算是否由平台托管。
3. **建议把「工作台算好写值」保留为第一版默认路径 / 降级路径**。云端写入侧已见硬约束：腾讯 V3 明文只支持 text/link/number、无重算接口、无计算值读取接口；飞书 sheets 写公式求值、bitable 公式结果读回均未验证。在冒烟测试通过前，用本机 univer `executeCalculation()` / office-recalculate 的 LibreOffice 重算闭环把结果算好、再以「值」写入云端，是三家都能被一手写值 API 保证的路径（首份笔记已确认建表 + 写值 API 可用）。
4. **契约分层与措辞（供使用者取舍）**：把云端 adapter 能力拆成「写值（已由建表 + 写值 API 保证）」与「写原生公式 / 平台重算 / 读回计算值（待冒烟测试）」两层；即便冒烟证明某家可行，也须注意飞书 sheets（单元格公式）与 bitable（字段级公式表达式）是两种不同公式模型，且三家函数集与 Excel 差异无官方说明（④ 全未验证），第一版不宜承诺「与 Excel 公式等价」。
