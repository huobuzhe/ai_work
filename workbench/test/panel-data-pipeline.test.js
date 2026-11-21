'use strict';
// 票 #41：workbench 面板接入真实数据管道（Host 投影 state.preview → 右栏面板）。
// seam A（Host 纯函数）：buildPanelState(cols) —— 把「已解析的表格数据 + 一份草稿配方」
//   合成面板真正要显示的视图模型（含真实 preview）。输入吃**已解析的 {columns,headers,rows}**，
//   不依赖 python / 文件系统 / 网络，纯可测。
// seam B（client 渲染）：renderWorkbenchPanel(视图模型) 渲染出含「影响 N 行」的合法 React 树
//   （本文件只覆盖 seam A；seam B 在 render-children/后续切片覆盖）。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const E = require('../lib/engine');
const H = require(path.join(__dirname, '..', 'lib', 'panel-state.js'));

// 解析后的表格数据（模拟 xlsx_bridge.py 输出形态：列名 + 行对象）
function parsed() {
  return {
    columns: ['姓名', '部门', '工时', '时薪'],
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80 },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80 }
    ]
  };
}

// ---------- seam A：buildPanelState 把「数据 + 草稿」变成真实 preview 视图模型 ----------

test('buildPanelState：给定解析数据 + 调换草稿，产出含真实 preview 的面板视图模型', () => {
  const p = parsed();
  // 用引擎自己的 buildDraft 造一份真实草稿（不手搓 preview 对象）。
  // 选 swap（调换当前表两列）——它作用在本表自身列上，无需外部数据源即可产出合法预览；
  // extract 需要 sources 里声明「来源文件」，裸列表做不出合法预览。
  const draft = E.buildDraft('swap', null, { 字段A: '部门', 字段B: '工时', scope: 'all', 条件: '' });

  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: draft });

  // 视图模型必须带一份**真实** preview（不是 null / 空壳）
  assert.ok(vm, '应产出视图模型');
  assert.ok(vm.preview, '应带真实 preview');
  assert.equal(vm.preview.affectedRows, 2, '影响行数来自引擎真实计算');
  assert.equal(vm.preview.totalRows, 2, '总行数来自数据');
  assert.match(vm.preview.summary, /影响 2 行 \/ 共 2 行/);
});

test('buildPanelState：非法草稿也产出 preview（invalid=true、带 errors），不返回 null/空壳', () => {
  const p = parsed();
  // 引用不存在的列 → validate 拒绝 → preview.invalid=true 且带 errors
  const badDraft = E.buildDraft('swap', null, { 字段A: '不存在的列', 字段B: '工时', scope: 'all', 条件: '' });
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: badDraft });
  assert.ok(vm.preview, '校验失败也要出 preview（不能 null）');
  assert.equal(vm.preview.invalid, true);
  assert.ok(Array.isArray(vm.preview.errors) && vm.preview.errors.length > 0, '应带失败原因');
  assert.equal(vm.preview.affectedRows, 0, '校验失败影响 0 行');
});

test('buildPanelState：无草稿但有 ≥2 列时自动派生默认配方（swap 前两列），产出真实 preview', () => {
  const p = parsed();
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: null });
  assert.equal(vm.isDefault, true, '应标记为默认配方');
  assert.ok(vm.preview, '默认配方也要出真实 preview（不再是 null/暂无预览）');
  assert.equal(vm.preview.affectedRows, 2, '默认 swap 作用于全部行');
  assert.match(vm.preview.summary, /影响 2 行 \/ 共 2 行/);
});

test('buildPanelState：无草稿且不足 2 列时 preview=null（IDLE，没有可用默认配方）', () => {
  const vm = H.buildPanelState({ columns: ['唯一列'], rows: [{ 唯一列: 1 }], draft: null });
  assert.equal(vm.preview, null);
  assert.equal(vm.stage, 'IDLE');
  assert.equal(vm.isDefault, false);
});

