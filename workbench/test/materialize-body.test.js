'use strict';
/**
 * 票 #28：为 #27 五轮实测 bug 固化回归 —— 专门补上「scripts 层 materialize 真实 body 替换」的
 * 直断盲区。
 *
 * 五类坑的完整清单与来历见 workbench/README.md「回归清单：#27 五轮实测坑 → #28 固化」节。
 * 背景（票 #27 第四轮实测 bug，commit 1cdb9a9）：
 *   `scripts/tencent-adapter.js` 的 `materialize()` 起初只对 URL 调 buildTencentUrl 替换占位符，
 *   **body 走 JSON.stringify(step.body) 未替换** → 真发出去的 updateRangeRequest.sheetId 是字面量
 *   `'{sheetId}'` → 腾讯报 `missing data not found`(code -12)。
 *
 * 为什么之前的测试没抓到：`--stub` 走 lib 的内存回放（runTencentPlanWithStub），根本不经过
 * scripts 层的 materialize；而 lib 单测只测了 substituteBodyPlaceholders 纯函数，也没测
 * 「materialize 是否真的把它接进 body」。本文件补上这条端到端直断。
 *
 * 三条用例分别直断 materialize 的三个输出分支：JSON body（占位替换盲区核心）、URL（含 $ 的
 * fileId 不得被 String.replace 的替换模式吞掉，属 #24 已修同类坑）、建表 form + 三头凭据注入
 * （运行时注入真实值而非占位名）。三者都真经过 materialize，而 --stub 完全绕过它，故一并在此守住。
 */
const test = require('node:test');
const assert = require('node:assert');
const T = require('../lib/tencent-adapter');
const ScriptMod = require('../scripts/tencent-adapter');

const CREDS = {
  TENCENT_ACCESS_TOKEN: 'stub-ACCESS-TOKEN-DO-NOT-LEAK',
  TENCENT_CLIENT_ID: 'stub-CLIENT-ID',
  TENCENT_OPEN_ID: 'stub-OPEN-ID'
};

function sampleTable() {
  return {
    primaryKey: '姓名',
    columns: ['姓名', '工时', '时薪'],
    types: { 姓名: 'text', 工时: 'number', 时薪: 'number' },
    rows: [{ 姓名: '阿岚', 工时: 8, 时薪: 100 }, { 姓名: '柏舟', 工时: 10, 时薪: 80 }]
  };
}

// 取「写值」步骤（唯一带 application/json body 的步骤）
function writeStep() {
  const plan = T.buildTencentPlan(sampleTable(), { title: 'regression' });
  assert.equal(plan.ok, true, 'plan 应成功：' + JSON.stringify(plan.errors));
  const step = plan.steps.filter(function (s) { return s.contentType === 'application/json'; })[0];
  assert.ok(step, '应存在一个 application/json 的写值步骤');
  return step;
}

test('#28 盲区回归：materialize 对「写值」步骤的 body 也替换 {sheetId}，序列化后无字面占位符', function () {
  const step = writeStep();
  // 计划里 body 是含占位符的模板（未替换）
  assert.equal(JSON.stringify(step.body).indexOf('{sheetId}') !== -1, true, '前置：计划 body 里应是字面量占位符');

  const req = ScriptMod.materialize(step, {
    fileId: '300000000$KoZBnFFpOQqo',
    sheetId: 'BB08J2',
    range: 'A1:C3',
    creds: CREDS
  });

  // 1) body 是真字符串
  assert.equal(typeof req.bodyString, 'string', 'materialize 应产出 bodyString 字符串');
  // 2) 序列化 body 里不得残留任何运行时占位符字面量
  ['{fileId}', '{sheetId}', '{range}'].forEach(function (ph) {
    assert.equal(req.bodyString.indexOf(ph), -1, 'materialize 后 body 不得残留字面量 ' + ph);
  });
  // 3) body 里 sheetId 已是真实值
  const parsed = JSON.parse(req.bodyString);
  const urr = parsed.requests[0].updateRangeRequest;
  assert.equal(urr.sheetId, 'BB08J2', 'body 里 updateRangeRequest.sheetId 应为真实 sheetId');
  // 4) 占位替换不得损坏真实载荷：gridData.rows 的单元格值原样保留
  //    （substituteBodyPlaceholders 只替换整串恰等于占位符的值，不得伤及正文/单元格数据）
  const rows = urr.gridData.rows;
  assert.equal(rows.length, 3, '表头 + 2 数据行应原样保留，替换过程不得丢行');
  assert.equal(rows[1].values[0].cellValue.text, '阿岚', '单元格文本值不得被替换过程损坏');
  assert.equal(rows[1].values[1].cellValue.number, 8, '单元格数字值不得被替换过程损坏');
});

test('#28 盲区回归：materialize 的 URL 也替换，且含 $ 的真实 fileId 原样保留（不误当替换模式）', function () {
  const step = writeStep();
  const req = ScriptMod.materialize(step, {
    fileId: '300000000$KoZBnFFpOQqo',
    sheetId: 'BB08J2',
    range: 'A1:C3',
    creds: CREDS
  });
  assert.ok(req.url.indexOf('{fileId}') === -1, 'URL 不得残留 {fileId}');
  assert.ok(req.url.indexOf('300000000$KoZBnFFpOQqo') !== -1, 'URL 应含真实 fileId');
  assert.ok(req.url.indexOf('batchUpdate') !== -1, 'URL 应是 batchUpdate 端点');
  // 含 $ 的 fileId 若走 String.replace 的替换模式，`$K` 之类会被吃掉；断言完整保留
  assert.ok(req.url.split('300000000$KoZBnFFpOQqo').length === 2, '真实 fileId 应完整出现且仅一次');
});

test('#28 盲区回归：materialize 建表步骤走 form body（不受占位替换影响），三头用真实凭据值', function () {
  const plan = T.buildTencentPlan(sampleTable(), { title: 'regression' });
  const createStep = plan.steps.filter(function (s) { return s.contentType === 'application/x-www-form-urlencoded'; })[0];
  assert.ok(createStep, '应存在建表 form 步骤');
  const req = ScriptMod.materialize(createStep, { fileId: '', sheetId: '', range: '', creds: CREDS });
  assert.equal(req.bodyString.indexOf('type=sheet'), 0, '建表 body 应是 form 编码且以 type=sheet 开头');
  // 三头应是真实凭据值（运行时注入），不是占位名
  assert.equal(req.headers['Access-Token'], CREDS.TENCENT_ACCESS_TOKEN);
  assert.equal(req.headers['Client-Id'], CREDS.TENCENT_CLIENT_ID);
  assert.equal(req.headers['Open-Id'], CREDS.TENCENT_OPEN_ID);
});
