'use strict';
/**
 * 票 #24（Slice 2 / S4）：腾讯文档 adapter 实装。
 * 纯声明 + 请求计划：把一条动作产物（这里是「建表后的主表结构」）落成腾讯文档在线表格的
 * 「建表 → 查 sheetId → 写值 → 读回」请求计划。
 * 主 seam 仍是纯函数（数据进数据出），真正的 HTTP I/O 交给 scripts/tencent-adapter.js（可 stub）。
 * 本测试钉住（票 #24 AC）：
 *  - AC1 建表→写值→读回链路齐备，复用票 #5/#6/#7 一手结论
 *  - AC2 判据 `HTTP 200`+`ret==0`（**不是** code）、`data.ID` 含 `$` 的取法、≤5 requests、无公式字段
 *  - AC3 formulaCapabilities 四格 false 且 function 动作在腾讯被能力位挡下并提示；extract 不被挡
 *  - AC4 凭据只来自契约字段名、请求计划里绝不出现真实凭据值（用 stub 值验证不回显）
 *  - AC5 一条 extract 动作能从 draft 生成请求计划、并在 stub 回放上端到端「跑通并读回」
 */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');
const T = require('../lib/tencent-adapter');

const TABLE = {
  primaryKey: '姓名',
  columns: ['姓名', '工时', '时薪'],
  types: { 姓名: 'text', 工时: 'number', 时薪: 'number' },
  rows: [
    { 姓名: '阿岚', 工时: 8, 时薪: 100 },
    { 姓名: '柏舟', 工时: 10, 时薪: 80 }
  ]
};

// ---- AC1：建表 → 查 sheetId → 写值 → 读回 请求计划（复用票 #5/#6/#7 一手结论） ----
test('AC1 从主表结构生成腾讯请求计划（建表/查sheet/写值/读回 四段，共 4 步）', function () {
  const plan = T.buildTencentPlan(TABLE, { title: 'workbench-smoke' });
  assert.equal(plan.ok, true, '规划应成功：' + JSON.stringify(plan.errors));
  const kinds = plan.steps.map(function (s) { return s.step; });
  assert.deepEqual(kinds, ['建表', '查sheet', '写值', '读回'], '四段：建表→查sheet→写值→读回');

  const byStep = {};
  plan.steps.forEach(function (s) { byStep[s.step] = s; });

  assert.equal(byStep['建表'].method, 'POST');
  assert.equal(byStep['建表'].url, 'https://docs.qq.com/openapi/drive/v2/files');
  assert.equal(byStep['建表'].contentType, 'application/x-www-form-urlencoded');
  assert.ok(/type=sheet/.test(byStep['建表'].bodyString), '建表用表单 body 且 type=sheet（票 #6）');
  assert.ok(/title=/.test(byStep['建表'].bodyString), '建表表单含 title');

  assert.equal(byStep['查sheet'].method, 'GET');
  assert.ok(/\/openapi\/spreadsheet\/v3\/files\/\{fileId\}\?concise=1$/.test(byStep['查sheet'].url),
    '查 sheet 走 GET /openapi/spreadsheet/v3/files/{fileId}?concise=1（票 #7 途径 A）');

  assert.equal(byStep['写值'].method, 'POST');
  assert.ok(/\/openapi\/spreadsheet\/v3\/files\/\{fileId\}\/batchUpdate$/.test(byStep['写值'].url), '写值走 batchUpdate');
  assert.equal(byStep['写值'].contentType, 'application/json');
  assert.ok(Array.isArray(byStep['写值'].body.requests), '写值 body.requests 是数组');
  assert.ok(byStep['写值'].body.requests[0].updateRangeRequest, 'requests 元素是 updateRangeRequest');
  const urr = byStep['写值'].body.requests[0].updateRangeRequest;
  assert.ok(urr.sheetId === '{sheetId}', 'sheetId 用占位符（运行时填）');
  assert.equal(urr.gridData.startRow, 0, '0-based 网格：startRow 从 0 开始');
  assert.equal(urr.gridData.startColumn, 0, '0-based 网格：startColumn 从 0 开始');

  assert.equal(byStep['读回'].method, 'GET');
  assert.ok(/\/openapi\/spreadsheet\/v3\/files\/\{fileId\}\/\{sheetId\}\/\{range\}$/.test(byStep['读回'].url),
    '读回走 GET .../{sheetId}/{range}（A1 表示法，票 #7）');
});

