'use strict';
// 宿主入口契约测试（票：把面板挂进 DSH 宿主）。
//
// DSH 宿主按 package.json 的 `main` 把 bundle 当宿主侧插件模块加载，要求它是 ESM、
// 导出 name + apply（具名或默认皆可）。此前 main 指向纯引擎 engine.js，缺宿主入口、
// 无法挂进 profile。本测试钉死 entry 契约，防止改 package.json / index.mjs 时悄悄破坏
// 「宿主能加载」这一前提。
//
// 用动态 import() 从 ESM 入口取值；node:test 的 CommonJS 测试文件里可 await import。

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const PKG_DIR = path.resolve(__dirname, '..');
const ENTRY = path.join(PKG_DIR, 'lib', 'index.mjs');
const pkg = require(path.join(PKG_DIR, 'package.json'));

test('package.json main 指向宿主入口 lib/index.mjs（不再指向引擎）', () => {
  assert.equal(pkg.main, 'lib/index.mjs');
  // 引擎仍可经 exports 两路访问（向后兼容，测试大量依赖）
  assert.equal(pkg.exports['.'], './lib/engine.js');
  assert.equal(pkg.exports['./engine'], './lib/engine.js');
  assert.equal(pkg.exports['./host'], './lib/index.mjs');
});

test('宿主入口导出具名 name 与 apply 函数', async () => {
  const mod = await import('file://' + ENTRY);
  assert.equal(mod.name, 'dsh-workbench');
  assert.equal(typeof mod.apply, 'function');
});

test('宿主入口同时提供默认导出 { name, apply }', async () => {
  const mod = await import('file://' + ENTRY);
  assert.ok(mod.default, '应有 default 导出');
  assert.equal(mod.default.name, 'dsh-workbench');
  assert.equal(typeof mod.default.apply, 'function');
});

test('apply(ctx) 挂 effect 不抛错；无 ctx 也不抛错（防御）', async () => {
  const { apply } = await import('file://' + ENTRY);
  let effectRegistered = false;
  const ctx = {
    effect(fn) {
      effectRegistered = true;
      const dispose = fn();
      if (typeof dispose === 'function') dispose(); // 模拟卸载时释放
    }
  };
  assert.doesNotThrow(() => apply(ctx));
  assert.equal(effectRegistered, true, 'apply 应注册一个 effect 以纳入生命周期');
  assert.doesNotThrow(() => apply(undefined));
});

test('dsh.client.platform=web 存在（宿主据此加载 client bundle）', () => {
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
});
