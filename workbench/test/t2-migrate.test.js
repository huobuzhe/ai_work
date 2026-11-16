'use strict';
// 票 #19（T2 Migrate）：四类动作封闭校验切换到 paramSpec 派生（extract/function + swap/conditional 两批合并）。
// 断言：validate() 的参数校验改由 paramSpec 派生驱动，产出结构化 issue{field,reason}；
// 列名型「存在 or 明确新建列」；表达式型可翻译；swap 同列自换/未知列、conditional 动作枚举均被拒。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

const COLS = ['姓名', '部门', '工时', '时薪', '备注'];
function mkState(extra) {
  const s = {
    columns: COLS.slice(),
    rows: [
      { 姓名: '阿岚', 部门: '技术', 工时: 160, 时薪: 80, 备注: '' },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80, 备注: '' }
    ],
    sources: { '外勤登记表.csv': { 姓名: '阿岚', 邮箱: 'a@x.com' } }
  };
  return Object.assign(s, extra || {});
}
function fields(v) { return v.issues.map(function (i) { return i.field; }); }

// ---- AC1：四类动作 validate 均走 paramSpec 派生、产出结构化 issue ----

test('AC1 extract：写到=已存在列 合法通过', function () {
  const v = E.validate(E.buildDraft('extract', null, { 写到: '备注' }), mkState());
  assert.equal(v.ok, true, '写已有列应合法：' + JSON.stringify(v.issues));
});

test('AC1 extract：写到=新列（不存在）合法通过（写列可新建语义）', function () {
  const v = E.validate(E.buildDraft('extract', null, { 写到: '手机号' }), mkState());
  assert.equal(v.ok, true, 'extract 写到新列应合法（可新建）：' + JSON.stringify(v.issues));
});

test('AC1 extract：匹配列=不存在列 → 派生 issue 指向该列', function () {
  const v = E.validate(E.buildDraft('extract', null, { 匹配列: '不存在列' }), mkState());
  assert.equal(v.ok, false);
  assert.ok(fields(v).indexOf('匹配列') !== -1, '应有「匹配列」issue');
});

test('AC1 swap：字段=不存在列 → issue 指向字段A 且说明不存在的列', function () {
  const v = E.validate(E.buildDraft('swap', null, { 字段A: '不存在列' }), mkState());
  assert.equal(v.ok, false);
  assert.ok(v.issues.some(function (i) { return i.field === '字段A' && /不存在/.test(i.reason); }),
    'swap 未知列应报 字段A 且含「不存在」：' + JSON.stringify(v.issues));
});

test('AC1 swap：同列自换 → 拒绝并说明相同', function () {
  const v = E.validate(E.buildDraft('swap', null, { 字段A: '部门', 字段B: '部门' }), mkState());
  assert.equal(v.ok, false);
  assert.ok(v.issues.some(function (i) { return /相同|不能/.test(i.reason); }), '应说明同列自换非法');
});

test('AC1 conditional：动作=非法枚举 → issue 指向 动作 且列枚举', function () {
  const v = E.validate(E.buildDraft('conditional', null, { 动作: '替换' }), mkState());
  assert.equal(v.ok, false);
  assert.ok(v.issues.some(function (i) { return i.field === '动作' && /增加|删除|枚举|只能/.test(i.reason); }),
    '动作枚举越界应报 动作：' + JSON.stringify(v.issues));
});

test('AC1 conditional：动作=删除 合法', function () {
  const v = E.validate(E.buildDraft('conditional', null, { 动作: '删除', 值: '' }), mkState());
  assert.equal(v.ok, true, '删除动作应合法：' + JSON.stringify(v.issues));
});

test('AC1 function：表达式引用不存在列 → issue 指向 表达式', function () {
  const v = E.validate(E.buildDraft('function', null, { 表达式: '不存在 * 2' }), mkState());
  assert.equal(v.ok, false);
  assert.ok(fields(v).indexOf('表达式') !== -1, '表达式非法应报 表达式：' + JSON.stringify(v.issues));
});

