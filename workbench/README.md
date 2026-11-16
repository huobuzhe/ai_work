# dsh-workbench（表格工作台 · 第一刀）

规格 [`#8`](https://github.com/huobuzhe/ai_work/issues/8) / 实施票 [`#9`](https://github.com/huobuzhe/ai_work/issues/9)、[`#11`](https://github.com/huobuzhe/ai_work/issues/11)、[`#12`](https://github.com/huobuzhe/ai_work/issues/12)、[`#13`](https://github.com/huobuzhe/ai_work/issues/13) 的可交付插件包。

把建表与日常繁琐表格操作收进按钮与输入框。**本包实现 Slice 1 本地 Excel 零凭据端到端闭环：提取字段 extract（票 #9）+ 自定义函数计算 function（票 #11）+ 作用范围/条件对所有动作生效（票 #12）+ swap 半换边界与披露 / conditional 增删补齐（票 #13）**；云端 adapter、NL 一步编译成函数等属后续票，不在本包范围。

## 结构

- `lib/engine.js` — 纯「动作配方引擎」（主 seam）。输入声明式表格数据 + 一句话，输出封闭校验 / 影响预览 / 写值动作。不碰 UI、浏览器、xlsx 文件或插件注册。CommonJS。
- `client/index.js` — client 面板源码：经 `sidebarRightTabs.register`（`keepMounted:true`、`priority:'extension'`）+ `slots.register`（`sidebar.right.pane.tab`）把常驻右栏面板挂进宿主。
- `client/client.js` — 由 `scripts/build-client.mjs` 生成的浏览器 bundle（`window.__ModuleLoader__.load` 信封）。**勿手改**，改 `client/index.js` 后重跑 `npm run build:client`。
- `cordis.patch.yml` — bundle patch（`dsh.bundle.patch`），把插件插入 profile layer stack。
- `lib/engine.js` 的 `toFormula()` — function kind 的产物生成：把表达式 + 表头列序 + 记录序翻成 A1 公式字符串（如 `=C2*D2`）。**引擎只生成公式、绝不做 JS 求值**（#9 code-review Spec#5 的修正）；实际计算交给 LibreOffice。
- `scripts/xlsx_bridge.py` — 本地 xlsx/csv 文件桥（仅读写文件，无业务逻辑）；需要 Python + openpyxl。`read-xlsx` 读公式字符串，`read-values`（data_only=True）读重算后的缓存值。
- `scripts/acceptance-run.js` — extract 端到端验收编排：造 xlsx → 引擎 extract → 写回 → 读回断言。
- `scripts/acceptance-formula.js` — function 端到端验收编排：造 xlsx → 引擎生成公式 → 写回 → 调 bundled LibreOffice Kit 重算 → data_only 读回缓存值断言。CLI 路径可用 `WORKBENCH_LO_NODE` / `WORKBENCH_LO_CLI` 覆盖。
- `test/` — `node:test`：纯引擎 11 例、面板注册契约 4 例、extract 端到端 1 例、function 公式纯引擎 8 例、function 重算端到端 1 例、scope/条件公共字段 12 例、swap/conditional 半换边界与披露 15 例（共 52 例）。

## 构建 / 验证

```bash
npm run build:client      # 重新生成 client/client.js
npm test                  # 全测（52 例）
npm run acceptance        # extract 端到端验收，打印逐行读回结果
npm run acceptance:formula # function 端到端验收（含 LibreOffice 重算），打印重算后缓存值
```

function 重算用 bundled LibreOffice Kit CLI（非系统 soffice）：默认路径指向本机 bundled 安装，换环境时用 `WORKBENCH_LO_NODE` / `WORKBENCH_LO_CLI` 覆盖。

无第三方依赖：测试只用 Node 内置 `node:test` + `node:vm`；文件读写只用本机 Python + openpyxl。本仓无 TypeScript 编译器，全包为纯 JS，类型安全以 `node --check` 语法检查代替（无 tsc，不伪造 typecheck）。

## 边界（Slice 1 / 票 #9、#11、#12、#13）

- 零云凭据：不涉及飞书 / 腾讯 / Microsoft Graph。函数计算由本地 LibreOffice 重算，不调用任何云 API。
- 配方是声明式数据（kind + params），不含可执行代码；function 的表达式经封闭校验后才生成公式。
- 引擎不实现求值器：function 只产出公式字符串 + 命名参数，计算/缓存值由计算引擎（LibreOffice）负责、读回验证。不承诺把任意自然语言直接编译成命名函数（输入用关键词匹配假编译器）。
- 作用范围是公共字段（票 #12）：四类动作（extract/swap/conditional/function）都有 `scope`（all|match）与 `条件`，默认 all（conditional 本质是条件、默认 match）。**决策记录（#12 code-review Spec F1）**：规格 #8 / 票 #12 原文写「默认 all」；conditional 默认 `match` 是对该字面的一处有意偏离——基线 #9 里 conditional 总是按私有条件过滤（scope 对它无效），移除私有过滤后若默认 `all`，快捷按钮会命中全部行（相对 #9 的行为回归、违背用户故事 15）；默认 `match` 精确保留 #9 行为、同时让 scope 真正可控（改 `all` 成为显式选择）。两轴 review 判定该偏离合理、不回退，在此显式记录以免被误读为隐性规格漂移。条件按行（记录）筛选、不做列级条件；scope 在「解释与影响预览」卡内可改并联动「影响 N 行 / 共 M 行」；零命中是合法意图（标「影响 0 行 / 共 M 行」、允许确认），不新增第 6 步。
- swap 半换边界与披露（票 #13）：整列互换（scope=all）与按命中行半换（scope=match）都确定可测；**同列自换（字段A=字段B）与未知列在封闭校验阶段拒绝**（确定性边界；「调换两段字段」要求两列都已存在，比 extract「写列可新建」更严是有意决策）。半换时 `cells` 只发命中行的格子，未命中行由结构化 `disclosure`（swappedRows / unchangedRows / mixedColumns / partial + counts）显式列出，并给出 `swapBanner`「N 行交换、M−N 行不变；列 X、Y 将混合两种来源」——**披露是硬要求，不掩盖部分改动**；命中/未命中的区分由 disclosure 承载、不设恒真的逐格标记；整列互换或零命中都不标混合来源。conditional 增删按公共 scope/条件作用于命中行，零命中标「影响 0 行 / 共 M 行」。四类动作共用同一引擎配方接口、无第二套状态机。
- 不暴露「一键运行跳过确认」：必须先预览、用户确认后才写值。
- 不改 `apps/web` shell，不起独立 Vite 应用；表格视图的可编辑 grid 形态（研究未验证 #4）留待后续票，本面板 body 仅验证注册契约。
