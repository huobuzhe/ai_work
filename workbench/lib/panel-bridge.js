'use strict';
/**
 * 票 #41 seam C（Host 路由桥）：把 HTTP 请求接到「读表 → buildPanelState」管道，
 * 供 client 面板同源 fetch 取真实 preview。
 *
 * 契约照抄 univer-office 宿主侧（lib/index.js:13165-13195）：
 *   ctx.inject(['webServer'], injected => injected.get('webServer').register({
 *     kind:'prefix', path:'/<x>', handler(req) }))
 * 本文件只做**纯逻辑**（handler 工厂 + 读表函数），把 I/O（spawn python）与资源注册
 * 分离开，便于 seam C 单测注入假 readTable、不碰真实 xlsx / python。
 *
 * 路由：GET /workbench-api/state?file=<绝对路径>
 *   → 200 { file, columns, rowCount, preview }
 *   → 400 缺 file 参数
 *   → 405 非 GET
 */
const path = require('path');
const { buildPanelState, buildButtonPreview } = require('./panel-state');

/**
 * 默认读表器：spawn python xlsx_bridge.py read-values <file>，解析其 stdout JSON。
 * 读 data_only=True（重算缓存值），与 univer 一致地取最终可见值。
 * @param {string} file 绝对路径
 * @returns {{columns:string[], rows:object[]}}
 */
