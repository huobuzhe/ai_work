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
  if (!pv || pv.invalid) return null;
  // 票 #12：作用域是公共字段，预览卡要把 scope / 条件 暴露给宿主，
  // 让「作用范围：全部 / 符合条件 + 条件输入」在预览卡内可改（不新增第 6 步）。
  // 统一的 firstDefined：引擎产出的 preview 已带这两字段，回退仅为兼容 pre-#12 的旧 preview 对象。
  const dp = (state.draft && state.draft.params) || {};
  const firstDefined = function (a, b, fallback) {
    return a !== undefined ? a : (b !== undefined ? b : fallback);
  };
  const scope = firstDefined(pv.scope, dp.scope, 'all');
  const condition = firstDefined(pv.condition, dp['条件'], '');
  return {
    stage: state.stage,
    explanation: state.draft && state.draft.explanation ? state.draft.explanation : '',
    summary: pv.summary,
    affectedRows: pv.affectedRows,
    totalRows: pv.totalRows,
    scope: scope,
    condition: condition,
    scopeLabel: scope === 'match' ? '符合条件' : '全部',
    // 票 #13：swap 半换披露——结构化 disclosure + 现成 banner，供宿主渲染「命中？列 + 混合来源」。
    disclosure: pv.disclosure || null,
    swapBanner: pv.swapBanner || '',
    cells: pv.cells.map(function (c) {
      return { row: c.row, col: c.col, before: c.before, after: c.after,
        invalid: c.invalid, source: c.source };
    })
  };
}

function registerWorkbenchPanel(ctx) {
  // 阶段 1：注册 tab 类型（priority=extension，外部包公开路径；keepMounted 常驻）
  ctx.inject(['sidebarRightTabs'], function (nativeCtx) {
    nativeCtx.effect(function () {
      nativeCtx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        patterns: ['*.xlsx', '*.xls', '*.csv'],
        priority: 'extension',
        keepMounted: true,
        title: function () { return '表格工作台'; }
      });
    }, 'workbench: sidebar tab type');
  });

  // 阶段 2：面板 body 注册到 sidebar.right.pane.tab，key 等于 tab id
  ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, function WorkbenchPanelBody(hostState) {
    // 工作台自渲染的「解释与影响预览」卡：把 Host 投影进来的状态映射成视图模型。
    return projectPreviewCard(hostState);
  });

  return { tabId: TAB_ID, kind: TAB_KIND, projectPreviewCard };
}

module.exports = { registerWorkbenchPanel, projectPreviewCard, TAB_ID, TAB_KIND };
