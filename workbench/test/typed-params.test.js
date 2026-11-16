'use strict';
// 票 #18（T1 Expand）：带类型参数声明层 paramSpec + deriveIssues 派生器的单测。
// 主 seam 仍是纯引擎模块；本批只做「声明 + 派生器本身正确」，不接入 validate 主流程（那是 T2）。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

// ---- 1. 四类动作都有 paramSpec，且结构合法 ----
const VALID_TYPES = ['text', '列名', '数值', '表达式', '文件', '枚举'];
const PRIVATE_KINDS = ['extract', 'swap', 'conditional', 'function'];

test('四类动作都有 paramSpec，每条含 key/类型/必填/默认值', function () {
  PRIVATE_KINDS.forEach(function (kind) {
    const spec = E.KINDS[kind].paramSpec;
    assert.ok(Array.isArray(spec), kind + ' 应有 paramSpec 数组');
    assert.ok(spec.length > 0, kind + ' paramSpec 不应为空');
    spec.forEach(function (d) {
      assert.equal(typeof d.key, 'string', kind + ' 参数需有 key');
      assert.ok(VALID_TYPES.indexOf(d.类型) !== -1, kind + ' 参数「' + d.key + '」类型非法：' + d.类型);
      assert.equal(typeof d.必填, 'boolean', kind + ' 参数「' + d.key + '」必填须为布尔');
      assert.ok('默认值' in d, kind + ' 参数「' + d.key + '」需有默认值字段');
      assert.ok('约束' in d, kind + ' 参数「' + d.key + '」需有约束字段（无约束时为 {}）');
    });
  });
});

test('paramSpec 默认值经 buildDraft 派生即生效（旧 params map 已删，#20）', function () {
  PRIVATE_KINDS.forEach(function (kind) {
    const d = E.buildDraft(kind, null, {});
    E.KINDS[kind].paramSpec.forEach(function (spec) {
      assert.equal(d.params[spec.key], spec.默认值, kind + '「' + spec.key + '」buildDraft 默认参数应等于 paramSpec 默认值 ' + spec.默认值);
    });
  });
});

test('scope / condition 标为公共字段，不在任何动作的私有 paramSpec 里', function () {
  PRIVATE_KINDS.forEach(function (kind) {
    const keys = E.KINDS[kind].paramSpec.map(function (d) { return d.key; });
    assert.equal(keys.indexOf('scope'), -1, kind + ' 的私有 paramSpec 不应含 scope');
    assert.equal(keys.indexOf('条件'), -1, kind + ' 的私有 paramSpec 不应含条件');
  });
});

test('公共字段声明里含 scope 与 条件（COMMON_PARAMS）', function () {
  assert.ok(Array.isArray(E.COMMON_PARAMS), 'COMMON_PARAMS 应为数组');
  const keys = E.COMMON_PARAMS.map(function (d) { return d.key; });
  assert.ok(keys.indexOf('scope') !== -1, '公共字段应含 scope');
  assert.ok(keys.indexOf('条件') !== -1, '公共字段应含 条件');
  const scopeDecl = E.COMMON_PARAMS.filter(function (d) { return d.key === 'scope'; })[0];
  assert.equal(scopeDecl.类型, '枚举', 'scope 应为枚举类型');
  assert.deepEqual(scopeDecl.约束.enum, ['all', 'match'], 'scope 约束应为 all|match');
});

// ---- 2. deriveIssues 派生器：五类情形 ----
// 用一个隔离的 paramSpec 直接测派生器本身，不依赖四类动作的具体声明。
const SPEC = [
  { key: '名称', 类型: 'text', 必填: true, 默认值: '' },
  { key: '列名', 类型: '列名', 必填: true, 默认值: '姓名' },
  { key: '数量', 类型: '数值', 必填: false, 默认值: 0, 约束: { min: 0, max: 100 } },
  { key: '动作', 类型: '枚举', 必填: true, 默认值: '增加', 约束: { enum: ['增加', '删除'] } }
];

test('deriveIssues：合法参数通过、无 issue', function () {
  const issues = E.deriveIssues(SPEC, { 名称: '加班', 列名: '备注', 数量: 50, 动作: '增加' }, { columns: ['姓名', '备注'] });
  assert.deepEqual(issues, []);
});

test('deriveIssues：必填缺失 → 报该字段', function () {
  const issues = E.deriveIssues(SPEC, { 列名: '备注', 数量: 50, 动作: '增加' }, { columns: ['姓名', '备注'] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, '名称');
  assert.ok(/必填|缺少/.test(issues[0].reason), 'reason 应说明必填缺失：' + issues[0].reason);
});

test('deriveIssues：类型不符（数值给了非数字）→ 报该字段', function () {
  const issues = E.deriveIssues(SPEC, { 名称: '加班', 列名: '备注', 数量: 'abc', 动作: '增加' }, { columns: ['姓名', '备注'] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, '数量');
  assert.ok(/数值|数字|类型/.test(issues[0].reason), 'reason 应说明类型不符：' + issues[0].reason);
});

test('deriveIssues：枚举越界 → 报该字段', function () {
  const issues = E.deriveIssues(SPEC, { 名称: '加班', 列名: '备注', 数量: 50, 动作: '修改' }, { columns: ['姓名', '备注'] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, '动作');
  assert.ok(/枚举|取值|只能/.test(issues[0].reason), 'reason 应说明枚举越界：' + issues[0].reason);
});

test('deriveIssues：数值超约束（max=100 给 200）→ 报该字段', function () {
  const issues = E.deriveIssues(SPEC, { 名称: '加班', 列名: '备注', 数量: 200, 动作: '增加' }, { columns: ['姓名', '备注'] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, '数量');
  assert.ok(/约束|范围|小于|不大于|max|最大/.test(issues[0].reason), 'reason 应说明数值约束：' + issues[0].reason);
});

test('deriveIssues：列名型「存在 or 明确新建」——不存在的列且未声明新建 → 报该字段', function () {
  const spec2 = [{ key: '目标列', 类型: '列名', 必填: true, 默认值: '姓名' }];
  const issues = E.deriveIssues(spec2, { 目标列: '不存在的列' }, { columns: ['姓名', '备注'] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, '目标列');
  assert.ok(/列|存在|新建/.test(issues[0].reason), 'reason 应说明列不存在：' + issues[0].reason);
});

test('deriveIssues：列名型已存在的列 → 通过', function () {
  const spec2 = [{ key: '目标列', 类型: '列名', 必填: true, 默认值: '姓名' }];
  const issues = E.deriveIssues(spec2, { 目标列: '备注' }, { columns: ['姓名', '备注'] });
  assert.deepEqual(issues, []);
});

test('deriveIssues：无 state（无列清单）时不误报列名——只做类型形状检查', function () {
  const spec2 = [{ key: '目标列', 类型: '列名', 必填: true, 默认值: '姓名' }];
  const issues = E.deriveIssues(spec2, { 目标列: '任意列' }, null);
  assert.deepEqual(issues, [], '没有 state.columns 时不应判列不存在');
});

test('deriveIssues：未知参数（paramSpec 外的 key）→ 报该字段', function () {
  const issues = E.deriveIssues(SPEC, { 名称: '加班', 列名: '备注', 数量: 50, 动作: '增加', 野字段: 'x' }, { columns: ['姓名', '备注'] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, '野字段');
  assert.ok(/未知|不允许/.test(issues[0].reason), 'reason 应说明未知字段：' + issues[0].reason);
});
