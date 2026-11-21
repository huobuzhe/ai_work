'use strict';
// ③ 回写单元格底色（🟡 便宜增量）——新增 highlight 动作：
//   给「目标列」里满足条件的行打底色（黄/红/绿/蓝）；不改值，只改单元格填充色。
// 引擎层 seam：preview.cells[].after 保留原值 + 带 highlight 颜色；写盘由 python 桥刷 PatternFill。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

const DATA = {
  primaryKey: '姓名',
  columns: ['姓名', '部门', '工时'],
  rows: [
    { 姓名: '阿岚', 部门: '技术', 工时: 160 },
    { 姓名: '柏舟', 部门: '技术', 工时: 120 },
    { 姓名: '清和', 部门: '财务', 工时: 150 }
  ],
  sources: {}
};
function fresh() { return E.initial(DATA); }

test('highlight paramSpec：目标列 + 条件 + 底色枚举', () => {
  const k = E.KINDS.highlight;
  assert.ok(k, 'KINDS 应含 highlight');
  const byKey = {}; k.paramSpec.forEach((x) => { byKey[x.key] = x; });
  assert.equal(byKey['目标列'].类型, '列名');
  assert.equal(byKey['目标列'].必填, true);
  assert.ok(byKey['条件'], '应含 条件');
  assert.equal(byKey['底色'].类型, '枚举');
  assert.deepEqual(byKey['底色'].约束.enum, ['yellow', 'red', 'green', 'blue']);
});

test('highlight 无条件=整列标底色：每行目标列都产一格、after 保留原值', () => {
  const s = E.reduce(fresh(), { type: 'QUICK', kind: 'highlight', params: { 目标列: '姓名', 底色: 'yellow' } });
  assert.equal(s.stage, 'PREVIEWED');
  const cells = s.preview.cells.filter((c) => c.col === '姓名');
  assert.equal(cells.length, 3, '整列 3 行都该高亮');
  // after 与原值一致（底色不改值）；带 highlight 颜色
  const byRow = {}; cells.forEach((c) => { byRow[c.row] = c; });
  assert.equal(byRow['阿岚'].after, '阿岚');
  assert.equal(byRow['阿岚'].highlight, 'yellow');
});

test('highlight 带条件：只命中满足条件的行', () => {
  const s = E.reduce(fresh(), { type: 'QUICK', kind: 'highlight', params: { 目标列: '工时', 条件: '工时 > 150', 底色: 'red' } });
  assert.equal(s.stage, 'PREVIEWED');
  const hitRows = s.preview.cells.filter((c) => c.col === '工时').map((c) => c.row).sort();
  assert.deepEqual(hitRows, ['阿岚'], '工时>150 只有 阿岚(160)；柏舟120、清和150 均不>150');
});

test('highlight 零命中（条件没打中）时 affectedRows=0 且允许确认', () => {
  const s = E.reduce(fresh(), { type: 'QUICK', kind: 'highlight', params: { 目标列: '工时', 条件: '工时 > 999', 底色: 'green' } });
  assert.equal(s.stage, 'PREVIEWED');
  assert.equal(s.preview.affectedRows, 0);
});

test('highlight 非法底色被封闭校验拦下', () => {
  const s = E.reduce(fresh(), { type: 'QUICK', kind: 'highlight', params: { 目标列: '姓名', 底色: '紫色' } });
  assert.equal(s.stage, 'IDLE');
});

// ---- 条件格式更细：多条件→多色规则组（按序首命中）----
test('highlight 规则组：多条件按序首命中，颜色分级', () => {
  const s = E.reduce(fresh(), { type: 'QUICK', kind: 'highlight', params: {
    目标列: '工时', 规则组: '工时 > 155:red;工时 > 140:yellow;工时 > 0:green'
  } });
  assert.equal(s.stage, 'PREVIEWED');
  const byRow = {}; s.preview.cells.filter((c) => c.col === '工时').forEach((c) => { byRow[c.row] = c.highlight; });
  assert.equal(byRow['阿岚'], 'red', '160>155 → red');
  assert.equal(byRow['清和'], 'yellow', '150 命中 140 档 → yellow');
  assert.equal(byRow['柏舟'], 'green', '120 只命中 0 档 → green');
});

