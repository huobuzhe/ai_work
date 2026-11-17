# 表格自动化工作台 · 使用与二次开发指南

> 版本对应：仓库 `huobuzhe/ai_work`，`workbench/` 包 `dsh-workbench@0.1.0`。
> 本文面向两类读者：**使用者**（想用它处理表格，或想跑起来看效果）与**开发者**（想在这个基础上加功能、改功能）。
> 想先了解"这是什么、能不能用"请看仓库根 [README](../README.md)；想查历史决策请直接读 [workbench/README.md](../workbench/README.md) 与各 issue。

---

## 目录

- [一、这个项目能做什么](#一这个项目能做什么)
- [二、环境准备](#二环境准备)
- [三、快速开始（使用者视角）](#三快速开始使用者视角)
- [四、四种能力详解](#四四种能力详解)
- [五、架构地图（开发者必读）](#五架构地图开发者必读)
- [六、二次开发：加一个新功能](#六二次开发加一个新功能)
- [七、二次开发：改一个已有功能](#七二次开发改一个已有功能)
- [八、让验收与回归保持绿](#八让验收与回归保持绿)
- [九、一次完整改动的标准流程（含记录模板）](#九一次完整改动的标准流程含记录模板)
- [十、常见坑与边界](#十常见坑与边界)

---

## 一、这个项目能做什么

**一句话**：把「建表 + 日常繁琐表格操作」收进一套声明式按钮，一键复用；本包已在**本地 Excel（零凭据）**上跑通端到端闭环，并交付了**飞书 / 腾讯文档**的云端 adapter 规格与请求计划（云端公式能力位结构上不支持的，如实禁用）。

四类动作（"配方 kind"）：

| kind | 中文 | 干什么 | 是否依赖公式能力 |
| --- | --- | --- | --- |
| `extract` | ① 提取字段 | 按主键把另一个文件（csv/xlsx）里的一列左连接进主表 | 否（只读写单元格值） |
| `swap` | ② 调换两段字段 | 两列整列互换，或按条件"半换"并披露哪些行没动 | 否 |
| `conditional` | ③ 带条件增删 | 按条件筛选后批量写值 / 清空 | 否 |
| `function` | ④ 自定义函数计算 | 生成 A1 公式（如 `=C2*D2`），交给计算引擎重算 | **是**（能力位 false 的平台禁用） |

配套能力：**模板库与建表**（blank / template / upload / description 四入口）、**按钮固化与一键重跑**（参数没改才真一键）、**仓内预置按钮注册表**。

---

## 二、环境准备

**必须**：

- **Node.js ≥ 22**（`workbench/package.json` 的 `engines` 要求；本机实测 `v22.22.2`）。
- **Python 3 + openpyxl**：用于本地 xlsx/csv 文件桥（`scripts/xlsx_bridge.py`）。本机为 `Python 3.6.5`，已带 openpyxl。

**运行 `function` 重算时还需要**：bundled 的 **LibreOffice Kit CLI**（不是系统 `soffice`）。默认路径指向本机 bundled 安装；换环境时用环境变量覆盖：

- `WORKBENCH_LO_NODE`——LibreOffice Node 模块路径
- `WORKBENCH_LO_CLI`——LibreOffice Kit CLI 可执行路径

**可选（仅云端实测时）**：飞书 / 腾讯文档凭据环境变量（见 [§八](#八让验收与回归保持绿) 的云端段）。日常开发与本地验收**完全不需要**任何云凭据。

> 无第三方 npm 依赖：测试只用 Node 内置 `node:test` + `node:vm`；无 TypeScript 编译器，全包纯 JS，类型安全以 `node --check` 语法检查代替。

---

## 三、快速开始（使用者视角）

所有命令都在 `workbench/` 目录下执行：

```bash
cd workbench
npm test                 # 跑全量测试（计数以实际输出为准）
npm run acceptance       # ① extract 端到端验收：造表→提取→写回→读回断言
npm run acceptance:formula  # ④ function 端到端验收：造表→生成公式→写回→LibreOffice 重算→读回比对
```

**验收通过长什么样**（本机实跑）：

`npm run acceptance` 会打印 `actual` 与 `expected` 两份"姓名→邮箱"映射，二者一致即 extract 闭环通过。

`npm run acceptance:formula` 会打印 `valuesMatch: true` 与 `__engineMatchesFile: true`、`__formulaSurvived: true`，表示公式列（应发 = 工时 × 时薪）在 LibreOffice 重算后读回的值与期望一致。

> 这两个脚本是**可复用的流程函数**，不是测试框架。它们演示了"引擎只读声明式数据、文件 IO 全部集中在 Python 桥"的分层——这正是你二次开发时要遵守的边界。

---

## 四、四种能力详解

### ① extract（提取字段）

- 参数（`paramSpec`，可见于 `lib/engine.js:17` 的 `extract`）：`来源文件`（默认 `外勤登记表.csv`）、`匹配列`（默认 `姓名`，必须已存在）、`取哪一列`（默认 `邮箱`）、`写到`（默认 `邮箱`，可新建列）。
- 语义：按 `匹配列` 在主表与来源文件之间左连接，把 `取哪一列` 写到 `写到`。**列可新建**（比 swap 宽松）。
- 验收脚本：`scripts/acceptance-run.js`。

### ② swap（调换两段字段）

- 参数（`lib/engine.js:29` 的 `swap`）：`字段A`（默认 `部门`）、`字段B`（默认 `备注`），两列都必须已存在。
- 语义：整列互换（`scope=all`）或按条件半换（`scope=match`）。
- **硬边界**：同列自换（字段A=字段B）与未知列在**封闭校验阶段直接拒绝**；半换时未命中行由结构化 `disclosure` 显式列出（`swappedRows/unchangedRows/mixedColumns/partial` + counts），并给 `swapBanner` 提示"列 X、Y 将混合两种来源"——披露是硬要求，不掩盖部分改动。

### ③ conditional（带条件增删）

- 参数（`lib/engine.js:38` 的 `conditional`）：`动作`（枚举：增加/删去/删除/清空）、`目标列`（可新建）、`值`。
- 语义：按公共 `scope` + `条件` 作用于命中行；零命中是合法意图（标"影响 0 行 / 共 M 行"）。
- **重要决策**：`conditional` 的 `scope` 默认是 `match`（其余三类默认 `all`）——为精确保留 Slice 1 行为，详见 `workbench/README.md` 与规格 #8/#17。

### ④ function（自定义函数计算）

- 参数（`lib/engine.js:50` 的 `function`）：`表达式`（默认 `工时 * 时薪`，必须可翻译）、`输出列`（默认 `应发`）。
- 语义：**引擎只生成 A1 公式字符串**（`toFormula()`，如 `=C2*D2`），**绝不做 JS 求值**；实际计算交给 LibreOffice Kit。
- **能力位门禁**：`function` 依赖 `formulaCapabilities`。本地 Excel 四格 true → 可用；飞书/腾讯四格 false → `preview()` 直接把该动作 `disabled:true` 并给原因，`cells:[]`，**绝不静默降级、不写死值、不偷偷算成值**。

---

## 五、架构地图（开发者必读）

分层非常清晰，**改动前务必认清这一条边界**：

```
       宿主（Host, 本包之外）
          │  传入 data、接收 body 投影
          ▼
  client/index.js  ── 纯投影 ──►  预览卡 / 按钮库 view-model（不碰数据本体）
          │  (经 scripts/build-client.mjs 打包成 client/client.js，勿手改)
          ▼
  lib/engine.js    ── 主 seam ──►  纯函数状态机：初始数据 + 一句话 → 校验/预览/写值动作
          │                       不碰 UI、浏览器、xlsx 文件、插件注册
          ▼
  scripts/*.js     ── 文件桥/编排 ──►  xlsx_bridge.py (Python+openpyxl) / acceptance 编排
          │
          ▼
   本地 Excel 文件 / （可选）云端 adapter 请求计划（纯声明，不含真实凭据值）
```

**核心文件与职责**：

| 文件 | 职责 | 关键导出/入口 |
| --- | --- | --- |
| `lib/engine.js` | 主 seam：动作配方引擎，纯函数状态机 | `initial / understand / buildDraft / validate / preview / applyCells / reduce / exportButtons / loadRegistry / hydrateRegistry / createTable / validateCredentials` 等（见 `lib/engine.js:1237` 的 `module.exports`） |
| `client/index.js` | client 面板源码，注册右栏面板 + 输出 view-model | `registerWorkbenchPanel / projectPreviewCard / projectButtonLibrary` |
| `client/client.js` | **生成物**，`window.__ModuleLoader__.load` 信封 | —— 改 `client/index.js` 后 `npm run build:client` |
| `cordis.patch.yml` | bundle patch，把插件插进 profile layer stack | `dsh.bundle.patch` |
| `scripts/xlsx_bridge.py` | 本地 xlsx/csv 文件桥（仅 IO，无业务逻辑） | 子命令 `init-main / init-source / read-xlsx / read-values / read-csv / apply / probe` |
| `scripts/acceptance-run.js` | extract 端到端验收编排 | —— |
| `scripts/acceptance-formula.js` | function 端到端验收编排（含 LibreOffice 重算） | —— |
| `registry/*.json` | 仓内声明式预置按钮（git 作"线上"来源） | `loadRegistry()` 加载校验 |
| `templates/*.json` + `templates/type-mapping.json` | 仓内声明式模板清单 + 类型映射 | `createTable()` / `loadManifest` 流程 |

**状态机（`reduce(state, action)` 的动作全集，见 `lib/engine.js:1067`）**：

- 配方向：`SET_INPUT` → `UNDERSTAND` → `PREVIEW` → `CONFIRM`（或 `CANCEL`）
- 快捷：`QUICK`
- 按钮：`SOLIDIFY`、`RENAME_BUTTON`、`SET_BUTTON_PARAMS`、`DELETE_BUTTON`、`RUN_BUTTON`
- 导览：`START_WALK`、`WALK_STEP`
- 重置：`RESET`

`state` 由 `initial(data)` 构造（`lib/engine.js:967`），关键字段：`schemaVersion / adapter / primaryKey / columns / rows / sources / stage / draft / preview / buttons / registryButtons / log`。

**三种 view-model 的投影边界**：`engine` 只产出结构化数据（`preview()` 返回 `cells / affectedRows / totalRows / invalid / disabled / issues / disclosure / swapBanner / paramSpec / capabilityBlockers`），`client/index.js` 只把结构化数据投影成面板视图（`projectPreviewCard` 的 5+1 段、`projectButtonLibrary` 的按钮列表）。**不要在 client 里做业务计算，也不要在 engine 里碰 UI。**

---

## 六、二次开发：加一个新功能

假设你要加**第五类动作**（例如 `dedupe` 按主键去重）。按这个顺序做，每一步都跑测试。

### 步骤 1：在 `lib/engine.js` 的 `KINDS` 里声明动作与参数

`KINDS` 在 `lib/engine.js:16`。照现有四类加一项，**用带类型 `paramSpec` 声明参数**（不要写旧式默认值 map，已废弃）：

```js
dedupe: {
  label: '⑤ 按主键去重', short: '按主键去重',
  medium: '结构化动作：按主键保留一条、删去重复',
  paramSpec: [
    { key: '保留策略', 类型: '枚举', 必填: true, 默认值: '首条', 约束: { enum: ['首条', '末条'] } },
  ]
}
```

参数类型可选：`text / number / date / bool / enum / 列名 / 文件 / 表达式`（见 `COMMON_PARAMS` 与 `TYPE_ENUM`）。约束支持 `mustExist`（列必须存在）、`newColumn`（可新建列）、`enum`、`translatable`（表达式可翻译）等。

### 步骤 2：判断它是否依赖公式能力位

- 只读写单元格值（结构化动作）→ 在 `KIND_CAPABILITY_DEPS`（`lib/engine.js:104`）**不加**依赖，任何 adapter 都能用。
- 产出公式/需要重算 → 在 `KIND_CAPABILITY_DEPS` 声明依赖 `functionSet` 之类，`capabilityBlockersOf()` 会自动在云端禁用。

### 步骤 3：实现预览计算

在 `preview()`（`lib/engine.js:827`）的 `switch (draft.kind)` 里加分支，用 `add(row, col, before, after, invalid, source)` 产出将改的格子。**只产出命中行的格子**，未命中行不要产格（与 swap 半换的纪律一致）。若涉及部分改动，务必填 `disclosure` 与 banner 披露。

> 注意：`validate()`（`lib/engine.js:693`）会按 `paramSpec` **自动派生**校验，新动作的参数校验大多数情况下**无需手写**——只要你把 `paramSpec` 声明对。只有跨参数/绑表检查（列是否存在、公式列引用）才需要额外逻辑。

### 步骤 4：补测试（TDD：先红后绿）

在 `test/` 下加 `<feature>.test.js`，用 `node:test`。测试驱动的标准写法见 `test/engine.test.js`：

```js
const E = require('../lib/engine');
const s = E.initial(DATA);                 // DATA = { primaryKey, columns, rows, sources }
const draft = E.buildDraft('dedupe', '把重复的人去掉');
assert.equal(E.validate(draft, s).ok, true);
const pv = E.preview(s, draft);            // 断言 pv.cells / affectedRows / targetTotal
```

**测试只验证外部可观察行为**（cells、affectedRows、invalid/disabled、披露内容），不验证内部结构。

### 步骤 5：端到端（若涉及文件 IO）

若新动作需要读文件，**不要在 engine 里碰文件**。在 `scripts/xlsx_bridge.py` 加子命令（对应 `sys.argv` 分支，见 `scripts/xlsx_bridge.py:138`），再在 `scripts/acceptance-*.js` 里编排"造表→引擎→写回→读回断言"。

### 步骤 6：更新文档与注册表

- 在 `workbench/README.md` 的「边界」节给新动作写一段（做什么、边界、诚实说明哪些没做）。
- 若要做成预置按钮，在 `registry/` 加一份 JSON（照 `registry/preset-extract-email.json` 的形状，顶层只允许 `schemaVersion/name/source/kind/params` 五字段）。

---

## 七、二次开发：改一个已有功能

### 改参数 / 校验规则

- 改 `KINDS.<kind>.paramSpec`（`lib/engine.js:16`）里的 `默认值 / 约束`。校验会自动跟着变（`deriveIssues` 从 paramSpec 派生）。
- **不要**为了兼容去加第二套默认值来源——旧 `KINDS.*.params` map 已删除（票 #20），`typedParamSpec()` 是唯一来源。

### 改预览卡显示

- 计算逻辑在 `preview()`，显示投影在 `client/index.js` 的 `projectPreviewCard`（`client/index.js:19`）。
- 改完**必须** `npm run build:client` 重新生成 `client/client.js`（该文件头写着 `GENERATED ... do not edit by hand`）。
- 面板是 5+1 段（解释/校验/作用范围/影响/确认 + 能力位辅助段），别把它拆成第 6 步。

### 改云端 adapter 请求计划

- 飞书：`lib/feishu-adapter.js` 的 `buildFeishuPlan`；腾讯：`lib/tencent-adapter.js` 的 `buildTencentPlan`。
- **铁律**：请求计划里**绝不含真实凭据值**（只带占位 `auth`），真实值只从本机环境变量在 `scripts/*-adapter.js --live` 时读、只在内存用、绝不打印/落盘。
- **类型码单源**：类型名映射只能取自 `engine.TYPE_MAP[x].feishu/.tencent`，不另立第二套。未验证的数字码/写入形态收进 `unverifiedTypes[]`，`--live` 在无 `--allow-unverified-types` 时拒绝真跑（不把未验证 magic number 悄悄塞进真实请求）。
- **能力位不得伪造**：云端公式能力位是结构上 false（一手负面证据），链路跑通只升级"证据"、**绝不把 verdict 翻成 true**（`recordLiveEvidence` 有测试钉死不翻 verdict）。

### 改能力位矩阵

- 唯一真相源是 `engine.ADAPTERS[id].formulaCapabilities`；`lib/capability-matrix.js` 只是"验尸视图"，每格 `verdict` 从它派生。
- 加载即自检 `assertNoUnbackedTrue()`：`verdict:true` 必 `runnable:true` 且必须真跑通过、`verdict:false` 必带 `failingStep`、每格必带 `evidence`。
- 改落盘矩阵后跑 `npm run capability:probe --write-matrix` 重新生成 `capability-matrix.md`（有漂移守卫测试）。

---

## 八、让验收与回归保持绿

### 本地（无需凭据，日常必跑）

```bash
cd workbench
npm test                       # 全量（node --test test/*.test.js）
npm run acceptance             # extract 端到端，应看到 actual == expected
npm run acceptance:formula     # function 端到端，应看到 valuesMatch:true
```

> 测试计数**不写死在文档里**（会随新增测试腐化），以 `npm test` 实际输出为准。

### 云端实测（可选，需要本机真实凭据）

```bash
cd workbench
FEISHU_APP_ID=… FEISHU_APP_SECRET=… \
TENCENT_ACCESS_TOKEN=… TENCENT_CLIENT_ID=… TENCENT_OPEN_ID=… \
node scripts/capability-probe.js --run-cloud --write-matrix
```

- 凭据只从环境变量读、只在内存用、绝不入库/打印。
- 缺某平台凭据时，该平台如实报"缺字段"、**不登记证据**（不把"没凭据"误标成"链路失败"）。
- 持凭据真跑通只会把证据从"文档层结论"升级为"链路通、公式位结构不支持"，**公式位仍 false**。

### 单点跑某一类

```bash
npm run test:engine        # 纯引擎
npm run test:smoke         # 面板注册契约
npm run test:e2e           # extract 端到端
npm run test:formula       # 公式
npm run test:templates     # 模板
npm run test:capability    # 能力位矩阵
```

---

## 九、一次完整改动的标准流程（含记录模板）

本仓库的工作方式是「issue 驱动 + TDD + 两轴评审 + 验收绿」，可按下面模板复盘每一步。

### 记录模板（可直接抄进 issue 或 commit）

```markdown
## 目标
<一句话：要加/改什么，为什么>

## 分层落点
- [ ] lib/engine.js：KINDS / paramSpec / preview / validate（纯逻辑）
- [ ] client/index.js：view-model 投影（改后 npm run build:client）
- [ ] scripts/：文件桥或 acceptance 编排
- [ ] registry/ 或 templates/：声明式数据

## TDD
- [ ] 先写失败测试 test/<feature>.test.js（红）
- [ ] 实现至测试通过（绿）
- [ ] 全量 npm test + npm run acceptance + npm run acceptance:formula 绿

## 边界与诚实说明
<哪些没做、哪些是文档层结论而非实测、有无未验证类型>

## 提交
- [ ] 只 stage workbench/（docs/、scripts/、prototypes/ 属另设归档，勿混）
- [ ] commit message 说明改动与分层
```

### 标准步骤

1. **建/领 issue**：在 GitHub issue 里写清目标、分层落点、验收标准。
2. **TDD 实现**：先红后绿；主 seam 只有 `lib/engine.js` 一个，尽量别开新 seam。
3. **本地全绿**：`npm test` + 两个 `acceptance`。
4. **两轴评审**（可选但推荐）：Standards（是否符合本仓约定）+ Spec（是否满足 issue 要求）。
5. **提交**：本仓有 pre-commit 钩子——**只有 stage 了 `workbench/` 才会跑测试**，改纯文档不会触发。
6. **同步文档**：改功能后同步 `workbench/README.md` 的边界段。

> 关于"只提交 workbench/"：`docs/`、`scripts/`（根级向导脚本）、`prototypes/` 是分主题归档，按批次单独提交，不与功能提交混在一起。

---

## 十、常见坑与边界

### 五类实测坑已被固化，勿删（来源：票 #27 → #28）

`workbench/test/` 里有一组**回归用例钉死了五类真实云端 bug**，它们看起来像"多余的形状快照"，其实每一类都对应一次真实故障。删/改前先读 `workbench/README.md` 的「回归清单」：

| 坑 | 钉在哪 |
| --- | --- |
| 写值回包判据 `updatedCells>0` 才算成功 | `test/tencent-adapter.test.js` → `classifyWriteResponse` |
| 读回内容判据：`nonEmpty===0` 判失败，空 `{text:""}` 不计 | `test/tencent-adapter.test.js` → `classifyReadResponse` |
| 请求体 `gridData.rows` 形状 `[{values:[{cellValue}]}]`，序列化不得出现裸数组 | `test/tencent-adapter.test.js` 序列化断言 |
| `materialize()` 必须对 **body** 也替换 `{fileId}/{sheetId}/{range}` | `test/materialize-body.test.js`（直断 scripts 层，绕过 stub） |
| `summarizeReadBack` 剔空行 | `test/cloud-capability-probe.test.js` |

> 盲区提醒：`--stub` 走 lib 内存回放、**不经过** scripts 层 `materialize`，所以 `test/materialize-body.test.js` 是端到端直断，不可省。

### 边界一览（改之前先知道哪个不能碰）

- **零云凭据**：本地闭环不涉及飞书/腾讯/Graph；函数计算走本地 LibreOffice。
- **引擎不做求值器**：`function` 只产公式字符串，不 JS 求值、不承诺把任意自然语言一步编译成命名函数（当前用关键词匹配的假编译器）。
- **不静默降级**：能力位 false 就禁用并提示，绝不写死值/偷偷算成值。
- **权限/分享明确 defer**：无账号体系/分享链接/按钮级 ACL，配方随 git 权限走（`test/permission-defer.test.js` 守卫）。
- **纯 seam 包**：本包不写文件、不碰 git。落盘与提交由宿主/发布层负责；预置按钮的生产接线走"Host seed 契约"（见 `workbench/README.md` 票 #16 段）。
- **云端公式能力位结构上 false**：飞书/腾讯 V3 CellValue 无公式字段/无重算/无读计算值；链路通 ≠ 支持公式。

### 环境类坑

- **`client/client.js` 是生成物**：手改会被下一次 `build:client` 覆盖。只改 `client/index.js`。
- **LibreOffice 路径**：`function` 验收/能力位探针依赖 bundled LO，换机器用 `WORKBENCH_LO_NODE` / `WORKBENCH_LO_CLI` 覆盖，别指望系统 `soffice`。
- **Python 版本**：桥接脚本用 openpyxl，Python 3 即可（本机 3.6.5）。
- **CRLF**：仓库 `core.autocrlf=true`，改 `capability-matrix.md` 这类生成文件后**用生成命令重跑**，别手动编辑，否则漂移守卫会告警。

---

## 附：完整走一遍第六节——`dedupe`（按主键去重）最小 demo

这是按[第六节](#六二次开发加一个新功能)真实落地的一份**可运行示例**（已并入本仓库：`lib/engine.js` 新增 `dedupe` 动作 + `applyCells` 行索引寻址、`test/dedupe.test.js` 9 例全绿、全量 `npm test` 316/316、两个 acceptance 仍绿）。可作为你加新功能时的照抄模板。

### 落地了哪几处改动

| 落点 | 改了什么 |
| --- | --- |
| `lib/engine.js` 的 `KINDS` | 新增 `dedupe` 一项，`paramSpec` 只有 `保留策略`（枚举 `首条`/`末条`，默认 `首条`） |
| `lib/engine.js` 的 `stepsFor` | 加 `dedupe` 分支，如实描述"按主键分组、每组保留一条、其余清空" |
| `lib/engine.js` 的 `understand` | 关键词加 `去重|重复|dedupe|唯一`，让一句话能识别成 `dedupe` |
| `lib/engine.js` 的 `preview` | 加 `dedupe` 分支：按主键分组，保留策略决定保留组内首/末条，其余重复行的**非主键可见列**清空（`add(...)` 产格） |
| `lib/engine.js` 的 `add` + `applyCells` | `add()` 产出的每个 cell 追加 `rowIndex`（行在 `state.rows` 的下标）；`applyCells()` **优先按 `rowIndex` 精确定位**，无有效值回落按主键值（向后兼容） |
| `test/dedupe.test.js` | 新增 9 例（见下） |

**注意**：`validate()` 无需改——它从 `paramSpec` 自动派生校验，demo 的"枚举值"约束自动生效。这正是"声明对 paramSpec，校验就免费"的体现。

### 关键设计取舍（值得你记住的两点）

1. **"去重"= 清空重复行的非主键列，不是物理删行**。因为 `applyCells()` 只写单元格值、不提供删行动作。清空可见列是纯 seam 包内最小的可跑形态；物理删行需宿主层按行索引操作。
2. **cell 从「按主键值寻址」升级为「按行索引寻址」（行索引优先、主键值兜底）**。最初 `applyCells` 以主键值为行键、`rows.filter(...)[0]` 只取首条匹配行，主键重复时会**清错行**（清掉被保留的首行、留下重复行）。修法：`add()` 给每个 cell 记 `rowIndex`（该行在 `state.rows` 的下标），`applyCells()` 优先用它精确定位、无有效值再回落主键值。这样**重复主键也能清对行**，同时**不改旧行为**（宿主持久化/外部构造的旧 cells 无 `rowIndex` → 仍按主键值走）。这是一次"加深模块、向后兼容"的典型改动：接口加一个可选字段，落地逻辑按优先级分派。

### 9 个测试分别钉什么

1. `KINDS.dedupe` 声明存在、带 typed `paramSpec`（`保留策略` 枚举两值）。
2. `buildDraft` 默认参数由 `paramSpec` 派生（默认 `首条`）、`validate` 通过。
3. 保留首条：清空每个重复组第二条及以后的非主键列（受影响 2 行、4 格、不碰主键列）。
4. 保留末条：清空每组首条（保留组内最后一条）。
5. 无重复时零命中（`affectedRows=0`、`cells=[]`，合法）。
6. 走完整 `reduce` 管线 `SET_INPUT→UNDERSTAND→PREVIEW`，正确识别并产出预览。
7. **CONFIRM 正确落地**：重复主键去重后保留首条、清空重复行、不波及保留行。
8. **行索引精确定位**：`applyCells` 按 `rowIndex` 只清空指定重复行、保留首行。
9. **向后兼容**：`cells` 无 `rowIndex` 时仍按主键值定位（旧数据不破）。

### 你可以照着做的清单（把 `dedupe` 换成你的动作名）

```text
1. KINDS 里加 { label, short, medium, paramSpec:[...] }        ← 参数用带类型声明
2. 若依赖公式能力 → KIND_CAPABILITY_DEPS 加依赖；否则不加
3. stepsFor 加分支（如实描述步骤）
4. understand 加关键词（若希望一句话可识别）
5. preview 加分支：用 add(row,col,before,after,invalid,source) 产格
6. 写 test/<feature>.test.js（先红后绿），断言 cells/affectedRows/invalid
7. npm test + npm run acceptance + npm run acceptance:formula 全绿
8. workbench/README.md 边界段补一段 + （可选）registry/ 加预置按钮
```

---

_本文档由仓库当前状态（`workbench/` `dsh-workbench@0.1.0`，HEAD 见 `git rev-parse HEAD`）整理；函数签名与行号以源码为准，改动后请同步更新本文。_
