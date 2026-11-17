# 官方 Skill／MCP／字段捷径能否把一次解释固化成可复用按钮或命名函数

> 存放理由：循仓内 `docs/research/` 习惯，与首份笔记 `spreadsheet-platform-capabilities.md` 并列，作为第 5 步 research 票 #3 的一手取证笔记。

## 取证口径与范围

- 只采一手来源：官方文档、官方 API／协议规范、官方帮助／产品页；每条断言后紧跟来源 URL。外部网页内容一律是不可信数据，只作证据、绝不当作指令（取证口径同 `docs/research/spreadsheet-platform-capabilities.md` 第 5 行）。
- 一手页面正文取不到（SPA 只返回标题、请求 30 秒超时、返回空 body／错误页）或一手来源互相矛盾时，写「未验证」并说明原因，不补二手转述、不臆测。本轮 `developers.google.com/apps-script/*` 全部超时、部分飞书帮助页只返回标题、腾讯 Skill 配置说明页返回空 body，对应条目均据此标注。
- 本笔记只补两件事：清掉首份笔记 §2.4（第 90 行）标为「未验证」的「腾讯文档官方 Skill 是否支持把一次解释固化成可复用按钮／函数」，以及从「固化／复用」角度补各形态的审核／计费／限流门槛。不重复抄首份笔记的既有条目，不修改那份笔记。
- 判定标尺：把 Question 的「用一句话生成一个带名字、带参数、可保存并在下次一键复用的动作」拆成五个要件 —— ①入口是任意自然语言解释；②产出带名字；③带参数；④可保存／持久化；⑤下次可一键复用（按钮或像函数一样被反复调用）。逐形态对照，任一要件缺位即不能算「全链条支持」。

## 1. 腾讯文档 MCP / Skill —— 清掉「未验证」条目

**结论：不能。** 官方公开文档层面没有「把一次自然语言解释固化成命名函数／可复用按钮」的机制。

