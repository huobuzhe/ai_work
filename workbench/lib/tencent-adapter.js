'use strict';
/**
 * 票 #24（Slice 2 / S4）：腾讯文档 adapter 实装。
 *
 * 职责：把一条动作产物（这里是「建表后的主表结构」）落成腾讯文档在线表格的
 * 「建表 → 查 sheetId → 写值（batchUpdate） → 读回」请求计划。
 *
 * 设计边界（与主 seam 一致、与 local / feishu adapter 对称）：
 *  - 本模块是**纯声明**：只产出「请求计划」（method/url/headers/body 的占位描述），
 *    绝不内嵌任何真实凭据值——腾讯三元组只以「取哪个契约字段名」的占位符出现（S2 契约）。
 *  - 真正的 HTTP I/O 交给 scripts/tencent-adapter.js（可对真实腾讯文档或 stub 回放执行）。
 *  - buildTencentPlan / runTencentPlanWithStub 都是纯函数（stub 只吃内存、不触网）。
 *
 * 一手来源（票 #5/#6/#7 已坐实，见 docs/research/tencent-create-file-request-shape.md、
 * tencent-v3-batchupdate-request-shape.md、SMOKE-RUNBOOK.md Step 6-8）：
 *  - Step 6 建表：POST https://docs.qq.com/openapi/drive/v2/files，表单 body `type=sheet&title=...`，
 *    回包外层 `ret`/`msg`/`data`（**不是 code**），文件 ID 在 `data.ID`（大写 ID，形如 `300000000$XXXX`，含字面 `$`）。
 *    成功判据 = HTTP 200 + `ret == 0`。
 *  - 取 sheetId：GET https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}?concise=1（途径 A，get_sheet）。
 *  - Step 7 写值：POST https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}/batchUpdate，
 *    `Content-Type: application/json`，body `{"requests":[{"updateRangeRequest":{...}}]}`；
 *    单次操作数（requests 元素）**<= 5**；`gridData` 用 **0-based** `startRow`/`startColumn`（不是 A1）。
 *    单元格 `CellValue` 只有 `text`/`number`/`link`（**无公式字段**）。
 *    成功判据：官方页响应结构自相矛盾（参数表 code/message/data.responses vs 示例顶层 responses vs FAQ ret/msg），
 *    `code==0` 无逐字依据 → 只认 HTTP 200，并文档化此未验证点。
 *  - Step 8 读回：GET https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}/{sheetId}/{range}，
 *    `range` 用 **A1 表示法**（读接口才用 A1，写接口用 0-based 网格，两者别混用）。
 *  三元组请求头（每个 OpenAPI 请求都必带）：Access-Token / Client-Id / Open-Id（对应契约字段
 *    TENCENT_ACCESS_TOKEN / TENCENT_CLIENT_ID / TENCENT_OPEN_ID）。
 */

const E = require('./engine');

// 腾讯单元格值类型（票 #7：CellValue 全字段 text/number/link/time/location/select，无公式字段）。
// 单源原则：写入类型名取自 engine 的规范映射（TYPE_MAP[x].tencent），这里只负责「能不能写 / 怎么写」。
// verified 标记（写入形态是否有一手逐字示例）：
//  - text   → verified=true（官方示例逐字演示 cellValue.text，且 request.html 明列 text）
//  - number → verified=true（CellValue 表 + request.html 补充说明两处坐实；无逐字写入示例，但键名无歧义）
//  - date / checkbox / select → verified=false（request.html 只列 text/link/number，其余是否被
//    updateRangeRequest 接受**未验证**）；不静默冒充 text，进 unverifiedTypes 由 --live 把关。
const TENCENT_CELL_BY_NAME = {
  text:     { verified: true,  note: '文本；官方示例逐字 cellValue.text（票 #7）' },
  number:   { verified: true,  note: '数字；CellValue 表 + request.html 均列 number（无逐字写入示例，键名无歧义）' },
  date:     { verified: false, note: '日期；request.html 只列 text/link/number，time 是否被接受未验证' },
  checkbox: { verified: false, note: '复选框；request.html 未列，写入形态未验证' },
  select:   { verified: false, note: '单选/多选；request.html 未列，写入形态未验证' }
};

const BASE = 'https://docs.qq.com';
const DRIVE_V2 = BASE + '/openapi/drive/v2/files';
const SPREAD_V3 = BASE + '/openapi/spreadsheet/v3/files';

// 腾讯三元组占位头（值全部来自 S2 契约字段名，非值）
const AUTH_PLACEHOLDER = {
  headers: {
    'Access-Token': 'TENCENT_ACCESS_TOKEN',
    'Client-Id': 'TENCENT_CLIENT_ID',
    'Open-Id': 'TENCENT_OPEN_ID'
  }
};

