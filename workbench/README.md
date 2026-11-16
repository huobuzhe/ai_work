# dsh-workbench（表格工作台 · 第一刀）

规格 [`#8`](https://github.com/huobuzhe/ai_work/issues/8) / 实施票 [`#9`](https://github.com/huobuzhe/ai_work/issues/9) 的可交付插件包。

把建表与日常繁琐表格操作收进按钮与输入框。**本包只实现 Slice 1 的第一根 tracer bullet：本地 Excel 零凭据端到端最小闭环（提取字段 extract）**；swap / conditional / function、云端 adapter、NL 一步编译成函数等均属后续票，不在本包范围。

## 结构

- `lib/engine.js` — 纯「动作配方引擎」（主 seam）。输入声明式表格数据 + 一句话，输出封闭校验 / 影响预览 / 写值动作。不碰 UI、浏览器、xlsx 文件或插件注册。CommonJS。
- `client/index.js` — client 面板源码：经 `sidebarRightTabs.register`（`keepMounted:true`、`priority:'extension'`）+ `slots.register`（`sidebar.right.pane.tab`）把常驻右栏面板挂进宿主。
- `client/client.js` — 由 `scripts/build-client.mjs` 生成的浏览器 bundle（`window.__ModuleLoader__.load` 信封）。**勿手改**，改 `client/index.js` 后重跑 `npm run build:client`。
- `cordis.patch.yml` — bundle patch（`dsh.bundle.patch`），把插件插入 profile layer stack。
- `scripts/xlsx_bridge.py` — 本地 xlsx/csv 文件桥（仅读写文件，无业务逻辑）；需要 Python + openpyxl。
- `scripts/acceptance-run.js` — 端到端验收编排：造 xlsx → 引擎 extract → 写回 → 读回断言。
- `test/` — `node:test` 三套：纯引擎 10 例、面板注册契约 3 例、xlsx 端到端 1 例。

## 构建 / 验证

```bash
npm run build:client   # 重新生成 client/client.js
npm test               # 全测（14 例）
npm run acceptance     # 单独跑端到端验收，打印逐行读回结果
```

无第三方依赖：测试只用 Node 内置 `node:test` + `node:vm`；文件读写只用本机 Python + openpyxl。本仓无 TypeScript 编译器，全包为纯 JS，类型安全以 `node --check` 语法检查代替（无 tsc，不伪造 typecheck）。

## 边界（Slice 1 / 票 #9）

- 零云凭据：不涉及飞书 / 腾讯 / Microsoft Graph。
- 配方是声明式数据（kind + params），不含可执行代码。
- 不暴露「一键运行跳过确认」：必须先预览、用户确认后才写值。
- 不改 `apps/web` shell，不起独立 Vite 应用；表格视图的可编辑 grid 形态（研究未验证 #4）留待后续票，本面板 body 仅验证注册契约。
