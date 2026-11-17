'use strict';
/**
 * 界面预览面板生成脚本（可视化验收 · 非生产接线）
 * ---------------------------------------------------------------------------
 * 目的：本项目是「纯 seam 包 + DSH client 面板」，面板本体只能挂进 DSH 宿主里看，
 * 没有独立 URL。为了让使用者**不装宿主也能直观看到面板长什么样**，本脚本用真实的
 * lib/engine.js + client/index.js 投影函数，构造若干示例表格状态，把产出的
 * 「预览卡（六段）+ 按钮库」视图模型渲染成一个自包含的静态 HTML（内联 CSS、零外部依赖）。
 *
 * 它是 view-model 的只读快照：不接文件、不接网络、不写业务数据，只把引擎/面板已经算好的
 * 结果画出来。每次改 engine / client 后重跑本脚本可刷新样例。
 *
 * 用法：node scripts/build-preview.js [输出路径]
 *   默认输出：workbench/preview/index.html
 */
const fs = require('node:fs');
const path = require('node:path');
const E = require('../lib/engine');
const C = require('../client/index.js');

// ---- 构造示例状态（全部走真实引擎，不手搓 view-model）----
function st(extra) {
  return E.initial(Object.assign({
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪'],
    rows: [
      { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80 },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80 },
      { 姓名: '岑溪', 部门: '市场', 工时: 120, 时薪: 80 }
    ],
    sources: {
      '外勤登记表.csv': { rows: [
        { 姓名: '阿岚', 邮箱: 'alan@example.com' },
        { 姓名: '柏舟', 邮箱: 'baizhou@example.com' },
        { 姓名: '岑溪', 邮箱: 'cenxi@example.com' }
      ] }
    },
    registryButtons: [
      { id: 'p1', name: '从外勤表补邮箱', kind: 'extract', source: 'preset', schemaVersion: 1,
        params: { 来源文件: '外勤登记表.csv', 匹配列: '姓名', 取哪一列: '邮箱', 写到: '邮箱', scope: 'all', 条件: '' } },
      { id: 'p2', name: '按姓名去重（保留首条）', kind: 'dedupe', source: 'preset', schemaVersion: 1,
        params: { 保留策略: '首条', scope: 'all', 条件: '' } }
    ],
    buttons: [
      { id: 'b1', name: '把部门与备注对调', kind: 'swap', source: 'user', schemaVersion: 1,
        params: { 字段A: '部门', 字段B: '备注', scope: 'all', 条件: '' }, lastAffectedRows: 3, emptyRun: false }
    ]
  }, extra || {}));
}

function pipe(s, text) {
  s = E.reduce(s, { type: 'SET_INPUT', text: text });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  s = E.reduce(s, { type: 'PREVIEW' });
  return s;
}

// 四种动作各造一个「已预览」状态，外加一个校验失败、一个飞书禁用示例
const samples = [
  { title: '① 提取字段 extract —— 从外勤表把邮箱提出来', state: pipe(st(), '从外勤登记表把邮箱提出来') },
  { title: '② 调换两段字段 swap —— 对调部门与备注', state: pipe(st({ columns: ['姓名', '部门', '备注', '工时', '时薪'], rows: [{ 姓名: '阿岚', 部门: '销售', 备注: '新人', 工时: 160, 时薪: 80 }] }), '把部门和备注对调') },
  { title: '③ 带条件增删 conditional —— 工时 > 150 的加标记', state: pipe(st(), '把工时大于150的人的备注写上加班') },
  { title: '④ 自定义函数 function —— 应发 = 工时 × 时薪', state: pipe(st(), '计算应发 = 工时 * 时薪') },
  { title: '⑤ 校验失败示例 —— 引用了不存在的列（第②段列失败项、确认被禁用）', state: (function () {
    const s = st();
    const bad = E.buildDraft('swap', null, { 字段A: '不存在的列', 字段B: '部门' });
    return Object.assign({}, s, { stage: 'PREVIEWED', draft: bad, preview: E.preview(s, bad) });
  })() },
  { title: '⑥ 能力位禁用示例 —— 飞书 adapter 上跑公式动作（第⑥段 disabled + blocker）', state: (function () {
    const s = E.initial({ adapter: 'feishu', primaryKey: '姓名', columns: ['姓名', '工时', '时薪'],
      rows: [{ 姓名: '阿岚', 工时: 160, 时薪: 80 }] });
    const d = E.buildDraft('function', null, { 表达式: '工时 * 时薪', 输出列: '应发' });
    return Object.assign({}, s, { stage: 'PREVIEWED', draft: d, preview: E.preview(s, d) });
  })() }
];

