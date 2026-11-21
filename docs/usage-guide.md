# 使用手册（详尽版）—— 表格自动化工作台

> 面向使用者与二次开发者。**本手册每一步都不省略**：从「怎么打开」到「每个按钮怎么用」到「怎么加一个新动作」。
> 想要更快的概念概览，看同目录的 [`usage-and-extension-guide.md`](./usage-and-extension-guide.md)；想看架构决策，看 [`../workbench/README.md`](../workbench/README.md)。

---

## 目录

- [一、先搞清楚它是什么（打开前必读）](#一先搞清楚它是什么打开前必读)
- [二、怎么打开 —— 三种方式，从最推荐到最轻量](#二怎么打开--三种方式从最推荐到最轻量)
  - [方式二补充：宿主挂载排障（四个已踩过的坑）](#方式二补充宿主挂载排障四个已踩过的坑)
- [三、界面总览：面板长什么样](#三界面总览面板长什么样)
- [四、五步主流程（每一次操作都走这五步）](#四五步主流程每一次操作都走这五步)
- [五、四类动作逐个讲 —— 每类要填什么、会得到什么](#五四类动作逐个讲--每类要填什么会得到什么)
- [六、第五类动作：按主键去重 dedupe](#六第五类动作按主键去重-dedupe)
- [七、预览卡六段逐一讲解（读懂影响预览）](#七预览卡六段逐一讲解读懂影响预览)
- [八、按钮库：固化成按钮、一键重跑、改名改参、删除](#八按钮库固化成按钮一键重跑改名改参删除)
- [九、作用范围 scope 与「条件」—— 全局通用字段](#九作用范围-scope-与条件--全局通用字段)
- [十、平台与能力位（本地 vs 飞书 vs 腾讯）](#十平台与能力位本地-vs-飞书-vs-腾讯)
- [十一、命令速查表](#十一命令速查表)
- [十二、常见问题（FAQ）](#十二常见问题faq)
- [十三、二次开发：新增一个动作的完整步骤](#十三二次开发新增一个动作的完整步骤)

---

## 一、先搞清楚它是什么（打开前必读）

这个项目（`dsh-workbench`，规格 [#8](https://github.com/huobuzhe/ai_work/issues/8)）是一个**把日常表格琐事收进「按钮 + 一句话」的表格自动化工作台**。

必须先理解三个事实，否则会找错地方：

1. **它不是一个能双击打开的网页/桌面程序。** 它是一段**面板插件源码 + 一个纯计算引擎**。面板本体（`client/index.js`）设计成挂进 **DSH 宿主**（宿主提供「打开 .xlsx/.xls/.csv 文件」的能力）后才出现。
2. **它没有独立网址。** 你所在 GUI 里没有「表格工作台」这个页面入口 —— 因为它要挂到宿主、在打开表格文件时才注入右栏。
3. **但是它的「大脑」可以脱离宿主单独跑。** 引擎（`lib/engine.js`）是纯函数：喂表格数据 + 一句话 → 得到校验结果 / 影响预览 / 写值动作。所有规则、所有按钮效果，都能用 `node` 直接跑出来看（见第三节「方式三」）。

一句话记忆：**面板要装进宿主看；引擎可以当场跑。**

---

## 二、怎么打开 —— 三种方式，从最推荐到最轻量

### 方式一（最直观）：打开「面板预览快照」，看它长什么样

这是**不需要装宿主、不需要打开任何表格文件**就能看到面板真实长相的方式。仓库里已经生成好一份静态页面：

```
workbench/preview/index.html
```

**操作步骤（一步都不省）：**

1. 在文件管理器里进入 `F:\ai_work\workbench\preview\`。
2. 双击 `index.html`，会用你的默认浏览器打开。
3. 页面里你会看到 **6 张示例预览卡**（四种动作 + 一个「校验失败」示例 + 一个「飞书禁用」示例）和**一整块按钮库**。
4. 每张卡从上到下就是面板上的六段（①解释 / ②校验 / ③范围与参数 / ④影响预览 / ⑤确认 / ⑥能力位）。对照第七节读它。
5. 这个页面是**只读快照**（不接文件、不写数据），放心随便看。

> 页面里的数据是脚本用**真实引擎**算出来的，不是手画的假图。改了引擎或面板后，重新生成一次即可刷新：见下方「命令速查表」里的 `npm run build:preview`（脚本为 `scripts/build-preview.js`）：

```bash
cd F:\ai_work\workbench
node scripts/build-preview.js          # 默认写回 preview/index.html
```

### 方式二（生产用法）：把面板挂进 DSH 宿主，真正在表格上操作

这是**真正用它改表格**的方式。前提是你有 DSH 宿主环境。

**操作步骤：**

1. 进入工作台包目录并安装/构建浏览器侧 bundle：
   ```bash
   cd F:\ai_work\workbench
   npm run build:client      # 由 client/index.js 生成 client/client.js（浏览器 bundle）
   ```
   `client/client.js` 是**生成的产物，勿手改**；改的是 `client/index.js`。
2. 确认 bundle patch 已就位：`workbench/cordis.patch.yml`（声明 `dsh.bundle.patch`，把插件插入宿主的 profile layer stack）。宿主会据此加载本插件。
3. 在 **DSH 宿主里打开一个 `.xlsx` / `.xls` / `.csv` 文件**。面板靠 `patterns: ['*.xlsx','*.xls','*.csv']` 自动识别，命中才挂出。
4. 看**右侧栏**：会出现一个标题为「表格工作台」的常驻标签页（`keepMounted:true` 所以切走不丢状态）。
5. 这就是面板本体。接下来按第四节五步操作。

> 宿主接线关系（给二次开发者）：`registerWorkbenchPanel(ctx)` 调 `ctx.inject(['sidebarRightTabs'])` → `sidebarRightTabs.register({ id:'workbench.tab', kind:'workbench', patterns, priority:'extension', keepMounted:true, title })`，再用 `ctx.slots.register({ name:'sidebar.right.pane.tab', key:'workbench.tab' })` 把 body 挂进去。body 返回 `{ preview, buttonLibrary }` 两块给宿主渲染。

#### 方式二补充：宿主挂载排障（四个已踩过的坑）

把工作台当 bundle 挂进 DSH 宿主时，曾连续踩到四个坑。若「打开 .xlsx 后没出现工作台 tab」或「宿主一启动就崩溃」，先按此表逐条比对。四个坑的根因与修法（commit `1cf1fd1`/`02fbd50`/`ebf1012`）如下：

| 坑 | 现象 | 根因 | 修法 |
| --- | --- | --- | --- |
| **A. 无 tab** | 打开表格后右侧栏没有「表格工作台」标签，也不报错 | `package.json` 的 `exports["."]` 指向了 CJS 引擎 `lib/engine.js`（只有引擎能力、没有 `apply` 方法）。宿主 cordis 加载器 `loader.import('dsh-workbench')` 拿到引擎对象 → `unwrapExports` 后没有 `apply` → 判定「非插件」→ **静默跳过**，不挂载也不报错 | `exports["."]` 改为指向宿主入口 `./lib/index.mjs`，并保留 `./engine`、`./host`、`./client` 子路径出口 |
| **B. 崩溃「invalid plugin, expect function or object with an apply method, received object」** | 宿主一启动弹崩溃对话框，提示应用无法启动 | `lib/index.mjs` 里同时写了 `export default { name, apply }` **和** 具名 `export function apply`。宿主自定义 ESM 转译路径下的 `unwrapExports`（`exports = exports.default ?? exports; …`）取到的是 default 普通对象，`apply` 丢失 → registry 的 `isApplicable(o)=o && typeof o.apply==='function'` 失败 → 抛错 | **删掉 `export default`，只保留具名 `export const name` + `export function apply`**；`exports["."]` 收敛为单一 `{ "default": "./lib/index.mjs" }`——与已验证可加载的 dsh-pocket / dsh-pet 完全对齐（它们也只有具名导出、单 default 条件） |
| **C. 「无法打开此表格」** | 打开某文件报「请检查文件格式、内容或密码保护」 | **与插件无关**：打开的是 0 字节空文件（openpyxl `BadZipFile: File is not a zip file`） | 换用真实有内容的 xlsx（例：`新建 XLSX 工作表.xlsx`，PK zip、可正常打开）。插件本身没问题 |
| **D. 崩溃恢复后 bundle 被移除** | 崩溃对话框里点了「禁用第三方插件、备份 profile patch 并重启」后，再从哪儿都找不到工作台 | 该按钮会把 `dsh-workbench` 从宿主 profile 的 bundle 清单里**移除** | 写回两处：`~/.dsh/profiles/<profile>/package.json` 的 `dependencies` 加 `"dsh-workbench":"link:F:/ai_work/workbench"`，并把 `"dsh-workbench"` 加回 `dsh.profile.bundles` 数组；必要时重建 `node_modules/dsh-workbench` 指向本目录的 junction/symlink |

> **一句话记忆**：A 是「出口指错文件」、B 是「导出形状写错」、C 是「开了空文件」、D 是「被崩溃恢复按钮踢出清单」。A、B 是代码 / 包配置问题（本仓已修，一般不会复发）；C、D 是环境 / 操作问题（重装或换文件即可）。

#### 方式二补充二：装到另一套 DSH 配置（换机器 / 换 profile）

上面的坑全是在「本机现网 profile」修好的。若你要把工作台搬到**另一台机器**或**同一台机的另一个 profile**，按下面四步接线即可（宿主不认 npm 上发布的包，靠 profile 的 `link:` 依赖 + bundle 清单加载本地目录）：

1. **确认入口形状对**（否则会静默不挂载或崩溃，见坑 A/B）：
   - `workbench/package.json` 的 `"main": "lib/index.mjs"`、`"exports": { ".": { "default": "./lib/index.mjs" }, ... }`；
   - `lib/index.mjs` 里**只有具名 `export const name` + `export function apply`，不要 `export default`**。
2. **在目标 profile 目录接线**（`<profile>` 例：`~/.dsh/profiles/desktop`）：
   - 编辑该 profile 的 `package.json`：`dependencies` 加一条 `"dsh-workbench": "link:<工作台绝对路径>"`（Windows 用正斜杠 `link:F:/ai_work/workbench`）；
   - 把 `"dsh-workbench"` 追加进该 profile 的 `dsh.profile.bundles` 数组；
   - 建目录链接：`node_modules/dsh-workbench` 指向工作台目录（Windows：`cmd /c mklink /J node_modules\dsh-workbench F:\ai_work\workbench`；macOS/Linux：`ln -s`）。
3. **确认 bundle patch 就位**：`workbench/cordis.patch.yml`（声明 `dsh.bundle.patch`）。宿主启动时读 profile 的 bundles → 对每个包 `loader.import(包名)` → 取 `exports["."]` 的 `apply` 挂载。
4. **重启宿主、打开一个真实 xlsx**：右下角应出现蓝色 ⚙ 浮窗按钮；点开是「表格工作台」浮窗（标题带当前文件名），宿主原生表格照常可编辑、不被遮挡。

装好后跑一次自检确认环境 OK：
```bash
cd <工作台绝对路径>
npm run selfcheck      # 只读、不联网，检查包结构/构建产物/引擎 10 动作/scripts
```

> 若换机器后「浮窗按钮不出现」：先查 `sidebarRight` 服务是否由宿主提供（本插件靠 `ctx.inject(['sidebarRight'])` 取当前文件；取不到时不报错但浮窗会退化）。这是宿主版本差异，见坑 A/B 的对齐原则。

### 方式三（最快验证）：不进宿主，直接用命令行跑「大脑」

想确认「某句话会不会被理解成某个动作、会影响哪些格子」，一条命令就够。**操作步骤：**

1. 打开终端，进入包目录：
   ```bash
   cd F:\ai_work\workbench
   ```
2. 跑一键验收，看引擎端到端能否写值并读回（extract 动作）：
   ```bash
   npm run acceptance
   ```
   顺利时打印逐行读回结果（例如「姓名→邮箱」映射真的写进了 xlsx）。
3. 跑公式验收，看「生成公式 → LibreOffice 重算 → 读回计算值」整条链：
   ```bash
   npm run acceptance:formula
   ```
   顺利时 `valuesMatch:true`，并打印每行应发的重算值。
4. 想跑全部测试：
   ```bash
   npm test
   ```

> 这三种方式**互不替代**：方式一看长相、方式二干活、方式三验逻辑。第一次上手，建议按 一 → 二（先看预览）→ 三 的顺序。

---

## 三、界面总览：面板长什么样

面板 body 由两块组成（见 `client/index.js` 的 `registerWorkbenchPanel`）：

```
┌───────────────────────────────────────────────┐
│  表格工作台                    [右侧常驻标签页]  │
├───────────────────────────────────────────────┤
│  ①  一句话输入框                                 │
│      「从外勤登记表把邮箱提出来」___________  ▷理解 │
├───────────────────────────────────────────────┤
│  ②  预览卡（六段，见第七节）                     │
│      ① 解释   ② 校验   ③ 范围与参数              │
│      ④ 影响预览   ⑤ 确认/取消   ⑥ 能力位          │
├───────────────────────────────────────────────┤
│  ③  按钮库（预置 + 我的，可一键重跑）             │
│      [预置] 从外勤表补邮箱     [运行]            │
│      [预置] 按姓名去重（保留首条） [运行]         │
│      [我的] 把部门与备注对调    [运行][改名][改参][删除] │
└───────────────────────────────────────────────┘
```

- **上区（输入与预览）**：你输入一句话 → 系统理解成动作 → 预览卡告诉你「要改哪些格子」。这是**主操作区**。
- **下区（按钮库）**：把满意的配方「固化」成按钮，下次一键重跑。这是**复用区**。

---

## 四、五步主流程（每一次操作都走这五步）

引擎是一个五步状态机（`stage` 依次为 `IDLE → UNDERSTOOD → PREVIEWED → EXECUTED → SOLIDIFIED`）。**任何一次改表格，都严格按这五步走，不会跳步写值。**

| 步骤 | 动作名（reduce type） | 你在面板上做什么 | 引擎内部得到什么 `stage` |
| --- | --- | --- | --- |
| **第 1 步：说一句话** | `SET_INPUT` | 在输入框敲一句「从外勤登记表把邮箱提出来」 | `IDLE` |
| **第 2 步：理解** | `UNDERSTAND` | 点「理解」；系统匹配关键词，选出动作类型 + 填默认参数 | `UNDERSTOOD`（生成 `draft`） |
| **第 3 步：预览** | `PREVIEW` | 点「预览」；引擎封闭校验 + 算出影响哪些格子 | `PREVIEWED`（生成 `preview`） |
| **第 4 步：确认** | `CONFIRM` | 看预览卡没问题，点「确认执行」；此刻才真正写值 | `EXECUTED`（`rows` 被更新） |
| **第 5 步：固化（可选）** | `SOLIDIFY` | 想把这次的配方存成按钮，点「存为按钮」并命名 | `SOLIDIFIED` |

**关键规则（务必记住）：**

- **第 4 步是唯一写值的时刻。** 前 3 步都只在内存里算，表格文件一个字节都没变。
- **校验不过，第 4 步的「确认」按钮是禁用的**（灰掉）。必须回第 3 步把问题改对。
- **只有固化按钮且参数一个字没改，重跑才能跳过「确认」**（见第八节），其余任何写值都要人工确认。
- 任何时候点「取消」(`CANCEL`) 回到 `UNDERSTOOD`，不写值。

**用命令感受这五步（照抄即可）：**

```bash
cd F:\ai_work\workbench
node -e '
const E = require("./lib/engine");
let s = E.initial({
  primaryKey:"姓名",
  columns:["姓名","部门","工时","时薪"],
  rows:[{姓名:"阿岚",部门:"销售",工时:160,时薪:80}],
  sources:{"外勤登记表.csv":{rows:[{姓名:"阿岚",邮箱:"alan@x.com"}]}}
});
console.log("初始 stage:", s.stage);                                    // IDLE
s = E.reduce(s,{type:"SET_INPUT",text:"从外勤登记表把邮箱提出来"});
s = E.reduce(s,{type:"UNDERSTAND"});
console.log("理解后 stage:", s.stage, "动作:", s.draft.kind);            // UNDERSTOOD extract
s = E.reduce(s,{type:"PREVIEW"});
console.log("预览后 stage:", s.stage, "影响格子:", s.preview.cells.length); // PREVIEWED 1
s = E.reduce(s,{type:"CONFIRM"});
console.log("确认后 stage:", s.stage, "行数据:", JSON.stringify(s.rows));  // EXECUTED 已写入邮箱
'
```

预期输出：`IDLE → UNDERSTOOD extract → PREVIEWED 1 → EXECUTED`，最后一行数据里阿岚多了 `"邮箱":"alan@x.com"`。

---

## 五、四类动作逐个讲 —— 每类要填什么、会得到什么

面板能理解 **4 类结构化动作**（外加第六节的去重）。每类的「关键词」「参数」「效果」如下。参数名就是你会在预览卡第③段看到的字段。

### ① 提取字段 extract —— 从另一张表按主键把某列搬过来

- **一句话例子**：「从外勤登记表把邮箱提出来」
- **关键词**：含「提取 / 带出 / 搬 / 从…把…」等。
- **参数（`KINDS.extract.paramSpec`）：**

  | 参数 key | 类型 | 必填 | 默认值 | 约束 | 含义 |
  | --- | --- | --- | --- | --- | --- |
  | `来源文件` | 文件 | 是 | `外勤登记表.csv` | — | 从哪张来源表取（须在 `state.sources` 里存在） |
  | `匹配列` | 列名 | 是 | `姓名` | mustExist | 用当前表的哪一列去匹配来源表 |
  | `取哪一列` | text | 是 | `邮箱` | — | 从来源表取哪一列的值 |
  | `写到` | 列名 | 是 | `邮箱` | newColumn | 写到当前表哪一列（可新建列） |

- **效果**：按 `匹配列` = `取哪一列` 的主键把值填进 `写到` 列。命中行的目标格 before→after 出现在预览卡第④段。
- **诚实边界**：来源表必须已作为 `sources` 传入（宿主负责读来源文件）；匹配不到的行不改。

### ② 调换两段字段 swap —— 把两列内容对调

- **一句话例子**：「把部门和备注对调」
- **关键词**：含「对调 / 互换 / swap / 交换」等。
- **参数（`KINDS.swap.paramSpec`）：**

  | 参数 key | 类型 | 必填 | 默认值 | 约束 | 含义 |
  | --- | --- | --- | --- | --- | --- |
  | `字段A` | 列名 | 是 | `部门` | mustExist | 要交换的列 A（必须已存在） |
  | `字段B` | 列名 | 是 | `备注` | mustExist | 要交换的列 B（必须已存在） |

- **效果**：整列互换（scope=all）直接对调；按命中行半换（scope=match）只换命中的行，**未命中行不变**，并在第④段给出 `swapBanner`「N 行交换、M−N 行不变；列 X、Y 将混合两种来源」——这是**强制披露，绝不掩盖部分改动**。
- **拒绝场景（校验阶段就挡下）**：`字段A = 字段B`（同列自换）、任一列不存在。

### ③ 带条件增删 conditional —— 满足条件的行，加值 / 清空

- **一句话例子**：「把工时大于 150 的人的备注写上加班」
- **关键词**：含「条件 / 大于 / 满足…就… / 增 / 删 / 清空」等。
- **参数（`KINDS.conditional.paramSpec`）+ 注意默认 scope：**

  | 参数 key | 类型 | 必填 | 默认值 | 约束 | 含义 |
  | --- | --- | --- | --- | --- | --- |
  | `动作` | 枚举 | 是 | `增加` | enum:`增加`/`删去`/`删除`/`清空` | 加值还是清空 |
  | `目标列` | 列名 | 是 | `备注` | newColumn | 改哪一列（可新建） |
  | `值` | text | 否 | `加班` | — | 填入的值（清空类动作可不用） |

- **重要：conditional 的默认 `scope` 是 `match`（其余三类是 `all`）。** 原因：条件动作本质就是「只对满足条件的行动手」，如果默认 `all` 会命中全表、行为倒退。详见 `workbench/README.md` 第 63 行决策记录。
- **效果**：对「满足 `条件`」的行执行 `动作`；零命中时标「影响 0 行 / 共 M 行」，**允许确认**（这是合法意图，不是错误）。

### ④ 自定义函数计算 function —— 生成公式让表格自己算

- **一句话例子**：「计算应发 = 工时 * 时薪」
- **关键词**：含「计算 / 等于 / = / 公式 / 求和/乘…」等。
- **参数（`KINDS.function.paramSpec`）：**

  | 参数 key | 类型 | 必填 | 默认值 | 约束 | 含义 |
  | --- | --- | --- | --- | --- | --- |
  | `表达式` | 表达式 | 是 | `工时 * 时薪` | translatable | 要生成的公式表达式 |
  | `输出列` | 列名 | 是 | `应发` | newColumn | 结果写到哪一列 |

- **效果**：引擎把表达式翻成 A1 公式字符串（如 `=C2*D2`）**写进单元格**，**不自己求值**——真正计算交给表格软件（本地是 LibreOffice 重算、再读回缓存值）。
- **能力位硬约束**：`function` 是**唯一依赖公式能力位**的动作。**只有本地 Excel 支持**（四格 true）；**飞书 / 腾讯结构上不支持公式**（四格 false），在这两个平台上会被**直接禁用并提示**，绝不会偷偷把公式算成固定值（见第十节）。

### 补充：为什么引擎「只生成公式不算值」

`lib/engine.js` 的 `toFormula()` 只生成 A1 公式字符串；求值是 LibreOffice（或云端表格）的事。这条是 #9 code-review 的刻意修正——引擎不实现求值器，避免「算出来一个数但表格里其实没公式」的伪实现。

---

## 六、第五类动作：按主键去重 dedupe

这是本包最近加的最小扩展示例（用来演示二次开发，见 `docs/usage-and-extension-guide.md` 第六节），但它本身也是可用的正式动作。

- **一句话例子**：「按姓名去重保留首条」
- **关键词**：`去重 | 重复 | dedupe | 唯一`
- **参数（`KINDS.dedupe.paramSpec`）：**

  | 参数 key | 类型 | 必填 | 默认值 | 约束 | 含义 |
  | --- | --- | --- | --- | --- | --- |
  | `保留策略` | 枚举 | 是 | `首条` | enum:`首条`/`末条` | 同一主键重复时保留第一条还是最后一条 |

- **效果**：按主键（`primaryKey`，如「姓名」）分组，每组保留一条，**其余重复行的「非主键可见列清空」**。
- **诚实边界（务必知道）**：`applyCells()` 只写单元格值、**不物理删行**。所以「去重」实际是「把重复行清空」而不是「删掉重复行」。物理删行要宿主层按行索引操作。这一点面板与 README 都如实写了，不夸大。
- **行索引寻址（可靠性保证）**：重复主键会让「按主键值定位」误伤保留行，所以 `add()` 产出的每个格子都带 `rowIndex`，`applyCells()` **优先按 `rowIndex` 精确定位**，重复主键也能清对行。由 `test/dedupe.test.js` 九例钉住。

---

## 六·五、另外五个日常动作：replace / fill / trim / case / affix

除上面五类，工作台还内置了五个「逐格改值」的日常小动作。它们在浮窗里都是一键芯片（点一下 → 打开**通用字段配置表单** → 自己选列/填值 → 预览 → 确认），也都能用一句话触发：

| 动作 | 浮窗芯片 | 一句话例子 | 参数（paramSpec） | 效果 |
| --- | --- | --- | --- | --- |
| `replace` 文本替换 | 文本替换 | 「把部门里的销售替换成市场」 | `目标列`(列名,必填) / `查找`(text,可空) / `替换为`(text,可空) | 对目标列做**子串替换**（`cur.split(查找).join(替换为)`）；**`查找` 留空 = 整列赋值为 `替换为`**（批量改）。⚠️ **`查找` 与 `替换为` 同时为空会被拦截、不改动任何格**（防止误清空整列） |
| `fill` 空值填充 | 空值填充 | 「把备注里的空值填成待补」 | `目标列`(列名,必填) / `填充值`(text) | 仅当目标格 `trim()===''`（空/空白）才填入 `填充值`，**已有值一律不动** |
| `trim` 去首尾空格 | 去首尾空格 | 「把姓名两边的空格去掉」 | `目标列`(列名,必填) | 去掉首尾空白（`String(v).trim()`）；只改写有前后空格的行，无空格行不进预览 |
| `case` 英文大小写 | 英文大小写 | 「把部门转成大写」 | `目标列`(列名,必填) / `模式`(enum:`upper`/`lower`,默认 `upper`) | 英文转大写 / 小写；无变化行不进预览 |
| `affix` 加前后缀 | 加前后缀 | 「给工号前面加 HQ-」 | `目标列`(列名,必填) / `前缀`(text) / `后缀`(text) | 给目标列每格拼上 `前缀 + 值 + 后缀`（前缀/后缀可只填一个） |

> 五个动作都复用同一套「每格 before → after」模型，参数由 `paramSpec` 封闭校验机械派生（未知字段拒绝、必填/类型/枚举约束）；`replace` 是唯一做了「空+空防误清」护栏的动作。二次开发新增同类动作只需在 `KINDS` 加一条 `paramSpec` + `stepsFor` + `preview` 分支（见第十三节）。

## 六·六、结构 / 视觉 / 汇总类动作：sort / highlight / sum，以及流水线

再往后加的这几类**不都是「逐格改值」**，要特别记一下各自的落盘方式：

| 动作 | 浮窗芯片 | 一句话例子 | 参数（paramSpec） | 落盘方式 |
| --- | --- | --- | --- | --- |
| `sort` 按列排序 | 按列排序 | 「按工时降序排」 | `排序列`(列名,必填) / `方向`(enum:`asc`/`desc`,默认 `asc`) | **只改行顺序**（行内容不变、只改先后），经 `xlsx_bridge.py sort` 重排物理行序；数值列按数值、文本列按字典序，排序稳定 |
| `highlight` 单元格标色 | 单元格标色 | 「把工时大于 160 的标红」 | `目标列`(列名,必填) / `条件`(text,可空) / `底色`(enum:黄/红/绿/蓝) / `规则组`(text,可选) | **只刷底色、不改值**；`规则组`写多条 `条件:颜色`（分号分隔，如 `工时>160:red;工时>140:yellow`）按序首命中分级标色，留空回落单条件+单底色 |
| `sum` 汇总统计 | 汇总统计 | 「统计工时的合计」 | `目标列`(列名) / `聚合方式`(enum:`sum`/`avg`/`count`/`max`/`min`,默认 `sum`) / `多列汇总`(text,可选) | **不改原数据表任何格**；结果写入一张**独立工作表「汇总」**（小表：汇总项 / 值 + 参与行数），经 `xlsx_bridge.py write-summary-sheet` 建/覆盖同名 sheet（重复执行结果一致）。**`多列汇总`** 填分号分隔的 `列名:聚合` 串（如 `工时:avg;时薪:max;姓名:count`）即可一次统计多列/多聚合，每项写「汇总」sheet 一行；留空则只用 `目标列`+`聚合方式` 单条 |

> **流水线（多动作批处理）**：在浮窗里把配置好的动作逐步「加入流水线」（可多步追加/删除），一键「预览流水线」出**组合预览**（按步骤顺序执行、后一步看得到前一步结果，如先算「应发」列再对它标色），再「确认执行」一次性落盘。引擎 `runPipeline(steps,state)` + `reduce` 的 `PIPELINE`/`CONFIRM` 分支；`sort` 这类只改行序、不产单元格的结构性动作**不能**进流水线（会明确拦截而非静默丢弃）。

### 浮窗按钮 vs 右侧标签页（两种载入形态）

- **历史形态**：早版本用一个「表格工作台」右侧常驻标签页承载面板。
- **当前形态（推荐）**：工作台改为**右下角悬浮按钮（⚙ FAB）+ 悬浮面板**，叠加在宿主原生 Excel 表格之上，**不替换、不遮挡主表格**，打开 xlsx 看到的仍是宿主原生可编辑网格，只多一个浮窗入口。点 ⚙ 展开面板（标题栏显示「表格工作台 + 当前文件名」），里面有：**10 个一键动作芯片**（上表 + 五类）、一句话输入框 + 理解/预览/确认执行/固化为按钮、影响预览表（受影响格黄底高亮 + 箭头，执行后去箭头保留高亮）、按钮库、新建表格（可自选列 + 主键列）。
- **当前文件怎么来的**：浮窗通过宿主 `sidebarRight.active().contentId` 轮询当前打开的 `.xlsx/.xls/.csv`；**切换文件时面板自动回到初始默认态**（清空输入、预览与绿字提示），显示新文件的 IDLE 原表。

---

## 七、预览卡六段逐一讲解（读懂影响预览）

预览卡是**第 3 步 PREVIEW 的产物**，由 `client/index.js` 的 `projectPreviewCard(state)` 投影成六段。你在第 4 步「确认」前，**必须逐段看一遍**。对应 `preview/index.html` 里的 6 张示例卡。

| 段 | 名称 | 里面有什么 | 你该怎么读 |
| --- | --- | --- | --- |
| **①** | 解释 | `kind`（动作类型）、`label`（中文名）、`medium`（媒介/说明）、`params`（参数快照）、`steps`（步骤列表）、`explanation` | 先确认「系统理解的动作」和「你想的一样」。参数不对 → 回第 2 步重说或直接在第 3 段改参。 |
| **②** | 封闭校验 | `ok`（是否通过）、`issues[]`（每条 `{field, reason, currentValue}`）、`errors` | `ok=false` 时逐条看 `reason`；`currentValue` 是当前值，供宿主就地修正。**不通过则第⑤段确认按钮禁用。** |
| **③** | 作用范围与参数 | `scope`/`condition`/`scopeLabel` + `paramSpec[]`（每参 `{key,类型,必填,默认值,约束}`） | 这里能看到每个参数的**类型与约束**（如「列名 mustExist」）。改 `scope` 会联动重算第④段「影响 N 行」。 |
| **④** | 影响预览 | `cells[]`（每格 `{row,col,before,after,invalid,source}`）、`summary`（「影响 N 行 / 共 M 行」）、`affectedRows`、`totalRows`、`disclosure`、`swapBanner` | **最重要的一段**：逐格看 before → after 是不是你想要。swap 会有 `swapBanner` 提示列被混合。 |
| **⑤** | 确认 / 取消 | `canConfirm`（仅当校验通过**且** `stage==='PREVIEWED'` 时为 true）、`canCancel` | `canConfirm=true` 才敢点「确认执行」。 |
| **⑥** | 能力位（辅助段） | `adapter`/`adapterLabel`、`formulaCapabilities`（四格）、`disabled`、`blockers[]`（每条 `{cap,need,reason}`） | 看到 `disabled=true` 说明当前平台不支持这个动作（如飞书上跑公式），`blockers` 会告诉你为什么。 |

> 说明：①–⑤ 是**主五段**，⑥ 是 #21 增补的**辅助段**（所以叫「5+1」）。整卡仍是「五步管线」的第 3 步，不是第 6 步。旧的扁平字段（`cells`/`summary`/`scopeLabel` 等）保留在顶层做向后兼容。

**校验失败也出卡**：即使第②段 `ok=false`，预览卡照样渲染（列出失败项、确认禁用）。对应 `preview/index.html` 的第 5 张卡。

---

## 八、按钮库：固化成按钮、一键重跑、改名改参、删除

按钮库（`projectButtonLibrary(state)`）把**两类来源**合并成一个列表：

- **预置按钮（source=`preset`）**：来自仓内 `registry/*.json`（git 作「线上」来源），id 前缀 `p*`。
- **我的按钮（source=`user`）**：你固化出来的，id 前缀 `b*`。

两者 id 空间不冲突，在同一面板统一呈现。每个按钮都带运行态标记：`lastAffectedRows`（上次影响行数）、`emptyRun`（上次是否空跑）。

### 8.1 把当前配方固化成按钮（SOLIDIFY）

> `SOLIDIFY` 的**前置条件是 `stage==='EXECUTED'`**（还没真正执行过，不能固化草稿）。所以要先走完 PREVIEW → CONFIRM 再固化：

```bash
node -e '
const E = require("./lib/engine");
let s = E.initial({primaryKey:"姓名",columns:["姓名","部门","备注"],rows:[{姓名:"阿岚",部门:"销售",备注:"新人"}]});
s = E.reduce(s,{type:"SET_INPUT",text:"把部门和备注对调"});
s = E.reduce(s,{type:"UNDERSTAND"});
s = E.reduce(s,{type:"PREVIEW"});          // 先预览
s = E.reduce(s,{type:"CONFIRM"});          // 再执行（stage 变 EXECUTED）
s = E.reduce(s,{type:"SOLIDIFY", name:"部门备注对调"});   // 执行后固化
console.log("stage:", s.stage, "按钮:", s.buttons.map(b=>b.id+":"+b.name));  // SOLIDIFIED [ "b1:部门备注对调" ]
'
```

- 固化的按钮是**声明式数据**（`kind + params`），**不含可执行代码**。
- 按钮持久化走**宿主权威源**（本包不写文件、不碰仓库）。

### 8.2 一键重跑（RUN_BUTTON）

```bash
# 假设按钮库里已有 b1（参数未改）——重跑会跳过「用户确认」这一步，但 validate/preview 照跑
node -e '
const E = require("./lib/engine");
let s = E.initial({primaryKey:"姓名",columns:["姓名","部门","备注"],rows:[{姓名:"阿岚",部门:"销售",备注:"新人"}]});
// 先固化出一个按钮 b1
s = E.reduce(s,{type:"SET_INPUT",text:"把部门和备注对调"});
s = E.reduce(s,{type:"UNDERSTAND"});
s = E.reduce(s,{type:"PREVIEW"});
s = E.reduce(s,{type:"CONFIRM"});
s = E.reduce(s,{type:"SOLIDIFY", name:"部门备注对调"});
// 一键重跑 b1：参数未改 → 跳过确认、直接执行
s = E.reduce(s,{type:"RUN_BUTTON", id:"b1"});
console.log("stage:", s.stage, "行数据:", JSON.stringify(s.rows));
'   # 参数未改时 b1 直接重跑；末行会看到部门与备注已再次对调
```

**规则（务必分清）：**

- **参数一个字没改 → 真一键直接执行**（跳过的是「用户确认」这一步，`validate` 和 `preview` 照跑不误）。
- **改了任何参数 → 强制退回「解释与影响预览 → 用户确认」**，不许蒙眼写值。
- 零命中也允许固化成按钮，并带上 `emptyRun`/`lastAffectedRows` 标记，每次重跑从当前数据重算。

### 8.3 改名 / 改参 / 删除（全生命周期）

| 操作 | reduce type | 说明 |
| --- | --- | --- |
| 改名 | `RENAME_BUTTON` | 改按钮名 |
| 改参数 | `SET_BUTTON_PARAMS` | **改参在边界处也走封闭校验**，非法/白名单外参数当场拒绝、不写进权威源 |
| 删除 | `DELETE_BUTTON` | 删除；新建 id 用 `nextButtonId`（max+1），删后新建不撞号 |

### 8.4 预置按钮怎么进面板（Host seed 契约）

这是给**宿主/集成方**的（本包不读文件）：

1. 跑 `node scripts/load-registry.js`，读 stdout 的 JSON。
2. 取 `.registryButtons`（**完整按钮**：含 id/name/kind/source/schemaVersion/params/medium/steps）作为 `data.registryButtons` 传给 `E.initial()`，或传给 `E.hydrateRegistry(state, list)`。
3. 面板按钮库就会同时含 `preset`（p*）与 `user`（b*）。
4. **预置按钮也能一键运行**：`RUN_BUTTON` 在固化按钮之外也查预置按钮（p*），运行态写回对应来源数组。

> 预置按钮跨表通用，绑定具体表格的检查（来源文件是否存在、列是否存在）在运行时的 QUICK/RUN_BUTTON 再跑 `validate()`。

---

## 九、作用范围 scope 与「条件」—— 全局通用字段

`scope` 和 `条件` 是**四类动作共用的公共字段**（声明在 `COMMON_PARAMS`）：

| 公共参数 | 类型 | 必填 | 默认值 | 约束 |
| --- | --- | --- | --- | --- |
| `scope` | 枚举 | 否 | `all` | enum:`all`（全表）/`match`（仅条件命中） |
| `条件` | text | 否 | `""`（空） | — |

- **`scope=all`**：对整个表格操作。
- **`scope=match`**：只对满足 `条件` 的行操作。`条件` 按**行（记录）**筛选，不做列级条件。
- **默认值注意**：extract / swap / function 默认 `all`；**conditional 默认 `match`**（本节重复强调，因为这是最容易被忽略的差异）。
- **零命中是合法意图**：标「影响 0 行 / 共 M 行」，允许确认，**不新增第 6 步**。
- 面板第③段可改 scope/条件，改动会**联动重算**第④段的影响行数。

---

## 十、平台与能力位（本地 vs 飞书 vs 腾讯）

引擎有 `ADAPTERS` 注册表（`local` / `feishu` / `tencent`），每个平台有两组能力位：

- **`capabilities`**：读表 / 写单元格 / 建表 / 读回计算值。
- **`formulaCapabilities`**：`{ canWriteFormula, canRecalc, canReadComputed, functionSet }`（四格 binary）。

**公式能力位当前真相（唯一真相源是 `engine.ADAPTERS[id].formulaCapabilities`）：**

| 平台 | 公式四格 | 含义 |
| --- | --- | --- |
| 本地 Excel（`local`） | **四格 true** | 本仓实测：写公式 → LibreOffice 重算 → 读回缓存值，闭环通过 |
| 飞书（`feishu`） | **四格 false** | 文档层 false；结构上不支持公式 |
| 腾讯（`tencent`） | **四格 false** | 一手负面：V3 CellValue 无公式字段 / 无重算 / 无读计算值 |

**这意味着什么：**

- **结构化动作（extract / swap / conditional / dedupe）** 只读写单元格值，**任何平台都能用**。
- **只有 function（公式产物）依赖能力位**。在飞书/腾讯上跑 function，会在预览第⑥段显示 `disabled=true` + `blockers`，**直接禁用**，绝不会静默降级或把公式算成固定值。
- 云端「链路通」≠「支持公式」：即便持真实凭据真跑通飞书/腾讯的「建表→写值→读回」，公式四格仍是 **false**（`recordLiveEvidence` 绝不动 `verdict`/`runnable`）。

> 想自己验证本地四格真跑通过：`npm run capability:probe`（脚本 `scripts/capability-probe.js --run-local --write-matrix`，会重算并读回断言）。

---

## 十一、命令速查表

所有命令在 `F:\ai_work\workbench` 目录下执行：

| 目的 | 命令 |
| --- | --- |
| 构建浏览器 bundle（改 client/index.js 后必跑） | `npm run build:client` |
| 生成/刷新界面预览快照 | `node scripts/build-preview.js` |
| 跑全部测试 | `npm test` |
| 只跑引擎测试 | `npm run test:engine` |
| 只跑面板注册契约测试 | `npm run test:smoke` |
| extract 端到端验收（写值→读回） | `npm run acceptance` |
| function 端到端验收（公式→重算→读回） | `npm run acceptance:formula` |
| 加载并校验仓内预置按钮注册表 | `node scripts/load-registry.js` |
| 本地公式能力位真跑探针（重算+读回） | `npm run capability:probe` |

> 测试计数**不写死在文档里**（会随新增测试腐化），以 `npm test` 实际输出为准。

---

## 十二、常见问题（FAQ）

**Q1：我找了半天没在 GUI 里看到「表格工作台」这个页面？**
A：正常。它不是独立页面/网址，是挂进 DSH 宿主、在打开 `.xlsx/.xls/.csv` 文件时才出现在右侧栏的面板。想先看长相，用第二节「方式一」的预览快照。

**Q2：双击 `preview/index.html` 看到的是真面板吗？**
A：是**真实面板的 view-model 快照**——数据由真实 `lib/engine.js` + `client/index.js` 算出，但不是活的可交互面板（不写文件）。生产交互要按「方式二」挂宿主。

**Q3：为什么我点「确认执行」是灰的？**
A：第②段校验没过（`ok=false`）。看失败项 `reason`，改对后重新预览。`canConfirm` 只有在「校验通过且已预览」时才为 true。

**Q4：为什么飞书上「计算应发=工时*时薪」点不动/被禁用？**
A：飞书公式能力位四格 false，function 动作被能力位挡下（第⑥段 `disabled=true`）。这是**诚实边界**，不是 bug——云端不许把公式算成假值。改用本地 Excel，或改用 extract/conditional 等结构化动作。

**Q5：「按姓名去重」为什么行没被删掉，只是空了？**
A：去重=清空重复行的非主键列，**不物理删行**。物理删行要宿主层按行索引操作（见第六节诚实边界）。

**Q6：一键重跑为什么有时要我再确认一次？**
A：你改了按钮参数。**参数有改动就强制回到预览+确认**；只有参数一字未改才真一键直跑（跳过的仅是确认这一步，校验和预览照跑）。

**Q7：改了 `client/index.js` 但面板没变化？**
A：忘了重建 bundle。跑 `npm run build:client` 重新生成 `client/client.js`（那是产物，勿手改源码产物）。

---

## 十三、二次开发：新增一个动作的完整步骤

想给引擎加一个新动作（就像当初加 `dedupe` 那样），按 TDD 做。完整过程见 [`usage-and-extension-guide.md`](./usage-and-extension-guide.md)，这里是**极简版 checklist**：

1. **先写测试（红）**：在 `workbench/test/` 新建 `xxx.test.js`，用 `node:test`，断言新动作的 preview 与 applyCells 行为。
2. **在 `lib/engine.js` 声明参数**：给 `KINDS.xxx` 加 `label` + `paramSpec`（`{key,类型,必填,默认值,约束}` 的 typed 声明）。
3. **加 `stepsFor` 分支**：给新 kind 生成人类可读的步骤列表（`medium` / `steps`）。
4. **加 `understand` 关键词**：让一句话能识别到新动作（如 `dedupe` 用 `去重|重复|dedupe|唯一`）。
5. **加 `preview` 分支**：算出 `cells[]`（每格带 `rowIndex`！重复主键要靠它精确寻址）+ `summary`。若涉及公式，记得过能力位。
6. **`validate` 一般无需改**：它从 `paramSpec` 自动派生校验规则。
7. **跑绿**：`node --test test/xxx.test.js` 红→绿；再全量 `npm test` + 两个 acceptance。
8. **同步文档**：更新 `workbench/README.md` 边界段 + `docs/usage-and-extension-guide.md` + 本手册第五节/第六节，并重跑 `node scripts/build-preview.js`（如果新动作要进示例快照）。
9. **补面板测试**：若面板投影要显示新动作的 `label`，记得同步 `client/index.js` 的 `labelOfKind` 映射（否则会回落显示原始 kind 名）。
10. **提交**：只 `git add workbench/`（以及其他有意改动的文档），写清 commit message。

> 提示：`labelOfKind` 目前映射了 extract/swap/conditional/function，**dedupe 尚未加入映射**（会回落显示原始 `dedupe`）。这是个已知小漂移，新增动作时一并补上更好。

---

## 十四、可选：把「一句话理解」接到真 LLM

默认的一句话理解是**纯关键词匹配**（离线、零网络、零依赖）。若想让理解更聪明，可注入一个真 LLM 适配器——**完全可选，不接就和原来一样**。

适配器在 [`workbench/lib/llm-adapter.js`](../workbench/lib/llm-adapter.js)，兼容 **OpenAI Chat Completions 协议**，所以 DeepSeek / OpenAI / 任意兼容网关都能用（只换 `baseUrl` + `model`）。

```js
const { createUnderstandLlm } = require('dsh-workbench/lib/llm-adapter');
const { makeActionHandler } = require('dsh-workbench/lib/panel-bridge');

// 同步版（桥的 understandLlm 约定是同步 `(text,{columns}) => ({kind,params}|null)`）
const understandLlm = createUnderstandLlm({
  baseUrl: 'https://api.deepseek.com',   // 或 https://api.openai.com
  model: 'deepseek-chat',                 // 或 gpt-4o-mini 等
  apiKey: process.env.DEEPSEEK_API_KEY
});

const handler = makeActionHandler({ understandLlm });
// 现在 UNDERSTAND 动作会先问 LLM；列名会自动带上（LLM 从真实列里挑参数）
```

- **async 更推荐**：若宿主能 await，用 `createUnderstandLlmAsync(cfg)` 得到 `async (text,{columns})=>…`，在调用 action handler 前先 await 好再注入 `action.llmResult`，或配合引擎 `understandAsync(sentence,{llm})`。
- **兜底最硬**：无论 LLM 返回非法 kind / 非 JSON / 非 2xx / 网络错 / 超时，适配器一律返回 `null`，引擎**静默回落关键词**——外部依赖永远不可能让「一句话理解」整条坏掉。
- **参数白名单**：适配器按该 kind 的 `paramSpec` 过滤模型给的 params 键，多余键直接丢弃；引擎还会再封闭校验一次。
- **无网络环境/CI**：不注入即走关键词；`test/llm-adapter.test.js` 全部用注入的假 fetch，不触网。

---

*本手册随仓库演进；命令与字段以代码为准。规格：[#8](https://github.com/huobuzhe/ai_work/issues/8)。*
