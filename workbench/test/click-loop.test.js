'use strict';
// 票 #44 回归：client 侧点击闭环 —— 点击按钮 → applyButtonPreview 请求 Host → 覆盖预览层 →
// 面板重新渲染成「操作后的新影响」。这是端到端把「点击 → 重算 → 刷新」这条链锁住；
// panel-data-pipeline 只测了 Host 纯函数与路由，本文件补 client 组件侧的真实接线。
//
// 手法：用一个极小的 React 垫片（useState 跨渲染保持、useEffect 只在首次跑一次、
// 支持 jsx-runtime 的 jsx/jsxs），把 WorkbenchPanelBody 真组件跑起来；fetch 用内存桩。
// 不引入 jsdom，也能验证：首帧显示真实 preview → 点按钮 → 桩 fetch 回新 preview →
// 二次渲染显示「影响 N 行」变为操作后的值。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ---------- 迷你 React 垫片 ----------
function makeReactShim() {
  let instance = null; // 单组件实例的 hook 存储
  function resetInstance() { instance = { hooks: [], idx: 0, effects: [], mounted: false, cleanups: [] }; }
  function beginRender() { if (!instance) resetInstance(); instance.idx = 0; }
  function finishRender() {
    // 只跑一次 effect（模拟首次挂载）；后续渲染不再重跑（够验证点击闭环）
    if (!instance.mounted) {
      instance.mounted = true;
      for (const e of instance.effects) { try { const c = e(); if (typeof c === 'function') instance.cleanups.push(c); } catch (_) {} }
    }
  }
  function useState(init) {
    const i = instance.idx++;
    if (!(i in instance.hooks)) instance.hooks[i] = (typeof init === 'function' ? init() : init);
    const set = (v) => { instance.hooks[i] = (typeof v === 'function' ? v(instance.hooks[i]) : v); };
    return [instance.hooks[i], set];
  }
  function useEffect(fn) { instance.effects.push(fn); }
  function jsx(type, props, key) { return { $$typeof: Symbol.for('react.element'), type, key: key == null ? null : key, props: props || {} }; }
  function jsxs(type, props, key) { return jsx(type, props, key); }
  // 卸载：跑所有 effect cleanup（清掉 usePanelData 的真实 setInterval 轮询定时器与各类订阅，避免进程挂住）
  function runCleanups() { if (instance && Array.isArray(instance.cleanups)) { for (const c of instance.cleanups) { try { c(); } catch (_) {} } instance.cleanups = []; } }
  return {
    React: { useState, useEffect, createElement: jsx },
    jsx, jsxs,
    reset: () => { runCleanups(); instance = null; },
    beginRender, finishRender, runCleanups,
    getInstance: () => instance
  };
}

function isElement(n) { return n && typeof n === 'object' && n.$$typeof === Symbol.for('react.element'); }

// 在元素树里找 type==='button' 且 props['data-workbench-button']===id 的元素，返回其 onClick
function findButtonOnClick(node, id) {
  if (!node) return null;
  if (Array.isArray(node)) { for (const c of node) { const r = findButtonOnClick(c, id); if (r) return r; } return null; }
  if (isElement(node)) {
    if (node.type === 'button' && node.props && node.props['data-workbench-button'] === id) return node.props.onClick;
    return findButtonOnClick(node.props && node.props.children, id);
  }
  return null;
}

// 把元素树收集成纯文本，用于断言「影响 N 行」是否出现
function textOf(node, acc) {
  acc = acc || [];
  if (node == null || node === false) return acc;
  if (typeof node === 'string' || typeof node === 'number') { acc.push(String(node)); return acc; }
  if (Array.isArray(node)) { node.forEach((c) => textOf(c, acc)); return acc; }
  if (isElement(node)) textOf(node.props && node.props.children, acc);
  return acc;
}

// ---------- 加载 client，注入 React 垫片，捕获 body 组件 ----------
function loadBody() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.js'), 'utf8');
  const shim = makeReactShim();
  const req = (spec) => {
    if (spec === 'react') return shim.React;
    if (spec === 'react/jsx-runtime') return { jsx: shim.jsx, jsxs: shim.jsxs };
    return require(spec);
  };
  const m = { exports: {} };
  const api = new Function('module', 'exports', 'require', 'window', src + '\nreturn module.exports;')(m, m.exports, req, undefined);
  let body = null;
  const fakeCtx = {
    inject: (deps, cb) => { if (deps[0] === 'sidebarRightTabs') cb({ get: () => undefined }); },
    effect: (fn) => { fn(); return () => {}; },
    slots: { inject: (_s, cb) => cb(), register: (options, Body) => { body = Body; return () => {}; } }
  };
  api.registerWorkbenchPanel(fakeCtx);
  return { shim, api, body };
}

