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

// ---------- 浮窗外壳：悬浮按钮 + 隐藏态浮窗面板（用户 m06260 需求） ----------
// 需求：打开 Excel 时原表不被遮挡，只浮一个小按钮；点按钮才弹出小型工作台浮窗。
// 结构保证：①始终有 position:fixed 的悬浮按钮 data-wb-fab；
//          ②浮窗面板 data-workbench-panel 始终在树里，收起态 display:none（不占位、可被测试查到）；
//          ③面板内控件（输入框/动作按钮）在收起态也在树中，只是不可见。

function shimRender(hostState) {
  const shim = makeReactShim();
  const m = { exports: {} };
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.js'), 'utf8');
  const req = (spec) => {
    if (spec === 'react') return shim.React;
    if (spec === 'react/jsx-runtime') return { jsx: shim.jsx, jsxs: shim.jsxs };
    return require(spec);
  };
  const api = new Function('module', 'exports', 'require', 'window', src + '\nreturn module.exports;')(m, m.exports, req, undefined);
  shim.beginRender();
  const tree = api.renderWorkbenchPanel(hostState);
  shim.finishRender();
  return tree;
}
function makeReactShim() {
  let inst = null;
  function useState(init) {
    const i = inst.idx++;
    if (!(i in inst.hooks)) inst.hooks[i] = (typeof init === 'function' ? init() : init);
    const set = (v) => { inst.hooks[i] = (typeof v === 'function' ? v(inst.hooks[i]) : v); };
    return [inst.hooks[i], set];
  }
  function useEffect() {}
  const jsx = (type, props, key) => ({ $$typeof: Symbol.for('react.element'), type, key, props: props || {} });
  const jsxs = jsx;
  const React = { useState, useEffect, createElement: jsx };
  return {
    React, jsx, jsxs,
    beginRender() { if (!inst) inst = { hooks: [], idx: 0 }; inst.idx = 0; },
    finishRender() {},
    runCleanups() { inst = null; }
  };
}
function findEl(node, attr, val) {
  if (!node) return null;
  if (Array.isArray(node)) { for (const c of node) { const r = findEl(c, attr, val); if (r) return r; } return null; }
  if (node && node.$$typeof === Symbol.for('react.element')) {
    if (node.props && node.props[attr] === val) return node;
    return findEl(node.props && node.props.children, attr, val);
  }
  return null;
}

test('浮窗外壳：始终渲染 position:fixed 悬浮按钮 data-wb-fab', () => {
  const tree = shimRender({ stage: 'IDLE' });
  const fab = findEl(tree, 'data-wb-fab', '1');
  assert.ok(fab, '应有悬浮按钮 data-wb-fab');
  assert.equal(fab.props.style.position, 'fixed', '悬浮按钮须 position:fixed（覆盖在原表上）');
  assert.ok(fab.props.style.zIndex >= 1000, '悬浮按钮 zIndex 要足够高，覆盖在表格之上');
});

test('浮窗外壳：收起态面板在树里但 display:none，不遮挡原表；含输入框与动作按钮', () => {
  const tree = shimRender({ stage: 'IDLE', fabOpen: false, onAction: function () {} });
  const panel = findEl(tree, 'data-workbench-panel', '1');
  assert.ok(panel, '浮窗面板应始终在 React 树里（收起态也不移除）');
  assert.equal(panel.props.style.display, 'none', '收起态面板须 display:none（不遮挡原表、不占位）');
  // 收起态内部控件仍在树里（测试可查、切换展开时无需重建）
  assert.ok(findEl(tree, 'data-wb-input', '1'), '收起态输入框仍在树中');
  assert.ok(findEl(tree, 'data-wb-action', 'understand'), '收起态「理解」按钮仍在树中');
});