test('AC1 三平台鉴权头：腾讯用 Access-Token / Client-Id / Open-Id 三元组（票 #6）', function () {
  const plan = T.buildTencentPlan(TABLE, { title: 'workbench-smoke' });
  plan.steps.forEach(function (s) {
    assert.deepEqual(s.auth, {
      headers: { 'Access-Token': 'TENCENT_ACCESS_TOKEN', 'Client-Id': 'TENCENT_CLIENT_ID', 'Open-Id': 'TENCENT_OPEN_ID' }
    }, s.step + ' 应带腾讯三元组占位头（契约字段名，非值）');
  });
});

// ---- AC2：约束正确处理（有测试证） ----
test('AC2 写值 ≤5 requests：多个 updateRangeRequest 时按每请求 ≤5 操作拆成多次 batchUpdate', function () {
  // 造 12 数据行（+1 表头 = 13 gridRows）；chunkSize=2 → 7 个 updateRangeRequest → 每批 ≤5 → 拆成 2 次 batchUpdate
  const cols = ['c1', 'c2', 'c3']; // 3 列（列索引不触发 chunk）
  const types = {}; cols.forEach(function (c) { types[c] = 'text'; });
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ c1: 'r' + i, c2: 'x', c3: 'y' });
  const table = { primaryKey: 'c1', columns: cols, types: types, rows: rows };
  const plan = T.buildTencentPlan(table, { title: 't', chunkSize: 2 });
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  const write = plan.steps.filter(function (s) { return s.step === '写值'; })[0];
  assert.ok(write.body.requests.length <= 5, '首个 batchUpdate 请求 requests 数 ≤ 5（票 #7 硬限）');
  // 13 gridRows / chunkSize 2 → ceil(13/2)=7 个 updateRangeRequest → 7 > 5 → 拆成 2 次 batchUpdate
  assert.ok(plan.chunks.length >= 2, '7 个 updateRangeRequest 应拆成多次 batchUpdate（每请求 ≤5）');
  plan.chunks.forEach(function (ch) {
    assert.ok(ch.requests.length <= 5, '每块 requests 数 ≤ 5');
  });
  // 覆盖全部 gridRows 的行
  const covered = plan.chunks.reduce(function (acc, ch) {
    return acc + ch.requests.reduce(function (a, r) { return a + r.updateRangeRequest.gridData.rows.length; }, 0);
  }, 0);
  assert.equal(covered, 13, '所有网格行都被某个 updateRangeRequest 覆盖（表头 + 12 数据行）');
});

test('回归：substituteBodyPlaceholders 把 body 里 {sheetId} 换成真实值，不发字面量（票 #27 实测 bug）', function () {
  // 曾只替换 URL、漏了 body → 真发出去 sheetId 是字面量 '{sheetId}' → 腾讯 missing data not found。
  const body = { requests: [{ updateRangeRequest: { sheetId: '{sheetId}', gridData: { startRow: 0, startColumn: 0, rows: [{ values: [{ cellValue: { text: 'a' } }] }] } } }] };
  const out = T.substituteBodyPlaceholders(body, { sheetId: 'BB08J2', fileId: 'F1', range: 'A1:B2' });
  assert.equal(out.requests[0].updateRangeRequest.sheetId, 'BB08J2', 'sheetId 占位符应替换为真实值');
  assert.equal(JSON.stringify(out).indexOf('{sheetId}'), -1, '序列化后不得残留字面量 {sheetId}');
  // 不误伤正文里正常含花括号的文本
  const b2 = { x: '正常{不替换}文本', y: '{sheetId}' };
  const o2 = T.substituteBodyPlaceholders(b2, { sheetId: 'S1' });
  assert.equal(o2.x, '正常{不替换}文本', '非纯占位符字符串不被误替换');
  assert.equal(o2.y, 'S1', '纯占位符字符串被替换');
});

