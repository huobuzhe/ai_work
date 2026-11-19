'use strict';
/**
 * 表格工作台 client bundle（source）—— 经既有契约挂常驻右栏面板。
 * 契约来源（一手）：docs/research/client-plugin-panel-capability.md ③/④ 节，
 * 活证 dsh-univer-office lib/client.js:23322-23446。
 *
 * 本 tracer bullet（票 #9）的范围：证明面板能按契约注册并 keepMounted 常驻；
 * 不把编辑 grid 塞进面板（研究笔记未验证 #4），表格视图形态留待后续票。
 */
const TAB_ID = 'workbench.tab';
const TAB_KIND = 'workbench';

/**
 * 预览卡投影（纯函数，无 DOM / 无 React）：把引擎产出的 state.preview 映射成
 * 一个可序列化的「解释与影响预览卡」视图模型，供宿主渲染。
 * 这是面板在 Slice 1 唯一承担的职责（规格 #8：面板只承担「解释与影响预览」）。
 * 接受 "影响 N 行 / 共 M 行" 与逐格 before→after；确认前表格不会动由 stage 保证。
 */
function projectPreviewCard(state) {
  const pv = state && state.preview;
  // 票 #14：校验失败也要出卡（第②段列失败项 + 禁用确认），不能返回 null；
  // 只有「根本还没预览」（IDLE、无 preview）才不出卡。
  if (!pv) return null;
  const draft = state.draft || {};
  // 票 #12：作用域是公共字段，预览卡要把 scope / 条件 暴露给宿主，
  // 让「作用范围：全部 / 符合条件 + 条件输入」在预览卡内可改（不新增第 6 步）。
  // 统一的 firstDefined：引擎产出的 preview 已带这两字段，回退仅为兼容 pre-#12 的旧 preview 对象。
  const dp = draft.params || {};
  const firstDefined = function (a, b, fallback) {
    return a !== undefined ? a : (b !== undefined ? b : fallback);
  };
  const scope = firstDefined(pv.scope, dp.scope, 'all');
  const condition = firstDefined(pv.condition, dp['条件'], '');
  const issues = pv.issues || [];
  const ok = !pv.invalid;
  const cells = (pv.cells || []).map(function (c) {
    return { row: c.row, col: c.col, before: c.before, after: c.after,
      invalid: c.invalid, source: c.source, rowIndex: c.rowIndex };
  });

  // 预览卡 = 5 步管线第 ② 步的 view-model 骨架（票 #14），共六段：①②③④⑤ 是主五段，
  // ⑥ capability 是票 #21 增补的「该 adapter 能力位/禁用」辅助视图段（5+1，辅助段不改变
  // 「整卡就是 5 步管线第 ② 步、不是第 6 步」这一不变量）。
  // 诚实边界：五段的「数据」全部来自引擎实际计算、非死数据；但第②段的就地修正控件 UI、
  // 第④段的命中行截断/算不出来标红的可视化由宿主按本视图模型渲染，不在本纯 seam 包内
  //（与票 #12 Spec F3 的「本包只交 view model」一致）。第③段的带类型参数声明已由本包投影
  //（票 #20：scopeParams.paramSpec 原样带出 typed 声明，控件仍由宿主渲染，本包不内嵌 UI）。
  const sections = {
    // ① 自然语言解释：被理解成什么 kind / medium / 参数 / 步骤
    explain: {
      kind: draft.kind || '',
      label: draft.kind ? labelOfKind(draft.kind) : '',
      medium: draft.medium || '',
      params: Object.assign({}, dp),
      steps: (draft.steps || []).slice(),
      explanation: draft.explanation || ''
    },
    // ② 封闭校验清单结果：通过 ✓ / 失败项 + 就地可编辑修正控件，失败即禁用确认。
    // issues 直接来自引擎 validate（不另起第二套校验），宿主据此渲染每项修正控件。
    validation: {
      ok: ok,
      // 每条失败项带 currentValue（优先顶层 draft 字段、其次 params），宿主据此渲染
      // 「就地可编辑修正控件」时可直接预填出错现值（规格 line 112）。这里的 UI 由宿主渲染、本包只交视图模型。
      issues: issues.map(function (it) {
        const cv = draft[it.field] !== undefined ? draft[it.field]
          : (dp[it.field] !== undefined ? dp[it.field] : null);
        return { field: it.field, reason: it.reason, currentValue: cv };
      }),
      errors: (pv.errors || []).slice()
    },
    // ③ 作用范围与命名参数：scope 全部/符合条件 + 条件 + 带类型参数，可改并联动重算
    // 票 #20（T3 Contract）：参数展示改读引擎产出的 typed 声明（pv.paramSpec：key/类型/必填/默认值/约束），
    // 宿主据此渲染每参数控件；本包只交 view-model、不内嵌 UI 控件（仍是纯函数）。
    scopeParams: {
      scope: scope,
      condition: condition,
      scopeLabel: scope === 'match' ? '符合条件' : '全部',
      params: Object.assign({}, dp),
      paramSpec: (pv.paramSpec || []).map(function (d) {
        return { key: d.key, 类型: d.类型, 必填: d.必填, 默认值: d.默认值, 约束: d.约束 };
      })
    },
    // ④ 影响预览：将改格子 + 影响 N 行 / 共 M 行 + swap 披露 + 算不出来标红
    impact: {
      cells: cells,
      summary: pv.summary,
      affectedRows: pv.affectedRows,
      totalRows: pv.totalRows,
      disclosure: pv.disclosure || null,
      swapBanner: pv.swapBanner || '',
      // 表格化预览所需的整表信息（修改前列 + 修改后整表）；由 toView 注入到 preview 上。
      columns: Array.isArray(pv.columns) ? pv.columns.slice() : [],
      rows: Array.isArray(pv.rows) ? pv.rows.slice() : [],
      afterRows: Array.isArray(pv.afterRows) ? pv.afterRows.slice() : null
    },
    // ⑤ 确认 / 取消：没有合法预览（校验未过或非 PREVIEWED）时禁用确认
    confirm: {
      canConfirm: ok && state.stage === 'PREVIEWED',
      canCancel: true
    },
    // ⑥ 能力位（票 #21 / S1）：当前平台 adapter 与公式能力位，false 的动作被禁用并给出原因。
    //    纯视图模型：disabled / capabilityBlockers 直接来自引擎 preview，宿主据此渲染禁用态与提示；
    //    本包不内嵌 I/O、不静默降级（用户故事：能力位 false 的动作禁用 + 明确提示）。
    capability: {
      adapter: pv.adapter || null,
      adapterLabel: pv.adapterLabel || '',
      formulaCapabilities: pv.formulaCapabilities || null,
      disabled: !!pv.disabled,
      blockers: (pv.capabilityBlockers || []).map(function (b) {
        return { cap: b.cap, need: b.need, reason: b.reason };
      })
    }
  };

  // 扁平字段（#9/#12/#13 已消费，保留兼容，值全部取自同一份 sections 源）
  return {
    stage: state.stage,
    explanation: sections.explain.explanation,
    summary: sections.impact.summary,
    affectedRows: sections.impact.affectedRows,
    totalRows: sections.impact.totalRows,
    scope: sections.scopeParams.scope,
    condition: sections.scopeParams.condition,
    scopeLabel: sections.scopeParams.scopeLabel,
    disclosure: sections.impact.disclosure,
    swapBanner: sections.impact.swapBanner,
    cells: sections.impact.cells,
    invalid: !ok,
    errors: sections.validation.errors,
    sections: sections
  };
}

// kind → 中文短名（预览卡第①段展示用）。为保持 client 不依赖引擎而手工镜像 KINDS.short；
// 新增/改名 kind 时须同步此处（已如实记录为 low 漂移风险，非第二套校验逻辑）。
function labelOfKind(kind) {
  const map = { extract: '提取字段', swap: '调换两段字段', conditional: '带条件增删', function: '自定义函数计算', dedupe: '按主键去重' };
  return map[kind] || kind;
}

/**
 * 按钮库投影（纯函数，无 DOM / 无 React）——票 #15，票 #16 扩展为双来源。
 * 把两类来源统一映射成可序列化的按钮库视图模型，供面板「按钮区」一处呈现、来源可区分：
 *   - registryButtons：仓内声明式注册表加载的预置按钮（source='preset'，git 作线上来源）
 *   - buttons：使用者在面板固化的按钮（source='user'，Host 权威源）
 * 预置在前、固化在后，保持各自 id 空间（p* / b*）不冲突；来源通过 source 字段区分。
 * 按钮是声明式配方 + 运行态标记：lastAffectedRows / emptyRun 如实带出（用户故事 18/32），
 * 不含任何可执行代码；不做云端原生按钮投影（票 #15 AC5，后续 effort）。
 */
