# 建表格 / 处理表格繁琐任务：平台能力一手事实

> **存放说明**：本仓库此前无研究笔记约定，`docs/` 下只有 `docs/agents/` 这一既有习惯目录，故循 `docs/` 习惯新建 `docs/research/`，把本篇作为仓内第一份研究笔记放在此处（依据：[AGENTS.md](<F:/ai_work/AGENTS.md>)、[docs/agents/issue-tracker.md](<F:/ai_work/docs/agents/issue-tracker.md>)、[docs/agents/domain.md](<F:/ai_work/docs/agents/domain.md>)）。

**取证口径**：只采官方文档、官方 API 参考、官方 SDK/仓库源码、本 harness 自带 SKILL.md（均为一手）。凡一手页面正文取不到、或各一手来源互相矛盾之处，一律写「未验证」并说明原因，不补二手转述。飞书 `open.feishu.cn` / `open.larksuite.com` 的文档页是 SPA，本环境的抓取器只能取回页面标题（例如 [云文档常见问题](https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN) 只返回「云文档常见问题 - 服务端 API - 飞书开放平台」），所以这些页的接口名/URL 取自官方站点索引与官方 SDK 源码，正文里的逐条参数标为未验证；`docs.qq.com`、`learn.microsoft.com`、`support.microsoft.com`、`readthedocs.io`、`aily.feishu.cn` 的官方页已能取回全文。本机 SKILL.md 没有公开 URL，用绝对路径作为 Markdown 链接目标。

## 一句话结论

