'use strict';
/**
 * 动作配方引擎（纯模块，主 seam）—— 从 prototypes/workbench.PROTOTYPE.html 的
 * throwaway 分支 prototype/spreadsheet-workbench@commit d29d2c8 lift 而来。
 *
 * 约束（规格 #8 Slice 1）：
 *  - 只有数据进、数据出；不碰 DOM / 浏览器 / 插件注册 / xlsx 文件 / HMR state。
 *  - 输入是「声明式表格数据 + 一句话 / 参数」，输出是校验结果 / 影响预览 / 写值动作。
 *  - 动作配方为声明式、不含可执行代码。
 *  - 跨切面决策：scope=all|match(condition) 公共字段、默认 all、零命中允许确认；
 *    条件闭包单比较（= ≠ > ≥ < ≤）解析失败即拒绝；schemaVersion 封闭校验在预览前跑完。
 */

const SCHEMA_VERSION = 1;

const KINDS = {
  extract: {
    label: '① 提取字段', short: '提取字段',
    medium: '结构化动作：按主键左连接 + 写列',
    params: { 来源文件: '外勤登记表.csv', 匹配列: '姓名', 取哪一列: '邮箱', 写到: '邮箱', scope: 'all', 条件: '' }
  },
  swap: {
    label: '② 调换两段字段', short: '调换两段字段',
    medium: '结构化动作：两列整列互换',
    params: { 字段A: '部门', 字段B: '备注', scope: 'all', 条件: '' }
  },
  conditional: {
    label: '③ 带条件增删', short: '带条件增删',
    medium: '结构化动作：条件筛选 + 写值 / 清空',
    // 带条件增删的本质是「条件」，默认 match 才名副其实；scope 仍是公共字段，可改回 all。
    params: { 条件: '工时 > 150', 动作: '增加', 目标列: '备注', 值: '加班', scope: 'match' }
  },
  function: {
    label: '④ 自定义函数计算', short: '自定义函数计算',
    medium: '公式字符串：应发 = 工时 × 时薪',
    params: { 表达式: '工时 * 时薪', 输出列: '应发', scope: 'all', 条件: '' }
  }
};

function shorten(s) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > 18 ? t.slice(0, 18) + '…' : t;
}

// ---- 条件闭包：= ≠ > ≥ < ≤ 单比较；解析失败返回 null ----
const OP_MAP = {
  '==': '=', '=': '=',
  '!=': '≠', '≠': '≠',
  '>=': '≥', '≥': '≥',
  '<=': '≤', '≤': '≤',
  '>': '>', '<': '<'
};
// 条件值合法性：规格 #8 line 103 —— 第一版只支持「字段 op 值」单比较，
// 值只允许数字 / 文本字面量；AND/OR（含中文）、列间比较、包含 / 为空、内嵌比较符一律非法。
// 解析失败必须报错并禁止确认，绝不静默当成零命中（用户故事 17）。
// 返回 null 表示合法，否则返回具体原因字符串。
function conditionProblem(field, op, value, state) {
  if (!value) return '条件值为空';
  // 值里再出现比较运算符 = 复合条件 / 畸形输入（如「8 AND 部门 = 技术」「>>>」「8 > 5」）
  if (/[><=≠≥≤]/.test(value) || /!(?!=)/.test(value))
    return '条件值不得再含比较运算符（第一版只支持单比较）：' + value;
  // AND / OR / 中文 或、且、并且：第一版不支持复合条件（[v2]，规格 line 22/130）
  if (/\b(and|or)\b/i.test(value) || /或|且|并且/.test(value))
    return '第一版不支持 AND / OR 复合条件：' + value;
  // 包含 / 为空（[v2]）
  if (/包含|为空|contains|is\s+empty/i.test(value))
    return '第一版不支持「包含 / 为空」条件：' + value;
  // 列间比较：值恰好是另一个列名——禁止（规格 line 103）
  if (state && state.columns && state.columns.indexOf(value) !== -1)
    return '不支持列间比较，条件值不能是列名：' + value;
  // 字段必须是当前列
  if (state && state.columns && state.columns.indexOf(field) === -1)
    return '条件字段不是当前列：' + field;
  return null;
}
// 从原始条件文本取具体出错原因（供 validate 报错点名，避免静默）
function conditionProblemFromText(text, state) {
  const m = /^\s*(\S+)\s*(>=|<=|!=|==|≠|≥|≤|>|<|=)\s*(.+?)\s*$/.exec(String(text == null ? '' : text));
  if (!m) return '条件格式应为「字段 op 值」（如 工时 > 8）';
  return conditionProblem(m[1], OP_MAP[m[2]], m[3].trim(), state);
}
function parseCondition(text, state) {
  if (text == null) return null;
  const m = /^\s*(\S+)\s*(>=|<=|!=|==|≠|≥|≤|>|<|=)\s*(.+?)\s*$/.exec(String(text));
  if (!m) return null;
  const value = m[3].trim();
  const op = OP_MAP[m[2]];
  if (conditionProblem(m[1], op, value, state)) return null;
  return { field: m[1], op: op, value: value };
}
// 单一比较分派（数值 / 字符串两种分支共用），避免两套六路比较级联重复。
function compareByOp(op, a, b) {
  if (op === '>') return a > b;
  if (op === '<') return a < b;
  if (op === '≥') return a >= b;
  if (op === '≤') return a <= b;
  if (op === '≠') return a !== b;
  return a === b; // 默认 '='
}
function matches(row, cond) {
  const raw = row[cond.field];
  const a = Number(raw), b = Number(cond.value);
  if (!isNaN(a) && !isNaN(b)) return compareByOp(cond.op, a, b);
  return compareByOp(cond.op, String(raw == null ? '' : raw), cond.value);
}

