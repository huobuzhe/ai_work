'use strict';
// 票 #11 端到端验收（用户 m07859 后）：function 预览存算好的真实数字 → 写回 xlsx → 读回数值验证。
// 同时保留一条 toFormula→LibreOffice 能力子检查，确保「公式模式」底层能力仍在线（未弃用）。
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFormulaAcceptance } = require('../scripts/acceptance-formula');

test('function 端到端：一句话 → 算好的数值 → 写回 xlsx → 读回值匹配', () => {
  const r = runFormulaAcceptance();
  assert.equal(r.draftParams['输出列'], '应发');
  assert.equal(r.allNumeric, true, '预览产物必须是算好的数值');
  assert.deepEqual(r.previewValues, [12800, 14080, 5760, 8640, 6160]);
  assert.ok(r.columnsAfter.includes('应发'), '写回后应多出应发列');
  assert.equal(r.formulaCapability, true, 'toFormula 公式底层能力应仍可用（保留，未弃用）');
  assert.equal(r.valuesMatch, true, '读回数值应逐行匹配预期');
  assert.equal(r.actual['阿岚'], 12800);
  assert.equal(r.actual['柏舟'], 14080);
  assert.equal(r.actual['岑溪'], 5760);
  assert.equal(r.actual['丁野'], 8640);
  assert.equal(r.actual['尔芙'], 6160);
  assert.equal(r.ok, true);
});
