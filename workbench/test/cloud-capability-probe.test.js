'use strict';
// 票 #27：云端「持凭据真跑通链路」证据层测试。
// 核心不变量：真跑云端链路**只加厚证据、绝不把公式能力位翻成 true**（云端链路纯数值写值、结构不支持公式）。
const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/capability-matrix');
const P = require('../scripts/capability-probe');

// 本文件的用例会调用 recordLiveEvidence 往共享 PROBES 里写 evidenceLive，
// 必须在每个用例后清掉，否则会污染其它测试文件（node --test 同进程共享模块状态），
// 尤其 capability-matrix.test.js 的「落盘产物一致」漂移守卫会因此误报。
function clearLiveEvidence() {
  M.ADAPTER_IDS.forEach(function (id) {
    const p = M.PROBES[id];
    if (!p) return;
    p.cells.forEach(function (c) { delete c.evidenceLive; });
  });
}
test.afterEach(clearLiveEvidence);

// 基线：任何用例跑前，飞书/腾讯四格必须全 false（结构负面，与 engine 单一真相源一致）
test('AC1 基线：飞书/腾讯四格 verdict 全 false，local 四格 true', function () {
  const m = M.getMatrix();
  const byId = {};
  m.forEach(function (a) { byId[a.adapterId] = a; });
  M.CAPABILITY_BITS.forEach(function (b) {
    assert.strictEqual(byId.local.cells[b].verdict, 'true', 'local/' + b + ' 应 true');
    assert.strictEqual(byId.feishu.cells[b].verdict, 'false', 'feishu/' + b + ' 应 false');
    assert.strictEqual(byId.tencent.cells[b].verdict, 'false', 'tencent/' + b + ' 应 false');
  });
});

// AC2：recordLiveEvidence 只加 evidenceLive，绝不动 verdict（即使链路 ok:true）
test('AC2 recordLiveEvidence 链路成功也不翻 true，只加 evidenceLive', function () {
  const r = M.recordLiveEvidence('feishu', { ok: true, readBack: [{ 姓名: '阿岚', 工时: 8 }, { 姓名: '柏舟', 工时: 10 }] }, { ranAt: '2026-11-16T22:00:00Z', tableRows: 2 });
  assert.strictEqual(r.recorded, true);
  assert.strictEqual(r.chainOk, true);
  const m = M.getMatrix();
  const feishu = m.find(function (a) { return a.adapterId === 'feishu'; });
  M.CAPABILITY_BITS.forEach(function (b) {
    assert.strictEqual(feishu.cells[b].verdict, 'false', 'feishu/' + b + ' 链路通也不得翻 true');
    assert.ok(feishu.cells[b].evidenceLive, 'feishu/' + b + ' 应带 evidenceLive');
    assert.strictEqual(feishu.cells[b].evidenceLive.chainOk, true);
    assert.strictEqual(feishu.cells[b].evidenceLive.formulaProbe, 'structurally-unsupported');
  });
});

// AC2b：飞书读回含平台预置空行（{} / {text:""}）时，摘要只统计有内容的行、sample 取真实行
test('AC2b recordLiveEvidence 读回摘要剔除平台预置空行、rowCount 与 sample 如实', function () {
  const blanks = Array(10).fill({});
  const real = [
    { 姓名: [{ text: '阿岚', type: 'text' }], 工时: 8, 时薪: 100 },
    { 姓名: [{ text: '柏舟', type: 'text' }], 工时: 10, 时薪: 80 }
  ];
  M.recordLiveEvidence('feishu', { ok: true, readBack: blanks.concat(real) }, { ranAt: '2026-11-16T22:10:00Z', tableRows: 2 });
  const feishu = M.getMatrix().find(function (a) { return a.adapterId === 'feishu'; });
  const s = feishu.cells.canWriteFormula.evidenceLive.readBackSummary;
  assert.strictEqual(s.kind, 'rows');
  assert.strictEqual(s.rowCount, 12, '总行数保留（含空行）');
  assert.strictEqual(s.nonEmptyRowCount, 2, '有内容行 = 2');
  assert.strictEqual(s.emptyRowCount, 10, '空行 = 10');
  assert.strictEqual(s.sample.length, 2, 'sample 取两行真实数据，不是空行');
  assert.strictEqual(s.sample[0].工时, 8, 'sample 首行是真实数据（阿岚 8）');
  assert.ok(!('text' in s.sample[0] || s.sample[0][0] !== undefined), 'sample 不得是空 {} 行');
});

