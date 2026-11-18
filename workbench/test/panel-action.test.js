'use strict';
// 票 #47：面板内「新建配方」Host 侧测试（TDD 红→绿）。
// seismic 1：panel-session 会话状态库（纯引擎状态机，不碰文件/网络）。
// seismic 2：makeActionHandler（/workbench-api/action）——含 CONFIRM 落盘桩（applyTable 注入假实现）。
const test = require('node:test');
const assert = require('node:assert');
const { createSessionStore } = require('../lib/panel-session');
const { makeActionHandler } = require('../lib/panel-bridge');

// 一张有两列、三行的样例表（姓名/工时），swap 可作用于全部行。
const TABLE = {
  columns: ['姓名', '工时'],
  rows: [
    { 姓名: '张三', 工时: 80 },
    { 姓名: '李四', 工时: 100 },
    { 姓名: '王五', 工时: 200 }
  ]
};

test('panel-session: UNDERSTAND 一句话 → stage=UNDERSTOOD、draft.kind 正确', () => {
  const store = createSessionStore();
  const vm = store.applyAction('/f.xlsx', TABLE, { type: 'UNDERSTAND', text: '调换姓名和工时两列' });
  assert.strictEqual(vm.stage, 'UNDERSTOOD');
  assert.strictEqual(vm.draft.kind, 'swap');
  assert.strictEqual(vm.preview, null);
});

test('panel-session: UNDERSTAND 无法理解的话 → guard，stage 不变且 note 带错误', () => {
  const store = createSessionStore();
  const vm = store.applyAction('/f.xlsx', TABLE, { type: 'UNDERSTAND', text: '随便说点什么吧' });
  assert.notStrictEqual(vm.stage, 'UNDERSTOOD');
  assert.match(vm.note, /没匹配|空/);
});

test('panel-session: UNDERSTAND→PREVIEW → stage=PREVIEWED、preview 有真实 summary 与 cells', () => {
  const store = createSessionStore();
  store.applyAction('/f.xlsx', TABLE, { type: 'UNDERSTAND', text: '调换姓名和工时两列' });
  const vm = store.applyAction('/f.xlsx', TABLE, { type: 'PREVIEW' });
  assert.strictEqual(vm.stage, 'PREVIEWED');
  assert.ok(vm.preview);
  assert.strictEqual(vm.preview.invalid, false);
  assert.match(vm.preview.summary, /影响 3 行/);
  assert.ok(Array.isArray(vm.preview.cells) && vm.preview.cells.length > 0);
});

test('panel-session: 跨请求累积——第二个请求能续上第一个的 draft（同一 file key）', () => {
  const store = createSessionStore();
  store.applyAction('/f.xlsx', TABLE, { type: 'UNDERSTAND', text: '调换姓名和工时两列' });
  // 第二次请求不重新 UNDERSTAND，直接 PREVIEW，证明 draft 被持久化在 store 里。
  const vm = store.applyAction('/f.xlsx', TABLE, { type: 'PREVIEW' });
  assert.strictEqual(vm.stage, 'PREVIEWED');
});

test('panel-session: PREVIEWED→CONFIRM → stage=EXECUTED，rows 已改（内存）', () => {
  const store = createSessionStore();
  store.applyAction('/f.xlsx', TABLE, { type: 'UNDERSTAND', text: '调换姓名和工时两列' });
  store.applyAction('/f.xlsx', TABLE, { type: 'PREVIEW' });
  const vm = store.applyAction('/f.xlsx', TABLE, { type: 'CONFIRM' });
  assert.strictEqual(vm.stage, 'EXECUTED');
});

test('panel-session: EXECUTED→SOLIDIFY → stage=SOLIDIFIED，buttons 增加一个具名按钮', () => {
  const store = createSessionStore();
  store.applyAction('/f.xlsx', TABLE, { type: 'UNDERSTAND', text: '调换姓名和工时两列' });
  store.applyAction('/f.xlsx', TABLE, { type: 'PREVIEW' });
  store.applyAction('/f.xlsx', TABLE, { type: 'CONFIRM' });
  const before = store.view('/f.xlsx', TABLE).buttons.length;
  const vm = store.applyAction('/f.xlsx', TABLE, { type: 'SOLIDIFY', name: '我的一键对调' });
  assert.strictEqual(vm.stage, 'SOLIDIFIED');
  assert.strictEqual(vm.buttons.length, before + 1);
  assert.ok(vm.buttons.some((b) => b.name === '我的一键对调'));
});

// ---------- makeActionHandler（seismic 2） ----------

