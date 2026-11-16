'use strict';
/**
 * 票 #23（Slice 2 / S3）：飞书 adapter 实装。
 *
 * 职责：把一条动作产物（这里是「建表后的主表结构」）落成飞书多维表格的
 * 「换 tenant_access_token → 建表 → 加字段 → 写记录 → records/search 读回」请求计划。
 *
 * 设计边界（与主 seam 一致、与 local adapter 对称）：
 *  - 本模块是**纯声明**：只产出「请求计划」（method/url/headers/body 的占位描述），
 *    绝不内嵌任何真实凭据值——鉴权 token 只以「取哪个契约字段名」的占位符出现（S2 契约）。
 *  - 真正的 HTTP I/O 交给 scripts/feishu-adapter.js（可对真实飞书或 stub 回放执行）。
 *  - buildFeishuPlan / runFeishuPlanWithStub 都是纯函数（runFeishuPlanWithStub 只吃内存 stub，不触网）。
 *
 * 一手来源（票 #5 已实测链路，见 SMOKE-RUNBOOK.md Step 1-5）：
 *  - Step 1 换 token：POST /open-apis/auth/v3/tenant_access_token/internal，body {app_id, app_secret}，回 tenant_access_token/expire
 *  - Step 2 建表：POST /open-apis/bitable/v1/apps，body {name}，回 data.app.app_token + data.app.default_table_id
 *  - Step 3 加字段：POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields，body {field_name, type}，一次一字段
 *  - Step 4 写记录：POST .../records/batch_create，body {records:[{fields:{...}}]}
 *  - Step 5 读回：POST .../records/search，body {field_names:[...]}，回 data.items
 *  鉴权头：Authorization: Bearer <tenant_access_token>。
 */

const E = require('./engine');

// 飞书字段数字编码表（Bitable「字段类型」的数字常量）。
// 单源原则：本表**只**负责把 engine 的规范类型名（TYPE_MAP[x].feishu = 'text'|'number'|...）
// 映射到飞书 API 需要的数字码，绝不另立一套「清单类型→名字」映射——名字一律取自 engine.TYPE_MAP，
// 避免与主 seam 的第二套来源（Standards HARD 修复）。
//
// 每个数字码带 verified 标记：
//  - number:2 → verified=true（票 #5 实测坐实 TypeNumber=2）
//  - text:1   → verified=false（官方页 SPA 抓不到正文，按 Bitable 字段类型惯例记 1；runbook 未实测 text，未验证）
//  - date:5 / bool:7 / enum:3 → verified=false（未在票 #5 实测、官方页未能取正文核对）
// 未 verified 的数字码**不静默**发出：buildFeishuPlan 仍会把它写进计划（否则含 text 列的表根本规划不出来），
// 但在 `unverifiedTypes[]` 里逐列列出、并由 scripts/feishu-adapter.js 的 --live 在无显式
// `--allow-unverified-types` 时**拒绝真跑**——绝不把未验证 magic number 悄悄塞进真实请求
// （Standards HARD / MEDIUM 修复）。未知类型（TYPE_MAP 无此键）仍直接记 error、不猜。
const FEISHU_CODE_BY_NAME = {
  text:   { code: 1, verified: false, note: '文本；官方页未取到逐字常量，按 Bitable 字段类型惯例记 1（未验证）' },
  number: { code: 2, verified: true,  note: '数字；票 #5 实测 TypeNumber=2' },
  date:   { code: 5, verified: false, note: '日期；未在票 #5 实测、官方页未核对（未验证）' },
  checkbox: { code: 7, verified: false, note: '复选框；未在票 #5 实测、官方页未核对（未验证）' },
  single_select: { code: 3, verified: false, note: '单选；未在票 #5 实测、官方页未核对（未验证）' }
};

// 仅供测试/可读性：把名字级表投影成 { name: code }（保留旧 FEISHU_FIELD_TYPE 的形状，值仍是数字码）。
const FEISHU_FIELD_TYPE = Object.keys(FEISHU_CODE_BY_NAME).reduce(function (acc, name) {
  acc[name] = FEISHU_CODE_BY_NAME[name].code;
  return acc;
}, {});