// ---------- seam B：client 把 buildPanelState 产出的视图模型渲染成含「影响 N 行」的 React 树 ----------
// 复用 render-children.test.js 的加载法：注入本地 react/jsx-runtime，把 client 源码当模块执行。
function loadClientRender() {
  const fs = require('fs');
  const bases = [path.join(__dirname, '..', 'node_modules'),
    'F:/deepseek_haeness_inload/resources/app.asar/dsh/node_modules'];
  const tryResolve = (name) => { for (const b of bases) { try { return require.resolve(name, { paths: [b] }); } catch (_) {} } return null; };
  const reactPath = tryResolve('react');
  const jsxPath = tryResolve('react/jsx-runtime');
  const serverPath = tryResolve('react-dom/server');
  if (!reactPath || !jsxPath || !serverPath) return null;
  const rt = require(jsxPath);
  const React = require(reactPath);
  const Server = require(serverPath);
  let src = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.js'), 'utf8');
  src += '\nmodule.exports.renderWorkbenchPanel = renderWorkbenchPanel;\n';
  const m = { exports: {} };
  const req = (spec) => (spec === 'react/jsx-runtime') ? rt : (spec === 'react' ? React : require(spec));
  const api = new Function('module', 'exports', 'require', src + '\nreturn module.exports;')(m, m.exports, req);
  return { api, Server };
}

test('seam B：renderWorkbenchPanel(buildPanelState 视图模型) 渲染出「影响 2 行 / 共 2 行」', (t) => {
  const h = loadClientRender();
  if (!h) { t.skip('react 不可解析，跳过渲染 seam'); return; }
  const p = parsed();
  const draft = E.buildDraft('swap', null, { 字段A: '部门', 字段B: '工时', scope: 'all', 条件: '' });
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: draft });
  const html = h.Server.renderToStaticMarkup(h.api.renderWorkbenchPanel(vm));
  assert.match(html, /表格工作台/, '含面板标题');
  assert.match(html, /影响 2 行 \/ 共 2 行/, '渲染出真实影响行数（不再是「暂无预览」）');
  assert.doesNotMatch(html, /暂无预览/, '不再是空占位');
});

// ---------- seam C：Host 路由 handler（GET /workbench-api/state?file=...）----------
// handler 收到 { method, url }，返回 { status, body }（body 为 JSON 对象）。
// 用一个假的「读文件」依赖注入，避免测试依赖真实 xlsx / python。
const B = require(path.join(__dirname, '..', 'lib', 'panel-bridge.js'));

test('seam C：GET /workbench-api/state 无显式草稿时自动派生默认配方 → 有真实 preview', () => {
  const p = parsed();
  const fakeRead = () => p; // 假装从 xlsx 解析出 {columns, rows}
  const handler = B.makeStateHandler({ readTable: fakeRead, resolveDraft: null });
  const res = handler({ method: 'GET', url: '/workbench-api/state?file=' + encodeURIComponent('C:/x/a.xlsx') });
  assert.equal(res.status, 200);
  assert.equal(res.body.columns.length, 4, '回传列名');
  assert.equal(res.body.rowCount, 2, '回传行数');
  // 无显式草稿但 ≥2 列：Host 派生默认配方（swap 前两列），故 preview 非空、标明 isDefaultDraft
  assert.ok(res.body.preview, '默认配方 → 有真实 preview（不再是 null/暂无预览）');
  assert.equal(res.body.preview.affectedRows, 2);
  assert.equal(res.body.isDefaultDraft, true);
});

test('seam C：带默认草稿时 preview 非空且带真实影响行数', () => {
  const p = parsed();
  const draft = E.buildDraft('swap', null, { 字段A: '部门', 字段B: '工时', scope: 'all', 条件: '' });
  const handler = B.makeStateHandler({ readTable: () => p, resolveDraft: () => draft });
  const res = handler({ method: 'GET', url: '/workbench-api/state?file=' + encodeURIComponent('C:/x/a.xlsx') });
  assert.equal(res.status, 200);
  assert.ok(res.body.preview, '默认草稿 → 有 preview');
  assert.equal(res.body.preview.affectedRows, 2);
});

test('seam C：缺 file 参数 → 400；非 GET → 405', () => {
  const handler = B.makeStateHandler({ readTable: () => parsed(), resolveDraft: null });
  assert.equal(handler({ method: 'GET', url: '/workbench-api/state' }).status, 400);
  assert.equal(handler({ method: 'POST', url: '/workbench-api/state?file=x' }).status, 405);
});

