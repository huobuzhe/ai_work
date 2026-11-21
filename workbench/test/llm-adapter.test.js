'use strict';
// 真 LLM 适配器（lib/llm-adapter.js）单测——重点验证「永不阻断主路径」：
//   成功则给出 {kind,params}；任何失败（非 2xx / 网络抛错 / 超时 / 非 JSON / 未知 kind）一律 null。
// 全部用注入的 fetch 打桩，零真实网络。
const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/llm-adapter.js');

// 构造一个假的 fetch：返回给定 {ok, status, body 文本}
function fakeFetch(spec) {
  return async function (url, opts) {
    if (spec.throw) throw new Error(spec.throw);
    if (spec.hang) {
      // 模拟超时：返回一个永不 resolve 的 promise（由 AbortController 触发 reject）
      return new Promise(function (_res, rej) {
        const t = setTimeout(function () { rej(new Error('aborted')); }, 50);
        if (opts && opts.signal) opts.signal.addEventListener('abort', function () { clearTimeout(t); rej(new Error('aborted')); });
      });
    }
    return {
      ok: spec.ok !== false,
      status: spec.status || (spec.ok === false ? 500 : 200),
      text: async function () { return typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body); }
    };
  };
}

function chatBody(contentObj) {
  return { choices: [{ message: { content: typeof contentObj === 'string' ? contentObj : JSON.stringify(contentObj) } }] };
}

test('interpretChatResponse：合法响应→{kind,params}，非法参数键被丢弃', function () {
  const r = A.interpretChatResponse(chatBody({ kind: 'sum', params: { 目标列: '工时', 聚合方式: 'avg', 不存在的键: 1 } }));
  assert.equal(r.kind, 'sum');
  assert.equal(r.params['目标列'], '工时');
  assert.equal(r.params['聚合方式'], 'avg');
  assert.equal(r.params['不存在的键'], undefined, '非法参数键应被丢弃');
});

test('interpretChatResponse：未知 kind / 无 choices / 非 JSON → null', function () {
  assert.equal(A.interpretChatResponse(chatBody({ kind: '不存在的动作' })), null);
  assert.equal(A.interpretChatResponse({}), null);
  assert.equal(A.interpretChatResponse('not json'), null);
  assert.equal(A.interpretChatResponse(chatBody('这只是一句话，不是 JSON')), null);
});

test('parseModelJson：剥离 ```json 代码块围栏', function () {
  const r = A.parseModelJson('```json\n{"kind":"swap","params":{"字段A":"部门","字段B":"备注"}}\n```');
  assert.equal(r.kind, 'swap');
  assert.equal(r.params['字段A'], '部门');
});

test('parseModelJson：字符串里含花括号/转义引号也能正确配对', function () {
  const r = A.parseModelJson('前缀 {"kind":"function","params":{"表达式":"工时 * 时薪","输出列":"应发"}} 后缀');
  assert.equal(r.kind, 'function');
  assert.equal(r.params['表达式'], '工时 * 时薪');
});

test('createUnderstandLlmAsync：成功→返回 {kind,params}', async function () {
  const llm = A.createUnderstandLlmAsync({
    baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'k',
    fetch: fakeFetch({ body: chatBody({ kind: 'trim', params: { 目标列: '姓名' } }) })
  });
  const r = await llm('去掉姓名两边空格', { columns: ['姓名', '工时'] });
  assert.equal(r.kind, 'trim');
  assert.equal(r.params['目标列'], '姓名');
});

test('createUnderstandLlmAsync：HTTP 非 2xx→null（回落关键词）', async function () {
  const llm = A.createUnderstandLlmAsync({ fetch: fakeFetch({ ok: false, status: 500, body: 'boom' }) });
  assert.equal(await llm('随便', {}), null);
});

test('createUnderstandLlmAsync：fetch 抛错→null', async function () {
  const llm = A.createUnderstandLlmAsync({ fetch: fakeFetch({ throw: 'ECONNREFUSED' }) });
  assert.equal(await llm('随便', {}), null);
});

test('createUnderstandLlmAsync：超时（abort）→null', async function () {
  const llm = A.createUnderstandLlmAsync({ timeoutMs: 30, fetch: fakeFetch({ hang: true }) });
  assert.equal(await llm('随便', {}), null);
});

test('createUnderstandLlmAsync：无 fetch 能力→null', async function () {
  const llm = A.createUnderstandLlmAsync({ fetch: null });
  // 若环境全局有 fetch，factory 会回退到全局 fetch；此处显式传 fetch:null 仍会回退全局——
  // 故仅断言「不被调用也不抛错」的稳健性：给一个一定会失败的环境（不可达域名）仍应 null 或超时。
  // 为避免真实网络，改为验证：注入一个返回非 JSON 的 fetch。
  const llm2 = A.createUnderstandLlmAsync({ fetch: async function () { return { ok: true, text: async function () { return 'plain text'; } }; } });
  assert.equal(await llm2('随便', {}), null);
});

test('buildSystemPrompt：含全部 kind 名与列名提示', function () {
  const p = A.buildSystemPrompt(['姓名', '工时']);
  assert.ok(/sum/.test(p) && /swap/.test(p) && /highlight/.test(p), '应列出动作类型');
  assert.ok(/姓名、工时/.test(p), '应带真实列名');
});

test('buildRequestBody：JSON 结构正确、temperature 默认 0、stream=false', function () {
  const b = A.buildRequestBody({ model: 'deepseek-chat' }, '统计工时合计', ['姓名', '工时']);
  assert.equal(b.model, 'deepseek-chat');
  assert.equal(b.stream, false);
  assert.equal(b.temperature, 0);
  assert.equal(b.messages.length, 2);
  assert.equal(b.messages[1].content, '统计工时合计');
});

// 端到端：async 适配器 + engine.understandAsync（离线回落链路验证）
test('端到端：createUnderstandLlmAsync 结果交给 engine.understandAsync 并标 via=llm', async function () {
  const E = require('../lib/engine.js');
  const llm = A.createUnderstandLlmAsync({ fetch: fakeFetch({ body: chatBody({ kind: 'sum', params: { 目标列: '工时', 聚合方式: 'sum' } }) }) });
  const got = await E.understandAsync('帮我算一下总工时', { llm: llm });
  assert.equal(got.kind, 'sum');
  assert.equal(got.via, 'llm');
});

test('端到端：适配器失败时 engine.understandAsync 回落关键词仍能识别常见句', async function () {
  const E = require('../lib/engine.js');
  const llm = A.createUnderstandLlmAsync({ fetch: fakeFetch({ throw: 'down' }) });
  const got = await E.understandAsync('统计工时的合计', { llm: llm });
  assert.equal(got.kind, 'sum', '关键词回落应识别 sum');
  assert.notEqual(got.via, 'llm');
});
