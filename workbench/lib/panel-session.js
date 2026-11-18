'use strict';
// 票 #47：面板内「新建配方」的 Host 侧会话状态（纯逻辑 seam）。
// 目的：让面板能走完整 5 步管线（输入 → 理解 → 解释与影响预览 → 确认执行 → 固化为按钮），
// 而不是只有「点已存在的按钮重算」。引擎只在 Host 侧被调用（延续 #41 管道，client 不 require 引擎）。
//
// 设计：每个文件（绝对路径）维护一份引擎 state（含 input/draft/stage/buttons）。
// applyAction(file, table, action) 用该文件的当前 state 调 E.reduce，持久化新 state，返回视图模型。
// 纯函数式：store 是工厂，状态放内存 Map；测试可注入空 table、不碰真实文件。
const E = require('./engine');

function createSessionStore() {
  const states = Object.create(null); // fileAbs -> engine state

  function key(file) { return String(file || ''); }

  function baseState(file, table) {
    if (states[key(file)]) return states[key(file)];
    const columns = (table && table.columns) ? table.columns.slice() : [];
    const rows = (table && table.rows) ? table.rows.map(function (r) { return Object.assign({}, r); }) : [];
    const st = E.initial({ columns: columns, rows: rows, sources: (table && table.sources) || undefined });
    states[key(file)] = st;
    return st;
  }

  // 把草稿里「指向不存在的列」的列名参数，按当前表实际列做一次合理默认映射。
  // 背景：understand()→buildDraft() 产出的草稿用的是引擎内置默认列名（如 部门/备注），
  // 落到一张真实表（如 姓名/工时）上校验必失败。Host 侧知道真实列，据此把这类默认列名
  // 替换为实际前两列，令「一句话 → 理解 → 预览」在任意表上都能跑通；用户仍可改。
  function normalizeDraft(draft, columns) {
    if (!draft || !draft.params || !columns || columns.length === 0) return draft;
    const p = Object.assign({}, draft.params);
    const exists = function (name) { return name != null && name !== '' && columns.indexOf(name) !== -1; };
    // 取前两个实际列作为「字段A/字段B」「来源列/目标列」等的默认候选。
    const c0 = columns[0];
    const c1 = columns.length > 1 ? columns[1] : columns[0];
    // 常见列名参数：不存在就映射到实际列（仅当该参数存在且当前值不是有效列时）。
    const mapA = ['字段A', '来源列', '目标列', '列', '来源', '目标'];
    mapA.forEach(function (k) {
      if (p[k] !== undefined && !exists(p[k]) && columns.indexOf(p[k]) === -1) p[k] = c0;
    });
    if (p['字段B'] !== undefined && !exists(p['字段B'])) p['字段B'] = c1;
    const merged = Object.assign({}, draft, { params: p });
    // 重算派生字段（steps/explanation 依赖 params）。
    try {
      const rebuilt = E.buildDraft(draft.kind, null, p);
      rebuilt.name = draft.name;
      rebuilt.sentence = draft.sentence;
      return rebuilt;
    } catch (_) {
      return merged;
    }
  }

  // 应用一个动作，返回视图模型（含 stage/draft/preview/buttons/note）。
  // action = { type, text?, kind?, params?, name? }
  function applyAction(file, table, action) {
    const cur = baseState(file, table);
    const act = action || {};
    let next = E.reduce(cur, act);
    // Host 侧兜底：UNDERSTAND / QUICK 产出的草稿，若列名参数指向不存在的列，映射到真实列，
    // 令后续 PREVIEW 能在真实表上通过校验（否则默认列名 部门/备注 一定失败）。
    if ((act.type === 'UNDERSTAND' || act.type === 'QUICK') && next && next.draft && next.stage !== 'EXECUTED') {
      const fixed = normalizeDraft(next.draft, (next.columns || []).slice());
      if (fixed !== next.draft) next = Object.assign({}, next, { draft: fixed });
    }
    states[key(file)] = next;
    return toView(file, next);
  }

  // 只读取当前视图（不改状态）；若还没 state 就用 table 初始化。
  function view(file, table) {
    const cur = baseState(file, table);
    return toView(file, cur);
  }

  // 重置某文件的状态（测试/换文件时用）。
  function reset(file) { delete states[key(file)]; }

  function toView(file, st) {
    const buttons = (st.buttons || []).map(function (b) { return Object.assign({}, b); });
    const registryButtons = (st.registryButtons || []).map(function (b) { return Object.assign({}, b); });
    return {
      stage: st.stage || 'IDLE',
      input: st.input || '',
      draft: st.draft || null,
      preview: st.preview || null,
      note: st.note || '',
      noteTone: st.noteTone || 'info',
      buttons: buttons,
      registryButtons: registryButtons,
      log: (st.log || []).slice()
    };
  }

  return { baseState, applyAction, view, reset };
}

module.exports = { createSessionStore };
