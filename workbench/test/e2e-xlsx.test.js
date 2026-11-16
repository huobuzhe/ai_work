'use strict';
// 端到端验收（票 #9 Acceptance #2）：真写一个本地 xlsx，经纯引擎 extract 后写回并读回验证单元格值。
// 前置：Python + openpyxl（本机已探测可用）；主 seam 仍然纯，文件桥接集中在 xlsx_bridge.py。
const test = require('node:test');
const assert = require('node:assert/strict');
const { runAcceptance } = require('../scripts/acceptance-run');

test('extract 端到端：一句话 → 配方 → 预览 → 写回 xlsx → 读回验证邮箱列', () => {
  const r = runAcceptance();
  assert.equal(r.draftKind, 'extract');
  assert.equal(r.sourcesUsed, '外勤登记表.csv');
  assert.equal(r.affectedRows, 5, '应影响全部 5 行');
  assert.equal(r.totalRows, 5);
  assert.match(r.summary, /影响 5 行 \/ 共 5 行/);
  assert.ok(r.columns.includes('邮箱'), '写回后应多出邮箱列');
  assert.deepEqual(r.actual, r.expected, '读回的邮箱值应逐行匹配预期');
  assert.equal(r.ok, true);
});