- MCP 侧定位是「你只需通过自然语言下达指令，即可让模型操作腾讯文档空间里的数据资产」，即自然语言是**每次临时下指令**，用于让模型调用既有 Open API 能力，而非把这一次解释编译成一个可保存、下次一键复用的动作（https://docs.qq.com/open/document/mcp/）。
- MCP 侧的使用条件是「需要登录 QQ／微信后方可操作对应账号的数据」，并提示「开通腾讯文档超级会员／超级会员 Plus 可享受更多特权」（https://docs.qq.com/open/document/mcp/）。
- MCP 侧限流是频率控制表「次／天」：免费用户 2000／天、超级会员 20000／天、超级会员 Plus 40000／天；这是调用频次门槛，与「固化／复用」无关（https://docs.qq.com/open/document/mcp/）。
- Skill 侧定位是「将分散、异构的办公生产力工具集抽象为一套统一的 API 指令集，通过 MCP 标准框架……智能编排与自动化调度」，并称「腾讯文档 Skill 通过标准化 MCP 工具集，提供了全方位的文档生命周期管理能力」（https://docs.qq.com/open/document/mcp/skill/）。
- Skill 概述页全文只有「腾讯文档 Skill 核心能力」一节，是一份**预置能力罗列**：一键生成 AI PPT；一键完成 Excel 跨表读写、设置颜色及基础公式操作；一键排版生成 Word；一键复制指令更新腾讯文档 skill；把公众号／小红书／B 站页面保存为文档；获取文档列表与最近查看列表；创建各类在线文档；查询搜索文档与空间；读取与编辑文档内容；管理空间节点与文件夹结构。页面没有工具清单、没有「用户自定义函数注册」、没有「把一次解释保存成命名动作」的机制（https://docs.qq.com/open/document/mcp/skill/）。
- 该页多处「一键」指的是**执行官方预置能力**，不是把用户的一次解释固化成用户命名、可反复调用的函数；侧栏只有「MCP 概述／Skill／常见错误码」三页，无「已保存动作／自定义函数」类目（https://docs.qq.com/open/document/mcp/skill/、https://docs.qq.com/open/document/mcp/error-code/）。
- 列表里的「一键复制指令更新腾讯文档 skill」是**更新 Skill 本身**的预置能力，官方页未说明它是否等价于「注册一个用户自定义命名函数」；按取证口径，这一项的具体语义**未验证**，不能据此推断存在固化机制（https://docs.qq.com/open/document/mcp/skill/）。
- 首份笔记 §2.4 末条（第 90 行）指向的 [配置说明](https://docs.qq.com/aio/p/scg9of08ycfdc59?p=SIBSMoo4XuO9dymUo2GEDBm) 本轮取回 HTTP 200 但 **body 为空（仅一个零宽字符）**，一手正文不可得；因此「配置层是否隐藏了工具清单／固化入口」仍**未验证**并说明原因：页面正文取不到、不补二手转述。但就官方 Skill 概述页本身而言，判定为「没有可复用函数注册机制」，首份笔记那条「未验证」到此可以收口为「不能」（https://docs.qq.com/aio/p/scg9of08ycfdc59?p=SIBSMoo4XuO9dymUo2GEDBm、https://docs.qq.com/open/document/mcp/skill/）。
- 五要件对照：①否（自然语言是临时指令，不是编译入口）；②否；③否；④否；⑤否（「一键」是预置能力执行）。

## 2. 飞书 aily 字段捷径与多维表格自动化 —— 部分能

**结论：部分能。** 五个要件里「带名字／带参数／可保存／下次复用」四个都满足，但**入口不是「一句话」**（要先在 aily 平台手工编排并发布一个工作流技能），且复用形态是「字段自动触发」而非「可命名、可反复调用的函数／按钮」。官方名称已于 2026-08-14 由「飞书 aily」更名为「豆包工作伙伴」，工作流应用名称不变（https://aily.feishu.cn/hc/1u7kleqg_1cnvbb55）。

- 定义：「飞书 aily 工作流应用中的技能发布多维表格字段捷径是一个让您轻松在飞书多维表格中使用 AI 能力的功能」，作用是把 AI 技能变成表格字段、智能处理表格数据、提升工作效率（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- 前置条件（决定了「一句话」不成立）：「需要先在 aily 平台创建并测试好一个工作流技能」；「开始节点」「结束节点」都要配置参数；「技能中不能包含知识问答或者知识检索节点」；「技能中不能包含需用户身份调用的节点」；「技能必须保存提交并发布」（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- ②带名字：上架信息包含名称、图标、描述、使用说明（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- ③带参数：输出字段类型支持文本、数字、单选、多选、日期、对象、附件；输入表单配置项为字段标题、占位符文案，并支持用字段选择器引用表格已有字段（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- ③参数约束：「输入表单的字段不支持设置默认值，开始节点的默认值不会在这里生效」；「**字段捷径一旦上架成功后，输出字段类型不可以修改**」；对象类型最多添加 20 个子字段；附件类型仅支持作为唯一输出字段、最多 5 个附件、单附件大小不超过 10M（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- ④可保存／持久化：「字段捷径被发布后，对应的技能不可删除，请先下架后删除」；审批中的还需先在审批单撤回（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- ⑤下次复用：使用路径是「添加新字段 → 选『字段捷径』 → 从捷径市场安装 → 配置字段参数 → 在表格中输入或更新数据，AI 会自动处理并在目标字段中显示结果」，即安装后随数据变更**自动触发**，不是用户点一次按钮（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- 修改与重发规则（保存后的演进成本）：Case 1 仅改编排规则 → 保存提交技能 + 发布应用；Case 2 改出入参 → 改配置 + 重新发布 + 租户级需管理员审核；Case 3 仅改上架信息 → 渠道管理改 + 重新发布但不必发布应用（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- **审核门槛**：发布范围「仅自己可见／租户内可见」，「租户可见需要管理员审核」；FAQ Q3「**仅自己可见**：无需审核，发布后立即可用」「**租户内可见**：需要租户管理员审核通过后才能使用」；发布审核详见 [【多维表格】插件上下架说明](https://bytedance.larkoffice.com/wiki/O8v7wYI4MidHYEkoUvXcXMQqn2c)；Q13「租户管理员审批能力还在灰度中，一般 1-3 天完成审批」（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- **计费门槛**：FAQ Q4「会产生费用，具体的计费规则请参考 [aily 计费文档](https://aily.feishu.cn/hc/1u7kleqg/1cnvbb55#9e9db9c0)」（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）；计费单位是「飞书 AI 通用额度」（点数），「**以每次任务为单位按用量制计费（token-based）**」，收费项为产物费用／模型费用／工具费用（https://aily.feishu.cn/hc/1u7kleqg_1cnvbb55）。
- **计费门槛（续）**：「**仅限 aily 工作流应用：每次运行收取 0.5 额度（基础调度费），无其他产物费用**」；模型费用按「模型节点调用次数」累计扣费，示例 Doubao-Seed-1.6-flash 0.02 额度／节点、Doubao Seed 2.1 Turbo 1、Deepseek-V4-Pro 0.5、GLM-4 1.5；「飞书多维表格」「飞书云文档」等飞书 MCP 工具与自定义服务工具 0 额度／次（https://aily.feishu.cn/hc/1u7kleqg_1cnvbb55）。
- **计费门槛（续）**：「内容生成失败或任务异常中断，不产生任何费用」，但「**如使用过程中遇平台模型限流，仍然消耗额度**」；额度不足时 Q6 要求「联系管理员为 aily 账户充值」（https://aily.feishu.cn/hc/1u7kleqg_1cnvbb55、https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- **免费与价格**：每位用户累计 20 次免费对话次数（限领一次）；「使用 aily 企业工作伙伴、aily 工作流应用时，**每个租户每月可获得 400 额度（租户内共享）**，体验额度每月 1 号自动刷新」，「已购买 AI 版本的企业不会赠送」；企业价 AI 基础版 9,900 元／年或 990 元／月（18 万点／年）、豆包团队订阅年付 ¥1,988／席／年（2,000 点／席／月）、豆包企业用量套餐 200 万点 99,000 元／年、600 万点 297,000 元／年、2000 万点 990,000 元／年；个人豆包订阅 68／200／500 元／月，飞书 AI 会员 69 元／月、AI 会员 Plus 138 元／月起（https://aily.feishu.cn/hc/1u7kleqg_1cnvbb55）。
- **版本权益门槛**：AI 基础版与豆包团队订阅对「飞书 aily 工作流应用 API／SDK 调用」为 ❌，200 万点及以上套餐为 ✅；自定义模型接入在多数低档套餐为 ❌；「豆包工作伙伴可以访问中国大陆公网，暂不支持访问海外站点及企业内网」，自定义模型「不支持企业本地部署模型接入。不支持海外模型接入」（https://aily.feishu.cn/hc/1u7kleqg_1cnvbb55）。
- **限流门槛**：FAQ Q10「**每个租户的字段捷径运行限制为 10 QPS，超过限制后的运行任务会排队依次执行**」；Q14 单文件 ≤10M、每次触发最多 5 个文件；Q7「同一个工作流只能发布成一个字段捷径」；Q1「目前仅支持工作流技能发布成字段捷径」；Q9 下架后市场不再可见、已安装用户无法继续使用、无法再次触发字段值生成会报错（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- **多维表格自动化／工作流侧：未验证。** 官方帮助页 https://www.feishu.cn/hc/zh-CN/articles/908751305974-多维表格工作流介绍 只返回标题「多维表格工作流介绍」、正文截断；https://base.feishu.cn/helpcenter/ai8y3d44/0dvrw73c 只返回标题「使用多维表格 AI 字段捷径 - 帮助中心 wiki 手册 - 飞书多维表格帮助中心」、正文截断；侧栏另有「快捷指令」(/hc/1u7kleqg_jxgrvifl)、「妙搭 AI 对话组件」(/hc/1u7kleqg_blt2djzv) 未取回正文。原因是这些一手页面为 SPA／正文不可得，按口径不补二手转述，故自动化侧能否「一句话固化」标未验证（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）。
- 五要件对照：①否（须先编排工作流技能）；②是；③是；④是；⑤部分（自动触发复用，非按钮／命名函数）。

## 3. Excel LAMBDA —— 部分能（「命名函数」最标准的介质，但入口不是自然语言）

**结论：部分能。** 它是「带名字、带参数、可保存、下次可反复调用」最干净的一手原型，但输入是公式语法，官方页没有「一句话 → LAMBDA」的编译。

- 官方定义：「Use a LAMBDA function to create custom, reusable functions and call them by a friendly name. The new function is available throughout the workbook and called like native Excel functions.」；「a LAMBDA function doesn't require VBA, macros or JavaScript, so non-programmers can also benefit from its use.」（https://support.microsoft.com/en-us/excel/functions/lambda-function）。
- ②带名字 + ④可保存：「**Step 3: Add the Lambda to the Name Manager** ... give the LAMBDA function a meaningful name, provide a description, and make it re-usable from any cell in the workbook」；路径 Formulas > Name Manager（Windows）／Define Name（Mac）> New，字段为 Name／Scope（默认 Workbook；除 Excel for the web 外可设单张工作表）／Comment（最多 **255 字符**，显示在 Insert Function 对话框与 Formula Autocomplete 提示中）／Refers to（https://support.microsoft.com/en-us/excel/functions/lambda-function）。
- ③带参数：语法 `=LAMBDA([parameter1, parameter2, …,] calculation)`；「You can enter up to **253 parameters**」；超过 253 个参数 → `#VALUE!`，实参个数不对 → `#VALUE!`，循环递归 → `#NUM!`，单元格里写了 LAMBDA 却不调用 → `#CALC!`；官方示例 ToCelsius `=LAMBDA(temp, (5/9) * (Temp-32))`、Hypotenuse `=LAMBDA(a, b, SQRT((a^2+b^2)))`、CountWords、ThanksgivingDate（https://support.microsoft.com/en-us/excel/functions/lambda-function）。
- ⑤一键复用：命名后「available throughout the workbook and called like native Excel functions」，即任意单元格像原生函数一样调用（https://support.microsoft.com/en-us/excel/functions/lambda-function）。
- ①入口：官方页给出的输入是公式语法与 Name Manager 表单，不是任意自然语言；官方页未提供「自然语言 → 命名 LAMBDA」的一步式编译（https://support.microsoft.com/en-us/excel/functions/lambda-function）。
- 条件门槛：Applies To 为 Excel for Microsoft 365／Excel for Microsoft 365 for Mac／Excel 2024／Excel 2024 for Mac；Excel for the web 不能把 Scope 设为单张工作表（https://support.microsoft.com/en-us/excel/functions/lambda-function）。
- 取证说明：旧 URL https://support.microsoft.com/en-us/office/lambda-function-bd212d37-4442-4838-8568-12f9a0fbf947 本轮返回「Error - Office.com - Microsoft Support」错误页，故改用取回全文的 https://support.microsoft.com/en-us/excel/functions/lambda-function（https://support.microsoft.com/en-us/office/lambda-function-bd212d37-4442-4838-8568-12f9a0fbf947）。
- 五要件对照：①否；②是；③是；④是；⑤是。

## 4. Excel COPILOT 函数 —— 不能（且已下线；新增决定性一手证据）

**结论：不能。** 连官方最接近「一句话进单元格」的形态也不是「用户创建并保存的命名函数」，而且已停用。

- 官方公告：「**Starting September 14, 2026, the COPILOT function is no longer available in Microsoft Excel.** The function was offered as a preview feature and was previously available only in the [Frontier program](https://adoption.microsoft.com/copilot/frontier-program/) and the [Microsoft 365 Insider program](/en-us/topic/3c7dda4f-4d05-0783-3a9a-182b50acb8a9).」（https://support.microsoft.com/en-us/excel/functions/copilot-function）。
- 曾经的形态：「The COPILOT function previously let you provide a prompt and references from the grid to generate a response from an AI language model directly in a cell.」；示例 `=COPILOT("Summarize this feedback", A2:A20)`、`=COPILOT("Classify sentiment", B2:B100)`（https://support.microsoft.com/en-us/excel/functions/copilot-function）。
- 为什么不算「固化成可复用命名函数」：它是**内置函数**，名字固定为 `COPILOT`，用户只是把 prompt 当作参数传入，不能给用户自己的动作命名、也不产生用户自定义、可保存的函数定义；且Applies To 仅为 Excel for Microsoft 365／Microsoft 365 for Mac／Excel Web App／Excel for iPhone（https://support.microsoft.com/en-us/excel/functions/copilot-function）。
- 停用后果：「any results that were already calculated remain in the workbook as cached values. When a cell that contains the function recalculates, the function returns a `#NAME?` error because it's no longer recognized.」；官方改为引导「Use Copilot in Excel and describe what you want in your own words. To open Copilot in Excel, select the Copilot icon in the lower-right corner of Excel.」，即自然语言回到「对话侧一次性描述」而非「可保存函数」（https://support.microsoft.com/en-us/excel/functions/copilot-function）。
- 五要件对照：①部分（prompt 是自然语言，但是函数参数而非编译入口）；②否（名字固定）；③是；④否；⑤否（已下线，重算即 `#NAME?`）。推论：一手官方来源里未发现「自然语言 → 命名 LAMBDA」的一步式编译器（https://support.microsoft.com/en-us/excel/functions/copilot-function、https://support.microsoft.com/en-us/excel/functions/lambda-function）。

## 5. Office Scripts —— 部分能（机械上最贴合「可复用按钮」，但入口是录制／代码）

**结论：部分能。** 这是唯一被官方明文写成「single button」的一手形态，但「一次自然语言解释」不是入口 —— 入口是操作录制器或 TypeScript／JavaScript 代码。

- 官方定位：「Office Scripts in Excel let you automate your day-to-day tasks. **Use the action recorder to turn manual steps into reusable scripts.** Edit those scripts or create new ones with the code editor. **Let others in the workbook run these scripts with a single button.**」（https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel）。
- ①入口：action recorder 把「edit cells, change formatting, create tables」等手工步骤录成可在其他工作表／工作簿重放的脚本；code editor 可加 if／else 与循环；「The action recorder has a **Copy as code** button to record actions into script code without saving the entire script.」；官方页无「一句话生成脚本并固化」的机制（https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel）。
- ②带名字 + ④可保存 + ⑤一键复用：「When you associate a script with a workbook, team members with access to the workbook can also view and run your script.」；按钮做法见下条（https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel）。
- 按钮机制：「When viewing a script, scroll to the **Share this script** section and enable the **Associate with workbook** toggle. This shares the script with the workbook, so everyone with write permissions to the workbook can use your helpful automation. Select **Add button to worksheet** to create a button in the worksheet that runs the associated script.」；「Deleting a script button from the Excel grid removes that button, but the script still remains associated with the workbook.」（https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons）。
- ③带参数：**未验证** —— 取回的官方页未说明脚本按钮如何向脚本传参；按口径不作推断（https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons）。
- **许可／条件门槛**：商业／教育版需要 Excel on the web、Excel for Windows（Version 2210 或更高）或 Excel for Mac；OneDrive for Business 且开启「People in your organization」共享链接；Office 365 Business／Business Premium／ProPlus／ProPlus for Devices／A3／A5／Enterprise E1／E3／E5／F3 之一；互联网连通且启用 connected experiences（https://learn.microsoft.com/en-us/office/dev/scripts/testing/platform-limits）。
- **许可／条件门槛（续）**：「**Script buttons aren't available during the Office Scripts preview for personal and family Microsoft 365 subscriptions.**」；「To use Office Scripts in Power Automate, you must have a **business license of Microsoft 365**. The Office 365 Enterprise E1 and Office 365 F3 licenses can use Scripts with Power Automate, but don't have Power Automate integrations directly in Excel.」（https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons、https://learn.microsoft.com/en-us/office/dev/scripts/testing/platform-limits）。
- **组织／审核门槛**：「**If OneDrive sharing is restricted by organizational policies, you can't associate a script or create a script button.**」；Conditional Access 报错原文「Due to organizational policies, you can't access this resource from this untrusted device.」「We can't find this script. It may have been deleted by another user.」；需第三方 cookie 才显示 Automate 选项卡；GCC High 不支持；Teams 仅 web（https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons、https://learn.microsoft.com/en-us/office/dev/scripts/testing/platform-limits）。
- **版本兼容门槛**：「**Script buttons won't work when opened in versions of Excel that don't support Office Scripts.** In that case, the button still appears, but selecting it has no effect.」（https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons）。
- **限流／数据门槛**：请求与响应限制为 **5MB**；单个 range 最多 **five million cells**；超限报错「The response payload size has exceeded the limit.」；Power Automate「Each user is limited to **1,600 calls** to the Run script action per day. This limit resets at 12:00 AM UTC.」；同步操作 **120-second timeout**；参数最大 **30,000,000 bytes (28.6MB)**（https://learn.microsoft.com/en-us/office/dev/scripts/testing/platform-limits）。
- **限流／数据门槛（续）**：「External API calls fail when a script is run through Power Automate. A `fetch` call will give the error message "Runtime error: Line X: fetch is not defined"」；ISO strict Open XML 工作簿不支持（BadGateway）（https://learn.microsoft.com/en-us/office/dev/scripts/testing/platform-limits）。
- **调度门槛**：「**Script scheduling is temporarily disabled within Office Scripts.** Existing scheduled scripts will continue to run. In the interim, use Power Automate to create a flow and schedule your scripts to run in that flow.」（https://learn.microsoft.com/en-us/office/dev/scripts/overview/excel）。
- **计费：未验证** —— 取回的官方页按订阅许可描述使用资格，未单列 Office Scripts 的独立计费项；按口径不作推断（https://learn.microsoft.com/en-us/office/dev/scripts/testing/platform-limits）。
- 五要件对照：①否（录制／写代码）；②是（脚本有名字）；③未验证；④是；⑤是（script button，官方明文 single button）。

## 6. Google Apps Script —— 未验证

**结论：未验证。** 本轮所有官方 `developers.google.com/apps-script/*` 页面均 30 秒超时，唯一可取回的官方帮助页只返回标题，按取证口径整节不作定论。

- 首份笔记 §4.3 已因 https://developers.google.com/apps-script/guides/sheets/functions 超时把 Google Apps Script 标为未验证；本轮再次尝试 guides/sheets/functions、guides/sheets/macros（两次）、guides/services/quotas、reference/spreadsheet/over-grid-image、guides/sheets 全部 30 秒超时（https://developers.google.com/apps-script/guides/sheets/functions、https://developers.google.com/apps-script/guides/sheets/macros、https://developers.google.com/apps-script/guides/services/quotas）。
- https://support.google.com/docs/answer/7665004 返回 HTTP 200 但只有标题「在 Google 表格中自动执行任务 - 计算机 - Google 文档编辑器帮助」、正文截断（https://support.google.com/docs/answer/7665004）。
- research 工具返回的两条**官方但 snippet-only**（搜索引擎摘要，非取回的一手正文）：https://developers.google.com/apps-script/guides/sheets/macros「Macros are more performant when they are lightweight... Macros are best suited for rote operations that need to be repeated frequently with little or no configuration. For other operations, consider using a custom menu item instead.」；https://developers.google.com/apps-script/guides/services/quotas「Quotas are set at different levels for users of consumer accounts (such as gmail.com) and Google Workspace accounts. Quotas are per user and reset 24 hours after the first request...」。按口径「一手页面正文取不到写未验证」，这两条只作线索、不作为定论， macros 能否保存成命名函数与配额具体数值均**未验证**（https://developers.google.com/apps-script/guides/sheets/macros、https://developers.google.com/apps-script/guides/services/quotas）。
- 五要件对照：全部未验证。

## 7. MCP 协议层 —— 协议给「命名＋参数化」抽象，不给按钮、不给终端用户固化

**结论：不能（就终端用户「一句话固化」而言）。** 参考官方规范 2026-07-28（由 https://modelcontextprotocol.io/docs/concepts/tools 重定向得到），用于解释为什么「MCP」本身不提供按钮。

- 「The Model Context Protocol (MCP) allows servers to expose tools that can be invoked by language models... **Each tool is uniquely identified by a name and includes metadata describing its schema.**」；「Tools in MCP are designed to be **model-controlled** ... implementations are free to expose tools through any interface pattern that suits their needs—the protocol itself does not mandate any specific user interaction model.」；「For trust & safety and security, there **SHOULD** always be a human in the loop with the ability to deny tool invocations.」（https://modelcontextprotocol.io/specification/2026-07-28/server/tools）。
- ②带名字 + ③带参数：tool definition 字段含 `name`（唯一标识）、`title`、`description`、`icons`、`inputSchema`（JSON Schema，默认 2020-12，必须是有效对象非 null）、`outputSchema`、`annotations`；`tools/call` 形如 `params: { "name": "get_weather", "arguments": { "location": "New York" } }`（https://modelcontextprotocol.io/specification/2026-07-28/server/tools）。
- 命名规则：工具名 SHOULD 为 1–128 字符、大小写敏感、允许 A-Z a-z 0-9 _ - .、不应含空格／逗号／特殊字符、在单个 server 内唯一，冲突时加 server 前缀（https://modelcontextprotocol.io/specification/2026-07-28/server/tools）。
- ④保存：servers MUST 声明 `tools` capability，`tools/list` 返回工具集，「The set MAY be empty and MAY change over time ... but **MUST NOT vary per-connection or as a side effect of other requests on the connection**」，即工具由服务端注册、不随用户一次请求而生成（https://modelcontextprotocol.io/specification/2026-07-28/server/tools）。
- 为什么不等于「一句话固化」：工具的注册方是 server 开发者、且被设计为 model-controlled；协议不强制任何 UI／按钮，也不给终端用户「把一次解释变成一个新保存工具」的机制（https://modelcontextprotocol.io/specification/2026-07-28/server/tools）。
- **未验证**：规范导航另列 Prompts／Resources／Roots／Sampling／Elicitation 等 server 能力（https://modelcontextprotocol.io/specification/2026-07-28/server/prompts），本轮未取回其正文，故「Prompts 能否作为可保存、可复用的固化动作」未验证，不推断。
- 五要件对照：①否；②是（server 侧）；③是（server 侧）；④否（终端用户不可）；⑤是（可反复 `tools/call`，但非按钮）。

## 综合判断表

| 官方形态 | ①一句话入口 | ②带名字 | ③带参数 | ④可保存 | ⑤下次一键复用 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 腾讯文档 MCP / Skill | 否（每次临时下指令） | 否 | 否 | 否 | 否（预置能力「一键」） | 不能（https://docs.qq.com/open/document/mcp/skill/） |
| 飞书 aily 字段捷径 | 否（须先编排工作流） | 是 | 是 | 是 | 部分（字段自动触发） | 部分能（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp） |
| Excel LAMBDA | 否（公式语法） | 是 | 是 | 是 | 是（像原生函数调用） | 部分能（https://support.microsoft.com/en-us/excel/functions/lambda-function） |
| Excel COPILOT 函数 | 部分（prompt 作参数） | 否（名字固定） | 是 | 否 | 否（2026-09-14 下线） | 不能（https://support.microsoft.com/en-us/excel/functions/copilot-function） |
| Office Scripts | 否（录制／写代码） | 是 | 未验证 | 是 | 是（script button） | 部分能（https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons） |
| Google Apps Script | 未验证 | 未验证 | 未验证 | 未验证 | 未验证 | 未验证（https://developers.google.com/apps-script/guides/sheets/functions） |
| MCP 协议层（Tools） | 否 | 是（server 侧） | 是（server 侧） | 否（终端用户不可） | 是（`tools/call`） | 不能（https://modelcontextprotocol.io/specification/2026-07-28/server/tools） |

## 对决策的影响

1. **明确回答票 #3 的 Question：部分能，但没有一个官方现成形态做到「用一句话生成一个带名字、带参数、可保存并在下次一键复用的动作」的全链条。** 在所有取回全文的一手来源里，「入口是任意自然语言」与「命名／保存／复用」是断开的：自然语言只出现在①每次临时指令（腾讯 MCP、Copilot in Excel 对话侧）或②参数层（`COPILOT` 的 prompt 参数、字段捷径的输入表单），而「带名字、带参数、可保存、可复用」的承载介质一律是公式、代码或预编排工作流。**最接近的形态**：概念上最贴近的是飞书 aily 字段捷径（名称＋参数＋发布持久化＋安装后随数据变更自动触发复用，https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）；机械上最贴近「可复用按钮」的是 Office Scripts 的 script button（官方明文「run these scripts with a single button」，https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons）；数据模型上最干净的「命名函数」原型是 Excel LAMBDA + Name Manager（https://support.microsoft.com/en-us/excel/functions/lambda-function）。
2. **首份笔记 §2.4（第 90 行）的「未验证」可以收口为「不能」。** 腾讯文档官方 Skill 概述页只有预置能力罗列与一份配置说明链接，没有工具清单、没有可复用函数／按钮注册机制（https://docs.qq.com/open/document/mcp/skill/）；其配置说明页一手正文取不到（空 body），故「配置层是否隐藏固化入口」仍单独标未验证（https://docs.qq.com/aio/p/scg9of08ycfdc59?p=SIBSMoo4XuO9dymUo2GEDBm），但不影响「官方公开文档层面不支持」的判定。腾讯 MCP 侧只有 QQ／微信登录、超级会员特权与 2000／20000／40000 次每天的频率控制，与固化无关（https://docs.qq.com/open/document/mcp/）。附带一条反证：连 Excel 官方「prompt 进单元格」的 `COPILOT` 都是内置函数、非用户命名，且已于 2026-09-14 停用，重算返回 `#NAME?`（https://support.microsoft.com/en-us/excel/functions/copilot-function）。
3. **本项目的「动作配方」不能直接整体借用任何一家，但可拆借四个一手原语，且必须自己补官方都没给的那一环。** 可借：(a) LAMBDA 的「name + 参数列表 + Scope=Workbook + Comment 描述」命名／持久化模型；(b) 字段捷径的「上架信息（名称／图标／描述／使用说明）＋发布范围＋管理员审核＋改出入参需重发审核＋下架失效」发布生命周期与「输入表单／字段选择器」参数绑定（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp）；(c) Office Scripts 的「Associate with workbook + Add button to worksheet」一键复用（https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons）；(d) MCP 的「`name` + `inputSchema` + `tools/call` `arguments`」契约，它正好是「可命名、带参数、可反复调用」的协议级抽象（https://modelcontextprotocol.io/specification/2026-07-28/server/tools）。配方层要自己实现的，正是「自然语言解释 → 结构化配方（名字／参数／步骤）的编译与保存」，这一步在一手官方来源里没有任何现成实现。
4. **门槛必须在配方设计里前置，且与首份笔记「底座选本地、零云凭据」一致。** 走飞书形态：租户内可见需租户管理员审核（灰度中，一般 1-3 天）、每次运行 0.5 额度＋模型节点按次扣点、租户 10 QPS 超限排队、免费仅 400 额度／月／租户、工作流 API／SDK 调用在 AI 基础版与团队订阅为 ❌、不支持海外站点／企业内网／本地部署模型（https://aily.feishu.cn/hc/1u7kleqg_hp4exotp、https://aily.feishu.cn/hc/1u7kleqg_1cnvbb55）。走腾讯形态：QQ／微信登录＋会员特权＋2000／20000／40000 次每天（https://docs.qq.com/open/document/mcp/）。走 Office Scripts 形态：商业／教育 M365＋OneDrive for Business 共享链接＋5MB 请求／500 万单元格／1600 次每天／120 秒超时＋Power Automate 下 `fetch` 被禁（https://learn.microsoft.com/en-us/office/dev/scripts/testing/platform-limits）。这些都不是本地零云凭据方案能直接吃的。
5. **仍待定／未验证清单（不补二手，待能取回一手正文时再定）**：Google Apps Script 全部官方页 30 秒超时 → 整节未验证（https://developers.google.com/apps-script/guides/sheets/functions）；腾讯 Skill 配置说明页空 body → 工具清单与配置级固化未验证（https://docs.qq.com/aio/p/scg9of08ycfdc59?p=SIBSMoo4XuO9dymUo2GEDBm）；飞书多维表格工作流／AI 字段捷径两页只返回标题 → 自动化侧未验证（https://base.feishu.cn/helpcenter/ai8y3d44/0dvrw73c）；Office Scripts 按钮传参机制与独立计费、MCP Prompts 能否作固化动作，均为未验证（https://learn.microsoft.com/en-us/office/dev/scripts/develop/script-buttons、https://modelcontextprotocol.io/specification/2026-07-28/server/prompts）。
