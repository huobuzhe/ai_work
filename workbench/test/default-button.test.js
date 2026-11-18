'use strict';
// 票 #45：把自动派生的默认配方做成可点按钮（新表也能走通点击闭环）。
// 之前：默认配方只显示为提示文字、不是按钮；新表 buttons=[]、registryButtons=[]，
// 面板没有可点按钮 → #44 点击闭环在新表上走不通。
// 本票：buildPanelState 在派生出默认配方时，把它作为一个 source='default' 的按钮
// 放进返回的 buttons 里；client projectButtonLibrary 会渲染成可点 <button>；
// 点击走既有 /workbench-api/preview 通道，buildButtonPreview 能按该按钮重算。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const E = require('../lib/engine');
const H = require(path.join(__dirname, '..', 'lib', 'panel-state.js'));

function parsed() {
  return {
    columns: ['姓名', '部门', '工时', '时薪'],
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80 },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80 }
    ]
  };
}

test('#45 seam A：无草稿且 ≥2 列时，buildPanelState 返回一个 source=default 的可点按钮', () => {
  const p = parsed();
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: null });
  assert.equal(vm.isDefault, true, '仍标记默认配方');
  assert.ok(Array.isArray(vm.buttons), 'buttons 应是数组');
  const defBtn = vm.buttons.filter(function (b) { return b.source === 'default'; })[0];
  assert.ok(defBtn, '应有 source=default 的默认配方按钮');
  assert.equal(defBtn.kind, 'swap', '默认配方按钮 kind=swap');
  assert.ok(defBtn.id, '按钮应有 id');
  assert.equal(defBtn.params['字段A'], '姓名', 'params 带第一列');
  assert.equal(defBtn.params['字段B'], '部门', 'params 带第二列');
  // 名字里能看出是默认配方（供面板显示）
  assert.match(defBtn.name, /默认|调换/, '按钮名应能看出是默认配方');
});

test('#45 seam A：无草稿且 <2 列时不产生默认按钮（不留空按钮）', () => {
  const vm = H.buildPanelState({ columns: ['唯一列'], rows: [{ 唯一列: 1 }], draft: null });
  assert.equal(vm.isDefault, false);
  const defBtn = (vm.buttons || []).filter(function (b) { return b.source === 'default'; })[0];
  assert.equal(defBtn, undefined, '<2 列时不应有默认按钮');
});

test('#45 seam A：默认按钮 id 不与已有固化按钮冲突', () => {
  const p = parsed();
  const draft = E.buildDraft('swap', null, { 字段A: '工时', 字段B: '时薪', scope: 'all', 条件: '' });
  // 模拟已有一个用户固化按钮 b1
  const existing = [{ id: 'b1', name: '我的按钮', kind: 'swap', params: { 字段A: '工时', 字段B: '时薪' }, source: 'user' }];
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: draft, buttons: existing });
  // 有显式草稿时 isDefault=false，不产生默认按钮
  assert.equal(vm.isDefault, false);
  const defBtn = (vm.buttons || []).filter(function (b) { return b.source === 'default'; })[0];
  assert.equal(defBtn, undefined, '有显式草稿时不产生默认按钮');
  // 原有按钮仍在
  assert.ok((vm.buttons || []).some(function (b) { return b.id === 'b1'; }), '已有按钮保留');
});

test('#45 seam A：把默认按钮交给 buildButtonPreview 能按它重算（点击闭环的 Host 侧）', () => {
  const p = parsed();
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: null });
  const defBtn = vm.buttons.filter(function (b) { return b.source === 'default'; })[0];
  assert.ok(defBtn, '应有默认按钮');
  const result = H.buildButtonPreview(
    { columns: p.columns, rows: p.rows, buttons: [defBtn] },
    defBtn.id
  );
  assert.ok(result && result.preview, '默认按钮应能重算出 preview');
  assert.equal(result.preview.affectedRows, 2, '默认按钮 swap 前两列影响 2 行');
  assert.match(result.preview.summary, /影响 2 行 \/ 共 2 行/);
});
