'use strict';
// 面板层流水线批处理闭环（用户目标步骤 5「多动作流水线批处理」）。
// 用真实 client/index.js 组件（迷你 React 垫片）+ 真实 makeActionHandler（真实 panel-session +
// 真实引擎 + 真实 xlsx_bridge.py），模拟用户在面板里：逐个配置动作 → 「加入流水线」→「预览流水线」
// →「确认执行」，最后读回磁盘核对两步都落盘（先算应发列，再对标色）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { makeActionHandler, defaultReadTable, defaultApplyTable } = require('../lib/panel-bridge');
const { createSessionStore } = require('../lib/panel-session');

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

function pyBridgeBin() { return process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']; }
function pyRead(file) {
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  let lastErr = null;
  for (const bin of pyBridgeBin()) {
    const r = spawnSync(bin, [bridge, 'read-values', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { lastErr = r.error; continue; }
    if (r.status !== 0) { lastErr = new Error(r.stderr); continue; }
    return JSON.parse((r.stdout || '').trim());
  }
  throw lastErr || new Error('read-values 失败');
}
function makeFixture(dir, name) {
  const file = path.join(dir, name + '.xlsx');
  const structure = {
    primaryKey: '姓名',
    columns: { 姓名: 'text', 部门: 'text', 工时: 'number', 时薪: 'number', 备注: 'text' },
    name: name,
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80, 备注: '' },
      { 姓名: '柏舟', 部门: '技术', 工时: 120, 时薪: 90, 备注: '' },
      { 姓名: '清和', 部门: '财务', 工时: 150, 时薪: 75, 备注: '' }
    ]
  };
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const tmp = path.join(dir, 'structure_' + name + '.json');
  fs.writeFileSync(tmp, JSON.stringify(structure), 'utf8');
  let lastErr = null;
  for (const bin of pyBridgeBin()) {
    const r = spawnSync(bin, [bridge, 'create', file, tmp], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { lastErr = r.error; continue; }
    if (r.status !== 0) { lastErr = new Error(r.stderr); continue; }
    lastErr = null; break;
  }
  if (lastErr) throw lastErr;
  return file;
}
function hasPython() {
  for (const bin of pyBridgeBin()) {
    const r = spawnSync(bin, ['-c', 'import openpyxl; print(1)'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}

test('面板流水线：两步（function 算应发 + highlight 标色）加入队列→预览→确认执行→磁盘两处落盘', async (t) => {
  if (!hasPython()) { t.skip('python/openpyxl 不可用'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pipe-'));
  let file;
  try { file = makeFixture(dir, '演示_pipeline'); }
  catch (e) { fs.rmSync(dir, { recursive: true, force: true }); t.skip('建 fixture 失败：' + e.message); return; }

  const actionHandler = makeActionHandler({
    readTable: defaultReadTable, applyTable: defaultApplyTable, resolveFile: (f) => f,
    store: createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] })
  });

  const { shim, body } = loadBody();
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/workbench-api/action')) {
      const res = actionHandler({ method: 'POST', url: '/workbench-api/action', body: init.body });
      return { json: async () => res.body };
    }
    if (u.includes('/workbench-api/state')) {
      const tbl = defaultReadTable(file);
      return { json: async () => ({ file, columns: tbl.columns, rowCount: tbl.rows.length, preview: null, stage: 'IDLE', table: { columns: tbl.columns, rows: tbl.rows }, isDefaultDraft: false, registryButtons: [], buttons: [] }) };
    }
    return { json: async () => ({}) };
  };
  t.after(() => { shim.runCleanups(); delete global.fetch; fs.rmSync(dir, { recursive: true, force: true }); });

  const mkProps = () => ({ useTabInfo: () => ({ tab: { contentId: 'dsh-resource://file/absolute/' + file.replace(/\\/g, '/') } }) });
  const render = () => { shim.beginRender(); const tr = body(mkProps()); shim.finishRender(); return tr; };

  let tree = render();
  for (let i = 0; i < 40 && !findByAttr(tree, 'data-workbench-orig-table', '1'); i++) { await waitTick(10); tree = render(); }
  // 展开浮窗
  const fab = findByAttr(tree, 'data-wb-fab', '1'); fab.props.onClick({ preventDefault() {} });
  tree = render();
  // 面板应有流水线区块
  assert.ok(findByAttr(tree, 'data-wb-pipeline', '1'), '面板应有流水线区块 data-wb-pipeline');

  // 步骤1：配置 function（工时*时薪 → 应发），加入流水线
  findByAttr(tree, 'data-wb-quick', 'function').props.onClick({ preventDefault() {} });
  await waitTick(5); tree = render();
  findByAttr(tree, 'data-wb-field', '表达式').props.onChange({ preventDefault() {}, target: { value: '工时 * 时薪' } });
  findByAttr(tree, 'data-wb-field', '输出列').props.onChange({ preventDefault() {}, target: { value: '应发' } });
  await waitTick(5); tree = render();
  findByAttr(tree, 'data-wb-pipeline-add', '1').props.onClick({ preventDefault() {} });
  await waitTick(5); tree = render();

  // 步骤2：配置 highlight（应发 > 10000 → green），加入流水线
  findByAttr(tree, 'data-wb-quick', 'highlight').props.onClick({ preventDefault() {} });
  await waitTick(5); tree = render();
  findByAttr(tree, 'data-wb-field', '目标列').props.onChange({ preventDefault() {}, target: { value: '应发' } });
  findByAttr(tree, 'data-wb-field', '条件').props.onChange({ preventDefault() {}, target: { value: '应发 > 10000' } });
  findByAttr(tree, 'data-wb-field', '底色').props.onChange({ preventDefault() {}, target: { value: 'green' } });
  await waitTick(5); tree = render();
  findByAttr(tree, 'data-wb-pipeline-add', '1').props.onClick({ preventDefault() {} });
  await waitTick(5); tree = render();

  // 队列应有 2 步
  assert.equal(findByAttr(tree, 'data-wb-pipe-remove', '0') && true, true, '队列应有第 1 步');
  assert.equal(findByAttr(tree, 'data-wb-pipe-remove', '1') && true, true, '队列应有第 2 步');

  // 预览流水线
  findByAttr(tree, 'data-wb-pipeline-preview', '1').props.onClick({ preventDefault() {} });
  for (let i = 0; i < 40 && !/影响 \d+ 行/.test(textOf(tree).join(' ')); i++) { await waitTick(10); tree = render(); }
  const pvText = textOf(tree).join(' ');
  assert.match(pvText, /流水线共 2 步/, '预览应提示流水线共 2 步');
  assert.match(pvText, /影响 3 行/, '两步都应命中 3 行');

  // 确认执行
  const confirmBtn = findByAttr(tree, 'data-wb-action', 'confirm');
  assert.ok(confirmBtn && !confirmBtn.props.disabled, '确认按钮应可用');
  confirmBtn.props.onClick({ preventDefault() {} });
  for (let i = 0; i < 60 && !/已写入磁盘/.test(textOf(tree).join(' ')); i++) { await waitTick(10); tree = render(); }
  assert.match(textOf(tree).join(' '), /已写入磁盘/, '确认后应提示已写入磁盘');

  // 磁盘核对：应发列落盘 + 标色填充
  const got = pyRead(file);
  const rows = got.rows || [];
  const a = rows.find((r) => r['姓名'] === '阿岚');
  const bo = rows.find((r) => r['姓名'] === '柏舟');
  assert.equal(Number(a['应发']), 12800, '阿岚应发应为 12800');
  assert.equal(Number(bo['应发']), 10800, '柏舟应发应为 10800');
  if (Array.isArray(got.fills)) {
    assert.ok(got.fills.length >= 3, '应有 3 格以上标色填充');
  }
});