/**
 * 把清单类型（text/number/date/bool/enum）解析为腾讯单元格写入类型。
 * 单一来源：先用 engine.TYPE_MAP 把清单类型映射成语义名，再查本表。
 * 不静默降级：未知类型 → {ok:false}；已知但写入形态未验证 → {ok:true, verified:false}。
 * @return {ok:true, name, verified:boolean, note?} | {ok:false, reason}
 */
function resolveTencentType(localType) {
  if (!localType) return { ok: false, reason: '缺少字段类型' };
  const map = E.TYPE_MAP[localType];
  if (!map || map.tencent === undefined) return { ok: false, reason: '未知字段类型：' + localType };
  const entry = TENCENT_CELL_BY_NAME[map.tencent];
  // 腾讯把「数字」映射成 tencent:'number'、文本 'text'；date/bool/enum 映射成 date/checkbox/select，
  // 这三个在写入侧未验证但仍在 TENCENT_CELL_BY_NAME 里（verified:false）。
  if (!entry) return { ok: false, reason: '腾讯无对应写入类型：' + map.tencent };
  return { ok: true, name: map.tencent, verified: entry.verified, note: entry.note };
}

/**
 * 把（清单类型, 值）转成腾讯 CellValue（{text}/{number}/{link}）。
 * 只对已验证的 text/number 直接构造；未验证类型也按名字构造（由调用方在 unverifiedTypes 标注、
 * 并由 --live 把关），未知类型抛错（不静默回退 text）。
 */
function toTencentCell(localType, value) {
  const r = resolveTencentType(localType);
  if (!r.ok) throw new Error(r.reason);
  if (r.name === 'text') return { text: String(value) };
  if (r.name === 'number') return { number: Number(value) };
  // date/checkbox/select：写入形态未验证，这里不编造具体结构，统一以 text 承载原值 +
  // 由 plan.unverifiedTypes 标记、由 --live 拒绝（绝不静默当已验证通过）。
  return { text: String(value) };
}

/** 腾讯 V2 建表回包成功判据：HTTP 200 且顶层 ret==0（不是 code==0）。 */
function isV2Success(json) {
  return !!json && typeof json.ret === 'number' && json.ret === 0;
}

/** 腾讯 V3 batchUpdate 成功判据：官方无 code==0 逐字依据 → 只认 HTTP 200。 */
function isV3Success(status, _json) {
  return status === 200;
}

/** 从建表回包取文件 ID：只认 data.ID（大写、含字面 $），不回退 data.fileId/data.id。 */
function extractFileId(json) {
  if (!json || !json.data || typeof json.data.ID !== 'string' || !json.data.ID) {
    return { ok: false, reason: '建表回包缺 data.ID（腾讯文件 ID 键名是大写 ID，形如 300000000$XXXX）' };
  }
  return { ok: true, fileId: json.data.ID };
}

/**
 * V3 查 sheet 回包判定（纯函数、可单测）：端点 GET .../files/{fileId}?concise=1
 * 直出 {properties:[{sheetId,...}]} —— **无 ret 字段**，不能用 isV2Success 判。
 * 只认 HTTP 200，成功与否由 properties[].sheetId 提取判定。
 * @return {ok:true, sheetId} | {ok:false, failed:{step:'查sheet',...}}
 */
function classifySheetResponse(status, json) {
  if (status !== 200) {
    return { ok: false, failed: { step: '查sheet', httpStatus: status, json: json } };
  }
  const props = (json && ((json.data && json.data.properties) || json.properties)) || [];
  if (!props.length || !props[0].sheetId) {
    return { ok: false, failed: { step: '查sheet', msg: '回包未含 properties[].sheetId' } };
  }
  return { ok: true, sheetId: props[0].sheetId };
}

/**
 * 纯函数：把主表结构 + 选项落成腾讯四段请求计划。
 * @param table {columns:[name], types:{name→localType}, rows:[{...}]}
 * @param opts  {title?:string, chunkSize?:number, wantsFormula?:boolean}
 *   chunkSize：单个 batchUpdate 请求里 updateRangeRequest 的最大个数，默认 5（票 #7 硬限 <=5）。
 * @return {ok, steps:[...], errors:[], unverifiedTypes:[...], chunks:[{requests:[...]}]}
 */
