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
 */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');
const C = require('../client/index');

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
