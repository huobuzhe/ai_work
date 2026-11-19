'use strict';
// 票 #12：scope=all|match 与 condition 是四类动作共有的 schema 公共字段。
// 主 seam（lib/engine.js 纯引擎）+ 预览卡投影（client）两层断言。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');
const { projectPreviewCard } = require('../client');

const KINDS = ['extract', 'swap', 'conditional', 'function'];

function mkState() {
  const people = [
    ['阿岚', '技术', 160, 80], ['柏舟', '技术', 176, 80],
    ['岑溪', '运营', 96, 60], ['丁野', '运营', 144, 60],
    ['尔芙', '人事', 88, 70]
  ];
  const emails = {
    '阿岚': 'alan@example.com', '柏舟': 'baizhou@example.com',
    '岑溪': 'cenxi@example.com', '丁野': 'dingye@example.com', '尔芙': 'erfu@example.com'
  };
  return E.initial({
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪', '备注'],
    rows: people.map(function (p) { return { '姓名': p[0], '部门': p[1], '工时': p[2], '时薪': p[3], '备注': '' }; }),
    sources: {
      '外勤登记表.csv': {
        columns: ['姓名', '邮箱'],
        rows: people.map(function (p) { return { '姓名': p[0], '邮箱': emails[p[0]] }; })
      }
    }
  });
}
function rowsOf(pv) { return pv.cells.map(function (c) { return c.row; }); }
function uniq(a) { return Array.from(new Set(a)); }

// --- AC1：scope / 条件 是四类动作共有的公共字段 ---
test('AC1 scope 与 条件 是四类动作共有的 schema 公共字段（默认 all，conditional 默认 match）', () => {
  KINDS.forEach(function (k) {
    const d = E.buildDraft(k);
    assert.ok('scope' in d.params, k + ' 缺少公共字段 scope');
    assert.ok('条件' in d.params, k + ' 缺少公共字段 条件');
    assert.ok(['all', 'match'].indexOf(d.params.scope) !== -1, k + ' scope 取值非法');
  });
  assert.equal(E.buildDraft('extract').params.scope, 'all');
  assert.equal(E.buildDraft('swap').params.scope, 'all');
  assert.equal(E.buildDraft('function').params.scope, 'all');
  // 带条件增删的本质是条件，默认 match，使快捷按钮行为与既有语义一致
  assert.equal(E.buildDraft('conditional').params.scope, 'match');
});

// --- 校验对所有 kind 一视同仁 ---
test('validate 对四类动作都校验 scope 取值', () => {
  KINDS.forEach(function (k) {
    const d = E.buildDraft(k, null, { scope: 'maybe' });
    const v = E.validate(d, mkState());
    assert.equal(v.ok, false, k + ' 应拒绝非法 scope');
    assert.ok(v.errors.some(function (e) { return /scope/.test(e); }), k + ' 报错应提到 scope');
  });
});

test('validate 对四类动作 scope=match 时都校验条件（非法/未知列都拒绝）', () => {
  KINDS.forEach(function (k) {
    const bad = E.buildDraft(k, null, { scope: 'match', 条件: '>>>' });
    assert.equal(E.validate(bad, mkState()).ok, false, k + ' 应拒绝非法条件');
    const unknown = E.buildDraft(k, null, { scope: 'match', 条件: '不存在的列 > 1' });
    const v = E.validate(unknown, mkState());
    assert.equal(v.ok, false, k + ' 应拒绝未知列条件');
    assert.ok(v.errors.some(function (e) { return /条件字段|列/.test(e); }), k + ' 报错应提到列');
  });
});

test('AC1/AC5 steps 文本如实声明作用范围（四类统一首行）', () => {
  KINDS.forEach(function (k) {
    const s0 = E.buildDraft(k, null, { scope: 'match', 条件: '工时 > 150' });
    assert.match(s0.steps[0], /^作用范围：只作用于满足条件「工时 > 150」的记录$/, k + ' steps 首行应声明 match 范围');
    const s1 = E.buildDraft(k, null, { scope: 'all' });
    assert.equal(s1.steps[0], '作用范围：作用于全部记录', k + ' steps 首行应声明全部范围');
  });
});

test('AC5 preview 直接返回 scope / condition 字段', () => {
  const pv = E.preview(mkState(), E.buildDraft('extract', null, { scope: 'match', 条件: '工时 > 150' }));
  assert.equal(pv.scope, 'match');
  assert.equal(pv.condition, '工时 > 150');
});

// --- AC1 + AC5：scope 对四类动作的预览都真正生效 ---
test('extract：scope=match 只影响命中行，scope=all 影响全部行', () => {
  const s = mkState();
  const m = E.preview(s, E.buildDraft('extract', null, { scope: 'match', 条件: '工时 > 150' }));
  assert.equal(m.affectedRows, 2);
  assert.deepEqual(uniq(rowsOf(m)).sort(), ['柏舟', '阿岚'].sort());
  const a = E.preview(s, E.buildDraft('extract', null, { scope: 'all' }));
  assert.equal(a.affectedRows, 5);
});

