'use strict';
// 票 #11 主 seam 测试（纯引擎，不碰 xlsx / LibreOffice）。
// 用户 m07859 决定：function 动作**存算好的真实数字**（预览/磁盘都显示数值，不再显示公式文本）。
// 因此 function 预览的 after 是数值（如 12800），不再是 '=C2*D2' 公式字符串；
// toFormula（生成 A1 公式串）保留为可用的底层能力（供将来「保留公式」模式），单测照测。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

const DATA = {
  primaryKey: '姓名',
  columns: ['姓名', '部门', '工时', '时薪', '备注'],
  rows: [
    { 姓名: '阿岚', 部门: '技术', 工时: 160, 时薪: 80, 备注: '' },
    { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80, 备注: '' },
    { 姓名: '岑溪', 部门: '运营', 工时: 96, 时薪: 60, 备注: '' },
    { 姓名: '丁野', 部门: '运营', 工时: 144, 时薪: 60, 备注: '' },
    { 姓名: '尔芙', 部门: '人事', 工时: 88, 时薪: 70, 备注: '' }
  ],
  sources: {}
};
function fresh() { return E.initial(DATA); }

test('一句话被解释成 function 声明式配方（命名参数，非可执行代码）', () => {
  const got = E.understand('把工时乘以时薪算成应发');
  assert.equal(got.kind, 'function');
  const draft = E.buildDraft('function', got.sentence);
  assert.equal(draft.schemaVersion, E.SCHEMA_VERSION);
  assert.equal(draft.kind, 'function');
  assert.ok(draft.params['表达式']);
  assert.equal(draft.params['输出列'], '应发'); // 从「算成应发」里抽出的命名参数
  assert.equal(draft.params['scope'], 'all');
  // 声明式：整个草稿可 JSON 序列化、不含函数（不含可执行代码）
  assert.doesNotThrow(() => JSON.stringify(draft));
  assert.ok(!JSON.stringify(draft).includes('function '));
});

test('toFormula：字段×字段 → A1 公式字符串（列从 columns 推、行从记录序推）', () => {
  assert.equal(E.toFormula('工时 * 时薪', fresh(), 0), '=C2*D2');
  assert.equal(E.toFormula('工时 * 时薪', fresh(), 3), '=C5*D5');
});

test('toFormula：字段×数字字面量 → A1 公式字符串', () => {
  assert.equal(E.toFormula('工时 * 2', fresh(), 1), '=C3*2');
});

test('toFormula：非法表达式 / 未知列名返回 null（不硬算值）', () => {
  assert.equal(E.toFormula('工时 >>> 时薪', fresh(), 0), null);
  assert.equal(E.toFormula('不存在的列 * 时薪', fresh(), 0), null);
  assert.equal(E.toFormula('', fresh(), 0), null);
});

test('function 预览：after 是算好的真实数值（不是公式字符串）', () => {
  const s = fresh();
  const draft = E.buildDraft('function', '把工时乘以时薪算成应发');
  const pv = E.preview(s, draft);
  assert.equal(pv.invalid, false);
  assert.equal(pv.cells.length, 5);
  assert.equal(pv.cells[0].col, '应发');
  assert.equal(pv.cells[0].after, 12800); // 160 × 80，数值不是 '=C2*D2'
  assert.equal(pv.cells[1].after, 14080); // 176 × 80
  assert.match(pv.summary, /影响 5 行 \/ 共 5 行/);
});

test('computeValue：数值求值（与 toFormula 同文法，但算实际值）', () => {
  assert.equal(E.computeValue('工时 * 时薪', fresh(), 0), 12800); // 160×80
  assert.equal(E.computeValue('工时 * 时薪', fresh(), 3), 8640);  // 144×60
  assert.equal(E.computeValue('工时 * 2', fresh(), 1), 352);      // 176×2
  assert.equal(E.computeValue('工时 >>> 时薪', fresh(), 0), null); // 非法文法
  assert.equal(E.computeValue('不存在的列 * 时薪', fresh(), 0), null); // 未知列
});

test('function + scope=match：只对命中记录算数值', () => {
  const s = fresh();
  const draft = E.buildDraft('function', null, {
    表达式: '工时 * 时薪', 输出列: '应发', scope: 'match', 条件: '工时 > 150'
  });
  const pv = E.preview(s, draft);
  assert.equal(pv.invalid, false);
  assert.equal(pv.cells.length, 2); // 阿岚 160、柏舟 176
  assert.equal(pv.cells[0].row, '阿岚');
  assert.equal(pv.cells[0].after, 12800);
  assert.equal(pv.cells[1].row, '柏舟');
  assert.equal(pv.cells[1].after, 14080);
});

test('function 非法表达式：validate 前就拒绝，预览标 invalid 且不产公式', () => {
  const s = fresh();
  const draft = E.buildDraft('function', null, { 表达式: '工时 >>> 时薪', 输出列: '应发' });
  const pv = E.preview(s, draft);
  assert.equal(pv.invalid, true);
  assert.equal(pv.cells.length, 0);
});

test('状态机：UNDERSTAND→PREVIEW→CONFIRM 产出写数值动作（复用 #9 状态机）', () => {
  let s = E.reduce(fresh(), { type: 'SET_INPUT', text: '把工时乘以时薪算成应发' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  assert.equal(s.draft.kind, 'function');
  s = E.reduce(s, { type: 'PREVIEW' });
  assert.equal(s.preview.cells[0].after, 12800);
  s = E.reduce(s, { type: 'CONFIRM' });
  assert.equal(s.stage, 'EXECUTED');
  assert.ok(s.columns.includes('应发'));
  assert.equal(s.rows[0]['应发'], 12800); // 内存态存的是算好的数值
});
