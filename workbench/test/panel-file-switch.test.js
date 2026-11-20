// 回归测试（用户 m10481）：「打开新表格，浮窗还显示旧表格」。
// 根因：usePanelData 里「点击-preview 覆盖层」override 未随文件切换清空，
// 面板会用上一个文件的 override 预览，而原生表已是新文件 → 两边对不上。
// 修法：key（file|sessionId）变化时 setOverride(null)。
//
// 该 shim 支持「同实例多次渲染 + 依赖数组比较」，用于模拟文件切换。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// —— 支持依赖追踪的迷你 React ——
function makeReactShim() {
  let inst = null;
  function reset() { inst = { hooks: [], idx: 0, effects: [], mounted: false, cleanups: [] }; }
  function beginRender() { if (!inst) reset(); inst.idx = 0; inst.pendingEffects = []; }
  function useState(init) {
    const i = inst.idx++;
    if (!(i in inst.hooks)) inst.hooks[i] = (typeof init === 'function' ? init() : init);
    const set = (v) => { inst.hooks[i] = (typeof v === 'function' ? v(inst.hooks[i]) : v); };
    return [inst.hooks[i], set];
  }
  function depsChanged(a, b) {
    if (!a || !b) return true;
    if (a.length !== b.length) return true;
    for (let k = 0; k < a.length; k++) if (!Object.is(a[k], b[k])) return true;
    return false;
  }
  function useEffect(fn, deps) {
    const i = inst.idx++;
    const prev = inst.hooks[i];
    const changed = !prev || depsChanged(prev.deps, deps);
    if (changed) inst.pendingEffects.push({ i, fn, deps });
  }
  function finishRender() {
    for (const eff of inst.pendingEffects) {
      const prev = inst.hooks[eff.i];
      if (prev && typeof prev.cleanup === 'function') { try { prev.cleanup(); } catch (_) {} }
      let cleanup = null;
      try { cleanup = eff.fn(); } catch (_) {}
      inst.hooks[eff.i] = { deps: eff.deps, cleanup: typeof cleanup === 'function' ? cleanup : null };
    }
    inst.mounted = true;
  }
  const jsx = (type, props, key) => ({ $$typeof: Symbol.for('react.element'), type, key: key == null ? null : key, props: props || {} });
  return {
    React: { useState, useEffect, createElement: jsx },
    jsx, jsxs: jsx,
    reset, beginRender, finishRender,
  };
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
    slots: { inject: (_s, cb) => cb(), register: (options, B) => { body = B; return () => {}; } }
  };
  api.registerWorkbenchPanel(fakeCtx);
  return { shim, api, body };
}

