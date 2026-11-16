# dsh-workbench（表格工作台 · 第一刀）

规格 [`#8`](https://github.com/huobuzhe/ai_work/issues/8) / 实施票 [`#9`](https://github.com/huobuzhe/ai_work/issues/9)、[`#11`](https://github.com/huobuzhe/ai_work/issues/11)、[`#12`](https://github.com/huobuzhe/ai_work/issues/12)、[`#13`](https://github.com/huobuzhe/ai_work/issues/13)、[`#14`](https://github.com/huobuzhe/ai_work/issues/14)、[`#15`](https://github.com/huobuzhe/ai_work/issues/15)、[`#16`](https://github.com/huobuzhe/ai_work/issues/16) 的可交付插件包。

把建表与日常繁琐表格操作收进按钮与输入框。**本包实现 Slice 1 本地 Excel 零凭据端到端闭环：提取字段 extract（票 #9）+ 自定义函数计算 function（票 #11）+ 作用范围/条件对所有动作生效（票 #12）+ swap 半换边界与披露 / conditional 增删补齐（票 #13）+ 封闭校验系统与预览卡完整五段（票 #14）+ 按钮固化与一键重跑 / 按钮库生命周期（票 #15）+ 仓内按钮注册表统一入口（票 #16）+ 模板库与建表（票 #10）**；云端 adapter、NL 一步编译成函数等属后续票，不在本包范围。

## 结构

- `lib/engine.js` — 纯「动作配方引擎」（主 seam）。输入声明式表格数据 + 一句话，输出封闭校验 / 影响预览 / 写值动作。不碰 UI、浏览器、xlsx 文件或插件注册。CommonJS。
- `client/index.js` — client 面板源码：经 `sidebarRightTabs.register`（`keepMounted:true`、`priority:'extension'`）+ `slots.register`（`sidebar.right.pane.tab`）把常驻右栏面板挂进宿主。
- `client/client.js` — 由 `scripts/build-client.mjs` 生成的浏览器 bundle（`window.__ModuleLoader__.load` 信封）。**勿手改**，改 `client/index.js` 后重跑 `npm run build:client`。
- `cordis.patch.yml` — bundle patch（`dsh.bundle.patch`），把插件插入 profile layer stack。
- `lib/engine.js` 的 `toFormula()` — function kind 的产物生成：把表达式 + 表头列序 + 记录序翻成 A1 公式字符串（如 `=C2*D2`）。**引擎只生成公式、绝不做 JS 求值**（#9 code-review Spec#5 的修正）；实际计算交给 LibreOffice。
- `scripts/xlsx_bridge.py` — 本地 xlsx/csv 文件桥（仅读写文件，无业务逻辑）；需要 Python + openpyxl。`read-xlsx` 读公式字符串，`read-values`（data_only=True）读重算后的缓存值。
- `scripts/acceptance-run.js` — extract 端到端验收编排：造 xlsx → 引擎 extract → 写回 → 读回断言。
- `scripts/acceptance-formula.js` — function 端到端验收编排：造 xlsx → 引擎生成公式 → 写回 → 调 bundled LibreOffice Kit 重算 → data_only 读回缓存值断言。CLI 路径可用 `WORKBENCH_LO_NODE` / `WORKBENCH_LO_CLI` 覆盖。
- `registry/*.json` — 仓内声明式按钮注册表（票 #16，git 作「线上」来源）：每份 JSON 一个预置按钮，含 name / source=preset / kind / params / schemaVersion；`lib/engine.js` 的 `loadRegistry()` 加载时做封闭校验（与配方校验共用规则），非法条目逐条拒绝不影响合法条目。
- `scripts/load-registry.js` — 注册表加载脚本（纯文件桥，票 #16）：读 `registry/*.json` → 调引擎 `loadRegistry()` → 输出校验结果与按钮清单；无网络、无云凭据、不写仓库。
- `test/` — `node:test`：纯引擎 11 例、面板注册契约 4 例、extract 端到端 1 例、function 公式纯引擎 8 例、function 重算端到端 1 例、scope/条件公共字段 12 例、swap/conditional 半换边界与披露 15 例、封闭校验与预览卡五段 24 例、按钮固化/一键重跑/按钮库生命周期 17 例、仓内注册表统一入口 25 例、模板库与建表 25 例 + 端到端 5 例、带类型参数声明层 13 例、paramSpec 校验迁移 15 例、typed 声明统一来源 9 例（共 185 例）。

## 构建 / 验证

```bash
npm run build:client      # 重新生成 client/client.js
npm test                  # 全测（185 例）
npm run acceptance        # extract 端到端验收，打印逐行读回结果
npm run acceptance:formula # function 端到端验收（含 LibreOffice 重算），打印重算后缓存值
```

function 重算用 bundled LibreOffice Kit CLI（非系统 soffice）：默认路径指向本机 bundled 安装，换环境时用 `WORKBENCH_LO_NODE` / `WORKBENCH_LO_CLI` 覆盖。

无第三方依赖：测试只用 Node 内置 `node:test` + `node:vm`；文件读写只用本机 Python + openpyxl。本仓无 TypeScript 编译器，全包为纯 JS，类型安全以 `node --check` 语法检查代替（无 tsc，不伪造 typecheck）。

## 边界（Slice 1 / 票 #9、#11、#12、#13、#14、#15、#16、#10）

- 零云凭据：不涉及飞书 / 腾讯 / Microsoft Graph。函数计算由本地 LibreOffice 重算，不调用任何云 API。
- 配方是声明式数据（kind + params），不含可执行代码；function 的表达式经封闭校验后才生成公式。
- 引擎不实现求值器：function 只产出公式字符串 + 命名参数，计算/缓存值由计算引擎（LibreOffice）负责、读回验证。不承诺把任意自然语言直接编译成命名函数（输入用关键词匹配假编译器）。
- 作用范围是公共字段（票 #12）：四类动作（extract/swap/conditional/function）都有 `scope`（all|match）与 `条件`，默认 all（conditional 本质是条件、默认 match）。**决策记录（#12 code-review Spec F1 → 票 #17 规格层正式采纳）**：conditional 默认 `match`、其余三类默认 `all`——基线 #9 里 conditional 总是按私有条件过滤（scope 对它无效），移除私有过滤后若默认 `all`，快捷按钮会命中全部行（相对 #9 的行为回归、违背用户故事 15）；默认 `match` 精确保留 #9 行为、同时让 scope 真正可控（改 `all` 成为显式选择）。此前该偏离只在 README 记录、规格 #8 line 101 仍写「默认 all」，形成规格层悬空；票 #17 已在规格 #8 line 101 补入 conditional 例外条款与理由、规格层正式采纳，本处与规格措辞一致，不再是隐性规格漂移。代码保持 `KINDS.conditional.params.scope = 'match'`、其余三类 `'all'`，无行为变更。条件按行（记录）筛选、不做列级条件；scope 在「解释与影响预览」卡内可改并联动「影响 N 行 / 共 M 行」；零命中是合法意图（标「影响 0 行 / 共 M 行」、允许确认），不新增第 6 步。
- swap 半换边界与披露（票 #13）：整列互换（scope=all）与按命中行半换（scope=match）都确定可测；**同列自换（字段A=字段B）与未知列在封闭校验阶段拒绝**（确定性边界；「调换两段字段」要求两列都已存在，比 extract「写列可新建」更严是有意决策）。半换时 `cells` 只发命中行的格子，未命中行由结构化 `disclosure`（swappedRows / unchangedRows / mixedColumns / partial + counts）显式列出，并给出 `swapBanner`「N 行交换、M−N 行不变；列 X、Y 将混合两种来源」——**披露是硬要求，不掩盖部分改动**；命中/未命中的区分由 disclosure 承载、不设恒真的逐格标记；整列互换或零命中都不标混合来源。conditional 增删按公共 scope/条件作用于命中行，零命中标「影响 0 行 / 共 M 行」。四类动作共用同一引擎配方接口、无第二套状态机。
- 封闭校验系统（票 #14）：`lib/engine.js` 的 `validate()` 是按参数类型派生的封闭清单——缺 schemaVersion / 版本读不懂 / 参数含白名单外字段 / 非法 scope·condition / 各类必填缺失一律拒绝，逐条产出结构化 `issue{field,reason}`；在预览前跑完、任一失败都不落盘。校验失败也出预览卡：第②段列出失败项、禁用确认（非法配方 CONFIRM 被状态机拦下、表格不动）。**这里修掉一个真实安全缺口**：票 #14 之前，含未知字段的配方能通过校验并被 CONFIRM 执行；现在封闭白名单拒绝它。CONFIRM 另加一道纵深防御：执行前对 `state.draft` 再跑一次 `validate()`，防止宿主持久化/重水合或外部改动让 state 在 PREVIEW 与 CONFIRM 间漂移后仍执行失效配方（Standards review finding #1，附 AC5b 测试）。issue 的「就地修正控件」由宿主按 `issue.field` 渲染，本包只交结构化视图模型、不内嵌 UI。
- 预览卡五段 view-model 骨架（票 #14）：`client/index.js` 的 `projectPreviewCard(state)` 输出 `sections.{explain,validation,scopeParams,impact,confirm}`——① 解释（kind/medium/params/steps）② 校验清单（ok + 逐条 issue，带 `currentValue` 供宿主预填修正控件）③ 作用范围与命名参数（scope/条件/参数，可改联动重算）④ 影响预览（将改格子 + 影响 N 行/共 M 行 + swap 混合来源 banner，均来自引擎实际计算、非死数据）⑤ 确认/取消（canConfirm 仅在校验通过且 stage=PREVIEWED 时为真）。整卡是 5 步管线第②步、不是第 6 步；`#9/#12/#13` 的扁平字段保留向后兼容。
- **诚实边界（Spec review finding 2/3/4/6）**：五段的**数据**来自真实计算、非死数据，但以下属于「宿主渲染 / 更大数据模型」、不在本纯 seam 包内——② 的就地可编辑修正控件 UI（本包只给 `issue{field,reason,currentValue}`，控件由宿主渲染，与 #12 Spec F3 一致）；④ 的命中行优先截断 / 「算不出来」标红可视化（cell.invalid 字段存在但当前校验在产格前就拒绝非法表达式，这条渲染路径暂不可达）。另：`主键列唯一非空` 是规格派生清单项、pre-existing 未纳入 #14 的 AC，defer。**③ 的带类型参数声明已实现（票 #20 T3 Contract，对齐规格 #8 line 109）**：`KINDS.*.paramSpec` 是 `{key,类型,必填,默认值,约束}` 的 typed 声明（公共字段 scope/条件在 `COMMON_PARAMS`），`typedParamSpec(kind)` 是其唯一来源，`defaultsFor(kind)` 由 `默认值` 派生出四类动作的初始参数（旧 `KINDS.*.params` 默认值 map 已删除，不再有第二套来源）；`preview()` 在返回里带 `paramSpec`，预览卡第③段 `scopeParams.paramSpec` 原样投影这份 typed 声明供宿主渲染每参控件（仍是纯 view-model、不含 UI 控件）。这些均如实记录、不冒充已实现。
- 按钮固化与一键重跑（票 #15）：执行后配方经 `SOLIDIFY` 固化为「命名 + 带参数」按钮存入按钮库（`buttons`，声明式、无可执行代码）；`RENAME_BUTTON` / `SET_BUTTON_PARAMS` / `DELETE_BUTTON` 全生命周期齐备，改参数在变更边界也走封闭校验（非法/白名单外参数当场拒绝，不写进 Host 权威源）。`nextButtonId` 扫描现有 id 取 max+1，删除后新建不与现存 id 冲突（修 `length+1` bug）；`cloneButton` 做顶层防御性拷贝（`params` / `steps` 的值按当前模型均为字符串字面量、无嵌套对象；若将来参数值允许嵌套需升级为深拷贝——如实记录）、`initial(data.buttons)` 水合、`exportButtons(state)` 导出——按钮库持久化走 Host 权威源，本包没有任何写文件/仓库的代码。一键重跑 `RUN_BUTTON` 走与首次同一条 `validate → preview → applyCells` 管线：**参数一处没改才真一键直接执行（跳过的是「用户确认」这一步，`validate`/`preview` 照跑不误）；改了任何参数就强制退回「解释与影响预览 → 用户确认」**。零命中也可固化为按钮、带 `emptyRun` / `lastAffectedRows` 运行态标记，每次重跑从当前数据重算标记。面板 `client/index.js` 的 `projectButtonLibrary(state)` 把按钮库投影成视图模型（仅 8 个声明字段、不含函数/内部引用），body 返回 `{preview, buttonLibrary}` 两块、所有按钮统一在面板呈现。不做云端原生按钮投影（AC5，后续 effort）。
- 仓内按钮注册表统一入口（票 #16）：`registry/*.json` 是仓内声明式预置按钮（git 作线上来源，每按钮一份 JSON），`lib/engine.js` 的 `loadRegistry(entries,state)` 逐条做**封闭校验**——顶层字段白名单（只收 schemaVersion/name/source/kind/params 五字段，可执行代码类与 medium/steps 派生字段一律拒绝）、source 必须为 preset、按钮名非空且不重复（用无原型字典，constructor/__proto__ 等名字不被误判）、schemaVersion / 参数定义 / kind 全交给配方校验系统 `validate()` 同一套规则，非法条目逐条拒绝并报具体原因、不影响合法条目；合法条目派生完整声明式配方（steps/medium）成 `source='preset'` 按钮。`hydrateRegistry(state,buttons)` 水合进 `state.registryButtons`，与使用者固化的 `state.buttons`（source='user'）分开存。`client/index.js` 的 `projectButtonLibrary(state)` 把**预置 + 固化两类来源合并到同一按钮库**，`source` 字段可区分（preset/user），预置 id 用 `p*` 前缀、固化用 `b*` 前缀不冲突；`cloneButton` 保留来源与按钮级 schemaVersion（旧按钮无 source 默认 user、无 schemaVersion 默认 SCHEMA_VERSION，向后兼容）。注册表条目本身不含可执行代码。
  - **Host seed 契约（预置按钮的生产接线，code-review H1 修复）**：本包是纯 seam 包、不读文件、面板 body 由宿主驱动（与 user 按钮「Host 权威源持久化、本包只投影」对称）。宿主构造工作台 hostState 时：① 跑 `node scripts/load-registry.js` 读 stdout 的 JSON；② 取 `.registryButtons`（**完整按钮**：含 id/name/kind/source/schemaVersion/params/medium/steps）作为 `data.registryButtons` 传给 `initial()`，或传给 `hydrateRegistry(state, list)`；③ 面板 body 的 `buttonLibrary` 即同时含 preset 与 user。加载脚本输出**完整清单**（早期残缺 manifest 即使被 seed 也渲染不出可用按钮，已修）。**统一入口也能一键运行**：`RUN_BUTTON` 在固化按钮之外也查预置按钮（p*），运行态标记写回对应来源数组——预置按钮不是纯展示。
  - **校验分层**：加载时做结构性封闭校验（版本/字段白名单/必填/scope/condition 语法，故 `loadRegistry(entries, null)` 可接受）；与具体表格绑定的检查（来源文件是否在 sources、列是否存在、公式列引用）在运行时 QUICK/RUN_BUTTON 针对该表再跑 `validate()`——注册表条目跨表通用、不能绑死某张表。
  - **诚实边界（code-review defer）**：预置按钮的资源打包（npm `files` 白名单含 registry/）与「宿主是否/何时 seed」属发布与集成层、不在纯 seam 包内；注册表的 `source` 枚举只在加载入口约束为 preset（通用按钮模型的 source 由 clone/project 兜底为 user/preset）；按钮库字段枚举在 `cloneButton`（engine）与 `projectOne`（client）各有一份、新增字段须同步（漂移风险已记录）。
- 「一键运行跳过确认」仅限固化按钮且参数一字未改：跳过的是确认这一步、校验与影响预览照跑；其余任何写值（首次执行、导览、改过参数的重跑）必须先预览、用户确认后才写值。
- 不改 `apps/web` shell，不起独立 Vite 应用；表格视图的可编辑 grid 形态（研究未验证 #4）留待后续票，本面板 body 仅验证注册契约。
- 模板库与建表（票 #10）：四种入口（blank / template / upload / description）统一走 `createTable({mode})` 产出 `{primaryKey, columns, types, rows?}`；仓内声明式模板清单 `templates/*.json`（`列名→类型` 枚举 text/number/date/bool/enum 取三家交集、`primaryKey` 默认「姓名」、`columns` 白名单、`schemaVersion`），类型映射表 `templates/type-mapping.json` 进仓内，`scripts/load-templates.js` 是纯文件桥（读清单→`validateManifest`→stdout 完整清单 + 宿主契约）。**上传校验**：`xlsx_bridge.py probe` 探测字节（PK 魔数 / openpyxl 可开 / 加密 / 带宏），`checkUpload(probe)` 判格式白名单（只收 .xlsx/.csv/.tsv）+ 加密 / 带宏 / 改名伪装（xlsx 非 zip 或打不开即拒），`validateRows(rows,manifest)` 报必填列 / 主键唯一非空 / 类型可映射的具体列。**冲突检测**：`detectConflicts(incoming, existing, replace)` 逐条比对模板名 / 主键 / 列白名单与类型 / schemaVersion，同名或同主键任一不一致即列冲突并拒绝、`autoMerged:false` 不自动合并，**显式 `replace:true` 才放行**。**描述建表**信息不足（缺主键或列清单）返回 `questions`、`structure:undefined` 不猜值。校验与建表全部复用同一引擎 `lib/engine.js`；不新增第二套状态机。
  - **诚实边界（票 #10）**：本包是纯 seam 包，不写文件、不碰 git——「显式替换才写入且 git 留痕」的**实际落盘与 git 提交由宿主/发布层负责**（与 #16 host seed 契约对称），本包只提供 `detectConflicts` 的放行判定与完整清单；真实文件字节探测在 `scripts/xlsx_bridge.py`（判定逻辑仍在引擎，桥只做 IO）；类型映射表仅做**名字级** text/number/date/bool/enum → local/feishu/tencent 映射，云端字段的数字编码留给 Slice 2 adapter，本切片不实现。
