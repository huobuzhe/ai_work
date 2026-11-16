'use strict';
// 票 #15：按钮固化与一键重跑 + 按钮库生命周期。
// 全部经公开 seam：engine.reduce / engine.initial / engine.exportButtons 与 client 的投影函数。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../lib/engine');
const C = require('../client/index.js');

function mkState() {
  return E.initial({
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪', '备注'],
    rows: [
      { 姓名: '阿岚', 部门: '技术', 工时: 160, 时薪: 80, 备注: 'n1' },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80, 备注: 'n2' },
      { 姓名: '岑溪', 部门: '运营', 工时: 96, 时薪: 60, 备注: 'n3' },
      { 姓名: '丁野', 部门: '运营', 工时: 144, 时薪: 60, 备注: 'n4' },
      { 姓名: '尔芙', 部门: '人事', 工时: 88, 时薪: 70, 备注: 'n5' }
    ],
    sources: { '外勤登记表.csv': { rows: [
      { 姓名: '阿岚', 邮箱: 'alan@example.com' }, { 姓名: '柏舟', 邮箱: 'baizhou@example.com' },
      { 姓名: '岑溪', 邮箱: 'cenxi@example.com' }, { 姓名: '丁野', 邮箱: 'dingye@example.com' },
      { 姓名: '尔芙', 邮箱: 'erfu@example.com' }
    ] } }
  });
}
function executedExtract(s) {
  s = E.reduce(s, { type: 'QUICK', kind: 'extract' });
  s = E.reduce(s, { type: 'CONFIRM' });
  return s;
}

// AC1 -----------------------------------------------------------------------
test('AC1 执行后的配方可固化为命名、带参数的按钮并存入按钮库', () => {
  let s = executedExtract(mkState());
  assert.equal(s.stage, 'EXECUTED');
  const draftParams = Object.assign({}, s.draft.params);
  s = E.reduce(s, { type: 'SOLIDIFY', name: '补邮箱' });
  assert.equal(s.stage, 'SOLIDIFIED');
  assert.equal(s.buttons.length, 1);
  const b = s.buttons[0];
  assert.equal(b.name, '补邮箱');
  assert.equal(b.kind, 'extract');
  assert.ok(b.id && typeof b.id === 'string');
  assert.deepEqual(b.params, draftParams, '按钮带参数、参数来自执行后的配方');
  assert.ok(Array.isArray(b.steps) && b.steps.length > 0, '按钮带声明式步骤');
  assert.equal(typeof b.medium, 'string');
});

test('AC1 未执行过不能固化（guard）', () => {
  const s = E.reduce(mkState(), { type: 'SOLIDIFY', name: 'x' });
  assert.equal(s.buttons.length, 0);
  assert.match(s.note, /拦住了/);
});

// AC2 生命周期 --------------------------------------------------------------
test('AC2 按钮库支持重命名：name 变、id 与其余字段不变', () => {
  let s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  const id = s.buttons[0].id, kind = s.buttons[0].kind;
  s = E.reduce(s, { type: 'RENAME_BUTTON', id, name: '补邮箱 v2' });
  assert.equal(s.buttons[0].name, '补邮箱 v2');
  assert.equal(s.buttons[0].id, id);
  assert.equal(s.buttons[0].kind, kind);
});

test('AC2 按钮库支持改参数：params 合并、steps 随参数联动重算', () => {
  let s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  const id = s.buttons[0].id;
  s = E.reduce(s, { type: 'SET_BUTTON_PARAMS', id, params: { scope: 'match', '条件': '工时 > 150' } });
  assert.equal(s.buttons[0].params.scope, 'match');
  assert.equal(s.buttons[0].params['条件'], '工时 > 150');
  assert.match(s.buttons[0].steps[0], /作用范围/);
  assert.match(s.buttons[0].steps[0], /工时 > 150/, 'steps 随新参数重算');
});

test('AC2 按钮库支持删除：删掉指定按钮、其余保留', () => {
  let s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  s = E.reduce(executedExtract(s), { type: 'SOLIDIFY', name: '第二个' });
  assert.equal(s.buttons.length, 2);
  const id = s.buttons[0].id;
  s = E.reduce(s, { type: 'DELETE_BUTTON', id });
  assert.equal(s.buttons.length, 1);
  assert.notEqual(s.buttons[0].id, id);
});