const BASE = 'https://open.feishu.cn/open-apis';

/**
 * 把清单类型（text/number/date/bool/enum）解析为飞书字段数字码。
 * 单一来源：先用 engine.TYPE_MAP 把清单类型映射成语义名，再查本表的数字码。
 * 不静默降级：TYPE_MAP 里查不到的未知类型 → {ok:false}（调用方记 error、不猜）；
 * 已知但数字码未验证的类型 → {ok:true, verified:false}（可规划，但进 unverifiedTypes 供真跑把关）。
 * @return {ok:true, name, code, verified:boolean, note?} | {ok:false, reason}
 */
function resolveFeishuType(localType) {
  if (!localType) return { ok: false, reason: '缺少字段类型' };
  const map = E.TYPE_MAP[localType];
  if (!map || map.feishu === undefined) return { ok: false, reason: '未知字段类型：' + localType };
  const entry = FEISHU_CODE_BY_NAME[map.feishu];
  if (!entry) return { ok: false, reason: '飞书无对应字段类型：' + map.feishu };
  return { ok: true, name: map.feishu, code: entry.code, verified: entry.verified, note: entry.note };
}

// 兼容旧签名：返回数字码；未知/未验证类型**抛错**而非静默回退 text（不静默降级）。
// 规划路径（buildFeishuPlan）不调它，改用 resolveFeishuType 收集错误；此处保留供测试/工具显式调用。
function toFeishuType(localType) {
  const r = resolveFeishuType(localType);
  if (!r.ok) throw new Error(r.reason);
  return r.code;
}

/**
 * 纯函数：把「建表后的主表结构」+ 选项，落成飞书五步请求计划。
 * @param table {columns:[name], types:{name→localType}, rows:[{...}]}  // 注：不读取 primaryKey，主键列由 columns[0] 隐含
 * @param opts  {appName?:string}
 * @return {ok, steps:[...], errors:[], unverifiedTypes:[{field,type,code,note}]}
 *   - unverifiedTypes：用了未验证飞书字段数字码的列（--live 需显式 --allow-unverified-types 才放行）
 *   step 形状：{ step, method, url, headers, auth?, body?, bodyFrom?, field?, fields? }
 *   - auth = {scheme:'Bearer', tokenFrom:'FEISHU_TENANT_ACCESS_TOKEN'}（占位，不内嵌值）
 *   - bodyFrom = {app_id:'FEISHU_APP_ID', app_secret:'FEISHU_APP_SECRET'}（占位）
 */
