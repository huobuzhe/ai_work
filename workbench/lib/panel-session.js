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
    // 票 #56：先从用户那句话里「按出现顺序」捞出真实列名（如「对调工时和时薪两列」→ [工时,时薪]）。
    // understand() 只做 kind 关键词匹配、不解析列名；这里把句子中真实存在的列名按出现位置排序，
    // 供 swap 双字段/条件类等使用，令「一句话 → 理解 → 预览」在真实表上一次到位。
    const mentioned = [];
    if (draft.sentence) {
      const sent = String(draft.sentence);
      columns.forEach(function (col) {
        if (col == null || col === '') return;
        const idx = sent.indexOf(String(col));
        if (idx !== -1) mentioned.push({ col: col, idx: idx });
      });
      mentioned.sort(function (a, b) { return a.idx - b.idx; });
    }
    const mentionedCols = mentioned.map(function (m) { return m.col; });
    // 取前两个实际列作为「字段A/字段B」「来源列/目标列」等的默认候选。
    const c0 = columns[0];
    const c1 = columns.length > 1 ? columns[1] : columns[0];
    // swap 且句子点明了 ≥2 个真实列名 → 直接用它们（避免默认列名撞列 / 撞上不相关真实列）。
    if (draft.kind === 'swap' && mentionedCols.length >= 2) {
      p['字段A'] = mentionedCols[0];
      p['字段B'] = mentionedCols[1];
    } else {
      // 常见列名参数：不存在就映射到实际列（仅当该参数存在且当前值不是有效列时）。
      const mapA = ['字段A', '来源列', '目标列', '列', '来源', '目标'];
      mapA.forEach(function (k) {
        if (p[k] !== undefined && !exists(p[k]) && columns.indexOf(p[k]) === -1) p[k] = c0;
      });
      if (p['字段B'] !== undefined && !exists(p['字段B'])) p['字段B'] = c1;
    }
    // 兜底：swap 两字段最终仍相同（如同命中同一真实列）→ 退到前两个不同实际列。
    if (draft.kind === 'swap' && p['字段A'] === p['字段B']) {
      const distinct = columns.filter(function (c) { return c !== p['字段A']; });
      if (distinct.length) p['字段B'] = distinct[0];
    }
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

  // QUICK「一键动作」的列名参数预归一化：把手写默认列名映射到当前表真实列。
  // 只处理「列名类」参数（必须是已存在列）；枚举/文本/表达式参数保持引擎缺省。
  // 关键改进（#58 后续）：不能盲目取前两列——那会让 swap 换错列、conditional/function/extract 落到
  // 姓名/部门等错列。这里按表头语义 + 实际数值类型做启发式：
  //   · numericCols = 表里「看起来是数字」的列（列名含 工时/时薪/工资/数量/金额/价/额/数 或抽样值多为数字）
  //   · textCols = 其余文本列
  //   · 优先保证「写入类目标」落在文本列、「计算/对调」落在数字列，且尽量不覆盖主键列。
  function preNormalizeQuickParams(kind, p, cols, rows, primaryKey) {
    if (!cols || cols.length === 0) return p;
    const has = function (v) { return v != null && cols.indexOf(v) !== -1; };
    const pk = primaryKey || cols[0];
    const NUMNAME = /工时|时薪|工资|薪|数量|金额|价|额|数|量|score|hour|wage|salary|amount|qty|count|price|total/i;
    const isNumericCol = function (col) {
      if (NUMNAME.test(String(col))) return true;
      if (!Array.isArray(rows) || rows.length === 0) return false;
      let num = 0, tot = 0;
      for (const r of rows) {
        const v = r && r[col];
        if (v === '' || v == null) continue;
        tot++;
        if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v).trim())) num++;
      }
      return tot > 0 && num / tot >= 0.6;
    };
    const numericCols = cols.filter(isNumericCol);
    const textCols = cols.filter(function (c) { return !isNumericCol(c); });
    const nonPk = cols.filter(function (c) { return c !== pk; });
    const nonPkNumeric = nonPk.filter(isNumericCol);
    const pickWriteCol = function (cur) {
      if (has(cur) && cur !== pk) return cur;
      // 写入类：优先文本列（且非主键）；没有文本列则取非主键列；再不行取末列。
      const cand = textCols.filter(function (c) { return c !== pk; });
      if (cand.length) return cand[cand.length - 1]; // 最右文本列（常是「备注/说明」类空白列）
      if (nonPk.length) return nonPk[nonPk.length - 1];
      return cols[cols.length - 1];
    };
    if (kind === 'swap') {
      // 对调两列：未指定有效列时，优先挑两个数字列（工时↔时薪）；不足两个数字列退回前两列。
      const src = nonPkNumeric.length >= 2 ? nonPkNumeric : cols;
      if (!has(p['字段A'])) p['字段A'] = src[0];
      if (!has(p['字段B'])) { const d = src.filter(function (c) { return c !== p['字段A']; }); p['字段B'] = d.length ? d[0] : (src[1] || pk); }
    } else if (kind === 'conditional') {
      // 条件改动：目标列默认落一个文本/备注列（标「加班」等），别覆盖主键。
      if (!has(p['目标列']) || p['目标列'] === pk) p['目标列'] = pickWriteCol(p['目标列']);
      // 条件保持引擎缺省（如 '工时 > 150'）；若表里无 工时 列，用首个数字列构造条件。
      if (!has(p['条件']) && typeof p['条件'] === 'string' && numericCols.length && !numericCols.some(function (c) { return p['条件'].indexOf(c) !== -1; })) {
        p['条件'] = numericCols[0] + ' > 0';
      }
    } else if (kind === 'function') {
      // 公式计算：结果应写到「新列」而非覆盖现有文本/备注列（用户 m07024：写备注列让原表格式看着变了）；
      // 默认新建「应发」列（若表里已有同名非主键列则直接用，避免重复建列）。
      if (!has(p['输出列']) || p['输出列'] === pk) {
        p['输出列'] = (cols.indexOf('应发') !== -1 && '应发' !== pk) ? '应发' : '应发';
      }
      // 表达式：若缺省且表里有 ≥2 个数字列，构造 数字列1*数字列2。
      if (numericCols.length >= 2 && (!p['表达式'] || typeof p['表达式'] !== 'string')) {
        p['表达式'] = numericCols[0] + ' * ' + numericCols[1];
      }
    } else if (kind === 'extract') {
      if (!has(p['匹配列'])) p['匹配列'] = pk; // 用主键做匹配列
      if (!has(p['写到']) || p['写到'] === pk) p['写到'] = pickWriteCol(p['写到']);
    }
    return p;
  }

  // 应用一个动作，返回视图模型（含 stage/draft/preview/buttons/note）。
  // action = { type, text?, kind?, params?, name? }
  function applyAction(file, table, action) {
    const cur = baseState(file, table);
    // 大小写归一化：真实客户端（client/index.js）发的是小写动作名
    // （understand/preview/confirm/solidify/…），而引擎 reduce 的 switch 只认大写
    // （UNDERSTAND/PREVIEW/CONFIRM/SOLIDIFY/…），未归一化时小写会落 default 被静默忽略
    // → 面板点「理解」无反应、stage 永远停在 IDLE（曾致真实面板整条管线失效）。
    // 在此统一归一化为大写（已是大小写正确的动作不受影响），作为 Host 侧唯一兜底口。
    const act = Object.assign({}, action || {});
    if (typeof act.type === 'string') act.type = act.type.toUpperCase();
    // QUICK（面板「一键动作」按钮）：引擎在 reduce 内部立刻 preview+校验，用默认列名（部门/备注等）
    // 落到真实表必失败，事后 normalizeDraft 已来不及（reduce 已 return guard）。故在 reduce **之前**
    // 就把 params 的列名类参数按真实列预归一化，令一键动作也能在任意表上直接出预览。
    if (act.type === 'QUICK' && act.kind) {
      try {
        const cols = (cur.columns || []).slice();
        const rows = (cur.rows || []).slice();
        const pk = cur.primaryKey;
        act.params = preNormalizeQuickParams(act.kind, Object.assign({}, act.params || {}), cols, rows, pk);
      } catch (_) {}
    }
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
    const columns = (st.columns || []).slice();
    const rows = (st.rows || []).slice();
    // 表格化预览支持：把整张表（columns + rows）以及「应用变更后」的 afterRows 一并给出，
    // 令面板渲染成真正的表格网格（修改前/修改后），不再逐格「第X行 列：a → b」文本。
    let preview = st.preview || null;
    if (preview) {
      // 由 preview.cells 的 rowIndex + col 组装 afterRows（浅拷贝每行，只覆盖受影响格）。
      let afterRows = null;
      try {
        afterRows = rows.map(function (r) { return Object.assign({}, r); });
        const cells = Array.isArray(preview.cells) ? preview.cells : [];
        for (const c of cells) {
          const ri = (c.rowIndex != null) ? c.rowIndex : -1;
          if (ri >= 0 && ri < afterRows.length && c.col != null) {
            afterRows[ri][c.col] = c.after;
          }
        }
      } catch (_) { afterRows = null; }
      // 结构性动作（sort）：preview.sortOrder 给出新行序下标数组。
      // 预览要展示「排好序后的表」——afterRows 按 sortOrder 重排（行内容不变），
      // 让用户在确认前就看到排序效果；同时保留 sortOrder 供写盘（defaultApplyTable）使用。
      if (Array.isArray(preview.sortOrder) && preview.sortOrder.length === afterRows.length) {
        try {
          afterRows = preview.sortOrder.map(function (i) { return Object.assign({}, rows[i]); });
        } catch (_) {}
      }
      // 若预览会新增列（如 function 的「应发」），这些列在原 columns 里没有 → 追加到展示列，
      // 否则预览表格看不到新列、受影响的「新增格」也无处渲染（用户 m07024：公式结果列看不到）。
      let previewColumns = columns.slice();
      try {
        const cells = Array.isArray(preview.cells) ? preview.cells : [];
        for (const c of cells) {
          if (c && c.col != null && previewColumns.indexOf(c.col) === -1) previewColumns.push(c.col);
        }
      } catch (_) {}
      preview = Object.assign({}, preview, { columns: previewColumns, rows: rows, afterRows: afterRows });
    }
    // 用户 m06880：一打开（还没动作/IDLE）就要看到原始表格。无条件带上当前表 table{columns,rows}，
    // 供 client 在无预览时渲染原表。
    return {
      stage: st.stage || 'IDLE',
      input: st.input || '',
      draft: st.draft || null,
      preview: preview,
      table: { columns: columns, rows: rows },
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
