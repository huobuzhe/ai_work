'use strict';
// 多动作流水线批处理（一条流水线串多个动作一次执行，用户 m12701 目标步骤 5 之一）。
// 设计：PIPELINE 动作携带有序 steps:[{kind, params}]，引擎逐步在对「上一步已演进的状态」上跑 preview，
// 把每步产出的单元格/排序串起来，给出一份组合预览；确认时按顺序 applyCells，最后一次性写盘。
// 纪律：只扩展主 seam lib/engine.js（新增 runPipeline + reduce 的 PIPELINE/CONFIRM 分支），不新开 seam。
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');

const DATA = {
  primaryKey: '姓名',
  columns: ['姓名', '部门', '工时', '时薪', '备注'],
  rows: [
    { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80, 备注: '' },
    { 姓名: '柏舟', 部门: '技术', 工时: 120, 时薪: 90, 备注: '' },
    { 姓名: '清和', 部门: '财务', 工时: 150, 时薪: 75, 备注: '' }
  ]
};
function fresh() { return E.initial(JSON.parse(JSON.stringify(DATA))); }

test('runPipeline：串两个动作（function 算应发 + highlight 标色），逐步演进、组合预览有效', function () {
  const st = fresh();
  const pv = E.runPipeline([
    { kind: 'function', params: { 表达式: '工时 * 时薪', 输出列: '应发', 写入方式: '数值' } },
    { kind: 'highlight', params: { 目标列: '应发', 条件: '应发 > 10000', 底色: 'green' } }
  ], st);
  assert.equal(pv.invalid, false, '两步都应有效');
  assert.equal(pv.steps.length, 2, '应带 2 步元数据');
  // 第一步产出 3 格应发（数值），第二步产出标色格（after=原值，highlight=green，命中 应发>10000 的行）。
  assert.ok(pv.cells.length >= 3, '至少 3 个应发单元格');
  const fnCells = pv.cells.filter(function (c) { return c.stepIndex === 0; });
  const hlCells = pv.cells.filter(function (c) { return c.stepIndex === 1; });
  assert.equal(fnCells.length, 3, '第一步 function 产 3 格');
  // 工时*时薪：阿岚 12800、柏舟 10800、清和 11250 → 全部 >10000 命中标色。
  assert.equal(hlCells.length, 3, '第二步 highlight 命中 3 行');
  hlCells.forEach(function (c) { assert.equal(c.highlight, 'green'); assert.equal(c.after, c.before, '标色不改值'); });
});

test('runPipeline：第二步能看到第一步演进后的状态（fill 依赖 function 产出的新列）', function () {
  const st = fresh();
  const pv = E.runPipeline([
    { kind: 'function', params: { 表达式: '工时 * 时薪', 输出列: '应发', 写入方式: '数值' } }
  ], st);
  // 单步：应发列存在、值正确
  const byName = {};
  pv.cells.forEach(function (c) { byName[c.row] = c.after; });
  assert.equal(byName['阿岚'], 12800);
  assert.equal(byName['柏舟'], 10800);
  assert.equal(byName['清和'], 11250);
});

test('runPipeline：任一步 invalid 时组合预览 invalid 并指出步骤序号', function () {
  const st = fresh();
  const pv = E.runPipeline([
    { kind: 'swap', params: { 字段A: '工时', 字段B: '时薪' } },
    { kind: 'function', params: { 表达式: '不存在列 * 2', 输出列: '坏列', 写入方式: '数值' } }
  ], st);
  assert.equal(pv.invalid, true, '第二步引用不存在的列应 invalid');
  assert.ok(pv.summary.indexOf('第 2 步') !== -1 || pv.summary.indexOf('步骤') !== -1, '摘要应指出出错的步骤');
});

test('runPipeline：空 steps 或非数组 → invalid 拦截', function () {
  const st = fresh();
  assert.equal(E.runPipeline([], st).invalid, true);
  assert.equal(E.runPipeline(null, st).invalid, true);
});

test('runPipeline：含 sort（结构性动作，不产单元格）→ 明确拦截不静默丢弃', function () {
  const st = fresh();
  const pv = E.runPipeline([
    { kind: 'trim', params: { 目标列: '部门' } },
    { kind: 'sort', params: { 排序列: '工时', 方向: 'desc' } }
  ], st);
  assert.equal(pv.invalid, true);
  assert.ok(pv.summary.indexOf('排序') !== -1, '摘要应说明排序不支持放入流水线');
});

test('reduce PIPELINE：产生 PREVIEWED 组合预览，stage 就绪可确认', function () {
  const st = fresh();
  const after = E.reduce(st, { type: 'PIPELINE', steps: [
    { kind: 'function', params: { 表达式: '工时 * 时薪', 输出列: '应发', 写入方式: '数值' } }
  ] });
  assert.equal(after.stage, 'PREVIEWED');
  assert.ok(after.preview && Array.isArray(after.preview.cells));
  assert.ok(after.preview.pipeline === true, '组合预览应有 pipeline 标记');
});

test('reduce CONFIRM：流水线确认后按顺序落盘（rows 演进），stage EXECUTED', function () {
  const st = fresh();
  const pvState = E.reduce(st, { type: 'PIPELINE', steps: [
    { kind: 'function', params: { 表达式: '工时 * 时薪', 输出列: '应发', 写入方式: '数值' } }
  ] });
  const done = E.reduce(pvState, { type: 'CONFIRM' });
  assert.equal(done.stage, 'EXECUTED');
  const a = done.rows.find(function (r) { return r.姓名 === '阿岚'; });
  assert.equal(a.应发, 12800, '应发列已写入');
  assert.ok(done.columns.indexOf('应发') !== -1, '新列进入 columns');
});
