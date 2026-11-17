'use strict';
/**
 * 票 #26（Slice 2 / S6）：按钮级权限 / 分享 —— 明确 defer 的「不越权」守卫测试。
 *
 * 本票的裁决是**明确 defer 细粒度权限 / 分享**（规格 #8 Out of Scope「细粒度权限 / 分享（Slice 2 之后）」），
 * 第一版按钮配方随仓内 git 权限走、无账号体系 / 分享链接 / 按钮级 ACL。本测试把这一「不越权」现状钉死，
 * 防止后续有人「偷偷」把 owner / accountId / acl / sharedWith / permissions 之类的字段引入按钮模型或投影。
 *
 * 覆盖：
 *  - 按钮模型（engine.cloneButton 产物）字段白名单里没有任何账号/权限/分享字段；
 *  - 面板投影（client.projectOne / projectButtonLibrary）同样不带这些字段；
 *  - source 只能是 'preset' | 'user'（无 owner 语义）；
 *  - ADAPTERS / CREDENTIAL_CONTRACTS 不含 owner/acl/sharedWith 等用户权限字段
 *    （sharedLayer 是凭据分层、与用户权限无关，白名单排除）。
 *
 * 票 #40（实施 #34 T6）追加四例，同样只挂在既有 seam、验证既有、不加产品行为：
 *  - exportButtons 经 cloneButton 白名单剥掉顶层越权字段（随 git 分发的配方）；
 *  - validate() 对注入 params 的越权字段名逐名拒绝（无隐式权限扩展）；
 *  - 两 adapter 请求计划的键名/URL 无越权字段与共享端点（静态共享面检查）；
 *  - README 的 defer 边界表述与实现一致（文档半壁也有据）。
 * 注：cloneButton 剥顶层、validate 管 params、README 记边界——三层职责不同，
 * 不能拿其中一层的断言冒充另一层的覆盖（code-review 修复）。
 */
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');
const C = require('../client/index');
const F = require('../lib/feishu-adapter');
const T = require('../lib/tencent-adapter');

// 权限/分享/账号相关字段名（一旦出现在任何投影里即越权）。
const FORBIDDEN = ['owner', 'ownerId', 'accountId', 'userId', 'acl', 'sharedWith', 'permissions', 'shareLink', 'sharedTo', 'visibility'];

function assertNoForbidden(obj, where) {
  const keys = Object.keys(obj || {});
  FORBIDDEN.forEach(function (f) {
    assert.ok(keys.indexOf(f) === -1, where + ' 不得含越权字段「' + f + '」');
  });
}


test('S6 按钮模型（cloneButton）不含任何账号/权限/分享字段，source 仅 preset|user', function () {
  const btn = { id: 'b1', name: '补邮箱', kind: 'extract', params: {}, medium: 'x', steps: [] };
  // initial 经 cloneButton 归一化；这里注入一个手工按钮，校验其产物形状。
  const sample = E.initial({ primaryKey: '姓名', columns: ['姓名'], rows: [], sources: {}, buttons: [btn] });
  assert.ok(sample.buttons.length >= 1, '应有按钮');
  sample.buttons.forEach(function (b) { assertNoForbidden(b, '按钮模型'); });
  sample.buttons.forEach(function (b) { assert.ok(b.source === 'preset' || b.source === 'user', 'source 只能是 preset|user'); });
});

test('S6 面板投影 projectOne / projectButtonLibrary 不含账号/权限/分享字段', function () {
  const state = E.initial({ primaryKey: '姓名', columns: ['姓名'], rows: [], sources: {}, buttons: [{ id: 'b1', name: 'x', kind: 'extract', params: {}, medium: 'm', steps: [], source: 'user' }] });
  const lib = C.projectButtonLibrary(state);
  assert.ok(Array.isArray(lib.buttons), 'buttonLibrary.buttons 应是数组');
  lib.buttons.forEach(function (b) {
    assertNoForbidden(b, '面板按钮投影');
    assert.ok(b.source === 'preset' || b.source === 'user', '投影 source 只能是 preset|user');
  });
});

