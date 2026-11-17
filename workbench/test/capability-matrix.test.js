'use strict';
/**
 * 票 #25（Slice 2 / S5）：能力位矩阵端到端验尸。
 * 钉住：
 *  - AC1 每个 adapter 四格都有最小用例声明（写=乘→重算→读回→比对）
 *  - AC2 每格带一手证据；文档未验证 → verdict false 且带 failingStep；true 必须 runnable（无证据不得 true）
 *  - AC3 矩阵派生 formulaCapabilities 与 engine ADAPTERS.formulaCapabilities 完全一致（无漂移）；false 动作仍被能力位挡下
 *  - AC4 矩阵可复现（getMatrix/renderMarkdown 稳定），不含真实凭据
 *  - AC5 本地 Excel 真跑四格（写公式→LibreOffice 重算→读回→比对）全过
 */
const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/capability-matrix');
const E = require('../lib/engine');

// ---- AC1：四能力位 × 三平台，每格都有最小用例声明 ----
test('AC1 每个 adapter 四个能力位都有最小用例声明', function () {
  assert.deepEqual(M.CAPABILITY_BITS, ['canWriteFormula', 'canRecalc', 'canReadComputed', 'functionSet']);
  M.ADAPTER_IDS.forEach(function (id) {
    const p = M.PROBES[id];
    assert.equal(p.cells.length, 4, id + ' 应有四格');
    const bits = p.cells.map(function (c) { return c.bit; }).sort();
    assert.deepEqual(bits, M.CAPABILITY_BITS.slice().sort(), id + ' 四格 bit 应齐');
    p.cells.forEach(function (c) {
      assert.ok(typeof c.minCase === 'string' && c.minCase.length > 0, id + '/' + c.bit + ' 缺最小用例');
    });
  });
});

// ---- AC2：每格带证据；false 带 failingStep；true 必 runnable ----
test('AC2 每格带一手证据，false 带失败步骤，true 必须可真跑（无证据不得 true）', function () {
  // 模块加载已自检一遍，这里再显式断言以保证回归时清晰失败。
  assert.equal(M.assertNoUnbackedTrue(), true);
  M.ADAPTER_IDS.forEach(function (id) {
    M.PROBES[id].cells.forEach(function (c) {
      assert.ok(c.evidence, id + '/' + c.bit + ' 缺 evidence');
      if (c.verdict === 'true') assert.equal(c.runnable, true, id + '/' + c.bit + ' 记 true 必须 runnable');
      if (c.verdict === 'false') assert.ok(c.failingStep, id + '/' + c.bit + ' 记 false 必须带 failingStep');
    });
  });
});

test('AC2 造一个无证据 true 会被 assertNoUnbackedTrue 拒绝（防漂移基建本身有效）', function () {
  const bad = { x: { adapterId: 'x', label: 'x', cells: [{ bit: 'canWriteFormula', minCase: M.MIN_CASE, verdict: 'true', runnable: false, evidence: 'u' }] } };
  assert.throws(function () { M.assertNoUnbackedTrue(bad); }, /记 true 但不可真跑/);
});

// ---- AC3：矩阵派生 formulaCapabilities 与 engine ADAPTERS 完全一致 ----
test('AC3 矩阵派生 formulaCapabilities 与 engine ADAPTERS 无漂移', function () {
  M.ADAPTER_IDS.forEach(function (id) {
    const derived = M.formulaCapabilitiesFromMatrix(id);
    const actual = E.ADAPTERS[id].formulaCapabilities;
    assert.deepEqual(derived, actual, id + ' 矩阵结论应与 ADAPTERS.formulaCapabilities 一致（无漂移）');
  });
});

