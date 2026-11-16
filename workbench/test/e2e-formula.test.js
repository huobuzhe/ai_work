'use strict';
// 票 #11 端到端验收：function kind 生成公式字符串 → 写回 xlsx → bundled LibreOffice 重算 → 读回缓存值验证。
// 计算由本地引擎执行、零云凭据；引擎主 seam 从不做 JS 求值。
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFormulaAcceptance } = require('../scripts/acceptance-formula');

test('function 端到端：一句话 → 公式字符串 → 写回 xlsx → LibreOffice 重算 → 读回值匹配', () => {
  const r = runFormulaAcceptance();
  assert.equal(r.draftParams['输出列'], '应发');
  assert.equal(r.allFormula, true, '预览产物必须是公式字符串');
  assert.deepEqual(r.formulaStrings, ['=C2*D2', '=C3*D3', '=C4*D4', '=C5*D5', '=C6*D6']);
  assert.ok(r.columnsAfter.includes('应发'), '写回后应多出应发列');
  assert.equal(r.actual.__formulaSurvived, true, '重算前公式字符串应存活');
  assert.equal(r.valuesMatch, true, '重算后缓存值应逐行匹配预期');
  assert.equal(r.actual['阿岚'], 12800);
  assert.equal(r.actual['柏舟'], 14080);
  assert.equal(r.actual['岑溪'], 5760);
  assert.equal(r.actual['丁野'], 8640);
  assert.equal(r.actual['尔芙'], 6160);
  assert.equal(r.ok, true);
});