test('highlight 规则组首命中优先：更宽的规则排在后面不覆盖更窄的', () => {
  const s = E.reduce(fresh(), { type: 'QUICK', kind: 'highlight', params: {
    目标列: '工时', 规则组: '工时 > 155:red;工时 > 0:green'
  } });
  const byRow = {}; s.preview.cells.filter((c) => c.col === '工时').forEach((c) => { byRow[c.row] = c.highlight; });
  assert.equal(byRow['阿岚'], 'red', '160 先命中 >155 red，不被绿色覆盖');
  assert.equal(byRow['柏舟'], 'green');
});

test('highlight 规则组：非法颜色的那条被跳过，其余规则仍生效', () => {
  const s = E.reduce(fresh(), { type: 'QUICK', kind: 'highlight', params: {
    目标列: '工时', 规则组: '工时 > 155:紫色;工时 > 0:green'
  } });
  assert.equal(s.stage, 'PREVIEWED');
  const byRow = {}; s.preview.cells.filter((c) => c.col === '工时').forEach((c) => { byRow[c.row] = c.highlight; });
  assert.equal(byRow['阿岚'], 'green', '非法色规则被跳过，落到 green');
});

test('highlight 规则组为空 → 回落单条「条件/底色」行为（向后兼容）', () => {
  const s = E.reduce(fresh(), { type: 'QUICK', kind: 'highlight', params: {
    目标列: '工时', 条件: '工时 > 150', 底色: 'red', 规则组: ''
  } });
  const hitRows = s.preview.cells.filter((c) => c.col === '工时').map((c) => c.row).sort();
  assert.deepEqual(hitRows, ['阿岚']);
});

// ---- 端到端：真实 python 桥 —— highlight 确认后磁盘单元格真被刷上底色、值不变 ----
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
function pyBin() { return process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']; }
function hasPython() {
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

test('highlight 端到端：确认后磁盘单元格刷上底色、值不变', { skip: !hasPython() }, function () {
  const { makeActionHandler, defaultReadTable, defaultApplyTable } = require('../lib/panel-bridge');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-hl-'));
  const file = path.join(dir, 'hl.xlsx');
  const structure = {
    primaryKey: '姓名',
    columns: { 姓名: 'text', 工时: 'number' },
    name: 'hl',
    rows: [
      { 姓名: '阿岚', 工时: 160 },
      { 姓名: '柏舟', 工时: 120 },
      { 姓名: '清和', 工时: 150 }
    ]
  };
  const sj = path.join(dir, 's.json');
  fs.writeFileSync(sj, JSON.stringify(structure), 'utf8');
  pyCall(['create', file, sj]);

  const store = require('../lib/panel-session').createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] });
  const handler = makeActionHandler({ readTable: defaultReadTable, applyTable: defaultApplyTable, store: store });
  const act = (action) => handler({ method: 'POST', url: '/workbench-api/action',
    body: JSON.stringify({ file: file, sessionId: 's1', action: action }) }).body;

  const p1 = act({ type: 'QUICK', kind: 'highlight', params: { 目标列: '工时', 条件: '工时 > 150', 底色: 'yellow' } });
  assert.equal(p1.stage, 'PREVIEWED');
  const p2 = act({ type: 'CONFIRM' });
  assert.equal(p2.stage, 'EXECUTED');
  assert.ok(p2.writtenOk);
  // 回读磁盘：数据没问题且「工时」列阿岚(第2行)有黄色填充 FfEB9C、值仍是 160
  const dump = JSON.parse(pyCall(['read-xlsx', file]));
  assert.equal(String(dump.rows[0]['工时']), '160', '值应不变');
  const fillByRef = {}; (dump.fills || []).forEach((f) => { fillByRef[f.ref] = f.rgb; });
  assert.equal(fillByRef['B2'], 'FFEB9C', '阿岚工时格(B2)应刷黄底');
  assert.equal(fillByRef['B3'], undefined, '柏舟(B3)不在条件内，不应有填充');
  assert.equal(fillByRef['B4'], undefined, '清和(B4,150不>150)不应有填充');
});