// ---- 公式字符串生成（票 #11：不实现求值器，只生成公式读回缓存）----
// 规格 #8：function kind 的产物是「公式字符串 + 命名参数」，实际计算交给
// 本地计算引擎（LibreOffice）重算后读回缓存值；引擎本身绝不做 JS 数值求值。
function columnLetter(n) { // 0-based 列序 → A/B/C…（支持多字母列）
  let s = '';
  let i = n + 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}
function toFormula(expr, state, rowIndex) {
  const s = String(expr == null ? '' : expr).replace(/\s+/g, '').replace(/×/g, '*').replace(/−/g, '-');
  const m = /^([^*+\-]+)([*+\-])([^*+\-]+)$/.exec(s);
  if (!m) return null;
  const rowNum = (rowIndex || 0) + 2; // 第 1 行是表头，数据从第 2 行起
  const cols = (state && state.columns) || [];
  const operand = function (tok) {
    if (/^\d+(\.\d+)?$/.test(tok)) return tok;                         // 数字字面量（分隔符已排除 '-'，负号不单独支持）
    if (!/^[\u4e00-\u9fffA-Za-z_][\u4e00-\u9fffA-Za-z0-9_]*$/.test(tok)) return null; // 非法 token（含比较运算符）
    const i = cols.indexOf(tok);
    if (i === -1) return null;                                          // 未知列名
    return columnLetter(i) + rowNum;
  };
  const l = operand(m[1]), r = operand(m[3]);
  if (!l || !r) return null;
  return '=' + l + m[2] + r;
}
// 从「…算成应发 / 写成 X / 得到 X」里抽输出列名（命名参数），抽不到返回 null。
function extractOutputColumn(sentence) {
  const m = /算成([^\s，,。；;]+)|写成([^\s，,。；;]+)|得到([^\s，,。；;]+)|输出([^\s，,。；;]+)/.exec(String(sentence || ''));
  if (!m) return null;
  return (m[1] || m[2] || m[3] || m[4] || '').trim() || null;
}
// 从「把 A 乘以 B 算成 X」里抽表达式本身（F2：不总是用默认表达式）。
// 关键词匹配假编译器的一部分；抽不到就退回 KINDS 默认表达式。
function extractExpression(sentence) {
  const m = /(?:把|将|用)?\s*([^\s，,。；;]+?)\s*(乘以|加上|减去|乘|加|减|\*|×|\+|-)\s*([^\s，,。；;算成写得得到输出结为果]+)/.exec(String(sentence || '').trim());
  if (!m) return null;
  const a = m[1].replace(/^(?:把|将|用)/, '').trim();
  const b = m[3].trim();
  if (!a || !b) return null;
  const opMap = { '乘以': '*', '乘': '*', '×': '*', '*': '*', '加上': '+', '加': '+', '+': '+', '减去': '-', '减': '-', '-': '-' };
  return a + ' ' + (opMap[m[2]] || '*') + ' ' + b;
}

