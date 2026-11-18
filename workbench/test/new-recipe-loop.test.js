'use strict';
// 票 #47 回归：client 侧「面板内新建配方」闭环——输入一句话 → 理解 → 预览 → 确认执行 → 固化为按钮。
// 用与 click-loop.test.js 相同的迷你 React 垫片，把真实 WorkbenchPanelBody 跑起来；
// fetch 桩模拟 Host /workbench-api/action 的返回，验证每一步组件状态推进正确、按钮最终入库。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function makeReactShim() {
  let instance = null;
  function resetInstance() { instance = { hooks: [], idx: 0, effects: [], mounted: false, cleanups: [] }; }
  function beginRender() { if (!instance) resetInstance(); instance.idx = 0; }
  function finishRender() {
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
  function runCleanups() { if (instance && Array.isArray(instance.cleanups)) { for (const c of instance.cleanups) { try { c(); } catch (_) {} } instance.cleanups = []; } }
  return { React: { useState, useEffect, createElement: jsx }, jsx, jsxs, reset: () => { runCleanups(); instance = null; }, beginRender, finishRender, runCleanups };
}

function isElement(n) { return n && typeof n === 'object' && n.$$typeof === Symbol.for('react.element'); }
function findByAttr(node, attr, val) {
  if (!node) return null;
  if (Array.isArray(node)) { for (const c of node) { const r = findByAttr(c, attr, val); if (r) return r; } return null; }
  if (isElement(node)) {
    if (node.props && node.props[attr] === val) return node;
    return findByAttr(node.props && node.props.children, attr, val);
  }
  return null;
}
function textOf(node, acc) {
  acc = acc || [];
  if (node == null || node === false) return acc;
  if (typeof node === 'string' || typeof node === 'number') { acc.push(String(node)); return acc; }
  if (Array.isArray(node)) { node.forEach((c) => textOf(c, acc)); return acc; }
  if (isElement(node)) textOf(node.props && node.props.children, acc);
  return acc;
}

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

test('票 #47 回归：输入→理解→预览→确认→固化，按钮最终入库', async (t) => {
  const { shim, body } = loadBody();
  const calls = [];
  const baseState = { columns: ['姓名', '工时'], rowCount: 3, preview: null, isDefaultDraft: false, registryButtons: [], buttons: [], stage: 'IDLE', input: '' };
  let progress = 'IDLE';
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/workbench-api/action')) {
      const bodyJson = JSON.parse(init.body);
      const type = bodyJson.action.type;
      if (type === 'understand') {
        progress = 'UNDERSTOOD';
        return { json: async () => Object.assign({}, baseState, { stage: 'UNDERSTOOD', input: bodyJson.action.text, note: '已理解成「调换两段字段」' }) };
      }
      if (type === 'preview') {
        progress = 'PREVIEWED';
        return { json: async () => Object.assign({}, baseState, { stage: 'PREVIEWED', preview: { invalid: false, summary: '影响 3 行 / 共 3 行', affectedRows: 3, totalRows: 3, cells: [{ row: 1, col: '姓名', before: '张三', after: '80' }] }, note: '预览就绪' }) };
      }
      if (type === 'confirm') {
        progress = 'EXECUTED';
        return { json: async () => Object.assign({}, baseState, { stage: 'EXECUTED', preview: { invalid: false, summary: '影响 3 行 / 共 3 行', affectedRows: 3, totalRows: 3, cells: [] }, note: '执行完成', writtenOk: true, writtenCells: 3 }) };
      }
      if (type === 'solidify') {
        progress = 'SOLIDIFIED';
        return { json: async () => Object.assign({}, baseState, { stage: 'SOLIDIFIED', preview: null, buttons: [{ id: 'b1', name: bodyJson.action.name || '我的配方', kind: 'swap', params: {} }], note: '已固化为按钮' }) };
      }
      return { json: async () => baseState };
    }
    // /state 轮询
    return { json: async () => baseState };
  };
  t.after(() => { shim.runCleanups(); delete global.fetch; });

  const mkProps = () => ({ useTabInfo: () => ({ tab: { contentId: 'dsh-resource://file/session/s1/a.xlsx' } }) });
  // 首帧
  shim.reset(); shim.beginRender();
  let tree = body(mkProps()); shim.finishRender();
  await waitTick(0);
  shim.beginRender(); tree = body(mkProps()); shim.finishRender();

  // 输入框存在，填入文字并触发 onChange
  const inputEl = findByAttr(tree, 'data-wb-input', '1');
  assert.ok(inputEl, '应有输入框');
  inputEl.props.onChange({ target: { value: '调换姓名和工时两列' } });
  // 重新渲染拿新输入值
  shim.beginRender(); tree = body(mkProps()); shim.finishRender();

  // 点「理解」
  let btn = findByAttr(tree, 'data-wb-action', 'understand');
  assert.ok(btn && btn.props.onClick, '应有理解按钮');
  btn.props.onClick({ preventDefault() {} });
  await waitTick(0);
  shim.beginRender(); tree = body(mkProps()); shim.finishRender();
  assert.match(textOf(tree).join(' '), /已理解成/, '理解后显示 note');
  assert.equal(progress, 'UNDERSTOOD');

  // 点「预览」
  btn = findByAttr(tree, 'data-wb-action', 'preview');
  assert.ok(btn && !btn.props.disabled, '预览按钮可用');
  btn.props.onClick({ preventDefault() {} });
  await waitTick(0);
  shim.beginRender(); tree = body(mkProps()); shim.finishRender();
  assert.match(textOf(tree).join(' '), /影响 3 行 \/ 共 3 行/, '预览显示影响行数');
  assert.equal(progress, 'PREVIEWED');

  // 点「确认执行」
  btn = findByAttr(tree, 'data-wb-action', 'confirm');
  assert.ok(btn && !btn.props.disabled, '确认按钮可用（PREVIEWED 合法）');
  btn.props.onClick({ preventDefault() {} });
  await waitTick(0);
  shim.beginRender(); tree = body(mkProps()); shim.finishRender();
  assert.equal(progress, 'EXECUTED');

  // 点「固化为按钮」
  btn = findByAttr(tree, 'data-wb-action', 'solidify');
  assert.ok(btn && !btn.props.disabled, '固化按钮可用（EXECUTED）');
  btn.props.onClick({ preventDefault() {} });
  await waitTick(0);
  shim.beginRender(); tree = body(mkProps()); shim.finishRender();
  assert.equal(progress, 'SOLIDIFIED');

  // 最终按钮库里出现新按钮（data-workbench-button）
  const libBtn = findByAttr(tree, 'data-workbench-button', 'b1');
  assert.ok(libBtn, '固化后按钮库应出现新按钮 b1');
  assert.match(textOf(tree).join(' '), /我的配方|调换姓名和工时两列/, '按钮名来自输入框');

  // 确认每个动作都真的发了 POST /workbench-api/action
  const actionCalls = calls.filter((c) => c.url.includes('/workbench-api/action'));
  assert.equal(actionCalls.length, 4, '应发 4 次 action（understand/preview/confirm/solidify）');
  assert.ok(actionCalls.every((c) => c.init.method === 'POST'), '都应是 POST');
});
