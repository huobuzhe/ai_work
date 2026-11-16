'use strict';
// 票 #22（Slice 2 / S2）：凭据契约（接口 + 校验，零真实值入库）。
// 断言：
//  AC1 每个云端 adapter 有凭据契约声明（字段名/注入方式/失效刷新/错误映射），两套凭据独立不共用
//  AC2 缺字段时加载被拒并明确报出缺失字段名（有测试证）
//  AC3 真实凭据值零进仓库/配方/日志/issue；测试只用 stub 假值
//  AC4 端到端：缺凭据→拒并报字段；齐→通过（stub 值，有测试证）
//  AC5 全测绿、无回归
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

// 仅用于校验路径的假值 stub（绝不写入仓库/日志/issue）。
const STUB = {
  feishu: {
    FEISHU_APP_ID: 'cli_stub_app_id',
    FEISHU_APP_SECRET: 'stub_secret_value',
    FEISHU_TENANT_ACCESS_TOKEN: 't-stub-tenant-token'
  },
  tencent: {
    TENCENT_ACCESS_TOKEN: 'stub-access-token',
    TENCENT_CLIENT_ID: 'stub-client-id',
    TENCENT_OPEN_ID: 'stub-open-id'
  }
};

// ---- AC1：每个云端 adapter 有凭据契约声明 ----
test('AC1 引擎导出 CREDENTIAL_CONTRACTS，含 feishu/tencent 两套', function () {
  assert.ok(E.CREDENTIAL_CONTRACTS, 'CREDENTIAL_CONTRACTS 应导出');
  ['feishu', 'tencent'].forEach(function (id) {
    assert.ok(E.CREDENTIAL_CONTRACTS[id], '缺凭据契约：' + id);
    assert.equal(E.CREDENTIAL_CONTRACTS[id].adapterId, id, '契约.adapterId 应为 ' + id);
  });
});

test('AC1 契约声明字段名/注入方式/失效刷新/错误映射 四要素齐备', function () {
  ['feishu', 'tencent'].forEach(function (id) {
    const c = E.CREDENTIAL_CONTRACTS[id];
    assert.ok(Array.isArray(c.fields) && c.fields.length > 0, id + ' 缺 fields');
    c.fields.forEach(function (f) {
      assert.equal(typeof f.name, 'string', id + ' 字段缺 name');
      assert.equal(typeof f.envKey, 'string', id + ' 字段缺 envKey');
      assert.ok(['env', 'file'].indexOf(f.injection) !== -1, id + ' 字段 injection 应为 env/file');
      assert.equal(typeof f.required, 'boolean', id + ' 字段 required 应为 boolean');
    });
    assert.ok(Array.isArray(c.injectionModes) && c.injectionModes.length > 0, id + ' 缺 injectionModes');
    assert.ok(c.expiry && typeof c.expiry === 'object', id + ' 缺 expiry（失效/刷新）声明');
    assert.equal(typeof c.expiry.refresh, 'string', id + ' expiry.refresh 应说明刷新方式');
    assert.ok(c.errorMap && typeof c.errorMap === 'object', id + ' 缺 errorMap（错误映射）');
  });
});

test('AC1 两套凭据独立不共用：字段名/envKey 无交集、无共用凭据层', function () {
  const fk = E.CREDENTIAL_CONTRACTS.feishu.fields.map(function (f) { return f.name; });
  const tk = E.CREDENTIAL_CONTRACTS.tencent.fields.map(function (f) { return f.name; });
  fk.forEach(function (n) { assert.equal(tk.indexOf(n), -1, '两套凭据不应共用字段：' + n); });
  assert.notEqual(E.CREDENTIAL_CONTRACTS.feishu.sharedLayer, E.CREDENTIAL_CONTRACTS.tencent.sharedLayer,
    '两套凭据不应共用凭据层');
});

// ---- AC2 / AC4：缺字段被拒并明确报缺失字段名 ----
test('AC2 缺字段时校验被拒并报出缺失的字段名', function () {
  const r = E.validateCredentials('feishu', { FEISHU_APP_ID: 'x', FEISHU_APP_SECRET: 'y' });
  assert.equal(r.ok, false, '缺 tenant_access_token 应被拒');
  assert.ok(r.missing.indexOf('FEISHU_TENANT_ACCESS_TOKEN') !== -1,
    '应明确报出缺失字段 FEISHU_TENANT_ACCESS_TOKEN');
});

test('AC2 缺多个字段全部列出、不只报第一个', function () {
  const r = E.validateCredentials('tencent', {});
  assert.equal(r.ok, false);
  ['TENCENT_ACCESS_TOKEN', 'TENCENT_CLIENT_ID', 'TENCENT_OPEN_ID'].forEach(function (k) {
    assert.ok(r.missing.indexOf(k) !== -1, '应列出缺失字段：' + k);
  });
});

