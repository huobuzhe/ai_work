'use strict';
/**
 * 票 #25（Slice 2 / S5）：能力位矩阵端到端验尸脚本。
 *
 * 用法：
 *   node scripts/capability-probe.js                 # 只打印矩阵（不真跑），输出 JSON
 *   node scripts/capability-probe.js --run-local     # 额外真跑本地 Excel 四格（写公式→重算→读回→比对）
 *   node scripts/capability-probe.js --run-cloud     # 额外持凭据真跑飞书/腾讯链路，记「持凭据实测佐证」（不翻 true）
 *   node scripts/capability-probe.js --write-matrix  # 把矩阵渲染成 Markdown 落盘到 ./capability-matrix.md
 *
 * 口径（严格遵循票 #25 AC 与共识 ⑲）：
 *   - 本地 Excel：本会话真跑「写 =C2*D2（工时×时薪）→ LibreOffice 重算 → 读回缓存值 → 与期望比较」，四格全过才记 true。
 *   - 飞书 / 腾讯：文档层 false（腾讯三格一手负面已验证），本会话不持凭据真跑，一律 false + 证据 + 失败步骤。
 *   - --run-cloud（票 #27）：调 feishu/tencent 的 --live 链路真跑（需本机环境变量凭据，绝不入库），
 *     把结果登记为四格的「持凭据实测佐证」，**绝不把公式位翻成 true**（云端链路纯数值写值、结构不支持公式）。
 *   - 绝不打印凭据；不带 --run-cloud 时本脚本对云平台零网络调用。
 */
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname } = require('node:path');
const M = require('../lib/capability-matrix');

const BRIDGE = resolve(__dirname, 'xlsx_bridge.py');
const PY = process.env.WORKBENCH_PY || 'python';

