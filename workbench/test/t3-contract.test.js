'use strict';
// 票 #20（T3 Contract）：删除旧默认值 map，registry/模板/预览卡统一走 typed 声明。
// 断言：KINDS.*.params 已删；buildDraft 默认参数由 paramSpec 的 默认值 派生（行为不变）；
//       preview 暴露 typed paramSpec 元数据（key/类型/必填/默认值/约束）供预览卡第③段；
//       registry/templates 加载与结构比对无回归。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

const PRIVATE_KINDS = ['extract', 'swap', 'conditional', 'function'];
const COLS = ['姓名', '部门', '工时', '时薪', '备注'];
function mkState() {
  return {
    primaryKey: '姓名',
    columns: COLS.slice(),
    rows: [
      { 姓名: '阿岚', 部门: '技术', 工时: 160, 时薪: 80, 备注: '' },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80, 备注: '' }
    ],
    sources: { '外勤登记表.csv': { rows: [{ 姓名: '阿岚', 邮箱: 'a@x.com' }, { 姓名: '柏舟', 邮箱: 'b@x.com' }] } }
  };
}

// ---- AC1：旧 KINDS.*.params 默认值 map 已删除 ----
test('AC1 四类动作的旧 params 默认值 map 已删除', function () {
  PRIVATE_KINDS.forEach(function (k) {
    assert.equal(E.KINDS[k].params, undefined, k + ' 不应再有 params 默认值 map（已删）');
  });
});

test('AC1 buildDraft 默认参数由 paramSpec 默认值派生（含公共字段）', function () {
  // extract 默认值：来源文件/匹配列/取哪一列/写到 + scope=all + 条件=''
  const d = E.buildDraft('extract', null, {});
  assert.equal(d.params['来源文件'], '外勤登记表.csv');
  assert.equal(d.params['匹配列'], '姓名');
  assert.equal(d.params['取哪一列'], '邮箱');
  assert.equal(d.params['写到'], '邮箱');
  assert.equal(d.params.scope, 'all');
  assert.equal(d.params['条件'], '');
});

test('AC1 conditional 默认 scope=match、其余三类默认 all', function () {
  assert.equal(E.buildDraft('extract').params.scope, 'all');
  assert.equal(E.buildDraft('swap').params.scope, 'all');
  assert.equal(E.buildDraft('function').params.scope, 'all');
  assert.equal(E.buildDraft('conditional').params.scope, 'match');
});

test('AC1 buildDraft 生成的四类默认草稿仍通过 validate（行为不变）', function () {
  const s = mkState();
  PRIVATE_KINDS.forEach(function (k) {
    const v = E.validate(E.buildDraft(k, null, {}), s);
    assert.equal(v.ok, true, k + ' 默认草稿应合法：' + JSON.stringify(v.errors));
  });
});

// ---- AC1：function kind 从句子里抽命名参数（依赖默认值来源改为 paramSpec 后仍成立） ----
test('AC1 function 从句子抽输出列/表达式仍生效', function () {
  const d = E.buildDraft('function', '把工时乘时薪算成应发', {});
  assert.equal(d.params['输出列'], '应发');
  assert.match(d.params['表达式'], /工时/);
});

// ---- AC3：preview 暴露 typed paramSpec 元数据供预览卡第③段 ----
test('AC3 preview 返回 typed paramSpec（含类型/必填/默认值/约束）', function () {
  const s = mkState();
  const draft = E.buildDraft('extract');
  s.draft = draft;
  const pv = E.preview(s, draft);
  assert.ok(Array.isArray(pv.paramSpec), 'preview 应带 paramSpec 数组');
  const byKey = {};
  pv.paramSpec.forEach(function (d) { byKey[d.key] = d; });
  assert.ok(byKey['来源文件'], 'paramSpec 应含 来源文件');
  assert.equal(byKey['来源文件'].类型, '文件');
  assert.equal(byKey['来源文件'].必填, true);
  assert.ok('默认值' in byKey['来源文件']);
  assert.ok('约束' in byKey['来源文件']);
  // 公共字段也应在 paramSpec 里
  assert.ok(byKey['scope'], 'paramSpec 应含公共字段 scope');
});

// ---- AC3：client 预览卡第③段读 typed 声明（纯 view-model，带类型/必填/默认值/约束） ----
test('AC3 预览卡第③段 scopeParams 带 typed paramSpec，仍是纯数据', function () {
  const { projectPreviewCard } = require('../client');
  const s = mkState();
  const draft = E.buildDraft('extract');
  s.draft = draft;
  s.stage = 'PREVIEWED';
  s.preview = E.preview(s, draft);
  const card = projectPreviewCard(s);
  const sp = card.sections.scopeParams;
  assert.ok(Array.isArray(sp.paramSpec), 'scopeParams.paramSpec 应为数组');
  assert.ok(sp.paramSpec.length > 0, 'paramSpec 不应为空');
  const one = sp.paramSpec[0];
  ['key', '类型', '必填', '默认值', '约束'].forEach(function (k) {
    assert.ok(k in one, '每参数声明应含 ' + k + '（宿主渲染控件用）');
  });
  // 纯 view-model：不含任何函数/控件实例
  sp.paramSpec.forEach(function (d) {
    assert.equal(typeof d.key, 'string');
    assert.equal(typeof d.类型, 'string');
    assert.equal(typeof d.必填, 'boolean');
  });
});

// ---- AC2：registry 加载走 typed 声明、无回归（默认值回填 + 结构比对） ----
test('AC2 registry 加载生成完整参数（默认值来自 paramSpec）', function () {
  const s = mkState();
  const entries = [
    { schemaVersion: 1, name: '补邮箱', source: 'preset', kind: 'extract', params: { 来源文件: '外勤登记表.csv', 匹配列: '姓名', 取哪一列: '邮箱', 写到: '邮箱' } }
  ];
  const r = E.loadRegistry(entries, s);
  assert.equal(r.accepted.length, 1, '合法条目应被接受：' + JSON.stringify(r.rejected));
  assert.ok(r.accepted[0].params['来源文件']);
});

// ---- AC2：templates 清单校验走 typed 声明、无回归 ----
test('AC2 templates 清单校验无回归', function () {
  const m = { schemaVersion: 1, name: '员工工时表', columns: { '姓名': 'text', '工时': 'number' }, primaryKey: '姓名' };
  const r = E.validateManifest(m);
  assert.equal(r.ok, true, '合法清单应通过：' + JSON.stringify(r.errors));
});
