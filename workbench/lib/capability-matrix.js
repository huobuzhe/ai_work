'use strict';
/**
 * 票 #25（Slice 2 / S5）：能力位矩阵端到端验尸 + 回填 formulaCapabilities。
 *
 * 本模块是**纯声明 + 纯函数**（数据进数据出，无 I/O、无凭据）：把「四个能力位 × 三个平台」
 * 的最小端到端用例（写 `=C2*D2`（工时×时薪）→ 触发重算 → 读回计算值 → 与期望比较）落成一张可复现矩阵，
 * 每格给出：结论（true/false）、是否可在本会话真跑（runnable）、一手证据链接、false 时的失败步骤。
 *
 * 口径（严格遵循票 #25 与地图 #2 共识 ⑲）：
 *  - 只在**真跑过并通过**时才可能记 true；文档层「未验证」一律按 false 记并附一手证据与失败步骤。
 *  - 本地 Excel 是唯一本会话可真跑的 adapter（零凭据 + bundled LibreOffice 重算闭环），四格 true。
 *  - 飞书 / 腾讯为文档层 false（腾讯 V3 三格一手负面已验证），本会话不持凭据真跑，一律 false。
 *  - false 的格绝不因为「链路能建表」就记 true —— 链路事实（建表→写值→读回）与能力位（公式求值）
 *    严格分开（票 #5 答案 gist / docs/research/cloud-capability-matrix.md 口径）。
 *
 * 真正的重算/读回动作由 scripts/capability-probe.js 执行（本模块不碰文件与网络），
 * 与 S1 契约字段名（canWriteFormula / canRecalc / canReadComputed / functionSet）保持一致。
 */

// 四个能力位（顺序固定，与 S1 契约字段名一致）。
const CAPABILITY_BITS = ['canWriteFormula', 'canRecalc', 'canReadComputed', 'functionSet'];

// 每个能力位的最小用例描述（四格共用一条链路的不同判定点）。
// 注：夹具列序为 姓名|部门|工时|时薪|备注，故 工时=C 列、时薪=D 列，公式实际写 `=C2*D2`（引擎产出的真实格址）。
const MIN_CASE = '写 =C2*D2（工时×时薪）→ 触发重算 → 读回计算值 → 与期望值比较';

// 一手证据链接（来自 docs/research/cloud-capability-matrix.md 已取证）。
const EVIDENCE = {
  excel_functions: 'https://support.microsoft.com/zh-cn/excel/excel-functions-alphabetical',
  excel_recalc: 'docs/research/spreadsheet-platform-capabilities.md 第 3 章（office-recalculate / LibreOffice recalculate + xlsx_bridge read-values 闭环）',
  feishu_sheets_write: 'https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/write-data-to-a-single-range?lang=zh-CN',
  feishu_sheets_recalc: 'https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/sheets/v3/resource.go',
  feishu_sheets_read: 'https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/reading-a-single-range?lang=zh-CN',
  feishu_function_set: 'https://www.feishu.cn/hc/zh-CN/articles/962259873941',
  tencent_batchupdate: 'https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/request.html',
  tencent_overview: 'https://docs.qq.com/open/document/app/openapi/v3/sheet/overview.html',
  tencent_get_range: 'https://docs.qq.com/open/document/app/openapi/v3/sheet/get/get_range.html'
};

// 探针声明：adapter -> 四格结论。
// 每格 { bit, minCase, verdict: 'true'|'false', runnable: bool, evidence: url|note, failingStep?: string }
//  - runnable=true 表示本会话可用 scripts/capability-probe.js 真跑（仅 local）；true 判决必须有真跑通过支撑。
//  - runnable=false 表示文档层结论（飞书/腾讯），verdict 必须 false 且带 failingStep。
// **单一真相源**：每格的 verdict 布尔值不在此处独立声明，而是从 engine 的 ADAPTERS[id].formulaCapabilities
// 派生（engine 是应用实际使用的唯一来源）；本模块只补充 runnable / evidence / failingStep 等验尸元数据。
// 这样「回填 formulaCapabilities」方向单一：应用能力位 = engine.ADAPTERS，矩阵只是给每格补证据与可跑性。
const E = require('./engine');

