'use strict';
/**
 * 票 #41 seam A（Host 纯函数）：把「已解析的表格数据 + 一份草稿配方」合成面板真正要显示的
 * 视图模型（含真实 preview）。
 *
 * 设计要点（用户拍板 m01709）：数据管道走 Host 侧——宿主半算好 preview 推给面板，
 * client 不 require 引擎。本模块是宿主半的那份「算 preview」的纯逻辑，吃已解析数据，
 * 不碰 python / 文件系统 / 网络，便于单测（seam A 吃解析后数据）。
 *
 * 输入形状：{ columns: string[], rows: object[], draft: <引擎草稿> }
 * 输出形状：{ stage, draft, preview }  —— preview 为引擎 preview() 的真实产出（可再经
 *   client 的 projectPreviewCard 投影成六段视图）。
 */
const E = require('./engine');

function buildPanelState(parsed) {
  parsed = parsed || {};
  const columns = (parsed.columns || []).slice();
  const rows = (parsed.rows || []).map(function (r) { return Object.assign({}, r); });
  let draft = parsed.draft || null;

  // 无草稿时：若表有 ≥2 列，自动派生一个「默认配方」= 调换「末两列」（swap）。
  // 目的：打开一张有数据的表，面板立刻显示真实的「影响 N 行」，而不是空占位。
  // 这是**真实**可执行的配方（两列一定存在、作用于全部行），不是假造的计数；
  // 用 isDefault 标记，面板可标注「（默认配方：调换后两列）」，用户后续可换成别的。
  //
  // 票 #50：默认配方改调换**末两列**而非前两列——第一列通常是主键（如「姓名」），
  // 调换主键列会把行的身份标识本身改掉，重跑/二次执行时按主键定位会错位、甚至写坏数据
  // （E2E 实测验证过：连续执行两次「调换前两列」出现 80/80 这种脏值）。避开主键更安全、
  // 也更贴近「调换两个数据列」的真实诉求。只有恰好 2 列（无独立主键可避）时才退回调换这两列。
  let isDefault = false;
  if (!draft && columns.length >= 2) {
    try {
      const a = columns.length >= 3 ? columns[columns.length - 2] : columns[0];
      const b = columns.length >= 3 ? columns[columns.length - 1] : columns[1];
      draft = E.buildDraft('swap', null, { 字段A: a, 字段B: b, scope: 'all', 条件: '' });
      isDefault = true;
    } catch (_) { draft = null; isDefault = false; }
  }

  // 用真实引擎建 state 并算 preview（不手搓）。
  // 票 #52：把调用方传入的预置按钮（registryButtons，预处理来源）交给 initial() 水合，
  // 面板按钮库才能「预置 + 固化」统一入口（此前恒为 []，3 个预置按钮从不出现）。
  const base = E.initial({ columns: columns, rows: rows, registryButtons: parsed.registryButtons || undefined });
  const state = Object.assign({}, base, {
    stage: draft ? 'PREVIEWED' : 'IDLE',
    draft: draft,
    preview: draft ? E.preview(base, draft) : null
  });
  // 票 #43：把「按钮库」声明式投影也一并交给面板——预置按钮（registryButtons）与
  // 用户固化按钮（buttons）原样带出（声明式、无可执行代码），client 侧 projectButtonLibrary
  // 会投影成可点按钮。点击**不驱动引擎**（本票只做 UI 可点 + 事件通道）。
  const registryButtons = (base.registryButtons || []).slice();
  // 票 #45：带上调用方传入的用户固化按钮（host 权威源），再追加默认配方按钮。
  const buttons = (parsed.buttons || base.buttons || []).map(function (b) { return Object.assign({}, b); });
  // 票 #45：把自动派生的默认配方（调换前两列）也做成一个可点按钮，让新表无需先固化配方
  // 就能走通「点击→重算→预览刷新」闭环。id 用保留前缀 __default__，避开固化的 b* 空间。
  if (isDefault && draft) {
    buttons.push({
      id: '__default__',
      name: '默认配方（调换后两列）',
      kind: 'swap',
      source: 'default',
      params: Object.assign({}, draft.params || {})
    });
  }
  return {
    stage: state.stage, draft: state.draft, preview: state.preview, isDefault: isDefault,
    registryButtons: registryButtons, buttons: buttons
  };
}

