# 更新日志（CHANGELOG）

本文件记录 `dsh-workbench`（表格工作台）的版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.2.0] - 2026-11-21

「多维透视 + 真 LLM / 流水线 / 条件色」次版本：在 1.1.0 的确定性改表线上，补齐汇总/透视的**多级分组**，并把三项此前只在候选里的能力（一句话接真 LLM、多动作流水线、多条件多色）落地。向前兼容，无破坏性变更。

### 新增（Added）
- **一句话理解·真 LLM 适配器**（`lib/llm-adapter.js`，可选，离线默认关闭）：提供 `createUnderstandLlmAsync(cfg)`（推荐，async）与 `createUnderstandLlm(cfg)`（同步阻塞版，供桥的同步 `understandLlm` 约定用）两个工厂。cfg = `{ baseUrl, model, apiKey, temperature?, timeoutMs?, fetch? }`，兼容 **OpenAI Chat Completions 协议**，因此同时覆盖 DeepSeek / OpenAI / 任意兼容网关（换 baseUrl + model 即可）。内部把一句话转成「先给动作类型清单 + 当前真实列名」的 system prompt，解析模型返回的 JSON 为 `{kind,params}`，并按该 kind 的 paramSpec 白名单**过滤参数键**；未知 kind / 非 JSON / 非 2xx / 网络错 / 超时一律返回 `null` → 引擎静默回落离线关键词。**永不阻断主路径、零第三方依赖**。桥 `makeActionHandler({understandLlm})` 的调用点已把当前表列名作为第二参传入（`understandLlm(text,{columns})`），旧的一参签名仍兼容。测试 `test/llm-adapter.test.js`（13 例：纯逻辑 + 注入 fetch 的成功/非2xx/抛错/超时 + 端到端经 engine.understandAsync）。
- **一句话理解·可选接真 LLM**（可插拔，离线默认关闭）：引擎新增 `understandAsync(sentence, {llm})`——`llm` 是宿主注入的 async 函数 `(句)=> ({kind, params}|null)`，接到就调用并由封闭校验采用其解析结果（标 `via:'llm'`），LLM 抛错/返回 null/未知 kind 一律**静默回落关键词匹配**，外部依赖永不阻断离线主路径。桥 `makeActionHandler({understandLlm})` 支持注入同步理解器（宿主自行异步调 LLM 后同步给结果）；不注入时行为与原来完全一致（纯关键词、零网络）。
- **条件格式更细：多条件→多色规则组**（`highlight` 增强）：用一个「规则组」写多条 `条件:颜色`（分号分隔，如 `工时>160:red;工时>140:yellow`），逐行按书写顺序**首命中生效**，实现分级标色（红/黄/绿三档等）；非法颜色的那条会被跳过而其余规则仍生效，规则组留空则回落原「单条件+单底色」行为（向后兼容）。
- **汇总统计 `sum`**（目标「透视/汇总」之一）：对数值列在作用范围内做聚合——**合计/平均/计数/最大/最小**，结果写入一张**独立工作表「汇总」**（不改原数据表任何单元格、不追加进本表；重复执行会覆盖同名 sheet，结果稳定）。预览即显示聚合值、参与行数与目标 sheet；确认经 `xlsx_bridge.py write-summary-sheet` 建/覆盖该 sheet 写盘。引擎 `KINDS.sum` + `preview` 的 `summaryRow` 元数据 + `CONFIRM` 汇总分支（标 `appendedSummarySheet`）；可选「符合条件」只统计命中行。
- **汇总一次可统计多列/多聚合**（`sum` 增强）：新增可选参数「多列汇总」，写分号分隔的规格串如 `工时:avg;时薪:max;姓名:count`（每项「列名:聚合」，聚合回落到「聚合方式」），一次产出多行汇总、写入「汇总」sheet 的不同区域（每项一行，表头「汇总项 / 值」，末尾补参与行数）。`preview.summaryRows` 为数组（`summaryRow` 仍等于首条，向后兼容旧消费者）；某列不存在则整条 invalid 并点名该列。
- **透视分组汇总（`sum` 增强）**：新增可选参数「分组列」——填某列（如「部门」）即按它 **group by**，每组一行、各规格项作列，产一张透视表写入「汇总」sheet（表头=分组列名 + 各「列·聚合」，行=各组、组顺序=首次出现顺序、空值归「（空）」组）。`preview.summaryPivot` 带 `groupColumn/headers/specMeta/rows/groupCount`；`CONFIRM` 的 `appendedSummarySheet.pivot` 携带落盘数据；桥 `write-summary-sheet` 识别 `{pivot:{...}}` 形态逐组写行。分组列不存在 → 预览前点名拦截。留空「分组列」则只出全表总计（原行为不变）。
- **多维透视（`sum` 增强·多级分组）**：新增可选参数「多级分组」，用分号分隔多列（如 `部门;月份`）即按多列**分层分组**、每组一行、表头为各级取值（如「销售 / 1月」「销售 / 2月」）。有「多级分组」时优先于「分组列」。`preview.summaryPivot` 增 `groupColumns`、每行增 `groupParts`；`CONFIRM` 的 `appendedSummarySheet.pivot` 同步携带；桥写多列两级表头 + 每组一行。某级分组列不存在 → 预览前点名拦截。
- **多动作流水线批处理**（一条流水线串多个动作一次执行）：在浮窗面板把配置好的动作逐步「加入流水线」，可多步追加/删除，一键「预览流水线」出组合预览（按步骤顺序执行、后一步看得到前一步结果，如先算「应发」列再对它标色），再「确认执行」一次性落盘。引擎新增 `runPipeline(steps, state)` + `reduce` 的 `PIPELINE` / 流水线 `CONFIRM` 分支；含 `sort` 等结构性动作（只改行序、不产单元格）不支持放进流水线，会明确拦截而非静默丢弃。

