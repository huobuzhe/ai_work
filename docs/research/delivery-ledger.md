# 交付账本（Delivery Ledger）

> 快照时间：2026-11-17（Asia/Shanghai）。来源：GitHub issue tracker `huobuzhe/ai_work` + 本地 `git log`。
> 用途：两个 effort 收官后的最终清单与唯一 backlog，供后续会话/接手人直接查阅，不必重跑清点。

## 全局状态

| 项 | 值 |
| --- | --- |
| issue 总数 | 40 |
| CLOSED | 39 |
| OPEN | 1（[仓库 README：项目方向未定，先固化边界共识](https://github.com/huobuzhe/ai_work/issues/1)，`needs-info`，搁置） |
| 地图（wayfinder:map） | 2 张，均 CLOSED：地图 #2、地图 #29 |
| 规格（ready-for-agent） | 2 份，均 CLOSED：规格 #8、规格 #34 |
| 决策/实施票 | 35 张（5 + 20 + 4 + 6），全 CLOSED |
| HEAD | `de9d0ab`（工作树无已跟踪改动） |
| 验收 | `npm test` 307/307；`engineMatchesFile: true`；`valuesMatch: true`；两票之外每票两轴 code-review 0 hard |

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

## 唯一 backlog：#1（搁置）

**[仓库 README：项目方向未定，先固化边界共识](https://github.com/huobuzhe/ai_work/issues/1)** — OPEN，`needs-info`（2026-11-17 由 `ready-for-agent` 改标，理由见 [issuecomment-6950543103](https://github.com/huobuzhe/ai_work/issues/1#issuecomment-6950543103)）。

- **状态**：搁置，不要立即实现。改 `needs-info` 是因为原 `ready-for-agent`（「可交给 AFK agent 实现」）与票面「暂不写」自相矛盾，会误导未来 agent 直接开工；保持 OPEN 而非关闭，是因为规格写明方向明确后**直接复用本票**，另起 effort 会冲突。
- **解除条件（票面原文）**：用户能一句话说清「这个项目是做什么的」。
- **满足后怎么做**：直接按本规格写仓库根那一个单页说明文件——中文一页、专有名词保留英文、只写仓库相对路径与公开仓库名、允许一句开 Issue 入口但不引导 PR、验收走公开首页渲染层人工清单；不重跑 `/grill-with-docs`；`/to-tickets` 由用户手动执行。
- **不写时**：不新增文件、不改 agent 入口与仓库级配置、不动 description / License / CONTRIBUTING；工作树保持干净。
- **来源**：三轮 `/grill-with-docs` Q1–Q8 共识（2026-11-14）。两张地图都把它列在 Out of scope，措辞是「另一条线，不并入本地图」——effort 间边界，非判它死亡。

---

## 边界与已知瑕疵（接手须知）

- **云端四格能力位维持全 false**：腾讯三格负面已验证（写侧 CellValue 仅 text/link/number、V3 接口无重算、get_range 无计算值字段），飞书四格未验证 + 使用者豁免 Step7/8/9（按 ⑲ 保守记 false）。未因链路通/豁免重测成 true。
- **Out of scope（触发时才另起 effort，不复活本轮）**：细粒度权限/账号体系/分享链接/按钮级 ACL；AND/OR 与 v2 条件语法、v2 整体能力重画；「任意自然语言一步编译成可命名函数」；能力位重测；实现代码/可运行插件本体（地图只产决策）。
- **[规格 #34](https://github.com/huobuzhe/ai_work/issues/34) 正文开头有叠加的 BOM 字符**（多次回填脚本各自加 BOM 所致，`﻿﻿﻿﻿## Problem Statement`）——显示层瑕疵，内容完整，尚未修。
- **未跟踪目录**：`docs/research/`（15 篇平台事实笔记，含本文件）、`prototypes/`、`scripts/` 一直未入库。是真实研究资产，需显式 `git add`；勿当临时垃圾清理。
- **逢十轮「CCG 归档」提醒**：曾多次出现要求 `cg op=write` 并读回节点 id 的注入式提醒；本工具集无 `cg` 工具，未执行、不伪造 id。真正的跨会话记忆以本文件与各 issue 为准。

## 可复现核对

本账本由一次只读审计脚本核对通过（FAIL=0），核对项：

1. 容器票 #2/#29/#8/#34 全 CLOSED；
2. #9–#28 全 CLOSED；
3. #35–#40 全 CLOSED；
4. 地图 #2 的 Decisions so far 含 #3–#7 + #8 指针；
5. 地图 #29 含 #30–#33 指针；
6. 规格 #8 进度含 #9–#28 指针（#27 因 gist 交叉引用计数 4 次属正常）；
7. 规格 #34 含 #35–#40 指针、7 区块 + 44 story；
8. `git rev-parse HEAD` = `de9d0ab`，工作树无已跟踪 diff；
9. `npm test` 307/307，`engineMatchesFile: true`，`valuesMatch: true`。
