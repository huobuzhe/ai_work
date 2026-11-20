'use strict';
// 排序动作（docs/research/inputbox-vs-ai-sheets.md 标 🟡 的便宜增量之一，用户 m11247 要求先做）：
// 按某列升序/降序重排整表行顺序；行内容不变、只改先后顺序。
// 结构性动作：不产「单元格变化」（cells 为空），产 preview.sortOrder（新行序下标数组）；
// 确认后由 applyCells 依 sortOrder 重排 rows，并经 applySort 写回物理行序。
// 纪律：只扩展主 seam lib/engine.js（KINDS + stepsFor + preview 分支 + applyCells），不新开 seam。
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

test('sort：KINDS 声明存在且 paramSpec 类型正确（排序列 mustExist + 方向枚举 asc/desc）', function () {
  assert.ok(E.KINDS.sort, '应声明 sort 动作');
  assert.equal(E.KINDS.sort.short, '按列排序');
  const spec = E.KINDS.sort.paramSpec;
  assert.ok(spec.find(function (d) { return d.key === '排序列' && d.约束 && d.约束.mustExist; }), 'sort 排序列应 mustExist');
  const dir = spec.find(function (d) { return d.key === '方向'; });
  assert.ok(dir, 'sort 应有 方向');
  assert.deepEqual(dir.约束.enum.slice().sort(), ['asc', 'desc']);
});

test('sort：按工时升序 —— 产 sortOrder（120,150,160 对应的新序），无 cell 变化', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'sort', params: { 排序列: '工时', 方向: 'asc' } });
  assert.equal(st.stage, 'PREVIEWED');
  assert.ok(Array.isArray(st.preview.sortOrder), '应产出 sortOrder 数组');
  // 原序 0(阿岚160) 1(柏舟120) 2(清和150) → 升序应为 柏舟(1),清和(2),阿岚(0)
  assert.deepEqual(st.preview.sortOrder, [1, 2, 0]);
  assert.equal(st.preview.cells.length, 0, '排序不改单元格，cells 应为空');
});

test('sort：按工时降序 —— sortOrder 反序', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'sort', params: { 排序列: '工时', 方向: 'desc' } });
  assert.deepEqual(st.preview.sortOrder, [0, 2, 1]);
});

test('sort：确认后 applyCells 依 sortOrder 重排 rows（行内容不变，只改序）', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'sort', params: { 排序列: '工时', 方向: 'asc' } });
  const done = E.reduce(st, { type: 'CONFIRM' });
  assert.equal(done.stage, 'EXECUTED');
  assert.deepEqual(done.rows.map(function (r) { return r.姓名; }), ['柏舟', '清和', '阿岚']);
  // 每行内容原样保留
  const bo = done.rows[0];
  assert.equal(bo.部门, '技术'); assert.equal(bo.工时, 120);
});

test('sort：排序列不存在时封闭校验拒绝，不进入可预览态', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'sort', params: { 排序列: '不存在的列', 方向: 'asc' } });
  assert.notEqual(st.stage, 'PREVIEWED', '未知排序列应被拒绝');
});

test('sort：字符串列按中文排序稳定可预期（同值保持原相对序）', function () {
  const D2 = {
    primaryKey: '姓名',
    columns: ['姓名', '部门'],
    rows: [
      { 姓名: '甲', 部门: 'b' },
      { 姓名: '乙', 部门: 'a' },
      { 姓名: '丙', 部门: 'b' }
    ]
  };
  const s = E.initial(D2);
  const st = E.reduce(s, { type: 'QUICK', kind: 'sort', params: { 排序列: '部门', 方向: 'asc' } });
  // a(乙) 在前，两个 b(甲,丙) 保持原相对序 → 新序 [1,0,2]
  assert.deepEqual(st.preview.sortOrder, [1, 0, 2]);
});

// 端到端：真实 python 桥 —— sort 确认后物理行序真被重排写盘。
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

