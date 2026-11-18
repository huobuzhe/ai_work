'use strict';
// 票 #52：仓内预置按钮（registry/*.json）应出现在面板按钮库（预置 + 固化统一入口）。
// 之前 buildPanelState / createSessionStore 的 registryButtons 恒为 []，3 个预置按钮
//（补邮箱 / 换部门备注 / 按姓名去重）从未真正出现在面板——#16 的 host seed 契约没接线。
// 本票把预置按钮在 Host 侧水合进 registryButtons，面板 projectButtonLibrary 会合并两类来源。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require(path.join(__dirname, '..', 'lib', 'panel-state.js'));
const PS = require(path.join(__dirname, '..', 'lib', 'panel-session.js'));

function parsed() {
  return {
    columns: ['姓名', '部门', '工时', '时薪'],
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80 },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80 }
    ]
  };
}

test('#52 defaultLoadRegistry 能加载仓内 3 个预置按钮', () => {
  const presets = PS.defaultLoadRegistry();
  assert.ok(Array.isArray(presets), '应返回数组');
  assert.ok(presets.length >= 3, '至少 3 个预置按钮，实际 ' + presets.length);
  // 每项是完整声明式按钮（不可执行代码）
  for (const b of presets) {
    assert.equal(b.source, 'preset', '预置按钮 source=preset');
    assert.equal(typeof b.name, 'string');
    assert.ok(b.id && b.id[0] === 'p', '预置按钮 id 以 p 开头');
    assert.equal(typeof b.kind, 'string');
    assert.ok(b.params && typeof b.params === 'object');
  }
});

test('#52 defaultLoadRegistry 目录不存在时安全返回空数组', () => {
  const r = PS.defaultLoadRegistry('F:/ai_work/__no_such_dir__');
  assert.deepEqual(r, []);
});

test('#52 session store 的 registryButtons 水合了预置按钮', () => {
  const store = PS.createSessionStore();
  const vm = store.view('F:/x/t.xlsx', parsed());
  assert.ok(Array.isArray(vm.registryButtons), 'registryButtons 应是数组');
  assert.ok(vm.registryButtons.length >= 3, '预置按钮应出现在 registryButtons，实际 ' + vm.registryButtons.length);
  assert.ok(vm.registryButtons.every(function (b) { return b.source === 'preset'; }));
});

test('#52 buildPanelState 透出 registryButtons（供 projectButtonLibrary 合并）', () => {
  const p = parsed();
  // 模拟宿主已把预置水合进 parsed.registryButtons（host seed 契约）
  const presets = PS.defaultLoadRegistry();
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: null, registryButtons: presets });
  assert.ok(Array.isArray(vm.registryButtons), 'registryButtons 应是数组');
  assert.equal(vm.registryButtons.length, presets.length, 'registryButtons 原样透出');
});

test('#52 预置与固化按钮可共存且可区分来源', () => {
  const p = parsed();
  const presets = PS.defaultLoadRegistry();
  const userBtn = { id: 'b1', name: '我的按钮', kind: 'swap', source: 'user', params: { 字段A: '工时', 字段B: '时薪', scope: 'all', 条件: '' } };
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: null, buttons: [userBtn], registryButtons: presets });
  assert.ok(vm.buttons.some(function (b) { return b.source === 'user' && b.id === 'b1'; }), '固化按钮保留');
  assert.ok(vm.registryButtons.some(function (b) { return b.source === 'preset'; }), '预置按钮也存在');
});
