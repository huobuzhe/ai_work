'use strict';
// 票 #49：固化按钮持久化——用户「新加按钮」后重启不该丢。
// seam：createSessionStore({loadButtons, saveButtons}) 注入内存实现，验证：
//   ① SOLIDIFY 后调用 saveButtons 存下按钮；
//   ② 新建 store（模拟重启）时 loadButtons 返回上次按钮 → baseState 水合出同样按钮；
//   ③ RENAME/DELETE 也会落盘；
//   ④ 默认（无注入）loadButtons 对不存在 sidecar 安全返回 null、不抛错。
const test = require('node:test');
const assert = require('node:assert');
const { createSessionStore } = require('../lib/panel-session');

const TABLE = { columns: ['姓名', '工时', '职位'], rows: [{ '姓名': 'a', '工时': 80, '职位': '人' }, { '姓名': 'b', '工时': 100, '职位': '人' }] };

function memStore() {
  const disk = Object.create(null); // file -> buttons[]
  const loads = [];
  const saves = [];
  const opts = {
    loadButtons: function (f) { loads.push(f); return disk[f] ? JSON.parse(JSON.stringify(disk[f])) : null; },
    saveButtons: function (f, btns) { saves.push(f); disk[f] = JSON.parse(JSON.stringify(btns)); return true; }
  };
  return { disk: disk, loads: loads, saves: saves, opts: opts };
}

function solidifySwap(store, file) {
  store.applyAction(file, TABLE, { type: 'QUICK', kind: 'swap', params: { 字段A: '姓名', 字段B: '工时', scope: 'all' } });
  store.applyAction(file, TABLE, { type: 'CONFIRM' });
  return store.applyAction(file, TABLE, { type: 'SOLIDIFY', name: '一键对调' });
}

test('SOLIDIFY 后按钮被持久化（saveButtons 被调用且内容含新按钮）', () => {
  const m = memStore();
  const store = createSessionStore(m.opts);
  const file = 'C:\\tmp\\p1.xlsx';
  const vm = solidifySwap(store, file);
  assert.strictEqual(vm.buttons.length, 1);
  assert.ok(m.saves.indexOf(file) !== -1, 'SOLIDIFY 应触发 saveButtons');
  assert.strictEqual(m.disk[file].length, 1);
  assert.strictEqual(m.disk[file][0].name, '一键对调');
});

test('重启（新 store）时从 loadButtons 水合出上次固化的按钮', () => {
  const m = memStore();
  const file = 'C:\\tmp\\p2.xlsx';
  const store1 = createSessionStore(m.opts);
  solidifySwap(store1, file);
  // 模拟重启：新 store，共享同一 disk
  const store2 = createSessionStore(m.opts);
  const vm2 = store2.view(file, TABLE);
  assert.strictEqual(vm2.buttons.length, 1, '重启后按钮应仍在');
  assert.strictEqual(vm2.buttons[0].name, '一键对调');
});

test('RENAME_BUTTON / DELETE_BUTTON 也会落盘', () => {
  const m = memStore();
  const file = 'C:\\tmp\\p3.xlsx';
  const store = createSessionStore(m.opts);
  const vm = solidifySwap(store, file);
  const id = vm.buttons[0].id;
  m.saves.length = 0;
  store.applyAction(file, TABLE, { type: 'RENAME_BUTTON', id: id, name: '改名后' });
  assert.ok(m.saves.length >= 1);
  assert.strictEqual(m.disk[file][0].name, '改名后');
  m.saves.length = 0;
  store.applyAction(file, TABLE, { type: 'DELETE_BUTTON', id: id });
  assert.ok(m.saves.length >= 1);
  assert.strictEqual(m.disk[file].length, 0);
});

test('默认 loadButtons：文件不存在时安全返回 null、不抛错', () => {
  const { defaultLoadButtons } = require('../lib/panel-session');
  const r = defaultLoadButtons('C:\\definitely\\not\\exist\\x.xlsx');
  assert.strictEqual(r, null);
});

test('预置按钮（registryButtons）不进 sidecar，只持久化固化按钮', () => {
  const m = memStore();
  const file = 'C:\\tmp\\p5.xlsx';
  const store = createSessionStore(m.opts);
  solidifySwap(store, file);
  // sidecar 里只有 buttons（固化），不含 registryButtons
  assert.strictEqual(m.disk[file].length, 1);
  assert.strictEqual(m.disk[file][0].name, '一键对调');
});
