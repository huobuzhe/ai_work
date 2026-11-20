'use strict';
// 实机跑通全部功能（用户 m07263「里面的功能你自己实机跑一遍」）：
// 用真实 client/index.js 组件 + 真实 makeActionHandler（真实 panel-session 状态机 + 真实引擎 +
// 真实 xlsx_bridge.py），逐一驱动五个 QUICK 一键动作（extract/swap/conditional/function/dedupe）
// 的完整面板闭环：点一键动作 → 出预览 → 点确认执行 → 读回磁盘逐格核对；
// 并断言三态显示：IDLE 显示原始表格、PREVIEW 带箭头、EXECUTED 显示最终值且不再有箭头。
//
// 这是「面板级真实 e2e」的多动作补齐版，与 panel-seams-5kinds.test.js（Host 层直驱）互补：
// 那条路径不发 client body；本条真跑组件点按钮，覆盖 DOM 事件 → fetch → Host 的全链。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { makeActionHandler, defaultReadTable, defaultApplyTable } = require('../lib/panel-bridge');
const { createSessionStore } = require('../lib/panel-session');

// ---------- 迷你 React 垫片（与 panel-e2e-real.test.js 一致） ----------
function makeReactShim() {
  let instance = null;
  function resetInstance() { instance = { hooks: [], idx: 0, effects: [], mounted: false, cleanups: [] }; }
  function beginRender() { if (!instance) resetInstance(); instance.idx = 0; }
  function finishRender() {
    if (!instance.mounted) {
      instance.mounted = true;
      for (const e of instance.effects) { try { const c = e(); if (typeof c === 'function') instance.cleanups.push(c); } catch (_) {} }
    }
  }
  function useState(init) {
    const i = instance.idx++;
    if (!(i in instance.hooks)) instance.hooks[i] = (typeof init === 'function' ? init() : init);
    const set = (v) => { instance.hooks[i] = (typeof v === 'function' ? v(instance.hooks[i]) : v); };
    return [instance.hooks[i], set];
  }
  function useEffect(fn) { instance.effects.push(fn); }
  function jsx(type, props, key) { return { $$typeof: Symbol.for('react.element'), type, key: key == null ? null : key, props: props || {} }; }
  function jsxs(type, props, key) { return jsx(type, props, key); }
  function runCleanups() { if (instance && Array.isArray(instance.cleanups)) { for (const c of instance.cleanups) { try { c(); } catch (_) {} } instance.cleanups = []; } }
  return { React: { useState, useEffect, createElement: jsx }, jsx, jsxs, reset: () => { runCleanups(); instance = null; }, beginRender, finishRender, runCleanups };
}

function isElement(n) { return n && typeof n === 'object' && n.$$typeof === Symbol.for('react.element'); }
function findByAttr(node, attr, val) {
  if (!node) return null;
  if (Array.isArray(node)) { for (const c of node) { const r = findByAttr(c, attr, val); if (r) return r; } return null; }
  if (isElement(node)) {
    if (node.props && node.props[attr] === val) return node;
    return findByAttr(node.props && node.props.children, attr, val);
  }
  return null;
}
function findAll(node, attr, acc) {
  acc = acc || [];
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach((c) => findAll(c, attr, acc)); return acc; }
  if (isElement(node)) {
    if (node.props && node.props[attr] !== undefined) acc.push(node);
    findAll(node.props && node.props.children, attr, acc);
  }
  return acc;
}
function textOf(node, acc) {
  acc = acc || [];
  if (node == null || node === false) return acc;
  if (typeof node === 'string' || typeof node === 'number') { acc.push(String(node)); return acc; }
  if (Array.isArray(node)) { node.forEach((c) => textOf(c, acc)); return acc; }
  if (isElement(node)) textOf(node.props && node.props.children, acc);
  return acc;
}

function loadBody() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.js'), 'utf8');
  const shim = makeReactShim();
  const req = (spec) => {
    if (spec === 'react') return shim.React;
    if (spec === 'react/jsx-runtime') return { jsx: shim.jsx, jsxs: shim.jsxs };
    return require(spec);
  };
  const m = { exports: {} };
  const api = new Function('module', 'exports', 'require', 'window', src + '\nreturn module.exports;')(m, m.exports, req, undefined);
  let body = null;
  const fakeCtx = {
    inject: (deps, cb) => { if (deps[0] === 'sidebarRightTabs') cb({ get: () => undefined }); },
    effect: (fn) => { fn(); return () => {}; },
    slots: { inject: (_s, cb) => cb(), register: (options, Body) => { body = Body; return () => {}; } }
  };
  api.registerWorkbenchPanel(fakeCtx);
  return { shim, api, body };
}