function buildFeishuPlan(table, opts) {
  opts = opts || {};
  const errors = [];
  if (!table || !Array.isArray(table.columns) || table.columns.length === 0) {
    errors.push({ field: 'columns', reason: '主表至少要有主键一列才能建飞书表' });
    return { ok: false, steps: [], errors: errors };
  }
  const columns = table.columns;
  const types = table.types || {};
  const appName = opts.appName || 'workbench-table';
  const rows = Array.isArray(table.rows) ? table.rows : [];

  const steps = [];

  // Step 1：换 tenant_access_token
  steps.push({
    step: '换token',
    method: 'POST',
    url: BASE + '/auth/v3/tenant_access_token/internal',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    bodyFrom: { app_id: 'FEISHU_APP_ID', app_secret: 'FEISHU_APP_SECRET' }
  });

  // Step 2：建多维表格（body {name}，回 data.app.app_token + default_table_id）
  steps.push({
    step: '建表',
    method: 'POST',
    url: BASE + '/bitable/v1/apps',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    auth: { scheme: 'Bearer', tokenFrom: 'FEISHU_TENANT_ACCESS_TOKEN' },
    body: { name: appName }
  });

  // Step 3：加字段（一次一字段，POST N 次只换 body）
  // 不静默降级：未知类型记 error 并整计划判 fail（不猜）；
  // 已知但数字码未验证的类型照常写进计划，但逐列收进 unverifiedTypes[]，由 --live 把关（见 scripts）。
  const unverifiedTypes = [];
  columns.forEach(function (col) {
    const r = resolveFeishuType(types[col]);
    if (!r.ok) {
      errors.push({ field: col, reason: r.reason });
      return;
    }
    if (!r.verified) unverifiedTypes.push({ field: col, type: r.name, code: r.code, note: r.note });
    steps.push({
      step: '加字段',
      field: col,
      method: 'POST',
      url: BASE + '/bitable/v1/apps/{app_token}/tables/{table_id}/fields',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      auth: { scheme: 'Bearer', tokenFrom: 'FEISHU_TENANT_ACCESS_TOKEN' },
      body: { field_name: col, type: r.code }
    });
  });
  if (errors.length) return { ok: false, steps: [], errors: errors };

  // Step 4：写记录（batch_create，body {records:[{fields:{col:val}}]}）
  const records = rows.map(function (r) {
    const fields = {};
    columns.forEach(function (c) { if (r[c] !== undefined) fields[c] = r[c]; });
    return { fields: fields };
  });
  steps.push({
    step: '写记录',
    method: 'POST',
    url: BASE + '/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    auth: { scheme: 'Bearer', tokenFrom: 'FEISHU_TENANT_ACCESS_TOKEN' },
    body: { records: records }
  });

  // Step 5：读回（records/search，body {field_names:[...]}，回 data.items）
  steps.push({
    step: '读回',
    method: 'POST',
    url: BASE + '/bitable/v1/apps/{app_token}/tables/{table_id}/records/search',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    auth: { scheme: 'Bearer', tokenFrom: 'FEISHU_TENANT_ACCESS_TOKEN' },
    body: { field_names: columns.slice() }
  });

  return { ok: true, steps: steps, errors: [], unverifiedTypes: unverifiedTypes };
}

/**
 * 纯函数：用内存 stub 回放整个飞书请求计划（不触网、不碰真实凭据）。
 * stub 模拟服务端行为：换 token→回 token；建表→回 app_token/table_id；加字段/写记录→code:0；
 * 读回→回 data.items（取自计划里「写记录」的 records，模拟服务端持久化后读回）。
 * @param plan  buildFeishuPlan 的产出
 * @param opts  {failStep?:string, code?:number, msg?:string} 人为让某步失败（负路径测试）
 * @return {ok, failed?, appToken?, tableId?, readBack?:[]}
 */
function runFeishuPlanWithStub(plan, opts) {
  opts = opts || {};
  if (!plan || !plan.ok) return { ok: false, failed: { step: 'plan', msg: '请求计划非法' } };

  let appToken = null;
  let tableId = null;
  let wroteRecords = [];

  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    // 负路径：人为让指定步骤返回错误码
    if (opts.failStep && s.step === opts.failStep) {
      return { ok: false, failed: { step: s.step, code: opts.code === undefined ? -1 : opts.code, msg: opts.msg || 'stub 指定失败' } };
    }
    if (s.step === '换token') {
      // 模拟成功：换 token 步骤本身不产出后续步骤要用的字段（stub 不为后续请求真的取用 token），直接放行即可。
      continue;
    }
    if (s.step === '建表') {
      appToken = 'bascnSTUBAPPTOKEN';
      tableId = 'tblSTUBTABLE';
      continue;
    }
    if (s.step === '加字段') {
      continue;
    }
    if (s.step === '写记录') {
      wroteRecords = (s.body.records || []).map(function (rec) {
        const o = {};
        Object.keys(rec.fields).forEach(function (k) { o[k] = rec.fields[k]; });
        return o;
      });
      continue;
    }
    if (s.step === '读回') {
      // 模拟 records/search：回 data.items = 写进去的记录（服务端持久化后读回逐行一致）
      return { ok: true, appToken: appToken, tableId: tableId, readBack: wroteRecords.slice() };
    }
  }
  return { ok: false, failed: { step: 'plan', msg: '计划缺少读回步骤' } };
}

module.exports = {
  FEISHU_FIELD_TYPE,
  FEISHU_CODE_BY_NAME,
  resolveFeishuType,
  toFeishuType,
  buildFeishuPlan,
  runFeishuPlanWithStub
};