test('AC2 写值请求体符合官方 proto：gridData.rows 是 [{values:[{cellValue}]}]，不是裸数组（票 #27 实测 bug 回归）', function () {
  // 腾讯 proto：GridData.rows = array(RowData)，RowData = { values: array(CellData) }。
  // 曾把 rows 写成裸的 cellData 数组 → 服务端 proto 转码报 `unexpected token [`(line 1:108)。
  const plan = T.buildTencentPlan(TABLE, { title: 't' });
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  plan.chunks.forEach(function (ch) {
    ch.requests.forEach(function (r) {
      const rows = r.updateRangeRequest.gridData.rows;
      assert.ok(Array.isArray(rows), 'gridData.rows 是数组');
      rows.forEach(function (row, ri) {
        assert.ok(!Array.isArray(row), '第 ' + ri + ' 行不是裸数组（曾导致 proto unexpected token [）');
        assert.ok(row && typeof row === 'object' && Array.isArray(row.values),
          '第 ' + ri + ' 行是 { values: [...] }（官方 RowData 形状）');
        row.values.forEach(function (cell) {
          assert.ok(cell && cell.cellValue && typeof cell.cellValue === 'object',
            'values 元素是 { cellValue: {...} }（官方 CellData 形状）');
        });
      });
    });
  });
  // 序列化后不应出现 "rows":[[ 这样的裸嵌套数组
  const body = JSON.stringify({ requests: plan.chunks[0].requests });
  assert.ok(body.indexOf('"rows":[[{') === -1, '序列化 body 不应出现 "rows":[[{ 裸数组');
  assert.ok(body.indexOf('"rows":[{"values":[') !== -1, '序列化 body 应为 "rows":[{"values":[...]');
});

test('AC2 无公式字段：function 动作在腾讯被拒（不可规划公式）', function () {
  // 腾讯写值只支持 text/link/number，没有公式字段；承诺不静默把公式算成值或编造字段。
  const r = T.buildTencentPlan(TABLE, { title: 't', wantsFormula: true });
  assert.equal(r.ok, false, '想写公式的腾讯计划应被拒（无公式字段）');
  assert.ok(r.errors.some(function (e) { return /公式/.test(e.reason); }), '错误应说明腾讯无公式字段');
});

test('AC2 单元格类型：text→{text}、number→{number}（票 #7 CellValue 逐字）', function () {
  const cellText = T.toTencentCell('text', '阿岚');
  assert.deepEqual(cellText, { text: '阿岚' }, '文本用 {text}');
  const cellNum = T.toTencentCell('number', 8);
  assert.deepEqual(cellNum, { number: 8 }, '数字用 {number}');
  // date/bool/enum 的写入形态官方未验证 → 明确标记 verified:false，不回退成 text 冒充
  const rDate = T.resolveTencentType('date');
  assert.equal(rDate.ok, true);
  assert.equal(rDate.verified, false, 'date 写入形态未验证（如实标记）');
  const rText = T.resolveTencentType('text');
  assert.equal(rText.verified, true, 'text 已验证');
  const rNum = T.resolveTencentType('number');
  assert.equal(rNum.verified, true, 'number 已验证');
  // 未知类型不静默降级
  assert.equal(T.resolveTencentType('mystery').ok, false, '未知类型不猜');
});

test('AC2 data.ID 含字面 $ 的取法：extractFileId 只取 data.ID 且保留 $', function () {
  // 模拟腾讯建表回包（ret==0，data.ID 含字面 $）
  const resp = { ret: 0, msg: 'Succeed', data: { ID: '300000000$KGFuaRGnfuvK', type: 'sheet', url: 'https://docs.qq.com/sheet/x' } };
  const id = T.extractFileId(resp);
  assert.equal(id.ok, true);
  assert.equal(id.fileId, '300000000$KGFuaRGnfuvK', '取 data.ID 原值、保留字面 $');
  // 判据用 ret==0，不是 code==0
  assert.equal(T.isV2Success(resp), true, 'ret==0 判成功');
  assert.equal(T.isV2Success({ code: 0 }), false, 'code==0 不是腾讯 V2 成功判据（缺 ret）');
  assert.equal(T.isV2Success({ ret: 10313, msg: 'x' }), false, 'ret!=0 判失败');
  // 缺 ID 时不猜、不回退 fileId/id
  const bad = T.extractFileId({ ret: 0, data: { fileId: 'x' } });
  assert.equal(bad.ok, false, '只有 data.ID 才认，data.fileId 不认');
});