function pyBin() { return process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']; }
function hasPython() {
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  for (const bin of pyBin()) {
    const r = spawnSync(bin, ['-c', 'import openpyxl'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}
function pyCall(args) {
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  let lastErr = null;
  for (const bin of pyBin()) {
    const r = spawnSync(bin, [bridge].concat(args), { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { lastErr = r.error; continue; }
    if (r.status !== 0) { lastErr = new Error(r.stderr); continue; }
    return (r.stdout || '').trim();
  }
  throw lastErr || new Error('py 调用失败');
}

test('sort：understand 关键词「按工时排序」识别成 sort', function () {
  const got = E.understand('按工时升序排一下');
  assert.equal(got.kind, 'sort', '含「排序/升序」应识别为 sort');
  const got2 = E.understand('按部门排序');
  assert.equal(got2.kind, 'sort');
});

test('sort 端到端：确认后 python 桥把物理行序重排写盘、行内容不变', { skip: !hasPython() }, function () {
  const { makeActionHandler, defaultReadTable, defaultApplyTable } = require('../lib/panel-bridge');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-sort-'));
  const file = path.join(dir, 'sort.xlsx');
  const structure = {
    primaryKey: '姓名',
    columns: { 姓名: 'text', 部门: 'text', 工时: 'number' },
    name: 'sort',
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160 },
      { 姓名: '柏舟', 部门: '技术', 工时: 120 },
      { 姓名: '清和', 部门: '财务', 工时: 150 }
    ]
  };
  const sj = path.join(dir, 's.json');
  fs.writeFileSync(sj, JSON.stringify(structure), 'utf8');
  pyCall(['create', file, sj]);

  const store = require('../lib/panel-session').createSessionStore
    ? require('../lib/panel-session').createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] })
    : null;
  const handler = makeActionHandler({ readTable: defaultReadTable, applyTable: defaultApplyTable, store: store });
  const act = (action) => {
    const res = handler({ method: 'POST', url: '/workbench-api/action',
      body: JSON.stringify({ file: file, sessionId: 's1', action: action }) });
    return res.body;
  };
  const p1 = act({ type: 'QUICK', kind: 'sort', params: { 排序列: '工时', 方向: 'asc' } });
  assert.equal(p1.stage, 'PREVIEWED');
  const p2 = act({ type: 'CONFIRM' });
  assert.equal(p2.stage, 'EXECUTED');
  assert.ok(p2.writtenOk);
  // 回读磁盘：物理行序应为 柏舟(120) → 清和(150) → 阿岚(160)
  const rv = pyCall(['read-values', file]);
  const rows = JSON.parse(rv).rows || JSON.parse(rv);
  const names = rows.map(function (r) { return r.姓名; });
  assert.deepEqual(names, ['柏舟', '清和', '阿岚'], '磁盘物理行序应已按工时升序重排');
  // 行内容不变
  assert.equal(rows[0].部门, '技术'); assert.equal(String(rows[0].工时), '120');
  assert.equal(rows[2].姓名, '阿岚'); assert.equal(rows[2].部门, '销售');
});

// 面板层：sort 预览网格应展示「排序后的行序」（而非原顺序），让用户确认前就看到排序效果。
test('面板投影：sort 预览的表格网格按排序后顺序展示', function () {
  const C = require('../client/index.js');
  const E2 = require('../lib/engine');
  const s = E2.initial({
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时'],
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160 },
      { 姓名: '柏舟', 部门: '技术', 工时: 120 },
      { 姓名: '清和', 部门: '财务', 工时: 150 }
    ]
  });
  const st = E2.reduce(s, { type: 'QUICK', kind: 'sort', params: { 排序列: '工时', 方向: 'asc' } });
  // 与真实面板路径一致：toView 会把 rows/afterRows 注入 preview；这里手工按 sortOrder 组装同形，验证投影。
  const pv = st.preview;
  assert.ok(Array.isArray(pv.sortOrder) && pv.sortOrder.length === 3, 'preview.sortOrder 应存在');
  const rows = st.rows;
  const afterRows = pv.sortOrder.map(function (i) { return Object.assign({}, rows[i]); });
  const card = C.projectPreviewCard(Object.assign({}, st, { stage: 'PREVIEWED',
    preview: Object.assign({}, pv, { columns: st.columns, rows: rows, afterRows: afterRows }) }));
  const impact = card.sections.impact;
  assert.ok(Array.isArray(impact.afterRows), 'impact 应带 afterRows');
  assert.deepEqual(impact.afterRows.map(function (r) { return r.姓名; }), ['柏舟', '清和', '阿岚']);
});


