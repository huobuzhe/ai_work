'use strict';
// 票 #47：面板「新建配方」client 侧测试（TDD 红→绿）。
// 公共 seam：renderWorkbenchPanel(hostState) 在带动作能力时，渲染输入框 + 理解/预览/确认/固化
// 四个按钮，点击/输入通过 hostState.onInput / hostState.onAction 汇报。
// 用 react-dom/server 把 client 源码当模块跑（注入本地 react/jsx-runtime）。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

// react / react-dom/server 可能在本机解析不到（无 NODE_PATH 时）——解析不到则整文件跳过，
// 与各既有渲染 seam 测试一致，避免 pre-commit 挂红。
let renderToStaticMarkup = null;
try { renderToStaticMarkup = require('react-dom/server').renderToStaticMarkup; } catch (_) { renderToStaticMarkup = null; }
const CAN_RENDER = !!renderToStaticMarkup;

function loadClient() {
  const file = path.join(__dirname, '..', 'client', 'index.js');
  const code = require('fs').readFileSync(file, 'utf8');
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const realRequire = m.require.bind(m);
  m.require = function (id) {
    if (id === 'react') return require('react');
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (id === 'react-dom') return require('react-dom');
    return realRequire(id);
  };
  m._compile(code, file);
  return m.exports;
}

const client = CAN_RENDER ? loadClient() : null;

function guard(t) {
  if (!CAN_RENDER) { t.skip('react 不可解析'); return false; }
  return true;
}

test('新建配方 UI：无动作能力时（旧调用）不渲染输入框（向后兼容）', (t) => {
  if (!guard(t)) return;
  const html = renderToStaticMarkup(client.renderWorkbenchPanel({ preview: null }));
  assert.doesNotMatch(html, /data-wb-input/);
});

test('新建配方 UI：带 onAction 时渲染输入框与四个动作按钮', (t) => {
  if (!guard(t)) return;
  const html = renderToStaticMarkup(client.renderWorkbenchPanel({ preview: null, inputText: '', onInput: () => {}, onAction: () => {} }));
  assert.match(html, /data-wb-input/);
  assert.match(html, /data-wb-action="understand"/);
  assert.match(html, /data-wb-action="preview"/);
  assert.match(html, /data-wb-action="confirm"/);
  assert.match(html, /data-wb-action="solidify"/);
  assert.match(html, />理解</);
  assert.match(html, />预览</);
  assert.match(html, />确认执行</);
  assert.match(html, />固化为按钮</);
});

test('新建配方 UI：输入框反映 inputText 值', (t) => {
  if (!guard(t)) return;
  const html = renderToStaticMarkup(client.renderWorkbenchPanel({ preview: null, inputText: '调换姓名和工时', onInput: () => {}, onAction: () => {} }));
  assert.match(html, /value="调换姓名和工时"/);
});

test('新建配方 UI：stage=UNDERSTOOD 时确认按钮禁用（未预览不能执行）', (t) => {
  if (!guard(t)) return;
  const html = renderToStaticMarkup(client.renderWorkbenchPanel({ preview: null, stage: 'UNDERSTOOD', inputText: 'x', onInput: () => {}, onAction: () => {} }));
  const m = html.match(/data-wb-action="confirm"[^>]*/);
  assert.ok(m, '应有 confirm 按钮');
  assert.match(m[0], /disabled/);
});

test('新建配方 UI：stage=PREVIEWED 且 preview 合法时确认按钮可用', (t) => {
  if (!guard(t)) return;
  const preview = { invalid: false, summary: '影响 3 行 / 共 3 行', affectedRows: 3, totalRows: 3, cells: [{ row: 1, col: 'A', before: 'a', after: 'b' }] };
  const html = renderToStaticMarkup(client.renderWorkbenchPanel({ preview, stage: 'PREVIEWED', inputText: 'x', onInput: () => {}, onAction: () => {} }));
  const m = html.match(/data-wb-action="confirm"[^>]*/);
  assert.ok(m);
  assert.doesNotMatch(m[0], /disabled/);
});

test('新建配方 UI：stage=EXECUTED 时固化按钮可用，其余阶段禁用', (t) => {
  if (!guard(t)) return;
  const previewOk = { invalid: false, summary: 's', affectedRows: 1, totalRows: 1, cells: [] };
  const htmlEx = renderToStaticMarkup(client.renderWorkbenchPanel({ preview: previewOk, stage: 'EXECUTED', inputText: 'x', onInput: () => {}, onAction: () => {} }));
  const mEx = htmlEx.match(/data-wb-action="solidify"[^>]*/);
  assert.ok(mEx); assert.doesNotMatch(mEx[0], /disabled/);
  const htmlPv = renderToStaticMarkup(client.renderWorkbenchPanel({ preview: previewOk, stage: 'PREVIEWED', inputText: 'x', onInput: () => {}, onAction: () => {} }));
  const mPv = htmlPv.match(/data-wb-action="solidify"[^>]*/);
  assert.ok(mPv); assert.match(mPv[0], /disabled/);
});

test('新建配方 UI：note 显示在面板里', (t) => {
  if (!guard(t)) return;
  const html = renderToStaticMarkup(client.renderWorkbenchPanel({ preview: null, stage: 'IDLE', inputText: '', note: '已理解成「调换两段字段」', onInput: () => {}, onAction: () => {} }));
  assert.match(html, /已理解成/);
});
