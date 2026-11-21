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
function defaultApplyTable(file, cells, sortOrder, summary) {
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

  // 汇总（sum）：给了 summary（{label,column,value}）→ 走 append-summary 命令在表尾追加一行，不逐格改值。
  if (summary && typeof summary === 'object') {
    const tmpSum = path.join(os.tmpdir(), 'workbench-sum-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(tmpSum, JSON.stringify(summary), 'utf8');
    let lastErr = null;
    try {
      for (const bin of candidates) {
        const r = spawnSync(bin, [bridge, 'append-summary', file, tmpSum], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
        if (r.error) { lastErr = r.error; continue; }
        if (r.status !== 0) {
          lastErr = new Error('xlsx_bridge append-summary exit ' + r.status + ': ' + (r.stderr || '').trim());
          continue;
        }
        return { ok: true, cellsWritten: 0, summaryAppended: 1 };
      }
      throw lastErr || new Error('找不到可用的 python 解释器');
    } finally {
      try { fs.unlinkSync(tmpSum); } catch (_) {}
    }
  }

  // 结构性动作（sort）：给了 sortOrder（新行序下标数组）→ 走整表重排命令，不逐格改值。
  if (Array.isArray(sortOrder) && sortOrder.length) {
    const tmpOrder = path.join(os.tmpdir(), 'workbench-sort-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(tmpOrder, JSON.stringify(sortOrder), 'utf8');
    let lastErr = null;
    try {
      for (const bin of candidates) {
        const r = spawnSync(bin, [bridge, 'sort', file, tmpOrder], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
        if (r.error) { lastErr = r.error; continue; }
        if (r.status !== 0) {
          lastErr = new Error('xlsx_bridge sort exit ' + r.status + ': ' + (r.stderr || '').trim());
          continue;
        }
        return { ok: true, cellsWritten: 0, reordered: sortOrder.length };
      }
      throw lastErr || new Error('找不到可用的 python 解释器');
    } finally {
      try { fs.unlinkSync(tmpOrder); } catch (_) {}
    }
  }

  const tmp = path.join(os.tmpdir(), 'workbench-apply-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(tmp, JSON.stringify(cells || []), 'utf8');
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
 * 默认重算器：调 bundled LibreOffice Kit 对 xlsx 就地重算，使新写入的公式格产生缓存值。
 * 背景（接缝缺口修复，function 动作）：xlsx_bridge.py apply 只把公式字符串写进单元格、不计算；
 * 而 defaultReadTable 用 data_only=True 读的是**缓存值**，新写公式无缓存 → 应发列读回为空。
 * 此处在写盘后触发一次重算，令「确认执行」后面板/文件里能立刻看到算出来的值。
 * 定位顺序沿用 scripts/acceptance-formula.js 的 locateCli 约定（env 覆盖→包内→bundled 兜底）。
 * 重算失败不抛给调用方致命——返回 {ok:false,error}，主流程仍算「已写入磁盘」（公式在、值待重算）。
 * @param {string} file xlsx 绝对路径（就地重算）
 * @returns {{ok:boolean,error?:string}}
 */
function defaultRecalc(file) {
  const { execFileSync } = require('child_process');
  const fs = require('fs');
  function locateCli() {
    if (process.env.WORKBENCH_LO_CLI) return process.env.WORKBENCH_LO_CLI;
    try { return require.resolve('@deepseek-ai/libreoffice-kit/lib/cli.js'); } catch (_) { /* candidates */ }
    const rel = path.join('@deepseek-ai', 'libreoffice-kit', 'lib', 'cli.js');
    const cands = [
      path.join(process.cwd(), 'node_modules', rel),
      path.join(__dirname, '..', 'node_modules', rel),
      'F:\\deepseek_haeness_inload\\resources\\app.asar.unpacked\\dsh\\node_modules\\' + rel
    ];
    for (const c of cands) { if (fs.existsSync(c)) return c; }
    return '';
  }
  const cli = locateCli();
  if (!cli || !fs.existsSync(cli)) return { ok: false, error: '找不到 bundled LibreOffice Kit CLI（设置 WORKBENCH_LO_CLI）' };
  const nodeBin = process.env.WORKBENCH_LO_NODE || process.execPath;
  // LibreOffice Kit 的 recalculate 要求输入/输出路径不同：先算到临时文件，再替换回原文件。
  const os = require('os');
  const tmpOut = path.join(os.tmpdir(), 'workbench-recalc-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.xlsx');
  try {
    execFileSync(nodeBin, [cli, 'recalculate', '--input', file, '--output', tmpOut],
      { encoding: 'utf8', timeout: 120000 });
    if (!fs.existsSync(tmpOut)) return { ok: false, error: '重算未产出文件' };
    fs.copyFileSync(tmpOut, file);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  } finally {
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch (_) {}
  }
}

/**
 * 读表缓存（性能修复，2026-11-19）：defaultReadTable 每次要 spawn python + import openpyxl
 *（约 600ms 起步）+ 逐个读同目录兄弟数据源，单次可达 3s+。而面板 /state 每 900ms 轮询一次、
 * 每次动作又重读，导致「暂无预览要等很久 / 点理解很久没反应」。
 * 这里加一层**每文件 TTL 缓存**：短 TTL 内重复读复用结果；写盘（apply）后主动 invalidate。
 * 副作用：外部改动文件后最多延迟 TTL 才看到（TTL 取短，2s，兼顾实时性与性能）。
 * 兄弟数据源（extract 用）单独 lazy 缓存，只有 extract 真正需要时才加载（不拖累每次读表）。
 */
const _readCache = new Map(); // key = absPath -> { at:number, value:{columns,rows,sources?} }
const _sourcesCache = new Map(); // key = absPath -> { at:number, value:sourcesDict }
const READ_CACHE_TTL_MS = 2000;
const SOURCES_CACHE_TTL_MS = 10000;

function _invalidateOne(absPath) {
  try { _readCache.delete(absPath); } catch (_) {}
  try { _sourcesCache.delete(absPath); } catch (_) {}
}
/** 写盘后调用：让下一次读表拿到最新磁盘状态（不缓存脏值）。 */
function invalidateReadCache(absPath) {
  if (absPath) _invalidateOne(absPath);
  else { _readCache.clear(); _sourcesCache.clear(); }
}

/**
 * 读表（带 TTL 缓存）。除主表外不再默认 eager 读兄弟数据源（那是 3s 慢的主因）；
 * 兄弟数据源改走 loadSourcesForExtract(file) 惰性加载。
 * @param {string} file
 * @returns {{columns:string[], rows:object[]}}
 */
function cachedReadTable(file) {
  const now = Date.now();
  const hit = _readCache.get(file);
  if (hit && (now - hit.at) < READ_CACHE_TTL_MS) return hit.value;
  const value = defaultReadTableCore(file);
  _readCache.set(file, { at: now, value });
  return value;
}

/**
 * 惰性加载主表同目录的兄弟数据源（extract 动作需要时才调）。结果缓存 10s。
 * @param {string} file 主表绝对路径
 * @returns {Object<string,{columns:string[],rows:object[]}>}
 */
function loadSourcesForExtract(file) {
  const now = Date.now();
  const hit = _sourcesCache.get(file);
  if (hit && (now - hit.at) < SOURCES_CACHE_TTL_MS) return hit.value;
  let value = {};
  try { value = collectSiblingSources(file); } catch (_) { value = {}; }
  _sourcesCache.set(file, { at: now, value });
  return value;
}

/**
 * 默认读表器：spawn python xlsx_bridge.py read-values <file>，解析其 stdout JSON。
 * 读 data_only=True（重算缓存值），与 univer 一致地取最终可见值。
 * 注：为性能**不再**在此 eager 读兄弟数据源；见 cachedReadTable / loadSourcesForExtract。
 * @param {string} file 绝对路径
 * @returns {{columns:string[], rows:object[]}}
 */
function defaultReadTable(file) {
  return cachedReadTable(file);
}

/** 真正的读表实现（无缓存无兄弟源）：spawn python 读主表。 */
function defaultReadTableCore(file) {
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
 * 收集主表同目录下的声明式数据源文件（.csv/.xlsx），读成引擎要求的结构：
 *   sources[文件名] = { columns:[...], rows:[{列名:值}] }
 * 约定：extract 的「来源文件」就是同目录里的这些兄弟文件（如 外勤登记表.csv）。
 * 只读、不写；单个文件读失败则跳过（不连累其它数据源）。
 * @param {string} mainFile 主表绝对路径
 * @returns {Object<string,{columns:string[],rows:object[]}>}
 */
function collectSiblingSources(mainFile) {
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  function py(args) {
    let lastErr = null;
    for (const bin of candidates) {
      const r = spawnSync(bin, [bridge].concat(args), { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      if (r.error) { lastErr = r.error; continue; }
      if (r.status !== 0) { lastErr = new Error(r.stderr || ('exit ' + r.status)); continue; }
      const out = (r.stdout || '').trim();
      return out ? out : '';
    }
    throw lastErr || new Error('找不到可用的 python 解释器');
  }
  const dir = path.dirname(mainFile);
  const self = path.basename(mainFile).toLowerCase();
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return {}; }
  const sources = {};
  entries.forEach(function (name) {
    const lower = name.toLowerCase();
    if (lower === self) return; // 跳过主表自身
    if (!/\.(csv|xlsx|xls)$/.test(lower)) return;
    const abs = path.join(dir, name);
    try {
      let parsed;
      if (lower.endsWith('.csv')) {
        // read_csv 只回 rows 数组；列名从首行推断。
        const rowsOut = py(['read-csv', abs]);
        const rows = JSON.parse(rowsOut);
        const columns = rows.length ? Object.keys(rows[0]) : [];
        parsed = { columns: columns, rows: rows };
      } else {
        parsed = JSON.parse(py(['read-values', abs]));
      }
      if (parsed && Array.isArray(parsed.rows)) sources[name] = parsed;
    } catch (_) { /* 单个数据源读失败跳过 */ }
  });
  return sources;
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
    // 惰性加载兄弟数据源：仅当已存草稿是 extract 时才需要（不拖累普通读表）。
    try {
      if (draft && draft.kind === 'extract') {
        const sources = loadSourcesForExtract(absPath);
        if (sources && Object.keys(sources).length) table = Object.assign({}, table, { sources: sources });
      }
    } catch (_) { /* 非致命 */ }
    const vm = buildPanelState({ columns: table.columns, rows: table.rows, draft: draft, registryButtons: presets() });
    // 用户 m06880：IDLE（还没动作）也要能显示原始表格；执行后要能显示改后表格且知道 stage。
    // 这里额外回传 整表 table{columns,rows} 与 stage。rows 直接给（面板渲染原始表格用）。
    const sess = deps.store && typeof deps.store.view === 'function'
      ? (function () { try { return deps.store.view(absPath, table); } catch (_) { return null; } })()
      : null;
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
        buttons: vm.buttons || [],
        // 新增：整表 + stage（供面板渲染原始/执行后表格；无 store 时 stage 回落 IDLE）
        table: { columns: (table.columns || []).slice(), rows: (table.rows || []).slice() },
        stage: (sess && sess.stage) || 'IDLE'
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
  // 接缝缺口修复（function 动作）：写公式后就地重算，让缓存值落盘（默认调 LibreOffice Kit）。
  const recalc = deps.recalc || defaultRecalc;
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
    // extract 动作需要「同目录兄弟数据源」。这里在**首次** baseState/view 之前就决定是否挂 sources——
    // 因为 baseState 一旦用不带 sources 的 table 建了态就会缓存住，之后补 sources 也进不去引擎。
    // 触发条件：动作是 UNDERSTAND/RUN_BUTTON（尚不知道 kind，先备好），或表本已有 sources 需求。
    // loadSourcesForExtract 内置 10s 缓存，只有真正的第一次会 spawn python 读兄弟文件。
    // 关键：文件首次动作几乎总是 UNDERSTAND → 态第一次建就带上 sources，无需事后 reset。
    try {
      const actUpper0 = typeof action.type === 'string' ? action.type.toUpperCase() : '';
      const quickKindExtract = actUpper0 === 'QUICK' && action && action.kind === 'extract';
      if (actUpper0 === 'UNDERSTAND' || actUpper0 === 'RUN_BUTTON' || quickKindExtract) {
        const sources = loadSourcesForExtract(absPath);
        if (sources && Object.keys(sources).length) table = Object.assign({}, table, { sources: sources });
      }
    } catch (_) { /* 数据源加载失败不致命 */ }
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
    // 大小写归一化后判断是否「执行」类动作：真实客户端发小写 confirm（见 client/index.js），
    // 这里必须先转大写再比对，否则小写 confirm 不会触发写盘（面板显示已执行但磁盘没变）。
    const actTypeUpper = typeof action.type === 'string' ? action.type.toUpperCase() : action.type;
    const isExecute = (actTypeUpper === 'CONFIRM' || actTypeUpper === 'RUN_BUTTON');
    if (isExecute && vm.stage === 'EXECUTED' && beforeStage !== 'EXECUTED' && vm.preview && (vm.preview.cells || vm.preview.summaryRow || vm.appendedSummary)) {
      try {
        // 结构性动作（sort）：preview 里带 sortOrder（新行序下标数组）时，落盘走「整表重排」而非逐格改值。
        // 汇总（sum）：vm.appendedSummary 存在时走「追加一行」落盘（append-summary），不逐格改值。
        const r = applyTable(absPath, vm.preview.cells, vm.preview.sortOrder, vm.appendedSummary);
        wrote.writtenOk = true;
        wrote.writtenCells = (r && r.cellsWritten != null) ? r.cellsWritten : vm.preview.cells.length;
        if (r && r.reordered != null) wrote.reordered = r.reordered;
        if (r && r.summaryAppended) wrote.summaryAppended = r.summaryAppended;
        // 接缝缺口修复（function 动作）：若写出的单元格里有公式（after 以 = 开头），
        // 立刻就地重算，让缓存值落盘 → 面板/文件里「应发」等列能马上看到算出来的数，
        // 而不是空空如也（apply 只写公式字符串、不计算；read 用 data_only 读缓存值）。
        const hasFormula = vm.preview.cells.some(function (c) {
          return typeof c.after === 'string' && c.after.charAt(0) === '=';
        });
        if (hasFormula) {
          const rec = recalc(absPath);
          wrote.recalcOk = !!(rec && rec.ok);
          if (rec && !rec.ok) wrote.recalcError = rec.error;
        }
        // 写盘成功后让缓存失效，下一次读表拿到最新磁盘状态。
        invalidateReadCache(absPath);
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
        writeError: wrote.writeError,
        recalcOk: wrote.recalcOk,
        recalcError: wrote.recalcError
      }
    };
  };
}

module.exports = { makeStateHandler, makeButtonHandler, makeActionHandler, makeTemplatesHandler, makeCreateHandler, defaultReadTable, defaultReadTableCore, cachedReadTable, loadSourcesForExtract, invalidateReadCache, defaultApplyTable, defaultCreateTable, defaultLoadTemplates, defaultRecalc, collectSiblingSources };

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
      name: params.name,
      columns: params.columns,
      primaryKey: params.primaryKey,
      rows: params.rows
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