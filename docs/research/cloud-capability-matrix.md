# 能力位 × 平台 矩阵（票 #5 冒烟测试产物）

> **存放理由**：循 `docs/research/` 既有取证笔记习惯（本目录已有 10 份，同属本 effort 的事实材料），按地图 #2 共识 ㉓ 把 #5 的能力位矩阵作为一份新笔记落盘，供 `/to-spec` 与共识 ⑳/㉖ 直接引用。只写本文件，未 commit／未建分支；**不含任何真实凭据**（凭据在本机仓库外 scratch 的 `credentials.env`，从未进票或仓库）。

## 口径（诚实标注，别当成"实测通过"）

- **建表→写→读链路（Step 1–6）＝使用者本人真实凭据实测成功**（agent 只构造请求、未接触凭据值）：飞书换 token `code:0`、建表 `code:0`、加字段 `type:2`、写两行 `code:0`、`records/search` 读回并目视确认 2 行 2 列；腾讯 `POST /openapi/drive/v2/files` 建表 `ret:0` / `data.ID`（含字面 `$`）/ `data.type:"sheet"` / `data.url`。
- **能力位（`canWriteFormula` / `canRecalc` / `canReadComputed` / `functionSet`）本体零实测值**：使用者 2026-11-16 以「腾讯的验证都直接过吧，我看建表更新没有问题，效率太慢了直接过吧」明确豁免 Step 7（V3 `batchUpdate` 写入）/ Step 8（读回）/ Step 9（共识 ⑲ 四能力位用例）的真人实测。四格一律"未实测"；凡写 `true（实测）` 或"验证通过"即为编造。
- 共识 ⑲ 规则：文档层「未验证」一律按 **false** 记并附一手证据 URL 与失败步骤；腾讯 V3 三格是**负面已验证**（一手文档明确无公式字段／无重算接口／无读计算值接口）。本地 Excel 为参照基线（true）。

## 矩阵

| 平台 | canWriteFormula | canRecalc | canReadComputed | functionSet |
| --- | --- | --- | --- | --- |
| 飞书 Sheets (sheets-v3) | false（文档层未验证 #1）· <https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range?lang=zh-CN> · 失败步骤：写 `=A2*B2` 后读回仍是公式文本 | false（#2）· <https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/resource.go> · 无重算资源 | false（#3）· <https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/reading-a-single-range?lang=zh-CN> · 无计算值读取参数 | false（#7）· <https://www.feishu.cn/hc/zh-CN/academy/learn_functions_of_Bitable> · 无 Excel 差异官方说明 |
| 飞书 Bitable | false（#4）· <https://open.larksuite.com/document/server-docs/docs/bitable-v1/bitable-structure> · 新增记录写公式后读回无计算值 | false（#5）· <https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/resource.go> · 无重算资源 | false（#4）· 同上 · 公式字段计算值不随记录返回 | false（#8）· <https://www.feishu.cn/hc/zh-CN/articles/962259873941-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E5%85%AC%E5%BC%8F%E5%AD%97%E6%AE%B5%E6%8D%B7%E5%BE%84> · 无差异说明 |
| 腾讯文档 V3 | false（#6，负面已验证）· <https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html> · 写侧 CellValue 只 text/link/number，无公式 | false（负面已验证）· <https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html> · V3 接口列表只有 3 个，无重算接口 | false（负面已验证）· <https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html> · 响应无计算值字段 | false（#9）· <https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html> · 未找到官方公式函数列表/差异页 |
| 本地 Excel（参照基线） | true（基线）· <https://support.microsoft.com/zh-cn/excel/excel-functions-alphabetical> | true（基线，office-recalculate / LibreOffice）· `docs/research/spreadsheet-platform-capabilities.md` 第 3 章 | true（基线）· 同上 | true（基线，300+ 函数）· 同上 |

## 端到端链路（共识 ⑲ 的 4 个最小用例 —— 用例 (a)(b) 飞书部分、(c)(d) 未跑，按使用者决定豁免）

- (a) 飞书 sheets：向单个范围写入 `=A2*B2` → 读回，看是公式文本还是计算值。**未跑**（豁免）。一手：<https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range?lang=zh-CN>
- (b) 飞书 bitable：建公式字段（`TypeFormula = 20` / `formula_expression`）→ 查记录，看计算值是否随记录返回。**未跑**（豁免）。一手：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/bitable/v1/model.go>
- (c) 腾讯 V3：以 text 写 `=A2*B2` → 看是否被解释求值。**未跑**（豁免）；Step 7 可复制 curl 已备于 `SMOKE-RUNBOOK.md`（仓库外 scratch），随时可补跑。一手：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html>
- (d) 三家各测一次「改源数据后计算值是否自动刷新」，判定重算是否由平台托管。**未跑**（豁免）。一手：<https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/resource.go>、<https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html>

## 建表 → 加字段 → 写记录/写单元格 → 读回（票 #5 Question 要求的链路，Step 1–6 已实测）

- 飞书建多维表格：<https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create?lang=zh-CN>；新增字段：<https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/create?lang=zh-CN>；新增记录：<https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create?lang=zh-CN>；写单元格：<https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range?lang=zh-CN>
- 腾讯建在线表格：<https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html>；V3 批量更新：<https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html>；范围查询：<https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html>
- V2 废弃后 V3 覆盖口径未验证：<https://docs.qq.com/open/document/app/openapi/v3/>

## 对决策的影响

1. **能力位全 false（腾讯 V3 负面已验证、飞书按 ⑲ 文档层记 false）→ 共识 ㉖ 闸门触发**：#5 resolve + 本矩阵落盘 + gist/link 进 Decisions so far 之后，在地图新建一张 `wayfinder:grilling` 决策票，Question＝「是否重开 ⑬/⑯、允许『工作台算好写值』作为降级路径」，成为新 frontier。（https://github.com/huobuzhe/ai_work/issues/5）
2. **规格按 ⑳ 现状定稿、不预留降级分支**：飞书/腾讯 adapter 的 `formulaCapabilities` 四格按本矩阵填 false，依赖这些位的动作在该 adapter 上禁用并在预览给明确提示；不静默降级、不写死值。只有本地 Excel 基线四格 true，第一版零凭据基准可落地。（地图 #2 共识 ⑬/⑯/⑳）
3. **可变事实写进 #5 验收清单、不焊进规格**：腾讯 20000 次限免、两套 scope 命名各页不一致、审核周期、响应外层结构未验证等，随凭据契约走，不写死在规格里。（共识 ㉕）
4. **链路实测事实与能力位事实严格分开**：Step 1–6 是"建表→写→读回"链路已通的事实，**不是** ⑲ 的能力位结论；两者不可互相替代，规格里分别陈述。（票 #5 答案 gist）
