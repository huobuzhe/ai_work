'use strict';
// 票 #46：预览卡必须把「会改哪些格子」的明细（before → after）真正渲染出来，
// 并在点击按钮后保留「当前预览的配方」标签，而不是让提示行无声消失。
// seam（公共边界）：renderWorkbenchPanel(视图模型) → React 树 → 渲染成 HTML。
// 用户确认的问题（m02849）：“点了有变化只是不清楚该变啥，文字变了，默认配方·可更换没了”。
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const E = require(path.join(__dirname, '..', 'lib', 'engine.js'));
const H = require(path.join(__dirname, '..', 'lib', 'panel-state.js'));

// 复用 panel-data-pipeline.test.js 的加载法：注入本地 react/jsx-runtime，把 client 源码当模块执行。
function loadClientRender() {
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

function parsed() {
  return {
    columns: ['姓名', '工时', '职位'],
    rows: [{ 姓名: 111, 工时: 80, 职位: '人' }, { 姓名: 222, 工时: 100, 职位: '人' }, { 姓名: 333, 工时: 200, 职位: '人' }]
  };
}

test('seam B：预览卡渲染出逐格 before → after 明细（不再只给行数）', (t) => {
  const h = loadClientRender();
  if (!h) { t.skip('react 不可解析，跳过渲染 seam'); return; }
  const p = parsed();
  const draft = E.buildDraft('swap', null, { 字段A: '姓名', 字段B: '工时', scope: 'all', 条件: '' });
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: draft });
  const html = h.Server.renderToStaticMarkup(h.api.renderWorkbenchPanel(vm));
  // 必须出现逐格明细区（data-workbench-cells），并带上 before→after 的实际值
  assert.match(html, /data-workbench-cells/, '应渲染逐格明细区');
  assert.match(html, /111/, '明细里出现真实的 before 值（姓名 111）');
  assert.match(html, /80/, '明细里出现真实的 after 值（工时 80）');
  assert.match(html, /→|->/, '明细用箭头表示 before → after');
});

test('seam B：预览卡渲染「当前预览的配方」标签（默认配方）', (t) => {
  const h = loadClientRender();
  if (!h) { t.skip('react 不可解析，跳过渲染 seam'); return; }
  const p = parsed();
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: null }); // 无草稿 → 默认配方
  const vmWithLabel = Object.assign({}, vm, { recipeLabel: '默认配方（调换前两列）' });
  const html = h.Server.renderToStaticMarkup(h.api.renderWorkbenchPanel(vmWithLabel));
  assert.match(html, /data-workbench-recipe/, '应渲染当前配方标签区');
  assert.match(html, /默认配方（调换前两列）/, '标签显示当前预览的是哪份配方');
});

test('seam B：点击按钮后（override 覆盖）仍保留配方标签，不无声消失', (t) => {
  const h = loadClientRender();
  if (!h) { t.skip('react 不可解析，跳过渲染 seam'); return; }
  const p = parsed();
  const draft = E.buildDraft('swap', null, { 字段A: '姓名', 字段B: '工时', scope: 'all', 条件: '' });
  const vm = H.buildPanelState({ columns: p.columns, rows: p.rows, draft: draft });
  // 模拟点击后 effective：preview 来自重算，recipeLabel 标明当前配方
  const effective = Object.assign({}, vm, { isDefaultDraft: false, recipeLabel: '默认配方（调换前两列）' });
  const html = h.Server.renderToStaticMarkup(h.api.renderWorkbenchPanel(effective));
  assert.match(html, /data-workbench-recipe/);
  assert.match(html, /默认配方（调换前两列）/);
});