// 各格的验尸元数据（不含 verdict，verdict 由 engine 派生）。
const CELL_META = {
  local: {
    label: '本地 Excel（零凭据）',
    cells: {
      canWriteFormula: { runnable: true, evidence: EVIDENCE.excel_functions },
      canRecalc: { runnable: true, evidence: EVIDENCE.excel_recalc },
      canReadComputed: { runnable: true, evidence: EVIDENCE.excel_recalc },
      functionSet: { runnable: true, evidence: EVIDENCE.excel_functions }
    }
  },
  feishu: {
    label: '飞书多维表格 / 电子表格',
    cells: {
      canWriteFormula: { runnable: false, evidence: EVIDENCE.feishu_sheets_write, failingStep: '写 =C2*D2 后读回仍是公式文本（文档层未见写公式求值接口）' },
      canRecalc: { runnable: false, evidence: EVIDENCE.feishu_sheets_recalc, failingStep: '无重算资源/接口可调用' },
      canReadComputed: { runnable: false, evidence: EVIDENCE.feishu_sheets_read, failingStep: '读范围接口无「读计算值」参数' },
      functionSet: { runnable: false, evidence: EVIDENCE.feishu_function_set, failingStep: '未见官方公式函数差异说明/函数清单接口' }
    }
  },
  tencent: {
    label: '腾讯文档在线表格',
    cells: {
      canWriteFormula: { runnable: false, evidence: EVIDENCE.tencent_batchupdate, failingStep: '一手负面：V3 batchUpdate 的 CellValue 只 text/link/number，无公式字段' },
      canRecalc: { runnable: false, evidence: EVIDENCE.tencent_overview, failingStep: '一手负面：V3 接口列表只有 3 个，无重算接口' },
      canReadComputed: { runnable: false, evidence: EVIDENCE.tencent_get_range, failingStep: '一手负面：get_range 响应无计算值字段' },
      functionSet: { runnable: false, evidence: EVIDENCE.tencent_overview, failingStep: '未见官方公式函数列表/差异页' }
    }
  }
};

// 由 engine 的 ADAPTERS.formulaCapabilities（单一真相源）+ CELL_META 组装 PROBES。
const PROBES = {};
Object.keys(CELL_META).forEach(function (id) {
  const meta = CELL_META[id];
  const adapter = E.ADAPTERS[id];
  if (!adapter || !adapter.formulaCapabilities) {
    throw new Error('能力位矩阵：engine.ADAPTERS 缺少 adapter「' + id + '」或其 formulaCapabilities');
  }
  PROBES[id] = {
    adapterId: id,
    label: meta.label,
    cells: CAPABILITY_BITS.map(function (bit) {
      const m = meta.cells[bit];
      return {
        bit: bit,
        minCase: MIN_CASE,
        verdict: adapter.formulaCapabilities[bit] ? 'true' : 'false', // ← 单一真相源：engine
        runnable: m.runnable,
        evidence: m.evidence,
        failingStep: m.failingStep
      };
    })
  };
});

const ADAPTER_IDS = ['local', 'feishu', 'tencent'];

// 断言/自检：任何一格 verdict=true 必须 runnable=true（不能靠文档/链路事实冒充真跑通过）。
// 遍历实际 PROBES 的所有 key（含测试临时注入的），而非写死的 ADAPTER_IDS，保证基建对被测数据全覆盖。
function assertNoUnbackedTrue(probes) {
  const table = probes || PROBES;
  Object.keys(table).forEach(function (id) {
    (table[id].cells || []).forEach(function (c) {
      if (c.verdict === 'true' && !c.runnable) {
        throw new Error('能力位断言违规：' + id + '/' + c.bit + ' 记 true 但不可真跑（不能无证据记 true）');
      }
      if (c.verdict === 'false' && !c.failingStep) {
        throw new Error('能力位断言违规：' + id + '/' + c.bit + ' 记 false 但缺 failingStep（必须给出失败步骤）');
      }
      if (!c.evidence) {
        throw new Error('能力位断言违规：' + id + '/' + c.bit + ' 缺 evidence 链接');
      }
    });
  });
  return true;
}
// 模块加载即自检，任何无证据的 true 直接抛错（防漂移）。
assertNoUnbackedTrue();