function projectButtonLibrary(state) {
  const preset = (state && state.registryButtons || []).map(function (b) { return projectOne(b); });
  const user = (state && state.buttons || []).map(function (b) { return projectOne(b); });
  const buttons = preset.concat(user);
  return { total: buttons.length, buttons: buttons };
}
function projectOne(b) {
  return {
    id: b.id,
    name: b.name,
    kind: b.kind,
    label: labelOfKind(b.kind),
    // 保留来源原值：preset（仓内预置）/ user（用户固化）/ default（自动派生的默认配方）。
    // 早期只区分 preset/user，把 source='default' 的默认配方误标成 user，与引擎真值不符（#45 source 标为 default）。
    source: b.source === 'preset' ? 'preset' : (b.source === 'default' ? 'default' : 'user'),
    schemaVersion: b.schemaVersion,
    params: Object.assign({}, b.params || {}),
    medium: b.medium,
    steps: (b.steps || []).slice(),
    lastAffectedRows: b.lastAffectedRows === undefined ? 0 : b.lastAffectedRows,
    emptyRun: !!b.emptyRun
  };
}

/**
 * cordis 客户端插件体：DSH Web 模块系统把 bundle 的 module.exports 当作 cordis 插件，
 * 由 unwrapExports → registry.plugin 解析；必须导出 `apply`（函数）——否则宿主
 * 抛 `invalid plugin, expect function or object with an "apply" method, received object`。
 * 之前的 tracer bullet 只导出了 registerWorkbenchPanel 等工具函数、没有 apply，
 * 导致「装进 profile 后打开 xlsx 即崩溃（无 tab）」。见票：工作台挂载排障。
 */
const inject = ['slots'];

/**
 * 把工作台视图模型渲染成真实 React 元素（slot body 契约要求返回 React 元素，不能返回普通对象）。
 * React 由宿主模块系统的 require 提供（与 univer / ui-approval 等同：require('react') +
 * require('react/jsx-runtime')）。用 jsx-runtime 的 jsx() 直接构造，无需 JSX 编译。
 * 诚实边界：本 tracer bullet 只渲染「可读摘要」，完整交互 UI 留待后续票；
 * 但必须是合法 React 树、永不抛错（任何异常回退到一段说明文本）。
 */
