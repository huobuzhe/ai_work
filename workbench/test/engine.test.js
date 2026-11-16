'use strict';
// 主 seam（规格 #8 Testing Decisions，已与使用者核对确认）：
// 纯「动作配方引擎」模块。输入声明式表格数据 + 一句话，断言校验结果 / 影响预览 / 写值动作。
// 不依赖 UI、浏览器、插件注册、xlsx 文件或 HMR 后存活的 React state。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

// ---- 声明式测试数据（不是 xlsx，不是 DOM）----
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
  sources: {
    '外勤登记表.csv': {
      rows: [
        { 姓名: '阿岚', 邮箱: 'alan@example.com' },
        { 姓名: '柏舟', 邮箱: 'baizhou@example.com' },
        { 姓名: '岑溪', 邮箱: 'cenxi@example.com' },
        { 姓名: '丁野', 邮箱: 'dingye@example.com' },
        { 姓名: '尔芙', 邮箱: 'erfu@example.com' }
      ]
    }
  }
};

function fresh() { return E.initial(DATA); }

test('schemaVersion 封闭校验：非法版本 / 缺字段 / 非法 kind 都被拒绝', () => {
  const s = fresh();
  assert.equal(s.schemaVersion, E.SCHEMA_VERSION);
  const good = E.buildDraft('extract', '从外勤登记表把邮箱提出来');
  assert.equal(E.validate(good, s).ok, true);

  const badVersion = Object.assign({}, good, { schemaVersion: 999 });
  assert.equal(E.validate(badVersion, s).ok, false);

  const badKind = Object.assign({}, good, { kind: 'deleteEverything' });
  assert.equal(E.validate(badKind, s).ok, false);

  const missingParam = E.buildDraft('extract', null, { 来源文件: '' });
  assert.equal(E.validate(missingParam, s).ok, false);
});

test('scope=match(condition) 的非法条件在预览前就被 validate 拒绝', () => {
  const s = fresh();
  const d = E.buildDraft('extract', null, { scope: 'match', 条件: '工时 >>> 100' });
  const v = E.validate(d, s);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => /条件/.test(e)));
});

test('一句话被解释成 extract 声明式配方', () => {
  const got = E.understand('从外勤登记表把邮箱提出来');
  assert.equal(got.kind, 'extract');
  assert.ok(got.sentence);
});

test('extract 影响预览：全部行，显示「影响 N 行 / 共 M 行」', () => {
  const s = fresh();
  const d = E.buildDraft('extract', '从外勤登记表把邮箱提出来');
  const pv = E.preview(s, d);
  assert.equal(pv.invalid, false);
  assert.equal(pv.totalRows, 5);
  assert.equal(pv.affectedRows, 5);
  assert.equal(pv.cells.length, 5);
  assert.match(pv.summary, /影响 5 行 \/ 共 5 行/);
  const alan = pv.cells.find(c => c.row === '阿岚');
  assert.equal(alan.col, '邮箱');
  assert.equal(alan.after, 'alan@example.com');
  assert.equal(alan.before, '（无此列）');
});

test('extract + scope=match(条件)：只填命中行', () => {
  const s = fresh();
  const d = E.buildDraft('extract', null, { scope: 'match', 条件: '工时 > 100' });
  const pv = E.preview(s, d);
  assert.equal(pv.invalid, false);
  // 工时>100: 阿岚160, 柏舟176, 丁野144 = 3 行
  assert.equal(pv.affectedRows, 3);
  assert.equal(pv.cells.length, 3);
  assert.deepEqual(pv.cells.map(c => c.row).sort(), ['丁野', '柏舟', '阿岚']);
});

test('零命中允许确认但显著标注「影响 0 行 / 共 M 行」', () => {
  const s = fresh();
  const d = E.buildDraft('extract', null, { scope: 'match', 条件: '工时 > 999' });
  const pv = E.preview(s, d);
  assert.equal(pv.affectedRows, 0);
  assert.match(pv.summary, /影响 0 行 \/ 共 5 行/);
});