function stepsFor(kind, p) {
  // 票 #12：四类动作都先声明作用范围，steps 如实反映当前 scope（单一计算，各类复用）。
  const isMatch = p.scope === 'match';
  const scopeStep = '作用范围：' + (isMatch
    ? '只作用于满足条件「' + p.条件 + '」的记录'
    : '作用于全部记录');
  if (kind === 'extract') {
    return [
      scopeStep,
      '打开「' + p.来源文件 + '」',
      '按「' + p.匹配列 + '」把两边的记录对齐',
      '取「' + p.取哪一列 + '」这一列',
      '写进当前表的「' + p.写到 + '」列'
    ];
  }
  if (kind === 'swap') return [
    scopeStep,
    '读出「' + p.字段A + '」整列', '读出「' + p.字段B + '」整列', '两段数据整体对调后写回'
  ];
  if (kind === 'conditional') return [
    scopeStep,
    '在范围内的记录上：对「' + p.目标列 + '」执行「' + p.动作 + '」',
    p.动作 === '增加' ? '写入值「' + p.值 + '」' : '清空原值'
  ];
  if (kind === 'function') return [
    scopeStep,
    '把这句话变成公式字符串 ' + p.表达式,
    '按每行的列位置换成 A1 引用（列来自表头、行来自记录序）',
    '公式写进新列「' + p.输出列 + '」，计算交给本地引擎重算后读回缓存值'
  ];
  return [];
}
function explanationFor(kind, p, sentence) {
  const head = sentence
    ? '把「' + shorten(sentence) + '」理解成「' + KINDS[kind].short + '」'
    : '快捷按钮「' + KINDS[kind].short + '」';
  return head + '；产物介质是' + KINDS[kind].medium + '。下面列出它会影响的单元格，确认前表格不会动。';
}