飞书与腾讯文档都公开了「建表 → 加字段 / 写记录 / 写单元格」的 API（飞书需自建应用 `app_id`/`app_secret` + `tenant_access_token` 或 `user_access_token` + 文档协作权限与 API scope，见 [飞书创建多维表格](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create?lang=zh-CN)、[自建应用获取 tenant_access_token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal?lang=zh-CN)、[API 权限列表](https://open.feishu.cn/document/ukTMukTMukTM/uYTM5UjL2ETO14iNxkTN/scope-list?lang=zh-CN)；腾讯文档需开发者注册、应用审核、用户 OAuth2 授权与 scope 审核，见 [开放接口](https://docs.qq.com/open/document/app/)、[接入教程](https://docs.qq.com/open/document/app/get_started.html)、[应用权限](https://docs.qq.com/open/document/app/scope.html)），本地 `.xlsx` 与本机 harness 的 Univer / Office 技能栈可在零云凭据下覆盖同类建表、加字段、写值与公式计算（见 [univer/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer/SKILL.md>)、[univer-base/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer-base/SKILL.md>)、[office-xlsx/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-xlsx/SKILL.md>)），但「输入框输入一句话 → 生成可复用函数 → 对数据计算」在一手先例里尚无「任意自然语言直接编译成命名函数」的产品形态，最接近的是手写公式命名、动作录制加按钮、JavaScript 自定义函数、预编排字段捷径与 MCP 工具编排（见 [LAMBDA function](https://support.microsoft.com/en-us/excel/functions/lambda-function)、[Office Scripts in Excel](https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel)、[飞书 aily 字段捷径使用指南](https://aily.feishu.cn/hc/1u7kleqg_hp4exotp)、[腾讯文档 MCP 概述](https://docs.qq.com/open/document/mcp/)），因此可定「本地优先、云端可选适配」，仍待定的是自然语言到函数的编译边界与承载介质。

---

## 1. 飞书（Feishu / Lark）开放平台

### 1.1 能否用 API 建表

- **能建多维表格（Bitable）**：官方接口「创建多维表格 / Create App」，在指定文件夹创建一个多维表格并包含一个空白数据表（官方页：[创建多维表格](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create?lang=zh-CN)、[Lark 国际版 Create App](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app/create)）；官方 SDK 源码中的创建入口为 `POST /open-apis/bitable/v1/apps`（[api_bitable_app_create.go](https://github.com/chyroc/lark/blob/master/api_bitable_app_create.go)）。
- **能建电子表格（Sheets）**：官方接口「创建电子表格 / Create a spreadsheet」，在云空间指定目录下创建电子表格、可自定义标题、**不支持带内容创建表格**（官方页：[创建电子表格](https://open.feishu.cn/document/server-docs/docs/sheets-v3/spreadsheet/create?lang=zh-CN)、[Lark 国际版 Create a spreadsheet](https://open.larksuite.com/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/sheets-v3/spreadsheet/create)）。「创建表单时不支持带内容」这一限制在国际版官方页也有对应表述（[Create a spreadsheet](https://open.larksuite.com/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/sheets-v3/spreadsheet/create)）。
- 官方教程明确以「将外部销售额数据同步到电子表格，并对销售额进行总额统计」为场景调用云文档 API，说明建表 + 写入 + 统计是官方支持的一串动作（[基于电子表格的销售统计 · 简介](https://open.feishu.cn/document/sales-statistics-base-on-spreadsheets/sales-statistics-based-on-sheets?lang=zh-CN)）。
- **未验证**：创建电子表格接口的确切 HTTP 方法与请求体字段清单（官方页 SPA 正文未取到；只能确认其官方 URL 与「不支持带内容创建」的约束，见 [创建电子表格](https://open.feishu.cn/document/server-docs/docs/sheets-v3/spreadsheet/create?lang=zh-CN)）。

### 1.2 加数据表 / 加字段 / 写记录 / 写单元格

| 动作 | 官方 API 名称 | 官方 URL |
| --- | --- | --- |
| 新增数据表 | 新增一个数据表 | [app-table/create](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table/create?lang=zh-CN) |
| 新增字段 | 新增字段 | [app-table-field/create](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/create?lang=zh-CN) |
| 新增单条记录 | 新增记录 | [app-table-record/create](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create?lang=zh-CN) |
| 批量新增记录 | 新增多条记录 | [app-table-record/batch_create](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/batch_create?lang=zh-CN) |
| 向电子表格区域写值 | 向单个范围写入数据 | [write-data-to-a-single-range](https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range?lang=zh-CN) |
| 追加 / 插入数据 | 追加数据 / 插入数据 | [append-data](https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/append-data?lang=zh-CN)、[prepend-data](https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/prepend-data?lang=zh-CN) |

- 官方「新增字段」页的前提条件原文：「调用此接口前，请确保当前调用身份（tenant_access_token 或 user_access_token）已有多维表格的编辑等文档权限，否则接口将返回 HTTP 403 或 400 状态码」（[新增字段](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/create?lang=zh-CN)）；「新增记录」页有同样的前提条件（[新增记录](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create?lang=zh-CN)）。
- 官方「插入数据」「追加数据」页分别要求调用身份已有电子表格的编辑、或阅读与编辑等文档权限，否则返回 HTTP 403 或 400（[插入数据](https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/prepend-data?lang=zh-CN)、[追加数据](https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/append-data?lang=zh-CN)）。
- 批量写记录的资源路径为 `/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create`（官方 SDK 源码注释，[api_bitable_record_batch_create.go](https://github.com/chyroc/lark/blob/master/api_bitable_record_batch_create.go)）；新增字段的 SDK 入口见 [api_bitable_field_create.go](https://github.com/chyroc/lark/blob/master/api_bitable_field_create.go)。
- 电子表格「向单个范围写入数据」的官方英文说明：写入会覆盖范围内已有数据，单次最多 5,000 行 × 100 列，单单元格不超过 50,000 字符（[Lark 国际版 Write data to a single range](https://open.larksuite.com/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range)）。
- **未验证**：批量新增记录的单次条数上限。官方 SDK 源码注释写「单次调用最多新增 1,000 条记录」（[api_bitable_record_batch_create.go](https://github.com/chyroc/lark/blob/master/api_bitable_record_batch_create.go)），另一份 SDK 分支注释写 500 条（[fengchenggang1995/lark · api_bitable_record_batch_create.go](https://github.com/fengchenggang1995/lark/blob/master/api_bitable_record_batch_create.go)），数值不一致；官方页 [新增多条记录](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/batch_create?lang=zh-CN) 为 SPA、正文未取到，故不采信任一数值。
- **未验证**：`app-table/create`、`app-table-field/create`、`app-table-record/create` 三个接口的逐条请求参数与配额（官方页 SPA 正文未取到，仅确认接口名与官方 URL 存在，见上表各链接）。

### 1.3 应用凭据与鉴权方式

- 自建应用先拿 `app_id` + `app_secret`，通过「自建应用获取 tenant_access_token」接口换取 `tenant_access_token`（官方页：[自建应用获取 tenant_access_token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal?lang=zh-CN)）；Lark 国际版同名页写明「Custom apps can obtain `tenant_access_token` through this interface」（[Custom apps get tenant_access_token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal)）。
- 调用服务端 API 时把访问凭证放进请求 Header：`Authorization: Bearer <token>`；前置条件是完成创建应用、申请权限、获取访问凭证、设置 IP 白名单（官方页：[调用 API](https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/get-?lang=zh-CN)）。
- 两种身份都可用：多维表格相关接口的前提条件均并列写出 `tenant_access_token` 或 `user_access_token`（[新增字段](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/create?lang=zh-CN)、[新增记录](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create?lang=zh-CN)）；官方教程的「访问凭证（选择其一）」列也并列两者（[基于电子表格的销售统计 · 简介](https://open.feishu.cn/document/sales-statistics-base-on-spreadsheets/sales-statistics-based-on-sheets?lang=zh-CN)）。
- 用 `tenant_access_token` 访问多维表格前，应用必须已是该多维表格的所有者或协作者，否则调用失败；可通过「添加文档应用」把应用加为协作者，或用应用身份自己创建一篇多维表格后再调用（官方页：[多维表格概述](https://open.larksuite.com/document/server-docs/docs/bitable-v1/bitable-overview?lang=zh-CN)、[多维表格概述](https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview)）。这是文档级权限，与下面的 API scope 是两层。
- **未验证**：`user_access_token` 的完整 OAuth 授权流程细节与刷新机制（未从一手页面取到全文，[权限概述](https://open.feishu.cn/document/server-docs/docs/permission/overview?lang=zh-CN) 为 SPA 只返回标题）。

### 1.4 所需权限 scope

- 多维表格：`bitable:app` =「查看、评论、编辑和管理多维表格」，开通后可增删改行记录、列字段、视图、数据表及多维表格本身，身份支持「应用身份 / 用户身份」；`bitable:app:readonly` =「查看、评论和导出多维表格」（官方页：[API 权限列表](https://open.feishu.cn/document/ukTMukTMukTM/uYTM5UjL2ETO14iNxkTN/scope-list?lang=zh-CN)）。
- 电子表格：`sheets:spreadsheet` =「View, comment, edit and manage spreadsheets / 查看、评论、编辑和管理电子表格」；同一官方 FAQ 还列出 `docx:document:readonly`、`docx:document`、`docs:doc`、`sheets:spreadsheet`、`bitable:app` 等资源类型与权限的对应关系（官方页：[Docs FAQs / 云文档常见问题](https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN)）。
- 教程中「步骤一：创建并配置应用」要求在权限页搜索并启用 `drive:drive`（View, comment, edit, and manage all files in My Space）等权限，用于获取云空间根目录等文件操作（官方页：[步骤一：创建并配置应用](https://open.feishu.cn/document/sales-statistics-base-on-spreadsheets/step-1-create-and-configure-an-app?lang=zh-CN)）。
- 权限需申请并经审核：官方说明「申请权限，提交审核并获取批准后，才能调用对应的接口」（官方页：[任务概述](https://open.feishu.cn/document/task-v2/overview?lang=zh-CN)）。
- **未验证**：`sheets:spreadsheet` 是否单独足以覆盖「创建电子表格」「向单个范围写入数据」，以及这些接口是否需要额外 scope 组合。官方权限总表页为 SPA 正文未取到（[API 权限列表](https://open.feishu.cn/document/ukTMukTMukTM/uYTM5UjL2ETO14iNxkTN/scope-list?lang=zh-CN)），只能确认该 scope 的名称与语义（[云文档常见问题](https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN)），不能确认逐接口的权限矩阵。

---

## 2. 腾讯文档

**结论：题目预设的「官方无公开建表写入 API」不成立**——官方确实公开了「新建在线表格 + 写入单元格」的 Open API，下面给出依据；因此该判定在本篇中不适用，不写成结论。

### 2.1 建表与写入的官方接口

- 开放平台面向**第三方应用**提供基于 HTTPS 的 Open API，第三方应用在取得用户授权后可操作用户文档数据，采用 OAuth2.0 授权码方式；官方列举的能力包含「文件管理 API：新建一个文件」「在线表格 API：操作表格、获取表格内容」（官方页：[开放接口](https://docs.qq.com/open/document/app/)）。
- **新建在线表格**：`POST /openapi/drive/v2/files`，`type` 枚举含 `sheet`：在线表格（另有 `doc`、`form`、`slide`、`mind`、`flowchart`、`addon`、`smartsheet`）；官方请求体示例即 `type=sheet&title=test&folderID=FOLDER_ID`；响应含 `"type": "sheet"` 与 `"url": "https://docs.qq.com/sheet/DAAAAAAAAAAAA"`；权限说明为「本接口需要拥有以下任意一项权限：`scope.drive.creatable`」（官方页：[新建文档](https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html)）。
- **写入单元格（V2，已废弃）**：「更新区域内容」`PUT /openapi/sheetbook/v2/{bookID}/values/{range}`，请求体 `values` 为二维数组，限制「范围行数 <= 1000、总单元格数 <= 10000」，且无法更新不存在的表格区域；权限说明为 `scope.sheet`（官方页：[更新区域内容](https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html)、[V2 接口列表](https://docs.qq.com/open/document/app/openapi/v2/sheet/)）。
- **写入 / 结构变更（V3，推荐）**：「在线表格批量更新接口」`POST /openapi/spreadsheet/v3/files/{fileId}/batchUpdate`，单次请求操作数 <= 5，`addSheetRequest`、`deleteDimensionRequest` 等为 Request 类型；权限说明为 `scope.sheet` 或 `scope.sheet.editable`（官方页：[在线表格批量更新接口](https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html)、[Request 参数说明](https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html)）。
- 文件管理接口索引还列有新建/查询/重命名/移动/删除/生成副本/导入/导出/文件夹/权限/搜索/通知等（官方页：[文件管理接口索引](https://docs.qq.com/open/document/app/openapi/v2/file/)）；在线智能表 API 在视图、子表、记录概念上提供增删改查（官方页：[开放接口](https://docs.qq.com/open/document/app/)）。
- **未验证**：V2 在线表格接口「已废弃」之后，V3 是否完整覆盖 V2 的所有写入动作。官方 V3 介绍仍写「文件管理、在线表格、在线智能表格、在线收集表相关接口请查阅 OpenAPI V2 介绍」（[OpenAPI V3 介绍](https://docs.qq.com/open/document/app/openapi/v3/)），但 V3 下又确实存在在线表格批量更新接口（[在线表格批量更新接口](https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html)），两处口径不一致，需实测确认。
- **未验证**：scope 命名在官方各页之间不完全一致——接入教程的 Token 回包列 `scope.sheet.editable` / `scope.sheet.readonly`（[接入教程](https://docs.qq.com/open/document/app/get_started.html)），V3 批量更新页列 `scope.sheet` 或 `scope.sheet.editable`（[在线表格批量更新接口](https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html)），V2 更新区域内容页只列 `scope.sheet`（[更新区域内容](https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html)）；未找到一份把这些名字对齐的官方总表，故不擅自合并。

### 2.2 鉴权门槛与请求头

- 门槛链条：登录开放合作平台注册成为开发者 → 创建**第三方应用且应用审核成功** → 系统分配 `Client ID` / `Client Secret`（官方页：[接入教程](https://docs.qq.com/open/document/app/get_started.html)、[开放合作平台](https://docs.qq.com/open/developers/)）。
- 采用 OAuth2.0 授权码：授权链接 `https://docs.qq.com/oauth/v2/authorize?client_id=...&response_type=code&scope=all&state=...`，用户扫码/登录授权后回调带 5 分钟有效的 `code`，再用 `GET https://docs.qq.com/oauth/v2/token?...&grant_type=authorization_code&code=...` 换 Token；回包含 `access_token`、`expires_in: 2592000`、`refresh_token`、`scope`、`token_type: Bearer`、`user_id`（即 Open-Id）（官方页：[接入教程](https://docs.qq.com/open/document/app/get_started.html)、[授权流程](https://docs.qq.com/open/document/app/oauth2/)）。
- 调用 OpenAPI 时鉴权三元组放在**请求头**：`Access-Token`、`Client-Id`、`Open-Id`；官方明确 `Access-Token` 对应回包 `access_token`、`Open-Id` 对应回包 `user_id`（官方页：[接入教程](https://docs.qq.com/open/document/app/get_started.html)、[OpenAPI V3 请求规范说明](https://docs.qq.com/open/document/app/openapi/v3/)）。
- 权限审核门槛：应用需申请所需权限并经开放平台审核；官方把权限分为「免审核」与「需审核」两类，第三方应用默认开通免审核权限，需审核权限由管理员按**最少必要原则**勾选；授权页必须披露授权目的；权限变动后需让用户重新授权（官方页：[应用权限](https://docs.qq.com/open/document/app/scope.html)）。
- 频率 / 费用：自 2025-07-01 起每个应用可免费调用 20000 次 API，超出可采买 API 资源包（官方页：[开放接口 · 限免体验](https://docs.qq.com/open/document/app/)）。

### 2.3 开放范围：是否仅限企业 / 服务商

- **不是仅限企业 / 服务商**：主 Open API 面向「第三方应用」，条件是开发者注册 + 应用审核 + 用户 OAuth2 显式授权，未要求企业部署或服务商资质（官方页：[开放接口](https://docs.qq.com/open/document/app/)、[接入教程](https://docs.qq.com/open/document/app/get_started.html)）。
- 另有**企业专属通道**：「腾讯文档 SaaS 开放接口」明确「为 SaaS 部署的企业提供」，需在企业管理后台创建**自建应用**并获取 `Client ID` / `Client Secret`；其目录只列 文件管理、文档权限、在线智能表 API，并另列 MCP 概述与 Skill，**目录未列在线表格写入接口**（官方页：[SaaS 开放接口](https://docs.qq.com/open/document/saas/)）。
- **未验证**：SaaS 通道能否写入「在线表格（sheet）」。官方 SaaS 介绍只承诺「创建一个新的智能表格文档」「编辑智能表格中的所有内容」「编辑/查看在线文档中的内容」（[SaaS 开放接口](https://docs.qq.com/open/document/saas/)），未逐页核验其 在线智能表 / 文件管理 子页是否含 sheet 写入能力。

### 2.4 与「插件 / 技能」直接相关的官方形态

- 官方提供 **MCP**：「腾讯文档开放平台基于 Open API 的能力兼容 MCP 协议，需要登录 QQ/微信后方可操作对应账号的数据。你只需通过自然语言下达指令，即可让模型操作腾讯文档空间里的数据资产」；频率控制为免费用户 2000/天、超级会员 20000/天、超级会员 Plus 40000/天（官方页：[MCP 概述](https://docs.qq.com/open/document/mcp/)）。
- 官方提供 **Skill**：定义为「AI 智能体与大规模协作办公生态之间的通信与作业协议层」，核心能力明确包含「一键完成 Excel 跨表读写、设置颜色及基础公式操作」「创建各类在线文档（Word、Excel、PPT、智能表格……）」「读取与编辑文档内容（Word、Excel、智能表格……）」（官方页：[Skill 概述](https://docs.qq.com/open/document/mcp/skill/)）。
- **未验证**：该 Skill 的具体工具清单、是否支持「把一句自然语言固化成可复用函数/按钮」。官方 Skill 页只给能力罗列与一份外部配置说明链接，未给出可复用函数注册机制（[Skill 概述](https://docs.qq.com/open/document/mcp/skill/)）。

---

## 3. 本地 Excel / .xlsx 与 harness 内置表格底座

### 3.1 openpyxl

- 定位：「openpyxl is a Python library to read/write Excel 2010 xlsx/xlsm files」，即**可读也可写**已有 `.xlsx`/`.xlsm`（官方：[openpyxl 首页](https://openpyxl.readthedocs.io/en/stable/)）。
- 可凭空建工作簿，不必先在文件系统上建文件：「There is no need to create a file on the filesystem to with openpyxl. Just import the Workbook class and start work」（官方：[Tutorial](https://openpyxl.readthedocs.io/en/stable/tutorial.html)）。
- 读侧构造 `ExcelReader(fn, read_only=False, keep_vba=False, data_only=False, keep_links=True, rich_text=False)`，写侧构造 `class Workbook(write_only=False, iso_dates=False)`（官方：[openpyxl.reader.excel](https://openpyxl.readthedocs.io/en/stable/api/openpyxl.reader.excel.html)、[openpyxl.workbook.workbook](https://openpyxl.readthedocs.io/en/stable/api/openpyxl.workbook.workbook.html)）。
- 边界：**不计算公式**。「Writing a formula does not calculate its result. openpyxl and XlsxWriter do not evaluate formulas; `data_only=True` returns cached values that may be absent or stale.」（一手：[office-xlsx/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-xlsx/SKILL.md>)）。无需任何云凭据（[openpyxl 首页](https://openpyxl.readthedocs.io/en/stable/)）。

### 3.2 XlsxWriter

- 定位：「XlsxWriter is a Python module for writing files in the Excel 2007+ XLSX file format」，可写文本、数字、公式到多个工作表，支持格式、图片、图表、页面设置、自动筛选、条件格式（官方：[Introduction](https://xlsxwriter.readthedocs.io/introduction.html)）。
- 硬边界（官方 FAQ 原文）：「**No. XlsxWriter is designed only as a file writer. It cannot read or modify an existing Excel file.**」（官方：[FAQ](https://xlsxwriter.readthedocs.io/faq.html)）。
- 公式边界（官方 FAQ 原文）：「XlsxWriter doesn't, and realistically cannot, calculate the result of a formula when it is written to an XLSX file. Instead, it stores the value 0 as the formula result. It then sets a global flag in the XLSX file to say that all formulas and functions should be recalculated when the file is opened.」；也「Currently no」不支持一次性给整个区域套格式（官方：[FAQ](https://xlsxwriter.readthedocs.io/faq.html)）。
- 本机技能给的选型规则：「Use openpyxl for existing XLSX workbooks and targeted cell or style changes. Load with `data_only=False` when formulas must survive.」「XlsxWriter can create new workbooks, but cannot read or modify existing ones.」「Use pandas for data analysis and transformations. A DataFrame is not the workbook」（一手：[office-xlsx/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-xlsx/SKILL.md>)）。无需云凭据（[Introduction](https://xlsxwriter.readthedocs.io/introduction.html)）。

### 3.3 Microsoft Graph Excel API

- 定位：「You can use Microsoft Graph to allow web and mobile applications to read and modify Excel workbooks stored in **OneDrive, SharePoint, or other supported storage platforms**」——工作簿必须在云端存储（官方：[Excel workbooks and charts API overview](https://learn.microsoft.com/en-us/graph/excel-concept-overview)）。
- 格式边界：「The Excel REST API supports only Office Open XML file formatted workbooks (files with the `.xlsx` extension). The `.xls` extension workbooks are not supported.」（官方：[Excel workbooks and charts API overview](https://learn.microsoft.com/en-us/graph/excel-concept-overview)）。
- 能力：「You can access a set of Excel objects (such as Table, Range, or Chart) by using standard REST APIs to perform create, read, update, and delete (CRUD) operations on the workbook」；「With more than 300 Excel worksheet functions currently available」，可通过 API 调用 Excel 计算引擎取回结果（官方：[Excel workbooks and charts API overview](https://learn.microsoft.com/en-us/graph/excel-concept-overview)）。
- 写入示例：`PATCH /me/drive/items/{id}/workbook/worksheets/{sheet-id}/range(address='A1:B2')`，Body 可同时给 `values`、`formulas`、`numberFormat`；请求头 `Authorization: Bearer {token}` 必填，可选 `Workbook-Session-Id`（官方：[Update range](https://learn.microsoft.com/en-us/graph/api/range-update?view=graph-rest-1.0)）。
- 会话：分 persistent session（改动持久化）与 non-persistent session（改动不回写源文件，仅用于取计算结果/图表），用 `workbook-session-id: {session-id}` 头表示（官方：[workbook: createSession](https://learn.microsoft.com/en-us/graph/api/workbook-createsession?view=graph-rest-1.0)、[Workbook best practices](https://learn.microsoft.com/en-us/graph/workbook-best-practice)）。
- **需要云凭据**：`Update range` 与 `createSession` 的权限表均要求 **Delegated `Files.ReadWrite`**（工作/学校账户；`Update range` 对个人 Microsoft 账户同样支持 `Files.ReadWrite`），**Application 权限不支持**；认证走 Microsoft Graph 的 OAuth Bearer token（官方：[Update range](https://learn.microsoft.com/en-us/graph/api/range-update?view=graph-rest-1.0)、[workbook: createSession](https://learn.microsoft.com/en-us/graph/api/workbook-createsession?view=graph-rest-1.0)、[permissions overview](https://learn.microsoft.com/en-us/graph/permissions-overview)）。此外 `createSession` 在「China operated by 21Vianet」部署标为 ❌（[workbook: createSession](https://learn.microsoft.com/en-us/graph/api/workbook-createsession?view=graph-rest-1.0)）。
- **未验证**：是否存在 Excel 专属的「新建工作簿」API。官方概览只说「You can access a workbook through the **Drive API** by identifying the location of the file in the URL」（[Excel workbooks and charts API overview](https://learn.microsoft.com/en-us/graph/excel-concept-overview)），未列出 `POST .../workbook` 之类的建表接口；本轮未在官方参考中检得，故不声称有或无。

### 3.4 本机 agent harness 已内置的表格底座（一手 SKILL.md）

- **重要更正**：题目给出的 `C:\Users\11\.dsh\profiles\desktop\node_modules\dsh-mattpocock-skills-deck\bundled-skills\` 目录下**只有 Matt Pocock 系列技能**（`ask-matt`、`code-review`、`grilling`、`research`、`tdd`、`wayfinder`、`wizard`、`writing-for-agents` 等），**没有任何 office / univer 技能**（已用 glob 逐项核对：[dsh-mattpocock-skills-deck/bundled-skills](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-mattpocock-skills-deck/bundled-skills/>)）。表格底座实际来自另外两个目录：`C:\Users\11\.dsh\profiles\desktop\node_modules\dsh-univer-office\skills\` 与 `F:\deepseek_haeness_inload\resources\runtime\office-skills\`（依据：[univer/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer/SKILL.md>)、[office/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office/SKILL.md>)）。
- **Univer 容器**：`.univer` 是权威的多 Unit 容器，Unit 类型有 Sheet / Doc / Slide / Base / Board，各有稳定 `unitId`；采用 trunk 与隔离 worktree（`create`/`ready`/`reopen`/`merge`/`discard`），每次写操作都要带 `file` + 草稿 `worktreeId` + `unitId`（一手：[univer/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer/SKILL.md>)）。
- **Univer 明确禁止用 openpyxl 等替代**：原文「Do not ... substitute openpyxl, python-pptx, python-docx, ZIP manipulation, or another writer」；导入由 `univer_import` 接 `xlsx/csv/tsv/docx/pptx`，导出可把 Sheet 或 Base 导成 `.xlsx/.csv/.tsv`、Doc 导成 `.docx`、Slide 导成 `.pptx`（Board 不支持导出）；工具集含 `univer_new/status/worktree/unit/import/execute/compile_svg/inspect/lint/screenshot/api/resources/export/print_pdf`；`univer_execute` 注入 `univerAPI`、`api`、`workbook`/`doc`/`presentation`/`base`/`board`（一手：[univer/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer/SKILL.md>)）。
- **Sheet 读写与公式**：单元格模型 `{v,t,f?,s?,p,si,displayValue}`，`t` 取值 1 文本 / 2 数字 / 3 布尔 / 4 强制文本；读侧 `getRange/getCellData/getCellDatas/getRawValues/getDisplayValues/getFormula`，写侧 `setValue/setValues/setFormula/clearContent/clear`、`getLastRow/getLastColumn/setRowCount(n)`；公式可经 `api.getFormula().onCalculationResultApplied()` + `api.getFormula().executeCalculation()` 触发计算；支持结构化引用 `Orders[[#This Row],[Amount]]` / `Orders[[#Data],[Amount]]`；用 `univer_inspect Sheet1!A1:D20` 与 `univer_screenshot` 校验，导出前先重算（一手：[univer-sheet/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer-sheet/SKILL.md>)）。
- **Base（对应「多维表格」形态）**：`FBase` → `FBaseTable` → `FBaseTableField`（schema 与取值契约）/ `FBaseTableRecord`（业务数据）/ `FBaseTableView`（同表记录的投影）；新建 Base 自带 `Table 1` + 主字段 `Name` + `Grid` 视图；精确 API 为 `FBase.insertTable`、`FBaseTable.addField`、`FBaseTable.addRecords`、`FBaseTable.createView`、`FEnum.BaseFieldType`；硬约束「Add fields one at a time with `FBaseTable.addField(...)`; there is no `addFields` method」；Base Formula 字段必须用精确 Excel 结构化引用 `Table[[#This Row],[Column]]` / `Table[[#Data],[Column]]`，并用 `table.getFormulaName()` 解析公式标识符（一手：[univer-base/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer-base/SKILL.md>)）。
- **其它 Unit 技能齐备**：`univer-doc`、`univer-slide`、`univer-board`、`univer-embed`、`univer-cross-unit-formula` 的 SKILL.md 均存在，可覆盖文档/演示/画布/嵌入/跨 Unit 公式（依据：[dsh-univer-office/skills](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/>) 下各 SKILL.md，如 [univer-cross-unit-formula/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer-cross-unit-formula/SKILL.md>)）。
- **Office 技能路由**：create/read/edit → `office-docx`/`office-pptx`/`office-xlsx`；图片与视觉 → `office-render`；公式刷新 → `office-recalculate`；PDF → `office-export-pdf`（一手：[office/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office/SKILL.md>)）。
- **公式重算闭环**：`office-recalculate` 用 LibreOffice Kit CLI 执行 `recalculate --input <workbook.xlsx> --output <recalculated.xlsx>`，保留原工作簿另存新文件，再用 openpyxl 同时以 `data_only=False` 与 `data_only=True` 打开校验公式存活与缓存结果一致；若无可用重算引擎则保留原文件并说明无法刷新，**不得**用常量替换公式或把陈旧缓存冒充新结果（一手：[office-recalculate/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-recalculate/SKILL.md>)）。
- **交付**：`office-xlsx` 要求用 `load_workspace_dependencies` 给出的捆绑 Python + openpyxl/pandas，最终用 `present({"files":[{"path":"report.xlsx"}]})` 交付；不要把 `.xls/.xlsb`/加密/宏文件改名成 `.xlsx`，宏工作簿用 `keep_vba=True`（一手：[office-xlsx/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-xlsx/SKILL.md>)）。
- **零云凭据**：上述 Univer / Office 技能全部在本机文件与本机工具上工作（`.univer` 文件、捆绑 Python、LibreOffice sidecar），不需要 OneDrive / Azure / OAuth（依据：[univer/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer/SKILL.md>)、[office-xlsx/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-xlsx/SKILL.md>)、[office-recalculate/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-recalculate/SKILL.md>)）。
- **未验证**：`office-render`、`office-export-pdf`、`office-docx`、`office-pptx` 四个技能的逐条能力边界（本轮只读了路由说明与 `office-recalculate` 全文，未逐份通读，见 [office/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office/SKILL.md>)）。

---

## 4. 「自然语言 → 函数 / 可复用按钮」的一手先例

### 4.1 Excel LAMBDA（命名函数，非自然语言生成）

- 官方定义：「Use a LAMBDA function to create custom, reusable functions and call them by a friendly name. The new function is available throughout the workbook and called like native Excel functions.」；且「a LAMBDA function doesn't require VBA, macros or JavaScript, so non-programmers can also benefit from its use」（官方：[LAMBDA function](https://support.microsoft.com/en-us/excel/functions/lambda-function)）。
- 语法 `=LAMBDA([parameter1, parameter2, …,] calculation)`，最多 253 个参数；最终通过 **Name Manager** 起名字与描述，使其在工作簿任意单元格可复用（官方：[LAMBDA function](https://support.microsoft.com/en-us/excel/functions/lambda-function)）。
- 适用版本：Excel for Microsoft 365 / Microsoft 365 for Mac / Excel 2024 / Excel 2024 for Mac（官方：[LAMBDA function](https://support.microsoft.com/en-us/excel/functions/lambda-function)）。
- 官方博客解释设计动机：「LAMBDA allows you to define your own custom functions using Excel's formula language」；此前自定义函数必须用「an entirely different language such as JavaScript」（官方：[Announcing LAMBDA: Turn Excel formulas into custom functions](https://techcommunity.microsoft.com/blog/excelblog/announcing-lambda-turn-excel-formulas-into-custom-functions/1925546)）；Excel 2024 新特性页称其「allows you to create a function for a commonly used formula ... effectively adding your own custom functions to the Excel function library」（官方：[What's new in Excel 2024](https://support.microsoft.com/en-us/excel/what-s-new-in-excel-2024-for-windows-and-mac)）。
- **判断**：LAMBDA 证明「把一段计算固化成有名字、可复用、可对整个工作簿调用的函数」是产品级可行形态，但其**输入是公式语法，不是自然语言**（[LAMBDA function](https://support.microsoft.com/en-us/excel/functions/lambda-function)）。「一句话 → LAMBDA」需要额外一层翻译，官方页未提供该能力（[LAMBDA function](https://support.microsoft.com/en-us/excel/functions/lambda-function)）。

### 4.2 Office Scripts（动作录制 → 可复用脚本 → 按钮）

- 官方原文：「Office Scripts in Excel let you automate your day-to-day tasks. Use the action recorder to turn manual steps into reusable scripts. Edit those scripts or create new ones with the code editor. **Let others in the workbook run these scripts with a single button.** Then, share them with coworkers」（官方：[Office Scripts in Excel](https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel)）。
- 动作录制器把编辑单元格、改格式、建表等动作录成脚本，可在其它工作簿/工作表重放；代码编辑器可加 if/else、循环等 UI 里没有的逻辑；把脚本与工作簿关联后，有权限的成员可查看并运行；可「Add buttons that run scripts」（官方：[Office Scripts in Excel](https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel)、[Run Office Scripts with buttons](https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons)）。
- 与 Power Automate 集成可做定时/事件触发（官方：[Office Scripts in Excel](https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel)、[Power Automate integration](https://learn.microsoft.com/en-us/office/dev/scripts/develop/power-automate-integration)）；管理员层面「Office Scripts works with Power Automate, and users run scripts on workbooks by using the Excel Online (Business) connector」（官方：[Manage Office Scripts settings](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-office-scripts-settings?view=o365-worldwide)）。
- **判断**：这是「可复用按钮」最贴合的一手先例，但复用单元是 **TypeScript/JavaScript 脚本**，来源为「动作录制」或「手写代码」，不是把一句自然语言编译成函数（[Office Scripts in Excel](https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel)）。另注：官方页写明「Script scheduling is temporarily disabled within Office Scripts」，需改用 Power Automate（[Office Scripts in Excel](https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel)）。

### 4.3 Google Apps Script（自定义函数 / 菜单 / 宏）

- 官方原文：「Google Sheets allows creating custom functions using Google Apps Script in JavaScript to extend built-in functionalities. To create a custom function, write JavaScript code in the script editor accessed through the Extensions menu in Google Sheets」（官方：[Custom functions in Google Sheets](https://developers.google.com/apps-script/guides/sheets/functions)）。
- 自定义函数是绑定在 Google Sheets 上的脚本函数，用 `=myFunctionName()` 从单元格直接调用（官方：[Bound scripts](https://developers.google.com/apps-script/guides/bound)）；还可「Add custom menus, dialogs, and sidebars to Sheets. Write custom functions for Sheets, and integrate it with other Google services」（官方：[Extending Google Sheets](https://developers.google.com/apps-script/guides/sheets)）；录制的宏可用菜单项或快捷键重复执行（官方：[Apps Script fundamentals codelab](https://developers.google.com/codelabs/apps-script-fundamentals-1)）。
- **未验证**：该官方页正文在本环境抓取时 30 秒超时（`https://developers.google.com/apps-script/guides/sheets/functions` 未取回全文），上引句子来自官方站点的索引摘要 + 同域其它官方页（[Extending Google Sheets](https://developers.google.com/apps-script/guides/sheets)、[Bound scripts](https://developers.google.com/apps-script/guides/bound)、[Custom functions quickstart](https://developers.google.com/apps-script/quickstart/custom-functions)）；页面 URL 本身是官方的，但正文细节标记为未逐字核验。
- **判断**：与 LAMBDA 同类——「自定义函数 + 菜单/按钮」可行，输入仍是 JavaScript 代码，不是自然语言（[Extending Google Sheets](https://developers.google.com/apps-script/guides/sheets)）。

### 4.4 飞书多维表格 字段捷径 / 自动化（预编排 + AI 字段）

- 官方 aily 帮助页原文：「飞书 aily 工作流应用中的技能发布多维表格字段捷径是一个让您轻松在飞书多维表格中使用 AI 能力的功能」，可「**将 AI 技能变成表格字段**：把您在 aily 平台创建的 AI 工作流技能，直接发布成多维表格的字段捷径」「**智能处理表格数据**：让 AI 自动分析、处理表格中的文本、图片等内容，并将结果填入指定字段」（官方：[字段捷径使用指南](https://aily.feishu.cn/hc/1u7kleqg_hp4exotp)）。
- 其工作流程是**先编排后复用**：先在 aily 平台创建并测试好一个工作流技能（要求「开始节点」「结束节点」都配置参数、必须保存提交并发布；不能含知识问答/知识检索节点、不能含需用户身份调用的节点）→ 配置输入表单与输出字段（输出类型支持文本、数字、单选、多选、日期、对象、附件；字段捷径上架后输出字段类型不可改）→ 填写名称/图标/描述、选发布范围（仅自己可见免审，租户内可见需管理员审核）→ 提交发布 → 在多维表格「添加新字段」时选「字段捷径」从捷径市场安装并配置参数 → 表格中输入或更新数据时 AI 自动处理并填入目标字段（官方：[字段捷径使用指南](https://aily.feishu.cn/hc/1u7kleqg_hp4exotp)）。
- 运行约束：每个租户 10 QPS，超出的运行任务排队；使用会产生费用；单个文件不超过 10M、每次最多 5 个附件（官方：[字段捷径使用指南](https://aily.feishu.cn/hc/1u7kleqg_hp4exotp)）。
- 另有官方帮助中心的「公式字段捷径」「AI 字段捷径」「自动化流程」等条目（[使用多维表格公式字段捷径](https://www.feishu.cn/hc/zh-CN/articles/962259873941-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E5%85%AC%E5%BC%8F%E5%AD%97%E6%AE%B5%E6%8D%B7%E5%BE%84)、[使用多维表格 AI 字段捷径](https://base.feishu.cn/helpcenter/ai8y3d44/0dvrw73c)、[多维表格工作流介绍](https://www.feishu.cn/hc/zh-CN/articles/908751305974-%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E5%B7%A5%E4%BD%9C%E6%B5%81%E4%BB%8B%E7%BB%8D)、[工作流和自动化触发条件与执行操作一览](https://www.feishu.cn/hc/zh-CN/articles/740947703250-%E5%B7%A5%E4%BD%9C%E6%B5%81%E5%92%8C%E8%87%AA%E5%8A%A8%E5%8C%96%E8%A7%A6%E5%8F%91%E6%9D%A1%E4%BB%B6%E4%B8%8E%E6%89%A7%E8%A1%8C%E6%93%8D%E4%BD%9C%E4%B8%80%E8%A7%88)）；官网内容文章把字段捷径定义为「多维表格为某些高频的业务场景下**预置**的自动化字段工具，将常用的 AI、公式、API 等能力封装到了字段里」（官方：[飞书官网内容文章](https://www.feishu.cn/content/article/7592538064711470271)）。
- **判断**：这是「AI 对每行数据计算并回填字段」最接近的一手先例，但它是**先把能力编排并发布成一个字段类型，再让用户输入参数**，不是「在输入框写一句话当场编译成函数」；且带审核、计费、限流与发布范围约束（[字段捷径使用指南](https://aily.feishu.cn/hc/1u7kleqg_hp4exotp)）。
- **未验证**：`www.feishu.cn/hc/...` 与 `base.feishu.cn/helpcenter/...` 这几个帮助中心页的正文（本环境只返回页面标题或内容被截断，例如 [使用多维表格公式字段捷径](https://www.feishu.cn/hc/zh-CN/articles/962259873941-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E5%85%AC%E5%BC%8F%E5%AD%97%E6%AE%B5%E6%8D%B7%E5%BE%84) 仅取回标题），故不据它们推断「公式字段捷径」是否支持任意自然语言输入；可完整取回的是 [aily 字段捷径使用指南](https://aily.feishu.cn/hc/1u7kleqg_hp4exotp)。

### 4.5 腾讯文档 MCP / Skill（自然语言 → 工具编排）

- 官方原文：「你只需通过自然语言下达指令，即可让模型操作腾讯文档空间里的数据资产」（官方：[MCP 概述](https://docs.qq.com/open/document/mcp/)）；Skill 能力含「一键完成 Excel 跨表读写、设置颜色及基础公式操作」（官方：[Skill 概述](https://docs.qq.com/open/document/mcp/skill/)）。
- **判断**：这证明「自然语言 → 一组表格操作」是官方已落地形态，但复用单元是 **MCP 工具集 / Skill 指令集**，不是「生成一个可命名、可反复调用的函数」（[MCP 概述](https://docs.qq.com/open/document/mcp/)、[Skill 概述](https://docs.qq.com/open/document/mcp/skill/)）。

### 4.6 综合判断

- 四个一手谱系里，「函数 / 按钮」的**承载介质**都是代码或公式（LAMBDA 公式、TypeScript 脚本、JavaScript 函数、预编排工作流字段），**入口**都不是任意自然语言；自然语言目前只出现在「编排层」（MCP/Skill 把一句话拆成工具调用）与「参数层」（字段捷径让终端用户填表）（[LAMBDA function](https://support.microsoft.com/en-us/excel/functions/lambda-function)、[Office Scripts in Excel](https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel)、[Extending Google Sheets](https://developers.google.com/apps-script/guides/sheets)、[字段捷径使用指南](https://aily.feishu.cn/hc/1u7kleqg_hp4exotp)、[MCP 概述](https://docs.qq.com/open/document/mcp/)）。
- 因此「输入框把一句话变成函数并对数据计算」在可行性上最接近的实现路径是：**用 LLM 把自然语言翻译成上述某种已验证的可复用介质**（LAMBDA 公式 / 结构化引用 / 脚本 / 字段配置），再交给对应计算引擎执行；本机已有可承载该介质的 `univer-sheet` 公式与 `univer-base` Formula 字段（[univer-sheet/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer-sheet/SKILL.md>)、[univer-base/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer-base/SKILL.md>)）。**未验证**：是否存在官方产品直接提供「自然语言 → 命名函数」的一步式编译（本轮四家官方文档均未检得，见本节各链接）。

---

## 对决策的影响

1. **可定：底座选本地、零云凭据。** 建表 / 加字段 / 写记录 / 写单元格 / 公式计算与结果校验，本机 Univer（Sheet + Base）与 Office 技能栈已能闭环覆盖，且 `univer/SKILL.md` 明确禁止在处理 `.univer` 时改用 openpyxl 等替代写者；把 `openpyxl`/`XlsxWriter` 定位为 `.xlsx` 独立文件场景的补充即可（[univer/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer/SKILL.md>)、[univer-base/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer-base/SKILL.md>)、[office-xlsx/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-xlsx/SKILL.md>)、[office-recalculate/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-recalculate/SKILL.md>)）。注意：表格技能实际不在 `dsh-mattpocock-skills-deck/bundled-skills/` 下，引用路径要改（[bundled-skills 目录](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-mattpocock-skills-deck/bundled-skills/>)）。
2. **可定：云端适配是可行的，且腾讯文档不是「无 API」。** 飞书与腾讯文档都有公开的建表 + 写入接口，可以设计成同一套「建表 / 加字段 / 写记录」抽象的两个 adapter；但两边鉴权模型不同——飞书是 `app_id`/`app_secret` → `tenant_access_token`/`user_access_token` + `Authorization: Bearer` + 文档协作者权限 + API scope，腾讯文档是 `Client-Id`/`Access-Token`/`Open-Id` 三元组 + OAuth2 授权码 + scope 审核，不可共用一个凭据层（[飞书调用 API](https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/get-?lang=zh-CN)、[飞书多维表格概述](https://open.larksuite.com/document/server-docs/docs/bitable-v1/bitable-overview?lang=zh-CN)、[腾讯文档接入教程](https://docs.qq.com/open/document/app/get_started.html)、[腾讯文档新建文档](https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html)）。
3. **可定：先做「繁琐任务自动化」，别把「自然语言编译成函数」当第一版前提。** 一手先例里可复用介质的入口都是公式/代码/预编排，自然语言只在编排层或参数层；因此第一版应把「一句话」翻译成已验证介质（LAMBDA 公式、结构化引用、脚本、字段配置），而不是承诺任意自然语言直接生成命名函数（[LAMBDA function](https://support.microsoft.com/en-us/excel/functions/lambda-function)、[Office Scripts in Excel](https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel)、[字段捷径使用指南](https://aily.feishu.cn/hc/1u7kleqg_hp4exotp)、[腾讯文档 MCP](https://docs.qq.com/open/document/mcp/)）。
4. **仍待定：云端目标平台的选定与凭据/审核成本。** 腾讯文档 Open API 面向第三方应用但要「注册开发者 + 应用审核 + 用户 OAuth2 授权 + 需审核类 scope 按最少必要原则审批 + 授权页披露目的」，且 V2 在线表格接口已废弃、V3 覆盖口径与 scope 命名在官方文档间不一致；飞书用 `tenant_access_token` 前必须把应用加为文档协作者，且电子表格接口的逐接口 scope 矩阵未从官方页取到。需要一次真实凭据的冒烟测试才能定（[腾讯文档应用权限](https://docs.qq.com/open/document/app/scope.html)、[腾讯文档 V3 介绍](https://docs.qq.com/open/document/app/openapi/v3/)、[腾讯文档在线表格批量更新](https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html)、[飞书云文档常见问题](https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN)、[飞书 API 权限列表](https://open.feishu.cn/document/ukTMukTMukTM/uYTM5UjL2ETO14iNxkTN/scope-list?lang=zh-CN)）。
5. **仍待定：「函数」落在哪一层、公式结果由谁算。** openpyxl 与 XlsxWriter 都不计算公式（前者返回可能缺失/陈旧的缓存值，后者把结果写成 0 并置重算标志），Microsoft Graph 能用 Excel 引擎算但要 OneDrive/SharePoint + Delegated `Files.ReadWrite`（Application 权限不支持），本机则可用 `univer_execute` 的 `executeCalculation()` 或 `office-recalculate` 的 LibreOffice 重算闭环。选哪一层决定了「对数据计算」这一承诺能否兑现，需在规格里明确（[XlsxWriter FAQ](https://xlsxwriter.readthedocs.io/faq.html)、[office-xlsx/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-xlsx/SKILL.md>)、[Update range](https://learn.microsoft.com/en-us/graph/api/range-update?view=graph-rest-1.0)、[univer-sheet/SKILL.md](<C:/Users/11/.dsh/profiles/desktop/node_modules/dsh-univer-office/skills/univer-sheet/SKILL.md>)、[office-recalculate/SKILL.md](<F:/deepseek_haeness_inload/resources/runtime/office-skills/office-recalculate/SKILL.md>)）。
