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
const FS = require('../scripts/feishu-adapter');
const TS = require('../scripts/tencent-adapter');

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

// ============================================================================
// 票 #36（Slice 2 / S6）：飞书优先 + 两套独立凭据契约核验（验证既有、不加产品行为）。
// #22 已钉凭据字段/注入/失效/错误映射四要素；本票补 #22 未覆盖的三条回归护栏：
//  1. 凭据负担不对称（飞书低门槛 / 腾讯 OAuth2 + 刷新）——这是「第一梯队」在代码里的
//     唯一体现。平台优先级本身与证据事实（飞书 code:0 读回 2x2、腾讯 建表 ret:0 /
//     写读豁免 / OAuth2+scope 审核 / 三元组头 / V2 deprecated）记在规格 #34 与调研 note，
//     非代码常量，不在本票测试范围。
//  2. 三组错误码（飞书 / 腾讯 V2 / 腾讯 V3）互不串用。
//  3. runLive 缺本机凭据明确拒绝（早返回不联网、不静默重跑）。
// 范围说明：AC3「凭据失效→可读预览提示 + 禁用动作」目前无运行时 seam
// （validateCredentials 未接入 buildPreview，errorMap 运行时不消费），加此行为属产品
// 改动、本票范围外；「真实值零入库 / 不回显」由 #22 的 sentinel 用例钉死。
// 全部断言针对既有实现，不改产品代码。
// ============================================================================

// ---- AC1：凭据负担不对称（飞书低门槛 vs 腾讯 OAuth2 + 刷新）----
test('#36 AC1 凭据负担不对称：飞书刷新复用必填字段；腾讯需额外 OAuth2 刷新字段', function () {
  const f = E.CREDENTIAL_CONTRACTS.feishu;
  const t = E.CREDENTIAL_CONTRACTS.tencent;
  assert.equal(f.fields.length, 3, '飞书 3 个必填字段');
  assert.equal(f.tokenRefresh, undefined, '飞书刷新复用必填 app_id/app_secret，无额外刷新字段');
  assert.ok(/FEISHU_APP_ID/.test(f.expiry.refresh), '飞书刷新用必填的 app_id（低门槛）');
  assert.ok(/FEISHU_APP_SECRET/.test(f.expiry.refresh), '飞书刷新用必填的 app_secret（低门槛）');
  assert.ok(t.tokenRefresh && t.tokenRefresh.fields.length === 2,
    '腾讯需 OAuth2 刷新专用字段（client_secret/refresh_token），门槛更高');
  assert.ok(/REFRESH_TOKEN/.test(t.expiry.refresh), '腾讯刷新走 refresh_token');
  assert.ok(t.fields.length + t.tokenRefresh.fields.length > f.fields.length,
    '腾讯总凭据字段多于飞书（门槛更高）');
});

// ---- AC2：三组失效映射互不串用（飞书 / 腾讯 V2 / 腾讯 V3）----
test('#36 AC2 三组错误码互不串用：飞书码 / 腾讯 V2 码 / 腾讯 V3 码无交集', function () {
  const feishuCodes = Object.keys(E.CREDENTIAL_CONTRACTS.feishu.errorMap);
  const tencentV2 = Object.keys(E.CREDENTIAL_CONTRACTS.tencent.errorMap);
  const tencentV3 = Object.keys(E.CREDENTIAL_CONTRACTS.tencent.v3ErrorMap);
  const groups = { '飞书': feishuCodes, '腾讯V2': tencentV2, '腾讯V3': tencentV3 };
  const names = Object.keys(groups);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const overlap = groups[names[i]].filter(function (k) { return groups[names[j]].indexOf(k) !== -1; });
      assert.deepEqual(overlap, [], names[i] + ' 与 ' + names[j] + ' 错误码不应串用：' + overlap.join(','));
    }
  }
  // 一手码各归其位，防被挪到别家表
  assert.ok(feishuCodes.indexOf('99991663') !== -1, '99991663 归飞书 tenant token');
  assert.ok(tencentV2.indexOf('37019') !== -1, '37019 归腾讯 V2 token 校验');
  assert.ok(tencentV3.indexOf('400006') !== -1, '400006 归腾讯 V3 鉴权');
});

// ---- AC3：runLive 缺凭据明确拒绝（不静默重跑、早返回不联网）----
// 注：真实值「不回显」由 #22 的 sentinel 用例钉死；这里凭据全删，无值可回显，
// 故只断言「明确拒绝 + 可读提示 + 报字段名」，标题不再声称覆盖不回显。
test('#36 AC3 飞书 runLive 缺本机凭据：明确拒绝并报字段，不静默', async function () {
  const keys = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET'];
  const saved = {};
  keys.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  try {
    const table = { primaryKey: '姓名', columns: ['姓名'], types: { 姓名: 'text' }, rows: [] };
    const r = await FS.runLive(table, 't', false);
    assert.equal(r.ok, false, '缺凭据必须拒绝，不得静默继续');
    assert.ok(/缺本机凭据环境变量/.test(r.error), '应给可读提示');
    assert.ok(/FEISHU_APP_ID/.test(r.error));
    assert.ok(/FEISHU_APP_SECRET/.test(r.error));
    assert.ok(/凭据绝不入库/.test(r.error));
  } finally {
    keys.forEach(function (k) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  }
});

test('#36 AC3 腾讯 runLive 缺本机凭据：明确拒绝并报三头字段，不静默', async function () {
  const keys = ['TENCENT_ACCESS_TOKEN', 'TENCENT_CLIENT_ID', 'TENCENT_OPEN_ID'];
  const saved = {};
  keys.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  try {
    const table = { primaryKey: '姓名', columns: ['姓名'], types: { 姓名: 'text' }, rows: [] };
    const r = await TS.runLive(table, 't', false);
    assert.equal(r.ok, false, '缺凭据必须拒绝，不得静默继续');
    assert.ok(/缺本机凭据环境变量/.test(r.error), '应给可读提示');
    assert.ok(/TENCENT_ACCESS_TOKEN/.test(r.error));
    assert.ok(/TENCENT_CLIENT_ID/.test(r.error));
    assert.ok(/TENCENT_OPEN_ID/.test(r.error));
    assert.ok(/凭据绝不入库/.test(r.error));
  } finally {
    keys.forEach(function (k) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  }
});
