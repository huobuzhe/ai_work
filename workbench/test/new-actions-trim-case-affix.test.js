'use strict';
/**
 * 票 #63（新增三种日常动作）：trim 去首尾空格 / case 英文大小写 / affix 加前缀后缀。
 * seam：引擎 KINDS + preview + validate + understand 关键词。
 * 均属「值变换」动作，复用 cells 模型（每格 before→after），不改架构。
 */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');

function makeState() {
  return E.initial({
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时'],
    rows: [
      { 姓名: ' 阿岚 ', 部门: 'sales', 工时: 160 },
      { 姓名: '柏舟', 部门: 'tech', 工时: 120 },
      { 姓名: '清和', 部门: 'FIN', 工时: 150 }
    ]
  });
}
function quick(s, kind, params) { return E.reduce(s, { type: 'QUICK', kind: kind, params: params }); }

test('#63 trim：去掉目标列首尾空格，只改有变化的行', () => {
  const s = quick(makeState(), 'trim', { 目标列: '姓名' });
  assert.strictEqual(s.stage, 'PREVIEWED');
  assert.strictEqual(s.preview.affectedRows, 1); // 只有 ' 阿岚 ' 有首尾空格
  const cell = s.preview.cells[0];
  assert.strictEqual(cell.col, '姓名');
  assert.strictEqual(cell.before, ' 阿岚 ');
  assert.strictEqual(cell.after, '阿岚');
});

test('#63 case upper：整列转大写，只改有变化行', () => {
  const s = quick(makeState(), 'case', { 目标列: '部门', 模式: 'upper' });
  assert.strictEqual(s.stage, 'PREVIEWED');
  // sales/tech -> SALES/TECH（FIN 本已大写、无变化）
  const afters = s.preview.cells.map(c => c.after).sort();
  assert.deepStrictEqual(afters, ['SALES', 'TECH']);
});

test('#63 case lower：整列转小写', () => {
  const s = quick(makeState(), 'case', { 目标列: '部门', 模式: 'lower' });
  const fin = s.preview.cells.filter(c => c.before === 'FIN')[0];
  assert.ok(fin, 'FIN 应被转成 fin');
  assert.strictEqual(fin.after, 'fin');
});

test('#63 affix prefix：统一加前缀', () => {
  const s = quick(makeState(), 'affix', { 目标列: '姓名', 位置: 'prefix', 文本: '员工-' });
  assert.strictEqual(s.preview.cells.length, 3);
  assert.strictEqual(s.preview.cells[0].after, '员工- 阿岚 '); // 加前缀不动中间空格
});

test('#63 affix suffix：统一加后缀', () => {
  const s = quick(makeState(), 'affix', { 目标列: '部门', 位置: 'suffix', 文本: '@分部' });
  assert.strictEqual(s.preview.cells[0].after, 'sales@分部');
});

test('#63 三种动作 paramSpec 声明正确（封闭白名单）', () => {
  assert.ok(E.KINDS.trim.paramSpec.find(d => d.key === '目标列'));
  assert.ok(E.KINDS.case.paramSpec.find(d => d.key === '模式' && d.约束.enum.includes('upper')));
  const affixPos = E.KINDS.affix.paramSpec.find(d => d.key === '位置');
  assert.deepStrictEqual(affixPos.约束.enum, ['prefix', 'suffix']);
});

test('#63 未知字段被封闭 schema 拒绝（QUICK 走 guard，停在 IDLE 并给出原因）', () => {
  const s = quick(makeState(), 'trim', { 目标列: '姓名', 乱入字段: 'x' });
  // 封闭校验失败：QUICK 不进入 PREVIEWED，停在 IDLE，note 里给出「未知字段」原因。
  assert.strictEqual(s.stage, 'IDLE');
  assert.ok(/未知字段/.test(s.note), '应提示未知字段：' + s.note);
});

test('#63 understand 关键词能识别三种新动作', () => {
  assert.strictEqual(E.understand('把姓名首尾空格去掉').kind, 'trim');
  assert.strictEqual(E.understand('部门转大写').kind, 'case');
  assert.strictEqual(E.understand('给姓名加前缀').kind, 'affix');
});
