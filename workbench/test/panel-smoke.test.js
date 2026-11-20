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
  // 关键架构（用户 m08845 / 问题2）：tab **不再抢占** xlsx/csv 主视图，patterns 必须为空，
  // 让宿主原生可编辑表格视图照常显示，插件只经 shell.overlay 叠加浮窗按钮。
  assert.ok(Array.isArray(calls.tabs[0].patterns), 'tab.patterns 应为数组');
  assert.equal(calls.tabs[0].patterns.length, 0, 'tab 不得用 patterns 抢占任何文件（含 *.xlsx/*.csv）');

  // 阶段 0：全局浮层 shell.overlay 注册常驻悬浮按钮宿主（用户 m08845 / 问题2：
  // 不再抢占 xlsx 主视图，改为 shell.overlay 叠加浮窗按钮）。
  assert.ok(calls.slotInjects.indexOf('shell.overlay') !== -1, '必须注册 shell.overlay 全局浮层');
  var overlay = calls.slots.filter(function (s) { return s.spec && s.spec.name === 'shell.overlay'; });
  assert.equal(overlay.length, 1, 'shell.overlay 应恰有一条注册');
  assert.equal(overlay[0].spec.id, 'dsh-workbench-fab');
  assert.equal(typeof overlay[0].body, 'function', 'overlay 宿主必须是函数组件');

  // 阶段 2：面板 body 注册到 sidebar.right.pane.tab
  var paneTabs = calls.slots.filter(function (s) { return s.spec && s.spec.name === 'sidebar.right.pane.tab'; });
  assert.equal(paneTabs.length, 1);
  assert.equal(paneTabs[0].spec.key, calls.tabs[0].id, 'slot key 必须等于 tab id');
  assert.equal(typeof paneTabs[0].body, 'function', '面板 body 必须是函数');

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

test('pickActiveSheetFile：从 betterSidebar 快照解析当前打开的 xlsx/csv（问题2 叠加模式取文件）', () => {
  const def = loadBundle();
  const mod = { exports: {} };
  const exported = def.factory(function () { throw new Error('no external require'); }, mod.exports, mod);
  const pick = exported.pickActiveSheetFile;
  assert.equal(typeof pick, 'function', '必须导出 pickActiveSheetFile');

  function snap(activePane, tabs, kind) {
    return {
      sessionId: 'sess-1',
      state: {
        activePane: activePane,
        bottomSplits: { kind: 'split', direction: 'row', children: [{ kind: 'leaf', id: 'leaf-A', active: tabs && tabs[0] && tabs[0].id, tabs: tabs }] }
      }
    };
  }
  // 命中：active leaf 的 active tab 是 editor 且 path 指向 .xlsx
  const ok = pick(snap('leaf-A', [{ id: 't1', active: true, type: 'editor', path: 'F:/ai_work/演示_动作_swap.xlsx' }]));
  assert.ok(ok, '应解析出当前 xlsx 文件');
  assert.equal(ok.path, 'F:/ai_work/演示_动作_swap.xlsx');
  assert.equal(ok.scope, 'session');
  assert.equal(ok.sessionId, 'sess-1');
  // .csv 也命中
  assert.equal(pick(snap('leaf-A', [{ id: 't2', active: true, type: 'editor', path: 'F:/ai_work/外勤登记表.csv' }])).path, 'F:/ai_work/外勤登记表.csv');
  // 非表格文件（.txt）不命中 → 不渲染任何浮窗，绝不遮挡原生视图
  assert.equal(pick(snap('leaf-A', [{ id: 't3', active: true, type: 'editor', path: 'F:/a/b.txt' }])), undefined);
  // 无 tab / 空快照不命中
  assert.equal(pick({ state: {} }), undefined);
  assert.equal(pick(null), undefined);
});

// 用户 m10124：字段下拉为空 / 标题无文件名——根因是取文件用错了服务。
// betterSidebar 的 snapshot 是它自己的底部工作台树，右侧 xlsx tab 不在其中；正确来源是
// 宿主原生右栏服务 sidebarRight.active()（返回 { contentId: 'dsh-resource://file/session/<id>/<path>' }）。
// 回归守护：pickActiveSheetFromSidebarRight 必须从 active().contentId 解析出真实表格文件。
test('pickActiveSheetFromSidebarRight：从 sidebarRight.active().contentId 解析当前表格文件', () => {
  const def = loadBundle(); const mod = { exports: {} };
  const exported = def.factory(function () { throw new Error('no external require'); }, mod.exports, mod);
  const pick = exported.pickActiveSheetFromSidebarRight;
  assert.equal(typeof pick, 'function', '必须导出 pickActiveSheetFromSidebarRight');
  // session-scoped 文件地址（相对路径）→ 解析出 sessionId 与相对 path
  const src1 = { active: function () { return { id: 'tab1', kind: 'doc', contentId: 'dsh-resource://file/session/sess-9/%E6%BC%94%E7%A4%BA_%E5%8A%A8%E4%BD%9C_swap.xlsx' }; } };
  const r1 = pick(src1);
  assert.ok(r1, '应解析出当前 xlsx');
  assert.equal(r1.sessionId, 'sess-9');
  assert.equal(r1.path, '演示_动作_swap.xlsx');
  assert.equal(r1.scope, 'session');
  // csv 命中
  const src2 = { active: function () { return { contentId: 'dsh-resource://file/session/s/外勤登记表.csv' }; } };
  assert.equal(pick(src2).path, '外勤登记表.csv');
  // 非表格文件不命中
  const src3 = { active: function () { return { contentId: 'dsh-resource://file/session/s/readme.md' }; } };
  assert.equal(pick(src3), undefined);
  // 无 active / 空
  assert.equal(pick({}), undefined);
  assert.equal(pick(null), undefined);
});
  // cursor:not-allowed），用户点了没反应。回归守护：无论命中与否，overlay 宿主都必须渲染
  // **可点开**的浮窗（data-wb-fab 的真按钮 + 面板），绝不出现 data-wb-fab-idle 死钮。
test('overlay 宿主无论是否命中文件都渲染可点浮窗（不出现 data-wb-fab-idle 死钮）', () => {
  const def = loadBundle();
  const mod = { exports: {} };
  const bundled = def.factory(function () { throw new Error('no external require'); }, mod.exports, mod);
  const renderWorkbenchPanel = bundled.renderWorkbenchPanel;
  assert.equal(typeof renderWorkbenchPanel, 'function', '必须导出 renderWorkbenchPanel');
  function collect(node, tag) {
    const out = [];
    (function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const t = n.tag || n.type;
      if (t === tag) out.push(n);
      const kids = (n.props && n.props.children) || n.children;
      if (kids != null) walk(kids);
    })(node);
    return out;
  }
  // 未命中文件（address=null）→ overlay 模式仍要出可点 FAB
  const noFile = renderWorkbenchPanel({ overlay: true, address: null, stage: 'IDLE', table: null });
  assert.equal(collect(noFile, 'data-wb-fab-idle').length, 0, '不得渲染 data-wb-fab-idle 死钮');
  // 命中文件 → 同样出可点 FAB
  const withFile = renderWorkbenchPanel({ overlay: true, address: { scope: 'session', sessionId: 's', path: 'X:/a.xlsx' }, stage: 'IDLE', table: null });
  assert.equal(collect(withFile, 'data-wb-fab-idle').length, 0, '命中文件时也不得出现死钮');
});
