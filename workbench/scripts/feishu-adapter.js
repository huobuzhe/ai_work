'use strict';
/**
 * 票 #23（Slice 2 / S3）：飞书 adapter 可复现运行脚本（文件桥 / 真 I/O 边界）。
 *
 * 与 lib/feishu-adapter.js（纯声明）分工：本脚本负责真正的 HTTP I/O。
 * 两种模式：
 *   node scripts/feishu-adapter.js --stub                 # 纯内存 stub 回放（无网络、无凭据），用于演示/CI
 *   node scripts/feishu-adapter.js --live --table <json>  # 对真实飞书执行（需本机环境变量凭据，绝不入库）
 *
 * 真实凭据只从本机环境变量读取（S2 契约字段名）：FEISHU_APP_ID / FEISHU_APP_SECRET（换 token），
 * 换得的 tenant_access_token 只在内存里用、绝不打印、绝不落盘。
 * 一手链路见 SMOKE-RUNBOOK.md Step 1-5。
 */
const https = require('node:https');
const { readFileSync } = require('node:fs');
const F = require('../lib/feishu-adapter');

function httpJson(method, url, headers, body) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const data = body === undefined ? null : JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: method,
      headers: Object.assign({}, headers, data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }, function (res) {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { buf += c; });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); }
        catch (e) { resolve({ status: res.statusCode, json: null, raw: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// 把请求计划里的占位符替换为运行时的真实值（app_token/table_id/token），做 I/O 时不打日志。
function materialize(step, ctx) {
  let url = step.url
    .replace('{app_token}', ctx.appToken || '')
    .replace('{table_id}', ctx.tableId || '');
  let headers = Object.assign({}, step.headers);
  if (step.auth && step.auth.scheme === 'Bearer') headers['Authorization'] = 'Bearer ' + (ctx.tenantToken || '');
  let body = step.body ? JSON.parse(JSON.stringify(step.body)) : undefined;
  if (step.bodyFrom) {
    body = {};
    if (step.bodyFrom.app_id) body.app_id = ctx.creds.FEISHU_APP_ID;
    if (step.bodyFrom.app_secret) body.app_secret = ctx.creds.FEISHU_APP_SECRET;
  }
  return { method: step.method, url: url, headers: headers, body: body };
}

async function runLive(table, appName, allowUnverifiedTypes) {
  const creds = { FEISHU_APP_ID: process.env.FEISHU_APP_ID, FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET };
  const miss = Object.keys(creds).filter(function (k) { return !creds[k]; });
  if (miss.length) { return { ok: false, error: '缺本机凭据环境变量：' + miss.join(', ') + '（凭据绝不入库）' }; }
  const plan = F.buildFeishuPlan(table, { appName: appName });
  if (!plan.ok) return { ok: false, error: '规划失败', errors: plan.errors };
  // 不静默发未验证 magic number：真跑前，若有列用了未验证的飞书字段数字码，必须显式 --allow-unverified-types 才放行。
  const unverified = plan.unverifiedTypes || [];
  if (unverified.length && !allowUnverifiedTypes) {
    return {
      ok: false,
      refused: true,
      error: '请求计划含未验证的飞书字段数字码，已拒绝真跑（不静默发送）。确认无误可加 --allow-unverified-types 再跑。',
      unverifiedTypes: unverified
    };
  }
  const ctx = { creds: creds, appToken: null, tableId: null, tenantToken: null };

  for (const step of plan.steps) {
    const req = materialize(step, ctx);
    const r = await httpJson(req.method, req.url, req.headers, req.body);
    // 成功判据：HTTP 200 + 顶层 code == 0（票 #5 实测口径）
    const okCode = r.json && r.json.code === 0;
    if (step.step === '换token') {
      if (!okCode) return { ok: false, failed: { step: step.step, code: r.json && r.json.code, msg: r.json && r.json.msg } };
      ctx.tenantToken = r.json.tenant_access_token;
    } else if (step.step === '建表') {
      if (!okCode) return { ok: false, failed: { step: step.step, code: r.json && r.json.code, msg: r.json && r.json.msg } };
      ctx.appToken = r.json.data.app.app_token;
      ctx.tableId = r.json.data.app.default_table_id;
    } else if (step.step === '加字段' || step.step === '写记录') {
      if (!okCode) return { ok: false, failed: { step: step.step, field: step.field, code: r.json && r.json.code, msg: r.json && r.json.msg } };
    } else if (step.step === '读回') {
      if (!okCode) return { ok: false, failed: { step: step.step, code: r.json && r.json.code, msg: r.json && r.json.msg } };
      const items = (r.json.data && r.json.data.items) || [];
      const readBack = items.map(function (it) { return it.fields; });
      return { ok: true, appToken: ctx.appToken, tableId: ctx.tableId, readBack: readBack };
    }
  }
  return { ok: false, error: '计划未走到读回' };
}

async function main() {
  const args = process.argv.slice(2);
  const isStub = args.indexOf('--stub') !== -1;
  const tableDefault = {
    primaryKey: '姓名', columns: ['姓名', '工时', '时薪'],
    types: { 姓名: 'text', 工时: 'number', 时薪: 'number' },
    rows: [{ 姓名: '阿岚', 工时: 8, 时薪: 100 }, { 姓名: '柏舟', 工时: 10, 时薪: 80 }]
  };
  const ti = args.indexOf('--table');
  const table = ti !== -1 ? JSON.parse(readFileSync(args[ti + 1], 'utf8')) : tableDefault;

  if (isStub) {
    const plan = F.buildFeishuPlan(table, { appName: 'workbench-smoke' });
    const r = F.runFeishuPlanWithStub(plan);
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exitCode = 1;
    return;
  }
  // live
  const allowUnverified = args.indexOf('--allow-unverified-types') !== -1;
  const r = await runLive(table, 'workbench-smoke', allowUnverified);
  // 绝不打印 token；只打印结果摘要 + appToken/tableId/readBack
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exitCode = 1;
}

module.exports = { runLive, materialize, main };

if (require.main === module) {
  main().catch(function (e) { console.error('feishu-adapter 运行失败：', e && e.message); process.exitCode = 1; });
}