const buttonLibrary = C.projectButtonLibrary(st());

// ---- 渲染：view-model → HTML（纯展示，逻辑全在引擎/面板里算好）----
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSection(title, bodyHtml) {
  return '<div class="sec"><div class="sec-h">' + esc(title) + '</div><div class="sec-b">' + bodyHtml + '</div></div>';
}

function renderCard(card) {
  if (!card) return '<div class="empty">（无预览卡：尚未预览）</div>';
  const s = card.sections;
  const ex = s.explain, va = s.validation, sp = s.scopeParams, im = s.impact, co = s.confirm, cp = s.capability;

  // ① 解释
  const exHtml = '<div><b>' + esc(ex.label) + '</b> · <code>' + esc(ex.kind) + '</code></div>'
    + '<div class="muted">' + esc(ex.medium) + '</div>'
    + '<ol>' + ex.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';

  // ② 校验
  const vaHtml = va.ok
    ? '<div class="ok">✓ 校验通过</div>'
    : '<div class="bad">✗ 校验未通过（确认已禁用）</div>'
      + '<ul>' + va.issues.map(function (it) {
        return '<li>字段 <code>' + esc(it.field) + '</code>：' + esc(it.reason)
          + ' <span class="muted">（当前值：' + esc(it.currentValue) + '）</span></li>';
      }).join('') + '</ul>';

  // ③ 作用范围与参数
  const spHtml = '<div>作用范围：<b>' + esc(sp.scopeLabel) + '</b>'
    + (sp.condition ? '（条件：' + esc(sp.condition) + '）' : '') + '</div>'
    + '<table class="kv"><tr><th>参数</th><th>类型</th><th>必填</th><th>默认值</th></tr>'
    + sp.paramSpec.map(function (d) {
      return '<tr><td><code>' + esc(d.key) + '</code></td><td>' + esc(d.类型) + '</td><td>'
        + (d.必填 ? '是' : '否') + '</td><td>' + esc(d.默认值) + '</td></tr>';
    }).join('') + '</table>';

  // ④ 影响预览
  const cellsHtml = '<table class="cells"><tr><th>行</th><th>列</th><th>原值</th><th>新值</th></tr>'
    + im.cells.map(function (c) {
      return '<tr><td>' + esc(c.row) + '</td><td>' + esc(c.col) + '</td><td class="before">'
        + esc(c.before) + '</td><td class="after">' + esc(c.after) + '</td></tr>';
    }).join('') + '</table>';
  const imHtml = '<div class="summary">' + esc(im.summary) + '</div>'
    + (im.swapBanner ? '<div class="banner">' + esc(im.swapBanner) + '</div>' : '')
    + cellsHtml;

  // ⑤ 确认
  const coHtml = '<button class="' + (co.canConfirm ? 'btn-primary' : 'btn-disabled') + '"'
    + (co.canConfirm ? '' : ' disabled') + '>确认执行</button>'
    + ' <button class="btn">取消</button>'
    + (co.canConfirm ? '' : '<span class="muted">（校验未通过或未预览，不能确认）</span>');

  // ⑥ 能力位
  const fc = cp.formulaCapabilities || {};
  const cpHtml = '<div>平台：<b>' + esc(cp.adapterLabel || cp.adapter) + '</b></div>'
    + '<div>公式能力位：写公式=' + (fc.canWriteFormula ? '✓' : '✗')
    + '，重算=' + (fc.canRecalc ? '✓' : '✗')
    + '，读计算值=' + (fc.canReadComputed ? '✓' : '✗')
    + '，函数集=' + (fc.functionSet ? '✓' : '✗') + '</div>'
    + (cp.disabled
      ? '<div class="bad">该动作在此平台被禁用：' + cp.blockers.map(function (b) { return esc(b.reason); }).join('；') + '</div>'
      : '<div class="ok">该动作在此平台可用</div>');

  return '<div class="card">'
    + renderSection('① 解释（理解成什么动作）', exHtml)
    + renderSection('② 封闭校验', vaHtml)
    + renderSection('③ 作用范围与参数', spHtml)
    + renderSection('④ 影响预览', imHtml)
    + renderSection('⑤ 确认 / 取消', coHtml)
    + renderSection('⑥ 能力位（辅助）', cpHtml)
    + '</div>';
}