test('AC3 false 位的动作仍被能力位挡下并提示（function 在飞书/腾讯被挡、本地不被挡）', function () {
  function blocked(adapterId) {
    const st = E.initial({ adapter: adapterId, primaryKey: '姓名', columns: ['姓名', '工时', '时薪'], rows: [{ 姓名: 'A', 工时: 8, 时薪: 100 }], sources: {} });
    let s = E.reduce(st, { type: 'SET_INPUT', text: '把工时乘以时薪算成应发' });
    s = E.reduce(s, { type: 'UNDERSTAND' });
    s = E.reduce(s, { type: 'PREVIEW' });
    return { preview: s.preview, stage: s.stage, blockers: E.capabilityBlockers(s.draft, s) };
  }
  // 本地：function 可用（无 blocker、有预览）
  const local = blocked('local');
  assert.equal(local.blockers.length, 0);
  assert.ok(local.preview && !local.preview.invalid);
  // 飞书 / 腾讯：被能力位挡下（preview 为 null、stage 未进 PREVIEWED、blocker 含 canWriteFormula）
  ['feishu', 'tencent'].forEach(function (id) {
    const r = blocked(id);
    assert.ok(r.blockers.length > 0, id + ' 应有能力位 blocker');
    assert.ok(r.blockers.some(function (b) { return b.cap === 'canWriteFormula'; }), id + ' blocker 应含 canWriteFormula');
    assert.equal(r.preview, null, id + ' 被挡时 preview 应为 null');
    assert.notEqual(r.stage, 'PREVIEWED', id + ' 被挡时不应进 PREVIEWED');
  });
});

// ---- AC4：矩阵可复现 + 无真实凭据 ----
test('AC4 getMatrix 稳定可复现，renderMarkdown 含每格结论与证据，且不含凭据字样', function () {
  const a = JSON.stringify(M.getMatrix());
  const b = JSON.stringify(M.getMatrix());
  assert.equal(a, b, 'getMatrix 应可复现');
  const md = M.renderMarkdown();
  M.ADAPTER_IDS.forEach(function (id) { assert.ok(md.indexOf(M.PROBES[id].label) !== -1, '矩阵 Markdown 应含平台 ' + id); });
  M.CAPABILITY_BITS.forEach(function (bit) { assert.ok(md.indexOf(bit) !== -1, '矩阵 Markdown 应含能力位 ' + bit); });
  // 不含任何看起来像真实凭据的赋值
  assert.ok(!/cli_[a-z0-9]{8,}/i.test(md), '矩阵不应含凭据样式字符串');
});

test('AC3 矩阵 verdict 单一真相源来自 engine（改 engine.ADAPTERS 矩阵即随之，非平行副本）', function () {
  // 证明 PROBES 的 verdict 不是独立声明：直接读取时，其布尔必须等于 engine 里对应值。
  M.ADAPTER_IDS.forEach(function (id) {
    const fc = E.ADAPTERS[id].formulaCapabilities;
    M.PROBES[id].cells.forEach(function (c) {
      assert.equal(c.verdict, fc[c.bit] ? 'true' : 'false', id + '/' + c.bit + ' verdict 必须派生自 engine（单一真相源）');
    });
  });
});

test('AC4 renderMarkdown 可接受降级后的能力位覆盖，落盘产物如实反映（不印静态 true）', function () {
  const override = { local: { canRecalc: false, functionSet: false } };
  const md = M.renderMarkdown({ capabilities: override });
  const localLine = md.split('\n').filter(function (l) { return l.indexOf(M.PROBES.local.label) !== -1; })[0];
  // canRecalc 与 functionSet 两列应显示 false，且不再带 [本会话真跑]（因为该位已降级为 false）
  assert.ok(/false/.test(localLine), '降级后本地行应含 false');
  assert.equal((localLine.match(/\[本会话真跑\]/g) || []).length, 2, '降级两个 true 后只剩两个真跑标记');
});

test('#35 AC4 降级覆盖不得渲染出自相矛盾的 false[verified-true]（该态加载期会被守卫拒绝）', function () {
  const override = { local: { canRecalc: false } };
  const md = M.renderMarkdown({ capabilities: override });
  const localLine = md.split('\n').filter(function (l) { return l.indexOf(M.PROBES.local.label) !== -1; })[0];
  // 降级位 verdict 变 false，证据状态必须同步落到非 verified-true，绝不印出自相矛盾的 false[verified-true]。
  assert.ok(localLine.indexOf('false[verified-true]') === -1, '降级位不得渲染 false[verified-true]（守卫会拒绝该态）');
  assert.ok(/false\[(verified-false|unverified-default-false)\]/.test(localLine), '降级位应显示 false + 非 verified-true 的证据状态');
});

