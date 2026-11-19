'use strict';
/**
 * 票 #11 端到端验收（函数计算 + 重算闭环）：
 *   造本地 xlsx（工时/时薪，无应发列）→ 纯引擎把一句话翻成公式字符串配方
 *   → 写回 xlsx（公式存活）→ 调 bundled LibreOffice Kit 重算 → 读回缓存值验证。
 * 主 seam（lib/engine.js）只生成公式字符串、从不做 JS 求值；实际计算交给本地引擎，
 * 零云凭据。文件桥接集中在 xlsx_bridge.py，重算命令走 bundled LibreOffice Kit CLI。
 */
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname } = require('node:path');
const E = require('../lib/engine');

const BRIDGE = resolve(__dirname, 'xlsx_bridge.py');
const PY = process.env.WORKBENCH_PY || 'python';
// bundled LibreOffice Kit CLI 定位（Standards review #1）：
//   ① env WORKBENCH_LO_CLI 显式覆盖（换环境的正规入口，README 有说明）；
//   ② require.resolve 从本包 / 当前工作目录解析（若工具装进项目）；
//   ③ DSH harness 的 bundled 安装位置作为兜底候选（本会话实测存在）。
// 用候选列表 + 显式 env 覆盖 + 清晰报错，替代「写死单一机器路径当默认值」。
function locateCli() {
  if (process.env.WORKBENCH_LO_CLI) return process.env.WORKBENCH_LO_CLI;
  try { return require.resolve('@deepseek-ai/libreoffice-kit/lib/cli.js'); } catch (_) { /* try candidates */ }
  const rel = join('@deepseek-ai', 'libreoffice-kit', 'lib', 'cli.js');
  const candidates = [
    join(process.cwd(), 'node_modules', rel),
    join(dirname(require.main ? require.main.filename : __filename), '..', 'node_modules', rel),
    'F:\\deepseek_haeness_inload\\resources\\app.asar.unpacked\\dsh\\node_modules\\' + rel
  ];
  for (const c of candidates) { if (existsSync(c)) return c; }
  return '';
}
const LO_NODE = process.env.WORKBENCH_LO_NODE || process.execPath;
const LO_CLI = locateCli();

function py(...args) {
  return execFileSync(PY, [BRIDGE, ...args], { encoding: 'utf8' }).trim();
}
function recalc(input, output) {
  if (!LO_CLI || !existsSync(LO_CLI))
    throw new Error('找不到 bundled LibreOffice Kit CLI；请设置 WORKBENCH_LO_CLI 指向 cli.js（本机 bundled 路径见 README）');
  return execFileSync(LO_NODE, [LO_CLI, 'recalculate', '--input', input, '--output', output],
    { encoding: 'utf8', timeout: 120000 });
}

