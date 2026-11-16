# 能力位 × 平台 矩阵（票 #25 端到端验尸产物）

> 本文件由 `workbench/scripts/capability-probe.js` 生成，勿手改；矩阵随探针结论自动同步。
> 口径：只在真跑过并通过才记 `true`；文档层「未验证」一律 `false` 并附一手证据与失败步骤（地图 #2 共识 ⑲）。

| 平台 | canWriteFormula | canRecalc | canReadComputed | functionSet |
| --- | --- | --- | --- | --- |
| 本地 Excel（零凭据） | true · https://support.microsoft.com/zh-cn/excel/excel-functions-alphabetical · [本会话真跑] | true · docs/research/spreadsheet-platform-capabilities.md 第 3 章（office-recalculate / LibreOffice recalculate + xlsx_bridge read-values 闭环） · [本会话真跑] | true · docs/research/spreadsheet-platform-capabilities.md 第 3 章（office-recalculate / LibreOffice recalculate + xlsx_bridge read-values 闭环） · [本会话真跑] | true · https://support.microsoft.com/zh-cn/excel/excel-functions-alphabetical · [本会话真跑] |
| 飞书多维表格 / 电子表格 | false（写 =C2*D2 后读回仍是公式文本（文档层未见写公式求值接口）） · https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range?lang=zh-CN | false（无重算资源/接口可调用） · https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/resource.go | false（读范围接口无「读计算值」参数） · https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/reading-a-single-range?lang=zh-CN | false（未见官方公式函数差异说明/函数清单接口） · https://www.feishu.cn/hc/zh-CN/articles/962259873941 |
| 腾讯文档在线表格 | false（一手负面：V3 batchUpdate 的 CellValue 只 text/link/number，无公式字段） · https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html | false（一手负面：V3 接口列表只有 3 个，无重算接口） · https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html | false（一手负面：get_range 响应无计算值字段） · https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html | false（未见官方公式函数列表/差异页） · https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html |

## 最小用例

- 写 =C2*D2（工时×时薪）→ 触发重算 → 读回计算值 → 与期望值比较（四格共用同一链路的不同判定点）。
- 本地 Excel 由 `node scripts/capability-probe.js --run-local` 真跑四格；飞书/腾讯为文档层结论，未持凭据真跑。
