'use strict';
// 票 #42：smoke 护栏——固化「slot body 必须返回带 children 的 React 元素」。
// 背景：本轮真机崩溃 React error #31 的根因就是某处把 body 返回成了普通对象
// （{preview, buttonLibrary}），React 无法把对象当 child 渲染 → slot entry 崩溃 → 拖垮 web boot。
// 这条护栏通过**公共 seam**（registerWorkbenchPanel 注册出来的 body 函数）产出元素、
// 再交给 react-dom/server 渲染，断言：①返回的是合法 React 元素（对象且有 $$typeof）；
// ②渲染成字符串后含面板标题（说明 children 真的带出来了，不是空壳）。
// 只打公共边界：用假 ctx 捕获 register 出的 body，不碰任何内部实现。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 解析 react / react/jsx-runtime / react-dom/server —— 优先 workbench 本地 node_modules，回退 dsh 运行时
function tryResolve(name) {
  const bases = [
    path.join(__dirname, '..', 'node_modules'),
    'F:/deepseek_haeness_inload/resources/app.asar/dsh/node_modules',
  ];
  for (const b of bases) {
    try { return require.resolve(name, { paths: [b] }); } catch (_) {}
  }
  return null;
}

// 用本地 react 注入，把 client/index.js 当模块加载（拿 registerWorkbenchPanel）
function loadClient() {
  const reactPath = tryResolve('react');
  const jsxPath = tryResolve('react/jsx-runtime');
  if (!reactPath || !jsxPath) return null;
  const React = require(reactPath);
  const rt = require(jsxPath);
  const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.js'), 'utf8');
  const m = { exports: {} };
  const req = (spec) => (spec === 'react/jsx-runtime') ? rt : (spec === 'react' ? React : require(spec));
  const api = new Function('module', 'exports', 'require', src + '\nreturn module.exports;')(m, m.exports, req);
  return { api, React };
}

// 用假 ctx 捕获 registerWorkbenchPanel 注册出来的 pane tab body
function captureBody(api) {
  let captured = null;
  const fakeCtx = {
    inject: (deps, cb) => { if (Array.isArray(deps) && deps[0] === 'sidebarRightTabs') cb({ get: () => undefined }); },
    effect: (fn) => { const r = fn(); return () => { if (typeof r === 'function') r(); }; },
    slots: {
      inject: (_seat, cb) => cb(),
      // 真实签名：register(options, Body) —— body 是**第二个参数**，不是 options.body
      register: (options, Body) => { captured = { options, body: Body }; return () => {}; }
    }
  };
  api.registerWorkbenchPanel(fakeCtx);
  return captured;
}

test('body 护栏：WorkbenchPanelBody 返回的是合法 React 元素（非普通对象）', (t) => {
  const h = loadClient();
  if (!h) { t.skip('react 不可解析'); return; }
  const spec = captureBody(h.api);
  assert.ok(spec && typeof spec.body === 'function', '应注册出 body 函数');
  // 不给 useTabInfo（模拟无数据）：body 仍必须返回合法 React 元素而不是普通对象/字符串
  const el = spec.body({});
  assert.equal(typeof el, 'object', 'body 返回值必须是对象（React 元素），不能是普通数据对象被当 child');
  assert.ok(el && el.$$typeof, '返回值必须带 $$typeof（React 元素标记）；普通对象没有它 → 会触发 #31');
});

test('body 护栏：body 渲染成字符串后含面板标题（children 真的带出来，不是空壳）', (t) => {
  const h = loadClient();
  if (!h) { t.skip('react 不可解析'); return; }
  const serverPath = tryResolve('react-dom/server');
  if (!serverPath) { t.skip('react-dom/server 不可解析'); return; }
  const Server = require(serverPath);
  const spec = captureBody(h.api);
  const el = spec.body({});
  const html = Server.renderToStaticMarkup(el);
  assert.match(html, /表格工作台/, '渲染结果必须含面板标题（证明 children 带出来了，不是空壳元素）');
});
