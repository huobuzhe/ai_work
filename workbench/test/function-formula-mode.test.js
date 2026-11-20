'use strict';
// ② 写公式而非值（🟡 便宜增量）——function 动作新增「写入方式」参数：
//   数值（默认，算好真实数字，与历史行为一致）/ 公式（写 A1 公式串，交给 Excel/WPS 打开后重算）。
// 引擎层 seam：preview.cells[].after 在「公式」模式应为 '=C2*D2' 形态、在「数值」模式为数字。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

const DATA = {
  primaryKey: '姓名',
  columns: ['姓名', '部门', '工时', '时薪', '备注'],
  rows: [
    { 姓名: '阿岚', 部门: '技术', 工时: 160, 时薪: 80, 备注: '' },
    { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80, 备注: '' }
  ],
  sources: {}
};
function fresh() { return E.initial(DATA); }

test('function paramSpec 暴露「写入方式」枚举（默认 数值）', () => {
  const spec = E.KINDS.function.paramSpec;
  const f = spec.find((x) => x.key === '写入方式');
  assert.ok(f, 'paramSpec 应含 写入方式');
  assert.equal(f.类型, '枚举');
  assert.deepEqual(f.约束.enum, ['数值', '公式']);
  assert.equal(f.默认值, '数值');
});

test('默认（数值）模式：after 是真实数字，不是公式串', () => {
  const s = E.reduce(fresh(), {
    type: 'QUICK', kind: 'function',
    params: { 表达式: '工时 * 时薪', 输出列: '应发', 写入方式: '数值' }
  });
  assert.equal(s.stage, 'PREVIEWED');
  const c0 = s.preview.cells.find((c) => c.col === '应发' && c.rowIndex === 0);
  assert.equal(c0.after, 12800, '阿岚 160*80=12800 应写成数字');
  assert.equal(typeof c0.after, 'number');
});

test('公式模式：after 是 A1 公式串（=C2*D2），交 Excel 重算', () => {
  const s = E.reduce(fresh(), {
    type: 'QUICK', kind: 'function',
    params: { 表达式: '工时 * 时薪', 输出列: '应发', 写入方式: '公式' }
  });
  assert.equal(s.stage, 'PREVIEWED');
  const c0 = s.preview.cells.find((c) => c.col === '应发' && c.rowIndex === 0);
  assert.equal(c0.after, '=C2*D2', '阿岚行应写公式 =C2*D2');
  const c1 = s.preview.cells.find((c) => c.col === '应发' && c.rowIndex === 1);
  assert.equal(c1.after, '=C3*D3', '柏舟行应是 =C3*D3');
});

test('公式模式：summary 说明写的是公式（诚实告知，非算好的值）', () => {
  const s = E.reduce(fresh(), {
    type: 'QUICK', kind: 'function',
    params: { 表达式: '工时 * 时薪', 输出列: '应发', 写入方式: '公式' }
  });
  assert.match(String(s.preview.summary), /公式/);
});

test('写入方式 取值非法时被封闭校验拦下', () => {
  const s = E.reduce(fresh(), {
    type: 'QUICK', kind: 'function',
    params: { 表达式: '工时 * 时薪', 输出列: '应发', 写入方式: '瞎写' }
  });
  assert.equal(s.stage, 'IDLE');
  assert.ok(s.error || (s.note && /写入方式/.test(s.note)), '非法枚举应报错拦下');
});

// ---- 端到端：真实 python 桥 —— 公式模式确认后磁盘应存「公式串」而非数字 ----
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

test('公式模式端到端：确认后磁盘「应发」列存的是 A1 公式串', { skip: !hasPython() }, function () {
  const { makeActionHandler, defaultReadTable, defaultApplyTable } = require('../lib/panel-bridge');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-fml-'));
  const file = path.join(dir, 'fml.xlsx');
  const structure = {
    primaryKey: '姓名',
    columns: { 姓名: 'text', 工时: 'number', 时薪: 'number' },
    name: 'fml',
    rows: [
      { 姓名: '阿岚', 工时: 160, 时薪: 80 },
      { 姓名: '柏舟', 工时: 176, 时薪: 80 }
    ]
  };
  const sj = path.join(dir, 's.json');
  fs.writeFileSync(sj, JSON.stringify(structure), 'utf8');
  pyCall(['create', file, sj]);

  const store = require('../lib/panel-session').createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] });
  const handler = makeActionHandler({ readTable: defaultReadTable, applyTable: defaultApplyTable, store: store });
  const act = (action) => handler({ method: 'POST', url: '/workbench-api/action',
    body: JSON.stringify({ file: file, sessionId: 's1', action: action }) }).body;

  const p1 = act({ type: 'QUICK', kind: 'function', params: { 表达式: '工时 * 时薪', 输出列: '应发', 写入方式: '公式' } });
  assert.equal(p1.stage, 'PREVIEWED');
  const p2 = act({ type: 'CONFIRM' });
  assert.equal(p2.stage, 'EXECUTED');
  assert.ok(p2.writtenOk);
  // 读公式串（read-xlsx 走 data_only=False）：磁盘「应发」列应是 =B2*C2 / =B3*C3
  const formulas = JSON.parse(pyCall(['read-xlsx', file]));
  assert.ok(formulas.columns.indexOf('应发') >= 0, '磁盘应有「应发」列');
  assert.equal(String(formulas.rows[0]['应发']).replace(/\s/g, ''), '=B2*C2');
  assert.equal(String(formulas.rows[1]['应发']).replace(/\s/g, ''), '=B3*C3');
});