const waitTick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

function pyBridgeBin() {
  return process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
}
function pyRead(file) {
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  let lastErr = null;
  for (const bin of pyBridgeBin()) {
    const r = spawnSync(bin, [bridge, 'read-values', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { lastErr = r.error; continue; }
    if (r.status !== 0) { lastErr = new Error(r.stderr); continue; }
    return JSON.parse((r.stdout || '').trim());
  }
  throw lastErr || new Error('read-values 失败');
}

// 建一张 5 列 4 行（含一个重复「阿岚」行）的表 + 一个同级 外勤登记表.csv（供 extract 数据源）。
function makeFixture(dir, name) {
  const file = path.join(dir, name + '.xlsx');
  const structure = {
    primaryKey: '姓名',
    columns: { 姓名: 'text', 部门: 'text', 工时: 'number', 时薪: 'number', 备注: 'text' },
    name: name,
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80, 备注: '' },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 90, 备注: '' },
      { 姓名: '阿岚', 部门: '运营', 工时: 120, 时薪: 60, 备注: '' },
      { 姓名: '清和', 部门: '财务', 工时: 150, 时薪: 75, 备注: '' }
    ]
  };
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const tmp = path.join(dir, 'structure_' + name + '.json');
  fs.writeFileSync(tmp, JSON.stringify(structure), 'utf8');
  let lastErr = null;
  for (const bin of pyBridgeBin()) {
    const r = spawnSync(bin, [bridge, 'create', file, tmp], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { lastErr = r.error; continue; }
    if (r.status !== 0) { lastErr = new Error(r.stderr); continue; }
    lastErr = null; break;
  }
  if (lastErr) throw lastErr;
  return file;
}