function buildTencentPlan(table, opts) {
  opts = opts || {};
  const errors = [];
  if (!table || !Array.isArray(table.columns) || table.columns.length === 0) {
    errors.push({ field: 'columns', reason: '主表至少要有主键一列才能建腾讯表' });
    return { ok: false, steps: [], errors: errors };
  }
  // 不静默降级：腾讯写值无公式字段，若要写公式直接拒（绝不算成值或编造字段）。
  if (opts.wantsFormula) {
    errors.push({ field: 'formula', reason: '腾讯文档在线表格的 CellValue 无公式字段（只能写 text/number/link），无法写公式' });
    return { ok: false, steps: [], errors: errors };
  }

  const columns = table.columns;
  const types = table.types || {};
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const title = opts.title || 'workbench-table';
  const chunkSize = Math.max(1, Math.min(5, opts.chunkSize || 5));

  // 先解析所有列类型：未知类型记 error、整计划 fail；未验证类型收进 unverifiedTypes。
  const unverifiedTypes = [];
  const colTypes = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const r = resolveTencentType(types[col]);
    if (!r.ok) { errors.push({ field: col, reason: r.reason }); continue; }
    if (!r.verified) unverifiedTypes.push({ field: col, type: r.name, note: r.note });
    colTypes[col] = r.name;
  }
  if (errors.length) return { ok: false, steps: [], errors: errors };

  // 组装写值的「整块网格」：第 0 行是表头，第 1..N 行是数据。逐个单元格转 CellValue。
  // 网格按行铺满（官方示例连续填满 4 个 values），每行 values 数 = columns.length。
  const allCells = []; // [{r,c,cellValue}]
  const gridRows = []; // 每行 [{cellValue}]
  const headerRow = columns.map(function (col) { return { cellValue: { text: String(col) } }; });
  gridRows.push(headerRow);
  rows.forEach(function (row) {
    const line = columns.map(function (col) {
      const v = row[col];
      const ct = colTypes[col];
      if (v === undefined || v === '') return { cellValue: { text: '' } };
      return { cellValue: toTencentCell(types[col], v) };
    });
    gridRows.push(line);
  });

  // 按 chunkSize 把「连续若干行」拆成多个 updateRangeRequest：
  // 每个 request 的 gridData.startRow 递增，rows 取该块的行。每块 requests 数恒为 1，
  // 但多个块放进同一个 batchUpdate 时受 <=5 限制 → 故再按 chunkSize(<=5) 分批「每次请求」。
  const requestsAll = [];
  for (let start = 0; start < gridRows.length; start += chunkSize) {
    const slice = gridRows.slice(start, start + chunkSize);
    requestsAll.push({
      updateRangeRequest: {
        sheetId: '{sheetId}',
        gridData: {
          startRow: start,
          startColumn: 0,
          rows: slice
        }
      }
    });
  }
  // 再把 requestsAll 切成「每次 batchUpdate 请求 <=5 个操作」的多份（chunks）。
  const chunks = [];
  for (let i = 0; i < requestsAll.length; i += 5) {
    chunks.push({ requests: requestsAll.slice(i, i + 5) });
  }

  const steps = [];
  // Step 1：建表（V2，表单 body，回 ret/msg/data.ID）
  steps.push({
    step: '建表',
    method: 'POST',
    url: DRIVE_V2,
    contentType: 'application/x-www-form-urlencoded',
    bodyString: 'type=sheet&title=' + encodeURIComponent(title),
    auth: AUTH_PLACEHOLDER
  });
  // Step 2：查 sheet（GET .../files/{fileId}?concise=1，回 properties[].sheetId）
  steps.push({
    step: '查sheet',
    method: 'GET',
    url: SPREAD_V3 + '/{fileId}?concise=1',
    auth: AUTH_PLACEHOLDER
  });
  // Step 3：写值（POST .../files/{fileId}/batchUpdate，JSON body，requests<=5）
  // 注意：单次 batchUpdate 的 requests 数量必须 <=5，行数多时会被切成多个 chunks。
  // `steps` 里的 `写值` 只是「需要做一次写值请求」的声明，**不含**完整负载；
  // 真正的写入负载以 `chunks[]` 为准（每个 chunk 各发一次 batchUpdate）。
  // 消费者切勿只读 steps['写值'].body.requests 而漏掉其余 chunks（否则会静默丢行）。
  steps.push({
    step: '写值',
    method: 'POST',
    url: SPREAD_V3 + '/{fileId}/batchUpdate',
    contentType: 'application/json',
    body: { requests: chunks[0].requests },
    multiChunk: chunks.length > 1,
    chunkCount: chunks.length,
    auth: AUTH_PLACEHOLDER
  });
  // Step 4：读回（GET .../{fileId}/{sheetId}/{range}，A1 表示法）
  const lastRow = gridRows.length; // 数据行数（含表头）
  const lastCol = columns.length;
  const range = 'A1:' + columnLetter(lastCol) + lastRow;
  steps.push({
    step: '读回',
    method: 'GET',
    url: SPREAD_V3 + '/{fileId}/{sheetId}/{range}',
    body: undefined,
    range: range,
    auth: AUTH_PLACEHOLDER
  });

  return { ok: true, steps: steps, errors: [], unverifiedTypes: unverifiedTypes, chunks: chunks, range: range };
}

