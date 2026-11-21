# 安装到另一套 DSH（换机器 / 换 profile）

`dsh-workbench`（表格工作台）是一个 DSH **客户端插件包**。装进任何一套 DSH 宿主的步骤：

## 最快：一键安装脚本

不用手改配置，脚本会自动改 profile `package.json`、建 `node_modules` 软链、跑自检：

- **在线（有 git）**：
  ```bash
  git clone https://github.com/huobuzhe/ai_work.git && bash ai_work/workbench/scripts/install.sh
  ```
- **离线（没 git，用 Release 的 zip）**：从 [Releases](https://github.com/huobuzhe/ai_work/releases) 下载 `dsh-workbench-1.1.0.zip` 放到任意目录后：
  ```bash
  unzip -o dsh-workbench-1.1.0.zip && bash dsh-workbench/scripts/install.sh
  ```
  （Windows 无 `unzip` 就用资源管理器解压后跑 `bash dsh-workbench/scripts/install.sh`。）

默认装到 `~/.dsh/profiles/desktop`；换 profile：`DSH_PROFILE_DIR="$HOME/.dsh/profiles/我的profile" bash .../install.sh`。装完 **重启 DSH** 即可。

> 下面是**手动安装**的完整步骤；脚本跑不通时照做。

## 0. 先决条件

- 已安装 DSH（DeepSeek Harness）。
- **Python + openpyxl**（读写 xlsx 用）：`python -c "import openpyxl"` 能通过即可。没有就 `pip install openpyxl`。
- 可选：本地公式重算用 DSH 自带的 bundled LibreOffice Kit（`npm run acceptance:formula` 会用到；不装也能用非公式动作）。

## 1. 放好插件目录

把整个 `workbench/` 文件夹放到一个固定位置，例如：

```
F:\plugins\workbench        # Windows 示例
~/plugins/workbench         # macOS/Linux 示例
```

## 2. 挂进目标 profile 的 package.json

编辑你的 DSH profile 目录下的 `package.json`（profile 目录通常是 `~/.dsh/profiles/<你的profile名>/`，例如 `~/.dsh/profiles/desktop/`）：

1. 在 `dependencies` 里加一条 `link:` 依赖，指向你刚放的工作台目录：

   ```json
   "dependencies": {
     "dsh-workbench": "link:F:/plugins/workbench"
   }
   ```

   （macOS/Linux 用 `link:~/plugins/workbench` 的绝对路径。）

2. 在 `dsh.profile.bundles` 数组里加上 `"dsh-workbench"`：

   ```json
   "dsh": {
     "profile": {
       "bundles": [ "...已有...", "dsh-workbench" ]
     }
   }
   ```

## 3. 建立 node_modules 软链接（Windows 必做）

DSH 通过 `node_modules/dsh-workbench` 解析包。`link:` 依赖有时不会自动建，手动补一个 junction：

```bat
cd %USERPROFILE%\.dsh\profiles\desktop\node_modules
mklink /J dsh-workbench F:\plugins\workbench
```

macOS/Linux：

```bash
cd ~/.dsh/profiles/desktop/node_modules
ln -s ~/plugins/workbench dsh-workbench
```

## 4. 重启 DSH 宿主

关闭并重新打开 DSH（客户端插件 bundle 重启后重新加载）。

## 5. 验证

- 在 DSH 里打开任意 `.xlsx / .xls / .csv` 文件；
- 右下角应出现 **⚙ 悬浮按钮**；点开是「表格工作台 浮窗，标题栏显示当前文件名」；
- 看到原生表格 + 浮窗 = 装好了。

命令行自检（在 workbench 目录）：

```bash
npm run selfcheck     # 检查包结构 / 引擎 11+ 动作 / 关键文件是否齐
```

## 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 打开 xlsx 没有浮窗按钮 | ① 没重启宿主 ② `node_modules/dsh-workbench` 软链没建（重做第 3 步）③ `dsh.profile.bundles` 没加 dsh-workbench |
| 宿主启动崩溃 `invalid plugin ... received object` | 旧版本曾在 `lib/index.mjs` 同时用具名导出和 `export default`；v1.1.0 已修正（只具名导出 + `exports["."]={default:'./lib/index.mjs'}`）。确认装的是 v1.1.0 `lib/index.mjs` |
| 打开文件报「无法打开此表格」 | 那个 xlsx 本身是 0 字节/损坏（不是插件问题），换一个正常文件 |
| 公式列写出来是空白 | `function` 默认写**数值**；若选了「写入方式=公式」，值需要表格软件重算后才显示缓存值（面板/验收脚本会自动重算） |
| 点动作没反应/输入框报空 | 确认宿主已重启加载到最新 `client/client.js`（改源码后要 `npm run build:client`） |

## 卸载

删掉 `dependencies["dsh-workbench"]`、从 `dsh.profile.bundles` 移除 `"dsh-workbench"`、删 `node_modules/dsh-workbench` 软链，重启宿主即可。