## [1.1.0] - 2026-11-21

「对标 🟡 便宜增量」小版本：把主流 AI 表格插件里**不改架构就能加**的四项能力补齐，让确定性改表线更完整。向前兼容，无破坏性变更。

### 新增（Added）
- `sort` **按列排序**：按任意列升序/降序重排整表**行顺序**（行内容不变、只改先后）；支持数值列按数值、文本列按字典序，排序稳定（同值保原序）。确认后经 `xlsx_bridge.py sort` 重排物理行序写盘，预览即显示排序后的表。
- `function` 新增 **`写入方式`** 参数（`数值` / `公式`）：`数值`（默认）把算好的真实数字写入；`公式` 写 A1 公式串（如 `=C2*D2`），打开 Excel/WPS 时按公式重算，保留表内公式关系。写公式后落盘自动经 LibreOffice 重算缓存值。
- `highlight` **单元格标色**：给一列满足条件的单元格刷底色（黄/红/绿/蓝，柔和色），不改任何值；条件可空=整列。写盘经 `xlsx_bridge.py` 刷 PatternFill。
- `function` **表达式引擎升级为多操作数**：从「操作数 单运算符 操作数」扩成任意多项 `+ - * /`，支持括号、运算优先级（先 `* /` 后 `+ -`）、一元负号。`toFormula` 渲染 A1 公式串、`computeValue` 实算数值均共享同一解析器；未知列/括号不匹配/除以零一律返回 null（不硬算）。

### 修复（Fixed）
- 面板一键 `function` 时，用户**自选一个新输出列名**（如"合计"，表里尚不存在）会被误改成默认的"应发"——现仅在输出列为空或等于主键时才兜底"应发"，用户显式给的新列名一律尊重。

### 已知边界（Known limits）
- 输入框仍是**关键词匹配的"假编译器"，不是 LLM**：只认动作关键词，不认自由改述/多动作/复杂条件。
- `dedupe` 只清空重复行、不物理删行；无透视/图表/翻译/分类/情感分析等（见 `docs/research/inputbox-vs-ai-sheets.md` 对标）。

## [1.0.0] - 2026-11-20

首个可上线版本。核心形态：宿主打开 xlsx/xls/csv 时**原表原样显示**（宿主原生可编辑网格），右下角多一个**不遮挡的浮窗按钮**，点开是「表格工作台」浮窗面板——一句话或一键动作 → 逐格预览 → 确认才落盘。

### 新增（Added）
- **10 个一键动作**（每动作带类型化 `paramSpec` 封闭校验）：
  - `extract` 提取字段（跨表按主键取值）
  - `swap` 调换两列
  - `conditional` 条件改动（增加/删去/删除/清空 + 行级条件）
  - `function` 公式计算（同行四则运算，写真实值）
  - `dedupe` 按主键去重（保留首条/末条）
  - `replace` 文本替换（子串替换 / 整列赋值）
  - `fill` 空值填充（仅填空格）
  - `trim` 去首尾空格
  - `case` 英文大小写
  - `affix` 加前后缀
- **浮窗形态**：宿主 `shell.overlay` 全局浮层渲染右下角 FAB + 悬浮面板，不抢占、不遮挡宿主原生 Excel 表格。
- **当前文件自动识别**：经 `sidebarRight.active()` 轮询当前打开的表格文件；**切换文件自动回到初始默认态**（清空输入/预览/提示）。
- **影响预览**：逐格 before→after、影响 N 行/共 M 行、部分改动强制披露（swapBanner）；表格化预览（受影响格黄底高亮 + 箭头，执行后去箭头保留高亮）。
- **五步主流程**：理解 → 校验 → 预览 → 确认 → 固化（存为按钮，可一键重跑/改名/改参/删除）。
- **新建表格**：空白表（可自选列 + 主键列）、从模板新建、上传 CSV/XLSX 建表。
- **能力位适配**：本地 Excel 全绿；飞书/腾讯在公式等能力处如实禁用并提示（`capability-matrix.md`）。
- `scripts/selfcheck.mjs` 一键自检脚本（`npm run selfcheck`）。

### 修复（Fixed）
- 动作名大小写 / 理解带输入文字 / swap 列名解析三个致命链路 bug（曾致"点了没反应/输入框是空的/同列自换"）。
- 浮窗按钮不出现（`shell.overlay` 改根 ctx 注册）、点不了（删待命死钮）、字段下拉为空（改用 `sidebarRight.active()` 取当前文件）。
- 浮窗预览"只有摘要没表格"（overlay 模式把表格渲染进面板体）。
- 切换文件残留旧表 / 旧绿字提示（key 变化清 override/slot + 重置面板本地 React state）。
- `replace` 的「查找」与「替换为」都为空时会误清空整列 → 现拦截、不改任何格。
- 重复主键写错行（按 `rowIndex` 精确定位）/ 影响行数少报（按行去重计 `affectedRows`）。
- `xlsx_bridge.py` 写盘丢失网格线/单元格样式（`showGridLines=True` + 复制同列样式）。

### 已知边界（Known limits）
- 输入框是**关键词匹配的「假编译器」，不是 LLM**：只认 10 类动作，不认自由改述/多动作/复杂条件。
- `dedupe` 只清空重复行、不物理删行；`function` 仅两操作数四则；排序已支持（`sort`，按单列升降序），但无透视/图表/翻译/分类等（见 `docs/research/inputbox-vs-ai-sheets.md` 对标）。
- 云端适配（飞书/腾讯）能力位保守记录、未全验证。

[1.1.0]: https://github.com/huobuzhe/ai_work/tree/master/workbench
[1.0.0]: https://github.com/huobuzhe/ai_work/tree/master/workbench