test('swap：scope=match 只换命中行（半换），scope=all 换全部行', () => {
  const s = mkState();
  const m = E.preview(s, E.buildDraft('swap', null, { scope: 'match', 条件: '工时 > 150' }));
  assert.equal(m.cells.length, 4, '2 行 × 2 列 = 4 格');
  assert.deepEqual(uniq(rowsOf(m)).sort(), ['柏舟', '阿岚'].sort(), '未命中行不得出现在预览');
  const a = E.preview(s, E.buildDraft('swap', null, { scope: 'all' }));
  assert.equal(a.cells.length, 10, '5 行 × 2 列 = 10 格');
  assert.equal(a.affectedRows, 5);
});

test('conditional：scope=match 只对命中行增删改；scope=all 对所有行生效（scope 真正生效）', () => {
  const s = mkState();
  const m = E.preview(s, E.buildDraft('conditional', null, { scope: 'match', 条件: '工时 > 150' }));
  assert.equal(m.cells.length, 2);
  assert.deepEqual(uniq(rowsOf(m)).sort(), ['柏舟', '阿岚'].sort());
  // 关键回归：scope 改为 all 后，即使 条件 仍是 '工时 > 150'，也应作用于全部 5 行
  const a = E.preview(s, E.buildDraft('conditional', null, { scope: 'all' }));
  assert.equal(a.affectedRows, 5, 'conditional 必须尊重公共 scope=all，而不是私有条件');
  assert.equal(a.cells.length, 5);
});

test('function：scope=match 只对命中行写值，scope=all 写全部行', () => {
  const s = mkState();
  const m = E.preview(s, E.buildDraft('function', null, { scope: 'match', 条件: '工时 > 150' }));
  assert.equal(m.cells.length, 2);
  assert.deepEqual(uniq(rowsOf(m)).sort(), ['柏舟', '阿岚'].sort());
  // function 现值语义：after 为算好的真实数值（user m07859「存算好的真实数字」），不再是公式串。
  m.cells.forEach(function (c) { assert.equal(typeof c.after, 'number'); });
  assert.deepEqual(m.cells.map(function (c) { return c.after; }).sort(function (x, y) { return x - y; }), [12800, 14080]);
  const a = E.preview(s, E.buildDraft('function', null, { scope: 'all' }));
  assert.equal(a.affectedRows, 5);
});

// --- AC3：零命中合法且显著标注 ---
test('AC3 零命中：affectedRows=0、仍合法可确认、summary 显著标注「影响 0 行 / 共 M 行」', () => {
  KINDS.forEach(function (k) {
    const pv = E.preview(mkState(), E.buildDraft(k, null, { scope: 'match', 条件: '工时 > 1000' }));
    assert.equal(pv.affectedRows, 0, k + ' 零命中 affectedRows 应为 0');
    assert.equal(pv.invalid, false, k + ' 零命中是合法意图，不应 invalid');
    assert.match(pv.summary, /影响 0 行 \/ 共 5 行/, k + ' summary 应显著标注零命中');
  });
});

// --- AC4：scope 在预览卡内可改并联动影响行数（不新增第 6 步） ---
test('AC4 reduce PREVIEW 改 scope 联动「影响 N 行 / 共 M 行」', () => {
  const s = mkState();
  const s0 = E.reduce(s, { type: 'QUICK', kind: 'extract' });
  assert.equal(s0.preview.affectedRows, 5, '默认 all 影响全部');
  const s1 = E.reduce(s0, { type: 'PREVIEW', params: { scope: 'match', 条件: '工时 > 150' } });
  assert.equal(s1.stage, 'PREVIEWED');
  assert.equal(s1.preview.affectedRows, 2, '改成 match 后联动为命中行数');
  assert.equal(s1.draft.params.scope, 'match', '改后的 scope 落到草稿上');
});

test('AC4 预览卡投影暴露 scope / 条件 供面板渲染「作用范围」控件', () => {
  const s = mkState();
  const s1 = E.reduce(s, { type: 'QUICK', kind: 'swap', params: { scope: 'match', 条件: '工时 > 150' } });
  const card = projectPreviewCard(s1);
  assert.ok(card, '应有预览卡');
  assert.equal(card.scope, 'match');
  assert.equal(card.condition, '工时 > 150');
  assert.equal(card.scopeLabel, '符合条件');
  const all = projectPreviewCard(E.reduce(s, { type: 'QUICK', kind: 'swap' }));
  assert.equal(all.scope, 'all');
  assert.equal(all.scopeLabel, '全部');
});
