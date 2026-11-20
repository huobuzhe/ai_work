# 更新日志（CHANGELOG）

本文件记录 `dsh-workbench`（表格工作台）的版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

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
- `dedupe` 只清空重复行、不物理删行；`function` 仅两操作数四则；无排序/透视/图表/翻译/分类等（见 `docs/research/inputbox-vs-ai-sheets.md` 对标）。
- 云端适配（飞书/腾讯）能力位保守记录、未全验证。

[1.0.0]: https://github.com/huobuzhe/ai_work/tree/master/workbench