// AC3：链路失败也如实记录（chainOk:false），verdict 仍 false
test('AC3 recordLiveEvidence 链路失败如实记录 chainOk:false', function () {
  const r = M.recordLiveEvidence('tencent', { ok: false, failed: { step: '写值', msg: 'ret!=0' } }, { ranAt: '2026-11-16T22:01:00Z' });
  assert.strictEqual(r.recorded, true);
  assert.strictEqual(r.chainOk, false);
  const tencent = M.getMatrix().find(function (a) { return a.adapterId === 'tencent'; });
  M.CAPABILITY_BITS.forEach(function (b) {
    assert.strictEqual(tencent.cells[b].verdict, 'false');
    assert.strictEqual(tencent.cells[b].evidenceLive.chainOk, false);
    assert.match(tencent.cells[b].evidenceLive.evidence, /失败/);
  });
});

// AC4：local 不走云端证据层（拒绝）；未知 adapter 也拒绝
test('AC4 local / 未知 adapter 不进云端证据层', function () {
  assert.strictEqual(M.recordLiveEvidence('local', { ok: true }).recorded, false);
  assert.strictEqual(M.recordLiveEvidence('feishu', { ok: true }, {}).recorded, true); // 合法
  assert.strictEqual(M.recordLiveEvidence('aws', { ok: true }).recorded, false);
});

// AC5：runCloudProbes 缺凭据时如实报缺字段、不伪造成功、且**不登记持凭据实测佐证**
//（缺凭据 ≠ 持凭据真跑失败，不能把「没凭据」误标成「链路失败」写进落盘矩阵）
test('AC5 runCloudProbes 缺凭据如实报缺字段（不伪造、不联网、不登记证据）', async function () {
  const saved = {};
  const keys = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'TENCENT_ACCESS_TOKEN', 'TENCENT_CLIENT_ID', 'TENCENT_OPEN_ID'];
  keys.forEach(function (k) { saved[k] = process.env[k]; delete process.env[k]; });
  try {
    const r = await P.runCloudProbes({});
    // 飞书
    assert.strictEqual(r.feishu.live.ok, false);
    assert.match(r.feishu.live.error, /缺本机凭据环境变量/);
    assert.match(r.feishu.live.error, /FEISHU_APP_ID/);
    assert.strictEqual(r.feishu.recorded.recorded, false, '缺凭据不得登记证据');
    // 腾讯
    assert.strictEqual(r.tencent.live.ok, false);
    assert.match(r.tencent.live.error, /TENCENT_ACCESS_TOKEN/);
    assert.strictEqual(r.tencent.recorded.recorded, false, '缺凭据不得登记证据');
    // 确认矩阵四格都没有 evidenceLive（没被误标成链路失败）
    M.getMatrix().forEach(function (a) {
      M.CAPABILITY_BITS.forEach(function (b) {
        assert.strictEqual(a.cells[b].evidenceLive, null, a.adapterId + '/' + b + ' 缺凭据时不应有 evidenceLive');
      });
    });
  } finally {
    keys.forEach(function (k) { if (saved[k] !== undefined) process.env[k] = saved[k]; });
  }
});

// AC5b：getMatrix() 是只读快照——调用方改返回对象不得污染模块内部状态（MEDIUM-1 回归守卫）
test('AC5b getMatrix 返回的 evidenceLive 是快照副本，改它不影响内部与后续调用', function () {
  M.recordLiveEvidence('feishu', { ok: true, readBack: [{ 姓名: 'x' }] }, { ranAt: '2026-11-16T22:05:00Z' });
  const m1 = M.getMatrix().find(function (a) { return a.adapterId === 'feishu'; });
  m1.cells.canWriteFormula.evidenceLive.ranAt = 'HACKED';
  const m2 = M.getMatrix().find(function (a) { return a.adapterId === 'feishu'; });
  assert.notStrictEqual(m2.cells.canWriteFormula.evidenceLive.ranAt, 'HACKED', '外部改快照不得污染内部状态');
  assert.strictEqual(m2.cells.canWriteFormula.evidenceLive.ranAt, '2026-11-16T22:05:00Z');
});

// AC6：renderMarkdown 有 evidenceLive 时标「持凭据实测佐证」、无则不标，且不出现虚假 true
test('AC6 renderMarkdown 标出持凭据实测佐证、云端仍 false', function () {
  M.recordLiveEvidence('feishu', { ok: true, readBack: [{ 姓名: 'x' }] }, { ranAt: '2026-11-16T22:02:00Z' });
  const md = M.renderMarkdown();
  assert.match(md, /持凭据实测佐证 2026-11-16T22:02:00Z：链路通、公式位结构不支持/);
  // 云计算行里 canWriteFormula 仍是 false（不因链路通而变 true）
  const feishuLine = md.split('\n').find(function (l) { return l.indexOf('飞书') !== -1 && l.indexOf('|') !== -1; });
  assert.ok(feishuLine, '应有飞书行');
  assert.match(feishuLine, /false/, '飞书行公式位必须仍含 false');
});