test('浮窗外壳：展开态面板 display:flex 可见', () => {
  const tree = shimRender({ stage: 'IDLE', fabOpen: true, onAction: function () {} });
  const panel = findEl(tree, 'data-workbench-panel', '1');
  assert.ok(panel, '展开态应有面板');
  assert.equal(panel.props.style.display, 'flex', '展开态面板 visibility 应为 flex');
  assert.equal(panel.props.style.position, 'fixed', '面板须 position:fixed 浮窗');
});

// ---------- 表格化影响预览（用户 m06723：要真正的表格，不要「第X行 列：a → b」文字） ----------
// projectPreviewCard 的 impact 段须带整表信息（columns / rows / afterRows），且 cells 保留 rowIndex，
// 供 client 渲染成网格（受影响格高亮 before→after）。toView 负责把 columns/rows/afterRows 注入 preview。
test('表格化预览：toView 给 preview 注入 columns/rows/afterRows', () => {
  const { createSessionStore } = require('../lib/panel-session');
  let s = sampleState();
  s = E.reduce(s, { type: 'QUICK', kind: 'swap', params: { 字段A: '工时', 字段B: '时薪' } });
  const store = createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] });
  // 直接走 store.view 拿到带 columns/rows/afterRows 的 preview
  const v = store.view('dummy.xlsx', { columns: s.columns, rows: s.rows, primaryKey: s.primaryKey });
  // 上面是空态；改为用 applyAction 真正产出预览
  const v2 = store.applyAction('t2.xlsx', { columns: s.columns, rows: s.rows, primaryKey: s.primaryKey }, { type: 'quick', kind: 'swap' });
  assert.ok(v2.preview, 'QUICK swap 应产出预览');
  assert.ok(Array.isArray(v2.preview.columns) && v2.preview.columns.length > 0, 'preview 应带 columns');
  assert.ok(Array.isArray(v2.preview.rows) && v2.preview.rows.length > 0, 'preview 应带 rows');
  assert.ok(Array.isArray(v2.preview.afterRows), 'preview 应带 afterRows');
  // afterRows 应用了变更（工时/时薪对调）
  const after0 = v2.preview.afterRows[0];
  const before0 = v2.preview.rows[0];
  assert.notEqual(String(after0['工时']), String(before0['工时']), 'afterRows 应已应用对调（工时变化）');
});

test('表格化预览：projectPreviewCard.impact 带 columns/rows/afterRows，cells 保留 rowIndex', () => {
  let s = sampleState();
  s = E.reduce(s, { type: 'QUICK', kind: 'swap', params: { 字段A: '工时', 字段B: '时薪' } });
  // 补上 toView 注入的整表字段（真实链路由 store 注入；此处直接给 preview 加，模拟 store 输出）
  s.preview = Object.assign({}, s.preview, { columns: s.columns, rows: s.rows,
    afterRows: s.rows.map(function (r) { return Object.assign({}, r); }) });
  const card = C.projectPreviewCard(s);
  assert.ok(card, '应有预览卡');
  const im = card.sections.impact;
  assert.ok(Array.isArray(im.columns) && im.columns.length > 0, 'impact 应带 columns');
  assert.ok(Array.isArray(im.rows) && im.rows.length > 0, 'impact 应带 rows');
  assert.ok(Array.isArray(im.afterRows), 'impact 应带 afterRows');
  assert.ok(im.cells.length > 0 && im.cells[0].rowIndex !== undefined,
    'cells 应保留 rowIndex（表格高亮定位用）');
});

test('表格化预览：renderWorkbenchPanel 渲染出真表格 data-workbench-table（含高亮格）', () => {
  let s = sampleState();
  s = E.reduce(s, { type: 'QUICK', kind: 'swap', params: { 字段A: '工时', 字段B: '时薪' } });
  s.preview = Object.assign({}, s.preview, {
    columns: s.columns, rows: s.rows,
    afterRows: s.rows.map(function (r) { return Object.assign({}, r); })
  });
  const tree = shimRender(s);
  const table = findEl(tree, 'data-workbench-table', '1');
  assert.ok(table, '影响预览应渲染成真表格 data-workbench-table（不是逐格文字 div）');
});