// 纯函数：返回整张矩阵（每平台 × 四格）的只读快照。
function getMatrix() {
  return ADAPTER_IDS.map(function (id) {
    const p = PROBES[id];
    const cells = {};
    p.cells.forEach(function (c) { cells[c.bit] = { verdict: c.verdict, runnable: c.runnable, evidence: c.evidence, failingStep: c.failingStep || null }; });
    return { adapterId: id, label: p.label, cells: cells };
  });
}

// 纯函数：从矩阵结论派生某 adapter 的 formulaCapabilities（与 S1 契约字段同名）。
// true/false 必须来自 verdict === 'true'，不额外推断。
function formulaCapabilitiesFromMatrix(adapterId) {
  const p = PROBES[adapterId];
  if (!p) throw new Error('未知 adapter：' + adapterId);
  const out = {};
  CAPABILITY_BITS.forEach(function (bit) {
    const cell = p.cells.find(function (c) { return c.bit === bit; });
    out[bit] = cell.verdict === 'true';
  });
  return out;
}

// 纯函数：把矩阵渲染成 Markdown（每格带结论 + 证据 + false 时失败步骤）。
// opts.capabilities：可选的能力位覆盖（{adapterId:{bit:bool}}），用于「真跑降级」后让落盘产物如实反映
// 失败结果（否则 --write-matrix 会印静态 PROBES 的 true，与降级后的 report 不一致）。
function renderMarkdown(opts) {
  opts = opts || {};
  const override = opts.capabilities || {};
  const lines = [];
  lines.push('# 能力位 × 平台 矩阵（票 #25 端到端验尸产物）');
  lines.push('');
  lines.push('> 本文件由 `workbench/scripts/capability-probe.js` 生成，勿手改；矩阵随探针结论自动同步。');
  lines.push('> 口径：只在真跑过并通过才记 `true`；文档层「未验证」一律 `false` 并附一手证据与失败步骤（地图 #2 共识 ⑲）。');
  lines.push('');
  lines.push('| 平台 | ' + CAPABILITY_BITS.join(' | ') + ' |');
  lines.push('| --- | ' + CAPABILITY_BITS.map(function () { return '---'; }).join(' | ') + ' |');
  ADAPTER_IDS.forEach(function (id) {
    const p = PROBES[id];
    const ov = override[id] || {};
    const cells = CAPABILITY_BITS.map(function (bit) {
      const c = p.cells.find(function (x) { return x.bit === bit; });
      const verdict = Object.prototype.hasOwnProperty.call(ov, bit)
        ? (ov[bit] ? 'true' : 'false')
        : c.verdict;
      let s = verdict;
      if (verdict === 'false' && c.failingStep) s += '（' + c.failingStep + '）';
      s += ' · ' + c.evidence;
      if (c.runnable && verdict === 'true') s += ' · [本会话真跑]';
      return s;
    });
    lines.push('| ' + p.label + ' | ' + cells.join(' | ') + ' |');
  });
  lines.push('');
  lines.push('## 最小用例');
  lines.push('');
  lines.push('- ' + MIN_CASE + '（四格共用同一链路的不同判定点）。');
  lines.push('- 本地 Excel 由 `node scripts/capability-probe.js --run-local` 真跑四格；飞书/腾讯为文档层结论，未持凭据真跑。');
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  CAPABILITY_BITS,
  MIN_CASE,
  EVIDENCE,
  PROBES,
  ADAPTER_IDS,
  assertNoUnbackedTrue,
  getMatrix,
  formulaCapabilitiesFromMatrix,
  renderMarkdown
};
