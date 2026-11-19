# 交付账本（Delivery Ledger）

> 快照时间：2026-11-17（Asia/Shanghai），2026-11-18 补记「交付后增量」段，2026-11-19 补记「第二波 #41–#54 + #55」段，2026-11-19 补记「#45 source=default 投影修复 + GUI 闭环验证」，2026-11-19 补记「第三波 #56 真实面板闭环三个致命 bug 修复」，2026-11-19 补记「第四波 #57 接缝缺口 / 第五波 #58 延迟修复+浮窗重构 / 第六波 #61 影响行数按行去重 + 五动作实机 e2e + #62 浮窗美化」。来源：GitHub issue tracker `huobuzhe/ai_work` + 本地 `git log`。
> 用途：两个 effort 收官后的最终清单与唯一 backlog，供后续会话/接手人直接查阅，不必重跑清点。

## 全局状态

| 项 | 值 |
| --- | --- |
| issue 总数 | 54 |
| CLOSED | 54（**全部关闭**，含 [仓库 README](https://github.com/huobuzhe/ai_work/issues/1)，2026-11-17 交付并关闭；#41–#54 面板波 2026-11-19 全关） |
| OPEN | 0 |
| 地图（wayfinder:map） | 2 张，均 CLOSED：地图 #2、地图 #29 |
| 规格（ready-for-agent） | 3 份，均 CLOSED：规格 #8、规格 #34、[仓库 README](https://github.com/huobuzhe/ai_work/issues/1) |
| 决策/实施票 | 49 张（5 + 20 + 4 + 6 + 14 面板波 #41–#54），全 CLOSED |
| 仓库根 README | `README.md`，commit `b44244b`（单页，5/5 人工验收全过） |
| HEAD | 不在此追记 hash——账本写自身仓库 HEAD 会陷入自指：每次为更新它而提交都会让 hash 再过期一次。**交付基线**为三批归档提交 `d8038ee`/`77ed693`/`4091c91`（固定、不再变）；此后当前 HEAD 一律以 `git log` / `git rev-parse HEAD` 为准。工作树无已跟踪改动。 |
| 验收 | `npm test` 全绿（**计数以 `npm test` 实际输出为准，不在此写死**，见 README 反腐化纪律）；`engineMatchesFile: true`；`valuesMatch: true`；两票之外每票两轴 code-review 0 hard |

端到端审计（关票状态、四层指针回填、验收布尔、工作树）结果 FAIL=0，详见文末「可复现核对」。

---

## Effort 1 — 本地 Excel 零凭据闭环（Slice 1）

**目标**：把建表和日常繁琐表格操作收进工作台，先在本地 Excel（零凭据）上跑通最小闭环。

### [建表格 + 处理表格繁琐任务工作台：找路地图](https://github.com/huobuzhe/ai_work/issues/2) — CLOSED

Destination 达成；Decisions so far 六条指针齐全。5 张决策票全部 CLOSED：

| 票 | 类型 | 决策 gist |
| --- | --- | --- |
| [#3 官方 Skill／MCP／字段捷径能否把一次解释固化成可复用按钮或命名函数](https://github.com/huobuzhe/ai_work/issues/3) | research | Skill/MCP 无法独立完成全链；定为 4 个原语 + 使用者自供 NL→配方 |
| [#4 表格工作台原型：表格视图 + 快捷按钮 + 输入框](https://github.com/huobuzhe/ai_work/issues/4) | prototype | scope / 条件判断抽成公共步骤 → 公开字段 `scope: all\|match(condition)` |
| [#5 云端真实凭据冒烟测试：飞书与腾讯文档建表→写值链路](https://github.com/huobuzhe/ai_work/issues/5) | task | 链路可跑通，但能力位按 ⑲ 全 false；触发 #7 grilling |
| [#6 先做哪一刀：整包规格里的第一刀切片](https://github.com/huobuzhe/ai_work/issues/6) | grilling | 第一刀 = 本地 Excel 零凭据端到端最小闭环，云端推迟 |
| [#7 是否重开 ⑬/⑯、允许「工作台算好写值」作为降级路径](https://github.com/huobuzhe/ai_work/issues/7) | grilling | 不重开 ⑬/⑯，维持 ⑳；false → 禁用，不静默降级 |

### [表格工作台：建表 + 日常繁琐表格操作收进按钮与输入框（第一刀=本地 Excel 零凭据闭环）](https://github.com/huobuzhe/ai_work/issues/8) — CLOSED

实施进度 20 张票 #9–#28 指针齐全，全 CLOSED。按主题分组：

- **核心闭环**：[#9 本地 Excel 最小闭环](https://github.com/huobuzhe/ai_work/issues/9)、[#10 模板库与建表](https://github.com/huobuzhe/ai_work/issues/10)、[#11 自定义函数 + 重算](https://github.com/huobuzhe/ai_work/issues/11)、[#12 作用范围与条件](https://github.com/huobuzhe/ai_work/issues/12)、[#14 配方校验与预览卡](https://github.com/huobuzhe/ai_work/issues/14)、[#15 按钮固化与一键重跑](https://github.com/huobuzhe/ai_work/issues/15)、[#16 仓内按钮注册表](https://github.com/huobuzhe/ai_work/issues/16)。
- **边界裁决与类型声明层**：[#13 调换字段与条件增删](https://github.com/huobuzhe/ai_work/issues/13)、[#17 conditional 默认 scope 漂移裁决](https://github.com/huobuzhe/ai_work/issues/17)、[#18 T1 Expand / paramSpec 声明层](https://github.com/huobuzhe/ai_work/issues/18)、[#19 T2 Migrate / 四类动作切换 paramSpec](https://github.com/huobuzhe/ai_work/issues/19)、[#20 T3 Contract / 删旧默认值 map](https://github.com/huobuzhe/ai_work/issues/20)。
- **云端 adapter 抽象 + 能力位 + 实测**：[#21 S1 Adapter 抽象与能力位契约](https://github.com/huobuzhe/ai_work/issues/21)、[#22 S2 凭据契约](https://github.com/huobuzhe/ai_work/issues/22)、[#23 S3 飞书 adapter](https://github.com/huobuzhe/ai_work/issues/23)、[#24 S4 腾讯文档 adapter](https://github.com/huobuzhe/ai_work/issues/24)、[#25 S5 能力位矩阵验尸](https://github.com/huobuzhe/ai_work/issues/25)、[#26 S6 权限/分享 defer](https://github.com/huobuzhe/ai_work/issues/26)、[#27 云端能力位持凭据真跑](https://github.com/huobuzhe/ai_work/issues/27)、[#28 #27 五轮实测 bug 回归套件](https://github.com/huobuzhe/ai_work/issues/28)。

**关键 commit**：`21abd82`（#28 回归套件）、`046e080`/`ff2de7d`/`0071f9d`（收尾文档与 pre-commit 守卫）、`a2ea6b5`/`13ea116`/`badefc6`（飞书/腾讯真跑与证据层）、`1cdb9a9`/`34c6347`/`4908c94`/`d402959`（#27 暴露的实测 bug 修复）、`e93873b`（#26 defer）、`1cabc64`/`4e8040e`/`a5ec59a`/`0145193`（S1–S4）。

---

## Effort 2 — 云端 adapter 闭环

**目标**：一份可交 `/to-spec` 的云端 adapter 规格 + 验收判据（飞书优先 / 三维证据状态能力位 / AND-OR 推迟 v2 / 模板来源仓内清单）。

### [云端 adapter 闭环：找路地图（飞书/腾讯公式能力位 + 细粒度权限 ㉗）](https://github.com/huobuzhe/ai_work/issues/29) — CLOSED

Notes 继承地图 #2 既定前提（能力位全 false 不重测 / 第一刀已交付 / false 位禁用不降级）；4 张决策票全 CLOSED，Decisions so far 指针齐全：

| 票 | 类型 | 决策 gist |
| --- | --- | --- |
| [#30 云端 adapter 第一梯队平台选择：飞书 vs 腾讯文档](https://github.com/huobuzhe/ai_work/issues/30) | research | 选飞书（`tenant_access_token`，低门槛，Step1-6 真凭据 E2E code:0 读回 2x2）；腾讯仅建表 ret:0，写读豁免 |
| [#31 规格如何区分呈现两类证据状态](https://github.com/huobuzhe/ai_work/issues/31) | grilling | 三维能力位：布尔 + 证据状态枚举（`verified-true`/`verified-false`/`unverified-default-false`）+ 一手来源；仅 verified-true 解锁 |
| [#32 模板来源范围](https://github.com/huobuzhe/ai_work/issues/32) | grilling | 唯一来源 = 仓内声明式清单（git 作线上来源），不纳入云端模板中心 / GitHub 文件 |
| [#33 ㉘ AND/OR 组合条件与细粒度语法是否纳入第一版](https://github.com/huobuzhe/ai_work/issues/33) | grilling | 维持 ㉘ 推迟 v2；第一版锁 ⑧ 单比较闭包，AND/OR 显式拒认，留触发式 v2 指针，不预留扩展枚举 |

### [云端 adapter：飞书优先 + 三维证据状态能力位 + 仓内模板来源 + 条件闭包 v1](https://github.com/huobuzhe/ai_work/issues/34) — CLOSED

7 个模板区块 + 44 条 user story + 实施进度六条指针齐全。6 张实施票全 CLOSED：

| 票 | 主题 | commit | 要点 |
| --- | --- | --- | --- |
| [#35 T1 三维证据状态枚举落地](https://github.com/huobuzhe/ai_work/issues/35) | 唯一净新增 seam | `07d3fab` | `EVIDENCE_STATUS` 三值 + `isCapabilityUnlocked`（仅 verified-true 解锁、无 opt-in）+ `assertNoUnbackedTrue` 双向守卫；矩阵逐格标注并保留 2026-11-16 持凭据佐证 |
| [#36 T2 飞书优先与两套独立凭据契约核验](https://github.com/huobuzhe/ai_work/issues/36) | 既有 seam | `e4f815e` | 飞书低门槛 vs 腾讯 OAuth2 负担不对称、三组错误码互不串用、runLive 缺凭据明确拒绝 |
| [#37 T3 模板来源锁死仓内声明式清单](https://github.com/huobuzhe/ai_work/issues/37) | 既有 seam | `5a1059a` | 加载脚本无网络、四入口共用 createTable 引擎、type-mapping 名字级映射、冲突显式替换 |
| [#38 T4 条件闭包锁定单比较 + AND/OR 推迟 v2](https://github.com/huobuzhe/ai_work/issues/38) | 既有 seam | `eb27389` | 六 op + 别名归一、AND/OR/列间/包含/为空显式拒认 + CONFIRM 门禁、scope 枚举、触发式 v2 指针 |
| [#39 T5 未验证类型闸门 + 请求体物化回归](https://github.com/huobuzhe/ai_work/issues/39) | 既有 seam | `95c5888` | 两 adapter 默认拒绝真跑 + `--allow-unverified-types` 显式放行；请求体物化复用 #28 |
| [#40 T6 权限/分享 defer 守卫](https://github.com/huobuzhe/ai_work/issues/40) | 既有 seam | `de9d0ab` | cloneButton 剥顶层越权字段、validate 逐名拒 params 越权、计划递归无共享端点、README 四处 defer 表述一致 |

**收口链**：comment [issuecomment-6950223372](https://github.com/huobuzhe/ai_work/issues/34#issuecomment-6950223372) → close #34。顶层规格无父票，源地图 #29 已关，故无回填指针。

---

## 最终交付：#1 仓库 README（已关闭）

**[仓库 README：项目方向未定，先固化边界共识](https://github.com/huobuzhe/ai_work/issues/1)** — **CLOSED**（2026-11-17）。

- **解除经过**：曾以 `needs-info` 搁置，解除条件是「用户能一句话说清这个项目是做什么的」。2026-11-17 经一轮 `/grilling` 问答（Q1 定位 / Q2 价值 / Q3 阶段披露 / Q4 边界，均按推荐）收敛出方向句并记入 [issuecomment-1](https://github.com/huobuzhe/ai_work/issues/1)（方向句：[issuecomment-6952073942](https://github.com/huobuzhe/ai_work/issues/1#issuecomment-6952073942)），随后标签改回 `ready-for-agent`。
- **方向句**：一个「表格自动化工作台」——把建表/填数/套公式/按条件改数据收进一键按钮，本地 Excel 零凭据可用，云端能力在规划中、尚未实测。
- **交付物**：仓库根 `README.md`，commit `b44244b`（单页 26 行，仅此一个文件，5/5 人工验收全过；无内部术语/本机信息，诚实披露云端未实测）。
- **收口链**：comment [issuecomment-6952234277](https://github.com/huobuzhe/ai_work/issues/1#issuecomment-6952234277) → close #1。
- **边界落实**：读者/定位面向陌生访客不提内部工作流；中文为主；只写仓库相对路径与公开仓库名、无绝对路径/用户名/代理端口；允许一句开 Issue 入口、不引导 PR；仅动一个文件，未改 description/License/CONTRIBUTING；与 agent 入口/配置目录互不引用。

---

## 交付后增量（基线之后、2026-11-18 补记）

> 交付基线（三批归档提交 `4091c91`）之后，仓库继续演进。本节把此后的实质交付补进账本，避免「账本落后真实仓库」。此段之后仍以 `git log` 为准。

**已推送远端**：此前 52 个本地提交从未推到 `origin/master`（issue 关票走 `gh` API 本就同步，故只有 git 历史滞后）。2026-11-18 已 `git push` 推送（本机 git 直连 https 遇 DNS 解析失败，用 `git -c http.family=ipv4 push` 解决并 `git config http.family ipv4` 持久化）。

| 主题 | commit | 要点 |
| --- | --- | --- |
| applyCells 行索引寻址 | `6bfa0ea` | `add()` 产格追加 `rowIndex`；`applyCells()` 优先按 `rowIndex` 精确定位、无则回落按主键值（向后兼容）。修复重复主键去重会误伤保留行的隐患。`test/dedupe.test.js` 9 例钉住 |
| dedupe 最小扩展示例 | `173a885` | `KINDS.dedupe`（`保留策略` 首条/末条）+ stepsFor/understand/preview 分支；`docs/usage-and-extension-guide.md` 附 worked example。是「如何加一个新动作」的活样板 |
| dedupe 预置按钮 | `73e82e9` | `workbench/registry/preset-dedupe-by-name.json` 预置按钮；`load-registry.js` → total:3 ok:true，`test/registry.test.js` 25/25 |
| 使用与二次开发指南 | `e805c4c` | `docs/usage-and-extension-guide.md`（355 行，10 节 + worked example） |
| 对外交付报告 | `15fd241` | `docs/delivery-report.md`（57 行，可对外分享） |
| 仓库根 README | `b44244b` | `README.md`（26 行，#1 交付物，见上节） |
| 账本收尾三连 | `e224fdd`/`4c744a6`/`d35a7f4`/`402faae`/`68dab70` | README 交付同步、description 边界修订、BOM 瑕疵标记、HEAD 固定锚点、研究资产入库校正 |

**本次新增交付（2026-11-18，未提交时补记）：**

- **详细使用手册** `docs/usage-guide.md`：从「怎么打开（3 种方式）」到「每个按钮/动作逐步用法」到「新增动作 checklist」，每步不省；含已实跑验证的命令示例（五步流程、固化、预览快照生成）。
- **界面预览面板** `workbench/preview/index.html`（生成脚本 `workbench/scripts/build-preview.js`，npm `build:preview`）：用真实 `lib/engine.js` + `client/index.js` 投影，把「预览卡六段 + 按钮库」渲染成自包含静态 HTML（零外部依赖、6 张示例卡）。解决「面板本体只能挂宿主、无独立可视化」的盲区；双击即可看面板长相。
- **补客户端面板测试** `workbench/test/panel-projection.test.js`（10 例）：逐段钉住 `projectPreviewCard` 六段投影、校验失败卡、飞书禁用卡、`projectButtonLibrary` 双来源合并/空态/向后兼容——补齐 `panel-smoke.test.js` 仅覆盖「注册 + 一个 happy path」的盲区。

## 交付后增量（第二波：面板接入宿主 + 面板内真实交互，#41–#54，2026-11-19 补记）

> 交付基线之后，工作台从「引擎 + 测试」演进成「能挂进 DSH 宿主、面板内可真实点击操作」的插件。本节把 #41–#54 这 14 票（全部 CLOSED）+ #55 上传建表补测补进账本。

**宿主挂载三坑已解**（详见 `docs/usage-guide.md`「宿主挂载排障」节）：
- 坑 A：`exports["."]` 曾指向 CJS 引擎 `lib/engine.js`（无 apply）→ 宿主当非插件静默跳过 → 无 tab。修：exports 指宿主入口。
- 坑 B：`lib/index.mjs` 曾同时 `export default` + 具名导出 → 宿主 ESM 转译下的 `unwrapExports` 取到 default 普通对象丢 apply → 崩溃「invalid plugin, expect function or object with an apply method, received object」。修（commit `ebf1012`）：删 `export default`、只留具名 `name`/`apply`，`exports["."]` 收敛为单一 `{default: "./lib/index.mjs"}`，对齐已验证可加载的 dsh-pocket / dsh-pet。
- 坑 C：打开 0 字节空 `11.xlsx` 报「无法打开此表格」——是空文件（BadZipFile），与插件无关；有效文件是 `新建 XLSX 工作表.xlsx`。
- 坑 D：崩溃时点「禁用第三方插件」会把 `dsh-workbench` 从 profile bundles 移除，需写回 `dependencies["dsh-workbench"]="link:F:/ai_work/workbench"` + `dsh.profile.bundles`。

| 票 | 主题 | commit | 状态 |
| --- | --- | --- | --- |
| [#41](https://github.com/huobuzhe/ai_work/issues/41) | Host 侧真实数据管道 + 默认配方让面板显示真实影响行数 | `ffeeb5f` | CLOSED |
| [#42](https://github.com/huobuzhe/ai_work/issues/42) / [#43](https://github.com/huobuzhe/ai_work/issues/43) | slot body 必须返回带 children 的 React 元素护栏 / 按钮库渲染成可点按钮 + 事件通道 | `5447e7e` | CLOSED |
| [#44](https://github.com/huobuzhe/ai_work/issues/44) | 按钮点击驱动引擎重算 preview → 预览卡刷新（+ client 侧回归 `2edc590`） | `9084f0c` | CLOSED |
| [#45](https://github.com/huobuzhe/ai_work/issues/45) | 自动派生的默认配方做成 `source=default` 可点按钮（新表也能走通点击闭环）；后续 `7ebaa19` 修投影 `projectOne` 保留 `source=default`（不再塌成 user） | `65beb2f`/`7ebaa19` | CLOSED |
| [#46](https://github.com/huobuzhe/ai_work/issues/46) | 面板内新建配方完整 5 步管线 + 逐格 before→after 明细 + 重算反馈 | `20ae5d5`/`5c5d5c9`/`69688a9` | CLOSED |
| [#47](https://github.com/huobuzhe/ai_work/issues/47) | 按钮管理（运行/重命名/删除）+ 一键运行真正写回磁盘 | `d56deae` | CLOSED |
| [#48](https://github.com/huobuzhe/ai_work/issues/48) | 固化按钮持久化到同目录 sidecar，重启不丢 | `dbba3f1` | CLOSED |
| [#49](https://github.com/huobuzhe/ai_work/issues/49) | 默认配方改调换末两列，避开主键列防二次执行写坏数据 | `ad409e5` | CLOSED |
| [#50](https://github.com/huobuzhe/ai_work/issues/50) | 成功/说明类 note 不再重复塞进红色错误框 | `dc4cf82` | CLOSED |
| [#51](https://github.com/huobuzhe/ai_work/issues/51) | 面板按钮库水合仓内预置按钮（补齐 #16 host seed 契约） | `24a584c` | CLOSED |
| [#52](https://github.com/huobuzhe/ai_work/issues/52) | 面板内从模板新建表格：/templates 列模板 + /create 建空 xlsx 并回地址 | `ba48f53` | CLOSED |
| [#53](https://github.com/huobuzhe/ai_work/issues/53) | 面板内新建空白表：列名清单直接建空 xlsx（服务「新建 XLSX 工作表」需求） | `65db7dc` | CLOSED |
| [#54](https://github.com/huobuzhe/ai_work/issues/54) | 面板按钮「改参数」入口（SET_BUTTON_PARAMS 接线）+ store 实例级状态隔离修复 | `3dfe9f2` | CLOSED |
| （#55 无票） | 上传建表面板分支（`buildCreateSpec` mode=upload + rows 透传 + xlsx_bridge 写数据行）补测试 | `0474513` | 见下 |

**#55 上传建表（无对应 GitHub 票，仅代码注释标注）**：`workbench/lib/panel-state.js::buildCreateSpec` 的 `mode: 'upload'` 分支（字典列 + 数据行 → `E.createTable({mode:'upload',manifest,rows})` 双重封闭校验）、`panel-bridge.js` 透传 `rows`、`xlsx_bridge.py create()` 逐行写数据行。此前面板层零测试（绿灯假象，引擎层有测）。2026-11-19 补 7 例（`workbench/test/create-table.test.js` #55 系列）：seam A 字典列/字符串列默认 text/空列清单/主键不在列清单/主键重复空行经 `validateRows` 拦截；seam C rows 透传；python 真实建表写数据行 + read-values 复核。commit `0474513`。

**#45 投影修复 + 面板闭环验证（2026-11-19 补记，commit `7ebaa19`）**：
- **投影漂移修复**：`workbench/client/index.js::projectOne` 原 `source: b.source === 'preset' ? 'preset' : 'user'` 把引擎真值 `source='default'`（#45 自动派生的默认配方按钮）塌成 `'user'`，与 #45 AC「source 标为 default」不符（按钮本身在 `total:1` 里、能点、只是标错）。修为保留 `default`：`source: b.source === 'preset' ? 'preset' : (b.source === 'default' ? 'default' : 'user')`。重跑 `npm run build:client` 重建 `client/client.js`。在 `test/panel-projection.test.js` 加漂移防护测试：`H.buildPanelState(4列有数据)` → `projectButtonLibrary` → filter `source==='default'` 得到 `id=__default__`/`kind=swap`/`total=1`。
- **面板闭环验证（无头等价演练）**：真实 GUI `http://127.0.0.1:62840` 返回 401（需 tokenized URL，无法直接驱动浏览器 DOM），改用真实引擎 + `client/index.js` 投影 + `panel-bridge` 的端到端演练覆盖面板代码路径：①预览卡六段齐全、影响 2/2 行；②默认按钮 `__default__`/swap 工时↔时薪，点击重算 ok（影响 2 行/共 2 行、4 个单元格将变）；③建表 #53（`buildCreateSpec` blank）→ `defaultCreateTable` 真实建 xlsx ok；④上传建表 #55（2 数据行）真实写盘 ok。演练脚本用后即删。

**测试基线（2026-11-19，含 `7ebaa19`）**：`npm test` 427 tests / 406 pass / 0 fail / 21 skipped（跳过均「react 不可解析」环境跳过，+1 为 #45 source 漂移防护测试）；两 acceptance 绿（engineMatchesFile:true / valuesMatch:true）。

## 交付后增量（第三波：真实面板闭环的三个致命 bug 修复，#56，2026-11-19 补记）

真实 GUI 面板「理解 → 预览 → 确认执行」在带 token 的真宿主里点击后**整条管线失效**（点理解无任何反应 / 报"按钮库里还没有这个按钮" / 报"输入框是空的，先写一句话"）。根因是**两个叠加的代码 bug + 一个列名解析缺口**，此前测试全用大写动作名 + fetch 桩模拟成功，精准漏掉了真实客户端路径。三处修复：

- **① 动作名大小写不匹配（致命，`42fe744`）**：真实客户端 `client/index.js::runAction` 发**小写** `understand/preview/confirm/solidify`，而引擎 `lib/engine.js:1119` `reduce` 的 `switch` 只认**大写** `'UNDERSTAND'` 等，小写落 `default: return state` 被**静默忽略** → stage 永远停在 IDLE、点什么都没用。修复：`lib/panel-session.js::applyAction` 入口把 `action.type` 归一化为大写（Host 侧唯一兜底口，大写动作不受影响）；`lib/panel-bridge.js:317` 的「是否执行类动作」判断也先 `toUpperCase()` 再比 `CONFIRM`/`RUN_BUTTON`，否则**小写 `confirm` 不触发写盘**（面板显示已执行但磁盘没变）。
- **② 理解没带输入框文字（`3029a92`）**：`runAction('understand', {})` 只发动作类型、漏发 `text`；引擎 `UNDERSTAND` 用 `action.text`（缺省才退 `state.input`，而 Host 侧 `state.input` 从未被 SET_INPUT 写过）→ `understand('')` → 报"输入框是空的，先写一句话"。修复：`client/index.js::runAction` 在 `type==='understand'` 且 `act.text` 未给时附当前 `inputText`；`npm run build:client` 重建 `client/client.js`。
- **③ swap 列名解析缺口（`42fe744`）**：`understand()` 只做 kind 关键词匹配、不解析列名，草稿默认列名（部门/备注）落到真实表上撞列 → 校验报"字段A 与 字段B 不能相同"。修复：`lib/panel-session.js::normalizeDraft` 对 `swap` 从 `draft.sentence` 按出现顺序捞出真实列名（"对调工时和时薪两列" → `字段A=工时`/`字段B=时薪`），并兜底保证 A≠B。

**回归测试**：`test/panel-action.test.js` 加 4 例（小写 understand 全链、小写 confirm 落盘一次、句子列名解析、不撞列）；`test/new-recipe-loop.test.js` 加 1 条断言（understand 请求体带 `text`）。**真面板真实端到端测试固化**：`test/panel-e2e-real.test.js`（`730423c`）——与其它测试不同，它不用 fetch 桩伪装成功，而是把迷你 React 垫片跑起的**真实 `client/index.js` 组件**的每个 `/workbench-api/action` 请求**原样交给真实 `makeActionHandler`**（真实 panel-session 状态机 + 真实引擎 + 真实 `xlsx_bridge.py` 建表/写盘/读回），断言"输入→理解→预览→确认"全链走通且逐格核对 swap 对调落盘。已做**变异验证**：临时破坏①大写归一化或②understand 带文字任一修复，测试即 `pass 0 / fail 1`，证明能真抓 bug（这正是此前纯 Host 单测 + fetch 桩漏检的盲区）。**真实端到端验证**（真实 `client/index.js` 渲染 body + 真实 `makeActionHandler`，非 stub）：输入"对调工时和时薪两列" → 理解(UNDERSTOOD) → 预览(PREVIEWED，影响 4 行) → 确认(EXECUTED，写盘 8 格)，并回读 `演示_员工工时表.xlsx` 确认工时↔时薪 4 行 8 格真实对调落盘（mtime/sha256 均变）。

**测试基线（2026-11-19，含 `730423c`）**：`npm test` 432 tests / 411 pass / 0 fail / 21 skipped（跳过均「react 不可解析」环境跳过，+6 为 #56 回归，其中 1 为真面板真实端到端）；两 acceptance 绿（engineMatchesFile:true / valuesMatch:true）。关键 commit：`42fe744`（①③）、`3029a92`（②）、`730423c`（真面板端到端测试）。

## 交付后增量（第四波：五动作真实面板 e2e 复核 + 两处接缝缺口修复，#57，2026-11-19 补记）

对 extract/swap/conditional/function/dedupe 五动作各在真实面板路径（真实 `makeActionHandler` + 真实 `defaultReadTable`/`defaultApplyTable`/`defaultRecalc`，真 python 桥 + 真 LibreOffice Kit）跑一遍 understand→preview→confirm，发现 swap/conditional/dedupe 完全正常，extract/function 各暴露一处**真实接缝缺口**（引擎算法本身无错，缺口在「Host 侧 I/O 接线」）：

- **缺口 A — extract 在真实面板不可用（来源文件永远校验失败）**：`lib/panel-bridge.js::defaultReadTable` 此前只回 `{columns,rows}`、**不产出 `sources`**；而 `lib/index.mjs:68/72` 建 handler 时未覆盖 `readTable` → 引擎 `extract` 的跨表检查（`lib/engine.js:737` `state.sources[来源文件]` 必须存在）永远报「来源文件不在声明式数据源里」。修复：新增 `collectSiblingSources(file)`，`defaultReadTable` 把主表**同目录**下的 `.csv`/`.xlsx` 兄弟文件读成 `sources[文件名]={columns,rows}`（默认约定：extract 的「来源文件」即同目录兄弟文件，如 `外勤登记表.csv`）。
- **缺口 B — function 确认后数值读回为空（未重算）**：`xlsx_bridge.py apply` 只把公式字符串（`=B2*C2`）写进单元格、**不计算**；而 `defaultReadTable`/`read-values` 用 `data_only=True` 读**缓存值**，新写公式无缓存 → 「应发」列读回为空（看似没算，实际公式已正确落盘）。`acceptance:formula` 能过是因为它**额外**调了 bundled LibreOffice Kit 重算，真实面板 confirm 走 `defaultApplyTable` 少了这一步。修复：新增 `defaultRecalc(file)`（调 bundled LibreOffice Kit `recalculate`，因 Kit 要求输入/输出路径不同，先算到临时文件再 `copyFileSync` 回写），`makeActionHandler` 在**写出的单元格含公式**（`after` 以 `=` 开头）时就地重算；`recalcOk`/`recalcError` 随响应回传。
- **缺口 C — 主键重复时写错行（五动作 e2e 用带重复姓名表时暴露，是既有 bug 非 #57 引入）**：`scripts/xlsx_bridge.py::apply` 建 `row_of` 按主键值索引，重复主键只留**最后一次出现** → 写回全落到那一行、首个重复行永远改不到（swap/conditional/function/extract 在含重复姓名的表上均错一行）。引擎 `lib/engine.js:882-884` 本就在 `preview.cells` 里带 `rowIndex`（该物理行下标）专为此设计，但桥此前忽略。修复：`apply` 优先用 `cell['rowIndex']`（Excel 行号 = rowIndex+2）精确定位，无 rowIndex 时回落主键值定位（向后兼容）。

**回归测试**：`test/panel-seams-5kinds.test.js`（4 例，真 python 桥 + 真 LibreOffice）——① defaultReadTable 把同目录 CSV 读成 sources 且 extract 全链写盘正确；② function 预览产物为公式字符串、confirm 后 `recalcOk:true` 且应发读回=工时×时薪；③ swap 等纯值动作不触发重算；④ 主键重复时按 rowIndex 精确写回、首个重复行也被改到（缺口 C 回归）。

**测试基线（2026-11-19，#57）**：`npm test` 436 tests / 415 pass / 0 fail / 21 skipped（+4 为 #57 接缝回归，含真 LibreOffice 重算用例）；两 acceptance 绿（engineMatchesFile:true / valuesMatch:true）。关键 commit：见下方「第四波」commit（panel-bridge 接缝修复 + xlsx_bridge rowIndex 修复 + panel-seams-5kinds 测试）。

## 交付后增量（第五波：面板延迟修复 + 浮窗 UI 重构 + 五动作一键化，#58，2026-11-19 补记）

用户反馈两个真实体验问题：①「暂无预览要等很久、点理解很久才有反应」；②「表格工作台显示原始数据太难看，要变成浮窗——打开 Excel 时原表原样显示、只浮一个小按钮，点按钮才出浮窗面板」。

- **根因（延迟）**：`defaultReadTable` 每次调用都 spawn python（startup+import openpyxl 620ms + 读主表 640ms）并 **eager 读同目录全部兄弟文件**（~5×640ms），单次≈3.2s；而 `client/index.js::usePanelData` 用 `setInterval(900)` 每 900ms 轮询 `/state`，每次动作又重读 → 面板一直在重读、点「理解」排在 3.2s 读之后。修复：`lib/panel-bridge.js` 加每文件 TTL 缓存 `_readCache`(2s)、`_sourcesCache`(10s)，拆 `defaultReadTable`(带缓存) 与 `defaultReadTableCore`(不 eager 兄弟源)，新增 `loadSourcesForExtract(file)`(惰性+缓存 10s，仅 extract 需要才加载兄弟源)，写盘成功后 `invalidateReadCache`。首读 3.2s→0.6s，缓存命中 0ms。
- **UI 浮窗重构**：`client/index.js::renderWorkbenchPanel` 由「侧栏流式堆叠整表数据」改为只渲染 `position:fixed` 悬浮元素——右下角悬浮按钮 `data-wb-fab`（⚙，始终显示，不遮挡原表）+ 点开后右下角浮窗面板 `data-workbench-panel`（宽 380、maxHeight 72vh、可滚动）。收起态面板 `display:none` **保留在 React 树里**（不占位、不遮挡、切换无需重建）。`WorkbenchPanelBody` 加 `fabOpen` React state 控制开合；护栏测试非渲染上下文 `fabOpen` 默认 true 保证内容可断言。
- **五动作一键化**：浮窗面板加 QUICK 快捷按钮行（提取字段/调换两列/条件改动/公式计算/按主键去重），点一下发 `QUICK`（跳过理解、直接出「解释+影响预览」），再点「确认执行」即写盘。关键修复：QUICK 在引擎 reduce 内部立刻 preview+校验，默认列名（部门/备注）落真实表必失败——`lib/panel-session.js` 新增 `preNormalizeQuickParams(kind,p,cols)`，在 reduce **之前**把 QUICK 的列名类参数按真实列预归一化；且 `lib/panel-bridge.js` 让 `QUICK + kind==='extract'` 也挂 `sources`。五动作均直达 PREVIEWED。

**回归测试**：`test/panel-projection.test.js` 加 3 例浮窗外壳结构（始终有 position:fixed 悬浮按钮 / 收起态面板 display:none 且在树里 / 展开态 display:flex）；`test/panel-seams-5kinds.test.js` 加 2 例（读表 TTL 缓存命中不重复 spawn + 写盘失效拿最新值 / QUICK 五动作在真实表上均直达 PREVIEWED）。

**测试基线（2026-11-19，#58）**：`npm test` 441 tests / 420 pass / 0 fail / 21 skipped；两 acceptance 绿（engineMatchesFile:true / valuesMatch:true）。关键 commit：3b63c3d（面板延迟缓存 + 浮窗 UI + 五动作一键化）。

## 交付后增量（第六波：影响行数按行去重 + 五动作实机 e2e 固化 + 浮窗 FAB 美化，#61/#62，2026-11-19 补记）

用户 m07263（AFK）要求：打开 Excel 原表原样、只多一个不遮挡的浮窗按钮并优化美化；自己实机跑通全部功能自解问题；完成地图探索；整体美化到可上线。

- **#61 影响行数按行去重（`5f52068`）**：`lib/engine.js` 的 `affectedRows` 原用主键值字符串 `c.row` 做去重键 `rowSet[c.row]=true`，**重复主键会把两行塌成一行、少报影响行数**（预览显示"影响 1 行"但磁盘实变 2 行；swap 在带重复姓名的表上可用磁盘实证两行都对调、仅计数错）。修复：`rowSet` 键优先用 `rowIndex`（`'#'+c.rowIndex`，重复主键也能区分），无 `rowIndex` 时回落主键值（`'k:'+c.row`，向后兼容）。
- **五动作实机 e2e 固化（`test/panel-multi-action.test.js`，随 `5f52068`）**：迷你 React 垫片跑**真实 `client/index.js`** + **真实 `makeActionHandler`**（真实 panel-session 状态机 + 真实引擎 + 真实 `xlsx_bridge.py` 建表/写盘/读回），对 extract/swap/conditional/function/dedupe 各驱动一遍「IDLE 原始表格 → 点一键动作出预览 → 确认执行写盘」，断言三态 DOM 结构（IDLE 有 `data-workbench-orig-table` 无箭头 / PREVIEW 有箭头 / EXECUTED 保留 `data-wb-changed` 无箭头）并逐格读盘核对；并用重复主键（两个"阿岚"）表断言 swap 影响 **4 行**（旧 bug 会少报成 3 行）。建 fixture 用真 python `create(mode=upload)`，外勤登记表.csv 供 extract。
- **#62 浮窗 FAB/面板美化（`6f24905`）**：① FAB `data-wb-fab` 由纯色 emoji 改为**品牌蓝渐变圆钮（56×56）+ 内联 SVG 图标**（去掉跨平台不一致的 ⚙ emoji）+ 双层柔和投影 + hover 上浮微动效；② 面板 `data-workbench-panel` 改**渐变标题栏**（含状态指示点 + 圆形收起钮 ✕）、精致圆角 14/描边/大投影、内容区留白；③ 去掉正文里与标题栏重复的『表格工作台』标题（改为无障碍隐藏占位，保 `body-react-element`/`render-children`/`panel-data-pipeline`/`click-loop` 等测试仍能查到字样）。纯视觉改动，`data-*` 契约与三态渲染逻辑不变。
- **控件统一美化（`2ad4d07`）**：理解/预览/固化为描边按钮、确认执行为主色实心（禁用灰化）；五动作快捷标签改圆角 pill 芯片（品牌蓝边 + hover）；输入框圆角描边统一；按钮库按钮/管理键（运行/改名/改参数/删除，删除红语义）与建表模板/空白表按钮与输入框统一。纯视觉。
- **渲染异常兜底（`60a0de2`，上线健壮性）**：`WorkbenchPanelBody` 调用 `renderWorkbenchPanel` 包 `try/catch`，渲染期任何意外异常 → 返回一个红色告警悬浮钮（`data-workbench-error-fallback`，仍是合法 React 元素），保证宿主视图不因面板渲染错误而崩溃/白屏。已用强制抛错脚本验证兜底路径返回合法元素；happy path 由全量测试覆盖。至此四类宿主级崩溃防护齐备：插件加载（`ebf1012` ESM 导出对齐）、tab 注册（`ctx.effect`+`slots.inject` 包裹）、面板渲染（本次兜底）、动作处理（各 `try/catch`）。
- **滚动内容区弹性修复（`c65b250`，可上线细节）**：`data-wb-fab-body` 的 style 由 `flex: 1` 改为 `flex: '1 1 auto', minHeight: 0`——flex 列布局中带 `overflow-y:auto` 的子项若缺 `min-height:0`，在部分浏览器下内容会撑破 `maxHeight:72vh` 面板而非内部滚动；补上后长内容在面板内正确收缩滚动、不溢出面板边界。

**测试基线（2026-11-19，#61/#62）**：`npm test` 453 tests / 432 pass / 0 fail / 21 skipped（+5 为五动作实机 e2e）；两 acceptance 绿（engineMatchesFile:true / valuesMatch:true）。关键 commit：`5f52068`（affectedRows + 五动作 e2e）、`6f24905`（FAB/面板美化）、`2ad4d07`（控件统一美化）、`60a0de2`（渲染异常兜底）。

## 交付后增量（第七波：打开文件显示原表 + replace/fill 两新动作 + 通用字段配置表单 + 空白表自选主键，2026-11-19 补记）

用户 m08197（verbatim）：『图1打开文件还是空白，我要的打开文件还是原来的 Excel 表，里面有个浮窗…只有5个按钮太少了，你给我继续添加几个日常常用的功能按钮，把一键动作按钮做成通用的按钮，不是只能用特定的字段，而是由使用者自己选择字段（可以选择一个字段的部分信息，而不是字段的全部信息，条件筛选）…新建表格也是要灵活点。』

- **打开文件显示原表（fcfc8f）**：此前 workbench tab body 只渲染 position:fixed 浮层，pane 自身流式区域为空=打开文件一片空白。修复：enderWorkbenchPanel 拆为「流式主区域 mainPane（data-workbench-main，填满 pane，渲染原表/预览/执行后表格）」+「浮窗按钮/面板（fixed 覆盖层）」；abOpen 默认 false（打开只露右下角浮窗按钮，点开才展开功能面板）。踩坑：jsxs(type,props,children,key) 的 children 必须放进 props.children，否则子节点丢失、面板空白。
- **两新动作 replace / fill（ 0039f）**：lib/engine.js 新增 ⑥eplace（文本替换：目标列/查找/替换为，子串替换；查找为空时整列赋值）与 ⑦ill（空值填充：目标列/填充值，空或仅空白才填、已有值不动），各带 paramSpec + stepsFor + preview 分支；校验仍由 paramSpec 机械派生（封闭白名单）。
- **通用动作配置表单（ 0039f）**：client 动作 chip 不再写死字段——点 chip 打开配置表单（data-wb-form），按 ACTION_FORMS 渲染列下拉（列来自当前表 hostState.table.columns）、枚举下拉、文本输入 + 作用范围（全部/满足条件）+ 条件输入；点「预览」发 QUICK 带显式 params（{kind, params}），使用者可自选列、选部分列、加条件筛选。labelOfKind 补 replace/fill 防漂移。
- **空白表自选主键（0f56f5）**：空白建表原固定首列作主键，面板新增「主键列」输入框（data-wb-newblank-pk），可指定任意一列作主键（留空默认首列）；uildCreateSpec 的 primaryKey 校验（列不在清单则报错）本就支持，本次仅把 UI→/create 透传接通。

**测试基线（2026-11-19，第七波）**：pm test 464 tests / 443 pass / 0 fail / 21 skipped（+8 replace-fill +2 panel-multi-action 扩到 7 动作）；两 acceptance 绿（engineMatchesFile:true / valuesMatch:true）。关键 commit：fcfc8f（原表流式主区域）、 0039f（replace/fill + 通用表单）、0f56f5（空白表主键）。

## 交付后增量（第八波：新增 trim/case/affix 三种日常动作，QUICK 芯片 8→10，2026-11-19 补记）

用户 m08197「只有5个按钮太少，继续添加日常常用功能」。引擎 `lib/engine.js` KINDS 增 ⑧`trim`（去目标列文本首尾空白）、⑨`case`（英文统一大写 upper / 小写 lower）、⑩`affix`（统一加前缀 prefix / 后缀 suffix），各带 paramSpec + stepsFor + preview 分支，均复用 cells 值变换模型（每格 before→after，不改架构），封闭校验由 paramSpec 机械派生；`understand` 关键词补 trim/case/affix（并补 replace/fill）。client `ACTION_FORMS` + `labelOfKind` 同步，QUICK 芯片现共 **10 个**，全部走「通用字段配置表单」（用户自选列、可加条件 scope/条件）。新测试 `test/new-actions-trim-case-affix.test.js` 8 例。

**测试基线（2026-11-19，第八波）**：`npm test` 472 tests / 451 pass / 0 fail / 21 skipped（+8 新动作）；两 acceptance 绿。本波提交见 git log（trim/case/affix）。

## 交付后增量（第九波：原生表格视图回退 + 自定义下拉，用户 m08845，2026-11-19 补记）

用户反馈两个问题：①配置表单下拉框展不开/选不了；②打开 xlsx 应显示宿主原生可编辑表格（像 WPS 那样），插件只多一个浮窗按钮、不接管主视图。

- **问题2 架构根因**：此前 `sidebarRightTabs.register({patterns:['*.xlsx','*.xls','*.csv'], priority:'extension'})` 抢占了 .xlsx 文件面板，覆盖掉宿主原生 documentpreview 的可编辑表格视图 → 用户看到的是 workbench 重绘的只读表。
- **修法（overlay 架构）**：文件 tab 类型 patterns 改为 `[]`（不再抢占任何文件）；新增 `registerWorkbenchOverlay(ctx)` 经 `shell.overlay` 全局浮层注册右下角悬浮按钮+悬浮面板；`pickActiveSheetFile(snapshot)` 从 `betterSidebar.getSnapshot()` 的活跃 editor tab 解析当前打开的 .xlsx/.xls/.csv（非表格不渲染、绝不遮挡原生视图）；`renderWorkbenchPanel(overlay:true)` 只渲染 fab+panel、不渲染流式主区域表。
- **问题1 修法**：新增 `WbDropdown` 自定义下拉组件（按钮 + 打开时 `getBoundingClientRect` 定位的 `position:fixed` 选项列表→脱离面板 overflow 裁剪；高 z-index、点击外部/选中即收；支持字符串或 {value,label} 选项）。配置表单与作用范围选择均改用 WbDropdown。
- **测试**：panel-smoke 补 `pickActiveSheetFile` 单测（xlsx/csv 命中、txt/空快照不命中）+ tab.patterns 必须为空的架构断言；panel-projection 补「叠加模式只渲染 fab+panel、不渲染 data-workbench-main/原表」断言。全量 npm test 474 tests/453 pass/0 fail/21 skipped；acceptance engineMatchesFile:true、acceptance:formula valuesMatch:true。

## 边界与已知瑕疵（接手须知）

- **云端四格能力位维持全 false**：腾讯三格负面已验证（写侧 CellValue 仅 text/link/number、V3 接口无重算、get_range 无计算值字段），飞书四格未验证 + 使用者豁免 Step7/8/9（按 ⑲ 保守记 false）。未因链路通/豁免重测成 true。
- **Out of scope（触发时才另起 effort，不复活本轮）**：细粒度权限/账号体系/分享链接/按钮级 ACL；AND/OR 与 v2 条件语法、v2 整体能力重画；「任意自然语言一步编译成可命名函数」；能力位重测；实现代码/可运行插件本体（地图只产决策）。
- **[规格 #34](https://github.com/huobuzhe/ai_work/issues/34) 正文开头的叠加 BOM 字符已修**：曾因多次回填脚本各自加 BOM 导致开头出现 4 个 U+FEFF（`﻿﻿﻿﻿## Problem Statement`），已于 2026-11-17 用 `gh api` 取原始正文、剥掉前导 BOM 后写回（校验 0 U+FEFF，首行为 `## Problem Statement`）；内容完整未动。
- **研究资产已归档入库**：`docs/research/`（14 篇平台事实笔记 + 本账本）、`prototypes/`、`scripts/` 已分三批提交（`d8038ee`/`77ed693`/`4091c91`），工作树干净。是真实研究资产，保留受控。
- **仓库 description 已补（显式边界修订）**：2026-11-17 经用户明确授权，用 `gh repo edit --description` 将 `huobuzhe/ai_work` 的 description 设为「本地优先的表格自动化工作台」。此举**打破 #1 规格第 50 行「不设仓库 description」的既定边界**——原边界是为避免在无实际内容时堆门面文件，现 README 已交付、项目方向已明确，列表页需要一句话定位，故修订此边界。仅改 GitHub 仓库元数据，不新增/不提交任何文件，工作树不受影响。
- **逢十轮「CCG 归档」提醒**：曾多次出现要求 `cg op=write` 并读回节点 id 的注入式提醒；本工具集无 `cg` 工具，未执行、不伪造 id。真正的跨会话记忆以本文件与各 issue 为准。

## 可复现核对

本账本由一次只读审计脚本核对通过（FAIL=0），核对项：

1. 容器票 #2/#29/#8/#34 **及 #1** 全 CLOSED；
2. #9–#28 全 CLOSED；
3. #35–#40 全 CLOSED；
4. #41–#54 全 CLOSED（面板接入宿主 + 面板内真实交互波）；
5. 地图 #2 的 Decisions so far 含 #3–#7 + #8 指针；
6. 地图 #29 含 #30–#33 指针；
7. 规格 #8 进度含 #9–#28 + #45 指针（#27 因 gist 交叉引用计数 4 次属正常）；
8. 规格 #34 含 #35–#40 指针、7 区块 + 44 story；
9. 交付基线 = 三批归档提交 `d8038ee`/`77ed693`/`4091c91`（固定锚点，不随账本自身提交变化）；当前 HEAD 以 `git log` / `git rev-parse HEAD` 为准，工作树无已跟踪 diff；
10. `npm test` 全绿（计数以实际输出为准，不写死），`engineMatchesFile: true`，`valuesMatch: true`。
