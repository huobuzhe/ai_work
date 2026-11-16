'use strict';
/**
 * 票 #24（Slice 2 / S4）：腾讯文档 adapter 可复现运行脚本（文件桥 / 真 I/O 边界）。
 *
 * 与 lib/tencent-adapter.js（纯声明）分工：本脚本负责真正的 HTTP I/O。
 * 两种模式：
 *   node scripts/tencent-adapter.js --stub                 # 纯内存 stub 回放（无网络、无凭据），用于演示/CI
 *   node scripts/tencent-adapter.js --live --table <json>  # 对真实腾讯文档执行（需本机环境变量凭据，绝不入库）
 *
 * 真实凭据只从本机环境变量读取（S2 契约字段名）：
 *   TENCENT_ACCESS_TOKEN / TENCENT_CLIENT_ID / TENCENT_OPEN_ID（腾讯三元组）。
 * token 只在内存里用、绝不打印、绝不落盘。
 * 一手链路见 SMOKE-RUNBOOK.md Step 6-8；一手取证见
 *   docs/research/tencent-create-file-request-shape.md、docs/research/tencent-v3-batchupdate-request-shape.md。
 *
 * 关键约束（一手坐实）：
 *  - 建表回包外层是 ret/msg/data（**不是 code**），文件 ID 在 data.ID（含字面 $，须原样保留拼 URL）；
 *  - 成功判据：建表/查/读 = HTTP 200 + ret==0；V3 batchUpdate = 只认 HTTP 200（官方无 code==0 逐字依据）；
 *  - 写值 updateRangeRequest 单次 requests <= 5；gridData 0-based；无公式字段；
 *  - 读回用 A1 表示法；三元组头每个请求都带。
 */
const http = require('node:http');
const https = require('node:https');
const { readFileSync } = require('node:fs');
const T = require('../lib/tencent-adapter');

function httpRequest(method, url, headers, bodyString) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const mod = u.protocol === 'http:' ? http : https;
    const h = Object.assign({}, headers);
    if (bodyString) h['Content-Length'] = Buffer.byteLength(bodyString);
    const req = mod.request({
      hostname: u.hostname, path: u.pathname + u.search, method: method, headers: h
    }, function (res) {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { buf += c; });
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(buf); } catch (e) { /* 保留 raw */ }
        resolve({ status: res.statusCode, json: json, raw: buf });
      });
    });
    req.on('error', reject);
    if (bodyString) req.write(bodyString);
    req.end();
  });
}

// 把请求计划里的占位符替换为运行时真实值（fileId/sheetId），做 I/O 时不打日志。
function materialize(step, ctx) {
  // 占位符替换统一走 lib 的 buildTencentUrl（对含 $ 的真实 fileId 安全）。
  const url = T.buildTencentUrl(step.url, { fileId: ctx.fileId, sheetId: ctx.sheetId, range: ctx.range });
  const headers = Object.assign({}, step.headers);
  if (step.auth && step.auth.headers) {
    headers['Access-Token'] = ctx.creds.TENCENT_ACCESS_TOKEN;
    headers['Client-Id'] = ctx.creds.TENCENT_CLIENT_ID;
    headers['Open-Id'] = ctx.creds.TENCENT_OPEN_ID;
  }
  let bodyString;
  if (step.contentType === 'application/json' && step.body) {
    headers['Content-Type'] = 'application/json';
    bodyString = JSON.stringify(step.body);
  } else if (step.contentType === 'application/x-www-form-urlencoded') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    bodyString = step.bodyString;
  }
  return { method: step.method, url: url, headers: headers, bodyString: bodyString };
}