const waitTick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

test('票 #44 回归：点按钮 → 请求 Host 重算 → 面板刷新成操作后的新影响行数', async (t) => {
  const { shim, body } = loadBody();
  assert.equal(typeof body, 'function', '应能拿到 WorkbenchPanelBody 组件');

  // fetch 桩：/state 首次回 3 行表 + 一个按钮；/preview 回「操作后」新 preview（影响 1 行）。
  const calls = [];
  const stateResp = {
    columns: ['姓名', '工时', '职位'],
    rowCount: 3,
    preview: { affectedRows: 3, totalRows: 3, summary: '影响 3 行 / 共 3 行', scope: 'all' },
    isDefaultDraft: true,
    registryButtons: [],
    buttons: [{ id: 'b1', name: '只调换命中行', kind: 'swap', params: { 字段A: '姓名', 字段B: '工时', scope: 'match', 条件: '工时 > 100' } }]
  };
  const previewResp = { buttonId: 'b1', preview: { affectedRows: 1, totalRows: 3, summary: '影响 1 行 / 共 3 行', scope: 'match' } };
  global.fetch = async (url) => {
    calls.push(String(url));
    const payload = String(url).includes('/workbench-api/preview') ? previewResp : stateResp;
    return { json: async () => payload };
  };
  t.after(() => { shim.runCleanups(); delete global.fetch; });

  const mkProps = () => ({ useTabInfo: () => ({ tab: { contentId: 'dsh-resource://file/session/s1/a.xlsx' } }) });
  // 首帧：effect 触发 fetch（异步）；首帧 slot.data 尚为 null
  shim.reset();
  shim.beginRender();
  let tree = body(mkProps());
  shim.finishRender();
  // 等 /state 的 fetch Promise 落地后重渲染，拿到真实数据与按钮
  await waitTick(0);
  shim.beginRender();
  tree = body(mkProps());
  shim.finishRender();
  let text = textOf(tree).join(' ');
  assert.match(text, /影响 3 行 \/ 共 3 行/, '首帧显示 Host 回的真实影响行数');

  // 找到按钮 b1，触发点击
  const onClick = findButtonOnClick(tree, 'b1');
  assert.equal(typeof onClick, 'function', '按钮应绑定 onClick');
  onClick({ preventDefault() {} });
  await waitTick(0);

  // 二次渲染（同一实例，模拟 React 因 setState 重渲染）：应刷新成「影响 1 行 / 共 3 行」
  shim.beginRender();
  tree = body(mkProps());
  shim.finishRender();
  text = textOf(tree).join(' ');
  assert.match(text, /影响 1 行 \/ 共 3 行/, '点击后预览卡刷新为操作后的新影响行数');
  assert.doesNotMatch(text, /影响 3 行 \/ 共 3 行/, '不再是旧的影响行数');

  const previewCalls = calls.filter((c) => c.includes('/workbench-api/preview'));
  assert.equal(previewCalls.length, 1, '点击应请求一次 /workbench-api/preview');
  assert.match(previewCalls[0], /buttonId=b1/);
  assert.match(previewCalls[0], /button=/);
});

test('票 #44 回归：Host 回失败（无 preview 带 error）→ 面板渲染错误框，不崩', async (t) => {
  const { shim, body } = loadBody();
  const stateResp = {
    columns: ['姓名', '工时'], rowCount: 2,
    preview: { affectedRows: 2, totalRows: 2, summary: '影响 2 行 / 共 2 行', scope: 'all' },
    isDefaultDraft: false, registryButtons: [],
    buttons: [{ id: 'bx', name: '坏按钮', kind: 'extract', params: {} }]
  };
  const failResp = { error: '校验不通过：缺少来源文件' };
  global.fetch = async (url) => {
    const payload = String(url).includes('/preview') ? failResp : stateResp;
    return { json: async () => payload };
  };
  t.after(() => { shim.runCleanups(); delete global.fetch; });

  const mkProps = () => ({ useTabInfo: () => ({ tab: { contentId: 'dsh-resource://file/session/s1/a.xlsx' } }) });
  shim.reset();
  shim.beginRender();
  let tree = body(mkProps());
  shim.finishRender();
  await waitTick(0);
  shim.beginRender();
  tree = body(mkProps());
  shim.finishRender();
  const onClick = findButtonOnClick(tree, 'bx');
  assert.equal(typeof onClick, 'function', '按钮应绑定 onClick');
  onClick({ preventDefault() {} });
  await waitTick(0);
  shim.beginRender();
  tree = body(mkProps());
  shim.finishRender();
  const text = textOf(tree).join(' ');
  assert.match(text, /校验不通过/, '应如实显示 Host 回的失败原因');
  assert.match(text, /表格工作台/, '面板仍在（没崩）');
});