module.exports = { buildPanelState, buildButtonPreview, buildCreateSpec };

/**
 * 票 #52 seam A（Host 纯函数）：「从模板新建表格」的结构合成。
 * 给定仓内模板清单（templates 数组，每项 {name, primaryKey, columns, file?}）与一个请求
 * {mode, template, name}，产出一张待建空表的结构 {primaryKey, columns}（走引擎 createTable 单一来源）。
 *
 * - mode 缺省 'template'。
 * - template 可以是模板名（name）或模板文件名（file），二选一匹配。
 * - name 缺省用模板名。
 * 返回：{ ok:true, structure:{primaryKey,columns,name} } 或
 *       { ok:false, errors:[{field,reason}] }（模板找不到 / 清单非法 / mode 不支持）。
 * 纯逻辑：不读文件、不碰 python，便于单测。
 *
 * @param {object[]} templates 模板清单（来自 load-templates 契约的 templates 数组）
 * @param {{mode?:string, template?:string, name?:string, columns?:string, primaryKey?:string}} req
 */
function buildCreateSpec(templates, req) {
  req = req || {};
  const list = Array.isArray(templates) ? templates : [];
  const mode = req.mode || 'template';
  // 空白表模式：用户直接给列名清单（逗号/空格/顿号分隔），首列作主键（可用 primaryKey 指定）。
  if (mode === 'blank') {
    const raw = String(req.columns || '').trim();
    if (!raw) return { ok: false, errors: [{ field: 'columns', reason: '空白表至少需要一个列名' }] };
    const names = raw.split(/[\s,，、;；]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (names.length === 0) return { ok: false, errors: [{ field: 'columns', reason: '空白表至少需要一个列名' }] };
    // 去重（保留首现顺序）
    const seen = {}; const uniq = [];
    names.forEach(function (n) { if (!seen[n]) { seen[n] = 1; uniq.push(n); } });
    const pk = (req.primaryKey && String(req.primaryKey).trim()) || uniq[0];
    if (uniq.indexOf(pk) < 0) return { ok: false, errors: [{ field: 'primaryKey', reason: '主键列必须在列名清单里：' + pk }] };
    const columns = {}; uniq.forEach(function (n) { columns[n] = 'text'; });
    const name = (req.name && String(req.name).trim()) || '新建表格';
    const built = E.createTable({ mode: 'template', manifest: { schemaVersion: 1, name: name, primaryKey: pk, columns: columns } });
    if (!built || built.ok === false) {
      return { ok: false, errors: (built && built.errors) || [{ field: 'columns', reason: '列名清单非法' }] };
    }
    return { ok: true, structure: { primaryKey: pk, columns: columns, name: name } };
  }
  if (mode === 'upload') {
    // 票 #55：上传建表——用户从文件树选一个已存在的 xlsx/csv，读出列与数据行后在此校验。
    // req.columns: {列名:类型} 字典（缺类型默认 text）；req.primaryKey 缺省取首列；req.rows: [{列名:值}]。
    // 走引擎单一来源 createTable({mode:'upload', manifest, rows})：validateManifest + validateRows 双重封闭校验。
    let cols = req.columns;
    if (typeof cols === 'string') {
      // 宽松：允许传逗号分隔列名（类型默认 text）。
      const names = String(cols).split(/[\s,，、;；]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      const dict = {}; names.forEach(function (n) { if (!dict[n]) dict[n] = 'text'; });
      cols = dict;
    }
    if (!cols || typeof cols !== 'object' || Object.keys(cols).length === 0) {
      return { ok: false, errors: [{ field: 'columns', reason: '上传建表需要列清单（列名→类型）' }] };
    }
    const names = Object.keys(cols);
    const pk = (req.primaryKey && String(req.primaryKey).trim()) || names[0];
    if (names.indexOf(pk) < 0) return { ok: false, errors: [{ field: 'primaryKey', reason: '主键列必须在列清单里：' + pk }] };
    const manifest = { schemaVersion: 1, name: (req.name && String(req.name).trim()) || '上传建表', primaryKey: pk, columns: cols };
    const rows = Array.isArray(req.rows) ? req.rows : [];
    const built = E.createTable({ mode: 'upload', manifest: manifest, rows: rows });
    if (!built || built.ok === false) {
      return { ok: false, errors: (built && built.errors) || [{ field: 'rows', reason: '上传数据行非法' }] };
    }
    return {
      ok: true,
      structure: {
        primaryKey: built.structure.primaryKey,
        columns: cols,
        name: manifest.name,
        rows: (built.structure.rows || []).slice()
      }
    };
  }
  if (mode !== 'template') {
    return { ok: false, errors: [{ field: 'mode', reason: '支持 template / blank / upload（description 见引擎 createTable）' }] };
  }
  const wanted = req.template;
  if (!wanted) return { ok: false, errors: [{ field: 'template', reason: '缺少 template（模板名或文件名）' }] };
  const tpl = list.filter(function (t) { return t && (t.name === wanted || t.file === wanted); })[0];
  if (!tpl) return { ok: false, errors: [{ field: 'template', reason: '找不到模板：' + wanted }] };
  const name = (req.name && String(req.name).trim()) || tpl.name;
  // 结构走引擎单一来源 createTable({mode:'template', manifest})。
  const manifest = { schemaVersion: 1, name: name, primaryKey: tpl.primaryKey, columns: tpl.columns };
  const built = E.createTable({ mode: 'template', manifest: manifest });
  if (!built || built.ok === false) {
    return { ok: false, errors: (built && built.errors) || [{ field: 'template', reason: '模板结构非法' }] };
  }
  return {
    ok: true,
    structure: {
      primaryKey: built.structure.primaryKey,
      // 注意：E.createTable 返回的 structure.columns 是「列名数组」，但 python 桥的 create
      // 需要「列名→类型」字典（按 dict 顺序写表头）。这里回填模板原始 columns 字典。
      columns: tpl.columns,
      name: name
    }
  };
}

/**
 * 票 #44 seam：按钮点击驱动引擎 → 预览卡刷新（Host 纯函数）。
 * 给定「已解析表格数据 + 按钮库」和某个 buttonId，按该按钮的配方（kind+params）用引擎
 * buildDraft → preview，产出「该按钮操作会怎样」的真实影响预览。**只算预览、不执行**——
 * 不调 applyCells、不写回 rows（确认前表格不动）；也不修改传入的 parsed（深拷一份再算）。
 * 校验不通过时如实返回 invalid preview（带 errors），不崩；buttonId 找不到返回 null。
 *
 * @param {{columns:string[], rows:object[], sources?:object, buttons?:object[], registryButtons?:object[]}} parsed
 * @param {string} buttonId
 * @returns {{stage:string, preview:object, draft:object} | null}
 */
function buildButtonPreview(parsed, buttonId) {
  parsed = parsed || {};
  const buttons = (parsed.buttons || []).concat(parsed.registryButtons || []);
  const b = buttons.filter(function (x) { return x && x.id === buttonId; })[0];
  if (!b) return null;
  // 用引擎按按钮配方重建草稿（按钮是声明式配方：kind + params + steps，无代码）。
  let draft;
  try {
    draft = E.buildDraft(b.kind, null, Object.assign({}, b.params || {}));
  } catch (_) {
    draft = { kind: b.kind, params: Object.assign({}, b.params || {}) };
  }
  // 深拷数据再建 state，绝不写回调用方（确认前表格不动 / 不改入参）。
  const columns = (parsed.columns || []).slice();
  const rows = (parsed.rows || []).map(function (r) { return Object.assign({}, r); });
  const base = E.initial({ columns: columns, rows: rows, sources: parsed.sources });
  const pv = E.preview(base, draft);
  return { stage: 'PREVIEWED', preview: pv, draft: draft };
}
