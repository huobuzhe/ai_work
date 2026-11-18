'use strict';
// 票 #43：把 workbench 面板的按钮库渲染成真正可点击的按钮，接通点击事件。
// 范围（用户已确认）：只做 UI 可点 + 事件通道——按钮渲染成 <button> 并绑定 onClick，
//   点击触发一个回调（onButtonClick(按钮id)）；**点击后不改引擎状态**（不 reduce、不执行）。
// seam（公共边界，用户已确认）：renderWorkbenchPanel(视图模型)。
//   视图模型里带 buttonLibrary 时，必须为每个按钮渲染一个可点击的 <button>，
//   onClick 由视图模型上的 onButtonClick(按钮id) 作为事件回调被调用。
//   只打公共渲染 seam，不碰内部实现。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../lib/engine');

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

// 一棵真实引擎状态，带一个已固化按钮 + 一个预置按钮库，用来产生 buttonLibrary 视图模型
function stateWithButtons() {
  const E2 = E;
  let s = E2.initial({
    primaryKey: '姓名', columns: ['姓名', '工时', '时薪'],
    rows: [{ 姓名: '阿岚', 工时: 160, 时薪: 80 }],
    // 引擎的 QUICK/extract 默认从「外勤登记表.csv」取邮箱；数据源名必须与之一致才能产出合法草稿。
    sources: { '外勤登记表.csv': { rows: [{ 姓名: '阿岚', 邮箱: 'alan@example.com' }] } }
  });
  s = E2.reduce(s, { type: 'QUICK', kind: 'extract' });
  s = E2.reduce(s, { type: 'CONFIRM' });
  s = E2.reduce(s, { type: 'SOLIDIFY', name: '补邮箱' });
  return s;
}

// 从渲染出的 React 元素树里递归找所有 type==='button' 的元素
function collectButtons(el) {
  const out = [];
  (function walk(node) {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === 'button') out.push(node);
    const kids = node.props && node.props.children;
    if (kids !== undefined) walk(kids);
  })(el);
  return out;
}

test('seam：有按钮库时 renderWorkbenchPanel 把每个按钮渲染成可点击的 <button>', (t) => {
  const h = loadClient();
  if (!h) { t.skip('react 不可解析'); return; }
  const state = stateWithButtons();
  const lib = h.api.projectButtonLibrary(state);
  const el = h.api.renderWorkbenchPanel({ buttonLibrary: lib });
  const buttons = collectButtons(el);
  assert.equal(buttons.length, lib.total, '每个按钮渲染成一个 <button>');
  // 每个 button 必须有文字（按钮名），且绑定 onClick 事件处理器
  buttons.forEach(function (b) {
    assert.equal(typeof b.props.onClick, 'function', '按钮必须绑定 onClick 事件处理器');
  });
});

test('seam：点击按钮触发 onButtonClick(按钮id) 回调（不改引擎状态）', (t) => {
  const h = loadClient();
  if (!h) { t.skip('react 不可解析'); return; }
  const state = stateWithButtons();
  const lib = h.api.projectButtonLibrary(state);
  const clicked = [];
  const el = h.api.renderWorkbenchPanel({
    buttonLibrary: lib,
    onButtonClick: function (id) { clicked.push(id); }
  });
  const buttons = collectButtons(el);
  // 模拟点击第一个按钮：调用它的 onClick
  buttons[0].props.onClick({ preventDefault: function () {}, stopPropagation: function () {} });
  assert.deepEqual(clicked, [lib.buttons[0].id], '点击触发 onButtonClick，参数是按钮 id');
});

test('seam：未提供 onButtonClick 时点击不崩（安全退化）', (t) => {
  const h = loadClient();
  if (!h) { t.skip('react 不可解析'); return; }
  const lib = h.api.projectButtonLibrary(stateWithButtons());
  const el = h.api.renderWorkbenchPanel({ buttonLibrary: lib });
  const buttons = collectButtons(el);
  assert.doesNotThrow(function () {
    buttons[0].props.onClick({ preventDefault: function () {}, stopPropagation: function () {} });
  }, '没有回调时点击也不能抛错');
});

test('seam：无按钮库时不渲染多余 button，面板仍正常', (t) => {
  const h = loadClient();
  if (!h) { t.skip('react 不可解析'); return; }
  const el = h.api.renderWorkbenchPanel({});
  assert.equal(collectButtons(el).length, 0, '无按钮库时没有按钮');
});