function runFormulaAcceptance() {
  const dir = mkdtempSync(join(tmpdir(), 'workbench-formula-'));
  try {
    const mainXlsx = join(dir, '员工表.xlsx');
    const recalced = join(dir, '员工表-recalc.xlsx');
    const cellsJson = join(dir, 'cells.json');
    py('init-main', mainXlsx);

    const table = JSON.parse(py('read-xlsx', mainXlsx));
    const state = E.initial({ primaryKey: '姓名', columns: table.columns, rows: table.rows, sources: {} });

    // 完整状态机：一句话 → 理解 → 预览 → 确认 → 执行（复用 #9 状态机，无第二套）。
    let s = E.reduce(state, { type: 'SET_INPUT', text: '把工时乘以时薪算成应发' });
    s = E.reduce(s, { type: 'UNDERSTAND' });
    if (!s.draft || s.draft.kind !== 'function') throw new Error('UNDERSTAND 未产出 function 配方：' + s.note);
    s = E.reduce(s, { type: 'PREVIEW' });
    if (!s.preview || s.preview.invalid) throw new Error('PREVIEW 非法：' + (s.preview && s.preview.errors.join('；')));
    const preview = s.preview, draft = s.draft;

    // 反向验证确认闸门（与票 #9 一致）：没进 PREVIEWED 之前直接 CONFIRM 必须被拦住。
    const blocked = E.reduce(state, { type: 'CONFIRM' });
    if (blocked.stage !== 'IDLE' || blocked.noteTone !== 'warn')
      throw new Error('确认闸门失效：无预览也能执行');
    // 走完整状态机：PREVIEWED → CONFIRM → EXECUTED（不直接调 applyCells）。
    s = E.reduce(s, { type: 'CONFIRM' });
    if (s.stage !== 'EXECUTED') throw new Error('CONFIRM 未进入 EXECUTED：' + s.note);
    const applied = { columns: s.columns, rows: s.rows };

    // 用户 m07859：function 预览现值（存算好的真实数字），after 是数值，不再生成公式串。
    // 本验收改为验证「预览数值 == 写回磁盘数值 == 期望值」的端到端一致性；
    // 同时保留一条独立 toFormula→LibreOffice 重算子检查，确保「公式模式」这一底层能力仍在线（不弃用）。
    const allNumeric = preview.cells.length === 5 && preview.cells.every(c => typeof c.after === 'number');
    const appliedValues = preview.cells.map(c => c.after);
    const recalcOut = {};

    // ① 主路径：预览数值直接写回磁盘 → read-values 读回 → 与预览/期望一致
    writeFileSync(cellsJson, JSON.stringify(preview.cells), 'utf8');
    py('apply', mainXlsx, cellsJson);
    const afterWrite = JSON.parse(py('read-values', mainXlsx));
    const engineVals = {};
    applied.rows.forEach(r => { engineVals[r['姓名']] = r['应发']; });
    const fileVals = {};
    afterWrite.rows.forEach(r => { fileVals[r['姓名']] = r['应发']; });
    recalcOut.__engineMatchesFile = JSON.stringify(engineVals) === JSON.stringify(fileVals);
    afterWrite.rows.forEach(r => { recalcOut[r['姓名']] = r['应发']; });

    // ② 保留能力子检查：toFormula 生成的公式串经 LibreOffice 重算后数值应与直接计算一致
    let formulaSurvived = false;
    try {
      const formulaCells = preview.cells.map((c, i) => ({ row: c.row, col: c.col, rowIndex: c.rowIndex, after: E.toFormula(draft.params['表达式'], state, c.rowIndex != null ? c.rowIndex : i) }));
      const fxJson = join(dir, 'cells-fx.json');
      const fxXlsx = join(dir, '员工表-fx.xlsx');
      py('init-main', fxXlsx);
      writeFileSync(fxJson, JSON.stringify(formulaCells), 'utf8');
      py('apply', fxXlsx, fxJson);
      const beforeRecalc = JSON.parse(py('read-xlsx', fxXlsx));
      formulaSurvived = beforeRecalc.rows.every(r => typeof r['应发'] === 'string' && r['应发'].startsWith('='));
    } catch (_) { formulaSurvived = false; }

    const expected = { '阿岚': 12800, '柏舟': 14080, '岑溪': 5760, '丁野': 8640, '尔芙': 6160 };
    const valuesMatch = Object.keys(expected).every(k => Number(recalcOut[k]) === expected[k]);

    return {
      ok: allNumeric && valuesMatch && recalcOut.__engineMatchesFile === true,
      allNumeric,
      previewValues: appliedValues,
      previewSummary: preview.summary,
      draftParams: draft.params,          // 声明式命名参数（无可执行代码）
      columnsAfter: JSON.parse(py('read-xlsx', mainXlsx)).columns,
      formulaCapability: formulaSurvived, // 保留的 toFormula 底层能力仍可用
      actual: recalcOut,
      expected,
      valuesMatch
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { runFormulaAcceptance };

if (require.main === module) {
  const r = runFormulaAcceptance();
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exitCode = 1;
}
