'use strict';
// 面板投影行为测试（补齐 panel-smoke.test.js 的盲区）——规格 #8：面板只承担「解释与影响预览」。
// panel-smoke 只验证了「包能注册 + 一个 happy path 预览卡」；这里把 projectPreviewCard 的
// 六段（5 主 + 1 能力位辅助段）与 projectButtonLibrary 的双来源投影逐段钉住：
//   · 预览卡六段各自字段来自引擎真实计算、非死数据；
//   · 校验失败卡：第②段列出失败项、canConfirm=false（禁用确认）；
//   · 能力位禁用卡：第⑥段 disabled/blockers 如实带出；
//   · 按钮库：preset + user 双来源合并、source 可区分、p* / b* id 空间不冲突、运行态标记带出。
// 纯 view-model，无 DOM / 无 React。直接用 client/index.js 源码（不依赖 engine），喂真实引擎状态。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const E = require('../lib/engine');
const H = require('../lib/panel-state');
const C = require(path.join(__dirname, '..', 'client', 'index.js'));

function sampleState() {
  return E.initial({
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪'],
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80 },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80 }
    ],
    sources: { '外勤登记表.csv': { rows: [{ 姓名: '阿岚', 邮箱: 'a@x.com' }, { 姓名: '柏舟', 邮箱: 'b@x.com' }] } }
  });
}

