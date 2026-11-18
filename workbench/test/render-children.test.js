'use strict';
// 验证 renderWorkbenchPanel 的 React 元素是否真的带 children（用 react-dom/server 渲染成字符串）。
// 关键回归：jsx(type, props, key) 第三参是 key，不是 children；children 必须在 props.children。
const fs = require('fs');
const path = require('path');
const Module = require('module');

// 解析 react / react/jsx-runtime / react-dom/server —— 优先用 workbench 本地 node_modules，回退 dsh 运行时
function tryResolve(name) {
  const bases = [
    path.join(__dirname, '..', 'node_modules'),
    'F:/deepseek_haeness_inload/resources/app.asar/dsh/node_modules',
  ];
  for (const b of bases) {
    try { return require.resolve(name, { paths: [b] }); } catch (_) {}
  }
  return null;
}

let reactPath = tryResolve('react');
let jsxPath = tryResolve('react/jsx-runtime');
let serverPath = tryResolve('react-dom/server');
if (!reactPath || !jsxPath) { console.log('SKIP: react not resolvable for local verify'); process.exit(0); }

const rt = require(jsxPath);
// 加载 client/index.js，注入 require 使其拿到本地 react/jsx-runtime
let src = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.js'), 'utf8');
// 确保测试能拿到 renderWorkbenchPanel
if (!/module\.exports\.renderWorkbenchPanel\s*=/.test(src)) {
  src += '\nmodule.exports.renderWorkbenchPanel = renderWorkbenchPanel;\n';
}
const m = { exports: {} };
const req = (spec) => {
  if (spec === 'react/jsx-runtime') return rt;
  if (spec === 'react') return require(reactPath);
  return require(spec);
};
const fn = new Function('module', 'exports', 'require', src + '\nreturn module.exports;');
const api = fn(m, m.exports, req);

if (typeof api.__renderWorkbenchPanel !== 'function' && typeof api.renderWorkbenchPanel !== 'function') {
  // renderWorkbenchPanel 未导出；通过在源码尾部临时导出验证
  console.log('NOTE: renderWorkbenchPanel not exported; injecting for test');
}
const render = api.renderWorkbenchPanel || api.__renderWorkbenchPanel;
if (typeof render !== 'function') { console.log('SKIP: render fn not exported'); process.exit(0); }

const React = require(reactPath);
const ReactDOMServer = serverPath ? require(serverPath) : null;
if (!ReactDOMServer) { console.log('SKIP: react-dom/server not resolvable'); process.exit(0); }

const el = render({});
const html = ReactDOMServer.renderToStaticMarkup(el);
console.log('HTML length:', html.length);
console.log('HTML:', html);
const hasHeader = html.includes('表格工作台');
const hasPreview = html.includes('暂无预览');
console.log('header visible:', hasHeader, '| preview visible:', hasPreview);
if (hasHeader && hasPreview) { console.log('RESULT: PASS — children render'); process.exit(0); }
console.log('RESULT: FAIL — children missing (jsx key-vs-children bug?)'); process.exit(1);