// ---- AC4：落盘矩阵产物与当前渲染一致（漂移守卫）----
// 落盘产物可以携带「持凭据实测佐证」标注（由真跑回填，只在提交的产物里存在），
// 但表结构/能力位/证据/失败步骤这些静态部分必须与 renderMarkdown() 一致。
// 故两侧都先剥离持凭据实测佐证片段再比较，既守卫漂移又不误伤合法实测佐证。
test('AC4 落盘 capability-matrix.md 与 renderMarkdown() 一致（改矩阵须重新生成产物）', function () {
  const { readFileSync, existsSync } = require('node:fs');
  const { resolve } = require('node:path');
  const path = resolve(__dirname, '..', 'capability-matrix.md');
  assert.ok(existsSync(path), '矩阵产物 capability-matrix.md 应存在（跑 node scripts/capability-probe.js --write-matrix 生成）');
  const stripLive = function (s) { return s.replace(/ · \[持凭据实测佐证 [^\]]*\]/g, ''); };
  const onDisk = stripLive(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
  const fresh = stripLive(M.renderMarkdown());
  assert.equal(onDisk, fresh, '落盘矩阵与本模块 renderMarkdown() 不一致（已忽略持凭据实测佐证）——矩阵结构变了请重新生成产物');
});

test('AC5 本地 Excel 探针真跑四格全过（=C2*D2 写存活 + 重算值正确）', function () {
  const { runLocalProbe } = require('../scripts/capability-probe');
  const r = runLocalProbe();
  assert.equal(r.canWriteFormula, true, '公式应写入并存活');
  assert.equal(r.canRecalc, true, '重算应得正确计算值');
  assert.equal(r.canReadComputed, true, '应能读回计算值');
  assert.equal(r.functionSet, true, '乘法函数应可用且正确');
  assert.equal(r.detail.valuesMatch, true, JSON.stringify(r.detail));
  // 结果与声明的 local 四格 true 一致
  const declared = M.formulaCapabilitiesFromMatrix('local');
  M.CAPABILITY_BITS.forEach(function (b) { assert.equal(r[b], declared[b], 'local/' + b + ' 真跑结果应与声明一致'); });
});

// ---- #35 / 规格 #34：三维证据状态枚举（唯一净新增 seam）----
// seam：capability-matrix 数据视图（getMatrix/PROBES/assertNoUnbackedTrue）。
// 钉住：三值枚举、布尔与证据状态一致、只认 verified-true、自检拦无证据/漂移、实测佐证不翻结论。
const EVIDENCE_STATUS_VALID = Object.values(E.EVIDENCE_STATUS);

function cellOf(id, bit) {
  return M.PROBES[id].cells.find(function (c) { return c.bit === bit; });
}

test('#35 AC1 每格带三值证据状态枚举，且 verdict 与证据状态一致（仅 verified-true 为真）', function () {
  M.ADAPTER_IDS.forEach(function (id) {
    M.PROBES[id].cells.forEach(function (c) {
      assert.ok(EVIDENCE_STATUS_VALID.indexOf(c.evidenceStatus) !== -1, id + '/' + c.bit + ' evidenceStatus 必须是三值枚举之一：' + c.evidenceStatus);
      if (c.verdict === 'true') {
        assert.equal(c.evidenceStatus, 'verified-true', id + '/' + c.bit + ' verdict=true 必须 evidenceStatus=verified-true');
      } else {
        assert.notEqual(c.evidenceStatus, 'verified-true', id + '/' + c.bit + ' verdict=false 不得标 verified-true');
      }
    });
  });
});