function buildDraft(kind, sentence, overrides) {
  const spec = KINDS[kind];
  if (!spec) return { kind: kind, schemaVersion: SCHEMA_VERSION, params: Object.assign({}, overrides || {}) };
  const params = Object.assign({}, spec.params, overrides || {});
  // function kind：从句子里抽输出列名与表达式（命名参数），没有显式覆盖才采用。
  if (kind === 'function' && sentence) {
    if (params['输出列'] === spec.params['输出列']) {
      const out = extractOutputColumn(sentence);
      if (out) params['输出列'] = out;
    }
    if (params['表达式'] === spec.params['表达式']) {
      const ex = extractExpression(sentence);
      if (ex) params['表达式'] = ex;
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: kind,
    name: sentence ? shorten(sentence) : spec.short + '（快捷）',
    sentence: sentence || '',
    params: params,
    medium: spec.medium,
    steps: stepsFor(kind, params),
    explanation: explanationFor(kind, params, sentence)
  };
}

function rebuildDraft(draft, params) {
  const merged = Object.assign({}, draft.params, params || {});
  return {
    schemaVersion: draft.schemaVersion,
    kind: draft.kind, name: draft.name, sentence: draft.sentence,
    params: merged, medium: KINDS[draft.kind].medium,
    steps: stepsFor(draft.kind, merged),
    explanation: explanationFor(draft.kind, merged, draft.sentence)
  };
}

// 假编译器：关键词匹配（真实版本要补 LLM，见研究笔记；此版刻意留成非 LLM）
function understand(sentence) {
  const s = String(sentence == null ? '' : sentence).trim();
  if (!s) return { error: '输入框是空的，先写一句话' };
  let kind = null;
  if (/提取|邮箱|外勤|对应文件|补.*列|拉过来/.test(s)) kind = 'extract';
  else if (/调换|交换|互换|对调/.test(s)) kind = 'swap';
  else if (/条件|大于|小于|超过|删掉|清空|标记|标注|加班/.test(s)) kind = 'conditional';
  else if (/计算|乘|函数|公式|算成|求和|[*+]/.test(s)) kind = 'function';
  if (!kind) return { error: '没匹配到任何一种功能（本版只是关键词匹配，不是真 LLM）' };
  return { kind: kind, sentence: s };
}

// 封闭 schema 校验：在预览前跑完，不落盘部分结果（票 #14）
// 规格 #8：校验是按参数类型系统机械派生的「封闭清单」——未知版本 / 未知字段 /
// 缺失必填 / 非法 scope·condition 一律拒绝并报具体原因；每条失败同时产出结构化
// issue（field + reason），供预览卡第②段渲染「就地可编辑修正控件」。
function validate(draft, state) {
  const errors = [];
  const issues = [];
  const fail = function (field, msg) {
    issues.push({ field: field, reason: msg });
    errors.push(msg);
  };
  if (!draft || typeof draft !== 'object') {
    fail('draft', '配方草稿不存在');
    return { ok: false, errors: errors, issues: issues };
  }
  if (draft.schemaVersion === undefined) fail('schemaVersion', '缺少 schemaVersion');
  else if (draft.schemaVersion !== SCHEMA_VERSION)
    fail('schemaVersion', 'schemaVersion 不匹配：' + draft.schemaVersion + ' != ' + SCHEMA_VERSION);
  if (!draft.kind || !KINDS[draft.kind]) fail('kind', '未知的功能种类：' + draft.kind);
  const p = draft.params || {};
  // 封闭参数白名单：不允许从一句话凭空造参数。公共字段 scope/条件已含在各类 spec.params 中。
  if (draft.kind && KINDS[draft.kind]) {
    const allowed = Object.keys(KINDS[draft.kind].params);
    Object.keys(p).forEach(function (key) {
      if (allowed.indexOf(key) === -1) fail(key, '未知字段：' + key);
    });
  }
  if (draft.kind === 'extract') {
    if (!p.来源文件) fail('来源文件', '缺少参数：来源文件');
    if (!p.匹配列) fail('匹配列', '缺少参数：匹配列');
    if (!p.取哪一列) fail('取哪一列', '缺少参数：取哪一列');
    if (!p.写到) fail('写到', '缺少参数：写到');
    if (state && state.sources && !state.sources[p.来源文件]) fail('来源文件', '来源文件不在声明式数据源里：' + p.来源文件);
  }
  if (draft.kind === 'swap') {
    // 票 #13：半换边界必须确定且可测——同列自换无意义、未知列不可换，封闭校验阶段就拒绝。
    // 显式决策（Standards #2）：「调换两段字段」的语义是两列互换，两列都必须已存在才有意义；
    // 换入尚不存在的列等于凭空造列、不是「调换」，故此处比 extract 的「写列可新建」更严是有意为之。
    const a = p.字段A, b = p.字段B;
    if (!a) fail('字段A', '缺少参数：字段A');
    if (!b) fail('字段B', '缺少参数：字段B');
    if (a && b && a === b) fail('字段B', '字段A 与 字段B 不能相同（同列自换没有确定意义）');
    if (state && state.columns) {
      if (a && state.columns.indexOf(a) === -1) fail('字段A', '字段A 不是当前列：' + a);
      if (b && state.columns.indexOf(b) === -1) fail('字段B', '字段B 不是当前列：' + b);
    }
  }
  if (draft.kind === 'function') {
    if (!p.表达式) fail('表达式', '缺少参数：表达式');
    else if (state && toFormula(p.表达式, state, 0) === null)
      fail('表达式', '表达式非法或引用了不存在的列：' + p.表达式);
    if (!p.输出列) fail('输出列', '缺少参数：输出列');
  }
  if (p.scope !== undefined && p.scope !== 'all' && p.scope !== 'match')
    fail('scope', 'scope 只能是 all 或 match');
  if (p.scope === 'match') {
    const cond = parseCondition(p.条件, state);
    if (!cond) {
      // 给出具体原因（用户故事 17：写错时单独报错并禁止确认，绝不静默当零命中）
      const reason = conditionProblemFromText(p.条件, state);
      fail('条件', 'scope=match 时条件非法：' + p.条件 + (reason ? '（' + reason + '）' : ''));
    }
  }
  return { ok: errors.length === 0, errors: errors, issues: issues };
}

function beforeOf(state, row, col) {
  if (state.columns.indexOf(col) === -1) return '（无此列）';
  const v = row[col];
  return (v === '' || v === undefined || v === null) ? '（空）' : String(v);
}

// 纯函数：算出「会改哪些格子」，不改任何东西
function preview(state, draft) {
  const totalRows = state.rows.length;
  const v = validate(draft, state);
  if (!v.ok) {
    return { cells: [], summary: '校验未通过，不能预览：' + v.errors.join('；'), affectedRows: 0, totalRows,
      invalid: true, errors: v.errors, issues: v.issues, disclosure: null, swapBanner: '' };
  }
  let disclosure = null;   // 票 #13：swap 半换披露（swappedRows/unchangedRows/mixedColumns/partial）
  let summaryExtra = '';   // 票 #13：swap 半换 banner，接进 summary
  const p = draft.params, cells = [];
  const pk = state.primaryKey || '姓名';
  // 票 #13：add 带 source（改动来源）。cells 只含「将改的格子」，未命中行不产格子，
  // 命中/未命中的区分由结构化 disclosure.swappedRows/unchangedRows 承载（不再设恒真的 hit 字段）。
  const add = function (row, col, before, after, invalid, source) {
    cells.push({ row: String(row[pk]), col, before, after, invalid: !!invalid, source: source || draft.kind });
  };
  const scopeCond = p.scope === 'match' ? parseCondition(p.条件, state) : null;
  const inScope = function (r) { return !scopeCond || matches(r, scopeCond); };

  if (draft.kind === 'extract') {
    const src = state.sources[p.来源文件].rows;
    state.rows.forEach(function (r) {
      if (!inScope(r)) return;
      const hit = src.filter(function (x) { return x[p.匹配列] === r[p.匹配列]; })[0];
      add(r, p.写到, beforeOf(state, r, p.写到), hit && hit[p.取哪一列] !== undefined ? String(hit[p.取哪一列]) : '', false, 'extract');
    });
  } else if (draft.kind === 'swap') {
    // 票 #13：半换——命中行两格对调、未命中行不动；逐格披露命中与来源，不掩盖部分改动。
    const swappedRows = [], unchangedRows = [];
    state.rows.forEach(function (r) {
      const name = String(r[pk]);
      if (!inScope(r)) { unchangedRows.push(name); return; }
      swappedRows.push(name);
      add(r, p.字段A, beforeOf(state, r, p.字段A), String(r[p.字段B] == null ? '' : r[p.字段B]), false, 'swap');
      add(r, p.字段B, beforeOf(state, r, p.字段B), String(r[p.字段A] == null ? '' : r[p.字段A]), false, 'swap');
    });
    // 两列是否混合两种来源：只有「部分行交换、部分行不变」时才混合；整列互换或零命中都不混合。
    const partial = swappedRows.length > 0 && unchangedRows.length > 0;
    const mixedColumns = partial ? [p.字段A, p.字段B] : [];
    disclosure = {
      kind: 'swap', partial: partial,
      swappedRows: swappedRows, unchangedRows: unchangedRows,
      swappedCount: swappedRows.length, unchangedCount: unchangedRows.length,
      mixedColumns: mixedColumns
    };
    if (partial) {
      const banner = '调换半换：' + swappedRows.length + ' 行交换、' + unchangedRows.length +
        ' 行不变；列「' + p.字段A + '」「' + p.字段B + '」将混合两种来源。';
      summaryExtra = banner;
    }
  } else if (draft.kind === 'conditional') {
    // 票 #12：条件增删也走公共 scope/inScope，不再用自己的私有条件过滤。
    // 动作（增加/删去）决定写什么，公共 scope/条件决定作用于哪些行。
    const isDelete = p.动作 === '删去' || p.动作 === '删除' || p.动作 === '清空';
    state.rows.forEach(function (r) {
      if (!inScope(r)) return;
      add(r, p.目标列, beforeOf(state, r, p.目标列), isDelete ? '' : String(p.值), false, 'conditional');
    });
  } else if (draft.kind === 'function') {
    state.rows.forEach(function (r, ri) {
      if (!inScope(r)) return;
      // 产物是公式字符串（不是 JS 算出的数值）；计算交给 LibreOffice 重算后读回缓存值。
      const formula = toFormula(p.表达式, state, ri);
      add(r, p.输出列, beforeOf(state, r, p.输出列), formula || '', !formula, 'function');
    });
  }
  const rowSet = {};
  cells.forEach(function (c) { rowSet[c.row] = true; });
  const affectedRows = Object.keys(rowSet).length;
  let summary = affectedRows === 0
    ? '影响 0 行 / 共 ' + totalRows + ' 行；没有任何单元格会变 —— 条件没命中任何记录。零命中允许确认。'
    : '影响 ' + affectedRows + ' 行 / 共 ' + totalRows + ' 行；共 ' + cells.length + ' 个单元格会变。确认前表格不会动。';
  if (summaryExtra) summary += summaryExtra;
  // 票 #12：预览如实反映当前作用范围，供预览卡渲染「作用范围」控件。
  // 票 #13：disclosure + swapBanner 随预览返回，供面板渲染「命中？列 + 混合来源 banner」。
  return { cells, summary, affectedRows, totalRows, invalid: false, errors: [], issues: [],
    scope: p.scope || 'all', condition: p.条件 || '',
    disclosure: disclosure, swapBanner: summaryExtra };
}

// 纯函数：把预览里的格子落到一份新表格上
function applyCells(state, cells) {
  const pk = state.primaryKey || '姓名';
  const columns = state.columns.slice();
  cells.forEach(function (c) { if (columns.indexOf(c.col) === -1) columns.push(c.col); });
  const rows = state.rows.map(function (r) { return Object.assign({}, r); });
  cells.forEach(function (c) {
    const target = rows.filter(function (r) { return String(r[pk]) === c.row; })[0];
    if (target) target[c.col] = c.after;
  });
  return { columns: columns, rows: rows };
}

function initial(data) {
  data = data || {};
  return {
    schemaVersion: SCHEMA_VERSION,
    primaryKey: data.primaryKey || '姓名',
    columns: (data.columns || []).slice(),
    rows: (data.rows || []).map(function (r) { return Object.assign({}, r); }),
    sources: data.sources || {},
    stage: 'IDLE', input: '', draft: null, preview: null, buttons: [],
    log: [], note: '先写一句话并「理解」，或按一个快捷按钮。', noteTone: 'info'
  };
}
function push(state, text, tone) {
  return [{ text: text, tone: tone || 'info' }].concat(state.log).slice(0, 8);
}
function set(state, patch) { return Object.assign({}, state, patch); }
function guard(state, msg) { return set(state, { note: msg, noteTone: 'warn', log: push(state, msg, 'warn') }); }

function reduce(state, action) {
  switch (action.type) {
    case 'RESET': return initial({ primaryKey: state.primaryKey, columns: state.columns, rows: state.rows, sources: state.sources });
    case 'SET_INPUT':
      return set(state, {
        input: action.text,
        note: '输入框里写下了「' + shorten(action.text) + '」；还没理解，表格没动。',
        noteTone: 'info', log: push(state, '输入：' + shorten(action.text))
      });
    case 'UNDERSTAND': {
      const text = action.text !== undefined ? action.text : state.input;
      const got = understand(text);
      if (got.error) return guard(state, got.error);
      return set(state, {
        input: got.sentence, draft: buildDraft(got.kind, got.sentence), preview: null,
        stage: 'UNDERSTOOD', note: '已理解成「' + KINDS[got.kind].short + '」。注意：本版是关键词匹配，不是真 LLM。',
        noteTone: 'info', log: push(state, '理解：' + shorten(got.sentence) + ' → ' + KINDS[got.kind].short)
      });
    }
    case 'QUICK': {
      const draft = buildDraft(action.kind, null, action.params);
      const pv = preview(state, draft);
      if (pv.invalid) return guard(state, pv.summary);
      return set(state, {
        draft: draft, preview: pv, stage: 'PREVIEWED',
        note: '快捷按钮跳过了「理解」，直接给出解释与影响预览：' + pv.summary, noteTone: 'info',
        log: push(state, '快捷按钮「' + KINDS[action.kind].short + '」→ ' + pv.summary)
      });
    }
    case 'PREVIEW': {
      if (!state.draft) return guard(state, '拦住了：还没有配方草稿。先写一句话并「理解」，或按一个快捷按钮。');
      const draft = rebuildDraft(state.draft, action.params);
      const pv = preview(state, draft);
      if (pv.invalid) return guard(state, pv.summary);
      return set(state, {
        draft: draft, preview: pv, stage: 'PREVIEWED',
        note: '解释与影响预览已就绪：' + pv.summary, noteTone: 'info',
        log: push(state, '影响预览：' + pv.summary)
      });
    }
    case 'CONFIRM': {
      if (state.stage !== 'PREVIEWED' || !state.preview || state.preview.invalid)
        return guard(state, '拦住了：没有合法的「解释与影响预览」就不能执行。顺序是 理解 → 预览 → 确认 → 执行。');
      // 票 #14（Standards review finding #1 加固）：执行前再跑一次封闭校验。
      // 正常状态机里 PREVIEW 已校验过，这一步是纵深防御——防止宿主持久化/重水合/外部改动
      // 让 state 在 PREVIEW 与 CONFIRM 之间漂移后，仍能执行一份已失效的配方。
      const reconfirm = validate(state.draft, state);
      if (!reconfirm.ok)
        return guard(state, '拦住了：配方在执行前重新校验未通过（' + reconfirm.errors.join('；') + '）。');
      const applied = applyCells(state, state.preview.cells);
      return set(state, {
        columns: applied.columns, rows: applied.rows, stage: 'EXECUTED',
        note: '用户已确认，执行完成：改了 ' + state.preview.cells.length + ' 个单元格。', noteTone: 'ok',
        log: push(state, '确认 → 执行：' + state.preview.cells.length + ' 个单元格变化', 'ok')
      });
    }
    case 'CANCEL':
      return set(state, { stage: 'IDLE', draft: null, preview: null,
        note: '已取消，表格没有变化。', noteTone: 'info', log: push(state, '取消：表格未改动') });
    case 'SOLIDIFY': {
      if (state.stage !== 'EXECUTED' || !state.draft)
        return guard(state, '拦住了：还没执行过，不能把草稿固化成按钮。');
      const name = String(action.name || '').trim() || state.draft.name;
      const b = {
        id: 'b' + (state.buttons.length + 1), name: name, kind: state.draft.kind,
        params: Object.assign({}, state.draft.params, action.params || {}),
        medium: state.draft.medium, steps: state.draft.steps.slice()
      };
      return set(state, { buttons: state.buttons.concat([b]), stage: 'SOLIDIFIED',
        note: '已命名参数化为按钮「' + name + '」。', noteTone: 'ok', log: push(state, '固化为按钮：' + name, 'ok') });
    }
    case 'RUN_BUTTON': {
      const b = action.id === '__last__' ? state.buttons[state.buttons.length - 1]
        : state.buttons.filter(function (x) { return x.id === action.id; })[0];
      if (!b) return guard(state, '按钮库里还没有这个按钮。');
      const overrides = action.params || {};
      // 规格 #8 用户故事 7/8：参数一处未改才真「一键」直接执行；
      // 改了 scope / 条件等任何参数，就强制退回「解释与影响预览 → 用户确认」，不许跳过。
      const changedParams = Object.keys(overrides).filter(function (k) {
        return String(b.params[k]) !== String(overrides[k]);
      });
      const draft = buildDraft(b.kind, null, Object.assign({}, b.params, overrides));
      const pv = preview(state, draft);
      if (pv.invalid) return guard(state, pv.summary);
      if (changedParams.length) {
        return set(state, {
          draft: draft, preview: pv, stage: 'PREVIEWED',
          note: '按钮「' + b.name + '」的参数被改过（' + changedParams.join('、') +
            '），不能直接一键执行：已退回解释与影响预览，请确认后再执行。', noteTone: 'warn',
          log: push(state, '按钮参数改动 → 退回预览确认：' + changedParams.join('、'), 'warn')
        });
      }
      const applied = applyCells(state, pv.cells);
      return set(state, { columns: applied.columns, rows: applied.rows, draft: draft, preview: pv, stage: 'EXECUTED',
        note: '一键运行「' + b.name + '」：参数未改，直接执行 ' + pv.cells.length + ' 格。', noteTone: 'ok',
        log: push(state, '一键运行「' + b.name + '」（参数未改）→ ' + pv.cells.length + ' 格变化', 'ok') });
    }
    case 'START_WALK': {
      const fresh = initial({ primaryKey: state.primaryKey, columns: state.columns, rows: state.rows, sources: state.sources });
      return set(fresh, { walk: { id: action.id, step: 0 },
        note: '导览已重置到初始状态。', log: push(fresh, '开始导览：' + action.id) });
    }
    case 'WALK_STEP': {
      const next = reduce(state, action.action);
      return set(next, { walk: { id: state.walk ? state.walk.id : action.walkId, step: (action.step || 0) + 1 } });
    }
    default: return state;
  }
}

module.exports = {
  SCHEMA_VERSION, KINDS, shorten, parseCondition, matches, columnLetter, toFormula, extractOutputColumn, extractExpression,
  initial, understand, buildDraft, validate, preview, applyCells, reduce
};