function renderWorkbenchPanel(hostState) {
  // 关键：react/jsx-runtime 的 jsx(type, props, key) 第三个参数是 **key**，不是 children！
  // children 必须放到 props.children；多个子节点要用 jsxs()（而不是 jsx）。
  // 之前把 children 数组当作第三参（key）传入，导致每个 div 都没有子节点 → 面板整块空白。
  let jsx, jsxs;
  let reactDiag = 'na';
  try {
    const rt = require('react/jsx-runtime');
    jsx = rt.jsx; jsxs = rt.jsxs;
    reactDiag = 'jsx=' + (typeof jsx) + '/jsxs=' + (typeof jsxs);
  } catch (e) { jsx = jsxs = null; reactDiag = 'require-threw:' + ((e && e.message) || e); }
  if (typeof jsx !== 'function') {
    // 极端兜底：拿不到 jsx 时返回一个字符串（React 可渲染文本节点），绝不返回普通对象。
    return '表格工作台(jsx 不可用:' + reactDiag + ')';
  }
  let preview = null;
  let library = null;
  try { preview = projectPreviewCard(hostState); } catch (_) { preview = null; }
  try {
    // 票 #43：若视图模型已带预投影好的 buttonLibrary（Host/上层已算好），直接用它；
    // 否则从 state 现投影（兼容旧调用）。
    library = (hostState && hostState.buttonLibrary) || projectButtonLibrary(hostState);
  } catch (_) { library = null; }

  const children = [];
  // 标题已在浮窗渐变标题栏呈现，这里不再重复一行标题。保留一个无障碍隐藏标题占位，
  // 保证纯投影/护栏测试仍能找到「表格工作台」字样。
  children.push(jsx('div', { style: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }, children: '表格工作台' }, 'hdg'));
  // 票 #47：面板内「新建配方」交互区——输入一句话 → 理解 → 预览 → 确认执行 → 固化为按钮。
  // 仅在宿主提供 onAction 时渲染（旧调用/纯投影模式保持原样，向后兼容）。
  const onAction = hostState && typeof hostState.onAction === 'function' ? hostState.onAction : null;
  if (onAction) {
    const onInput = hostState && typeof hostState.onInput === 'function' ? hostState.onInput : function () {};
    const stage = (hostState && hostState.stage) || 'IDLE';
    const inputVal = (hostState && typeof hostState.inputText === 'string') ? hostState.inputText : '';
    const canPreview = stage === 'UNDERSTOOD' || stage === 'PREVIEWED';
    const canConfirm = stage === 'PREVIEWED' && preview && !preview.invalid;
    const canSolidify = stage === 'EXECUTED';
    const busy = !!(hostState && hostState.actionBusy);
    const mkAction = function (type, label, enabled, extraStyle) {
      // 主操作按钮（理解/预览/确认执行/固化为按钮）：统一现代描边按钮；确认执行为主色实心。
      const isPrimary = type === 'confirm';
      const baseStyle = isPrimary ? {
        padding: '7px 14px', borderRadius: 8, border: '1px solid #2563eb',
        background: enabled ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : '#eef2f8',
        color: enabled ? '#fff' : '#9aa4b2', fontWeight: 600, cursor: enabled ? 'pointer' : 'not-allowed',
        fontSize: 13, boxShadow: enabled ? '0 2px 8px rgba(37,99,235,0.3)' : 'none', transition: 'all .15s'
      } : {
        padding: '7px 14px', borderRadius: 8, border: '1px solid #d0d7de',
        background: enabled ? '#fff' : '#f6f8fa', color: enabled ? '#24292f' : '#9aa4b2',
        fontWeight: 500, cursor: enabled ? 'pointer' : 'not-allowed', fontSize: 13, transition: 'all .15s'
      };
      return jsx('button', {
        type: 'button',
        'data-wb-action': type,
        disabled: (!enabled || busy) ? true : undefined,
        onClick: function (ev) {
          try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch (_) {}
          try { onAction(type, {}); } catch (_) {}
        },
        style: Object.assign(baseStyle, extraStyle || {}),
        children: label
      }, 'act' + type);
    };
    const inputEl = jsx('input', {
      'data-wb-input': '1',
      type: 'text',
      value: inputVal,
      placeholder: '用一句话描述要做什么（如：调换姓名和工时两列）',
      onChange: function (ev) { try { onInput(ev && ev.target ? ev.target.value : ''); } catch (_) {} },
      onKeyDown: function (ev) {
        try { if (ev && ev.key === 'Enter') { ev.preventDefault(); onAction('understand', {}); } } catch (_) {}
      },
      style: { width: '100%', boxSizing: 'border-box', marginBottom: 8, padding: '8px 10px', border: '1px solid #d0d7de', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', color: '#1f2328' }
    }, 'wbinput');
    const btnRow = jsxs('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }, children: [
      mkAction('understand', '理解', true),
      mkAction('preview', '预览', canPreview),
      mkAction('confirm', '确认执行', canConfirm),
      mkAction('solidify', '固化为按钮', canSolidify)
    ] }, 'btnrow');
    // 五个动作一键化（用户 m06260「把这5个按钮实现」）：每个动作一个快捷按钮，
    // 点击发 QUICK（跳过理解、直接出「解释+影响预览」），用户再点「确认执行」即写盘。
    // QUICK 的列名参数由 Host panel-session.normalizeDraft 映射到真实列，故此处给通用缺省即可。
    var QUICK_ACTIONS = [
      { kind: 'extract', label: '提取字段' },
      { kind: 'swap', label: '调换两列' },
      { kind: 'conditional', label: '条件改动' },
      { kind: 'function', label: '公式计算' },
      { kind: 'dedupe', label: '按主键去重' }
    ];
    var quickBtns = QUICK_ACTIONS.map(function (qa) {
      return jsx('button', {
        type: 'button',
        'data-wb-quick': qa.kind,
        title: '一键发起「' + qa.label + '」→ 直接给出解释与影响预览',
        disabled: busy ? true : undefined,
        onClick: function (ev) {
          try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch (_) {}
          try { onAction('quick', { kind: qa.kind }); } catch (_) {}
        },
        style: {
          padding: '5px 11px', borderRadius: 999, border: '1px solid #d6e2f5',
          background: '#f0f6ff', color: '#2563eb', fontSize: 12, fontWeight: 500,
          cursor: busy ? 'not-allowed' : 'pointer', transition: 'all .15s'
        },
        onMouseEnter: function (ev) { try { if (ev && ev.currentTarget && !busy) { ev.currentTarget.style.background = '#e0edff'; ev.currentTarget.style.borderColor = '#9dc0f5'; } } catch (_) {} },
        onMouseLeave: function (ev) { try { if (ev && ev.currentTarget) { ev.currentTarget.style.background = '#f0f6ff'; ev.currentTarget.style.borderColor = '#d6e2f5'; } } catch (_) {} },
        children: qa.label
      }, 'quick' + qa.kind);
    });
    var quickRow = jsxs('div', { 'data-wb-quickbar': '1', style: { marginBottom: 10 }, children: [
      jsx('div', { style: { fontSize: 11, color: '#6b7280', marginBottom: 6, letterSpacing: 0.2 }, children: '一键动作（直接出预览，再确认执行即写盘）' }, 'quicklbl'),
      jsxs('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: quickBtns }, 'quickrow')
    ] }, 'quickbar');
    children.push(quickRow);
    children.push(jsxs('div', { 'data-wb-newrecipe': '1', style: { marginBottom: 10 }, children: [inputEl, btnRow] }, 'newrecipe'));
    // 状态提示（note）：把引擎/宿主给的提示如实显示。
    if (hostState && typeof hostState.note === 'string' && hostState.note) {
      children.push(jsx('div', {
        'data-wb-note': '1',
        style: { fontSize: 12, marginBottom: 8, color: hostState.noteTone === 'warn' ? '#b06000' : (hostState.noteTone === 'ok' ? '#0a7' : '#555') },
        children: hostState.note
      }, 'wbn'));
    }
  }
  // 票 #44 AC3：操作失败/校验不通过时如实显示失败项（不崩）。
  // 票 #51：说明性/成功类 note（noteTone=ok/info）已在 data-wb-note 正常显示，**不再**重复塞进
  // 红色错误框；只有 warning/error 类 note 或 preview 非法时才进错误框，避免同一条提示出现两次。
  const noteTone = (hostState && hostState.noteTone) || 'info';
  const failNote = (hostState && typeof hostState.note === 'string' && hostState.note
    && (noteTone === 'warn' || noteTone === 'error')) ? hostState.note : '';
  const invalidErrors = (preview && preview.invalid && Array.isArray(preview.errors)) ? preview.errors : null;
  if ((preview && preview.invalid) || failNote) {
    const errLines = [];
    if (failNote) errLines.push(failNote);
    if (invalidErrors) {
      for (let i = 0; i < invalidErrors.length; i++) {
        const e = invalidErrors[i];
        errLines.push(typeof e === 'string' ? e : (e && (e.message || e.msg || JSON.stringify(e))) || String(e));
      }
    }
    if (errLines.length === 0) errLines.push('操作失败');
    children.push(jsxs('div', {
      'data-workbench-error': '1',
      style: { color: '#b00020', marginBottom: 8 },
      children: errLines.map(function (t, i) { return jsx('div', { children: t }, 'err' + i); })
    }, 'errbox'));
  }
  // 用户 m06880：一打开（stage=IDLE，还没点任何动作）时，只显示原始表格，不显示默认草稿的「即将改」预览。
  // 一旦 UNDERSTOOD/PREVIEWED/EXECUTED 才进入预览分支。default 草稿在 IDLE 会自带 preview，需按 stage 拦掉。
  const stageNow = (hostState && hostState.stage) || 'IDLE';
  if (preview && stageNow !== 'IDLE') {
    const lines = [];
    if (preview.explanation) lines.push('解释：' + preview.explanation);
    if (typeof preview.affectedRows === 'number') lines.push('影响 ' + preview.affectedRows + ' 行 / 共 ' + (preview.totalRows == null ? '?' : preview.totalRows) + ' 行');
    lines.push('作用范围：' + (preview.scopeLabel || preview.scope || '全部'));
    const lineEls = lines.map(function (t, i) { return jsx('div', { children: t }, 'l' + i); });
    // 票 #46：始终标明「当前预览的是哪份配方」，点击按钮后也不消失。
    // 优先用 hostState.recipeLabel（点击/派生时由上层显式给出）；否则在默认配方场景回退为默认标签。
    const recipeLabel = (hostState && typeof hostState.recipeLabel === 'string' && hostState.recipeLabel)
      ? hostState.recipeLabel
      : ((hostState && hostState.isDefaultDraft) ? '默认配方（调换后两列）· 可更换' : '');
    if (recipeLabel) {
      lineEls.unshift(jsx('div', { 'data-workbench-recipe': '1', style: { opacity: 0.75, fontSize: 12, marginBottom: 4 }, children: '当前配方：' + recipeLabel }, 'recipe'));
    }
    // 票 #46：点击反馈行——点了按钮后一定可见地反映「已按某配方重算」，
    // 即使重算结果与当前完全相同，也不再像「点按钮没反应」。
    if (hostState && hostState.clickedAt) {
      var cName = hostState.clickedName || '';
      lineEls.unshift(jsx('div', { 'data-workbench-clicked': '1', style: { color: '#0a7', fontSize: 12, marginBottom: 4 }, children: '✓ 已按「' + (cName || '当前配方') + '」重算预览' }, 'clicked'));
    }
    // 表格化影响预览（用户 m06723：不要「第阿岚行 时薪：80 → x」这种逐格文字，要真正表格）。
    // 用整表信息（修改前列 + 修改后行）渲染网格；受影响的格子高亮。数据来自 sections.impact。
    const impact = (preview && preview.sections && preview.sections.impact) ? preview.sections.impact : {};
    const cells = Array.isArray(impact.cells) ? impact.cells : ((preview && Array.isArray(preview.cells)) ? preview.cells : []);
    const pvCols = Array.isArray(impact.columns) ? impact.columns : [];
    const pvRows = Array.isArray(impact.rows) ? impact.rows : [];
    const pvAfter = Array.isArray(impact.afterRows) ? impact.afterRows : null;
    // 用户 m06880：执行后（EXECUTED）只显示改过后的最终表格，去掉「a → b」箭头。
    const executed = (hostState && hostState.stage === 'EXECUTED');
    if (pvCols.length > 0 && pvRows.length > 0) {
      // 受影响格索引：rowIndex + '|' + col → cell
      const cellMap = {};
      cells.forEach(function (c) { if (c.rowIndex != null && c.col != null) cellMap[c.rowIndex + '|' + c.col] = c; });
      const CAP = 50;
      const shownRows = pvRows.slice(0, CAP);
      const thStyle = { border: '1px solid #d9d9d9', padding: '5px 9px', background: '#f5f6f7', fontSize: 12, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', color: '#303133' };
      const tdStyle = { border: '1px solid #e6e6e6', padding: '5px 9px', fontSize: 12, whiteSpace: 'nowrap', color: '#303133' };
      const tdNum = Object.assign({}, tdStyle, { textAlign: 'right', fontVariantNumeric: 'tabular-nums' });
      const tdChanged = Object.assign({}, tdStyle, { background: '#fff6e0', color: '#8a5a00', fontWeight: 'bold' });
      // 数值单元格右对齐，让表格看起来像规整的数据表（数字列不乱）。
      const colIsNumeric = pvCols.map(function (col) {
        return pvRows.some(function (r) { return r && typeof r[col] === 'number'; }) ||
          pvRows.some(function (r) { return r && r[col] != null && r[col] !== '' && isFinite(Number(r[col])) && String(r[col]).trim() !== '' && !isNaN(Number(r[col])) && /^[0-9.\-]+$/.test(String(r[col]).trim()); });
      });
      const cellTd = function (col, ci) { return colIsNumeric[ci] ? tdNum : tdStyle; };
      const head = jsxs('tr', { children: pvCols.map(function (col, ci) { return jsx('th', { style: thStyle, children: String(col) }, 'h' + ci); }) }, 'hrow');
      const bodyRows = shownRows.map(function (r, ri) {
        const tds = pvCols.map(function (col, ci) {
          // 用户 m06880：执行后显示「改过后的最终表格」，受影响格**保留黄色高亮**（标明改了哪些），
          // 但去掉「before → after」箭头，只显示落盘后的最终值。
          if (executed) {
            const cur = (r && r[col] != null) ? r[col] : '';
            const wasChanged = !!cellMap[ri + '|' + col];
            const styleExec = wasChanged ? tdChanged : cellTd(col, ci);
            const props = wasChanged ? { 'data-wb-changed': String(ri) + '|' + col, style: styleExec, children: (cur != null) ? String(cur) : '' } : { style: styleExec, children: (cur != null) ? String(cur) : '' };
            return jsx('td', props, 'c' + ri + '_' + ci);
          }
          const ch = cellMap[ri + '|' + col];
          if (ch) {
            const afterVal = (pvAfter && pvAfter[ri] && pvAfter[ri][col] !== undefined) ? pvAfter[ri][col] : ch.after;
            // 新增列（如 function 的「应发」）原表没有：before 是「（无此列）」之类的占位，
            // 不必画「（无此列） → 值」这种长文本，直接显示新值即可（用户 m07024：表格别撑变形）。
            const beforeStr = String(ch.before == null ? '' : ch.before);
            const isNewCol = beforeStr === '（无此列）' || beforeStr === '(无此列)' || beforeStr === '';
            const label = isNewCol ? String(afterVal) : (beforeStr + ' → ' + String(afterVal));
            return jsx('td', {
              'data-wb-changed': String(ri) + '|' + col,
              style: tdChanged,
              children: label
            }, 'c' + ri + '_' + ci);
          }
          const plain = (r && r[col] != null) ? r[col] : '';
          return jsx('td', { style: cellTd(col, ci), children: (plain != null) ? String(plain) : '' }, 'c' + ri + '_' + ci);
        });
        return jsx('tr', { children: tds }, 'r' + ri);
      });
      const tableEl = jsxs('table', {
        'data-workbench-table': '1',
        style: { borderCollapse: 'collapse', fontSize: 12, width: 'auto', minWidth: '100%' },
        children: [jsx('thead', { children: head }, 'thead'), jsx('tbody', { children: bodyRows }, 'tbody')]
      }, 'impacttable');
      children.push(jsxs('div', {
        'data-workbench-cells': String(cells.length),
        style: { marginBottom: 8, maxHeight: 220, overflow: 'auto', border: '1px solid #eee' },
        children: [tableEl]
      }, 'cellbox'));
    } else if (cells.length > 0) {
      // 回退：没有整表信息时，退回逐格文字（旧行为）。
      const CAP = 20;
      const shown = cells.slice(0, CAP);
      const cellEls = shown.map(function (c, i) {
        const arrow = String(c.before) + ' → ' + String(c.after);
        return jsx('div', {
          'data-workbench-cell': (c.row == null ? '' : c.row) + '/' + (c.col == null ? '' : c.col),
          style: { fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' },
          children: (c.row == null ? '' : ('第' + c.row + '行 ')) + (c.col == null ? '' : (c.col + '：')) + arrow
        }, 'cell' + i);
      });
      if (cells.length > CAP) {
        cellEls.push(jsx('div', { style: { opacity: 0.7, fontSize: 12 }, children: '还有 ' + (cells.length - CAP) + ' 个单元格会变……' }, 'cellmore'));
      }
      children.push(jsxs('div', {
        'data-workbench-cells': String(cells.length),
        style: { marginBottom: 8, maxHeight: 180, overflowY: 'auto' },
        children: cellEls
      }, 'cellbox'));
    }
    children.push(jsxs('div', { 'data-workbench-preview': '1', style: { marginBottom: 8 }, children: lineEls }, 'pv'));
  } else {
    // 用户 m06880：还没动作/IDLE 时，直接显示原始表格（不再只显示「暂无预览」）。
    const tbl = (hostState && hostState.table) ? hostState.table : null;
    let rendered = false;
    if (tbl && Array.isArray(tbl.columns) && tbl.columns.length > 0 && Array.isArray(tbl.rows) && tbl.rows.length > 0) {
      const thStyle = { border: '1px solid #d9d9d9', padding: '5px 9px', background: '#f5f6f7', fontSize: 12, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', color: '#303133' };
      const tdStyle = { border: '1px solid #e6e6e6', padding: '5px 9px', fontSize: 12, whiteSpace: 'nowrap', color: '#303133' };
      const tdNum = Object.assign({}, tdStyle, { textAlign: 'right', fontVariantNumeric: 'tabular-nums' });
      const origColNum = tbl.columns.map(function (col) {
        return tbl.rows.some(function (r) { return r && r[col] != null && r[col] !== '' && /^[0-9.\-]+$/.test(String(r[col]).trim()); });
      });
      const head = jsxs('tr', { children: tbl.columns.map(function (col, ci) { return jsx('th', { style: thStyle, children: String(col) }, 'h' + ci); }) }, 'hrow');
      const bodyRows = tbl.rows.slice(0, 50).map(function (r, ri) {
        const tds = tbl.columns.map(function (col, ci) {
          return jsx('td', { style: origColNum[ci] ? tdNum : tdStyle, children: (r && r[col] != null) ? String(r[col]) : '' }, 'c' + ri + '_' + ci);
        });
        return jsx('tr', { children: tds }, 'r' + ri);
      });
      children.push(jsxs('div', { 'data-workbench-orig-table': '1', style: { marginBottom: 8, maxHeight: 220, overflow: 'auto', border: '1px solid #eee' }, children: [
        jsxs('div', { style: { fontSize: 11, opacity: 0.65, margin: '2px 4px' }, children: '原始表格（尚未操作）' }, 'origlbl'),
        jsxs('table', { 'data-workbench-table': 'orig', style: { borderCollapse: 'collapse', fontSize: 12, width: 'auto', minWidth: '100%' }, children: [
          jsx('thead', { children: head }, 'thead'), jsx('tbody', { children: bodyRows }, 'tbody')
        ] }, 'origtable')
      ] }, 'origbox'));
      rendered = true;
    }
    children.push(jsx('div', { 'data-workbench-preview': 'empty', style: { opacity: 0.7 }, children: rendered ? '' : '暂无预览。' }, 'pvempty'));
  }
  if (library && library.total > 0) {
    // 票 #43：按钮库渲染成真正可点击的 <button>，每个按钮绑定 onClick。
    // 点击只触发事件通道 hostState.onButtonClick(按钮id)（不改引擎状态、不执行）；
    // 没有回调时安全退化为空操作，绝不抛错。
    const onButtonClick = hostState && typeof hostState.onButtonClick === 'function'
      ? hostState.onButtonClick : null;
    // 票 #48：按钮管理——每个按钮旁挂「▶运行 / 重命名 / 删除」控件，经 onButtonAction 汇报。
    // 仅在宿主提供 onButtonAction 时渲染（旧调用保持纯点击语义，向后兼容）。
    const onButtonAction = hostState && typeof hostState.onButtonAction === 'function'
      ? hostState.onButtonAction : null;
    const btnStyle = { padding: '5px 11px', borderRadius: 8, border: '1px solid #d0d7de', background: '#fff', color: '#24292f', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all .15s' };
    const mgmtStyle = { padding: '3px 8px', borderRadius: 6, border: '1px solid #d8dee4', background: '#f6f8fa', color: '#4b5563', fontSize: 11, cursor: 'pointer' };
    const btns = library.buttons.map(function (b, i) {
      const clickEl = jsx('button', {
        type: 'button',
        'data-workbench-button': b.id,
        'data-button-kind': b.kind || '',
        onClick: function (ev) {
          try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch (_) {}
          try { if (onButtonClick) onButtonClick(b.id); } catch (_) {}
        },
        style: btnStyle,
        onMouseEnter: function (ev) { try { if (ev && ev.currentTarget) { ev.currentTarget.style.borderColor = '#9dc0f5'; ev.currentTarget.style.background = '#f0f6ff'; } } catch (_) {} },
        onMouseLeave: function (ev) { try { if (ev && ev.currentTarget) { ev.currentTarget.style.borderColor = '#d0d7de'; ev.currentTarget.style.background = '#fff'; } } catch (_) {} },
        children: b.name
      }, 'btn' + i);
      if (!onButtonAction) return clickEl;
      const mgmt = jsx('span', {
        'data-workbench-btn-mgmt': b.id,
        style: { display: 'inline-flex', gap: 3, marginLeft: 4 },
        children: [
          jsx('button', {
            type: 'button', 'data-wb-btn-run': b.id, title: '一键运行（参数未改直接执行并写入磁盘）',
            onClick: function (ev) { try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (_) {} try { onButtonAction('run', b.id); } catch (_) {} },
            style: mgmtStyle,
            children: '▶运行'
          }, 'run' + i),
          jsx('button', {
            type: 'button', 'data-wb-btn-rename': b.id, title: '重命名',
            onClick: function (ev) {
              try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (_) {}
              try { var nn = (typeof window !== 'undefined' && window.prompt) ? window.prompt('新的按钮名', b.name) : null; if (nn != null && String(nn).trim()) onButtonAction('rename', b.id, { name: String(nn).trim() }); } catch (_) {}
            },
            style: mgmtStyle,
            children: '重命名'
          }, 'ren' + i),
          jsx('button', {
            type: 'button', 'data-wb-btn-params': b.id, title: '改参数（基于当前表重新给参数，改完强制退回预览确认）',
            onClick: function (ev) {
              try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (_) {}
              // 简单交互：逐项询问当前 kind 的参数（列名/枚举/文本）。空输入=跳过该参数。
              try {
                if (typeof window === 'undefined' || !window.prompt) return;
                var next = {};
                Object.keys(b.params || {}).forEach(function (k) {
                  if (k === 'scope' || k === '条件') return; // scope/条件 走单独输入
                  var cur = b.params[k];
                  var v = window.prompt('参数「' + k + '」', cur == null ? '' : String(cur));
                  if (v != null && String(v) !== String(cur)) next[k] = String(v);
                });
                var scope = window.prompt('作用范围（all=全部 / match=按条件）', b.params.scope || 'all');
                if (scope != null && scope !== (b.params.scope || 'all')) next.scope = String(scope).trim();
                if (String(next.scope || b.params.scope) === 'match') {
                  var cond = window.prompt('匹配条件（单比较，如 工时 > 100）', b.params.条件 || '');
                  if (cond != null) next['条件'] = String(cond).trim();
                }
                if (Object.keys(next).length) onButtonAction('params', b.id, { params: next });
              } catch (_) {}
            },
            style: mgmtStyle,
            children: '改参数'
          }, 'prm' + i),
          jsx('button', {
            type: 'button', 'data-wb-btn-delete': b.id, title: '删除',
            onClick: function (ev) { try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (_) {} try { onButtonAction('delete', b.id); } catch (_) {} },
            style: Object.assign({}, mgmtStyle, { color: '#b42318', borderColor: '#f0c9c5', background: '#fff5f4' }),
            children: '删除'
          }, 'del' + i)
        ]
      }, 'mgmt' + i);
      return jsx('span', { 'data-workbench-button-row': b.id, style: { display: 'inline-flex', alignItems: 'center', marginRight: 4, marginBottom: 6 }, children: [clickEl, mgmt] }, 'row' + i);
    });
    children.push(jsxs('div', { 'data-workbench-library': String(library.total), style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: btns }, 'lib'));
  }
  // 票 #52：从模板新建表格——列出仓内模板，每个一个「新建」按钮。
  // 仅在宿主提供 onCreate 且给了 templates 时渲染（向后兼容：旧调用不渲染）。
  const onCreate = hostState && typeof hostState.onCreate === 'function' ? hostState.onCreate : null;
  const onCreateBlank = hostState && typeof hostState.onCreateBlank === 'function' ? hostState.onCreateBlank : null;
  const templates = hostState && Array.isArray(hostState.templates) ? hostState.templates : [];
  const blankName = (hostState && hostState.blankName) || '';
  const blankColumns = (hostState && hostState.blankColumns) || '';
  if (onCreate || onCreateBlank) {
    const ntChildren = [jsx('div', { style: { fontSize: 12, opacity: 0.75, marginBottom: 4 }, children: '新建表格' }, 'nth')];
    if (onCreate && templates.length > 0) {
      const tplBtns = templates.map(function (t, i) {
        const tname = (t && (t.name || t.file)) || ('模板' + i);
        return jsx('button', {
          type: 'button',
          'data-wb-newtable-btn': tname,
          title: '按模板「' + tname + '」新建一张空表',
          onClick: function (ev) {
            try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch (_) {}
            try { onCreate(tname); } catch (_) {}
          },
          style: { padding: '5px 11px', borderRadius: 8, border: '1px solid #d0d7de', background: '#fff', color: '#24292f', fontSize: 12, cursor: 'pointer', marginRight: 6, marginBottom: 4 },
          children: '新建「' + tname + '」'
        }, 'ntb' + i);
      });
      ntChildren.push(jsx('div', { style: { fontSize: 11, opacity: 0.6, margin: '2px 0' }, children: '从模板' }, 'ntlbl'));
      ntChildren.push(jsxs('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: tplBtns }, 'ntrow'));
    }
    if (onCreateBlank) {
      // 空白表：表格名 + 列名清单（逗号分隔，首列作主键）+ 新建按钮。直接服务「新建 XLSX 工作表」。
      const btn = jsx('button', {
        type: 'button',
        'data-wb-newblank-btn': '1',
        onClick: function (ev) {
          try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch (_) {}
          try { onCreateBlank(blankName, blankColumns); } catch (_) {}
        },
        style: { padding: '5px 11px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', marginLeft: 6 },
        children: '新建空白表'
      }, 'ntblankbtn');
      const ntInputStyle = { padding: '5px 8px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 12, outline: 'none', color: '#1f2328' };
      const nameInput = jsx('input', {
        type: 'text', 'data-wb-newblank-name': '1', placeholder: '表格名（可空）', value: blankName,
        onChange: function (ev) { try { hostState.onBlankName && hostState.onBlankName(ev.target.value); } catch (_) {} },
        style: Object.assign({}, ntInputStyle, { width: 90, marginRight: 4 })
      }, 'ntbn');
      const colInput = jsx('input', {
        type: 'text', 'data-wb-newblank-columns': '1', placeholder: '列名，逗号分隔（首列作主键）', value: blankColumns,
        onChange: function (ev) { try { hostState.onBlankColumns && hostState.onBlankColumns(ev.target.value); } catch (_) {} },
        style: Object.assign({}, ntInputStyle, { width: 180 })
      }, 'ntbc');
      ntChildren.push(jsx('div', { style: { fontSize: 11, opacity: 0.6, margin: '6px 0 2px' }, children: '空白表' }, 'ntblbl'));
      ntChildren.push(jsxs('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }, children: [nameInput, colInput, btn] }, 'ntblankrow'));
    }
    if (hostState && hostState.createdNotice) {
      ntChildren.push(jsx('div', { 'data-wb-created': '1', style: { color: '#0a7', fontSize: 12, marginTop: 4 }, children: hostState.createdNotice }, 'ntok'));
    }
    children.push(jsxs('div', { 'data-wb-newtable': '1', style: { marginTop: 12, paddingTop: 8, borderTop: '1px solid #eee' }, children: ntChildren }, 'newtable'));
  }
  // ── 浮窗外壳 ──────────────────────────────────────────────────────────────
  // 需求（用户 m06260）：打开 Excel 时原表**不被遮挡**，只在表格上方浮一个小按钮；
  // 点按钮才弹出小型「表格工作台」浮窗（含功能按钮），预览显示修改后数据，执行写入真实数据。
  // 实现：本 slot body 只渲染 position:fixed 的悬浮元素（不占侧栏流式布局），
  // 完全不碰宿主 Excel 表格 DOM。fabOpen 由 WorkbenchPanelBody 的 React state 控制。
  const fabOpen = hostState && hostState.fabOpen !== false; // 非渲染上下文默认展开（护测可断言内容）
  const onToggleFab = hostState && typeof hostState.onToggleFab === 'function' ? hostState.onToggleFab : function () {};
  const onCloseFab = hostState && typeof hostState.onCloseFab === 'function' ? hostState.onCloseFab : onToggleFab;

  // 悬浮按钮（FAB）：始终显示，位于右下角、原表之上。
  // 视觉：品牌渐变 + 双层柔和投影 + hover 上浮；图标用内联 SVG（避免 emoji 跨平台不一致）。
  const fabIcon = jsx('svg', {
    width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none',
    stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': 'true',
    children: [
      jsx('path', { d: 'M4 7h10M4 12h16M4 17h7' }, 'l1'),
      jsx('path', { d: 'M17 5l1.2 2.8L21 9l-2.8 1.2L17 13l-1.2-2.8L13 9l2.8-1.2z', fill: '#fff', stroke: 'none' }, 'l2')
    ]
  }, 'fabicon');
  const fab = jsx('button', {
    type: 'button',
    'data-wb-fab': '1',
    title: '表格工作台',
    onClick: function (ev) {
      try { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); } catch (_) {}
      try { onToggleFab(); } catch (_) {}
    },
    style: {
      position: 'fixed', right: 24, bottom: 24, zIndex: 2147482000,
      width: 56, height: 56, borderRadius: '50%', border: 'none',
      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 55%, #1d4ed8 100%)',
      color: '#fff', cursor: 'pointer', padding: 0,
      boxShadow: '0 6px 20px rgba(37,99,235,0.42), 0 2px 6px rgba(0,0,0,0.18)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'transform .18s ease, box-shadow .18s ease',
      outline: 'none'
    },
    onMouseEnter: function (ev) { try { if (ev && ev.currentTarget) { ev.currentTarget.style.transform = 'translateY(-2px) scale(1.05)'; ev.currentTarget.style.boxShadow = '0 10px 26px rgba(37,99,235,0.5), 0 3px 8px rgba(0,0,0,0.22)'; } } catch (_) {} },
    onMouseLeave: function (ev) { try { if (ev && ev.currentTarget) { ev.currentTarget.style.transform = 'none'; ev.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.42), 0 2px 6px rgba(0,0,0,0.18)'; } } catch (_) {} },
    children: fabIcon
  }, 'fab');

  // 浮窗面板：点 FAB 后出现在右下角，FAB 之上，可滚动，不遮挡整表。
  // 收起态用 display:none 隐藏（而非不渲染），保证内部控件始终在 React 树里——
  // 既让护栏/e2e 测试能查到控件，又让用户打开 Excel 时只看到悬浮按钮。
  const panel = jsxs('div', {
    'data-workbench-panel': '1',
    style: {
      position: 'fixed', right: 24, bottom: 92, zIndex: 2147482001,
      width: 384, maxWidth: 'calc(100vw - 48px)', maxHeight: '72vh',
      display: fabOpen ? 'flex' : 'none', flexDirection: 'column',
      background: '#fff', color: '#1f2328', border: '1px solid #e3e7ec',
      borderRadius: 14, boxShadow: '0 18px 48px rgba(15,23,42,0.22), 0 4px 12px rgba(15,23,42,0.10)',
      fontFamily: 'inherit', fontSize: 13, overflow: 'hidden'
    },
    children: [
      // 标题栏：品牌色渐变 + 图标 + 收起按钮
      jsxs('div', {
        'data-wb-fab-header': '1',
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 14px',
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          color: '#fff', userSelect: 'none'
        },
        children: [
          jsxs('div', {
            style: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, letterSpacing: 0.2 },
            children: [
              jsx('span', { style: { width: 8, height: 8, borderRadius: '50%', background: '#fff', opacity: 0.9, display: 'inline-block' } }, 'dot'),
              jsx('span', { children: '表格工作台' }, 'fabtitle')
            ]
          }, 'fabti'),
          jsx('button', {
            type: 'button', 'data-wb-fab-close': '1', title: '收起',
            onClick: function (ev) { try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (_) {} try { onCloseFab(); } catch (_) {} },
            style: { border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 14, cursor: 'pointer', lineHeight: 1, width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
            children: '✕'
          }, 'fabclose')
        ]
      }, 'fabheader'),
      // 可滚动内容区
      jsx('div', {
        'data-wb-fab-body': '1',
        style: { padding: 14, overflowY: 'auto', flex: '1 1 auto', minHeight: 0, background: '#fff' },
        children: jsxs('div', { children: children }, 'fabin')
      }, 'fabbody')
    ]
  }, 'panel');

  // 收起态也把面板保留在树里（display:none），所以这里总是渲染 fab + panel。
  return jsxs('div', { 'data-workbench-fab-root': '1', children: [fab, panel] }, 'fabroot');
}

function apply(ctx) {
  // 硬约束：本插件任何内部错误都**绝不能**让整个 web boot 失败（否则宿主弹「启动失败」
  // 对话框、点「禁用第三方插件」还会连锁改写 profile，形成崩溃循环）。
  // 因此这里捕获所有异常、记入 error 级 console（会被写进下一次 crash 报告便于排查），
  // 但**不再 rethrow**——最坏情况退化为「没有工作台 tab」，而不是「整个应用起不来」。
  try {
    return registerWorkbenchPanel(ctx);
  } catch (e) {
    try { console.error('[workbench] apply threw (degraded to no-tab, boot unaffected):', (e && e.stack) || e); } catch (_) {}
    return undefined;
  }
}

/**
 * 票 #41：解析 dsh-resource://file 文件地址 → {scope, sessionId, path}。
 * 契约照抄 univer-office client.js:22726-22754 parseFileAddress：
 *   dsh-resource://file/session/<sid>/<relpath...>  → {scope:'session', sessionId, path:'<relpath>'}
 *   dsh-resource://file/absolute/<drive>/<...>       → {scope:'absolute', path:'C:/...'}
 * 解析不出返回 undefined（面板显示占位，不崩）。
 */
var FILE_ADDRESS_PREFIX = 'dsh-resource://file/';
function parseFileAddress(address) {
  try {
    if (!address || address.indexOf(FILE_ADDRESS_PREFIX) !== 0) return undefined;
    var qi = address.search(/[?#]/);
    var body = address.slice(FILE_ADDRESS_PREFIX.length, qi === -1 ? undefined : qi);
    var parts = body.split('/');
    var scope = parts[0];
    var rest = parts.slice(1);
    if (scope === 'session') {
      var id = rest[0];
      var segments = rest.slice(1);
      if (!id || segments.length === 0) return undefined;
      return { scope: scope, sessionId: decodeURIComponent(id), path: segments.map(decodeURIComponent).join('/') };
    }
    if (scope === 'absolute') {
      var segs = rest.map(decodeURIComponent);
      if (segs.length === 0 || segs[0] === '') return undefined;
      return { scope: scope, path: segs.join('/') };
    }
    return undefined;
  } catch (e) { return undefined; }
}

/**
 * 票 #41：从 Host 路由取该 tab 的真实面板数据（{columns,rowCount,preview}）。
 * 用 React.useState + useEffect 轮询（与 univer useUniverStates 同构，间隔 900ms）。
 * 请求 shape 照抄 univer：/workbench-api/state?file=<address.path>&sessionId=<address.sessionId>，
 * Host 侧据 sessionId 取 cwd 解析成绝对路径再读表。任何网络异常都吞掉，面板显示占位不崩。
 */
function usePanelData(React, address) {
  var file = address && address.path;
  var sessionId = address && address.sessionId;
  var key = (file || '') + '|' + (sessionId || '');
  var stateTuple = React.useState({ data: null, error: null });
  var slot = stateTuple[0], setSlot = stateTuple[1];
  // 票 #44：点击按钮后 Host 重算出的「操作后预览」覆盖层（确认前仅替换预览，不改源数据）。
  // 一次点击 → fetch /workbench-api/preview → 拿到新 preview 暂存；再次轮询 /state 时清掉，
  // 回到实时状态（避免覆盖层永远压住实时数据）。
  var overrideTuple = React.useState(null);
  var override = overrideTuple[0], setOverride = overrideTuple[1];
  React.useEffect(function () {
    if (!file) { setSlot({ data: null, error: null }); return undefined; }
    var alive = true;
    function load() {
      try {
        var origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
        var url = origin + '/workbench-api/state?file=' + encodeURIComponent(file)
          + (sessionId ? '&sessionId=' + encodeURIComponent(sessionId) : '');
        fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); })
          .then(function (j) { if (alive) setSlot({ data: j, error: null }); })
          .catch(function (e) { if (alive) setSlot({ data: null, error: String((e && e.message) || e) }); });
      } catch (e) { if (alive) setSlot({ data: null, error: String((e && e.message) || e) }); }
    }
    load();
    var timer = setInterval(load, 900);
    return function () { alive = false; if (timer) clearInterval(timer); };
  }, [key]);
  // 票 #44：点击按钮 → 请 Host 用引擎按该按钮配方重算 preview，成功后覆盖预览层。
  // 失败（读表/校验/网络）不崩：把错误写进覆盖层，面板照常显示（AC3 如实显示失败项）。
  function applyButtonPreview(buttonId, button) {
    if (!file || !button) return;
    try {
      var origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
      var url = origin + '/workbench-api/preview?file=' + encodeURIComponent(file)
        + (sessionId ? '&sessionId=' + encodeURIComponent(sessionId) : '')
        + '&buttonId=' + encodeURIComponent(buttonId)
        + '&button=' + encodeURIComponent(JSON.stringify(button));
      fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); })
        .then(function (j) {
          // 票 #46：带上 clickedAt 时间戳 → 预览卡显示「已按…重算」可见反馈，
          // 即使重算结果与当前完全相同，用户也能看到点击确实生效（不再「没反应」）。
          var stamp = Date.now();
          if (j && j.preview) {
            setOverride({ preview: j.preview, buttonId: buttonId, isDefaultDraft: false, clickedAt: stamp });
          } else {
            setOverride({ preview: null, buttonId: buttonId, isDefaultDraft: false, clickedAt: stamp,
              note: (j && j.error) ? String(j.error) : '操作失败' });
          }
        })
        .catch(function (e) { setOverride({ preview: null, buttonId: buttonId, isDefaultDraft: false, clickedAt: Date.now(), note: String((e && e.message) || e) }); });
    } catch (e) {
      setOverride({ preview: null, buttonId: buttonId, isDefaultDraft: false, clickedAt: Date.now(), note: String((e && e.message) || e) });
    }
  }
  return { data: slot.data, error: slot.error, state: slot, override: override, applyButtonPreview: applyButtonPreview, setOverride: setOverride };
}

function registerWorkbenchPanel(ctx) {
  // 阶段 1：注册 tab 类型（priority=extension，外部包公开路径；keepMounted 常驻）
  // 契约照抄 dsh-univer-office lib/client.js:23371-23373 与 better-sidebar
  // client-registry.js:30123-30130：用 ctx.inject([...], cb) 等 sidebarRightTabs 就绪，
  // 经 injected.get("sidebarRightTabs") 取值（不要直接点 nativeCtx.sidebarRightTabs），
  // 取不到就安全返回不抛错。
  ctx.inject(['sidebarRightTabs'], function (injected) {
    const tabs = injected.get ? injected.get('sidebarRightTabs') : injected.sidebarRightTabs;
    if (tabs === void 0) return;
    injected.effect(function () {
      const dispose = tabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        patterns: ['*.xlsx', '*.xls', '*.csv'],
        priority: 'extension',
        keepMounted: true,
        title: function () { return '表格工作台'; }
      });
      return dispose;
    }, 'workbench: sidebar tab type');
  });

  // 阶段 2：面板 body 注册到 sidebar.right.pane.tab，key 等于 tab id。
  // 契约照抄 better-sidebar client-registry.js:30144-30152 / univer client.js:23421-23431：
  // 必须用 ctx.slots.inject(SLOT, () => ctx.slots.register({name,key,inject}, Body))
  // 包一层，而不是在 apply 里裸调 ctx.slots.register——裸调会在 slot 未就绪时抛错，
  // 使整个 fiber 进入 failed（宿主报 "dsh-workbench: failed"，无 tab）。
  ctx.effect(function () {
    return ctx.slots.inject('sidebar.right.pane.tab', function () {
      const d = ctx.slots.register(
        // 票 #41：inject 只提供额外上下文，**不能覆盖** slot 自己声明的 hooks
        // （sidebar.right.pane.tab 的 slot 定义声明 inject:{hooks:{tabInfo}}，body 靠它拿到
        // props.useTabInfo）。若这里返回 {hooks:{}} 会把 tabInfo 挤掉 → props.useTabInfo 变
        // undefined → 拿不到 tab.contentId → 永远「暂无预览」。故对齐 univer 返回空对象。
        { name: 'sidebar.right.pane.tab', key: TAB_ID, inject: function () { return {}; } },
        function WorkbenchPanelBody(props) {
          // slot body 必须是 React 组件、返回 React 元素（返回普通对象会触发 React error #31）。
          // 票 #41：从 slot props 的 useTabInfo（univer 直接用 props.useTabInfo()，非 props.hooks）
          // 取 tab.contentId（文件地址）→ parseFileAddress → {sessionId, path}，轮询 Host 路由
          // 拿真实 preview，再渲染成 React 元素。
          var React = null;
          try { React = require('react'); } catch (_) { React = null; }
          var address = undefined;
          try {
            var useTabInfo = props && props.useTabInfo;
            if (typeof useTabInfo === 'function') {
              var ti = useTabInfo();
              address = parseFileAddress(ti && ti.tab ? ti.tab.contentId : undefined);
            }
          } catch (_) { address = undefined; }
          var vm = null;
          var panelData = null;
          // 票 #47：面板内新建配方的本地状态——输入文本、Host 返回的动作状态、忙碌标志。
          // 注意：hooks 只能在 React 渲染上下文里调用。护栏测试会直接 spec.body({}) 调本函数
          // （非渲染），此时 useState 会抛错；用 try/catch 兜底成无状态默认值，保证仍返回
          // 合法 React 元素（不返回普通对象、不崩），真实渲染时 hooks 正常生效。
          var inputText = '', setInputText = function () {};
          var actionState = null, setActionState = function () {};
          var actionBusy = false, setActionBusy = function () {};
          // 浮窗开合状态：默认**展开**（用户 m07859：打开 Excel 要直接看到原表，而不是一片空白）。
          // 浮窗是 position:fixed 覆盖层，展开也不改动 Excel 本身布局；用户可点 ✕ 收起只剩悬浮球。
          // 护栏测试非渲染上下文拿不到 hooks → fabOpen 默认 true，保证面板内容仍在树里可断言。
          var fabOpen = true, setFabOpen = function () {};
          var hooksOk = false;
          try {
            if (React && typeof React.useState === 'function') {
              var inputTuple = React.useState('');
              inputText = inputTuple[0]; setInputText = inputTuple[1];
              var actTuple = React.useState(null);
              actionState = actTuple[0]; setActionState = actTuple[1];
              var busyTuple = React.useState(false);
              actionBusy = busyTuple[0]; setActionBusy = busyTuple[1];
              var fabTuple = React.useState(true);
              fabOpen = fabTuple[0]; setFabOpen = fabTuple[1];
              hooksOk = true;
            }
          } catch (_) { hooksOk = false; }
          if (hooksOk) {
            try {
              panelData = usePanelData(React, address);
              // Host 返回 { columns, rowCount, preview, isDefaultDraft, registryButtons, buttons }；
              // 包装成 renderWorkbenchPanel 认得的视图模型（preview 为空则显示「暂无预览」）。
              if (panelData && panelData.data) {
                // Host /state 返回 { columns, rowCount, preview, isDefaultDraft, registryButtons, buttons, table, stage }。
                // 用户 m06880：stage 用 Host 真值（不再由 preview 有无臆测为 PREVIEWED），并带 table 供 IDLE 显示原表。
                vm = {
                  preview: panelData.data.preview || null,
                  stage: panelData.data.stage || (panelData.data.preview ? 'PREVIEWED' : 'IDLE'),
                  table: panelData.data.table || null,
                  isDefaultDraft: !!panelData.data.isDefaultDraft,
                  // 票 #43：按钮库原样带出，renderWorkbenchPanel 会投影成可点按钮。
                  registryButtons: panelData.data.registryButtons || [],
                  buttons: panelData.data.buttons || []
                };
              }
            } catch (_) { vm = null; panelData = null; }
          }
          // 票 #47：把动作（understand/preview/confirm/solidify）发给 Host /workbench-api/action，
          // 拿回新的完整状态（stage/draft/preview/buttons/note）覆盖显示。这是面板内新建配方的核心。
          var runAction = function (type, extra) {
            if (!address || !address.path) return;
            try {
              setActionBusy(true);
              var origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
              var act = Object.assign({ type: type }, extra || {});
              // 票 #47/#56：understand 必须把当前输入框文字一并发给 Host——引擎的 UNDERSTAND 用
              // action.text（缺省才退 state.input，而 Host 侧 state.input 从未被 SET_INPUT 写过）。
              // 此前没带 text，导致用户明明输了字、点「理解」却被判「输入框是空的」（真实面板缺陷）。
              if (type === 'understand' && act.text === undefined) act.text = (inputText || '');
              // solidify 时把当前输入框文字作为按钮名（用户可后续重命名）。
              if (type === 'solidify' && !act.name) act.name = (inputText || '').trim() || '我的配方';
              var body = JSON.stringify({
                file: address.path,
                sessionId: address.sessionId || undefined,
                action: act
              });
              fetch(origin + '/workbench-api/action', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: body
              }).then(function (r) { return r.json(); })
                .then(function (j) { setActionState(j || null); setActionBusy(false); })
                .catch(function (e) { setActionState({ error: String((e && e.message) || e), stage: (actionState && actionState.stage) || 'IDLE' }); setActionBusy(false); });
            } catch (e) { setActionState({ error: String((e && e.message) || e) }); setActionBusy(false); }
          };
          // 票 #44：点击按钮 → 请 Host 用引擎按该按钮配方重算 preview，覆盖预览卡（刷新）。
          var onClick = function (id) {
            try {
              if (panelData && typeof panelData.applyButtonPreview === 'function') {
                var all = (vm && vm.buttons ? vm.buttons : []).concat(vm && vm.registryButtons ? vm.registryButtons : []);
                var btn = null;
                for (var i = 0; i < all.length; i++) { if (all[i] && all[i].id === id) { btn = all[i]; break; } }
                if (btn) panelData.applyButtonPreview(id, btn);
              }
            } catch (_) {}
          };
          var effective = Object.assign({}, vm || {});
          // 票 #47：动作状态优先——一旦用户在面板里新建/推进配方，以 Host 动作返回的状态为准。
          if (actionState && !actionState.error) {
            effective.preview = actionState.preview || null;
            effective.stage = actionState.stage || 'IDLE';
            effective.isDefaultDraft = false;
            effective.buttons = actionState.buttons || (vm && vm.buttons) || [];
            effective.registryButtons = actionState.registryButtons || (vm && vm.registryButtons) || [];
            effective.note = actionState.note || '';
            effective.noteTone = actionState.noteTone || 'info';
            if (actionState.writtenOk) {
              effective.clickedAt = Date.now();
              effective.clickedName = '确认执行（已写入磁盘 ' + actionState.writtenCells + ' 格）';
            } else if (actionState.writtenOk === false) {
              effective.note = (effective.note ? effective.note + ' ' : '') + '写盘失败：' + (actionState.writeError || '未知错误');
              effective.noteTone = 'warn';
            }
          } else if (actionState && actionState.error) {
            effective.note = '操作失败：' + actionState.error;
            effective.noteTone = 'warn';
          } else if (panelData && panelData.override) {
            // 票 #44 兼容：点预置/固化按钮的覆盖层预览。
            effective.preview = panelData.override.preview || null;
            effective.isDefaultDraft = false;
            var ovBtnId = panelData.override.buttonId;
            var ovAll = (vm && vm.buttons ? vm.buttons : []).concat(vm && vm.registryButtons ? vm.registryButtons : []);
            var ovName = ovBtnId;
            for (var k = 0; k < ovAll.length; k++) { if (ovAll[k] && ovAll[k].id === ovBtnId) { ovName = ovAll[k].name || ovBtnId; break; } }
            effective.recipeLabel = ovName;
            effective.clickedAt = panelData.override.clickedAt || null;
            effective.clickedName = ovName;
            if (panelData.override.note) effective.note = panelData.override.note;
          } else if (vm && vm.isDefaultDraft) {
            effective.recipeLabel = '默认配方（调换后两列）';
          }
          // 票 #48：按钮管理动作（运行/重命名/删除）→ 映射到引擎动作类型，复用 runAction 打到 Host。
          var onButtonAction = function (op, id, extra) {
            try {
              if (op === 'run') runAction('RUN_BUTTON', { id: id });
              else if (op === 'rename') runAction('RENAME_BUTTON', { id: id, name: (extra && extra.name) || '' });
              else if (op === 'delete') runAction('DELETE_BUTTON', { id: id });
              else if (op === 'params') runAction('SET_BUTTON_PARAMS', { id: id, params: (extra && extra.params) || {} });
            } catch (_) {}
          };
          // 票 #52：从模板新建表格。模板清单一次拉取（/templates），点「新建」POST /create。
          // 新建成功后显示「✓ 已创建：<name>」（文件不会自动在右栏打开——打开需宿主侧 tab action，
          // 非面板可驱动；用户从文件树打开）。
          var templates = [], setTemplates = function () {};
          var createdNotice = '', setCreatedNotice = function () {};
          var blankName = '', setBlankName = function () {};
          var blankColumns = '', setBlankColumns = function () {};
          if (hooksOk) {
            try {
              var tplTuple = React.useState([]);
              templates = tplTuple[0]; setTemplates = tplTuple[1];
              var noticeTuple = React.useState('');
              createdNotice = noticeTuple[0]; setCreatedNotice = noticeTuple[1];
              var bnTuple = React.useState('');
              blankName = bnTuple[0]; setBlankName = bnTuple[1];
              var bcTuple = React.useState('');
              blankColumns = bcTuple[0]; setBlankColumns = bcTuple[1];
              React.useEffect(function () {
                var alive = true;
                try {
                  var origin0 = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
                  fetch(origin0 + '/workbench-api/templates', { credentials: 'same-origin' })
                    .then(function (r) { return r.json(); })
                    .then(function (j) { if (alive && j && Array.isArray(j.templates)) setTemplates(j.templates); })
                    .catch(function () {});
                } catch (_) {}
                return function () { alive = false; };
              }, []);
            } catch (_) {}
          }
          var doCreate = function (payload, okName) {
            if (!address || !address.path) return;
            try {
              var origin1 = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
              fetch(origin1 + '/workbench-api/create', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(Object.assign({ sessionId: address.sessionId || undefined }, payload))
              }).then(function (r) { return r.json(); })
                .then(function (j) {
                  if (j && j.file) setCreatedNotice('✓ 已创建：' + (j.name || okName) + ' → ' + j.file);
                  else setCreatedNotice('新建失败：' + ((j && j.error) || (j && j.errors && j.errors[0] && j.errors[0].reason) || '未知错误'));
                })
                .catch(function (e) { setCreatedNotice('新建失败：' + ((e && e.message) || e)); });
            } catch (e) { setCreatedNotice('新建失败：' + ((e && e.message) || e)); }
          };
          var onCreate = function (templateName) {
            doCreate({ mode: 'template', template: templateName }, templateName);
          };
          var onCreateBlank = function (name, columns) {
            if (!String(columns || '').trim()) { setCreatedNotice('新建失败：请填写列名（逗号分隔）'); return; }
            doCreate({ mode: 'blank', name: (name || '').trim() || undefined, columns: columns }, '新建表格');
          };
          try {
            return renderWorkbenchPanel(Object.assign({}, effective, {
              onButtonClick: onClick,
              onButtonAction: onButtonAction,
              inputText: inputText,
              onInput: function (v) { try { setInputText(v); } catch (_) {} },
              onAction: runAction,
              actionBusy: actionBusy,
              fabOpen: fabOpen,
              onToggleFab: function () { try { setFabOpen(!fabOpen); } catch (_) {} },
              onCloseFab: function () { try { setFabOpen(false); } catch (_) {} },
              templates: templates,
              onCreate: onCreate,
              onCreateBlank: onCreateBlank,
              blankName: blankName,
              blankColumns: blankColumns,
              onBlankName: function (v) { try { setBlankName(v); } catch (_) {} },
              onBlankColumns: function (v) { try { setBlankColumns(v); } catch (_) {} },
              createdNotice: createdNotice
            }));
          } catch (renderErr) {
            // 上线健壮性兜底：面板渲染期任何意外异常都不得冒泡击穿宿主视图。
            // 返回一个最小合法 React 元素（仅一个可点开的悬浮按钮），保证宿主不崩、用户不白屏。
            try {
              var rt2 = require('react/jsx-runtime');
              var msg = (renderErr && renderErr.message) || String(renderErr);
              return rt2.jsx('button', {
                type: 'button', 'data-wb-fab': '1', 'data-workbench-error-fallback': '1',
                title: '表格工作台（渲染异常：' + msg + '）',
                style: { position: 'fixed', right: 24, bottom: 24, zIndex: 2147482000, width: 56, height: 56, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', fontSize: 20, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.28)' },
                children: '⚠'
              }, 'fabfallback');
            } catch (_) { return null; }
          }
        }
      );
      return d;
    });
  }, 'workbench: panel body');

  return { tabId: TAB_ID, kind: TAB_KIND, projectPreviewCard, projectButtonLibrary };
}

module.exports = { apply, inject, registerWorkbenchPanel, projectPreviewCard, projectButtonLibrary, renderWorkbenchPanel, parseFileAddress, TAB_ID, TAB_KIND };
