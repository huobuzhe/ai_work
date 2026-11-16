'use strict';
// 票 #13：补齐 swap（调换两段字段，含半换边界与披露）与 conditional（带条件增删）。
// 焦点：swap 半换的「边界确定可测」与「披露为硬要求」（规格 #8 用户故事 11/12、Implementation Decisions）。
// 主 seam（lib/engine.js 纯引擎）+ 预览卡投影（client）两层断言。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');
const { projectPreviewCard } = require('../client');

function mkState() {
  const people = [
    ['阿岚', '技术', 160, 80, 'n1'], ['柏舟', '技术', 176, 80, 'n2'],
    ['岑溪', '运营', 96, 60, 'n3'], ['丁野', '运营', 144, 60, 'n4'],
    ['尔芙', '人事', 88, 70, 'n5']
  ];
  return E.initial({
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪', '备注'],
    rows: people.map(function (p) {
      return { '姓名': p[0], '部门': p[1], '工时': p[2], '时薪': p[3], '备注': p[4] };
    })
  });
}
function uniq(a) { return Array.from(new Set(a)); }
function cellMap(pv, row, col) { return pv.cells.filter(function (c) { return c.row === row && c.col === col; })[0]; }

// ---------- AC1：swap 整列互换 / 部分行半换，边界确定可测 ----------
test('swap scope=all 整列互换：5 行 × 2 列 = 10 格，命中行两格对调', () => {
  const pv = E.preview(mkState(), E.buildDraft('swap', null, { scope: 'all' }));
  assert.equal(pv.affectedRows, 5);
  assert.equal(pv.cells.length, 10);
  const d = cellMap(pv, '阿岚', '部门'), n = cellMap(pv, '阿岚', '备注');
  assert.equal(d.before, '技术'); assert.equal(d.after, 'n1');
  assert.equal(n.before, 'n1'); assert.equal(n.after, '技术');
});

test('swap scope=match 半换：只命中行两格对调，未命中行不出现在预览', () => {
  const pv = E.preview(mkState(), E.buildDraft('swap', null, { scope: 'match', 条件: '工时 > 150' }));
  assert.equal(pv.cells.length, 4, '2 行 × 2 列 = 4 格');
  assert.deepEqual(uniq(pv.cells.map(function (c) { return c.row; })).sort(), ['柏舟', '阿岚'].sort());
  assert.equal(cellMap(pv, '阿岚', '部门').after, 'n1');
  assert.equal(cellMap(pv, '柏舟', '备注').after, '技术');
});

test('swap 边界：字段A 与 字段B 相同 → validate 拒绝（确定性行为）', () => {
  const v = E.validate(E.buildDraft('swap', null, { 字段A: '部门', 字段B: '部门' }), mkState());
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(function (e) { return /相同|不能|一致/.test(e); }), '应说明同列自换非法');
});

test('swap 边界：字段不是当前列 → validate 拒绝，且报错指向具体列名', () => {
  const va = E.validate(E.buildDraft('swap', null, { 字段A: '不存在的列' }), mkState());
  assert.equal(va.ok, false);
  assert.ok(va.errors.some(function (e) { return /字段A.*不存在的列/.test(e); }), '报错应指向字段A 的具体列名');
  const vb = E.validate(E.buildDraft('swap', null, { 字段B: '不存在的列' }), mkState());
  assert.equal(vb.ok, false);
  assert.ok(vb.errors.some(function (e) { return /字段B.*不存在的列/.test(e); }), '报错应指向字段B 的具体列名');
});

test('披露字段边界：invalid 预览返回 disclosure=null / swapBanner=空，非 swap kind 无披露', () => {
  const bad = E.preview(mkState(), E.buildDraft('swap', null, { 字段A: '部门', 字段B: '部门' }));
  assert.equal(bad.invalid, true);
  assert.equal(bad.disclosure, null);
  assert.equal(bad.swapBanner, '');
  ['extract', 'conditional', 'function'].forEach(function (k) {
    const pv = E.preview(mkState(), E.buildDraft(k));
    assert.equal(pv.disclosure, null, k + ' 不应带 swap 披露');
    assert.equal(pv.swapBanner, '');
  });
});

test('swap 边界：scope=match 零命中 → 0 格、合法、summary 标注「影响 0 行 / 共 5 行」', () => {
  const pv = E.preview(mkState(), E.buildDraft('swap', null, { scope: 'match', 条件: '工时 > 1000' }));
  assert.equal(pv.cells.length, 0);
  assert.equal(pv.invalid, false);
  assert.match(pv.summary, /影响 0 行 \/ 共 5 行/);
});

// ---------- AC4：披露为硬要求——半换不掩盖 ----------
test('swap 半换披露：summary 含「N 行交换、M−N 行不变」与「混合两种来源」banner', () => {
  const pv = E.preview(mkState(), E.buildDraft('swap', null, { scope: 'match', 条件: '工时 > 150' }));
  assert.match(pv.summary, /2 行交换、3 行不变/);
  assert.match(pv.summary, /混合两种来源/);
  assert.match(pv.summary, /部门/);
  assert.match(pv.summary, /备注/);
});

test('swap 整列互换不触发混合来源 banner（每列来源一致）', () => {
  const pv = E.preview(mkState(), E.buildDraft('swap', null, { scope: 'all' }));
  assert.doesNotMatch(pv.summary, /混合两种来源/);
});

