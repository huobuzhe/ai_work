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
const { createSessionStore } = require('./panel-session');

/**
 * 默认写表器：把 cells 写回 xlsx（CONFIRM 执行用）。
 * 走脚本 xlsx_bridge.py apply <file> <cells_json_file>：按主键列写 c['after']、新列自动补表头。
 * @param {string} file 绝对路径
 * @param {object[]} cells 引擎 preview 产出的单元格改动（[{col,row,after,...}]）
 */
function defaultApplyTable(file, cells) {
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const tmp = path.join(os.tmpdir(), 'workbench-apply-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(tmp, JSON.stringify(cells || []), 'utf8');
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let lastErr = null;
  try {
    for (const bin of candidates) {
      const r = spawnSync(bin, [bridge, 'apply', file, tmp], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      if (r.error) { lastErr = r.error; continue; }
      if (r.status !== 0) {
        lastErr = new Error('xlsx_bridge apply exit ' + r.status + ': ' + (r.stderr || '').trim());
        continue;
      }
      return { ok: true, cellsWritten: (cells || []).length };
    }
    throw lastErr || new Error('找不到可用的 python 解释器');
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

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
  // 票 #52：预置按钮（registryButtons）来源；缺省从仓内 registry/ 读（结构性校验）。
  // 允许注入以便测试，且只加载一次（跨表通用）。
  let _presets = null;
  function presets() {
    if (_presets === null) {
      try {
        if (typeof deps.loadRegistry === 'function') _presets = deps.loadRegistry() || [];
        else _presets = require('./panel-session').defaultLoadRegistry(deps.registryDir) || [];
      } catch (_) { _presets = []; }
    }
    return _presets;
  }
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
    const vm = buildPanelState({ columns: table.columns, rows: table.rows, draft: draft, registryButtons: presets() });
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

/**
 * 票 #47：生成 /workbench-api/action 的 handler（纯函数工厂，便于测试）。
 * 语义：面板里「输入一句话 → 理解 → 预览 → 确认 → 固化按钮」的每一步都作为 action 发到这里，
 * Host 侧用引擎状态机（panel-session 维护的 per-file state）执行，返回新的视图模型。
 *
 * 路由：POST（或 GET，兼容） /workbench-api/action
 *   body/query: { file, sessionId, action:<JSON {type,...}> }
 *   → 200 { file, stage, input, draft, preview, note, noteTone, buttons, registryButtons }
 *   → 400 缺 file / action JSON 非法
 *   → 405 既非 GET 也非 POST
 *   → 500 读表失败
 *
 * CONFIRM 执行：reduce 后若 stage==='EXECUTED'，把该次 preview.cells 写回 xlsx（applyTable），
 * 并把写表结果并入视图（writtenCells / writtenOk），让面板如实告诉用户「已写入磁盘」。
 *
 * @param {{readTable?:Function, resolveFile?:Function, applyTable?:Function, store?:object}} deps
 * @returns {(req:{method:string,url:string,body?:string}) => {status:number, body:object}}
 */
function makeActionHandler(deps) {
  deps = deps || {};
  const readTable = deps.readTable || defaultReadTable;
  const resolveFile = deps.resolveFile || function (file /*, sessionId */) { return file; };
  const applyTable = deps.applyTable || defaultApplyTable;
  const store = deps.store || createSessionStore();
  return function handler(req) {
    const method = (req && req.method) || 'GET';
    if (method !== 'GET' && method !== 'POST') return { status: 405, body: { error: '只支持 GET/POST' } };
    // 参数可来自 query（GET）或 body（POST，JSON 或 urlencoded）
    const params = {};
    let urlStr = (req && req.url) || '';
    const qi = urlStr.indexOf('?');
    if (qi !== -1) {
      urlStr.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        const i = kv.indexOf('=');
        const k = i === -1 ? kv : kv.slice(0, i);
        const v = i === -1 ? '' : kv.slice(i + 1);
        params[decodeURIComponent(k)] = decodeURIComponent(v);
      });
    }
    if (req && req.body) {
      try {
        const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (b && typeof b === 'object') Object.keys(b).forEach(function (k) { params[k] = b[k]; });
      } catch (e) {
        return { status: 400, body: { error: 'body JSON 非法：' + ((e && e.message) || e) } };
      }
    }
    const file = params.file;
    const sessionId = params.sessionId;
    if (!file) return { status: 400, body: { error: '缺少 file 参数' } };
    let action = params.action;
    if (typeof action === 'string') {
      try { action = JSON.parse(action); } catch (e) {
        return { status: 400, body: { error: 'action JSON 非法：' + ((e && e.message) || e) } };
      }
    }
    if (!action || typeof action !== 'object' || !action.type) {
      return { status: 400, body: { error: '缺少 action（需含 type）' } };
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
    const beforeStage = store.view(absPath, table).stage;
    let vm;
    try {
      vm = store.applyAction(absPath, table, action);
    } catch (e) {
      return { status: 500, body: { error: '执行动作失败：' + ((e && e.message) || e) } };
    }
    // CONFIRM / RUN_BUTTON 真正落到磁盘：stage 从非 EXECUTED 变到 EXECUTED 的那一次，把 cells 写出。
    // 票 #48：RUN_BUTTON（一键运行已固化的按钮）与 CONFIRM 同属「执行」语义，参数未改时引擎直接
    // 一步到 EXECUTED（不经过 PREVIEWED），此前只有 CONFIRM 写盘 → 一键运行改的是内存、没落盘，
    // 用户看到「已执行」但复开文件没变。这里把 RUN_BUTTON 也纳入写回。
    const wrote = {};
    const isExecute = (action.type === 'CONFIRM' || action.type === 'RUN_BUTTON');
    if (isExecute && vm.stage === 'EXECUTED' && beforeStage !== 'EXECUTED' && vm.preview && vm.preview.cells) {
      try {
        const r = applyTable(absPath, vm.preview.cells);
        wrote.writtenOk = true;
        wrote.writtenCells = (r && r.cellsWritten != null) ? r.cellsWritten : vm.preview.cells.length;
      } catch (e) {
        wrote.writtenOk = false;
        wrote.writeError = (e && e.message) || String(e);
      }
    }
    return {
      status: 200,
      body: {
        file: absPath,
        stage: vm.stage,
        input: vm.input,
        draft: vm.draft,
        preview: vm.preview,
        note: vm.note,
        noteTone: vm.noteTone,
        buttons: vm.buttons,
        registryButtons: vm.registryButtons,
        writtenOk: wrote.writtenOk,
        writtenCells: wrote.writtenCells,
        writeError: wrote.writeError
      }
    };
  };
}

module.exports = { makeStateHandler, makeButtonHandler, makeActionHandler, makeTemplatesHandler, makeCreateHandler, defaultReadTable, defaultApplyTable, defaultCreateTable, defaultLoadTemplates };

/**
 * 票 #52：默认模板加载器——spawn node scripts/load-templates.js，解析 stdout 的 templates 数组。
 * 纯文件桥（脚本只读 templates/，无网络）。返回 templates 数组（结构 {name,primaryKey,columns,file}）。
 */
function defaultLoadTemplates() {
  const { spawnSync } = require('child_process');
  const script = path.join(__dirname, '..', 'scripts', 'load-templates.js');
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw r.error;
  const out = (r.stdout || '').trim();
  if (!out) throw new Error('load-templates 无输出');
  const parsed = JSON.parse(out);
  return Array.isArray(parsed.templates) ? parsed.templates : [];
}

/**
 * 票 #52：默认建表器——spawn python xlsx_bridge.py create <file> <structure_json>，建空表。
 * @param {string} file 目标绝对路径
 * @param {object} structure {primaryKey, columns, name}
 */
function defaultCreateTable(file, structure) {
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const tmp = path.join(os.tmpdir(), 'workbench-create-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(tmp, JSON.stringify(structure || {}), 'utf8');
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let lastErr = null;
  try {
    for (const bin of candidates) {
      const r = spawnSync(bin, [bridge, 'create', file, tmp], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      if (r.error) { lastErr = r.error; continue; }
      if (r.status !== 0) {
        lastErr = new Error('xlsx_bridge create exit ' + r.status + ': ' + (r.stderr || '').trim());
        continue;
      }
      return { ok: true };
    }
    throw lastErr || new Error('找不到可用的 python 解释器');
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

/**
 * 票 #52：生成 /workbench-api/templates 的 handler（列仓内模板清单，供面板渲染「新建」按钮）。
 * 路由：GET /workbench-api/templates → 200 { templates:[{name,primaryKey,columns,file}] }
 * @param {{loadTemplates?:Function}} deps
 */
function makeTemplatesHandler(deps) {
  deps = deps || {};
  const loadTemplates = deps.loadTemplates || defaultLoadTemplates;
  return function handler(req) {
    const method = (req && req.method) || 'GET';
    if (method !== 'GET') return { status: 405, body: { error: '只支持 GET' } };
    let templates;
    try {
      templates = loadTemplates() || [];
    } catch (e) {
      return { status: 500, body: { error: '读模板失败：' + ((e && e.message) || e) } };
    }
    return { status: 200, body: { templates: templates } };
  };
}

/**
 * 票 #52：生成 /workbench-api/create 的 handler（从模板新建空表）。
 * 语义：POST { mode:'template', template, name?, sessionId?, dir? } → 在 session cwd（或 dir）
 * 下建空 xlsx（列头=模板列、主键置首）→ 返回新文件绝对路径与 dsh-resource 地址。
 *
 * 路由：POST /workbench-api/create
 *   → 200 { file, address, name }
 *   → 400 缺参 / 模板非法 / 无法解析目录
 *   → 405 非 POST
 *   → 500 建表失败
 *
 * @param {{loadTemplates?:Function, createTable?:Function, resolveDir?:Function, fileExists?:Function}} deps
 *   resolveDir(sessionId, dir) → 目标目录绝对路径；缺省：dir 给了就原样、否则抛（须宿主注入真实解析）。
 */
function makeCreateHandler(deps) {
  deps = deps || {};
  const loadTemplates = deps.loadTemplates || defaultLoadTemplates;
  const createTable = deps.createTable || defaultCreateTable;
  const resolveDir = deps.resolveDir || function (sessionId, dir) { if (dir) return dir; throw new Error('缺少目标目录（sessionId 无法解析 cwd）'); };
  const fileExists = deps.fileExists || function (p) { try { return require('fs').existsSync(p); } catch (_) { return false; } };
  return function handler(req) {
    const method = (req && req.method) || 'GET';
    if (method !== 'POST') return { status: 405, body: { error: '只支持 POST' } };
    const params = {};
    try {
      const b = typeof (req && req.body) === 'string' ? JSON.parse(req.body) : (req && req.body);
      if (b && typeof b === 'object') Object.keys(b).forEach(function (k) { params[k] = b[k]; });
    } catch (e) {
      return { status: 400, body: { error: 'body JSON 非法：' + ((e && e.message) || e) } };
    }
    let templates;
    try { templates = loadTemplates() || []; } catch (e) {
      return { status: 500, body: { error: '读模板失败：' + ((e && e.message) || e) } };
    }
    const spec = require('./panel-state').buildCreateSpec(templates, {
      mode: params.mode || 'template',
      template: params.template,
      name: params.name
    });
    if (!spec.ok) return { status: 400, body: { error: '结构不合格', errors: spec.errors } };
    let dir;
    try { dir = resolveDir(params.sessionId, params.dir); } catch (e) {
      return { status: 400, body: { error: '无法确定目标目录：' + ((e && e.message) || e) } };
    }
    const safeName = String(spec.structure.name || '新建表格').replace(/[\\/:*?"<>|]/g, '_');
    let file = path.join(dir, safeName + '.xlsx');
    // 避免覆盖：若已存在则追加序号。
    let n = 1;
    while (fileExists(file)) { file = path.join(dir, safeName + ' (' + n + ').xlsx'); n += 1; }
    try {
      const r = createTable(file, spec.structure);
      if (r && r.ok === false) throw new Error('建表器返回失败');
    } catch (e) {
      return { status: 500, body: { error: '建表失败：' + ((e && e.message) || e) } };
    }
    return {
      status: 200,
      body: {
        file: file,
        name: spec.structure.name,
        address: 'dsh-resource://file/absolute/' + file.replace(/\\/g, '/')
      }
    };
  };
}