function defaultReadTable(file) {
  const { spawnSync } = require('child_process');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  // 优先用 python，退 py（Windows 常见）。只读文件、不写，结果走 stdout。
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let lastErr = null;
  for (const bin of candidates) {
    const r = spawnSync(bin, [bridge, 'read-values', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { lastErr = r.error; continue; }
    if (r.status !== 0) {
      lastErr = new Error('xlsx_bridge exit ' + r.status + ': ' + (r.stderr || '').trim());
      continue;
    }
    const out = (r.stdout || '').trim();
    if (!out) throw new Error('xlsx_bridge 无输出');
    return JSON.parse(out);
  }
  throw lastErr || new Error('找不到可用的 python 解释器');
}

/**
 * 生成 /workbench-api/state 的 handler（纯函数，便于测试）。
 * @param {{readTable?:Function, resolveDraft?:Function, resolveFile?:Function}} deps
 *   readTable(fileAbs) → {columns, rows}；缺省用 defaultReadTable
 *   resolveDraft(fileAbs) → 引擎草稿 | null；缺省返回 null
 *   resolveFile(file, sessionId) → 绝对路径；缺省「原样当绝对路径」（测试/无 sessions 时用）。
 *     真实宿主传入用 ctx.sessions 解析 session-relative 路径的实现。
 * @returns {(req:{method:string,url:string}) => {status:number, body:object}}
 */
function makeStateHandler(deps) {
  deps = deps || {};
  const readTable = deps.readTable || defaultReadTable;
  const resolveDraft = deps.resolveDraft || function () { return null; };
  const resolveFile = deps.resolveFile || function (file /*, sessionId */) { return file; };
  return function handler(req) {
    const method = (req && req.method) || 'GET';
    if (method !== 'GET') return { status: 405, body: { error: '只支持 GET' } };
    // 从 url 解析 query（支持相对 url）
    let urlStr = (req && req.url) || '';
    const qi = urlStr.indexOf('?');
    const query = qi === -1 ? '' : urlStr.slice(qi + 1);
    const params = {};
    query.split('&').forEach(function (kv) {
      if (!kv) return;
      const i = kv.indexOf('=');
      const k = i === -1 ? kv : kv.slice(0, i);
      const v = i === -1 ? '' : kv.slice(i + 1);
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    });
    const file = params.file;
    const sessionId = params.sessionId;
    if (!file) return { status: 400, body: { error: '缺少 file 参数' } };
    let absPath;
    try {
      absPath = resolveFile(file, sessionId);
    } catch (e) {
      return { status: 400, body: { error: '无法解析文件路径：' + ((e && e.message) || e) } };
    }
    let table;
    try {
      table = readTable(absPath);
    } catch (e) {
      return { status: 500, body: { error: '读表失败：' + ((e && e.message) || e) } };
    }
    const draft = resolveDraft(absPath);
    const vm = buildPanelState({ columns: table.columns, rows: table.rows, draft: draft });
    return {
      status: 200,
      body: {
        file: absPath,
        columns: (table.columns || []).slice(),
        rowCount: (table.rows || []).length,
        preview: vm.preview,
        isDefaultDraft: !!vm.isDefault,
        // 票 #43：按钮库（声明式）一并回传，供面板渲染成可点按钮。
        registryButtons: vm.registryButtons || [],
        buttons: vm.buttons || []
      }
    };
  };
}

/**
 * 票 #44：生成 /workbench-api/preview 的 handler（纯函数，便于测试）。
 * 语义：client 点击某按钮 → 带上 file/sessionId 与按钮的**声明式配方**（button，JSON 编码）
 * 请求 Host → Host 重读该表 → 用引擎按该按钮配方重算 preview → 返回新的影响预览。
 * 引擎只在 Host 侧调用（延续 #41 管道），client 不 require 引擎；确认前只算预览、不写入。
 *
 * 路由：GET /workbench-api/preview?file=&sessionId=&buttonId=&button=<urlencoded JSON>
 *   → 200 { file, columns, rowCount, buttonId, stage, preview }
 *   → 400 缺 file / button 或 button JSON 非法
 *   → 404 按钮 id 不匹配
 *   → 405 非 GET
 *   → 500 读表失败
 *
 * @param {{readTable?:Function, resolveFile?:Function}} deps
 * @returns {(req:{method:string,url:string}) => {status:number, body:object}}
 */
function makeButtonHandler(deps) {
  deps = deps || {};
  const readTable = deps.readTable || defaultReadTable;
  const resolveFile = deps.resolveFile || function (file /*, sessionId */) { return file; };
  return function handler(req) {
    const method = (req && req.method) || 'GET';
    if (method !== 'GET') return { status: 405, body: { error: '只支持 GET' } };
    let urlStr = (req && req.url) || '';
    const qi = urlStr.indexOf('?');
    const query = qi === -1 ? '' : urlStr.slice(qi + 1);
    const params = {};
    query.split('&').forEach(function (kv) {
      if (!kv) return;
      const i = kv.indexOf('=');
      const k = i === -1 ? kv : kv.slice(0, i);
      const v = i === -1 ? '' : kv.slice(i + 1);
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    });
    const file = params.file;
    const sessionId = params.sessionId;
    const buttonId = params.buttonId;
    if (!file) return { status: 400, body: { error: '缺少 file 参数' } };
    if (!params.button) return { status: 400, body: { error: '缺少 button 参数（按钮配方 JSON）' } };
    let button;
    try {
      button = JSON.parse(params.button);
    } catch (e) {
      return { status: 400, body: { error: 'button 参数 JSON 非法：' + ((e && e.message) || e) } };
    }
    if (!button || !button.id || (buttonId && button.id !== buttonId)) {
      return { status: 404, body: { error: '按钮 id 不匹配或缺失' } };
    }
    let absPath;
    try {
      absPath = resolveFile(file, sessionId);
    } catch (e) {
      return { status: 400, body: { error: '无法解析文件路径：' + ((e && e.message) || e) } };
    }
    let table;
    try {
      table = readTable(absPath);
    } catch (e) {
      return { status: 500, body: { error: '读表失败：' + ((e && e.message) || e) } };
    }
    const vm = buildButtonPreview(
      { columns: table.columns, rows: table.rows, sources: table.sources, buttons: [button], registryButtons: [] },
      button.id
    );
    if (!vm) return { status: 404, body: { error: '该按钮无法产出预览（id=' + button.id + '）' } };
    return {
      status: 200,
      body: {
        file: absPath,
        columns: (table.columns || []).slice(),
        rowCount: (table.rows || []).length,
        buttonId: button.id,
        stage: vm.stage,
        preview: vm.preview
      }
    };
  };
}

module.exports = { makeStateHandler, makeButtonHandler, defaultReadTable };