// fetch 桩：/state 返回带 preview 的数据（模拟「旧文件已点过预览」）。
function installFetch(routes) {
  const calls = [];
  global.fetch = (url) => {
    calls.push(url);
    for (const [re, make] of routes) {
      if (re.test(url)) return Promise.resolve({ json: () => Promise.resolve(make(url)) });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  };
  return calls;
}

function renderOnce(shim, body, props) {
  shim.beginRender();
  const tree = body(props);
  shim.finishRender();
  return tree;
}

test('文件切换（address 变）时清掉上一个文件的 preview 覆盖层，面板不显示旧表', async () => {
  const realSetInterval = global.setInterval;
  // 桩掉轮询定时器，避免 hook 里的 setInterval 让进程挂住。
  global.setInterval = () => 0;
  try {
  const { shim, body } = loadBody();

  // 文件A：/state 返回「旧」预览（有应发列）。
  const A = path.join(__dirname, '__switchA.xlsx');
  const B = path.join(__dirname, '__switchB.xlsx');
  installFetch([
    [/__switchA\.xlsx/, () => ({ stage: 'PREVIEWED', table: { columns: ['姓名', '工时'], rows: [['阿岚', 160]] }, preview: { columns: ['姓名', '工时', '应发'], rows: [['阿岚', 160, 12800]] }, buttons: [], registryButtons: [] })],
    [/__switchB\.xlsx/, () => ({ stage: 'IDLE', table: { columns: ['姓名', '部门', '工时', '时薪', '备注'], rows: [['柏舟', '技术', 176, 90, '']] }, preview: null, buttons: [], registryButtons: [] })],
  ]);

  // 渲染文件A并让 /state 拉取落地。
  renderOnce(shim, body, { address: { scope: 'session', sessionId: 's1', path: A }, overlay: true });
  await new Promise((r) => setTimeout(r, 10));

  // 切到文件B → key 变了。第一遍渲染跑 key-effect（清 override/slot），第二遍看到清理后的结果。
  renderOnce(shim, body, { address: { scope: 'session', sessionId: 's1', path: B }, overlay: true });
  await new Promise((r) => setTimeout(r, 10));
  const treeB = renderOnce(shim, body, { address: { scope: 'session', sessionId: 's1', path: B }, overlay: true });
  await new Promise((r) => setTimeout(r, 10));
  const text = textOf(treeB).join('');
  assert.ok(!/应发/.test(text), '切到新文件后不应残留上一个文件的「应发」列预览；实际文本=' + text.slice(0, 200));
  } finally {
    global.setInterval = realSetInterval;
  }
});

// 回归测试（用户 m10658）：切到新文件后，工作台必须回到「最开始的默认状态」——
// 上一轮「确认执行」动作产生的绿字提示（actionState.note / writtenOk / clickedName）与旧表
// 都必须清掉，面板应显示新文件的 IDLE 原表。usePanelData 只清了 override/slot，
// actionState/inputText/activeKind 等是 panel body 自己的 state，必须另有 keyed 重置。
// 关键：actionState 只由 runAction 的动作响应写入（POST /workbench-api/action），
// 不是 /state 轮询写入。故本测试必须真正「点确认执行」触发动作响应，让 actionState 带上
// 绿字，再切文件断言它被清掉——否则测试是假绿（删掉修复也照样通过）。
test('切文件后清掉上一个文件的动作状态（绿字提示/已写入磁盘），回到默认态显示新表', async () => {
  const realSetInterval = global.setInterval;
  global.setInterval = () => 0;
  try {
    const { shim, body } = loadBody();
    const A = path.join(__dirname, '__sw2A.xlsx');
    const B = path.join(__dirname, '__sw2B.xlsx');
    const A_STATE = { stage: 'PREVIEWED', table: { columns: ['姓名', '工时', '时薪'], rows: [['阿岚', 160, 80]] }, preview: { columns: ['姓名', '工时', '时薪'], rows: [['阿岚', 80, 160]] }, buttons: [], registryButtons: [] };
    // 文件A的「确认执行」动作响应：writtenOk + 绿字 note + EXECUTED。这会写进 actionState。
    const A_ACTION = { stage: 'EXECUTED', writtenOk: true, writtenCells: 8, note: '✓ 已按「确认执行（已写入磁盘 8 格）」重算预览', table: { columns: ['姓名', '工时', '时薪'], rows: [['阿岚', 80, 160]] }, preview: { columns: ['姓名', '工时', '时薪'], rows: [['阿岚', 80, 160]] }, buttons: [], registryButtons: [] };
    const B_STATE = { stage: 'IDLE', table: { columns: ['姓名', '部门', '工时', '时薪', '备注'], rows: [['柏舟', '技术', 176, 90, '']] }, preview: null, buttons: [], registryButtons: [] };
    installFetch([
      [/\/workbench-api\/action/, () => A_ACTION],
      [/\/workbench-api\/state\?[^ ]*__sw2A\.xlsx/, () => A_STATE],
      [/\/workbench-api\/state\?[^ ]*__sw2B\.xlsx/, () => B_STATE],
      [/\/workbench-api\/templates/, () => ({ templates: [] })],
    ]);
    const propsA = { address: { scope: 'session', sessionId: 's1', path: A }, overlay: true };
    const propsB = { address: { scope: 'session', sessionId: 's1', path: B }, overlay: true };
    // 渲染文件A并让 /state 落地。
    renderOnce(shim, body, propsA);
    await new Promise((r) => setTimeout(r, 10));
    let treeA = renderOnce(shim, body, propsA);
    await new Promise((r) => setTimeout(r, 10));
    // 真正点「确认执行」→ runAction('confirm') → 动作响应写 actionState（绿字）。
    const confirmBtn = findByAttr(treeA, 'data-wb-action', 'confirm');
    assert.ok(confirmBtn, '应找到「确认执行」按钮');
    confirmBtn.props.onClick({ preventDefault() {} });
    await new Promise((r) => setTimeout(r, 10));
    treeA = renderOnce(shim, body, propsA);
    await new Promise((r) => setTimeout(r, 10));
    const textA = textOf(treeA).join('');
    assert.ok(/已写入磁盘/.test(textA), '文件A点确认执行后应显示「已写入磁盘」绿字（证明 actionState 已被填充）；实际=' + textA.slice(0, 300));
    // 切到文件B（渲两遍让 address.path-keyed effect 先跑）。
    renderOnce(shim, body, propsB);
    await new Promise((r) => setTimeout(r, 10));
    const treeB = renderOnce(shim, body, propsB);
    await new Promise((r) => setTimeout(r, 10));
    const textB = textOf(treeB).join('');
    assert.ok(!/已写入磁盘/.test(textB), '切到新文件后不应残留「已写入磁盘」绿字；实际=' + textB.slice(0, 300));
    assert.ok(!/重算预览/.test(textB), '切到新文件后不应残留「重算预览」提示；实际=' + textB.slice(0, 300));
    assert.ok(textB.indexOf('柏舟') >= 0 || textB.indexOf('姓名') >= 0, '切到新文件后应显示新文件的表；实际=' + textB.slice(0, 300));
  } finally {
    global.setInterval = realSetInterval;
  }
});
