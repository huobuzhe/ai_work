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

  // 无草稿时：若表有 ≥2 列，自动派生一个「默认配方」= 调换前两列（swap）。
  // 目的：打开一张有数据的表，面板立刻显示真实的「影响 N 行」，而不是空占位。
  // 这是**真实**可执行的配方（两列一定存在、作用于全部行），不是假造的计数；
  // 用 isDefault 标记，面板可标注「（默认配方：调换前两列）」，用户后续可换成别的。
  let isDefault = false;
  if (!draft && columns.length >= 2) {
    try {
      draft = E.buildDraft('swap', null, { 字段A: columns[0], 字段B: columns[1], scope: 'all', 条件: '' });
      isDefault = true;
    } catch (_) { draft = null; isDefault = false; }
  }

  // 用真实引擎建 state 并算 preview（不手搓）。
  const base = E.initial({ columns: columns, rows: rows });
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
      name: '默认配方（调换前两列）',
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

module.exports = { buildPanelState, buildButtonPreview };

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