async function runLive(table, title, allowUnverifiedTypes) {
  const creds = {
    TENCENT_ACCESS_TOKEN: process.env.TENCENT_ACCESS_TOKEN,
    TENCENT_CLIENT_ID: process.env.TENCENT_CLIENT_ID,
    TENCENT_OPEN_ID: process.env.TENCENT_OPEN_ID
  };
  const miss = Object.keys(creds).filter(function (k) { return !creds[k]; });
  if (miss.length) { return { ok: false, error: '缺本机凭据环境变量：' + miss.join(', ') + '（凭据绝不入库）' }; }

  const plan = T.buildTencentPlan(table, { title: title });
  if (!plan.ok) return { ok: false, error: '规划失败', errors: plan.errors };
  // 不静默发未验证写入形态：真跑前若含未验证类型，须显式 --allow-unverified-types。
  const unverified = plan.unverifiedTypes || [];
  if (unverified.length && !allowUnverifiedTypes) {
    return {
      ok: false, refused: true,
      error: '请求计划含未验证写入形态的列，已拒绝真跑（不静默发送）。确认无误可加 --allow-unverified-types 再跑。',
      unverifiedTypes: unverified
    };
  }

  const ctx = { creds: creds, fileId: null, sheetId: null, range: plan.range };
  // 多块写值需分多次请求：把 plan.chunks 逐个 materialize 后发送。
  for (const step of plan.steps) {
    if (step.step === '写值' && plan.chunks.length > 1) {
      // 多次 batchUpdate（每次 requests<=5）
      for (const ch of plan.chunks) {
        const req = materialize({ step: '写值', method: 'POST', url: step.url, contentType: 'application/json', body: { requests: ch.requests }, auth: step.auth }, ctx);
        const r = await httpRequest(req.method, req.url, req.headers, req.bodyString);
        if (!T.isV3Success(r.status, r.json)) {
          return { ok: false, failed: { step: '写值', httpStatus: r.status, json: r.json, raw: r.raw } };
        }
      }
      continue;
    }
    const req = materialize(step, ctx);
    const r = await httpRequest(req.method, req.url, req.headers, req.bodyString);
    if (step.step === '建表') {
      if (r.status !== 200 || !T.isV2Success(r.json)) {
        return { ok: false, failed: { step: '建表', httpStatus: r.status, ret: r.json && r.json.ret, msg: r.json && r.json.msg } };
      }
      const got = T.extractFileId(r.json);
      if (!got.ok) return { ok: false, failed: { step: '建表', msg: got.reason, raw: r.raw } };
      ctx.fileId = got.fileId;
    } else if (step.step === '查sheet') {
      // V3 查sheet 端点直出 {properties:[{sheetId,...}]}，回包无 ret 字段（不是 V2 的 ret===0 契约）
      // → 只认 HTTP 200，成功与否由 properties[].sheetId 提取判定（逻辑集中在 lib，可单测）。
      const chk = T.classifySheetResponse(r.status, r.json);
      if (!chk.ok) {
        if (chk.failed.msg) return { ok: false, failed: Object.assign({}, chk.failed, { raw: r.raw }) };
        return { ok: false, failed: chk.failed };
      }
      ctx.sheetId = chk.sheetId;
    } else if (step.step === '写值') {
      if (!T.isV3Success(r.status, r.json)) {
        return { ok: false, failed: { step: '写值', httpStatus: r.status, json: r.json, raw: r.raw } };
      }
    } else if (step.step === '读回') {
      // 官方读接口回包结构不确定（V3 参数表 code/message/gridData vs 示例 V2 式 ret/msg/data）
      // → 只认 HTTP 200、打印完整回包供肉眼核对，不猜键名。
      if (r.status !== 200) {
        return { ok: false, failed: { step: '读回', httpStatus: r.status, json: r.json, raw: r.raw } };
      }
      return { ok: true, fileId: ctx.fileId, sheetId: ctx.sheetId, readBackRaw: r.json || r.raw };
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
  const title = 'workbench-smoke';

  if (isStub) {
    const plan = T.buildTencentPlan(table, { title: title });
    const r = T.runTencentPlanWithStub(plan);
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exitCode = 1;
    return;
  }
  const allowUnverified = args.indexOf('--allow-unverified-types') !== -1;
  const r = await runLive(table, title, allowUnverified);
  // 绝不打印 token；只打印结果摘要 + fileId/sheetId/readBack。
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exitCode = 1;
}

module.exports = { runLive, materialize, main };

if (require.main === module) {
  main().catch(function (e) { console.error('tencent-adapter 运行失败：', e && e.message); process.exitCode = 1; });
}
