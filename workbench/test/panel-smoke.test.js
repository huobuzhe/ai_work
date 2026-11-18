'use strict';
// 薄集成 smoke（规格 #8 Testing Decisions）：证明面板能经既有契约注册并 keepMounted 常驻。
// 不依赖浏览器 / DOM：用一个最小假 ctx 记录 register 调用，加载 real client bundle 的 factory 核对。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CLIENT_JS = path.join(__dirname, '..', 'client', 'client.js');

function loadBundle() {
  const code = fs.readFileSync(CLIENT_JS, 'utf8');
  let captured = null;
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: function (def) { captured = def; }
      }
    },
    module: { exports: {} },
    exports: {}
  };
  vm.runInNewContext(code, sandbox, { filename: 'client.js' });
  assert.ok(captured, 'bundle 必须调用 window.__ModuleLoader__.load');
  return captured;
}

test('client bundle 用 __ModuleLoader__.load 包裹，声明 id 与 factory', () => {
  const def = loadBundle();
  assert.equal(typeof def.id, 'string');
  assert.ok(def.id.length > 0);
  assert.equal(typeof def.factory, 'function');
});

test('factory 导出的注册函数经 sidebarRightTabs + slots 契约挂载常驻面板', () => {
  const def = loadBundle();
  const mod = { exports: {} };
  const fakeRequire = function (name) {
    // 面板 source 不 import 外部模块（本 tracer bullet 无外部依赖）
    throw new Error('unexpected require: ' + name);
  };
  const exported = def.factory(fakeRequire, mod.exports, mod);
  const register = exported.registerWorkbenchPanel || (mod.exports && mod.exports.registerWorkbenchPanel);
  assert.equal(typeof register, 'function', '必须导出 registerWorkbenchPanel');

  const calls = { injects: [], effects: [], tabs: [], slots: [], slotInjects: [] };
  // 忠实模拟 cordis ctx：effect(fn) 立即执行并返回 disposer；
  // slots.inject(name, cb) 立即 cb()；plugins 经 injected.get(name) 取值。
  function makeCtx() {
    const sidebarRightTabs = { register: function (spec) { calls.tabs.push(spec); return function () {}; } };
    const services = { sidebarRightTabs };
    const slots = {
      inject: function (name, cb) { calls.slotInjects.push(name); return cb(); },
      register: function (spec, body) { calls.slots.push({ spec, body }); return function () {}; }
    };
    services.slots = slots;
    const ctx = {
      effect: function (fn, label) { calls.effects.push(label); const d = fn(); return typeof d === 'function' ? d : function () {}; },
      inject: function (names, fn) {
        calls.injects.push(names);
        return fn({ get: function (n) { return services[n]; }, effect: ctx.effect, slots });
      },
      slots,
      get: function (n) { return services[n]; }
    };
    return ctx;
  }
  const ctx = makeCtx();
  const result = register(ctx);

  // 阶段 1：注入 sidebarRightTabs，且带 keepMounted 常驻
  assert.ok(calls.injects.some(a => Array.isArray(a) && a.indexOf('sidebarRightTabs') !== -1));
  assert.equal(calls.tabs.length, 1);
  assert.equal(calls.tabs[0].keepMounted, true, 'keepMounted 必须为 true（常驻）');
  assert.equal(calls.tabs[0].priority, 'extension', '外部包走 extension 优先级');
  assert.ok(calls.tabs[0].id && calls.tabs[0].kind, 'tab 需要 id 与 kind');

  // 阶段 2：面板 body 注册到 sidebar.right.pane.tab
  assert.equal(calls.slots.length, 1);
  assert.equal(calls.slots[0].spec.name, 'sidebar.right.pane.tab');
  assert.equal(calls.slots[0].spec.key, calls.tabs[0].id, 'slot key 必须等于 tab id');
  assert.equal(typeof calls.slots[0].body, 'function', '面板 body 必须是函数');

  // 返回注册描述，供宿主/测试核对
  assert.equal(result.tabId, calls.tabs[0].id);
});

test('面板 body 把引擎预览投影成预览卡视图模型（显示将改格子与影响 N 行 / 共 M 行）', () => {
  const def = loadBundle();
  const mod = { exports: {} };
  const exported = def.factory(function () { throw new Error('no external require'); }, mod.exports, mod);
  assert.equal(typeof exported.projectPreviewCard, 'function', '必须导出预览卡投影函数');

  // 用真实引擎产出的 preview 状态喂给投影函数（client 本身不依赖引擎，这里只是构造测试数据）
  const E = require('../lib/engine');
  let s = E.initial({
    primaryKey: '姓名', columns: ['姓名', '工时', '时薪'],
    rows: [{ 姓名: '阿岚', 工时: 160, 时薪: 80 }],
    sources: { '外勤登记表.csv': { rows: [{ 姓名: '阿岚', 邮箱: 'alan@example.com' }] } }
  });
  s = E.reduce(s, { type: 'SET_INPUT', text: '从外勤登记表把邮箱提出来' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  s = E.reduce(s, { type: 'PREVIEW' });

  const card = exported.projectPreviewCard(s);
  assert.ok(card, '有合法预览时应产出卡片');
  assert.match(card.summary, /影响 1 行 \/ 共 1 行/);
  assert.equal(card.affectedRows, 1);
  assert.equal(card.totalRows, 1);
  assert.equal(card.cells.length, 1);
  assert.deepEqual(
    { row: card.cells[0].row, col: card.cells[0].col, after: card.cells[0].after },
    { row: '阿岚', col: '邮箱', after: 'alan@example.com' }
  );

  // 无预览 / 非法预览时不产卡（面板不显示半成品）
  assert.equal(exported.projectPreviewCard(E.initial({})), null);
});

test('package.json 声明 dsh.client(platform=web) 与 client 导出、build:client 脚本', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.ok(pkg.exports['./client'], '必须导出 ./client');
  assert.ok(pkg.scripts['build:client'], '必须有 build:client 脚本');
  assert.ok(pkg.dsh.bundle.patch, '必须声明 dsh.bundle.patch');
});