// 列号 → A1 列字母（1-based：1→A、2→B、27→AA）
function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * 纯函数：用内存 stub 回放整个腾讯请求计划（不触网、不碰真实凭据）。
 * stub 模拟服务端：建表→回 data.ID（含字面 $）；查 sheet→回 sheetId；写值→HTTP 200；
 * 读回→回写入的行（模拟服务端持久化后读回逐行一致）。
 * @param opts {failStep?:string, ret?:number, msg?:string, httpStatus?:number}
 */
function runTencentPlanWithStub(plan, opts) {
  opts = opts || {};
  if (!plan || !plan.ok) return { ok: false, failed: { step: 'plan', msg: '请求计划非法' } };

  let fileId = null;
  let sheetId = null;
  let wroteRows = [];

  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    if (opts.failStep && s.step === opts.failStep) {
      return { ok: false, failed: { step: s.step, ret: opts.ret === undefined ? -1 : opts.ret, msg: opts.msg || 'stub 指定失败' } };
    }
    if (s.step === '建表') {
      fileId = '300000000$STUBFILEID'; // 含字面 $，模拟真实回包形态
      continue;
    }
    if (s.step === '查sheet') {
      sheetId = 'STUBSHEET1';
      continue;
    }
    if (s.step === '写值') {
      // 把 chunks 里所有 updateRangeRequest 的 rows 摊平回记录（跳过表头行 row0）
      const allReqs = [];
      (plan.chunks || []).forEach(function (ch) { allReqs.push.apply(allReqs, ch.requests); });
      const rows = [];
      allReqs.forEach(function (req) {
        const urr = req.updateRangeRequest;
        urr.gridData.rows.forEach(function (line, idxNow) {
          const absRow = urr.gridData.startRow + idxNow;
          if (absRow === 0) return; // 表头
          const obj = {};
          line.forEach(function (cell, ci) {
            const cv = cell.cellValue || {};
            const val = cv.text !== undefined ? cv.text : (cv.number !== undefined ? cv.number : '');
            obj[ci] = val;
          });
          rows.push({ absRow: absRow, cells: obj });
        });
      });
      rows.sort(function (a, b) { return a.absRow - b.absRow; });
      wroteRows = rows;
      continue;
    }
    if (s.step === '读回') {
      // stub 读回：按列顺序还原成 {col:val}
      const columns = [];
      // 从 plan.steps 拿不到列名，改用第一条 updateRangeRequest 的 rows[0]（表头）还原列名
      const allReqs = [];
      (plan.chunks || []).forEach(function (ch) { allReqs.push.apply(allReqs, ch.requests); });
      allReqs[0].updateRangeRequest.gridData.rows[0].forEach(function (cell) {
        columns.push(cell.cellValue.text);
      });
      const readBack = wroteRows.map(function (r) {
        const o = {};
        columns.forEach(function (c, ci) { o[c] = r.cells[ci]; });
        return o;
      });
      return { ok: true, fileId: fileId, sheetId: sheetId, readBack: readBack };
    }
  }
  return { ok: false, failed: { step: 'plan', msg: '计划缺少读回步骤' } };
}

// 把请求计划 URL 里的占位符替换为运行时真实值（fileId/sheetId/range）。
// 关键：绝不能用 String.replace(str, realValue) —— 真实 fileId 形如 `300000000$XXXX` 含 `$`，
// `$&`/`$$`/`$n` 会被当作特殊替换模式而损坏 URL。用替换函数（返回值按字面处理）保证原样拼接。
function buildTencentUrl(url, ctx) {
  return String(url)
    .replace('{fileId}', function () { return (ctx && ctx.fileId) || ''; })
    .replace('{sheetId}', function () { return (ctx && ctx.sheetId) || ''; })
    .replace('{range}', function () { return encodeURIComponent((ctx && ctx.range) || ''); });
}

module.exports = {
  TENCENT_CELL_BY_NAME,
  resolveTencentType,
  toTencentCell,
  isV2Success,
  isV3Success,
  extractFileId,
  classifySheetResponse,
  buildTencentPlan,
  runTencentPlanWithStub,
  buildTencentUrl,
  columnLetter
};
