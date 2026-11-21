'use strict';
// 汇总（sum，用户目标步骤 5「透视/汇总」之一）：
// 对某数值列在 scope 范围内做一个聚合（合计/平均/计数/最大/最小），产出一行「汇总」结果。
// 架构：这不是「逐格改值」，而是「追加一行汇总」——故 preview 产 preview.summaryRow 元数据
// （label/列名/值/聚合方式/参与行数），确认时经桥 append-summary 在表尾追加一行。
// 纪律：只扩主 seam lib/engine.js（KINDS + stepsFor + preview 分支）+ 桥 append-summary，不新开 seam。
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');

const DATA = {
  primaryKey: '姓名',
  columns: ['姓名', '部门', '工时', '时薪', '备注'],
  rows: [
    { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80, 备注: '' },
    { 姓名: '柏舟', 部门: '技术', 工时: 120, 时薪: 90, 备注: '' },
    { 姓名: '清和', 部门: '财务', 工时: 150, 时薪: 75, 备注: '' }
  ]
};
function fresh() { return E.initial(JSON.parse(JSON.stringify(DATA))); }

test('sum：KINDS 声明存在，paramSpec（目标列 mustExist + 聚合方式枚举）', function () {
  assert.ok(E.KINDS.sum, '应声明 sum 汇总动作');
  const spec = E.KINDS.sum.paramSpec;
  assert.ok(spec.find(function (d) { return d.key === '目标列' && d.约束 && d.约束.mustExist; }));
  const agg = spec.find(function (d) { return d.key === '聚合方式'; });
  assert.deepEqual(agg.约束.enum.slice().sort(), ['max', 'min', 'sum', 'avg', 'count'].sort());
});

test('sum 合计：工时合计 = 430，产 summaryRow（不改任何单元格）', function () {
  const st = fresh();
  const pv = E.preview(st, E.buildDraft('sum', null, { 目标列: '工时', 聚合方式: 'sum' }));
  assert.equal(pv.invalid, false);
  assert.equal(pv.cells.length, 0, '汇总不产逐格变化');
  assert.ok(pv.summaryRow, '应有 summaryRow 元数据');
  assert.equal(pv.summaryRow.column, '工时');
  assert.equal(pv.summaryRow.agg, 'sum');
  assert.equal(pv.summaryRow.value, 430);
  assert.equal(pv.summaryRow.count, 3);
});

test('sum 平均/最大/最小/计数', function () {
  const st = fresh();
  assert.equal(E.preview(st, E.buildDraft('sum', null, { 目标列: '工时', 聚合方式: 'avg' })).summaryRow.value, 143.3333333333);
  assert.equal(E.preview(st, E.buildDraft('sum', null, { 目标列: '工时', 聚合方式: 'max' })).summaryRow.value, 160);
  assert.equal(E.preview(st, E.buildDraft('sum', null, { 目标列: '工时', 聚合方式: 'min' })).summaryRow.value, 120);
  assert.equal(E.preview(st, E.buildDraft('sum', null, { 目标列: '工时', 聚合方式: 'count' })).summaryRow.value, 3);
});

test('sum：scope=match 只统计命中行', function () {
  const st = fresh();
  const pv = E.preview(st, E.buildDraft('sum', null, { 目标列: '工时', 聚合方式: 'sum', scope: 'match', 条件: '工时 > 140' }));
  assert.equal(pv.summaryRow.count, 2, '命中 2 行（160/150）');
  assert.equal(pv.summaryRow.value, 310);
});

test('sum：目标列不存在 → 封闭校验拒绝', function () {
  const st = fresh();
  const pv = E.preview(st, E.buildDraft('sum', null, { 目标列: '不存在列', 聚合方式: 'sum' }));
  assert.equal(pv.invalid, true);
});

test('sum understand 关键词：工时合计 → sum', function () {
  const st = fresh();
  const after = E.reduce(st, { type: 'UNDERSTAND', text: '统计工时的合计' });
  assert.equal(after.draft && after.draft.kind, 'sum');
});

