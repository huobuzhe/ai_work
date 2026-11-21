'use strict';
// 票 #56 回归（真实端到端，不同于 panel-action.test.js 的纯 Host 单测）：
// 用「迷你 React 垫片 + 真实 client/index.js」把 WorkbenchPanelBody 真跑起来，
// 但 fetch 不桩死——而是把每个 /workbench-api/action 请求原样交给**真实 makeActionHandler**
// （真实 panel-session 状态机 + 真实引擎 + 真实 xlsx_bridge.py 读写）。
//
// 这样覆盖的正是此前测试的盲区：client 发的是**小写** understand/preview/confirm，
// 而引擎 switch 只认大写；纯 Host 测全用大写动作名 + fetch 桩伪装成功，漏掉了真实 lowercase 路径
// （#56 致命 bug ①）与「understand 没带输入框文字」（#56 bug ②）、swap 列名解析（bug ③）。
//
// 本测试断言：真面板「输入一句话 → 理解 → 预览 → 确认执行」全链走通，且 confirm 真正把
// 工时↔时薪两列对调写回磁盘、读回逐格核对。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { makeActionHandler, makeStateHandler } = require('../lib/panel-bridge');
const { defaultReadTable, defaultApplyTable } = require('../lib/panel-bridge');

// ---------- 迷你 React 垫片（同 new-recipe-loop.test.js，保证真实组件能跑） ----------
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

// 反复渲染 + 让出事件循环，直到渲染文本匹配 re 或超时；返回最后一棵树。
// 消除「异步 action/fetch 尚未落回 hook 就断言」的时序抖动（CI 机器快慢差异致偶发假失败）。
async function renderUntilContains(shim, body, mkProps, re, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 8000);
  let tree = null;
  while (Date.now() < deadline) {
    await waitTick(5);
    shim.beginRender(); tree = body(mkProps()); shim.finishRender();
    if (re.test(textOf(tree).join(' '))) return tree;
  }
  return tree;
}

// ---------- 真实 xlsx fixture（python openpyxl，2 列 4 行：姓名/工时/时薪）----------
function pyRead(file) {
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let lastErr = null;
  for (const bin of candidates) {
    const r = spawnSync(bin, [bridge, 'read-values', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { lastErr = r.error; continue; }
    if (r.status !== 0) { lastErr = new Error(r.stderr); continue; }
    return JSON.parse((r.stdout || '').trim());
  }
  throw lastErr || new Error('read-values 失败');
}

function makeFixture(dir) {
  const file = path.join(dir, '演示_员工工时表.xlsx');
  // 用 create 子命令建表头，再用 upload 写数据行，全部走真实 xlsx_bridge.py。
  const structure = {
    primaryKey: '姓名',
    columns: { 姓名: 'text', 部门: 'text', 工时: 'number', 时薪: 'number' },
    name: '员工工时',
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80 },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 90 },
      { 姓名: '清和', 部门: '财务', 工时: 150, 时薪: 75 },
      { 姓名: '浣溪', 部门: '运营', 工时: 168, 时薪: 85 }
    ]
  };
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const tmp = path.join(dir, 'structure.json');
  fs.writeFileSync(tmp, JSON.stringify(structure), 'utf8');
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let lastErr = null;
  for (const bin of candidates) {
    const r = spawnSync(bin, [bridge, 'create', file, tmp], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { lastErr = r.error; continue; }
    if (r.status !== 0) { lastErr = new Error(r.stderr); continue; }
    lastErr = null; break;
  }
  if (lastErr) throw lastErr;
  return file;
}

