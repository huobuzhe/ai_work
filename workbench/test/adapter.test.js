'use strict';
// 票 #21（Slice 2 / S1）：统一表格操作 adapter 抽象层 + 公式能力位契约。
// 断言：
//  AC1 引擎有统一 adapter 接口定义（纯声明、无可执行代码进配方），三个 adapter（本地 Excel/飞书/腾讯）各自声明 formulaCapabilities
//  AC2 能力位为 false 的动作在该 adapter 上被禁用，预览卡给出明确原因提示，绝不静默降级/写死值
//  AC3 本地 Excel adapter 四格 true；飞书/腾讯按既有矩阵 false，填充值带出处注释
//  AC4 一条动作在「全 true」与「全 false」两种 adapter 下预览分别可用/禁用+提示
//  AC5 全测绿、两 acceptance 无回归、无真实凭据值进仓库
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

const CAP_KEYS = ['canWriteFormula', 'canRecalc', 'canReadComputed', 'functionSet'];
const COLS = ['姓名', '部门', '工时', '时薪', '备注'];

function mkState(adapterId) {
  return E.initial({
    primaryKey: '姓名',
    columns: COLS.slice(),
    rows: [
      { 姓名: '阿岚', 部门: '技术', 工时: 160, 时薪: 80, 备注: '' },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80, 备注: '' }
    ],
    sources: { '外勤登记表.csv': { rows: [{ 姓名: '阿岚', 邮箱: 'a@x.com' }, { 姓名: '柏舟', 邮箱: 'b@x.com' }] } },
    adapter: adapterId
  });
}

// ---- AC1：统一 adapter 接口 + 三 adapter 各自 formulaCapabilities ----
test('AC1 引擎导出 ADAPTERS，含 local/feishu/tencent 三个 adapter', function () {
  assert.ok(E.ADAPTERS, 'ADAPTERS 应导出');
  ['local', 'feishu', 'tencent'].forEach(function (id) {
    assert.ok(E.ADAPTERS[id], '缺少 adapter：' + id);
    assert.equal(E.ADAPTERS[id].id, id, 'adapter.id 应为 ' + id);
    assert.equal(typeof E.ADAPTERS[id].label, 'string', 'adapter.label 应为字符串');
    assert.ok(E.ADAPTERS[id].formulaCapabilities, 'adapter ' + id + ' 缺 formulaCapabilities');
  });
});

test('AC1 统一接口含读表/写单元格/建表/读回计算值 四类能力声明', function () {
  const iface = E.ADAPTER_INTERFACE;
  assert.ok(Array.isArray(iface) && iface.length >= 4, 'ADAPTER_INTERFACE 应列出四类能力');
  ['读表', '写单元格', '建表', '读回计算值'].forEach(function (name) {
    assert.ok(iface.indexOf(name) !== -1, '接口缺能力：' + name);
  });
});

test('AC1 三个 adapter 的 formulaCapabilities 都是四格 binary 结论', function () {
  ['local', 'feishu', 'tencent'].forEach(function (id) {
    const fc = E.ADAPTERS[id].formulaCapabilities;
    CAP_KEYS.forEach(function (k) {
      assert.equal(typeof fc[k], 'boolean', id + '.' + k + ' 必须是 boolean（binary 结论）');
    });
  });
});

test('AC1 adapter 声明为纯数据、无任何可执行函数字段', function () {
  ['local', 'feishu', 'tencent'].forEach(function (id) {
    const a = E.ADAPTERS[id];
    Object.keys(a).forEach(function (k) {
      assert.notEqual(typeof a[k], 'function', k + ' 不应是可执行函数（adapter 是纯声明）');
    });
  });
});

// ---- AC3：能力位填充值与出处 ----
test('AC3 本地 Excel adapter 四格 true', function () {
  const fc = E.ADAPTERS.local.formulaCapabilities;
  CAP_KEYS.forEach(function (k) { assert.equal(fc[k], true, 'local.' + k + ' 应为 true'); });
});

test('AC3 飞书/腾讯按既有矩阵四格 false', function () {
  ['feishu', 'tencent'].forEach(function (id) {
    const fc = E.ADAPTERS[id].formulaCapabilities;
    CAP_KEYS.forEach(function (k) { assert.equal(fc[k], false, id + '.' + k + ' 应为 false'); });
  });
});

test('AC3 每个 adapter 带出处引用（evidence / source 字段非空）', function () {
  ['local', 'feishu', 'tencent'].forEach(function (id) {
    const a = E.ADAPTERS[id];
    assert.ok(typeof a.evidence === 'string' && a.evidence.trim().length > 0, id + ' 应有出处 evidence');
  });
});

// ---- AC2 / AC4：能力位 false 的动作被禁用 + 明确提示，不静默降级 ----
test('AC2 function 动作在 local（全 true）可预览，被 capabilityBlockers 判定为可用', function () {
  const st = mkState('local');
  const draft = E.buildDraft('function', null, {});
  const blockers = E.capabilityBlockers(draft, st);
  assert.deepEqual(blockers, [], 'local 下 function 不应有 blocker');
});