test('非法条件：preview 标 invalid 且不产生写值动作', () => {
  const s = fresh();
  const d = E.buildDraft('extract', null, { scope: 'match', 条件: '工时 >>> 100' });
  const pv = E.preview(s, d);
  assert.equal(pv.invalid, true);
  assert.equal(pv.cells.length, 0);
});

test('applyCells 是纯函数：不改入参，写到新列', () => {
  const s = fresh();
  const d = E.buildDraft('extract', null);
  const pv = E.preview(s, d);
  const before = JSON.stringify(s.rows);
  const applied = E.applyCells(s, pv.cells);
  assert.equal(JSON.stringify(s.rows), before, '入参未被修改');
  assert.ok(applied.columns.includes('邮箱'));
  assert.equal(applied.rows[0].邮箱, 'alan@example.com');
});

test('状态机：理解 → 预览 → 确认 → 执行，产出写值', () => {
  let s = fresh();
  s = E.reduce(s, { type: 'SET_INPUT', text: '从外勤登记表把邮箱提出来' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  assert.equal(s.stage, 'UNDERSTOOD');
  assert.equal(s.draft.kind, 'extract');
  s = E.reduce(s, { type: 'PREVIEW' });
  assert.equal(s.stage, 'PREVIEWED');
  s = E.reduce(s, { type: 'CONFIRM' });
  assert.equal(s.stage, 'EXECUTED');
  assert.ok(s.columns.includes('邮箱'));
  assert.equal(s.rows[0].邮箱, 'alan@example.com');
});

test('固化按钮：参数未改才真一键执行；改了参数强制退回预览确认', () => {
  let s = fresh();
  s = E.reduce(s, { type: 'SET_INPUT', text: '从外勤登记表把邮箱提出来' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  s = E.reduce(s, { type: 'PREVIEW' });
  s = E.reduce(s, { type: 'CONFIRM' });
  s = E.reduce(s, { type: 'SOLIDIFY', name: '补邮箱' });
  assert.equal(s.buttons.length, 1);
  const id = s.buttons[0].id;

  // 参数未改：直接执行（stage 已是 EXECUTED，noteTone 为 ok）
  let same = E.reduce(s, { type: 'RUN_BUTTON', id });
  assert.equal(same.stage, 'EXECUTED');
  assert.equal(same.noteTone, 'ok');
  assert.match(same.note, /参数未改/);

  // 参数改了（scope 由 all → match，且补条件）：强制退回 PREVIEWED，不许直接执行
  let changed = E.reduce(s, { type: 'RUN_BUTTON', id, params: { scope: 'match', 条件: '工时 > 150' } });
  assert.equal(changed.stage, 'PREVIEWED', '改参数后必须退回预览');
  assert.equal(changed.noteTone, 'warn');
  assert.match(changed.note, /退回解释与影响预览|参数被改过/);
  // 不产生「新」写入：表格行与改动前完全一致（此前已确认写入的值保持，不被清掉也不被覆盖）
  assert.deepEqual(changed.rows, s.rows, '退回预览时不得执行本次改动对应的写值');
});

test('拦截：没有预览不能确认；非法条件不能进预览', () => {
  let s = fresh();
  const blocked = E.reduce(s, { type: 'CONFIRM' });
  assert.equal(blocked.stage, 'IDLE');
  assert.equal(blocked.noteTone, 'warn');

  s = E.reduce(s, { type: 'SET_INPUT', text: '从外勤登记表把邮箱提出来' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  const bad = E.reduce(s, { type: 'PREVIEW', params: { scope: 'match', 条件: '工时 >>> 100' } });
  assert.equal(bad.stage, 'UNDERSTOOD', '非法条件不得进入 PREVIEWED');
  assert.equal(bad.noteTone, 'warn');
});