function renderButtonLibrary(lib) {
  if (!lib.buttons.length) return '<div class="empty">（按钮库为空）</div>';
  return '<table class="buttons"><tr><th>id</th><th>名称</th><th>动作</th><th>来源</th><th>上次影响行</th><th>空跑</th></tr>'
    + lib.buttons.map(function (b) {
      return '<tr><td><code>' + esc(b.id) + '</code></td><td>' + esc(b.name) + '</td><td>'
        + esc(b.label) + '</td><td>' + (b.source === 'preset' ? '预置' : '我的') + '</td><td>'
        + esc(b.lastAffectedRows) + '</td><td>' + (b.emptyRun ? '是' : '否') + '</td></tr>';
    }).join('') + '</table>';
}

const def = samples.map(function (sm) {
  return '<section class="sample"><h2>' + esc(sm.title) + '</h2>' + renderCard(C.projectPreviewCard(sm.state)) + '</section>';
}).join('\n');

const html = '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>表格工作台 · 面板预览（view-model 快照）</title>'
  + '<style>'
  + ':root{--bg:#f6f7f9;--card:#fff;--line:#e3e6ea;--pri:#2b6cff;--ok:#1a7f37;--bad:#c62828;--muted:#6b7280}'
  + '*{box-sizing:border-box}body{margin:0;font:14px/1.55 -apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:#1f2328}'
  + 'header{padding:20px 24px;background:#fff;border-bottom:1px solid var(--line)}'
  + 'header h1{margin:0 0 6px;font-size:18px}header p{margin:0;color:var(--muted);font-size:13px}'
  + 'main{max-width:960px;margin:0 auto;padding:20px 16px 60px}'
  + '.lib{margin-bottom:24px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px}'
  + '.lib h2{font-size:15px;margin:0 0 10px}'
  + '.sample{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:20px}'
  + '.sample h2{font-size:15px;margin:0 0 12px;color:#111}'
  + '.card{border:1px solid var(--line);border-radius:8px;overflow:hidden}'
  + '.sec{border-top:1px solid var(--line)}.sec:first-child{border-top:0}'
  + '.sec-h{background:#fafbfc;padding:8px 12px;font-weight:600;font-size:13px;color:#374151}'
  + '.sec-b{padding:10px 12px}'
  + 'code{background:#f0f2f5;padding:1px 5px;border-radius:4px;font-size:12.5px}'
  + '.muted{color:var(--muted);font-size:12.5px}.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}'
  + 'table{border-collapse:collapse;width:100%;margin-top:8px;font-size:13px}'
  + 'th,td{border:1px solid var(--line);padding:5px 8px;text-align:left}th{background:#f7f8fa;font-weight:600}'
  + '.cells .before{color:#8a8f98;text-decoration:line-through}.cells .after{color:var(--pri);font-weight:600}'
  + '.summary{font-weight:600;margin-bottom:6px}.banner{margin:6px 0;padding:6px 10px;background:#fff7e6;border-left:3px solid #f0a020;border-radius:4px;font-size:13px}'
  + 'ol,ul{margin:6px 0;padding-left:22px}'
  + '.btn,.btn-primary,.btn-disabled{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid var(--line);background:#fff;cursor:pointer}'
  + '.btn-primary{background:var(--pri);border-color:var(--pri);color:#fff}'
  + '.btn-disabled{background:#eef0f3;color:#a0a4ab;cursor:not-allowed}'
  + '.buttons th,.buttons td{font-size:13px}'
  + '.empty{color:var(--muted);padding:8px 0}'
  + 'footer{max-width:960px;margin:0 auto;padding:0 16px 40px;color:var(--muted);font-size:12px}'
  + '</style></head><body>'
  + '<header><h1>表格工作台 · 面板预览（view-model 快照）</h1>'
  + '<p>本页由 <code>scripts/build-preview.js</code> 用真实 lib/engine.js + client/index.js 投影生成；'
  + '仅展示面板「解释与影响预览卡（六段）+ 按钮库」的视图模型，不含真实写文件。每次改引擎/面板后重跑本脚本刷新。</p></header>'
  + '<main>'
  + '<div class="lib"><h2>按钮库（预置 + 我的，共 ' + buttonLibrary.total + ' 个）</h2>' + renderButtonLibrary(buttonLibrary) + '</div>'
  + def
  + '</main>'
  + '<footer>规格 #8 / dsh-workbench@' + esc(require('../package.json').version) + '</footer>'
  + '</body></html>\n';

const outPath = process.argv[2] || path.join(__dirname, '..', 'preview', 'index.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
console.log('已生成面板预览：' + outPath);
console.log('示例数=' + samples.length + '，按钮库=' + buttonLibrary.total + '，字节=' + Buffer.byteLength(html, 'utf8'));