test('票 #56 真实端到端：真面板 输入→理解→预览→确认，swap 真的对调写回磁盘并读回核对', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-e2e-real-'));
  let file;
  try { file = makeFixture(dir); } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); t.skip('python/openpyxl 不可用：' + e.message); return; }

  // 真实 Host 侧：action handler 与 state handler 都接真实 readTable/applyTable（默认即真实 python 桥）。
  const actionHandler = makeActionHandler({
    readTable: defaultReadTable,
    applyTable: defaultApplyTable,
    resolveFile: (f) => f,
    // 内存 store：不污染磁盘 sidecar（loadButtons 返回 null、saveButtons 内存 true、registry 空）。
    store: require('../lib/panel-session').createSessionStore({
      loadButtons: () => null, saveButtons: () => true, loadRegistry: () => []
    })
  });

  const { shim, body } = loadBody();

  // fetch 桩：真正把请求交给真实 makeActionHandler，而不是硬编码返回。
  // 唯独 /state 轮询仍返回初始空态（面板初次渲染用；轮询会反复打，桩掉避免打真实磁盘 N 次）。
  const actionCalls = [];
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/workbench-api/action')) {
      const bodyJson = JSON.parse(init.body);
      actionCalls.push(bodyJson);
      const res = actionHandler({ method: 'POST', url: '/workbench-api/action', body: init.body });
      return { json: async () => res.body };
    }
    // /state：返回初始列（让面板拿到 columns），预览沿用最后一次 action 结果之外的占位。
    if (u.includes('/workbench-api/state')) {
      const tbl = defaultReadTable(file);
      return { json: async () => ({ file, columns: tbl.columns, rowCount: tbl.rows.length, preview: null, isDefaultDraft: false, registryButtons: [], buttons: [] }) };
    }
    return { json: async () => ({}) };
  };
  t.after(() => { shim.runCleanups(); delete global.fetch; fs.rmSync(dir, { recursive: true, force: true }); });

  const mkProps = () => ({ useTabInfo: () => ({ tab: { contentId: 'dsh-resource://file/absolute/' + file.replace(/\\/g, '/') } }) });

  // 首帧 + 让 /state 轮询拿到 columns
  shim.reset(); shim.beginRender();
  let tree = body(mkProps()); shim.finishRender();
  await waitTick(0);
  shim.beginRender(); tree = body(mkProps()); shim.finishRender();

  // 1) 输入框填「对调工时和时薪两列」
  const inputEl = findByAttr(tree, 'data-wb-input', '1');
  assert.ok(inputEl, '应有输入框');
  inputEl.props.onChange({ target: { value: '对调工时和时薪两列' } });
  shim.beginRender(); tree = body(mkProps()); shim.finishRender();

  // 2) 点「理解」——真实引擎执行，必须不再报「输入框是空的」
  let btn = findByAttr(tree, 'data-wb-action', 'understand');
  assert.ok(btn && btn.props.onClick, '应有理解按钮');
  btn.props.onClick({ preventDefault() {} });
  tree = await renderUntilContains(shim, body, mkProps, /已理解成/);
  const afterUnderstand = textOf(tree).join(' ');
  assert.doesNotMatch(afterUnderstand, /输入框是空的/, '理解不应再报「输入框是空的」（bug ②）');
  assert.doesNotMatch(afterUnderstand, /按钮库里还没有这个按钮/, '理解不应触发 RUN_BUTTON 报错（bug ①）');
  assert.match(afterUnderstand, /已理解成/, '理解后应显示「已理解成」');
  // understand 请求体必须带输入框文字（bug ②根因）
  const undCall = actionCalls.filter((c) => c.action && c.action.type === 'understand').pop();
  assert.ok(undCall, '应发出 understand action');
  assert.equal(undCall.action.text, '对调工时和时薪两列', 'understand 必须带上输入框文字');

  // 3) 点「预览」——swap 列名应从句子解析成 工时/时薪（bug ③），且预览出现影响行数
  btn = findByAttr(tree, 'data-wb-action', 'preview');
  assert.ok(btn && !btn.props.disabled, '预览按钮可用');
  btn.props.onClick({ preventDefault() {} });
  tree = await renderUntilContains(shim, body, mkProps, /影响 4 行/);
  const afterPreview = textOf(tree).join(' ');
  assert.doesNotMatch(afterPreview, /字段A 与 字段B 不能相同/, 'swap 列名应解析成真实列，不撞默认列名（bug ③）');
  assert.match(afterPreview, /影响 4 行/, '预览应显示影响 4 行');

  // 4) 点「确认执行」——真正写盘
  btn = findByAttr(tree, 'data-wb-action', 'confirm');
  assert.ok(btn && !btn.props.disabled, '确认按钮可用（PREVIEWED）');
  btn.props.onClick({ preventDefault() {} });
  tree = await renderUntilContains(shim, body, mkProps, /已写入磁盘/);
  const afterConfirm = textOf(tree).join(' ');
  assert.match(afterConfirm, /已写入磁盘/, '确认后应提示已写入磁盘');

  // 5) 读回磁盘逐格核对：工时↔时薪对调，姓名/部门不动
  const out = pyRead(file);
  const byName = {};
  out.rows.forEach((r) => { byName[r.姓名] = r; });
  assert.equal(String(byName['阿岚'].工时), '80', '阿岚 工时 160→80');
  assert.equal(String(byName['阿岚'].时薪), '160', '阿岚 时薪 80→160');
  assert.equal(String(byName['柏舟'].工时), '90', '柏舟 工时 176→90');
  assert.equal(String(byName['柏舟'].时薪), '176', '柏舟 时薪 90→176');
  assert.equal(String(byName['清和'].工时), '75', '清和 工时 150→75');
  assert.equal(String(byName['浣溪'].时薪), '168', '浣溪 时薪 85→168');
  assert.equal(String(byName['阿岚'].部门), '销售', '部门列不动');
  assert.equal(String(byName['柏舟'].姓名), '柏舟', '姓名列不动');
});