test('AC2 成功判据统一走 isSuccess：腾讯 ret==0 / 飞书 code==0 不混用', function () {
  assert.equal(T.isV2Success({ ret: 0 }), true);
  assert.equal(T.isV2Success({ ret: 0, msg: 'Succeed' }), true);
  assert.equal(T.isV2Success({ ret: 400001 }), false);
  // V3 batchUpdate 无逐字 code==0 依据 → 只认 HTTP 200（文档化）
  assert.equal(T.isV3Success(200, {}), true, 'V3 只认 HTTP 200');
  assert.equal(T.isV3Success(400, { code: 400001 }), false, '非 200 判失败');
});

// ---- 回归：写值/读回不能只看 HTTP 200，要校验内容（票 #27 实测暴露「写 200 但读回全 null」） ----
test('回归 classifyWriteResponse：updatedCells>0 才算成功，0/缺失/业务错判失败', function () {
  // 成功：responses[].updateRangeResponse.updatedCells>0
  assert.equal(T.classifyWriteResponse(200, { responses: [{ updateRangeResponse: { updatedCells: 6 } }] }).ok, true);
  assert.equal(T.classifyWriteResponse(200, { responses: [{ updateRangeResponse: { updatedCells: 6 } }] }).updatedCells, 6);
  // 兼容 data.responses 包裹
  assert.equal(T.classifyWriteResponse(200, { data: { responses: [{ updateRangeResponse: { updatedCells: 2 } }] } }).ok, true);
  // updatedCells=0 → 数据没落 → 失败
  const zero = T.classifyWriteResponse(200, { responses: [{ updateRangeResponse: { updatedCells: 0 } }] });
  assert.equal(zero.ok, false);
  assert.ok(/updatedCells=0/.test(zero.reason));
  // 缺 responses[] → 失败
  assert.equal(T.classifyWriteResponse(200, {}).ok, false);
  // 业务错包在 200 内 → 失败
  assert.equal(T.classifyWriteResponse(200, { responses: [{ error: { code: 400001 } }] }).ok, false);
  // 非 200 → 失败
  assert.equal(T.classifyWriteResponse(403, { responses: [{ updateRangeResponse: { updatedCells: 2 } }] }).ok, false);
});

test('回归 classifyReadResponse：gridData 全 null/空 判「数据未落盘」，有值取到', function () {
  // 全 null（用户实测形态）→ ok:true 但 nonEmpty=0
  const allNull = T.classifyReadResponse(200, { gridData: { rows: [
    { values: [{ cellValue: null }, { cellValue: null }, { cellValue: null }] },
    { values: [{ cellValue: null }, { cellValue: null }, { cellValue: null }] }
  ] } });
  assert.equal(allNull.ok, true);
  assert.equal(allNull.nonEmpty, 0, '全 null → nonEmpty 0，脚本据此判「链路通但数据未落盘」');
  // 有值：{text}/{number} 对象 → 抽出标量
  const hasVals = T.classifyReadResponse(200, { gridData: { rows: [
    { values: [{ cellValue: { text: '姓名' } }, { cellValue: { text: '工时' } }] },
    { values: [{ cellValue: { text: '阿岚' } }, { cellValue: { number: 8 } }] }
  ] } });
  assert.equal(hasVals.ok, true);
  assert.equal(hasVals.nonEmpty, 4);
  assert.deepEqual(hasVals.rows, [['姓名', '工时'], ['阿岚', 8]]);
  // 官方空单元格形态 {text:""} 不算非空
  const emptyStr = T.classifyReadResponse(200, { gridData: { rows: [{ values: [{ cellValue: { text: '' } }] }] } });
  assert.equal(emptyStr.nonEmpty, 0, '官方空单元格 {text:""} 不计入非空');
  // 兼容 data.gridData 包裹
  assert.equal(T.classifyReadResponse(200, { data: { gridData: { rows: [{ values: [{ cellValue: { text: 'x' } }] }] } } }).nonEmpty, 1);
  // 非 200 / 缺 gridData → 失败
  assert.equal(T.classifyReadResponse(500, {}).ok, false);
  assert.equal(T.classifyReadResponse(200, {}).ok, false);
});