test('#35 AC1 三态分布钉死：local 四格 verified-true / 腾讯三格 verified-false + functionSet 未验证 / 飞书四格未验证', function () {
  M.CAPABILITY_BITS.forEach(function (b) { assert.equal(cellOf('local', b).evidenceStatus, 'verified-true', 'local/' + b); });
  ['canWriteFormula', 'canRecalc', 'canReadComputed'].forEach(function (b) {
    assert.equal(cellOf('tencent', b).evidenceStatus, 'verified-false', 'tencent/' + b + ' 一手负面已验证');
  });
  assert.equal(cellOf('tencent', 'functionSet').evidenceStatus, 'unverified-default-false', 'tencent/functionSet 未见官方清单，保守记 false');
  M.CAPABILITY_BITS.forEach(function (b) { assert.equal(cellOf('feishu', b).evidenceStatus, 'unverified-default-false', 'feishu/' + b + ' 文档层未验证+豁免'); });
});

test('#35 AC4 造一个「记 true 但证据状态非 verified-true」的漂移格会被 assertNoUnbackedTrue 拒绝', function () {
  const bad = { x: { adapterId: 'x', label: 'x', cells: [{ bit: 'canWriteFormula', minCase: M.MIN_CASE, verdict: 'true', runnable: true, evidence: 'u', evidenceStatus: 'unverified-default-false' }] } };
  assert.throws(function () { M.assertNoUnbackedTrue(bad); }, /verified-true/);
});

test('#35 AC4 缺 evidenceStatus 或填非法值的格会被 assertNoUnbackedTrue 拒绝', function () {
  const missing = { x: { adapterId: 'x', label: 'x', cells: [{ bit: 'canWriteFormula', minCase: M.MIN_CASE, verdict: 'false', runnable: false, evidence: 'u', failingStep: 's' }] } };
  assert.throws(function () { M.assertNoUnbackedTrue(missing); }, /evidenceStatus/);
  const illegal = { x: { adapterId: 'x', label: 'x', cells: [{ bit: 'canWriteFormula', minCase: M.MIN_CASE, verdict: 'false', runnable: false, evidence: 'u', failingStep: 's', evidenceStatus: 'maybe-true' }] } };
  assert.throws(function () { M.assertNoUnbackedTrue(illegal); }, /evidenceStatus/);
});

test('#35 AC4 持凭据实测佐证只加厚证据，不翻动 verdict 与 evidenceStatus', function () {
  const before = M.getMatrix();
  try {
    M.recordLiveEvidence('feishu', { ok: true }, { ranAt: '2026-01-01T00:00:00.000Z' });
    const after = M.getMatrix();
    ['local', 'feishu', 'tencent'].forEach(function (id) {
      M.CAPABILITY_BITS.forEach(function (b) {
        assert.equal(after.find(function (r) { return r.adapterId === id; }).cells[b].verdict,
          before.find(function (r) { return r.adapterId === id; }).cells[b].verdict, id + '/' + b + ' verdict 不应被实测佐证翻动');
        assert.equal(after.find(function (r) { return r.adapterId === id; }).cells[b].evidenceStatus,
          before.find(function (r) { return r.adapterId === id; }).cells[b].evidenceStatus, id + '/' + b + ' evidenceStatus 不应被实测佐证翻动');
      });
    });
    assert.ok(cellOf('feishu', 'canWriteFormula').evidenceLive, '飞书格应挂上实测佐证');
  } finally {
    M.PROBES.feishu.cells.forEach(function (c) { delete c.evidenceLive; });
  }
});

test('#35 AC1 getMatrix 暴露每格 evidenceStatus，renderMarkdown 逐格标注三态', function () {
  M.getMatrix().forEach(function (row) {
    Object.keys(row.cells).forEach(function (b) {
      assert.ok(EVIDENCE_STATUS_VALID.indexOf(row.cells[b].evidenceStatus) !== -1, row.adapterId + '/' + b + ' getMatrix 应暴露 evidenceStatus');
    });
  });
  const md = M.renderMarkdown();
  EVIDENCE_STATUS_VALID.forEach(function (s) { assert.ok(md.indexOf(s) !== -1, '矩阵 Markdown 应标注证据状态 ' + s); });
});