test('AC2 id 单调不复用：删除中间按钮后新建不撞 id（修复 length+1 bug）', () => {
  let s = mkState();
  s = E.reduce(executedExtract(s), { type: 'SOLIDIFY', name: 'a' });
  s = E.reduce(executedExtract(s), { type: 'SOLIDIFY', name: 'b' });
  s = E.reduce(executedExtract(s), { type: 'SOLIDIFY', name: 'c' });
  assert.deepEqual(s.buttons.map(b => b.id), ['b1', 'b2', 'b3']);
  s = E.reduce(s, { type: 'DELETE_BUTTON', id: 'b2' });
  s = E.reduce(executedExtract(s), { type: 'SOLIDIFY', name: 'd' });
  assert.deepEqual(s.buttons.map(b => b.id), ['b1', 'b3', 'b4'], '新 id 不与既有 b3 冲突');
});

test('AC2 Host 权威源：initial(data.buttons) 水合 + exportButtons 导出声明式副本', () => {
  const seed = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '来自 Host' });
  const buttons = seed.buttons;
  const hydrated = E.initial({ buttons });
  assert.equal(hydrated.buttons.length, 1);
  assert.equal(hydrated.buttons[0].name, '来自 Host');
  const exported = E.exportButtons(hydrated);
  assert.deepEqual(exported, buttons, '导出与库内容一致');
  assert.notEqual(exported, buttons, '导出是副本、不是内部引用');
  assert.doesNotThrow(() => JSON.stringify(exported), '按钮库可 JSON 序列化（声明式、无可执行代码）');
  assert.ok(exported.every(b => !Object.values(b).some(v => typeof v === 'function')), '不含函数');
});

// AC3 一键重跑 --------------------------------------------------------------
test('AC3 一键重跑：参数未改直接执行、更新运行态上次影响行数', () => {
  let s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  assert.equal(s.buttons[0].lastAffectedRows, 5, '固化时记录上次影响行数');
  assert.equal(s.buttons[0].emptyRun, false);
  s = E.reduce(s, { type: 'RUN_BUTTON', id: 'b1' });
  assert.equal(s.stage, 'EXECUTED');
  assert.equal(s.buttons[0].lastAffectedRows, 5, '重跑后更新运行态');
  assert.equal(s.rows[0]['邮箱'], 'alan@example.com');
});

test('AC3 一键重跑：改参数退回预览确认、不直接执行', () => {
  let s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  const before = s.rows.map(r => r['备注']).join('|');
  s = E.reduce(s, { type: 'RUN_BUTTON', id: 'b1', params: { scope: 'match', '条件': '工时 > 150' } });
  assert.equal(s.stage, 'PREVIEWED', '改参数 → 退回预览');
  assert.match(s.note, /退回/);
  assert.equal(s.rows.map(r => r['备注']).join('|'), before, '退回时表格未被改动');
  // 确认后走同一执行管线
  s = E.reduce(s, { type: 'CONFIRM' });
  assert.equal(s.stage, 'EXECUTED');
});

test('AC3 零命中也能固化为按钮并带空跑标记，重跑重新预览', () => {
  let s = mkState();
  s = E.reduce(s, { type: 'QUICK', kind: 'conditional', params: {
    '目标列': '备注', '动作': '增加', '值': 'x', scope: 'match', '条件': '工时 > 9999'
  } });
  s = E.reduce(s, { type: 'CONFIRM' });
  s = E.reduce(s, { type: 'SOLIDIFY', name: '空跑标记' });
  assert.equal(s.buttons[0].emptyRun, true, '空跑标记');
  assert.equal(s.buttons[0].lastAffectedRows, 0);
  const rerun = E.reduce(s, { type: 'RUN_BUTTON', id: s.buttons[0].id });
  assert.match(rerun.note, /影响 0 行|空跑|0 行/, '重跑按当时数据重新预览、保留空跑提示');
});