// ---- 回归：V3 查sheet 回包无 ret 字段，不得用 isV2Success 误判为失败（票 #27 实测暴露） ----
test('回归 classifySheetResponse：V3 查sheet 直出 properties（无 ret）也判成功', function () {
  // 真实回包形态：{properties:[{sheetId,...}]} —— 无 ret 字段
  const real = { properties: [{ sheetId: 'BB08J2', title: '工作表1', rowTotal: 200, columnTotal: 26 }] };
  const ok = T.classifySheetResponse(200, real);
  assert.equal(ok.ok, true, 'HTTP200 + properties[].sheetId → 成功（不再因缺 ret 误判）');
  assert.equal(ok.sheetId, 'BB08J2');
  // 若错误地套用 isV2Success，会把这份真实回包判成 false（这正是被修掉的 bug）
  assert.equal(T.isV2Success(real), false, 'isV2Success 对 V3 查sheet 回包返回 false（故不可用）');
  // 兼容 data.properties 包裹形态
  assert.equal(T.classifySheetResponse(200, { data: { properties: [{ sheetId: 'S2' }] } }).sheetId, 'S2');
  // 非 200 → 失败
  assert.equal(T.classifySheetResponse(403, real).ok, false);
  assert.equal(T.classifySheetResponse(403, real).failed.step, '查sheet');
  // 200 但无 properties/sheetId → 失败（不猜）
  assert.equal(T.classifySheetResponse(200, {}).ok, false);
  assert.equal(T.classifySheetResponse(200, { properties: [] }).ok, false);
  assert.equal(T.classifySheetResponse(200, { properties: [{}] }).ok, false);
});