test('AC2 function 动作在 feishu（全 false）被禁用，capabilityBlockers 指出 canWriteFormula', function () {
  const st = mkState('feishu');
  const draft = E.buildDraft('function', null, {});
  const blockers = E.capabilityBlockers(draft, st);
  assert.ok(blockers.length > 0, 'feishu 下 function 应有 blocker');
  const joined = blockers.map(function (b) { return b.cap + '|' + b.reason; }).join(' ; ');
  assert.ok(/canWriteFormula/.test(joined), '应指出 canWriteFormula=false：' + joined);
});

test('AC2 结构化动作（extract/swap/conditional）不被公式能力位阻塞，任何 adapter 都可用', function () {
  ['local', 'feishu', 'tencent'].forEach(function (id) {
    const st = mkState(id);
    ['extract', 'swap', 'conditional'].forEach(function (k) {
      const draft = E.buildDraft(k, null, {});
      assert.deepEqual(E.capabilityBlockers(draft, st), [], id + ' 下 ' + k + ' 不应被能力位阻塞');
    });
  });
});

test('AC4 同一 function 动作：local 预览可用（invalid=false），feishu 预览被禁用（invalid=true 且提示能力位）', function () {
  const pvLocal = E.preview(mkState('local'), E.buildDraft('function', null, {}));
  assert.equal(pvLocal.invalid, false, 'local 下 function 应可预览');
  assert.equal(pvLocal.disabled, false, 'local 下 function 不应 disabled');

  const pvFeishu = E.preview(mkState('feishu'), E.buildDraft('function', null, {}));
  assert.equal(pvFeishu.invalid, true, 'feishu 下 function 应被禁用（invalid=true）');
  assert.equal(pvFeishu.disabled, true, 'feishu 下 function preview.disabled 应为 true');
  assert.ok((pvFeishu.capabilityBlockers || []).length > 0, 'feishu 下应带 capabilityBlockers');
  assert.ok(/canWriteFormula|能力位|公式/.test(pvFeishu.summary), '禁用提示应说清原因：' + pvFeishu.summary);
  // 绝不静默降级/写死值：被禁用时不产出任何 cells
  assert.deepEqual(pvFeishu.cells, [], '被禁用时不得产出 cells（不偷偷写死值）');
});

test('AC2 被禁用时 QUICK 会拦住、不执行、不写死值', function () {
  let st = mkState('tencent');
  st = E.reduce(st, { type: 'QUICK', kind: 'function', params: {} });
  // QUICK 在能力位缺失时应被 guard 拦住：stage 不应到 PREVIEWED，rows 未变
  assert.notEqual(st.stage, 'EXECUTED', 'tencent 下 function 不应执行');
  assert.equal(st.rows[0]['应发'], undefined, '不应写死值（应发不应出现）');
});

test('AC2 被禁用时 CONFIRM 会拦住（纵深防御，非法/禁用预览不可确认）', function () {
  let st = mkState('tencent');
  st = E.reduce(st, { type: 'QUICK', kind: 'function', params: {} });
  // 人为把 stage 推到 PREVIEWED、preview 标 disabled，模拟宿主绕过 QUICK guard 的漂移
  st.stage = 'PREVIEWED';
  st.preview = Object.assign({}, st.preview, { disabled: true, invalid: true });
  st = E.reduce(st, { type: 'CONFIRM' });
  assert.notEqual(st.stage, 'EXECUTED', 'disabled 预览下 CONFIRM 不应执行');
  assert.equal(st.rows[0]['应发'], undefined, '不应写死值（应发不应出现）');
});

test('AC2 被禁用时 RUN_BUTTON 会拦住（预置/固化 button 同样受能力位约束）', function () {
  let st = mkState('tencent');
  // 造一个 function kind 的固化按钮，参数齐全，adapter=tencent 应被能力位拦
  st.buttons = [{
    id: 'b1', name: '算应发', kind: 'function', source: 'user', schemaVersion: 1,
    params: { 表达式: '工时 * 时薪', 输出列: '应发', scope: 'all', 条件: '' },
  }];
  st = E.reduce(st, { type: 'RUN_BUTTON', id: 'b1' });
  assert.notEqual(st.stage, 'EXECUTED', 'tencent 下 RUN_BUTTON 不应执行');
  assert.equal(st.rows[0]['应发'], undefined, '不应写死值（应发不应出现）');
  assert.equal(st.preview, null, '被能力位拦住时不产出预览');
  assert.ok(/禁用|canWriteFormula/.test(st.note || ''), '应给出能力位禁用提示');
});

test('AC4 local 下 function 能走完整 QUICK → PREVIEWED 且有 cells', function () {
  let st = mkState('local');
  st = E.reduce(st, { type: 'QUICK', kind: 'function', params: {} });
  assert.equal(st.stage, 'PREVIEWED', 'local 下 function QUICK 应到 PREVIEWED');
  assert.ok(st.preview.cells.length > 0, 'local 下应有改动格子（公式字符串）');
});

