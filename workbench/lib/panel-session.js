'use strict';
// 票 #47：面板内「新建配方」的 Host 侧会话状态（纯逻辑 seam）。
// 目的：让面板能走完整 5 步管线（输入 → 理解 → 解释与影响预览 → 确认执行 → 固化为按钮），
// 而不是只有「点已存在的按钮重算」。引擎只在 Host 侧被调用（延续 #41 管道，client 不 require 引擎）。
//
// 设计：每个文件（绝对路径）维护一份引擎 state（含 input/draft/stage/buttons）。
// applyAction(file, table, action) 用该文件的当前 state 调 E.reduce，持久化新 state，返回视图模型。
// 纯函数式：store 是工厂，状态放内存 Map；测试可注入空 table、不碰真实文件。
//
// 票 #49：固化按钮的持久化——用户「新加按钮」后重启不该丢。默认把某文件的固化按钮（buttons，
// 不含预置 registryButtons）落到同目录的 `.workbench-buttons.json` sidecar：文件缺失/损坏都安全
// 退化为「没有持久按钮」，绝不抛错。读写在 loadButtons/saveButtons 两个可注入的钩子里，
// 测试可注入内存实现、不碰真实文件系统。
const E = require('./engine');

const SIDECAR_SUFFIX = '.workbench-buttons.json';

// 默认读/写器：读写同目录 sidecar。失败一律吞掉（读失败→null；写失败→false），不影响主管线。
function defaultLoadButtons(fileAbs) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.dirname(fileAbs);
    const base = path.basename(fileAbs);
    const sidecar = path.join(dir, base + SIDECAR_SUFFIX);
    if (!fs.existsSync(sidecar)) return null;
    const raw = fs.readFileSync(sidecar, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (_) { return null; }
}
function defaultSaveButtons(fileAbs, buttons) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.dirname(fileAbs);
    const base = path.basename(fileAbs);
    const sidecar = path.join(dir, base + SIDECAR_SUFFIX);
    fs.writeFileSync(sidecar, JSON.stringify(buttons || [], null, 2), 'utf8');
    return true;
  } catch (_) { return false; }
}

// 引擎里会改固化按钮集合/内容的动作类型（这些之后要落盘）。
const BUTTON_MUTATING = ['SOLIDIFY', 'DELETE_BUTTON', 'RENAME_BUTTON', 'SET_BUTTON_PARAMS'];

// 票 #52：把仓内预置按钮注册表（registry/*.json）加载成完整声明式按钮，供面板按钮库统一入口。
// 走 #16 的 host seed 契约：读目录 → E.loadRegistry（结构性封闭校验）→ accepted 即 registryButtons。
// 目录不存在/读取失败一律返回空数组、绝不抛错（预置按钮缺失不影响主管线）。只读、无网络、无凭据。
function defaultLoadRegistry(registryDir) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = registryDir || path.join(__dirname, '..', 'registry');
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f); }).sort();
    const entries = [];
    for (let i = 0; i < files.length; i++) {
      try { entries.push(JSON.parse(fs.readFileSync(path.join(dir, files[i]), 'utf8'))); } catch (_) { /* 单文件坏了跳过 */ }
    }
    const result = E.loadRegistry(entries, null); // 结构性校验：不绑死具体表
    return Array.isArray(result.accepted) ? result.accepted : [];
  } catch (_) { return []; }
}

function createSessionStore(opts) {
  opts = opts || {};
  const loadButtons = opts.loadButtons || defaultLoadButtons;
  const saveButtons = opts.saveButtons || defaultSaveButtons;
  const loadRegistry = opts.loadRegistry || function () { return defaultLoadRegistry(opts.registryDir); };
  let registryCache = null; // 预置按钮只加载一次，所有文件共用（跨表通用）
  function presets() {
    if (registryCache === null) {
      try { registryCache = loadRegistry() || []; } catch (_) { registryCache = []; }
    }
    return registryCache;
  }
  // per-file 状态隔离：每个 store 实例各自持有一份 Map。此前误为模块级共享 Map，
  // 导致两个 store（不同测试/不同 profile 重置）看到同一 file key 的历史 EXECUTED state，
  // 第一个动作被 reducer 忽略、视图仍是旧数据。改为实例级 Map 修复。
  const states = Object.create(null); // fileAbs -> engine state

  function key(file) { return String(file || ''); }

  function baseState(file, table) {
    if (states[key(file)]) return states[key(file)];
    const columns = (table && table.columns) ? table.columns.slice() : [];
    const rows = (table && table.rows) ? table.rows.map(function (r) { return Object.assign({}, r); }) : [];
    let st = E.initial({ columns: columns, rows: rows, sources: (table && table.sources) || undefined });
    // 票 #52：把仓内预置按钮（registry/*.json，跨表通用）水合进 registryButtons，
    // 令面板按钮库「预置 + 固化」统一入口（#16 的 host seed 契约在此接线）。
    try {
      const presetList = presets();
      if (presetList.length) {
        st = E.hydrateRegistry(st, presetList);
      }
    } catch (_) { /* 预置加载失败不影响主管线 */ }
    // 票 #49：首次见到该文件时，把持久化的固化按钮水合进来（缺省没有就保持空）。
    try {
      const persisted = loadButtons(file);
      if (Array.isArray(persisted) && persisted.length) {
        st = Object.assign({}, st, { buttons: persisted.map(function (b) { return Object.assign({}, b); }) });
      }
    } catch (_) { /* 持久化失败不影响主管线 */ }
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
    // 票 #49：固化按钮变动后落盘（sidecar），令「新加/改名/删除按钮」重启后仍在。
    if (BUTTON_MUTATING.indexOf(act.type) !== -1 && next && next.stage !== undefined) {
      try { saveButtons(file, (next.buttons || []).map(function (b) { return Object.assign({}, b); })); } catch (_) {}
    }
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

module.exports = { createSessionStore, defaultLoadButtons, defaultSaveButtons, defaultLoadRegistry, SIDECAR_SUFFIX };
