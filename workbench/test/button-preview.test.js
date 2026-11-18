'use strict';
// 票 #44：按钮点击驱动引擎 → 预览卡刷新（Host 纯函数 seam，用户已确认）。
// seam：buildButtonPreview(parsed, buttonId) —— 纯函数，Host 侧：
//   给定「已解析表格数据 + 按钮库」和某个 buttonId，用引擎按该按钮的配方（kind+params）
//   buildDraft → preview，产出该按钮操作后的影响预览视图模型。不碰 python/文件系统/网络，
//   不修改任何持久状态（确认前表格不动）。client 不 require 引擎。
// 只打这一个公共 seam。预期值来自引擎自身真实算出的 cell/行数（独立于被测逻辑的来源=真实数据）。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const E = require('../lib/engine');
const H = require(path.join(__dirname, '..', 'lib', 'panel-state.js'));

// 一份真实的表格数据 + 一个真实固化出来的按钮（extract：从 外勤登记表.csv 提邮箱）
function setup() {
  const rows = [
    { 姓名: '阿岚', 工时: 160 },
    { 姓名: '柏舟', 工时: 176 },
    { 姓名: '岑溪', 工时: 96 }
  ];
  const sources = { '外勤登记表.csv': { rows: [
    { 姓名: '阿岚', 邮箱: 'alan@example.com' },
    { 姓名: '柏舟', 邮箱: 'baizhou@example.com' },
    { 姓名: '岑溪', 邮箱: 'cenxi@example.com' }
  ] } };
  // 用真实引擎造一个已固化按钮（走 QUICK→CONFIRM→SOLIDIFY，与生产同路）
  let s = E.initial({ primaryKey: '姓名', columns: ['姓名', '工时'], rows: rows, sources: sources });
  s = E.reduce(s, { type: 'QUICK', kind: 'extract' });
  s = E.reduce(s, { type: 'CONFIRM' });
  s = E.reduce(s, { type: 'SOLIDIFY', name: '补邮箱' });
  assert.equal(s.buttons.length, 1, '前置：应固化出 1 个按钮');
  return { parsed: { columns: ['姓名', '工时'], rows: rows, sources: sources, buttons: s.buttons, registryButtons: [] }, buttonId: s.buttons[0].id };
}

test('seam #44：buildButtonPreview 按按钮配方用引擎重算，产出该操作的真实影响预览', () => {
  const { parsed, buttonId } = setup();
  const vm = H.buildButtonPreview(parsed, buttonId);
  assert.ok(vm, '应产出预览视图模型');
  assert.ok(vm.preview, '应带真实 preview');
  // 该按钮是「从外勤登记表补邮箱」，影响全部 3 行（每行都能匹配到邮箱）
  assert.equal(vm.preview.affectedRows, 3, '影响行数来自引擎按按钮配方重算');
  assert.match(vm.preview.summary, /影响 3 行/);
  // 只读：不修改传入的 parsed（确认前表格不动）
  assert.equal(parsed.rows.length, 3, '源数据行数不变');
  assert.equal(parsed.rows[0]['邮箱'], undefined, '源数据未被引擎写入邮箱（只算预览、不执行）');
});

test('seam #44：buttonId 不存在时返回 null（不崩）', () => {
  const { parsed } = setup();
  assert.equal(H.buildButtonPreview(parsed, 'no-such-id'), null);
});

test('seam #44：按钮配方校验不通过时如实返回 invalid preview（带失败项，不崩）', () => {
  // 造一个 params 引用不存在列的按钮（extract 的 来源列/目标列 指向不存在的列）
  const parsed = {
    columns: ['姓名', '工时'],
    rows: [{ 姓名: '阿岚', 工时: 160 }],
    sources: {},
    buttons: [{ id: 'bx', name: '坏按钮', kind: 'extract', params: { '来源文件': '不存在.csv', '来源列': '邮箱', '目标列': '邮箱' } }],
    registryButtons: []
  };
  const vm = H.buildButtonPreview(parsed, 'bx');
  assert.ok(vm, '校验失败也要返回视图模型，不能 null');
  assert.ok(vm.preview, '应带 preview');
  assert.equal(vm.preview.invalid, true, '校验不通过 → invalid=true');
  assert.ok(Array.isArray(vm.preview.errors) && vm.preview.errors.length > 0, '带失败原因');
});

// seam C：Host 路由 handler —— 点击按钮 → Host 读表 + 引擎重算 → 回新 preview。
// 注入假 readTable，不碰真实 xlsx / python / 网络。
const B = require(path.join(__dirname, '..', 'lib', 'panel-bridge.js'));

test('seam #44C：GET /workbench-api/preview 读表+引擎重算，返回该按钮的影响预览', () => {
  const fakeReadTable = function () {
    return { columns: ['姓名', '工时'], rows: [{ 姓名: '阿岚', 工时: 160 }, { 姓名: '柏舟', 工时: 176 }], sources: {} };
  };
  const handler = B.makeButtonHandler({ readTable: fakeReadTable });
  // swap 按钮：调换 姓名/工时 两列（作用全部）→ 影响 2 行
  const button = { id: 'b1', name: '调换两列', kind: 'swap', params: { '字段A': '姓名', '字段B': '工时', scope: 'all', '条件': '' } };
  const url = '/workbench-api/preview?file=' + encodeURIComponent('C:/x/a.xlsx')
    + '&buttonId=b1&button=' + encodeURIComponent(JSON.stringify(button));
  const res = handler({ method: 'GET', url: url });
  assert.equal(res.status, 200);
  assert.equal(res.body.buttonId, 'b1');
  assert.equal(res.body.preview.affectedRows, 2, '影响行数来自引擎重算');
  assert.match(res.body.preview.summary, /影响 2 行/);
});

test('seam #44C：缺 file / button → 400；button JSON 非法 → 400；按钮 id 不匹配 → 404', () => {
  const handler = B.makeButtonHandler({ readTable: function () { return { columns: ['a'], rows: [], sources: {} }; } });
  assert.equal(handler({ method: 'GET', url: '/workbench-api/preview' }).status, 400);
  assert.equal(handler({ method: 'GET', url: '/workbench-api/preview?file=x' }).status, 400);
  assert.equal(handler({ method: 'GET', url: '/workbench-api/preview?file=x&button=%7Bbad' }).status, 400);
  const b = { id: 'b1', kind: 'swap', params: {} };
  const r404 = handler({ method: 'GET', url: '/workbench-api/preview?file=x&buttonId=b2&button=' + encodeURIComponent(JSON.stringify(b)) });
  assert.equal(r404.status, 404);
});

test('seam #44C：读表失败 → 500（不崩，如实报错）', () => {
  const handler = B.makeButtonHandler({ readTable: function () { throw new Error('读不动'); } });
  const b = { id: 'b1', kind: 'swap', params: { '字段A': 'a', '字段B': 'b' } };
  const res = handler({ method: 'GET', url: '/workbench-api/preview?file=x&button=' + encodeURIComponent(JSON.stringify(b)) });
  assert.equal(res.status, 500);
  assert.match(String(res.body.error), /读表失败/);
});