// ---- adapter 选择与非法值 ----
test('initial 默认 adapter 为 local（无 adapter 参数时）', function () {
  const st = E.initial({ columns: COLS.slice(), rows: [] });
  assert.equal(st.adapter, 'local');
});

test('initial 保留传入的合法 adapter（id 不变）；非法 adapter 回退 local 并记 noteTone warn + 提示文案', function () {
  const good = E.initial({ columns: [], rows: [], adapter: 'feishu' });
  assert.equal(good.adapter, 'feishu', '合法 feishu 的 adapter id 应保留');
  assert.equal(E.adapterOf(good).label, E.ADAPTERS.feishu.label, 'adapterOf 应能取到 feishu 的 label');
  const bad = E.initial({ columns: [], rows: [], adapter: 'no-such' });
  assert.equal(bad.adapter, 'local', '非法 adapter 应回退 local');
  assert.equal(bad.noteTone, 'warn');
  assert.ok(typeof bad.note === 'string' && bad.note.length > 0, '非法 adapter 应有提示文案');
});

// ---- #35 / 规格 #34：三维证据状态枚举支撑的解锁判据（引擎 seam）----
// seam：lib/engine.js 的 adapter 声明 + isCapabilityUnlocked + capabilityBlockers。
// 钉住：三值枚举导出、仅 verified-true 解锁、无 opt-in 绕过口、非解锁态一律 blocker+提示。
const EVIDENCE_STATUS_ALL = Object.values(E.EVIDENCE_STATUS);

test('#35 AC1 引擎导出三值证据状态枚举 EVIDENCE_STATUS（冻结常量）', function () {
  const S = E.EVIDENCE_STATUS;
  assert.ok(S, 'E.EVIDENCE_STATUS 应导出');
  assert.equal(S.VERIFIED_TRUE, 'verified-true');
  assert.equal(S.VERIFIED_FALSE, 'verified-false');
  assert.equal(S.UNVERIFIED_DEFAULT_FALSE, 'unverified-default-false');
  assert.equal(Object.isFrozen(S), true, 'EVIDENCE_STATUS 应被冻结（不可在运行时改写三值）');
});

test('#35 AC1 三个 adapter 各自声明 formulaEvidenceStatus 四格且值合法', function () {
  ['local', 'feishu', 'tencent'].forEach(function (id) {
    const m = E.ADAPTERS[id].formulaEvidenceStatus;
    assert.ok(m, id + ' 缺 formulaEvidenceStatus');
    CAP_KEYS.forEach(function (k) {
      assert.ok(EVIDENCE_STATUS_ALL.indexOf(m[k]) !== -1, id + '.' + k + ' 证据状态非法：' + m[k]);
    });
  });
});

test('#35 AC2 isCapabilityUnlocked 恰好两个参数（无 opt-in 覆盖口）', function () {
  assert.equal(typeof E.isCapabilityUnlocked, 'function', '应导出纯函数 isCapabilityUnlocked');
  assert.equal(E.isCapabilityUnlocked.length, 2, 'isCapabilityUnlocked 应只接 (adapterId, bit)，不接受强制解锁参数');
});

test('#35 AC2 只有 verified-true 解锁：local 四格全解锁', function () {
  CAP_KEYS.forEach(function (k) {
    assert.equal(E.isCapabilityUnlocked('local', k), true, 'local.' + k + ' 应解锁');
  });
});

test('#35 AC2 非 verified-true 一律不解锁：飞书四格未验证、腾讯三格负面+一格未验证', function () {
  ['feishu', 'tencent'].forEach(function (id) {
    CAP_KEYS.forEach(function (k) {
      assert.equal(E.isCapabilityUnlocked(id, k), false, id + '.' + k + ' 不应解锁');
    });
  });
});

test('#35 AC2 布尔为真但证据状态非 verified-true 的漂移 adapter 仍不解锁', function () {
  const saved = E.ADAPTERS.local.formulaEvidenceStatus;
  try {
    E.ADAPTERS.local.formulaEvidenceStatus = Object.assign({}, saved, { canWriteFormula: 'unverified-default-false' });
    assert.equal(E.isCapabilityUnlocked('local', 'canWriteFormula'), false, '布尔真但状态非 verified-true 不得解锁');
  } finally {
    E.ADAPTERS.local.formulaEvidenceStatus = saved;
  }
});

test('#35 AC2 capabilityBlockers 走解锁判据：现有三 adapter 行为不回归且提示点名能力位', function () {
  assert.deepEqual(E.capabilityBlockers(E.buildDraft('function', null, {}), mkState('local')), [], 'local function 无 blocker');
  ['feishu', 'tencent'].forEach(function (id) {
    const bs = E.capabilityBlockers(E.buildDraft('function', null, {}), mkState(id));
    assert.ok(bs.length > 0, id + ' function 应有 blocker');
    assert.ok(bs.some(function (b) { return b.cap === 'canWriteFormula'; }), id + ' blocker 应点名 canWriteFormula');
    assert.ok(bs.every(function (b) { return typeof b.reason === 'string' && b.reason.length > 0; }), id + ' blocker 应带原因提示');
  });
});
