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
