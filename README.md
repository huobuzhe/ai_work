# dsh-workbench · 表格工作台

![version](https://img.shields.io/badge/version-1.1.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![local--first](https://img.shields.io/badge/local--first-零凭据-green)

> 一个 **DSH 客户端插件**：在宿主里打开 Excel（`.xlsx / .xls / .csv`）时，原表原样显示、右下角多一个不遮挡的浮窗按钮；点开「表格工作台」，**一句话或一键动作 → 逐格预览 → 确认才写回**。本地运行、零云凭据、可预览可回滚。

## 这是什么

日常里总在重复同一类表格操作：建一张表、按固定格式填数、反复套同一批公式、按某些条件批量改数据……单看都不难，但一次次手动做既费时又容易出错。

本项目把这些反复出现的表格操作收进一个**不打扰原表的浮窗**里：选一个动作（或写一句话），它先用表格把「改前 → 改后」逐格摆给你看，你点「确认执行」，它才真正写回你的 Excel 文件。

- **本地优先、零凭据**：以本地 Excel 为主，打开就能用，不需要账号、不需要密钥、数据不必上传。
- **11 个一键动作 + 一句话理解**：`extract / swap / conditional / function / dedupe / replace / fill / trim / case / affix / sort`，另有 `highlight` 单元格标色。
- **可控性优先**：每一步都有逐格预览、封闭校验、确认落盘、可回滚；不静默替你改。

---

## 一、安装（其他人怎么装这个插件）

### 前置条件

- 已安装 **DSH（DeepSeek Harness）**，能找到它的 profile 目录（一般是 `~/.dsh/profiles/<profile名>/`，如 `~/.dsh/profiles/desktop/`）。
- **Python 3 + openpyxl**（读写 xlsx 用，先确认能 import）：
  ```bash
  python -c "import openpyxl; print('ok')"
  ```
  没有就装：`pip install openpyxl`。

### 方式 A：一条命令装（推荐，GitHub 已发布时）

在目标机器上，把仓库里 `workbench/` 直接用 git 取下来，再跑内置安装脚本——脚本会自动改 profile 的 `package.json`、建 `node_modules` 软链、并做自检：

```bash
git clone https://github.com/huobuzhe/ai_work.git && bash ai_work/workbench/scripts/install.sh
```

脚本默认装到 `~/.dsh/profiles/desktop`；要装到别的 profile：

```bash
DSH_PROFILE_DIR="$HOME/.dsh/profiles/我的profile" bash ai_work/workbench/scripts/install.sh
```

装完 **重启 DSH** 即可。验证：打开任意 `.xlsx/.xls/.csv`，右下角出现 ⚙ 浮窗按钮 → 装好了。

> **没有 git 的机器（离线 zip 版，一行装）**：从 Releases 下载 `dsh-workbench-1.1.0.zip`，放到任意目录后一行命令：
> ```bash
> unzip -o dsh-workbench-1.1.0.zip && bash dsh-workbench/scripts/install.sh
> ```
> （Windows 若无 `unzip`，用资源管理器解压后执行 `bash dsh-workbench/scripts/install.sh`；或走方式 B 手动安装。）

### 方式 B：手动安装（脚本跑不通时照做）

1. **放好目录**：把整个 `workbench/` 放到固定位置，例如 `F:\plugins\workbench`（Windows）或 `~/plugins/workbench`（macOS/Linux）。

2. **改目标 profile 的 `package.json`**（`~/.dsh/profiles/desktop/package.json`）：
   - `dependencies` 里加一条 link 依赖：
     ```json
     "dependencies": { "dsh-workbench": "link:F:/plugins/workbench" }
     ```
   - `dsh.profile.bundles` 数组里加 `"dsh-workbench"`：
     ```json
     "dsh": { "profile": { "bundles": [ "...已有...", "dsh-workbench" ] } }
     ```

3. **建 node_modules 软链**：
   - Windows（管理员 cmd）：
     ```bat
     cd %USERPROFILE%\.dsh\profiles\desktop\node_modules
     mklink /J dsh-workbench F:\plugins\workbench
     ```
   - macOS/Linux：
     ```bash
     cd ~/.dsh/profiles/desktop/node_modules && ln -s ~/plugins/workbench dsh-workbench
     ```

4. **重启 DSH 宿主**，打开表格验证浮窗出现。

更细的排障（没浮窗 / 启动崩溃 / 表格打不开 / 公式空白）与卸载，见 **[workbench/INSTALL.md](workbench/INSTALL.md)**。

---

## 二、使用（打开后怎么用）

### 界面长什么样

- 打开 `.xlsx / .xls / .csv` 后，**表格本身还是宿主原生可编辑网格**（不替换、不影响原来编辑）。
- **右下角有一个 ⚙ 浮窗按钮**（不遮挡表格）。点它 → 弹出「表格工作台」浮窗面板，标题栏显示**当前文件名**。
- 切换/打开别的表格时，浮窗会自动切到新文件、并回到初始默认态；再点 ⚙ 可收起。

### 四种用法（从简到手写）

1. **一键动作（最省事）**：浮窗里点一个动作芯片（如「调换两列」），在表单里用下拉选好字段（列名、方向、条件等），点「预览」。
2. **一句话理解**：在顶部输入框写一句话（如「对调工时和时薪两列」「条件 工时大于150 标记加班」「对调后按 工时 降序排」），点「理解」→「预览」。
3. **按钮库固化**：任何一次操作确认执行后，可「固化」成按钮；下次在按钮库一键重跑，或「重命名 / 改参数 / 删除」。
4. **新建表格**：浮窗底部可建空白表（自选主键列）、从模板建表、或上传现有表（按声明的列与主键校验后建）。

### 核心流程：预览 → 确认 → 落盘

任何动作都是这三步，**确认前绝不改你的文件**：

1. 选动作 / 写一句话后点 **「预览」**；
2. 浮窗里用**表格**把结果逐格摆出来：变动的格子**黄底高亮 + 显示 `原值 → 新值` 箭头**，摘要显示「影响 N 行 / 共 M 行」；若涉及大范围替换会给出强制披露；
3. 确认无误点 **「确认执行」** → 才真正写回 Excel（如引入新列会自动补列；需要重算的公式交本地 LibreOffice Kit 重算）。

### 11 个一键动作速查

| 动作 | 做什么 | 一句话例子 |
|---|---|---|
| 提取字段 extract | 从另一张表按主键把某列补进来 | 「从外勤登记表提取邮箱补到备注这一列」 |
| 调换两段字段 swap | 交换两列的值 | 「对调工时和时薪两列」 |
| 带条件增删 conditional | 满足条件才改指定列 | 「条件 工时大于150 备注标记加班」 |
| 自定义函数计算 function | 用列做四则运算写新列（可写数值或公式） | 「计算 工时乘以时薪 算成应发」 |
| 按主键去重 dedupe | 主键重复的只保留一条、清空其余重复行 | 「按姓名去重」 |
| 文本替换 replace | 子串替换 / 整列赋值 | 「部门里的『销售』替换成『市场』」 |
| 空值填充 fill | 只填空单元格 | 「备注空的填『待补』」 |
| 去首尾空格 trim | 清理文本首尾空白 | 「姓名去掉首尾空格」 |
| 英文大小写 case | 英文转大写/小写 | 「邮箱转小写」 |
| 加前后缀 affix | 统一加前缀/后缀 | 「工号前面加『EMP-』」 |
| 按列排序 sort | 按某列升/降序重排行（行内容不变） | 「按 工时 降序排」 |
| 单元格标色 highlight | 满足条件的单元格涂底色 | 「工时大于150 的标黄」 |

> 复杂运算（`+ - * /`、括号、优先级、一元负号）支持多操作数，如「工时乘以时薪加奖金 算成合计 = (工时*时薪)+奖金」。

### 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 打开 xlsx 没有浮窗按钮 | ① 没重启宿主 ② `node_modules/dsh-workbench` 软链没建 ③ `dsh.profile.bundles` 没加 dsh-workbench |
| 宿主启动崩溃 `invalid plugin` | 确认装的是 v1.1.0（`lib/index.mjs` 只具名导出，无 `export default`） |
| 「无法打开此表格」 | 那个 xlsx 本身是 0 字节/损坏，不是插件问题 |
| 公式列写出来空白 | function 默认写**数值**；选「写入方式=公式」时值需重算后才显示缓存值 |
| 点动作没反应 | 确认宿主已重启加载最新 `client/client.js` |

更多见 **[workbench/INSTALL.md](workbench/INSTALL.md)** 与 **[workbench/README.md](workbench/README.md)**（完整功能总览）、**[docs/usage-guide.md](docs/usage-guide.md)**（详尽手册）。

---

## 当前状态

本地 Excel 这条路径**已经可用**（v1.1.0）。面向云端表格（飞书、腾讯文档等）的能力仍在规划与验证，**尚未实测**——只有真正跑通、验证通过后才会作为可用能力介绍，达成前不会写成已支持。

## 我们的原则

- **能不编就不编**：能力没验证，就如实说没验证，不夸大。
- **不静默替你改**：不支持的操作用明确告诉你并停下，不悄悄改坏、不用「看起来成功」糊弄。
- **少即是多**：先把一条路径走扎实，再谈扩展。

## 许可证

[MIT](LICENSE) © 2026 huobuzhe

## 参与

开放演进中。有真实场景、想法或建议，欢迎开 Issue 一起聊。