// —— 复用 acceptance-formula 的 CLI 定位策略 ——
function locateCli() {
  if (process.env.WORKBENCH_LO_CLI) return process.env.WORKBENCH_LO_CLI;
  try { return require.resolve('@deepseek-ai/libreoffice-kit/lib/cli.js'); } catch (_) { /* candidates */ }
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

function py(...args) { return execFileSync(PY, [BRIDGE, ...args], { encoding: 'utf8' }).trim(); }

function recalc(input, output) {
  if (!LO_CLI || !existsSync(LO_CLI))
    throw new Error('找不到 bundled LibreOffice Kit CLI；请设置 WORKBENCH_LO_CLI 指向 cli.js');
  return execFileSync(LO_NODE, [LO_CLI, 'recalculate', '--input', input, '--output', output],
    { encoding: 'utf8', timeout: 120000 });
}

// 本地 Excel 四格最小用例真跑：写公式 → 重算 → 读回计算值 → 与期望比较。
// 与 acceptance-formula.js 同一条真实路径（经过纯引擎状态机产出公式单元格，不手搓 cell 形状），
// 只是把判定点拆成四个能力位分别断言。
function runLocalProbe() {
  const dir = mkdtempSync(join(tmpdir(), 'workbench-capprobe-'));
  try {
    const mainXlsx = join(dir, 'probe.xlsx');
    const recalced = join(dir, 'probe-recalc.xlsx');
    const cellsJson = join(dir, 'cells.json');
    py('init-main', mainXlsx); // 5 员工 姓名/部门/工时/时薪/备注（无应发列）

    const E = require('../lib/engine');
    const table = JSON.parse(py('read-xlsx', mainXlsx));
    const state = E.initial({ primaryKey: '姓名', columns: table.columns, rows: table.rows, sources: {} });

    // 完整状态机：一句话 → 理解 → 预览 → 确认 → 执行（复用唯一引擎，无第二套）。
    let s = E.reduce(state, { type: 'SET_INPUT', text: '把工时乘以时薪算成应发' });
    s = E.reduce(s, { type: 'UNDERSTAND' });
    if (!s.draft || s.draft.kind !== 'function') throw new Error('UNDERSTAND 未产出 function 配方：' + s.note);
    s = E.reduce(s, { type: 'PREVIEW' });
    if (!s.preview || s.preview.invalid) throw new Error('PREVIEW 非法：' + (s.preview && s.preview.errors.join('；')));
    const preview = s.preview;
    s = E.reduce(s, { type: 'CONFIRM' });
    if (s.stage !== 'EXECUTED') throw new Error('CONFIRM 未进入 EXECUTED：' + s.note);

    // 公式单元格是 = 开头的公式字符串（不是 JS 算出的数值）——canWriteFormula 的判定点源头。
    const allFormula = preview.cells.length > 0 && preview.cells.every(function (c) {
      return typeof c.after === 'string' && c.after.charAt(0) === '=';
    });

    writeFileSync(cellsJson, JSON.stringify(preview.cells), 'utf8');
    py('apply', mainXlsx, cellsJson);
    // 重算前：读回仍是公式字符串本身（data_only=False），证明公式存活被写入。
    const before = JSON.parse(py('read-xlsx', mainXlsx));
    const formulaSurvived = allFormula && before.rows.every(function (r) {
      return typeof r['应发'] === 'string' && r['应发'].charAt(0) === '=';
    });
    // 触发重算（canRecalc 判定点）。
    recalc(mainXlsx, recalced);
    // 读回缓存计算值（canReadComputed 判定点）+ 与期望比较（canRecalc 判定点）。
    const after = JSON.parse(py('read-values', recalced));
    const expected = {};
    table.rows.forEach(function (r) { expected[r['姓名']] = Number(r['工时']) * Number(r['时薪']); });
    const valuesMatch = after.rows.every(function (r) { return Number(r['应发']) === expected[r['姓名']]; });
    const computedPresent = after.rows.every(function (r) { return r['应发'] !== null && r['应发'] !== undefined; });
    // functionSet 判定点：不只乘法正确，还要求重算后的值是「公式产物」而非抄来的常量——
    // 用「重算前是公式字符串」与「重算后是数值」两态切换证明函数集（至少乘法）在这一平台上真被求值。
    const functionEvaluated = valuesMatch && formulaSurvived;

    return {
      canWriteFormula: formulaSurvived,      // 写入的公式在文件中存活
      canRecalc: valuesMatch,                // 重算后得到正确计算值
      canReadComputed: computedPresent,      // 能读回计算值
      functionSet: functionEvaluated,        // 乘法函数被真正求值（公式存活→重算得数值的完整切换）
      detail: {
        allFormula: allFormula,
        formulaStrings: preview.cells.map(function (c) { return c.after; }),
        formulaSurvived: formulaSurvived,
        valuesMatch: valuesMatch,
        computedPresent: computedPresent,
        functionEvaluated: functionEvaluated,
        expected: expected,
        actual: after.rows.reduce(function (o, r) { o[r['姓名']] = r['应发']; return o; }, {})
      }
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildReport(opts) {
  opts = opts || {};
  const matrix = M.getMatrix();
  const report = {
    generatedBy: 'workbench/scripts/capability-probe.js',
    minCase: M.MIN_CASE,
    bits: M.CAPABILITY_BITS,
    matrix: matrix,
    localRun: null,
    formulaCapabilities: {}
  };
  M.ADAPTER_IDS.forEach(function (id) {
    report.formulaCapabilities[id] = M.formulaCapabilitiesFromMatrix(id);
  });
  if (opts.runLocal) {
    // 只在真跑通过、且与声明一致时才允许 local 四格为 true：
    const run = runLocalProbe();
    report.localRun = run;
    const declared = M.formulaCapabilitiesFromMatrix('local');
    const mismatch = M.CAPABILITY_BITS.filter(function (b) { return run[b] !== declared[b]; });
    if (mismatch.length) {
      report.localRunMismatch = mismatch;
      // 真跑没过也如实降级：把 local 对应位改成 false（绝不因为声明 true 就假装通过）
      mismatch.forEach(function (b) { report.formulaCapabilities.local[b] = run[b]; });
    }
  }
  return report;
}

module.exports = { runLocalProbe, runCloudProbes, buildReport };

// —— 票 #27：持凭据真跑云端链路并把结果登记为矩阵「持凭据实测佐证」（不翻 true）——
// 需要本机环境变量凭据（FEISHU_APP_ID/SECRET、TENCENT_ACCESS_TOKEN/CLIENT_ID/OPEN_ID）；
// 缺凭据则**如实返回缺字段**、不伪造、不联网。绝不打印凭据值。
async function runCloudProbes(opts) {
  opts = opts || {};
  const results = {};
  const sampleTable = {
    primaryKey: '姓名', columns: ['姓名', '工时', '时薪'],
    types: { 姓名: 'text', 工时: 'number', 时薪: 'number' },
    rows: [{ 姓名: '阿岚', 工时: 8, 时薪: 100 }, { 姓名: '柏舟', 工时: 10, 时薪: 80 }]
  };
  const tablePath = opts.tablePath || null;
  const table = tablePath ? JSON.parse(readFileSync(tablePath, 'utf8')) : sampleTable;
  const allowUnverified = !!opts.allowUnverified;

  // 缺凭据/拒跑（结构上从未真跑）→ 不登记证据，避免把「没凭据」误标成「持凭据真跑失败」写入落盘产物。
  function isNotRun(r) {
    return !r || r.refused === true || (typeof r.error === 'string' && /缺本机凭据环境变量/.test(r.error));
  }

  // 飞书：调 scripts/feishu-adapter.js 的 runLive
  try {
    const F = require('./feishu-adapter');
    if (typeof F.runLive !== 'function') throw new Error('feishu-adapter 未导出 runLive');
    const r = await F.runLive(table, 'workbench-capability-probe', allowUnverified);
    if (isNotRun(r)) {
      results.feishu = { live: r, recorded: { recorded: false, reason: '未真跑（缺凭据或被拒跑），不登记持凭据实测佐证' } };
    } else {
      const rec = M.recordLiveEvidence('feishu', r, { ranAt: new Date().toISOString(), tableRows: (table.rows || []).length });
      results.feishu = { live: r, recorded: rec };
    }
  } catch (e) {
    results.feishu = { error: 'feishu 真跑异常：' + (e && e.message) };
  }

  // 腾讯：调 scripts/tencent-adapter.js 的 runLive
  try {
    const T = require('./tencent-adapter');
    if (typeof T.runLive !== 'function') throw new Error('tencent-adapter 未导出 runLive');
    const r = await T.runLive(table, 'workbench-capability-probe', allowUnverified);
    if (isNotRun(r)) {
      results.tencent = { live: r, recorded: { recorded: false, reason: '未真跑（缺凭据或被拒跑），不登记持凭据实测佐证' } };
    } else {
      const rec = M.recordLiveEvidence('tencent', r, { ranAt: new Date().toISOString(), tableRows: (table.rows || []).length });
      results.tencent = { live: r, recorded: rec };
    }
  } catch (e) {
    results.tencent = { error: 'tencent 真跑异常：' + (e && e.message) };
  }
  return results;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const runLocal = args.indexOf('--run-local') !== -1;
  const runCloud = args.indexOf('--run-cloud') !== -1;
  const writeMatrix = args.indexOf('--write-matrix') !== -1;
  const allowUnverified = args.indexOf('--allow-unverified-types') !== -1;
  const ti = args.indexOf('--table');
  const tablePath = ti !== -1 ? args[ti + 1] : null;
  (async function () {
    const report = buildReport({ runLocal: runLocal });
    if (runCloud) {
      report.cloudRun = await runCloudProbes({ tablePath: tablePath, allowUnverified: allowUnverified });
      // 云端真跑只加厚证据、不改 verdict：把更新后的矩阵重新取一次（含 evidenceLive）
      report.matrix = M.getMatrix();
    }
    if (writeMatrix) {
      const out = resolve(__dirname, '..', 'capability-matrix.md');
      writeFileSync(out, M.renderMarkdown({ capabilities: report.formulaCapabilities }), 'utf8');
      report.wroteMatrix = out;
    }
    console.log(JSON.stringify(report, null, 2));
    if (report.localRunMismatch && report.localRunMismatch.length) process.exitCode = 1;
  })().catch(function (e) { console.error('capability-probe 运行失败：', e && e.message); process.exitCode = 1; });
}