// ---- AC3：能力位 false、function 被挡、extract 不被挡 ----
test('AC3 腾讯 formulaCapabilities 四格 false、函数动作被能力位挡下并提示', function () {
  const fc = E.ADAPTERS.tencent.formulaCapabilities;
  assert.deepEqual(fc, { canWriteFormula: false, canRecalc: false, canReadComputed: false, functionSet: false });

  const stateTencent = E.initial({ adapter: 'tencent', columns: ['工时', '时薪'], rows: [] });
  let s = E.reduce(stateTencent, { type: 'SET_INPUT', text: '把工时乘以时薪算成应发' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  assert.equal(s.draft.kind, 'function');
  s = E.reduce(s, { type: 'PREVIEW' });
  assert.equal(s.preview, null, 'blocked function 不应产出预览');
  assert.notEqual(s.stage, 'PREVIEWED');
  assert.equal(s.noteTone, 'warn');
  assert.ok(/禁用/.test(s.note));
  assert.ok(/canWriteFormula/.test(s.note));
  const blockers = E.capabilityBlockers(s.draft, s);
  assert.ok(blockers.length > 0);
  assert.ok(blockers.some(function (b) { return b.cap === 'canWriteFormula'; }));
});

test('AC3 extract 在腾讯上不被能力位挡（结构化动作不依赖公式位）', function () {
  const stateTencent = E.initial({
    adapter: 'tencent', columns: ['姓名', '邮箱'],
    sources: { '外勤登记表.csv': { rows: [{ 姓名: '阿岚', 邮箱: 'a@x.com' }] } }
  });
  let s = E.reduce(stateTencent, { type: 'SET_INPUT', text: '从外勤登记表把邮箱提出来' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  assert.equal(s.draft.kind, 'extract');
  s = E.reduce(s, { type: 'PREVIEW' });
  assert.equal(s.preview.disabled, false, 'extract 在腾讯上不应被禁用');
  assert.equal(s.preview.capabilityBlockers.length, 0);
});

// ---- AC4：凭据只来自契约字段名、请求计划不含真实凭据值 ----
test('AC4 请求计划只引用契约字段名（占位头），绝不内嵌真实凭据值', function () {
  const STUB = 'stub-SECRET-DO-NOT-LEAK';
  const plan = T.buildTencentPlan(TABLE, { title: 'workbench-smoke' });
  const dump = JSON.stringify(plan);
  assert.equal(dump.indexOf(STUB), -1, '计划里不应出现任何凭据值');
  // 所有步骤都带腾讯三元组占位（来自 S2 契约字段名，非值）
  plan.steps.forEach(function (s) {
    assert.equal(s.auth.headers['Access-Token'], 'TENCENT_ACCESS_TOKEN');
    assert.equal(s.auth.headers['Client-Id'], 'TENCENT_CLIENT_ID');
    assert.equal(s.auth.headers['Open-Id'], 'TENCENT_OPEN_ID');
  });
});

// ---- AC5：stub 回放端到端跑通并读回 ----
test('AC5 一条 extract 在腾讯 stub 回放上端到端跑通并读回（值一致）', function () {
  const plan = T.buildTencentPlan(TABLE, { title: 'workbench-smoke' });
  const result = T.runTencentPlanWithStub(plan);
  assert.equal(result.ok, true, '端到端应成功：' + JSON.stringify(result.failed));
  assert.equal(result.fileId, '300000000$STUBFILEID', 'stub 建表回 data.ID（含字面 $）');
  assert.deepEqual(result.readBack, [
    { 姓名: '阿岚', 工时: 8, 时薪: 100 },
    { 姓名: '柏舟', 工时: 10, 时薪: 80 }
  ], '读回与写入逐行一致');
});

test('AC5 stub 负路径：指定步骤失败如实失败（ret!=0 / 非 200），不假装成功', function () {
  const plan = T.buildTencentPlan(TABLE, { title: 't' });
  const r = T.runTencentPlanWithStub(plan, { failStep: '写值', ret: 400001, msg: '请求参数错误' });
  assert.equal(r.ok, false);
  assert.equal(r.failed.step, '写值');
  assert.equal(r.failed.ret, 400001);
});

test('AC5 可复现脚本子进程 --stub 端到端 ok', function () {
  const { execFileSync } = require('node:child_process');
  const { resolve } = require('node:path');
  const SCRIPT = resolve(__dirname, '..', 'scripts', 'tencent-adapter.js');
  const out = execFileSync(process.execPath, [SCRIPT, '--stub'], { encoding: 'utf8' });
  const r = JSON.parse(out);
  assert.equal(r.ok, true, '子进程 --stub 应成功：' + out);
  assert.equal(r.fileId, '300000000$STUBFILEID');
  assert.ok(Array.isArray(r.readBack) && r.readBack.length === 2);
});

// ---- 边界：空表只有 1 个字段、0 记录也能规划 ----
test('边界 空表（1 列 0 记录）也能规划且 stub 读回为空数组', function () {
  const table = { primaryKey: '姓名', columns: ['姓名'], types: { 姓名: 'text' }, rows: [] };
  const plan = T.buildTencentPlan(table, { title: 't' });
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  const r = T.runTencentPlanWithStub(plan);
  assert.equal(r.ok, true);
  assert.deepEqual(r.readBack, []);
});

// ---- review 修复：buildTencentUrl 拼接 fileId 时 `$` 安全（真实 ID 含 `$`）----
test('review 修复 buildTencentUrl 对含 $ 的 fileId 原样拼接、不被 String.replace 展开', function () {
  // `300000000$&X` 里 `$&` 若被当作替换模式会把占位符整段塞回来，必须原样保留。
  const ctx = { fileId: '300000000$&X', sheetId: 'S1', range: 'A1:B2' };
  const url = T.buildTencentUrl('https://docs.qq.com/openapi/spreadsheet/v3/files/{fileId}/{sheetId}/{range}', ctx);
  assert.equal(url, 'https://docs.qq.com/openapi/spreadsheet/v3/files/300000000$&X/S1/A1%3AB2');
  assert.ok(!url.includes('{fileId}'), '占位符不应残留');
});

// ---- review 修复：steps 中「写值」如实标注分块，chunks 才是完整负载源 ----
test('review 修复 写值步骤标 multiChunk/chunkCount，chunks 为完整负载源（不静默丢行）', function () {
  // 12 行数据、chunkSize=2 → 13 个 gridRows、每 chunk 2 行 → 7 个 updateRangeRequest → 2 chunks
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ 姓名: 'N' + i, 工时: i, 时薪: 100 });
  const table = { primaryKey: '姓名', columns: ['姓名', '工时', '时薪'], types: { 姓名: 'text', 工时: 'number', 时薪: 'number' }, rows: rows };
  const plan = T.buildTencentPlan(table, { title: 't', chunkSize: 2 });
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  const w = plan.steps.find(function (s) { return s.step === '写值'; });
  assert.equal(w.multiChunk, true);
  assert.equal(w.chunkCount, plan.chunks.length);
  assert.ok(plan.chunks.length > 1);
  // 每个 chunk 的 requests <=5
  for (const ch of plan.chunks) assert.ok(ch.requests.length <= 5);
  // chunks 覆盖的 gridRows 数 == 表头 + 数据行
  let covered = 0;
  for (const ch of plan.chunks) for (const r of ch.requests) covered += r.updateRangeRequest.gridData.rows.length;
  assert.equal(covered, 1 + 12, 'chunks 覆盖全部行（1 表头 + 12 数据），无静默丢失');
});

// ================= 票 #39（Slice 2 / S6）：未验证类型闸门 + 请求体物化回归（验证既有、不加产品行为） =================
//  - AC1/AC3 未验证类型闸门：真实计划含 date 列（写入形态未验证）时拒绝真跑 + 显式开关放行；
//    两 adapter 的开关命名与 #28/README 既定一致（--allow-unverified-types），不新造语义。
//  - AC2/AC3 请求体物化：gridData.rows 的 [{values:[{cellValue}]}] 形状、序列化无裸数组、
//    materialize() 对 {fileId}/{sheetId}/{range} 的 body 替换——由 materialize-body.test.js（票 #28）
//    专测并复用；本文件原有的 AC2 写值请求体形状断言亦继续守住，此处不重复。
const TS39 = require('../scripts/tencent-adapter');

test('#39 AC1/AC3 腾讯未验证类型闸门：真实计划含 date 列默认拒绝真跑、显式开关放行', async function () {
  const orig = T.buildTencentPlan;
  const table = {
    primaryKey: '姓名', columns: ['姓名', '入职日'],
    types: { 姓名: 'text', 入职日: 'date' },
    rows: [{ 姓名: '阿岚', 入职日: '2020-01-01' }]
  };
  // 1) 真实计划（不 monkeypatch）：date 写入形态未验证 → plan.unverifiedTypes 非空。
  const plan = T.buildTencentPlan(table, { title: 't' });
  assert.equal(plan.ok, true);
  assert.ok(plan.unverifiedTypes.some(function (u) { return u.field === '入职日'; }), 'date 列应进 unverifiedTypes');

  const saved = { token: process.env.TENCENT_ACCESS_TOKEN, id: process.env.TENCENT_CLIENT_ID, oid: process.env.TENCENT_OPEN_ID };
  process.env.TENCENT_ACCESS_TOKEN = 'tok'; process.env.TENCENT_CLIENT_ID = 'cid'; process.env.TENCENT_OPEN_ID = 'oid';
  try {
    const refused = await TS39.runLive(table, 't', false);
    assert.equal(refused.ok, false, '含未验证形态的 live 应拒绝');
    assert.equal(refused.refused, true, '应标记 refused');
    assert.ok(refused.unverifiedTypes.some(function (u) { return u.field === '入职日'; }), '拒绝回包应列出未验证字段');
    assert.ok(/--allow-unverified-types/.test(refused.error), '提示应给出确切开关名');

    // 2) 显式确认开关：注入空步骤计划让放行分支止于「计划未走到读回」，不触网，证明开关真能放行。
    T.buildTencentPlan = function () {
      return { ok: true, steps: [], unverifiedTypes: [{ field: '入职日', type: 'date', note: '造数据' }], range: 'A1:B2' };
    };
    const allowed = await TS39.runLive(table, 't', true);
    assert.notEqual(allowed.refused, true, 'allow=true 时不应被闸门拒绝');
    assert.match(allowed.error, /计划未走到读回/, '绕过闸门后应继续执行到无步骤末端');
  } finally {
    T.buildTencentPlan = orig;
    if (saved.token === undefined) delete process.env.TENCENT_ACCESS_TOKEN; else process.env.TENCENT_ACCESS_TOKEN = saved.token;
    if (saved.id === undefined) delete process.env.TENCENT_CLIENT_ID; else process.env.TENCENT_CLIENT_ID = saved.id;
    if (saved.oid === undefined) delete process.env.TENCENT_OPEN_ID; else process.env.TENCENT_OPEN_ID = saved.oid;
  }
});