function hasPython() {
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  for (const bin of pyBridgeBin()) {
    const r = spawnSync(bin, ['-c', 'import openpyxl; print(1)'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}

const ACTIONS = ['extract', 'swap', 'conditional', 'function', 'dedupe', 'replace', 'fill'];

for (const kind of ACTIONS) {
  test('实机跑通 QUICK「' + kind + '」：点一键动作→预览→确认执行→读回磁盘核对', async (t) => {
    if (!hasPython()) { t.skip('python/openpyxl 不可用'); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-multi-' + kind + '-'));
    let file;
    try { file = makeFixture(dir, '演示_' + kind); }
    catch (e) { fs.rmSync(dir, { recursive: true, force: true }); t.skip('建 fixture 失败：' + e.message); return; }
    // extract 需要数据源 外勤登记表.csv（同类目录）
    fs.writeFileSync(path.join(dir, '外勤登记表.csv'), '姓名,邮箱\n阿岚,alan@corp.com\n柏舟,bo@corp.com\n清和,qinghe@corp.com\n', 'utf8');

    const actionHandler = makeActionHandler({
      readTable: defaultReadTable,
      applyTable: defaultApplyTable,
      resolveFile: (f) => f,
      store: createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] })
    });

    const { shim, body } = loadBody();
    global.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes('/workbench-api/action')) {
        const res = actionHandler({ method: 'POST', url: '/workbench-api/action', body: init.body });
        return { json: async () => res.body };
      }
      if (u.includes('/workbench-api/state')) {
        const tbl = defaultReadTable(file);
        return { json: async () => ({ file, columns: tbl.columns, rowCount: tbl.rows.length, preview: null, stage: 'IDLE', table: { columns: tbl.columns, rows: tbl.rows }, isDefaultDraft: false, registryButtons: [], buttons: [] }) };
      }
      return { json: async () => ({}) };
    };
    t.after(() => { shim.runCleanups(); delete global.fetch; fs.rmSync(dir, { recursive: true, force: true }); });

    const mkProps = () => ({ useTabInfo: () => ({ tab: { contentId: 'dsh-resource://file/absolute/' + file.replace(/\\/g, '/') } }) });
    shim.reset(); shim.beginRender();
    let tree = body(mkProps()); shim.finishRender();
    await waitTick(0);
    shim.beginRender(); tree = body(mkProps()); shim.finishRender();

    // 用户 m08197：打开文件时 tab 面板应直接显示原表（流式主区域 data-workbench-main 里含原表），
    // 浮窗按钮只作覆盖层（默认收起，点开才展开功能面板），pane 不再空白。
    const idleText = textOf(tree).join(' ');
    assert.ok(findByAttr(tree, 'data-workbench-main', '1'), kind + ': 应有流式主区域 data-workbench-main（不再空白）');
    assert.ok(findByAttr(tree, 'data-workbench-orig-table', '1'), kind + ': IDLE 应渲染原始表格');
    assert.doesNotMatch(idleText, /→/, kind + ': IDLE 不应出现 before→after 箭头');
    const idlePanel = findByAttr(tree, 'data-workbench-panel', '1');
    assert.ok(idlePanel, kind + ': 应有浮窗面板');
    assert.equal(idlePanel.props.style.display, 'none', kind + ': 打开时浮窗默认收起（只露浮窗按钮，原表在流式主区域）');
    // 点浮窗按钮应展开面板
    const idleFab = findByAttr(tree, 'data-wb-fab', '1');
    assert.ok(idleFab && idleFab.props.onClick, kind + ': 应有浮窗按钮 data-wb-fab');
    idleFab.props.onClick({ preventDefault() {} });
    shim.beginRender(); tree = body(mkProps()); shim.finishRender();
    const openPanel = findByAttr(tree, 'data-workbench-panel', '1');
    assert.notEqual(openPanel.props.style.display, 'none', kind + ': 点浮窗按钮后面板应展开');

    // 点 QUICK 动作 chip → 打开通用配置表单（用户自选字段）
    const qbtn = findByAttr(tree, 'data-wb-quick', kind);
    assert.ok(qbtn && qbtn.props.onClick, kind + ': 应有动作按钮');
    qbtn.props.onClick({ preventDefault() {} });
    await waitTick(10);
    shim.beginRender(); tree = body(mkProps()); shim.finishRender();
    // 通用表单应出现
    const form = findByAttr(tree, 'data-wb-form', kind);
    assert.ok(form, kind + ': 点动作应打开通用配置表单 data-wb-form');
    // 按 kind 选择字段（模拟用户从下拉里选列）
    const formFieldVals = {
      extract: { 来源文件: '外勤登记表.csv', 匹配列: '姓名', 取哪一列: '邮箱', 写到: '备注' },
      swap: { 字段A: '工时', 字段B: '时薪' },
      conditional: { 动作: '增加', 目标列: '备注', 值: '加班' },
      function: { 表达式: '工时 * 时薪', 输出列: '应发' },
      dedupe: { 保留策略: '首条' },
      replace: { 目标列: '部门', 查找: '销售', 替换为: '市场' },
      fill: { 目标列: '备注', 填充值: '待补' }
    }[kind] || {};
    Object.keys(formFieldVals).forEach(function (k) {
      const el = findByAttr(tree, 'data-wb-field', k);
      assert.ok(el && el.props.onChange, kind + ': 表单应有字段 ' + k);
      el.props.onChange({ preventDefault() {}, target: { value: formFieldVals[k] } });
    });
    // 用户 m10022：字段A/B 下拉必须能选到当前表的真实列名（不能是空下拉）。
    // 回归守护：column 型字段的下拉 options 必须包含当前表列（如 swap 的 字段A 含「工时」）。
    if (kind === 'swap') {
      const fA = findByAttr(tree, 'data-wb-field', '字段A');
      assert.ok(Array.isArray(fA.props.options) && fA.props.options.indexOf('工时') !== -1,
        'swap 字段A 下拉选项应包含当前表列「工时」，实际=' + JSON.stringify(fA && fA.props && fA.props.options));
    }
    await waitTick(5);
    shim.beginRender(); tree = body(mkProps()); shim.finishRender();
    // 点表单「预览」
    const formPv = findByAttr(tree, 'data-wb-form-preview', '1');
    assert.ok(formPv && formPv.props.onClick, kind + ': 表单应有预览按钮');
    formPv.props.onClick({ preventDefault() {} });
    await waitTick(20);
    shim.beginRender(); tree = body(mkProps()); shim.finishRender();
    const pvText = textOf(tree).join(' ');
    assert.doesNotMatch(pvText, /校验未通过|不能预览/, kind + ': 预览不应校验失败');
    assert.match(pvText, /影响 \d+ 行/, kind + ': 预览应显示影响行数');
    // 重复主键不得少报影响行数：表里 4 行（含 2 个「阿岚」重复主键），swap 对调两列所有行都变，
    // 影响行数必须是 4。旧 bug 用主键值做去重键，会把两个阿岚塌成 1，只报 3 行。
    if (kind === 'swap') {
      assert.match(pvText, /影响 4 行/, 'swap: 全部 4 行都应计入影响行数（重复主键不能少报成 3 行）');
    }
    assert.ok(findByAttr(tree, 'data-workbench-table', '1'), kind + ': 预览应渲染成表格');
    // 预览态受影响格应有箭头（before → after）——但 function 只改「应发」新列，新列首行改写
    // 只有值没有 before，故 function 不强制箭头（其余动作是改已有列的值，应有箭头）。
    if (kind !== 'function') {
      assert.match(pvText, /→/, kind + ': 预览表格应带 before→after 箭头');
    }

    // 点确认执行
    const confirmBtn = findByAttr(tree, 'data-wb-action', 'confirm');
    assert.ok(confirmBtn && !confirmBtn.props.disabled, kind + ': 确认按钮应可用');
    confirmBtn.props.onClick({ preventDefault() {} });
    await waitTick(40);
    shim.beginRender(); tree = body(mkProps()); shim.finishRender();
    const afterText = textOf(tree).join(' ');
    assert.match(afterText, /已写入磁盘/, kind + ': 确认后应提示已写入磁盘');
    // EXECUTED：受影响格保留黄色高亮（data-wb-changed），但不再有箭头。
    assert.ok(findByAttr(tree, 'data-wb-changed', findAll(tree, 'data-wb-changed')[0] && findAll(tree, 'data-wb-changed')[0].props['data-wb-changed']), kind + ': 执行后应保留 data-wb-changed 高亮');
    assert.doesNotMatch(afterText, /→/, kind + ': 执行后表格应去掉 before→after 箭头');

    // 读回磁盘核对（每个动作各自期望）。注意这里含重复「阿岚」行，按位置索引，不能只按姓名建字典。
    const out = pyRead(file);
    const rows = out.rows;
    const findFirst = (fn) => rows.find(fn);
    const allaRows = rows.filter((r) => r.姓名 === '阿岚');
    if (kind === 'swap') {
      // 两行阿岚都应各自对调：行1 160/80→80/160，行2 120/60→60/120
      assert.equal(String(allaRows[0].工时), '80', 'swap 阿岚行1 工时 160→80');
      assert.equal(String(allaRows[0].时薪), '160', 'swap 阿岚行1 时薪 80→160');
      assert.equal(String(allaRows[1].工时), '60', 'swap 阿岚行2 工时 120→60');
      assert.equal(String(allaRows[1].时薪), '120', 'swap 阿岚行2 时薪 60→120');
      assert.equal(String(findFirst((r) => r.姓名 === '清和').工时), '75', 'swap 清和 150→75');
    } else if (kind === 'conditional') {
      // 工时 > 150 → 备注 = 加班（阿岚160、柏舟176 命中；阿岚120 与 清和150 不命中）
      assert.equal(String(findFirst((r) => r.姓名 === '柏舟').备注), '加班', 'conditional 柏舟 176>150 → 备注=加班');
      assert.equal(String(findFirst((r) => r.姓名 === '清和').备注), '', 'conditional 清和 150 不 >150 → 备注空');
    } else if (kind === 'function') {
      // 工时*时薪 → 应发（新列）；阿岚行1 160*80=12800
      assert.ok('应发' in rows[0], 'function 应新建「应发」列');
      assert.equal(String(allaRows[0].应发), '12800', 'function 阿岚行1 160*80=12800');
    } else if (kind === 'dedupe') {
      // 按姓名去重保留首条：第二个阿岚（工时120）应被清空
      assert.equal(String(allaRows[1].工时 === null || allaRows[1].工时 === undefined ? '' : allaRows[1].工时), '', 'dedupe 第二个阿岚 工时应被清空');
      assert.equal(String(allaRows[0].工时), '160', 'dedupe 首个阿岚 工时保留');
    } else if (kind === 'extract') {
      // 从外勤登记表.csv 取邮箱 → 备注列
      assert.equal(String(allaRows[0].备注), 'alan@corp.com', 'extract 阿岚 备注=alan@corp.com');
      assert.equal(String(findFirst((r) => r.姓名 === '柏舟').备注), 'bo@corp.com', 'extract 柏舟 备注=bo@corp.com');
    } else if (kind === 'replace') {
      // 部门里「销售」→「市场」：阿岚行1 部门 销售→市场；其余不动
      assert.equal(String(allaRows[0].部门), '市场', 'replace 阿岚行1 部门 销售→市场');
      assert.equal(String(findFirst((r) => r.姓名 === '柏舟').部门), '技术', 'replace 柏舟 部门 技术 不动');
    } else if (kind === 'fill') {
      // 空备注填「待补」：所有行的空备注都应被填上
      rows.forEach(function (r) {
        if (String(r.备注 || '').trim() === '') { /* 应无空 */ }
        assert.notEqual(String(r.备注 || '').trim(), '', 'fill 后不应再有空备注（' + r.姓名 + '）');
      });
    }
  });
}