test('seam C：resolveFile 把相对路径按 sessionId 解析成绝对路径再读表', () => {
  const p = parsed();
  let seenFile = null;
  const handler = B.makeStateHandler({
    resolveFile: function (file, sessionId) {
      // 模拟宿主：session 相对路径 → 绝对路径
      return 'C:/ws/' + sessionId + '/' + file;
    },
    readTable: function (abs) { seenFile = abs; return p; },
    resolveDraft: null
  });
  const res = handler({ method: 'GET', url: '/workbench-api/state?file=' + encodeURIComponent('a.xlsx') + '&sessionId=s1' });
  assert.equal(res.status, 200);
  assert.equal(seenFile, 'C:/ws/s1/a.xlsx', '读表用的是解析后的绝对路径');
  assert.equal(res.body.file, 'C:/ws/s1/a.xlsx');
});

test('seam C：resolveFile 抛错 → 400（不崩）', () => {
  const handler = B.makeStateHandler({
    resolveFile: function () { throw new Error('会话不可用'); },
    readTable: function () { return parsed(); }
  });
  const res = handler({ method: 'GET', url: '/workbench-api/state?file=x&sessionId=s1' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /会话不可用/);
});

// ---------- 回归：slot body 的 inject 不能覆盖 slot 声明的 hooks ----------
// 契约（一手 univer client.js:23427 + sidebar_right slot 定义 inject:{hooks:{tabInfo}}）：
// body 靠 props.useTabInfo（来自 slot 自己声明的 hooks）拿 tab.contentId。若我们的
// register({inject:()=>({hooks:{}})}) 返回 hooks 键，会**挤掉** slot 的 tabInfo →
// props.useTabInfo 变 undefined → 拿不到 contentId → 永远「暂无预览」（就是本轮真机 bug）。
// 故 inject() 必须返回**不含 hooks 键**的对象（对齐 univer 的 () => ({})）。
test('回归：registerWorkbenchPanel 注册的 body inject 不返回 hooks 键（不覆盖 slot tabInfo）', () => {
  let captured = null;
  const fakeCtx = {
    inject: (deps, cb) => { /* 阶段1：sidebarRightTabs，忽略 */ if (deps[0] === 'sidebarRightTabs') cb({ get: () => undefined }); },
    effect: (fn) => { const r = fn(); return () => { if (typeof r === 'function') r(); }; },
    slots: {
      inject: (_seat, cb) => cb(),
      register: (options) => {
        captured = options;
        return () => {};
      }
    }
  };
  const C = require(path.join(__dirname, '..', 'client', 'index.js'));
  C.registerWorkbenchPanel(fakeCtx);
  assert.ok(captured, '应注册一个 pane tab body');
  assert.equal(captured.key, C.TAB_ID);
  const injected = captured.inject();
  assert.ok(injected && typeof injected === 'object', 'inject 应返回对象');
  assert.equal(Object.prototype.hasOwnProperty.call(injected, 'hooks'), false,
    'inject 不得返回 hooks 键——否则覆盖 slot 的 tabInfo hook，body 拿不到 contentId');
});

// ---------- client 侧：parseFileAddress 契约 ----------
test('seam B：client.parseFileAddress 解析 dsh-resource://file/session/<sid>/<path>', (t) => {
  const h = loadClientRender();
  if (!h) { t.skip('react 不可解析'); return; }
  const a = h.api.parseFileAddress('dsh-resource://file/session/sess-1/docs/a.xlsx');
  assert.deepEqual(a, { scope: 'session', sessionId: 'sess-1', path: 'docs/a.xlsx' });
  // 绝对 scope
  const b = h.api.parseFileAddress('dsh-resource://file/absolute/C:/ws/a.xlsx');
  assert.equal(b.scope, 'absolute');
  assert.equal(b.path, 'C:/ws/a.xlsx');
  // 绝对 scope，POSIX 绝对路径（Linux/macOS 以 / 开头，前缀后是 `absolute//tmp/...`）——
  // 曾因首个空段被拒返回 undefined，导致面板在非 Windows 上误判「没打开文件」（CI 全红根因）。
  const c = h.api.parseFileAddress('dsh-resource://file/absolute//tmp/wb/演示_swap.xlsx');
  assert.equal(c.scope, 'absolute');
  assert.equal(c.path, '/tmp/wb/演示_swap.xlsx');
  // 非 file 地址 → undefined
  assert.equal(h.api.parseFileAddress('sidebar://guide'), undefined);
  assert.equal(h.api.parseFileAddress(''), undefined);
});