test('S6 ADAPTERS / CREDENTIAL_CONTRACTS 无用户权限/分享字段（含嵌套：capabilities 键、fields[].name；sharedLayer 属凭据分层、不在禁止集）', function () {
  Object.keys(E.ADAPTERS).forEach(function (id) {
    const a = E.ADAPTERS[id];
    assertNoForbidden(a, 'ADAPTERS.' + id);
    // 深挖嵌套：capabilities 的键、formulaCapabilities 的键
    Object.keys(a.capabilities || {}).forEach(function (k) {
      assert.ok(FORBIDDEN.indexOf(k) === -1, 'ADAPTERS.' + id + '.capabilities 不得含越权键「' + k + '」');
    });
    Object.keys(a.formulaCapabilities || {}).forEach(function (k) {
      assert.ok(FORBIDDEN.indexOf(k) === -1, 'ADAPTERS.' + id + '.formulaCapabilities 不得含越权键「' + k + '」');
    });
  });
  const cc = E.CREDENTIAL_CONTRACTS || {};
  Object.keys(cc).forEach(function (id) {
    const c = cc[id];
    assertNoForbidden(c, 'CREDENTIAL_CONTRACTS.' + id);
    // 深挖嵌套：fields[].name 只能是凭据字段名，不得是权限字段名
    (c.fields || []).forEach(function (f) {
      assert.ok(FORBIDDEN.indexOf(f.name) === -1, 'CREDENTIAL_CONTRACTS.' + id + '.fields 不得含越权字段「' + f.name + '」');
    });
  });
});

// ────────────────────────── 票 #40：权限/分享 defer 守卫（既有 seam 验证既有） ──────────────────────────

// 一份「合法基线」按钮配方：来源 sheet 已声明、schemaVersion 齐备，validate 必过。
// 下面分别往顶层（cloneButton 剥离）与 params（validate 拒绝）注入越权字段，
// 钉的是两种真实现象，不是形状快照——两层职责不同，不能互相冒充覆盖。
function validState() {
  return E.initial({
    primaryKey: '姓名', columns: ['姓名', '邮箱'],
    rows: [{ 姓名: '阿岚', 邮箱: 'alan@example.com' }],
    sources: { sheet: { columns: ['姓名', '邮箱'] } }, buttons: []
  });
}
function validButton() {
  return {
    id: 'b1', name: 'x', kind: 'extract', schemaVersion: E.SCHEMA_VERSION,
    params: { 来源文件: 'sheet', 匹配列: '姓名', 取哪一列: '邮箱', 写到: 'out' },
    medium: 'm', steps: [], source: 'user'
  };
}