function makeReq(params) {
  // GET 风格：参数塞 query。
  const qs = Object.keys(params).map((k) => k + '=' + encodeURIComponent(typeof params[k] === 'string' ? params[k] : JSON.stringify(params[k]))).join('&');
  return { method: 'GET', url: '/workbench-api/action?' + qs };
}

test('makeActionHandler: 缺 file → 400', () => {
  const h = makeActionHandler({ readTable: () => TABLE });
  const r = h({ method: 'GET', url: '/workbench-api/action?action=' + encodeURIComponent('{"type":"PREVIEW"}') });
  assert.strictEqual(r.status, 400);
});

test('makeActionHandler: 缺 action → 400', () => {
  const h = makeActionHandler({ readTable: () => TABLE, resolveFile: (f) => f });
  const r = h({ method: 'GET', url: '/workbench-api/action?file=/f.xlsx' });
  assert.strictEqual(r.status, 400);
});

test('makeActionHandler: UNDERSTAND 经 handler → 200，body.stage=UNDERSTOOD', () => {
  const h = makeActionHandler({ readTable: () => TABLE, resolveFile: (f) => f });
  const r = h(makeReq({ file: '/f.xlsx', action: { type: 'UNDERSTAND', text: '调换姓名和工时两列' } }));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.stage, 'UNDERSTOOD');
  assert.strictEqual(r.body.draft.kind, 'swap');
});

test('makeActionHandler: CONFIRM 会调用 applyTable 落盘，并回 writtenOk/writtenCells', () => {
  const calls = [];
  const store = createSessionStore();
  const h = makeActionHandler({
    readTable: () => TABLE,
    resolveFile: (f) => f,
    store,
    applyTable: (file, cells) => { calls.push({ file, cells }); return { ok: true, cellsWritten: cells.length }; }
  });
  // 顺序：UNDERSTAND → PREVIEW → CONFIRM
  h(makeReq({ file: '/f.xlsx', action: { type: 'UNDERSTAND', text: '调换姓名和工时两列' } }));
  h(makeReq({ file: '/f.xlsx', action: { type: 'PREVIEW' } }));
  const r = h(makeReq({ file: '/f.xlsx', action: { type: 'CONFIRM' } }));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.stage, 'EXECUTED');
  assert.strictEqual(calls.length, 1, 'CONFIRM 应恰好写盘一次');
  assert.strictEqual(calls[0].file, '/f.xlsx');
  assert.ok(calls[0].cells.length > 0);
  assert.strictEqual(r.body.writtenOk, true);
  assert.strictEqual(r.body.writtenCells, calls[0].cells.length);
});

test('makeActionHandler: 重复 CONFIRM 不重复写盘（stage 已是 EXECUTED 则不再 applyTable）', () => {
  const calls = [];
  const store = createSessionStore();
  const h = makeActionHandler({
    readTable: () => TABLE, resolveFile: (f) => f, store,
    applyTable: (file, cells) => { calls.push(cells); return { ok: true, cellsWritten: cells.length }; }
  });
  h(makeReq({ file: '/f.xlsx', action: { type: 'UNDERSTAND', text: '调换姓名和工时两列' } }));
  h(makeReq({ file: '/f.xlsx', action: { type: 'PREVIEW' } }));
  h(makeReq({ file: '/f.xlsx', action: { type: 'CONFIRM' } }));
  h(makeReq({ file: '/f.xlsx', action: { type: 'CONFIRM' } }));
  assert.strictEqual(calls.length, 1, '只应在状态从非 EXECUTED→EXECUTED 时写一次');
});

test('makeActionHandler: applyTable 抛错 → 仍 200，但 writtenOk=false 带 writeError', () => {
  const store = createSessionStore();
  const h = makeActionHandler({
    readTable: () => TABLE, resolveFile: (f) => f, store,
    applyTable: () => { throw new Error('磁盘只读'); }
  });
  h(makeReq({ file: '/f.xlsx', action: { type: 'UNDERSTAND', text: '调换姓名和工时两列' } }));
  h(makeReq({ file: '/f.xlsx', action: { type: 'PREVIEW' } }));
  const r = h(makeReq({ file: '/f.xlsx', action: { type: 'CONFIRM' } }));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.writtenOk, false);
  assert.match(r.body.writeError, /磁盘只读/);
});

test('makeActionHandler: POST body 也能携带 action（兼容 JSON body）', () => {
  const h = makeActionHandler({ readTable: () => TABLE, resolveFile: (f) => f });
  const r = h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file: '/f.xlsx', action: { type: 'UNDERSTAND', text: '调换姓名和工时两列' } }) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.stage, 'UNDERSTOOD');
});