test('swap preview 返回结构化 disclosure：swappedRows / unchangedRows / mixedColumns / partial', () => {
  const pv = E.preview(mkState(), E.buildDraft('swap', null, { scope: 'match', 条件: '工时 > 150' }));
  assert.ok(pv.disclosure, '应有 disclosure');
  assert.equal(pv.disclosure.kind, 'swap');
  assert.deepEqual(pv.disclosure.swappedRows.slice().sort(), ['柏舟', '阿岚'].sort());
  assert.deepEqual(pv.disclosure.unchangedRows.slice().sort(), ['岑溪', '丁野', '尔芙'].sort());
  assert.deepEqual(pv.disclosure.mixedColumns.slice().sort(), ['部门', '备注'].sort());
  assert.equal(pv.disclosure.swappedCount, 2);
  assert.equal(pv.disclosure.unchangedCount, 3);
  assert.equal(pv.disclosure.partial, true);
});

test('swap 半换：只发命中行的格子，未命中行由 disclosure.unchangedRows 显式披露（不掩盖部分改动）', () => {
  const pv = E.preview(mkState(), E.buildDraft('swap', null, { scope: 'match', 条件: '工时 > 150' }));
  // 逐格 before/after 正确（外部可观察的将改格子）
  const al = cellMap(pv, '阿岚', '部门');
  assert.equal(al.before, '技术'); assert.equal(al.after, 'n1');
  // 命中/未命中的区分由结构化披露承载，而非恒真的 hit 字段
  assert.deepEqual(pv.disclosure.unchangedRows.slice().sort(), ['岑溪', '丁野', '尔芙'].sort());
  pv.cells.forEach(function (c) {
    assert.ok(pv.disclosure.swappedRows.indexOf(c.row) !== -1, '每个格子都应属于命中行：' + c.row);
    assert.equal(c.source, 'swap');
  });
});

// ---------- AC2：conditional 按条件写值 / 清空，零命中标注 ----------
test('conditional 增加：命中行写指定值', () => {
  const pv = E.preview(mkState(), E.buildDraft('conditional', null,
    { 条件: '工时 > 150', 动作: '增加', 目标列: '备注', 值: '加班', scope: 'match' }));
  assert.equal(pv.cells.length, 2);
  pv.cells.forEach(function (c) { assert.equal(c.after, '加班'); });
});

test('conditional 删去/删除/清空：命中行写空串', () => {
  ['删去', '删除', '清空'].forEach(function (action) {
    const pv = E.preview(mkState(), E.buildDraft('conditional', null,
      { 条件: '工时 > 150', 动作: action, 目标列: '备注', 值: '加班', scope: 'match' }));
    assert.equal(pv.cells.length, 2, action + ' 应作用 2 行');
    pv.cells.forEach(function (c) { assert.equal(c.after, '', action + ' 应写空串'); });
  });
});

test('conditional 零命中：0 格、合法、summary 标注', () => {
  const pv = E.preview(mkState(), E.buildDraft('conditional', null, { scope: 'match', 条件: '工时 > 1000' }));
  assert.equal(pv.affectedRows, 0);
  assert.equal(pv.invalid, false);
  assert.match(pv.summary, /影响 0 行 \/ 共 5 行/);
});

// ---------- AC4/卡片：预览卡暴露 swap 披露供宿主渲染 banner ----------
test('预览卡暴露 swap 披露：disclosure + swapBanner 供宿主渲染「命中？列与混合来源 banner」', () => {
  const s = mkState();
  const s1 = E.reduce(s, { type: 'QUICK', kind: 'swap', params: { scope: 'match', 条件: '工时 > 150' } });
  const card = projectPreviewCard(s1);
  assert.ok(card);
  assert.ok(card.disclosure, '卡应含 disclosure');
  assert.equal(card.disclosure.partial, true);
  assert.deepEqual(card.disclosure.mixedColumns.slice().sort(), ['部门', '备注'].sort());
  assert.equal(card.disclosure.swappedCount, 2);
  assert.equal(card.disclosure.unchangedCount, 3);
  assert.match(card.swapBanner, /混合两种来源/);
  const full = projectPreviewCard(E.reduce(s, { type: 'QUICK', kind: 'swap' }));
  assert.equal(full.swapBanner, '', '整列互换无混合 banner');
});

// ---------- AC3/AC5：与主 seam 共用同一引擎接口（CONFIRM 落盘半换） ----------
test('AC5 swap 半换走完整状态机 CONFIRM：未命中行保持原值，命中行对调', () => {
  const s0 = E.reduce(mkState(), { type: 'QUICK', kind: 'swap', params: { scope: 'match', 条件: '工时 > 150' } });
  const s1 = E.reduce(s0, { type: 'CONFIRM' });
  assert.equal(s1.stage, 'EXECUTED');
  const al = s1.rows.filter(function (r) { return r['姓名'] === '阿岚'; })[0];
  const cx = s1.rows.filter(function (r) { return r['姓名'] === '岑溪'; })[0];
  assert.equal(al['部门'], 'n1', '命中行部门变原备注');
  assert.equal(al['备注'], '技术', '命中行备注变原部门');
  assert.equal(cx['部门'], '运营', '未命中行部门不变');
  assert.equal(cx['备注'], 'n3', '未命中行备注不变');
});