// 递归收集整份计划对象里所有键名与 URL 字符串，覆盖 steps 与腾讯 chunks[].requests 等嵌套写载荷。
function collectPlanSurface(node, keys, urls) {
  if (!node || typeof node !== 'object') return;
  Object.keys(node).forEach(function (k) {
    keys.push(k);
    const v = node[k];
    if (typeof v === 'string') { if (/^https?:\/\//i.test(v)) urls.push(v); }
    else collectPlanSurface(v, keys, urls);
  });
}

test('#40 AC1 exportButtons 配方顶层白名单剥掉越权字段（cloneButton 实证，非注入 params 的形状快照）', function () {
  const st = validState();
  // 真现象：往按钮顶层注入越权字段，cloneButton 的白名单必须把它们剥掉后再导出。
  // params 的内容由 validate() 负责（见下一例），这里不重复「往 params 注入再断言 params 干净」的循环论证。
  const dirty = Object.assign(validButton(), { owner: 'alice', acl: 'admin', sharedWith: 'all' });
  st.buttons = [dirty];
  const out = E.exportButtons(st);
  assert.ok(Array.isArray(out) && out.length === 1, '应导出 1 份配方');
  const b = out[0];
  assertNoForbidden(b, '导出配方顶层'); // 非空洞：dirty 顶层确有 3 个越权字段被 cloneButton 剥掉
  assert.ok(b.owner === undefined && b.acl === undefined && b.sharedWith === undefined, '注入的越权顶层字段应被剥掉');
  assert.ok(b.source === 'preset' || b.source === 'user', '导出配方 source 只能是 preset|user');
});

test('#40 AC2 validate() 对注入 params 的越权字段名逐名拒绝（无隐式权限扩展）', function () {
  const st = validState();
  // 先钉死基线合法，保证下面的拒绝是「注入越权字段」导致的，不是别的错误。
  const baseline = E.validate(validButton(), st);
  assert.equal(baseline.ok, true, '合法基线配方应通过校验：' + JSON.stringify(baseline.errors || []));
  FORBIDDEN.forEach(function (f) {
    const bad = validButton();
    bad.params[f] = 'x';
    const v = E.validate(bad, st);
    assert.equal(v.ok, false, '注入越权字段「' + f + '」必须被拒绝');
    // 不与具体中文措辞耦合：只钉「拒绝原因点名了被注入的那个字段名」这一真实现象。
    const reason = (v.errors || []).map(function (e) { return typeof e === 'string' ? e : JSON.stringify(e); }).join('；');
    assert.ok(reason.indexOf(f) !== -1, '拒绝原因应点名越权字段「' + f + '」：' + reason);
  });
});

test('#40 AC2 两 adapter 请求计划键名/URL 无越权字段与共享端点（静态检查共享面，不声称已发网络）', function () {
  const table = { primaryKey: '姓名', columns: ['姓名', '工时'], types: { 姓名: 'text', 工时: 'number' }, rows: [{ 姓名: '阿岚', 工时: 8 }] };
  const plans = [
    { label: '飞书', plan: F.buildFeishuPlan(table, {}) },
    { label: '腾讯', plan: T.buildTencentPlan(table, { title: 't' }) }
  ];
  plans.forEach(function (entry) {
    const label = entry.label, plan = entry.plan;
    assert.equal(plan.ok, true, label + ' 计划应成功构建');
    // 递归收集整份计划的键名与 URL（含腾讯 chunks[].requests 写载荷里的 URL），
    // 用「键名精确相等」而非整串 JSON 子串，避免 'acl' 这类短 token 误命中无关文本/值。
    const keys = [], urls = [];
    collectPlanSurface(plan, keys, urls);
    assert.ok(urls.length > 0, label + ' 计划应能收集到请求 URL，端点断言才非空空洞');
    FORBIDDEN.forEach(function (f) {
      assert.equal(keys.indexOf(f), -1, label + ' 计划键名不得含越权字段「' + f + '」');
    });
    const BAD_EP = ['/share', 'permission', '/member', '/acl'];
    urls.forEach(function (u) {
      const low = String(u).toLowerCase();
      BAD_EP.forEach(function (ep) {
        assert.equal(low.indexOf(ep), -1, label + ' 请求 URL 不得含共享/权限端点「' + ep + '」：' + u);
      });
    });
  });
});

test('#40 AC1 defer 边界在 README 中与实现一致（文档半壁也有据，非仅代码断言）', function () {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  // 钉死三件文档事实：明确 defer、配方随 git 权限走、运行态仅本机可见/无账号体系。
  assert.ok(readme.indexOf('明确 defer') !== -1, 'README 应写明权限/分享明确 defer');
  assert.ok(readme.indexOf('git 权限') !== -1, 'README 应写明配方随仓内 git 权限走');
  assert.ok(readme.indexOf('本机使用者可见') !== -1, 'README 应写明按钮仅当前本机使用者可见');
  assert.ok(readme.indexOf('不做账号体系') !== -1, 'README 应写明第一版不做账号体系');
});