// AC4 面板呈现 --------------------------------------------------------------
test('AC4 projectButtonLibrary 输出按钮库视图模型，供面板统一呈现', () => {
  const s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  assert.equal(typeof C.projectButtonLibrary, 'function', '必须导出按钮库投影函数');
  const lib = C.projectButtonLibrary(s);
  assert.equal(lib.total, 1);
  assert.equal(lib.buttons.length, 1);
  const vb = lib.buttons[0];
  assert.deepEqual(
    { id: vb.id, name: vb.name, kind: vb.kind, label: vb.label, emptyRun: vb.emptyRun, lastAffectedRows: vb.lastAffectedRows },
    { id: 'b1', name: '补邮箱', kind: 'extract', label: '提取字段', emptyRun: false, lastAffectedRows: 5 }
  );
  assert.equal(C.projectButtonLibrary(E.initial({})).total, 0, '空按钮库返回空列表');
});

function loadBundle() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'client', 'client.js'), 'utf8');
  let captured = null;
  const sandbox = { window: { __ModuleLoader__: { load: function (def) { captured = def; } } }, module: { exports: {} }, exports: {} };
  vm.runInNewContext(code, sandbox, { filename: 'client.js' });
  return captured;
}

test('AC4 面板 body 把按钮库一并投影（所有按钮统一在面板呈现）', () => {
  const def = loadBundle();
  const mod = { exports: {} };
  const exported = def.factory(function () { throw new Error('no external require'); }, mod.exports, mod);
  const calls = { tabs: [], slots: [] };
  const nativeCtx = { effect: function (fn) { fn(); }, sidebarRightTabs: { register: function (spec) { calls.tabs.push(spec); } } };
  const ctx = { inject: function (names, fn) { fn(nativeCtx); }, slots: { register: function (spec, body) { calls.slots.push({ spec, body }); } } };
  exported.registerWorkbenchPanel(ctx);
  const s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  const vmodel = calls.slots[0].body(s);
  assert.ok(vmodel.buttonLibrary, 'body 返回对象须含 buttonLibrary');
  assert.equal(vmodel.buttonLibrary.total, 1);
  assert.equal(vmodel.buttonLibrary.buttons[0].name, '补邮箱');
});

// AC5 边界 ------------------------------------------------------------------
test('AC5 按钮不是云端原生按钮投影：不含 provider / cloudPlatform 字段', () => {
  const s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  const b = s.buttons[0];
  assert.equal(b.provider, undefined);
  assert.equal(b.cloudPlatform, undefined);
});

// 两轴 review 修复的回归测试 -------------------------------------------------
test('MEDIUM(两轴) SET_BUTTON_PARAMS 拒绝白名单外参数：非法参数不写进按钮库', () => {
  let s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  const before = JSON.stringify(s.buttons);
  s = E.reduce(s, { type: 'SET_BUTTON_PARAMS', id: 'b1', params: { 凭空造的参数: 'x' } });
  assert.match(s.note, /没通过封闭校验|未保存/, '变更边界拒绝');
  assert.equal(JSON.stringify(s.buttons), before, '按钮库未被改动（非法参数未持久化）');
});

test('MEDIUM(两轴) SET_BUTTON_PARAMS 拒绝非法条件（AND/OR 不在第一版闭包内）', () => {
  let s = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  s = E.reduce(s, { type: 'SET_BUTTON_PARAMS', id: 'b1', params: { scope: 'match', '条件': '工时 > 8 AND 部门 = 技术' } });
  assert.match(s.note, /没通过封闭校验|未保存/);
  assert.equal(s.buttons[0].params.scope, 'all', '非法条件未被保存');
});

test('LOW(Standards) nextButtonId 边界：空库 / 非数字 id / 缺口 id 都不撞现存 id', () => {
  assert.equal(E.nextButtonId([]), 'b1', '空库');
  assert.equal(E.nextButtonId([{ id: 'foo' }]), 'b1', '非数字 id 不干扰');
  assert.equal(E.nextButtonId([{ id: 'b1' }, { id: 'b3' }]), 'b4', '缺口取 max+1');
});

test('LOW(Standards) cloneButton 顶层副本：改 params/steps 容器不回写源（当前模型值为字符串）', () => {
  const seed = E.reduce(executedExtract(mkState()), { type: 'SOLIDIFY', name: '补邮箱' });
  const hydrated = E.initial({ buttons: seed.buttons });
  hydrated.buttons[0].params['写到'] = '改动';
  hydrated.buttons[0].steps.push('多一步');
  assert.equal(seed.buttons[0].params['写到'], '邮箱', 'params 容器是副本');
  assert.equal(seed.buttons[0].steps.length, 5, 'steps 数组是副本');
});
