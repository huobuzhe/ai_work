'use strict';
// 票 #48：按钮管理（运行 / 重命名 / 删除）+ 一键运行真正落盘。
// 两条 seam：
//   A) client renderWorkbenchPanel：带 onButtonAction 时，每个按钮旁渲「▶运行/重命名/删除」控件；
//      点击经 onButtonAction(op, id) 汇报；无 onButtonAction 时保持纯点击（向后兼容）。
//   C) Host makeActionHandler：RUN_BUTTON（参数未改→一步到 EXECUTED）也要把 cells 写回磁盘（此前漏）。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const { makeActionHandler } = require('../lib/panel-bridge');

// ---- seam A：client 渲染（react 不可解析则跳过渲染测试）----
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

function libState() {
  return {
    preview: null,
    buttonLibrary: { total: 1, buttons: [{ id: 'b1', name: '一键对调', kind: 'swap' }] },
    onButtonClick: function () {},
    onButtonAction: function () {},
    onAction: function () {}
  };
}

test('按钮管理 UI：无 onButtonAction 时不渲染管理控件（向后兼容，仅纯点击按钮）', (t) => {
  if (!CAN_RENDER) { t.skip('react 不可解析'); return; }
  const html = renderToStaticMarkup(client.renderWorkbenchPanel({
    preview: null,
    buttonLibrary: { total: 1, buttons: [{ id: 'b1', name: '一键对调', kind: 'swap' }] },
    onButtonClick: function () {}
  }));
  assert.match(html, /data-workbench-button="b1"/);
  assert.doesNotMatch(html, /data-wb-btn-run/);
  assert.doesNotMatch(html, /data-wb-btn-rename/);
  assert.doesNotMatch(html, /data-wb-btn-delete/);
});

test('按钮管理 UI：有 onButtonAction 时每个按钮旁渲染 运行/重命名/删除 控件', (t) => {
  if (!CAN_RENDER) { t.skip('react 不可解析'); return; }
  const html = renderToStaticMarkup(client.renderWorkbenchPanel(libState()));
  assert.match(html, /data-wb-btn-run="b1"/);
  assert.match(html, /data-wb-btn-rename="b1"/);
  assert.match(html, /data-wb-btn-delete="b1"/);
  assert.match(html, /▶运行/);
  assert.match(html, /重命名/);
  assert.match(html, /删除/);
});

// ---- seam C：RUN_BUTTON 写回磁盘 ----
function makeDeps(overrides) {
  const writes = [];
  const deps = Object.assign({
    readTable: function () { return { columns: ['姓名', '工时', '职位'], rows: [{ '姓名': 'a', '工时': 80, '职位': '人' }, { '姓名': 'b', '工时': 100, '职位': '人' }] }; },
    resolveFile: function (f) { return f; },
    applyTable: function (file, cells) { writes.push({ file: file, cells: cells }); return { ok: true, cellsWritten: cells.length }; }
  }, overrides || {});
  return { deps: deps, writes: writes };
}

test('RUN_BUTTON 参数未改：一步到 EXECUTED 并真正写回磁盘（票 #48 AC）', () => {
  const { deps, writes } = makeDeps();
  const h = makeActionHandler(deps);
  // 先造一个已固化的 swap 按钮：QUICK→CONFIRM→SOLIDIFY
  h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'f.xlsx', action: { type: 'QUICK', kind: 'swap', params: { 字段A: '姓名', 字段B: '工时', scope: 'all' } } }) });
  h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'f.xlsx', action: { type: 'CONFIRM' } }) });
  const solid = h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'f.xlsx', action: { type: 'SOLIDIFY', name: '一键对调' } }) });
  assert.strictEqual(solid.status, 200);
  const btn = solid.body.buttons[0];
  assert.ok(btn && btn.id, '应已固化出按钮');
  writes.length = 0; // 清掉 CONFIRM 那次写盘
  const run = h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'f.xlsx', action: { type: 'RUN_BUTTON', id: btn.id } }) });
  assert.strictEqual(run.status, 200);
  assert.strictEqual(run.body.stage, 'EXECUTED');
  assert.strictEqual(run.body.writtenOk, true, 'RUN_BUTTON 应写回磁盘');
  assert.strictEqual(writes.length, 1, '应恰好写盘一次');
  assert.ok(writes[0].cells.length > 0);
});

test('RENAME_BUTTON：重命名后 buttons 名字更新，不写盘', () => {
  const { deps, writes } = makeDeps();
  const h = makeActionHandler(deps);
  h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'r.xlsx', action: { type: 'QUICK', kind: 'swap', params: { 字段A: '姓名', 字段B: '工时', scope: 'all' } } }) });
  h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'r.xlsx', action: { type: 'CONFIRM' } }) });
  const solid = h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'r.xlsx', action: { type: 'SOLIDIFY', name: '旧名' } }) });
  const btn = solid.body.buttons[0];
  writes.length = 0;
  const ren = h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'r.xlsx', action: { type: 'RENAME_BUTTON', id: btn.id, name: '新名' } }) });
  assert.strictEqual(ren.status, 200);
  const renamed = ren.body.buttons.filter(function (b) { return b.id === btn.id; })[0];
  assert.strictEqual(renamed.name, '新名');
  assert.strictEqual(writes.length, 0, '重命名不应写盘');
});

test('DELETE_BUTTON：删除后 buttons 不含该 id，不写盘', () => {
  const { deps, writes } = makeDeps();
  const h = makeActionHandler(deps);
  h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'd.xlsx', action: { type: 'QUICK', kind: 'swap', params: { 字段A: '姓名', 字段B: '工时', scope: 'all' } } }) });
  h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'd.xlsx', action: { type: 'CONFIRM' } }) });
  const solid = h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'd.xlsx', action: { type: 'SOLIDIFY', name: '待删' } }) });
  const btn = solid.body.buttons[0];
  writes.length = 0;
  const del = h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: 'd.xlsx', action: { type: 'DELETE_BUTTON', id: btn.id } }) });
  assert.strictEqual(del.status, 200);
  assert.strictEqual(del.body.buttons.filter(function (b) { return b.id === btn.id; }).length, 0, '按钮应已删除');
  assert.strictEqual(writes.length, 0, '删除不应写盘');
});
