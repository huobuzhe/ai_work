'use strict';
// ④ 多操作数表达式（🟡 便宜增量）——function 的 表达式 从「操作数 单运算符 操作数」
// 扩成任意多项加减乘除，支持括号与运算优先级（先 * / 后 + -），支持一元负号。
// 共享同一词法/解析器：toFormula 渲染 A1 公式串、computeValue 实算该行数值。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

const DATA = {
  primaryKey: '姓名',
  columns: ['姓名', '工时', '时薪', '奖金'],
  rows: [
    { 姓名: '阿岚', 工时: 160, 时薪: 80, 奖金: 500 },
    { 姓名: '柏舟', 工时: 176, 时薪: 90, 奖金: 200 }
  ],
  sources: {}
};
function fresh() { return E.initial(DATA); }

test('computeValue：三个操作数相加（工时*时薪 + 奖金）', () => {
  assert.equal(E.computeValue('工时 * 时薪 + 奖金', fresh(), 0), 13300); // 160*80+500
  assert.equal(E.computeValue('工时 * 时薪 + 奖金', fresh(), 1), 16040); // 176*90+200=16040
});

test('computeValue：运算符优先级 * 高于 +', () => {
  // 10 + 2 * 3 = 16（不是 36）
  assert.equal(E.computeValue('10 + 2 * 3', fresh(), 0), 16);
  assert.equal(E.computeValue('2 * 3 + 10', fresh(), 0), 16);
});

test('computeValue：括号改变优先级', () => {
  assert.equal(E.computeValue('(10 + 2) * 3', fresh(), 0), 36);
  assert.equal(E.computeValue('(工时 + 时薪) * 2', fresh(), 0), 480); // (160+80)*2
});

test('computeValue：减法与除法（左结合）', () => {
  assert.equal(E.computeValue('100 - 20 - 30', fresh(), 0), 50); // 左结合 (100-20)-30
  assert.equal(E.computeValue('工时 / 2', fresh(), 0), 80);
  assert.equal(E.computeValue('工时 / 时薪', fresh(), 0), 2); // 160/80
});

test('computeValue：一元负号', () => {
  assert.equal(E.computeValue('-工时 + 200', fresh(), 0), 40); // -160+200
  assert.equal(E.computeValue('工时 * -1', fresh(), 0), -160);
});

test('toFormula：多操作数渲染成 A1 公式串（列名→列字母+行号）', () => {
  // 阿岚第 0 行 = Excel 行 2；工时=B、时薪=C、奖金=D。括号保运算顺序（语义等价即可）。
  assert.equal(E.toFormula('工时 * 时薪 + 奖金', fresh(), 0), '=(B2*C2)+D2');
  assert.equal(E.toFormula('(工时 + 时薪) * 2', fresh(), 1), '=(B3+C3)*2');
});

test('非法表达式 / 未知列名：toFormula 与 computeValue 都返回 null', () => {
  assert.equal(E.computeValue('工时 * 时薪 +', fresh(), 0), null);
  assert.equal(E.computeValue('(工时 + 时薪', fresh(), 0), null);
  assert.equal(E.computeValue('工时 ^ 时薪', fresh(), 0), null);
  assert.equal(E.computeValue('不存在的列 + 1', fresh(), 0), null);
  assert.equal(E.toFormula('工时 * 时薪 +', fresh(), 0), null);
});

test('除以零：computeValue 返回 null（不产 Infinity/NaN）', () => {
  assert.equal(E.computeValue('工时 / 0', fresh(), 0), null);
});

test('function 预览端到端：多操作数表达式写真实数值', () => {
  const s = E.reduce(fresh(), {
    type: 'QUICK', kind: 'function',
    params: { 表达式: '工时 * 时薪 + 奖金', 输出列: '应发', 写入方式: '数值' }
  });
  assert.equal(s.stage, 'PREVIEWED');
  const c0 = s.preview.cells.find((c) => c.col === '应发' && c.rowIndex === 0);
  assert.equal(c0.after, 13300);
});

test('function 预览端到端：多操作数表达式写公式串', () => {
  const s = E.reduce(fresh(), {
    type: 'QUICK', kind: 'function',
    params: { 表达式: '工时 * 时薪 + 奖金', 输出列: '应发', 写入方式: '公式' }
  });
  assert.equal(s.stage, 'PREVIEWED');
  const c0 = s.preview.cells.find((c) => c.col === '应发' && c.rowIndex === 0);
  assert.equal(String(c0.after).replace(/\s/g, ''), '=(B2*C2)+D2');
});

// 回归（真机 e2e 发现）：面板一键动作把用户自选的新输出列名（如「合计」，表里还不存在）
// 误改成「应发」。根因：panel-session.preNormalizeQuickParams 的 function 分支
// 用 !has(输出列) 判断「未指定」，但新列名本来就不在表里 → 被误判成未指定。修成只在空/主键时兜底。
test('面板 QUICK：用户自选新输出列名（新列，未存在于表中）应被保留，不被改成「应发」', () => {
  const PS = require('../lib/panel-session');
  const store = PS.createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] });
  const table = {
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪', '奖金', '备注'],
    rows: [{ 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80, 奖金: 500, 备注: '' }]
  };
  // 模拟真实面板：QUICK + 用户自选输出列「合计」（表中尚无此列）
  const vm = store.applyAction('F:/x/合计.xlsx', table, {
    type: 'QUICK', kind: 'function', params: { 表达式: '(工时 + 时薪) * 2', 输出列: '合计' }
  });
  assert.equal(vm.stage, 'PREVIEWED');
  const cols = vm.preview.cells.map((c) => c.col);
  assert.ok(cols.indexOf('合计') !== -1, '应在「合计」列产出单元格，实际列=' + cols.join(','));
  assert.ok(cols.indexOf('应发') === -1, '不应产生「应发」列（用户指定的是「合计」）');
  const c0 = vm.preview.cells.find((c) => c.col === '合计' && c.rowIndex === 0);
  assert.equal(c0.after, 480); // (160+80)*2
});

test('面板 QUICK：未指定输出列（空）时仍兜底成「应发」（保持历史默认行为）', () => {
  const PS = require('../lib/panel-session');
  const store = PS.createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] });
  const table = {
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪'],
    rows: [{ 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80 }]
  };
  const vm = store.applyAction('F:/x/y.xlsx', table, {
    type: 'QUICK', kind: 'function', params: { 表达式: '工时 * 时薪', 输出列: '' }
  });
  assert.equal(vm.stage, 'PREVIEWED');
  const cols = vm.preview.cells.map((c) => c.col);
  assert.ok(cols.indexOf('应发') !== -1, '未指定时应兜底成「应发」，实际=' + cols.join(','));
});