test('AC2 未知 adapter 的 validates 返回明确错误（不静默通过）', function () {
  const r = E.validateCredentials('nope', {});
  assert.equal(r.ok, false);
  assert.ok(r.error && /未知/.test(r.error), '未知 adapter 应报错，不静默通过');
});

test('AC4 端到端：缺凭据→拒并报字段；凭据齐（stub）→通过', function () {
  const bad = E.validateCredentials('feishu', {});
  assert.equal(bad.ok, false, '缺凭据应被拒');
  assert.ok(bad.missing.length > 0, '应报缺失字段');

  const good = E.validateCredentials('feishu', STUB.feishu);
  assert.equal(good.ok, true, '凭据齐（stub）应通过校验');
  assert.equal(good.missing.length, 0, '齐时无缺失字段');
});

test('AC4 腾讯凭据齐（stub）通过校验', function () {
  const r = E.validateCredentials('tencent', STUB.tencent);
  assert.equal(r.ok, true);
});

// ---- AC3：真实凭据值零进仓库/日志；校验结果不回显凭据值 ----
test('AC3 校验结果不回显任何凭据值（只返回 ok/missing/字段名）', function () {
  const r = E.validateCredentials('feishu', STUB.feishu);
  const dump = JSON.stringify(r);
  Object.keys(STUB.feishu).forEach(function (k) {
    assert.equal(dump.indexOf(STUB.feishu[k]), -1, '校验结果不应回显凭据值 ' + k);
  });
});

test('AC3 缺字段报错也不携带其它已给凭据值', function () {
  const r = E.validateCredentials('feishu', { FEISHU_APP_ID: 'cli_secretish', FEISHU_APP_SECRET: 'sss' });
  const dump = JSON.stringify(r);
  assert.equal(dump.indexOf('cli_secretish'), -1, '报错不应回显已给凭据值');
  assert.equal(dump.indexOf('sss'), -1, '报错不应回显已给凭据值');
});

// ---- 契约与 ADAPTERS 一致 ----
test('凭据契约只覆盖云端 adapter（local 零凭据不需要）', function () {
  assert.equal(E.CREDENTIAL_CONTRACTS.local, undefined, 'local 是零凭据 adapter，不应有凭据契约');
  assert.ok(E.CREDENTIAL_CONTRACTS.feishu, 'feishu 应有契约');
  assert.ok(E.CREDENTIAL_CONTRACTS.tencent, 'tencent 应有契约');
});

// ---- errorMap 忠实于一手来源（票 #22 两轴 review HARD-1 回归护栏）----
// 一手出处：docs/research/tencent-create-file-request-shape.md:308、
// docs/research/tencent-v3-batchupdate-request-shape.md:359（V2 码逐字：10313 为空 / 10303 Open-Id / 10302 Client-Id / 37019 Token 校验失败或过期）
test('tencent errorMap 忠实于一手来源 V2 码、不回写成伪造标签', function () {
  const em = E.CREDENTIAL_CONTRACTS.tencent.errorMap;
  assert.equal(em['10313'], 'Access-Token 为空');
  assert.equal(em['10303'], 'Open-Id 错误');
  assert.equal(em['10302'], 'Client-Id 错误');
  assert.equal(em['37019'], 'Token 校验失败或过期');
});

test('tencent 另有 V3 errorMap（400x），与 V2 表分开不混用', function () {
  const v3 = E.CREDENTIAL_CONTRACTS.tencent.v3ErrorMap;
  assert.ok(v3 && typeof v3 === 'object', 'tencent 应声明 v3ErrorMap');
  assert.ok(v3['400001'] && v3['400010'], 'v3ErrorMap 应覆盖 400x 码段');
  // V2 的 103xx 不应出现在 V3 表里
  assert.equal(v3['10313'], undefined, 'V3 表不应混入 V2 码');
});

test('飞书 errorMap 不含无一手出处的伪造码 1254005', function () {
  const em = E.CREDENTIAL_CONTRACTS.feishu.errorMap;
  assert.equal(em['1254005'], undefined, '1254005 无一手出处，不应写入 errorMap');
});

test('tencent 声明刷新专用字段 CLIENT_SECRET / REFRESH_TOKEN（与 feishu app_secret 对称）', function () {
  const tr = E.CREDENTIAL_CONTRACTS.tencent.tokenRefresh;
  assert.ok(tr && Array.isArray(tr.fields), 'tencent 应声明 tokenRefresh.fields');
  assert.ok(tr.fields.indexOf('TENCENT_CLIENT_SECRET') !== -1, '应声明 TENCENT_CLIENT_SECRET');
  assert.ok(tr.fields.indexOf('TENCENT_REFRESH_TOKEN') !== -1, '应声明 TENCENT_REFRESH_TOKEN');
});
