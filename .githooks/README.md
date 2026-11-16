# 提交前自动检查（pre-commit guardrail）

`.githooks/pre-commit` 是版本化的提交前守卫：只要本次提交**包含 `workbench/` 下的改动**，就会在提交前自动跑

```
npm test && npm run acceptance && npm run acceptance:formula
```

任一失败即中止提交，避免把漏测/回归的改动 commit 进去（retro §1 的落地）。

## 首次 clone 后启用（`core.hooksPath` 是本地配置，不随仓库传播）

```bash
git config core.hooksPath .githooks
```

一次性设置即可；此后每个 commit 都会自动受保护。

## 跳过（仅限紧急，不建议）

```bash
git commit --no-verify
```

## 行为说明

- 只改 `docs/`、`README` 等非 `workbench/` 文件时自动跳过整套检查（不浪费时间）。
- 需要完整 runtime：Node >= 22 + bundled LibreOffice Kit（`acceptance:formula` 重算用）。
- hook 是 `sh` 脚本，Git Bash on Windows / macOS / Linux 均可跑。
