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

    // 预览产物必须是公式字符串（=开头），不是 JS 算出的数值
    const allFormula = preview.cells.length === 5 && preview.cells.every(c => typeof c.after === 'string' && c.after.startsWith('='));
    const formulaStrings = preview.cells.map(c => c.after);
    const recalcOut = {};

    if (allFormula) {
      writeFileSync(cellsJson, JSON.stringify(preview.cells), 'utf8');
      py('apply', mainXlsx, cellsJson);
      // 重算前：公式字符串应存活（data_only=False 读到的是 '=C2*D2' 本身）
      const beforeRecalc = JSON.parse(py('read-xlsx', mainXlsx));
      // 引擎执行后的内存表与写回后磁盘表的应发列应逐行一致（双源交叉验证，同 #9）
      const engineFormulas = {};
      applied.rows.forEach(r => { engineFormulas[r['姓名']] = r['应发']; });
      const fileFormulas = {};
      beforeRecalc.rows.forEach(r => { fileFormulas[r['姓名']] = r['应发']; });
      recalcOut.__engineMatchesFile = JSON.stringify(engineFormulas) === JSON.stringify(fileFormulas);
      // 调 bundled LibreOffice Kit 触发重算，写出新文件（保留原文件）
      recalc(mainXlsx, recalced);
      // 重算后：data_only=True 读回缓存值
      const afterRecalc = JSON.parse(py('read-values', recalced));
      afterRecalc.rows.forEach(r => { recalcOut[r['姓名']] = r['应发']; });
      recalcOut.__formulaSurvived = beforeRecalc.rows.every(r => typeof r['应发'] === 'string' && r['应发'].startsWith('='));
    }

    const expected = { '阿岚': 12800, '柏舟': 14080, '岑溪': 5760, '丁野': 8640, '尔芙': 6160 };
    const valuesMatch = Object.keys(expected).every(k => Number(recalcOut[k]) === expected[k]);

    return {
      ok: allFormula && valuesMatch && recalcOut.__formulaSurvived === true && recalcOut.__engineMatchesFile === true,
      allFormula,
      formulaStrings,
      previewSummary: preview.summary,
      draftParams: draft.params,          // 声明式命名参数（无可执行代码）
      columnsAfter: JSON.parse(py('read-xlsx', mainXlsx)).columns,
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