function previewExtract() {
  let s = sampleState();
  s = E.reduce(s, { type: 'SET_INPUT', text: '从外勤登记表把邮箱提出来' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  s = E.reduce(s, { type: 'PREVIEW' });
  return s;
}

// ---------- 预览卡：六段齐全 + 数据来自真实计算 ----------

test('预览卡六段齐全：①②③④⑤ 主五段 + ⑥ 能力位辅助段', () => {
  const card = C.projectPreviewCard(previewExtract());
  const s = card.sections;
  for (const k of ['explain', 'validation', 'scopeParams', 'impact', 'confirm', 'capability']) {
    assert.ok(s[k], '缺段：' + k);
  }
});

test('第①段 explain：kind / label / medium / params / steps 来自 draft', () => {
  const card = C.projectPreviewCard(previewExtract());
  const ex = card.sections.explain;
  assert.equal(ex.kind, 'extract');
  assert.equal(ex.label, '提取字段');
  assert.ok(ex.medium.length > 0, 'medium 非空');
  assert.ok(Array.isArray(ex.steps) && ex.steps.length > 0, 'steps 是步骤数组');
  assert.equal(ex.params['取哪一列'], '邮箱');
});

test('第②段 validation：合法预览 ok=true、issues 空；失败预览 ok=false 且列出 issue + currentValue', () => {
  const good = C.projectPreviewCard(previewExtract());
  assert.equal(good.sections.validation.ok, true);
  assert.equal(good.sections.validation.issues.length, 0);

  // 构造非法配方：未知字段（封闭白名单外）→ validate 拒绝 → 预览卡仍出、validation.ok=false
  let s = sampleState();
  const badDraft = E.buildDraft('swap', null, { 字段A: '不存在的列', 字段B: '部门' });
  const pv = E.preview(s, badDraft);
  s = Object.assign({}, s, { stage: 'PREVIEWED', draft: badDraft, preview: pv });
  const card = C.projectPreviewCard(s);
  assert.ok(card, '校验失败也要出卡（不返回 null）');
  assert.equal(card.sections.validation.ok, false);
  assert.ok(card.sections.validation.issues.length > 0, '失败项必须逐条列出');
  // 每条 issue 带 field / reason / currentValue（供宿主渲染就地修正控件）
  const it = card.sections.validation.issues[0];
  assert.ok('field' in it && 'reason' in it && 'currentValue' in it);
});

test('第③段 scopeParams：scope / condition / scopeLabel + typed paramSpec 原样投影', () => {
  const card = C.projectPreviewCard(previewExtract());
  const sp = card.sections.scopeParams;
  assert.equal(sp.scope, 'all');
  assert.equal(sp.scopeLabel, '全部');
  assert.ok(Array.isArray(sp.paramSpec) && sp.paramSpec.length > 0, 'paramSpec 带出 typed 声明');
  const one = sp.paramSpec[0];
  for (const k of ['key', '类型', '必填', '默认值', '约束']) {
    assert.ok(k in one, 'paramSpec 项缺字段：' + k);
  }
});

test('第④段 impact：cells / summary / affectedRows / totalRows 来自引擎实际计算', () => {
  const card = C.projectPreviewCard(previewExtract());
  const im = card.sections.impact;
  assert.equal(im.totalRows, 2);
  assert.equal(im.affectedRows, 2);
  assert.equal(im.cells.length, 2);
  assert.match(im.summary, /影响 2 行 \/ 共 2 行/);
  // 逐格带 before→after
  const c0 = im.cells[0];
  assert.ok('row' in c0 && 'col' in c0 && 'before' in c0 && 'after' in c0);
});

test('第⑤段 confirm：只在校验通过且 stage=PREVIEWED 时 canConfirm=true，否则禁用', () => {
  const previewed = previewExtract();
  assert.equal(C.projectPreviewCard(previewed).sections.confirm.canConfirm, true);

  // stage 退回 UNDERSTOOD（尚未预览）→ 即便有 preview 对象也不能确认
  const notPreviewed = Object.assign({}, previewed, { stage: 'UNDERSTOOD' });
  assert.equal(C.projectPreviewCard(notPreviewed).sections.confirm.canConfirm, false);
});

test('第⑥段 capability：本地 adapter 四格 true、不 disabled；飞书 function 动作 disabled 且带 blocker', () => {
  const local = C.projectPreviewCard(previewExtract());
  assert.equal(local.sections.capability.adapter, 'local');
  assert.equal(local.sections.capability.disabled, false);

  // 飞书 adapter 上跑 function（公式）→ 能力位挡下 → 预览卡 disabled + blockers
  let s = E.initial({
    adapter: 'feishu', primaryKey: '姓名', columns: ['姓名', '工时', '时薪'],
    rows: [{ 姓名: '阿岚', 工时: 160, 时薪: 80 }]
  });
  const fDraft = E.buildDraft('function', null, { 表达式: '工时 * 时薪', 输出列: '应发' });
  const fPv = E.preview(s, fDraft);
  s = Object.assign({}, s, { stage: 'PREVIEWED', draft: fDraft, preview: fPv });
  const card = C.projectPreviewCard(s);
  assert.equal(card.sections.capability.disabled, true, '飞书 function 应 disabled');
  assert.equal(card.sections.capability.adapter, 'feishu');
  assert.ok(card.sections.capability.blockers.length > 0, '应带能力位 blocker 原因');
  assert.equal(card.sections.confirm.canConfirm, false, '禁用动作不能确认');
});

// ---------- 按钮库：双来源投影 ----------

test('按钮库双来源：preset + user 合并、source 可区分、p* / b* id 不冲突、运行态标记带出', () => {
  const s = E.initial({
    registryButtons: [
      { id: 'p1', name: '预置A', kind: 'extract', source: 'preset', schemaVersion: 1,
        params: { 来源文件: 'a.csv', 匹配列: '姓名', 取哪一列: '邮箱', 写到: '邮箱', scope: 'all', 条件: '' } }
    ],
    buttons: [
      { id: 'b1', name: '我的按钮', kind: 'swap', source: 'user', schemaVersion: 1,
        params: { 字段A: '部门', 字段B: '备注', scope: 'all', 条件: '' }, lastAffectedRows: 3, emptyRun: false }
    ]
  });
  const lib = C.projectButtonLibrary(s);
  assert.equal(lib.total, 2);
  // 预置在前、固化在后
  assert.equal(lib.buttons[0].source, 'preset');
  assert.equal(lib.buttons[1].source, 'user');
  // id 空间不冲突
  assert.ok(lib.buttons[0].id.startsWith('p'));
  assert.ok(lib.buttons[1].id.startsWith('b'));
  // 运行态标记如实带出
  assert.equal(lib.buttons[1].lastAffectedRows, 3);
  assert.equal(lib.buttons[1].emptyRun, false);
  // 声明式、无函数/内部引用
  for (const b of lib.buttons) {
    for (const v of Object.values(b)) assert.notEqual(typeof v, 'function');
  }
});

test('按钮库：空状态 total=0、buttons=[]', () => {
  const lib = C.projectButtonLibrary(E.initial({}));
  assert.equal(lib.total, 0);
  assert.deepEqual(lib.buttons, []);
});

test('按钮库 projectOne：未知/无 source 默认 user、无 schemaVersion 默认 SCHEMA_VERSION（向后兼容）', () => {
  const s = E.initial({ buttons: [{ id: 'bx', name: '旧按钮', kind: 'extract', params: {} }] });
  const lib = C.projectButtonLibrary(s);
  assert.equal(lib.buttons[0].source, 'user');
  assert.equal(lib.buttons[0].schemaVersion, E.SCHEMA_VERSION);
});

test('#45 default 默认配方按钮 source 原样保留为 default（不被 projectOne 塌成 user）', () => {
  const s = H.buildPanelState({
    columns: ['姓名', '部门', '工时', '时薪'],
    rows: [{ 姓名: 'A', 部门: '销售', 工时: 160, 时薪: 80 }, { 姓名: 'B', 部门: '技术', 工时: 176, 时薪: 80 }],
    draft: null
  });
  const lib = C.projectButtonLibrary(s);
  assert.equal(lib.total, 1, '只有默认按钮时 total=1');
  const defBtn = lib.buttons.filter(function (b) { return b.source === 'default'; })[0];
  assert.ok(defBtn, '默认配方按钮应保留 source=default（不被塌成 user）');
  assert.equal(defBtn.kind, 'swap');
  assert.equal(defBtn.id, '__default__');
});

// ---------- labelOfKind 漂移防护 ----------

test('按钮库 dedupe 动作显示中文短名，不再回退成原始 "dedupe"', () => {
  const s = E.initial({
    registryButtons: [{ id: 'p2', name: '按姓名去重', kind: 'dedupe', source: 'preset', schemaVersion: 1,
      params: { 保留策略: '首条', scope: 'all', 条件: '' } }]
  });
  const lib = C.projectButtonLibrary(s);
  assert.equal(lib.buttons[0].label, '按主键去重');
  assert.notEqual(lib.buttons[0].label, 'dedupe', '不得回退成原始 kind 名');
  assert.equal(lib.buttons[0].kind, 'dedupe', 'kind 字段仍保留原始机器名');
});

test('labelOfKind 镜像不漂移：每个引擎 KINDS 都能拿到与 KINDS.short 一致的中文名', () => {
  // client 手工镜像引擎 KINDS.short；此测试保证新增/改名 kind 时两处一致（防 low 漂移）。
  for (const kind of Object.keys(E.KINDS)) {
    const s = E.initial({ buttons: [{ id: 'b_' + kind, name: 'x', kind, params: {} }] });
    const projected = C.projectButtonLibrary(s).buttons[0];
    assert.equal(projected.label, E.KINDS[kind].short,
      'kind=' + kind + ' 的按钮库 label 应等于引擎 KINDS.short');
  }
});
