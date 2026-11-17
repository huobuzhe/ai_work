'use strict';
// 最小扩展示例（指南第六节）：dedupe 按主键去重。
// 纪律：只扩展主 seam lib/engine.js（KINDS + preview 分支），不新开 seam、不碰文件、不碰 UI。
// 语义（最小可跑版）：按主键扫描记录，保留策略（首条/末条）保留一条，
// 其余重复行的可见列清空（用 cells 承载「清空」，因为 applyCells 只写单元格值、不物理删行）。
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');

// 夹具：三个人，其中「阿岚」重复两次、「柏舟」重复两次。
const DATA = {
  primaryKey: '姓名',
  columns: ['姓名', '部门', '工号'],
  rows: [
    { 姓名: '阿岚', 部门: '销售', 工号: 'A1' },
    { 姓名: '阿岚', 部门: '销售', 工号: 'A9' }, // 重复阿岚
    { 姓名: '柏舟', 部门: '技术', 工号: 'B1' },
    { 姓名: '柏舟', 部门: '技术', 工号: 'B9' }, // 重复柏舟
    { 姓名: '岑溪', 部门: '财务', 工号: 'C1' }
  ]
};

// 重复行里「非主键列」被清空的格子集合（保留行不动）。
function clearedCellsOf(pv) {
  return pv.cells.map(function (c) { return c.row + '|' + c.col + '=' + c.after; }).sort();
}

test('dedupe：KINDS 声明存在且带 typed paramSpec（保留策略 枚举）', function () {
  assert.ok(E.KINDS.dedupe, '应声明 dedupe 动作');
  const spec = E.KINDS.dedupe.paramSpec;
  assert.ok(Array.isArray(spec) && spec.length > 0, 'paramSpec 应为非空数组');
  const key = spec.find(function (d) { return d.key === '保留策略'; });
  assert.ok(key, '应有「保留策略」参数');
  assert.deepEqual(key.约束.enum, ['首条', '末条']);
});

test('dedupe：buildDraft 默认参数由 paramSpec 派生，validate 通过', function () {
  const s = E.initial(DATA);
  const draft = E.buildDraft('dedupe', '按姓名去重');
  assert.equal(draft.kind, 'dedupe');
  assert.equal(draft.params['保留策略'], '首条', '默认保留首条');
  assert.equal(E.validate(draft, s).ok, true);
});

test('dedupe 保留首条：清空每个重复组的第二条及以后（只动非主键列）', function () {
  const s = E.initial(DATA);
  const draft = E.buildDraft('dedupe', '按姓名去重', { 保留策略: '首条' });
  const pv = E.preview(s, draft);
  assert.equal(pv.invalid, false);
  // 受影响行 = 2（第二条阿岚、第二条柏舟）；岑溪与保留的首条不动。
  assert.equal(pv.affectedRows, 2);
  // 清空的格子：阿岚/柏舟 各 2 个非主键列（部门、工号）→ 4 格，after=''。
  assert.deepEqual(clearedCellsOf(pv), [
    '柏舟|工号=', '柏舟|部门=',
    '阿岚|工号=', '阿岚|部门='
  ]);
  // 不应触碰主键列本身
  assert.ok(pv.cells.every(function (c) { return c.col !== '姓名'; }), '不得清空主键列');
});

test('dedupe 保留末条：清空每个重复组的首条及之前（保留组内最后一条）', function () {
  const s = E.initial(DATA);
  const draft = E.buildDraft('dedupe', '按姓名去重', { 保留策略: '末条' });
  const pv = E.preview(s, draft);
  assert.equal(pv.affectedRows, 2);
  // 保留末条 → 被清空的是每组的第一条（阿岚 A1、柏舟 B1），工号列 after=''。
  const cleared = pv.cells.map(function (c) { return c.row + '|' + c.col + '=' + c.after; }).sort();
  assert.ok(cleared.indexOf('阿岚|工号=') !== -1, '首条阿岚的工号应清空');
  assert.ok(cleared.indexOf('柏舟|工号=') !== -1, '首条柏舟的工号应清空');
});

test('dedupe：无重复时不产格（零命中合法）', function () {
  const s = E.initial({
    primaryKey: '姓名', columns: ['姓名', '部门'],
    rows: [{ 姓名: '甲', 部门: 'x' }, { 姓名: '乙', 部门: 'y' }]
  });
  const pv = E.preview(s, E.buildDraft('dedupe', '按姓名去重'));
  assert.equal(pv.affectedRows, 0);
  assert.equal(pv.cells.length, 0);
});

test('dedupe：走完整 reduce 管线 SET_INPUT→UNDERSTAND→PREVIEW 正确识别并产出预览', function () {
  let s = E.initial(DATA);
  s = E.reduce(s, { type: 'SET_INPUT', text: '按姓名去重' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  assert.equal(s.draft.kind, 'dedupe', 'understand 应识别为 dedupe');
  s = E.reduce(s, { type: 'PREVIEW' });
  assert.equal(s.stage, 'PREVIEWED');
  // preview 正确产出「清空每个重复组第二条及以后的非主键列」的格子。
  assert.equal(s.preview.affectedRows, 2);
  assert.ok(s.preview.cells.every(function (c) { return c.col !== '姓名'; }));
});

// 已知限制（如实记录，非伪造）：applyCells 以「主键值」为行键，且 `rows.filter(...)[0]`
// 只取**第一条**匹配行。当主键本身重复（正是去重要处理的场景）时，它会命中同键的第一行
// =**被保留的那一行**，把保留行清空、却把真正该清的重复行留下——即清错了行。
// 这是 cell-diff 模型与「去重」语义的固有张力：本 demo 的 preview 是正确的，
// 但 applyCells 对重复主键无「按行索引定位」能力。物理去重需宿主层按行索引删/改行。
// 下面这条测试把该限制钉死，防止未来有人误以为本 demo 已能安全落地重复主键去重。
test('dedupe（限制）：applyCells 按主键值取首条匹配行，重复主键时会清错行（清掉被保留行、留下重复行）', function () {
  let s = E.initial({
    primaryKey: '姓名', columns: ['姓名', '部门'],
    rows: [{ 姓名: '阿岚', 部门: '销售' }, { 姓名: '阿岚', 部门: '销售' }]
  });
  const pv = E.preview(s, E.buildDraft('dedupe', '按姓名去重', { 保留策略: '首条' }));
  // preview 只打算清空第二行（1 格），保留首行。
  assert.equal(pv.cells.length, 1);
  const applied = E.applyCells(s, pv.cells);
  // 但 applyCells 按主键值「阿岚」取首条匹配行 = 被保留的首行 → 首行被清空、第二行原样保留（清错了行）。
  assert.deepEqual(applied.rows.map(function (r) { return r.部门; }), ['', '销售']);
});