test('sum CONFIRM：结果记为独立「汇总」sheet 元数据，原数据行不变', function () {
  const st0 = fresh();
  const st1 = E.reduce(st0, { type: 'UNDERSTAND', text: '统计工时的合计' });
  const st2 = E.reduce(st1, { type: 'PREVIEW' });
  assert.equal(st2.stage, 'PREVIEWED');
  const st3 = E.reduce(st2, { type: 'CONFIRM' });
  assert.equal(st3.stage, 'EXECUTED');
  assert.equal(st3.rows.length, 3, '原数据行保持不变（3 行），汇总不追加进本表');
  assert.ok(st3.appendedSummarySheet, '应标记独立 sheet 元数据');
  assert.equal(st3.appendedSummarySheet.sheetName, '汇总');
  // 多列后统一为 rows 数组；单条时 rows[0] 即旧的 column/value/count。
  assert.ok(Array.isArray(st3.appendedSummarySheet.rows), 'appendedSummarySheet.rows 应为数组');
  assert.equal(st3.appendedSummarySheet.rows.length, 1);
  assert.equal(st3.appendedSummarySheet.rows[0].value, 430);
  assert.equal(st3.appendedSummarySheet.rows[0].column, '工时');
  assert.ok(!st3.appendedSummary, '不应再有旧的同表追加标记');
});