// ---------- 用户 m06880：IDLE 显示原始表格 / 执行后显示最终表格且去箭头 ----------
// 注意：projectPreviewCard 读的是 hostState.preview 上的「扁平字段」（cells/columns/rows/afterRows），
// 不是 preview.sections（那是它的输出）。所以 fixture 用扁平字段。
function flatPreview(base) {
  return Object.assign({
    explanation: '对调两列', summary: '影响', affectedRows: 1, totalRows: 1, invalid: false,
    errors: [], issues: [], scope: 'all', condition: '', scopeLabel: '全部',
    paramSpec: [], adapter: 'local', adapterLabel: '本地', formulaCapabilities: {}, disabled: false, capabilityBlockers: []
  }, base);
}

// ① IDLE（stage==='IDLE'）：即便默认草稿自带 preview，也只渲染原始表格 data-workbench-orig-table，不显示「即将改」预览。
test('三态表格：IDLE 只显示原始表格（data-workbench-orig-table），不显示预览箭头', () => {
  const cols = ['姓名', '部门', '工时', '时薪'];
  const rows = [{ 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80 }];
  const fakePreview = flatPreview({ columns: cols, rows: rows, afterRows: rows, cells: [] });
  const tree = shimRender({ stage: 'IDLE', isDefaultDraft: true, preview: fakePreview, table: { columns: cols, rows: rows }, onAction: function () {} });
  assert.ok(findEl(tree, 'data-workbench-orig-table', '1'), 'IDLE 应渲染原始表格 data-workbench-orig-table');
  assert.ok(!findEl(tree, 'data-wb-changed', '0|工时'), 'IDLE 不应显示「即将改」的高亮箭头格');
});

// ② / ③ EXECUTED：只显示改后最终值（无箭头），受影响格不高亮。
function execHostState() {
  const cols = ['姓名', '部门', '工时', '时薪'];
  const rows = [{ 姓名: '阿岚', 部门: '销售', 工时: '80', 时薪: '160' }];
  return {
    stage: 'EXECUTED',
    table: { columns: cols, rows: rows },
    preview: flatPreview({ columns: cols, rows: rows, afterRows: rows,
      cells: [{ row: '阿岚', col: '工时', before: '160', after: '80', rowIndex: 0, source: 'swap' }] }),
    onAction: function () {}
  };
}

test('三态表格：EXECUTED 显示最终值 + 受影响格保留黄色高亮（但无箭头）', () => {
  const tree = shimRender(execHostState());
  assert.ok(findEl(tree, 'data-workbench-table', '1'), 'EXECUTED 应渲染表格');
  // 用户 m06880：执行后受影响格仍要高亮（标黄），因此 data-wb-changed 应仍在。
  assert.ok(findEl(tree, 'data-wb-changed', '0|工时'), 'EXECUTED 受影响格应保留黄色高亮（data-wb-changed）');
});

test('三态表格：EXECUTED 渲染文本不含箭头 →（最终值直接展示）', () => {
  const tree = shimRender(execHostState());
  const texts = [];
  (function walk(n) {
    if (!n) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n !== 'object') return;
    if (n.$$typeof === Symbol.for('react.element') && (n.type === 'td' || n.type === 'th')) {
      (function collect(x) {
        if (x == null) return;
        if (typeof x === 'string' || typeof x === 'number') { texts.push(String(x)); return; }
        if (Array.isArray(x)) { x.forEach(collect); return; }
        collect(x.props && x.props.children);
      })(n.props && n.props.children);
      return;
    }
    walk(n.props && n.props.children);
  })(tree);
  assert.ok(texts.length > 0, '应有表格单元格文本');
  assert.ok(!texts.some(function (t) { return t.indexOf('→') !== -1; }), 'EXECUTED 单元格不应含箭头 →');
  assert.ok(texts.indexOf('80') !== -1 && texts.indexOf('160') !== -1, 'EXECUTED 应显示最终值 80 / 160');
});