test('AC1 function：输出列=新列（应发不存在）合法通过', function () {
  const v = E.validate(E.buildDraft('function', null, { 表达式: '工时 * 时薪', 输出列: '应发' }), mkState());
  assert.equal(v.ok, true, 'function 输出新列应合法：' + JSON.stringify(v.issues));
});

// ---- AC2：数值约束由 paramSpec 驱动（当前四类无 数值 型参数，用 deriveIssues 直接验证派生器契约） ----

test('AC2 派生器：数值超约束产出 issue', function () {
  const spec = [{ key: 'n', 类型: '数值', 必填: true, 默认值: 1, 约束: { max: 10 } }];
  const issues = E.deriveIssues(spec, { n: 99 }, null);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, 'n');
  assert.match(issues[0].reason, /约束|10/);
});

// ---- AC3：非法参数进预览卡第②段、canConfirm=false；合法配方 CONFIRM 行为不变 ----

test('AC3 非法参数：预览 invalid、卡 validation 有该 issue', function () {
  const s = mkState();
  const bad = E.buildDraft('swap', null, { 字段A: '不存在列' });
  const pv = E.preview(s, bad);
  assert.equal(pv.invalid, true, '非法配方预览应 invalid');
  const v = E.validate(bad, s);
  assert.ok(v.issues.some(function (i) { return i.field === '字段A'; }));
});

test('AC3 合法配方：validate ok 且 errors 为空', function () {
  ['extract', 'swap', 'conditional', 'function'].forEach(function (k) {
    const v = E.validate(E.buildDraft(k), mkState());
    assert.equal(v.ok, true, k + ' 默认配方应合法：' + JSON.stringify(v.errors));
    assert.deepEqual(v.errors, []);
  });
});

// ---- AC5：旧默认值 map 仍保留、作为默认值来源 ----

test('AC5 旧 params map 仍存在，且是 buildDraft 默认值来源', function () {
  ['extract', 'swap', 'conditional', 'function'].forEach(function (k) {
    assert.ok(E.KINDS[k].params && typeof E.KINDS[k].params === 'object', k + ' 旧 params map 应保留');
  });
  const d = E.buildDraft('swap', null, {});
  assert.equal(d.params.字段A, E.KINDS.swap.params.字段A, 'buildDraft 应取旧 map 默认值');
});

// ---- 补充：钉住 conditional 动作枚举域 = 执行引擎实际接受的四值（防枚举域漂移） ----
// 说明：#19 把 conditional 动作从旧 paramSpec 的 ['增加','删除'] 放宽为 ['增加','删去','删除','清空']，
// 与执行引擎 isDelete（删去/删除/清空）+ 增加 一一对应，属「行为保真」而非私自扩域；此测试钉住该域。
test('conditional 动作枚举域 = 执行引擎接受的 增加/删去/删除/清空', function () {
  const spec = E.KINDS.conditional.paramSpec.filter(function (d) { return d.key === '动作'; })[0];
  assert.deepEqual(spec.约束.enum.slice().sort(), ['增加', '删去', '删除', '清空'].sort());
  ['增加', '删去', '删除', '清空'].forEach(function (a) {
    assert.equal(E.validate(E.buildDraft('conditional', null, { 动作: a, 值: a === '增加' ? '加班' : '' }), mkState()).ok,
      true, '动作=' + a + ' 应合法');
  });
});

// ---- 补充：新列型/必填参数在新派生路径下仍判定必填 ----
test('必填参数在新派生路径下仍报缺失（写到 / 输出列 / 值）', function () {
  const e = E.validate(E.buildDraft('extract', null, { 写到: '' }), mkState());
  assert.ok(e.issues.some(function (i) { return i.field === '写到'; }), 'extract 写到 空应报缺失');
  const f = E.validate(E.buildDraft('function', null, { 输出列: '' }), mkState());
  assert.ok(f.issues.some(function (i) { return i.field === '输出列'; }), 'function 输出列 空应报缺失');
});
