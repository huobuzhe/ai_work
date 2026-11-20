#!/usr/bin/env bash
# dsh-workbench 一键安装脚本
# 用法：
#   bash workbench/scripts/install.sh
#   DSH_PROFILE_DIR="$HOME/.dsh/profiles/我的profile" bash workbench/scripts/install.sh
#
# 做三件事：1) 在 profile package.json 加 link 依赖 + dsh.profile.bundles；
#           2) 在 profile node_modules 建 dsh-workbench 软链/junction；
#           3) 跑 selfcheck 自检。
set -euo pipefail

# --- 定位 workbench 目录（脚本所在目录的上一级） ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
echo "插件目录: $WB_DIR"

# --- 定位 DSH profile 目录 ---
PROFILE_DIR="${DSH_PROFILE_DIR:-$HOME/.dsh/profiles/desktop}"
if [ ! -f "$PROFILE_DIR/package.json" ]; then
  echo "✗ 找不到 profile: $PROFILE_DIR/package.json"
  echo "  用 DSH_PROFILE_DIR 指定你的 profile 目录，例如："
  echo "  DSH_PROFILE_DIR=\"\$HOME/.dsh/profiles/desktop\" bash $0"
  exit 1
fi
echo "目标 profile: $PROFILE_DIR"

# --- 检查 python + openpyxl（非致命，仅提示） ---
if command -v python >/dev/null 2>&1; then
  python -c "import openpyxl" 2>/dev/null || echo "⚠ python 缺 openpyxl：pip install openpyxl（不装则无法读写 xlsx）"
else
  echo "⚠ 未找到 python，请安装 Python3 + openpyxl 才能读写 xlsx"
fi

# --- 1) 改 profile package.json ---
PROFILE_DIR="$PROFILE_DIR" WB_DIR="$WB_DIR" node - <<'NODE'
const fs = require('fs');
const path = require('path');
const profileDir = process.env.PROFILE_DIR;
const wbDir = process.env.WB_DIR.replace(/\\/g, '/');
const pkgPath = path.join(profileDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies['dsh-workbench'] = 'link:' + wbDir;
pkg.dsh = pkg.dsh || {};
pkg.dsh.profile = pkg.dsh.profile || {};
pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [];
if (!pkg.dsh.profile.bundles.includes('dsh-workbench')) {
  pkg.dsh.profile.bundles.push('dsh-workbench');
}
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('✓ 已更新 profile package.json: dependencies.link + dsh.profile.bundles');
NODE

# --- 2) 建 node_modules 软链 / junction ---
NM_DIR="$PROFILE_DIR/node_modules"
mkdir -p "$NM_DIR"
LINK="$NM_DIR/dsh-workbench"
if [ -e "$LINK" ] || [ -L "$LINK" ]; then
  echo "… 已存在 $LINK，先移除重建"
  rm -rf "$LINK"
fi
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    # Windows：优先 cmd mklink /J，失败则 ln -s
    WB_WIN="$(cygpath -w "$WB_DIR" 2>/dev/null || echo "$WB_DIR")"
    LINK_WIN="$(cygpath -w "$LINK" 2>/dev/null || echo "$LINK")"
    cmd //c "mklink /J \"$LINK_WIN\" \"$WB_WIN\"" >/dev/null 2>&1 || ln -s "$WB_DIR" "$LINK"
    ;;
  *)
    ln -s "$WB_DIR" "$LINK"
    ;;
esac
echo "✓ 已建立 node_modules 软链: $LINK -> $WB_DIR"

# --- 3) selfcheck ---
echo "--- 自检 ---"
( cd "$WB_DIR" && node scripts/selfcheck.mjs ) || {
  echo "⚠ selfcheck 未通过，请按上面提示检查"
  exit 1
}

echo ""
echo "✅ 安装完成。请重启 DSH 宿主，然后打开任意 .xlsx/.xls/.csv，右下角出现 ⚙ 浮窗按钮即成功。"
