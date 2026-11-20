# dsh-workbench · 表格工作台

![version](https://img.shields.io/badge/version-1.1.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![local--first](https://img.shields.io/badge/local--first-零凭据-green)

> 一个 **DSH 客户端插件**：在宿主里打开 Excel（`.xlsx / .xls / .csv`）时，原表原样显示、右下角多一个不遮挡的浮窗按钮；点开「表格工作台」，**一句话或一键动作 → 逐格预览 → 确认才写回**。本地运行、零云凭据、可预览可回滚。

## 这是什么

日常里总在重复同一类表格操作：建一张表、按固定格式填数、反复套同一批公式、按某些条件批量改数据……单看都不难，但一次次手动做既费时又容易出错。

本项目把这些反复出现的表格操作收进一个**不打扰原表的浮窗**里：选一个动作（或写一句话），它先用表格把「改前 → 改后」逐格摆给你看，你点「确认执行」，它才真正写回你的 Excel 文件。

- **本地优先、零凭据**：以本地 Excel 为主，打开就能用，不需要账号、不需要密钥、数据不必上传。
- **11 个一键动作 + 一句话理解**：`extract / swap / conditional / function / dedupe / replace / fill / trim / case / affix / sort`，另有 `highlight` 单元格标色。
- **可控性优先**：每一步都有逐格预览、封闭校验、确认落盘、可回滚；不静默替你改。

## 文档

| 想知道 | 看这里 |
|---|---|
| **这个插件能做什么、每个按钮怎么用** | [workbench/README.md](workbench/README.md)（功能总览 + 界面 + 动作详解） |
| **装到另一套 DSH（换机器 / 换 profile）** | [workbench/INSTALL.md](workbench/INSTALL.md)（安装步骤 + 排障 + 卸载） |
| **详尽使用手册** | [docs/usage-guide.md](docs/usage-guide.md) |
| 版本变更 | [workbench/CHANGELOG.md](workbench/CHANGELOG.md) |

## 安装（一句话版）

把 `workbench/` 放好 → 目标 profile 的 `package.json` 加 `link:` 依赖 + 在 `dsh.profile.bundles` 加 `dsh-workbench` → Windows 建 `mklink /J node_modules\dsh-workbench` → 重启 DSH。完整步骤与常见问题见 **[workbench/INSTALL.md](workbench/INSTALL.md)**。

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
