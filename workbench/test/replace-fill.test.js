'use strict';
// 新增两个日常常用动作（用户 m08197「只有5个按钮太少，加几个日常常用功能按钮」）：
// ⑥ replace 文本替换：把某列里的「查找」子串替换成「替换为」；查找为空时整列赋值为替换值。
// ⑦ fill 空值填充：目标列空/仅空白时写入填充值；已有值不动。
// 纪律：只扩展主 seam lib/engine.js（KINDS + stepsFor + preview 分支），不新开 seam、不碰文件。
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');

const DATA = {
  primaryKey: '姓名',
  columns: ['姓名', '部门', '工时', '时薪', '备注'],
  rows: [
    { 姓名: '阿岚', 部门: '销售一部', 工时: 160, 时薪: 80, 备注: '' },
    { 姓名: '柏舟', 部门: '技术部', 工时: 120, 时薪: 90, 备注: '老员工' },
    { 姓名: '清和', 部门: '财务', 工时: 150, 时薪: 75, 备注: '   ' }
  ]
};

test('replace/fill：KINDS 声明存在且 paramSpec 类型正确', function () {
  assert.ok(E.KINDS.replace, '应声明 replace 动作');
  assert.ok(E.KINDS.fill, '应声明 fill 动作');
  const rspec = E.KINDS.replace.paramSpec;
  assert.ok(rspec.find(function (d) { return d.key === '目标列' && d.约束 && d.约束.mustExist; }), 'replace 目标列应 mustExist');
  assert.ok(rspec.find(function (d) { return d.key === '查找'; }), 'replace 应有 查找');
  assert.ok(rspec.find(function (d) { return d.key === '替换为'; }), 'replace 应有 替换为');
  const fspec = E.KINDS.fill.paramSpec;
  assert.ok(fspec.find(function (d) { return d.key === '目标列'; }), 'fill 应有 目标列');
  assert.ok(fspec.find(function (d) { return d.key === '填充值'; }), 'fill 应有 填充值');
});

test('replace：子串替换（一部 → 空），只有命中的行产格子', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'replace', params: { 目标列: '部门', 查找: '一部', 替换为: '' } });
  assert.equal(st.stage, 'PREVIEWED');
  const cells = st.preview.cells;
  assert.equal(cells.length, 1, '只有一个「销售一部」命中，应只产 1 个格子');
  assert.equal(cells[0].row, '阿岚');
  assert.equal(cells[0].before, '销售一部');
  assert.equal(cells[0].after, '销售');
});

test('replace：查找为空时整列赋值（全部改为同一值）', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'replace', params: { 目标列: '部门', 查找: '', 替换为: '统一' } });
  assert.equal(st.stage, 'PREVIEWED');
  assert.equal(st.preview.cells.length, 3, '整列赋值应影响全部 3 行');
  st.preview.cells.forEach(function (c) { assert.equal(c.after, '统一'); });
});

test('replace：查找与替换为同时为空 —— 拦截、不清空整列、不改动任何格（用户 m10775 实机隐患）', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'replace', params: { 目标列: '部门', 查找: '', 替换为: '' } });
  // 不得进入 PREVIEWED；不得产生任何“把部门抹成空”的改动
  assert.notEqual(st.stage, 'PREVIEWED', '空+空替换不应进入可预览态');
  assert.ok(!st.preview || !st.preview.cells || st.preview.cells.length === 0, '空+空替换不应产出任何单元格');
  // 数据行保持原值（未被清空）
  st.rows.forEach(function (r) { assert.notEqual(String(r['部门']), '', '部门列不应被清空'); });
});

test('replace：带 scope=match 只替换满足条件的行', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'replace', params: { 目标列: '部门', 查找: '部', 替换为: '', scope: 'match', 条件: '工时 > 150' } });
  assert.equal(st.stage, 'PREVIEWED');
  // 工时 > 150 的只有阿岚(160)，命中一部→（去空）销售；柏舟120/清和150都不在范围
  assert.equal(st.preview.cells.length, 1);
  assert.equal(st.preview.cells[0].row, '阿岚');
});

test('fill：空/仅空白的单元格被填充，已有值不动', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'fill', params: { 目标列: '备注', 填充值: '待补' } });
  assert.equal(st.stage, 'PREVIEWED');
  const cells = st.preview.cells;
  // 阿岚备注 ''、清和备注 '   ' 都是空 → 应填；柏舟 '老员工' 不动
  const rows = cells.map(function (c) { return c.row; }).sort();
  assert.deepEqual(rows, ['清和', '阿岚'].sort(), '应填充 阿岚 与 清和，柏舟已有值不动');
  cells.forEach(function (c) { assert.equal(c.after, '待补'); });
});

test('fill：目标列为新列时全部视为空、全部填充', function () {
  const s = E.initial(DATA);
  const st = E.reduce(s, { type: 'QUICK', kind: 'fill', params: { 目标列: '备选', 填充值: 'X' } });
  assert.equal(st.stage, 'PREVIEWED');
  assert.equal(st.preview.cells.length, 3, '新列所有行都空，应全部填充');
});

test('replace/fill：validate 拒绝未知字段（封闭白名单）', function () {
  const s = E.initial(DATA);
  const bad = { kind: 'replace', schemaVersion: 1, params: { 目标列: '部门', 查找: '', 替换为: '', 恶意字段: 'x' } };
  const v = E.validate(bad, s);
  assert.equal(v.ok, false, '未知字段应被拒绝');
});

test('replace/fill：medium 说明存在，预览可正常产出 summary', function () {
  assert.match(E.KINDS.replace.medium, /替换/, 'replace medium 应描述替换');
  assert.match(E.KINDS.fill.medium, /空/, 'fill medium 应描述填空');
  const s = E.initial(DATA);
  const pv = E.preview(s, E.buildDraft('replace', null, { 目标列: '部门', 查找: '一部', 替换为: '' }));
  assert.match(pv.summary, /影响 \d+ 行/, 'replace 预览应有影响行数摘要');
  const fpv = E.preview(s, E.buildDraft('fill', null, { 目标列: '备注', 填充值: '待补' }));
  assert.match(fpv.summary, /影响 \d+ 行/, 'fill 预览应有影响行数摘要');
});