test('sum 桥 write-summary-sheet 真写盘：新建独立「汇总」sheet、原数据表不动（纯 IO 闭环）', function () {
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  function hasPython() {
    const cands = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
    for (const b of cands) {
      const r = spawnSync(b, ['-c', 'import openpyxl'], { encoding: 'utf8' });
      if (!r.error && r.status === 0) return b;
    }
    return null;
  }
  const py = hasPython();
  if (!py) { test.skip; return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-sumsheet-'));
  const file = path.join(dir, 'data.xlsx');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const struct = path.join(dir, 's.json');
  fs.writeFileSync(struct, JSON.stringify({
    primaryKey: '姓名',
    columns: { 姓名: 'text', 部门: 'text', 工时: 'number' },
    rows: [ { 姓名: '阿岚', 部门: '销售', 工时: 160 }, { 姓名: '柏舟', 部门: '技术', 工时: 120 }, { 姓名: '清和', 部门: '财务', 工时: 150 } ]
  }), 'utf8');
  let r = spawnSync(py, [bridge, 'create', file, struct], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'create 应成功: ' + (r.stderr || ''));
  // 写独立汇总 sheet
  const sumFile = path.join(dir, 'sum.json');
  fs.writeFileSync(sumFile, JSON.stringify({ sheetName: '汇总', column: '工时', agg: 'sum', label: '合计', value: 430, count: 3 }), 'utf8');
  r = spawnSync(py, [bridge, 'write-summary-sheet', file, sumFile], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'write-summary-sheet 应成功: ' + (r.stderr || ''));
  // 读回原数据表（应仍 3 行、不被改）
  const rv = spawnSync(py, [bridge, 'read-values', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(rv.status, 0, 'read-values 应成功');
  const parsed = JSON.parse(rv.stdout);
  assert.equal(parsed.rows.length, 3, '原数据表应仍 3 行（汇总不改进本表）');
  assert.equal(parsed.rows[0]['工时'], 160);
  // 校验「汇总」sheet 存在且有聚合值 430
  const verify = spawnSync(py, ['-c',
    'import openpyxl,sys,json;wb=openpyxl.load_workbook(sys.argv[1]);' +
    'print(json.dumps({"sheets":wb.sheetnames,"val":wb["汇总"]["B2"].value}))', file],
    { encoding: 'utf8' });
  assert.equal(verify.status, 0, '校验脚本应成功: ' + (verify.stderr || ''));
  const info = JSON.parse(verify.stdout);
  assert.ok(info.sheets.indexOf('汇总') !== -1, '应存在「汇总」sheet');
  assert.equal(info.val, 430, '「汇总」sheet B2 应为聚合值 430');
});

// ============================================================================
// 多列 / 多聚合：一次统计多个「列+聚合」，写入「汇总」sheet 的不同区域（每项占一行）。
// ============================================================================
test('sum 多列汇总：规格串「工时:avg;时薪:max;姓名:count」→ summaryRows 3 项，顺序与值正确', function () {
  const st = fresh();
  const pv = E.preview(st, E.buildDraft('sum', null, { 多列汇总: '工时:avg;时薪:max;姓名:count' }));
  assert.equal(pv.invalid, false, '应可预览');
  assert.ok(Array.isArray(pv.summaryRows), '应有 summaryRows 数组');
  assert.equal(pv.summaryRows.length, 3);
  assert.deepEqual(pv.summaryRows.map(function (r) { return [r.column, r.agg, r.value]; }), [
    ['工时', 'avg', 143.3333333333],
    ['时薪', 'max', 90],
    ['姓名', 'count', 3]
  ]);
  assert.equal(pv.summaryRows[0].label, '平均');
  // 向后兼容：summaryRow 仍等于首条。
  assert.equal(pv.summaryRow.column, '工时');
  assert.equal(pv.summaryRow.agg, 'avg');
  // 不改任何原始单元格。
  assert.equal(pv.cells.length, 0);
});

test('sum 多列汇总：单个「目标列+聚合方式」= 1 条（向后兼容老调用）', function () {
  const st = fresh();
  const pv = E.preview(st, E.buildDraft('sum', null, { 目标列: '工时', 聚合方式: 'sum' }));
  assert.equal(pv.summaryRows.length, 1);
  assert.equal(pv.summaryRows[0].value, 430);
});

test('sum 多列汇总：某列不存在 → invalid 且指明列名', function () {
  const st = fresh();
  const pv = E.preview(st, E.buildDraft('sum', null, { 多列汇总: '工时:sum;不存在列:max' }));
  assert.equal(pv.invalid, true);
  assert.ok(/不存在列/.test(pv.summary), 'summary 应点名列不存在');
});

test('sum 多列汇总 CONFIRM：appendedSummarySheet.rows 携带全部项，原数据行不变', function () {
  let st = fresh();
  st = E.reduce(st, { type: 'QUICK', kind: 'sum', params: { 多列汇总: '工时:sum;时薪:avg' } });
  assert.equal(st.stage, 'PREVIEWED');
  st = E.reduce(st, { type: 'CONFIRM' });
  assert.equal(st.stage, 'EXECUTED');
  assert.ok(st.appendedSummarySheet, '应标记独立 sheet 元数据');
  assert.equal(st.appendedSummarySheet.sheetName, '汇总');
  assert.ok(Array.isArray(st.appendedSummarySheet.rows));
  assert.equal(st.appendedSummarySheet.rows.length, 2);
  assert.equal(st.appendedSummarySheet.rows[0].column, '工时');
  assert.equal(st.appendedSummarySheet.rows[0].value, 430);
  assert.equal(st.appendedSummarySheet.rows[1].column, '时薪');
  assert.equal(st.appendedSummarySheet.rows[1].value, Math.round(((80 + 90 + 75) / 3) * 1e10) / 1e10);
  assert.equal(st.rows.length, 3, '原数据表应仍 3 行');
});

test('sum 多列汇总桥真写盘：write-summary-sheet 收 {rows:[...]} → 「汇总」sheet 多行、原表不动', function () {
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const cands = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let py = null;
  for (const b of cands) {
    const r = spawnSync(b, ['-c', 'import openpyxl'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) { py = b; break; }
  }
  if (!py) { test.skip; return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-summulti-'));
  const file = path.join(dir, 'data.xlsx');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const struct = path.join(dir, 's.json');
  fs.writeFileSync(struct, JSON.stringify({
    primaryKey: '姓名',
    columns: { 姓名: 'text', 部门: 'text', 工时: 'number', 时薪: 'number' },
    rows: [ { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80 }, { 姓名: '柏舟', 部门: '技术', 工时: 120, 时薪: 90 }, { 姓名: '清和', 部门: '财务', 工时: 150, 时薪: 75 } ]
  }), 'utf8');
  let r = spawnSync(py, [bridge, 'create', file, struct], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'create: ' + (r.stderr || ''));
  const sumFile = path.join(dir, 'sum.json');
  fs.writeFileSync(sumFile, JSON.stringify({ sheetName: '汇总', rows: [
    { column: '工时', agg: 'sum', label: '合计', value: 430, count: 3 },
    { column: '时薪', agg: 'max', label: '最大', value: 90, count: 3 }
  ] }), 'utf8');
  r = spawnSync(py, [bridge, 'write-summary-sheet', file, sumFile], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'write-summary-sheet: ' + (r.stderr || ''));
  const rv = spawnSync(py, [bridge, 'read-values', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(rv.status, 0);
  assert.equal(JSON.parse(rv.stdout).rows.length, 3, '原数据表仍 3 行');
  const verify = spawnSync(py, ['-c',
    'import openpyxl,sys,json;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb["汇总"];' +
    'print(json.dumps({"b2":ws["B2"].value,"b3":ws["B3"].value,"b4":ws["B4"].value}))', file],
    { encoding: 'utf8' });
  assert.equal(verify.status, 0, verify.stderr || '');
  const info = JSON.parse(verify.stdout);
  assert.equal(info.b2, 430, '第一项合计=430');
  assert.equal(info.b3, 90, '第二项最大=90');
  assert.equal(info.b4, 3, '末行参与行数=3');
});

// ============================================================================
// 透视分组（group by）：按某列分组，每组一行、规格项作列，产一张透视表写入「汇总」sheet。
// ============================================================================
test('透视分组：分组列 paramSpec 声明（mustExist）', function () {
  const spec = E.KINDS.sum.paramSpec;
  const g = spec.find(function (d) { return d.key === '分组列'; });
  assert.ok(g, '应有「分组列」参数');
  assert.ok(g.约束 && g.约束.mustExist, '分组列应 mustExist');
});

test('透视分组 preview：按「部门」分组 → summaryPivot 每组一行、值为该组聚合', function () {
  const DATA2 = {
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时'],
    rows: [
      { 姓名: 'a', 部门: '销售', 工时: 100 },
      { 姓名: 'b', 部门: '销售', 工时: 60 },
      { 姓名: 'c', 部门: '技术', 工时: 80 },
      { 姓名: 'd', 部门: '财务', 工时: 50 }
    ]
  };
  const st = E.initial(DATA2);
  const pv = E.preview(st, E.buildDraft('sum', null, { 多列汇总: '工时:sum', 分组列: '部门' }));
  assert.equal(pv.invalid, false);
  assert.ok(pv.summaryPivot, '应产 summaryPivot');
  assert.equal(pv.summaryPivot.groupColumn, '部门');
  assert.equal(pv.summaryPivot.groupCount, 3, '销售/技术/财务 三组');
  assert.deepEqual(pv.summaryPivot.rows.map(function (r) { return r.group; }), ['销售', '技术', '财务'], '组顺序=首次出现顺序');
  // 销售组合计 = 160，技术 = 80，财务 = 50
  assert.deepEqual(pv.summaryPivot.rows.map(function (r) { return r.cells[0].value; }), [160, 80, 50]);
  assert.equal(pv.cells.length, 0, '透视不产逐格变化');
});

test('透视分组 preview：多规格 × 分组 → 每行多列值', function () {
  const DATA3 = {
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪'],
    rows: [
      { 姓名: 'a', 部门: '销售', 工时: 100, 时薪: 80 },
      { 姓名: 'b', 部门: '销售', 工时: 60, 时薪: 90 },
      { 姓名: 'c', 部门: '技术', 工时: 80, 时薪: 70 }
    ]
  };
  const st = E.initial(DATA3);
  const pv = E.preview(st, E.buildDraft('sum', null, { 多列汇总: '工时:sum;时薪:max', 分组列: '部门' }));
  assert.equal(pv.summaryPivot.headers.length, 2);
  const sales = pv.summaryPivot.rows.filter(function (r) { return r.group === '销售'; })[0];
  assert.equal(sales.cells[0].value, 160, '销售工时合计=160');
  assert.equal(sales.cells[1].value, 90, '销售时薪最大=90');
});

test('透视分组：分组列不存在 → invalid 点名列名', function () {
  const st = fresh();
  const pv = E.preview(st, E.buildDraft('sum', null, { 多列汇总: '工时:sum', 分组列: '不存在组' }));
  assert.equal(pv.invalid, true);
  assert.ok(/不存在组/.test(pv.summary), 'summary 应点明分组列不存在');
});

test('透视分组 CONFIRM：appendedSummarySheet.pivot 带 groupColumn/headers/rows，原数据行不变', function () {
  const DATA2 = {
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时'],
    rows: [
      { 姓名: 'a', 部门: '销售', 工时: 100 },
      { 姓名: 'b', 部门: '销售', 工时: 60 },
      { 姓名: 'c', 部门: '技术', 工时: 80 }
    ]
  };
  let st = E.initial(DATA2);
  st = E.reduce(st, { type: 'QUICK', kind: 'sum', params: { 多列汇总: '工时:sum', 分组列: '部门' } });
  assert.equal(st.stage, 'PREVIEWED');
  st = E.reduce(st, { type: 'CONFIRM' });
  assert.equal(st.stage, 'EXECUTED');
  assert.ok(st.appendedSummarySheet && st.appendedSummarySheet.pivot, '应带 pivot 落盘元数据');
  const pv = st.appendedSummarySheet.pivot;
  assert.equal(pv.groupColumn, '部门');
  assert.equal(pv.headers.length, 1);
  assert.deepEqual(pv.rows.map(function (r) { return r.group; }), ['销售', '技术']);
  assert.deepEqual(pv.rows[0].values, [160], '销售组值 160');
  assert.equal(st.rows.length, 3, '原数据表仍 3 行');
});

test('透视分组桥真写盘：write-summary-sheet 收 {pivot} → 「汇总」sheet 表头+分组行、原表不动', function () {
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const cands = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let py = null;
  for (const b of cands) {
    const r = spawnSync(b, ['-c', 'import openpyxl'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) { py = b; break; }
  }
  if (!py) { test.skip; return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pivot-'));
  const file = path.join(dir, 'data.xlsx');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const struct = path.join(dir, 's.json');
  fs.writeFileSync(struct, JSON.stringify({
    primaryKey: '姓名',
    columns: { 姓名: 'text', 部门: 'text', 工时: 'number' },
    rows: [ { 姓名: 'a', 部门: '销售', 工时: 100 }, { 姓名: 'b', 部门: '销售', 工时: 60 }, { 姓名: 'c', 部门: '技术', 工时: 80 } ]
  }), 'utf8');
  let r = spawnSync(py, [bridge, 'create', file, struct], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'create: ' + (r.stderr || ''));
  const pFile = path.join(dir, 'p.json');
  fs.writeFileSync(pFile, JSON.stringify({ sheetName: '汇总', pivot: {
    groupColumn: '部门', headers: ['工时·合计'],
    rows: [ { group: '销售', values: [160] }, { group: '技术', values: [80] } ]
  } }), 'utf8');
  r = spawnSync(py, [bridge, 'write-summary-sheet', file, pFile], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'write-summary-sheet(pivot): ' + (r.stderr || ''));
  const rv = spawnSync(py, [bridge, 'read-values', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(rv.status, 0);
  assert.equal(JSON.parse(rv.stdout).rows.length, 3, '原数据表仍 3 行');
  const verify = spawnSync(py, ['-c',
    'import openpyxl,sys,json;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb["汇总"];' +
    'print(json.dumps({"a1":ws["A1"].value,"b1":ws["B1"].value,"a2":ws["A2"].value,"b2":ws["B2"].value,"b3":ws["B3"].value}))', file],
    { encoding: 'utf8' });
  assert.equal(verify.status, 0, verify.stderr || '');
  const info = JSON.parse(verify.stdout);
  assert.equal(info.a1, '部门', 'A1 应为分组列表头');
  assert.equal(info.b1, '工时·合计', 'B1 应为规格列表头');
  assert.equal(info.a2, '销售');
  assert.equal(info.b2, 160, '销售组合计=160');
  assert.equal(info.b3, 80, '技术组合计=80');
});

// ============================================================================
// 多维透视（多级分组）：按多列分层分组（如 部门+月份），每组一行、表头为各级取值。
// ============================================================================
test('多维透视：多级分组 paramSpec 声明存在', function () {
  const spec = E.KINDS.sum.paramSpec;
  assert.ok(spec.find(function (d) { return d.key === '多级分组'; }), '应有「多级分组」参数');
});

test('多维透视 preview：按「部门;月份」两级分组 → 每组一行、groupParts 两级取值、聚合正确', function () {
  const DATA = {
    primaryKey: '单号',
    columns: ['单号', '部门', '月份', '工时'],
    rows: [
      { 单号: 'a', 部门: '销售', 月份: '1月', 工时: 100 },
      { 单号: 'b', 部门: '销售', 月份: '1月', 工时: 60 },
      { 单号: 'c', 部门: '销售', 月份: '2月', 工时: 40 },
      { 单号: 'd', 部门: '技术', 月份: '1月', 工时: 80 },
      { 单号: 'e', 部门: '技术', 月份: '2月', 工时: 70 }
    ]
  };
  const st = E.initial(DATA);
  const pv = E.preview(st, E.buildDraft('sum', null, { 多列汇总: '工时:sum', 多级分组: '部门;月份' }));
  assert.equal(pv.invalid, false);
  const pvp = pv.summaryPivot;
  assert.ok(pvp, '应产 summaryPivot');
  assert.deepEqual(pvp.groupColumns, ['部门', '月份']);
  assert.equal(pvp.groupCount, 4, '销售/1月、销售/2月、技术/1月、技术/2月 共 4 组');
  // 组顺序=首次出现顺序；groupParts 保留各层取值。
  assert.deepEqual(pvp.rows.map(function (r) { return r.groupParts; }), [
    ['销售', '1月'], ['销售', '2月'], ['技术', '1月'], ['技术', '2月']
  ]);
  assert.deepEqual(pvp.rows.map(function (r) { return r.cells[0].value; }), [160, 40, 80, 70]);
  assert.equal(pv.cells.length, 0);
});

test('多维透视：多级分组优先于单列「分组列」', function () {
  const DATA = {
    primaryKey: '单号', columns: ['单号', '部门', '月份', '工时'],
    rows: [
      { 单号: 'a', 部门: '销售', 月份: '1月', 工时: 100 },
      { 单号: 'b', 部门: '销售', 月份: '2月', 工时: 40 }
    ]
  };
  const st = E.initial(DATA);
  const pv = E.preview(st, E.buildDraft('sum', null, { 多列汇总: '工时:sum', 分组列: '部门', 多级分组: '部门;月份' }));
  assert.deepEqual(pv.summaryPivot.groupColumns, ['部门', '月份'], '应按两级分组');
  assert.equal(pv.summaryPivot.groupCount, 2);
});

test('多维透视：某级分组列不存在 → invalid 点名列名', function () {
  const st = fresh();
  const pv = E.preview(st, E.buildDraft('sum', null, { 多列汇总: '工时:sum', 多级分组: '部门;不存在月份' }));
  assert.equal(pv.invalid, true);
  assert.ok(/不存在月份/.test(pv.summary));
});

test('多维透视 CONFIRM：pivot 带 groupColumns/groupParts，原数据行不变', function () {
  const DATA = {
    primaryKey: '单号', columns: ['单号', '部门', '月份', '工时'],
    rows: [
      { 单号: 'a', 部门: '销售', 月份: '1月', 工时: 100 },
      { 单号: 'b', 部门: '销售', 月份: '2月', 工时: 40 },
      { 单号: 'c', 部门: '技术', 月份: '1月', 工时: 80 }
    ]
  };
  let st = E.initial(DATA);
  st = E.reduce(st, { type: 'QUICK', kind: 'sum', params: { 多列汇总: '工时:sum', 多级分组: '部门;月份' } });
  st = E.reduce(st, { type: 'CONFIRM' });
  assert.equal(st.stage, 'EXECUTED');
  const pv = st.appendedSummarySheet.pivot;
  assert.deepEqual(pv.groupColumns, ['部门', '月份']);
  assert.deepEqual(pv.rows.map(function (r) { return r.groupParts; }), [['销售', '1月'], ['销售', '2月'], ['技术', '1月']]);
  assert.deepEqual(pv.rows.map(function (r) { return r.values[0]; }), [100, 40, 80]);
  assert.equal(st.rows.length, 3, '原数据表不动');
});

test('多维透视桥真写盘：{pivot:{groupColumns,rows:[{groupParts,values}]}} → 表头两级 + 每组一行', function () {
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const cands = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let py = null;
  for (const b of cands) {
    const r = spawnSync(b, ['-c', 'import openpyxl'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) { py = b; break; }
  }
  if (!py) { test.skip; return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-multipivot-'));
  const file = path.join(dir, 'data.xlsx');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const struct = path.join(dir, 's.json');
  fs.writeFileSync(struct, JSON.stringify({
    primaryKey: '单号', columns: { 单号: 'text', 部门: 'text', 月份: 'text', 工时: 'number' },
    rows: [ { 单号: 'a', 部门: '销售', 月份: '1月', 工时: 100 }, { 单号: 'b', 部门: '销售', 月份: '2月', 工时: 40 }, { 单号: 'c', 部门: '技术', 月份: '1月', 工时: 80 } ]
  }), 'utf8');
  let r = spawnSync(py, [bridge, 'create', file, struct], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'create: ' + (r.stderr || ''));
  const pFile = path.join(dir, 'p.json');
  fs.writeFileSync(pFile, JSON.stringify({ sheetName: '汇总', pivot: {
    groupColumn: '部门;月份', groupColumns: ['部门', '月份'], headers: ['工时·合计'],
    rows: [
      { group: '销售 / 1月', groupParts: ['销售', '1月'], values: [100] },
      { group: '销售 / 2月', groupParts: ['销售', '2月'], values: [40] },
      { group: '技术 / 1月', groupParts: ['技术', '1月'], values: [80] }
    ]
  } }), 'utf8');
  r = spawnSync(py, [bridge, 'write-summary-sheet', file, pFile], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'write-summary-sheet(multipivot): ' + (r.stderr || ''));
  const verify = spawnSync(py, ['-c',
    'import openpyxl,sys,json;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb["汇总"];' +
    'rows=[[c.value for c in row] for row in ws.iter_rows(min_row=1,max_row=4,max_col=3)];' +
    'print(json.dumps({"rows":rows,"n":len(wb["汇总"]["A"])}))', file],
    { encoding: 'utf8' });
  assert.equal(verify.status, 0, verify.stderr || '');
  const info = JSON.parse(verify.stdout);
  assert.deepEqual(info.rows[0], ['部门', '月份', '工时·合计'], '两级表头 + 规格列');
  assert.deepEqual(info.rows[1], ['销售', '1月', 100]);
  assert.deepEqual(info.rows[2], ['销售', '2月', 40]);
  assert.deepEqual(info.rows[3], ['技术', '1月', 80]);
});
