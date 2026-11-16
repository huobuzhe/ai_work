'use strict';
/**
 * 端到端验收编排（不是测试框架，是可复用的流程函数）：
 *   Python 造 xlsx/csv → node 用纯引擎跑一句话→配方→预览→确认→写回 → Python 写回并读回 → node 断言值。
 * 主 seam（lib/engine.js）不碰文件；本脚本把「文件 ↔ 声明式数据」的桥接集中在 xlsx_bridge.py。
 */
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const E = require('../lib/engine');

const BRIDGE = resolve(__dirname, 'xlsx_bridge.py');
const PY = process.env.WORKBENCH_PY || 'python';

function py(...args) {
  return execFileSync(PY, [BRIDGE, ...args], { encoding: 'utf8' }).trim();
}

function runAcceptance() {
  const dir = mkdtempSync(join(tmpdir(), 'workbench-e2e-'));
  try {
    const mainXlsx = join(dir, '员工表.xlsx');
    const sourceCsv = join(dir, '外勤登记表.csv');
    const cellsJson = join(dir, 'cells.json');

    py('init-main', mainXlsx);
    py('init-source', sourceCsv);

    const table = JSON.parse(py('read-xlsx', mainXlsx));
    const sourceRows = JSON.parse(py('read-csv', sourceCsv));

    const state = E.initial({
      primaryKey: '姓名',
      columns: table.columns,
      rows: table.rows,
      sources: { '外勤登记表.csv': { rows: sourceRows } }
    });

    // 走完整状态机（含「确认」闸门）：一句话 → 理解 → 预览 → 确认 → 执行 → 写值。
    // 不直接调 applyCells，确保 Acceptance #2 的「确认后写回」真的经过 CONFIRM 守卫。
    let s = E.reduce(state, { type: 'SET_INPUT', text: '从外勤登记表把邮箱提出来' });
    s = E.reduce(s, { type: 'UNDERSTAND' });
    if (!s.draft || s.draft.kind !== 'extract') throw new Error('UNDERSTAND 未产出 extract 配方：' + s.note);
    s = E.reduce(s, { type: 'PREVIEW' });
    if (!s.preview || s.preview.invalid) throw new Error('PREVIEW 非法：' + (s.preview && s.preview.errors.join('；')));
    const preview = s.preview;
    const draft = s.draft;

    // 反向验证确认闸门：未进 PREVIEWED 前直接 CONFIRM 必须被拦住。
    const blocked = E.reduce(state, { type: 'CONFIRM' });
    if (blocked.stage !== 'IDLE' || blocked.noteTone !== 'warn')
      throw new Error('确认闸门失效：无预览也能执行');

    s = E.reduce(s, { type: 'CONFIRM' });
    if (s.stage !== 'EXECUTED') throw new Error('CONFIRM 未进入 EXECUTED：' + s.note);
    const applied = { columns: s.columns, rows: s.rows };

    writeFileSync(cellsJson, JSON.stringify(preview.cells), 'utf8');
    py('apply', mainXlsx, cellsJson);
    const readBack = JSON.parse(py('read-xlsx', mainXlsx));

    const expected = {
      '阿岚': 'alan@example.com', '柏舟': 'baizhou@example.com',
      '岑溪': 'cenxi@example.com', '丁野': 'dingye@example.com', '尔芙': 'erfu@example.com'
    };
    const actual = {};
    readBack.rows.forEach(r => { actual[r['姓名']] = r['邮箱']; });
    // 引擎执行后的内存表与写回后的磁盘表，邮箱列应逐行一致（双源交叉验证）
    const engineEmails = {};
    applied.rows.forEach(r => { engineEmails[r['姓名']] = r['邮箱']; });
    const engineMatchesFile = JSON.stringify(engineEmails) === JSON.stringify(actual);

    return {
      ok: JSON.stringify(actual) === JSON.stringify(expected) && engineMatchesFile,
      engineMatchesFile,
      affectedRows: preview.affectedRows,
      totalRows: preview.totalRows,
      summary: preview.summary,
      columns: readBack.columns,
      actual, expected,
      draftKind: draft.kind,
      sourcesUsed: draft.params['来源文件']
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { runAcceptance };

if (require.main === module) {
  const r = runAcceptance();
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exitCode = 1;
}
