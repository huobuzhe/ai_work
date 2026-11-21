'use strict';
// 一句话理解·可选接真 LLM（用户目标步骤 5 之一：可插拔、离线默认关闭）。
// 设计纪律：
//   - 引擎主 understand() 仍是纯关键词匹配、离线可用、零网络（默认行为不变）；
//   - 新增 understandAsync(sentence, {llm})：llm 是宿主注入的 async 函数，返回 {kind,params}|null；
//     LLM 成功→understand() 校验并优先采用（via:'llm'）；LLM 抛错/返回 null/未知 kind→静默回落关键词。
//   - reduce UNDERSTAND 支持 action.llmResult 同步注入（供桥/面板在异步解析完成后落态）。
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');

test('understandAsync：无 llm 注入时=纯关键词（离线默认路径，行为不变）', async function () {
  const got = await E.understandAsync('统计工时的合计', undefined);
  assert.equal(got.kind, 'sum');
  assert.ok(!got.via, '离线关键词路径不应标 via=llm');
});

test('understandAsync：llm 返回合法 kind 时优先采用并标 via=llm', async function () {
  // 关键词会判成 function（含"计算"），但 LLM 说其实是 swap——验证 LLM 优先。
  const llm = async function () { return { kind: 'swap', params: { 字段A: '工时', 字段B: '时薪' } }; };
  const got = await E.understandAsync('把两列对调一下', { llm: llm });
  assert.equal(got.kind, 'swap');
  assert.equal(got.via, 'llm');
  assert.equal(got.params['字段A'], '工时');
});

test('understandAsync：llm 返回未知 kind → 回落关键词', async function () {
  const llm = async function () { return { kind: '不存在的动作' }; };
  const got = await E.understandAsync('统计工时的合计', { llm: llm });
  assert.equal(got.kind, 'sum', '未知 kind 应回落关键词命中 sum');
  assert.ok(!got.via);
});

test('understandAsync：llm 抛错 → 静默回落关键词（外部依赖不阻断离线主路径）', async function () {
  const llm = async function () { throw new Error('网络挂了'); };
  const got = await E.understandAsync('把两段字段调换', { llm: llm });
  assert.equal(got.kind, 'swap', '关键词应命中 swap');
});

test('understandAsync：llm 返回 null（没把握）→ 回落关键词', async function () {
  const llm = async function () { return null; };
  const got = await E.understandAsync('去重', { llm: llm });
  assert.equal(got.kind, 'dedupe');
});

test('reduce UNDERSTAND + llmResult：同步注入 LLM 结果也走封闭校验并优先采用', function () {
  const st = E.initial({ primaryKey: '姓名', columns: ['姓名', '工时', '时薪'], rows: [{ 姓名: 'a', 工时: 1, 时薪: 2 }], sources: {} });
  const s = E.reduce(st, { type: 'UNDERSTAND', text: '把这列处理一下', llmResult: { kind: 'trim', params: { 目标列: '姓名' } } });
  assert.equal(s.stage, 'UNDERSTOOD');
  assert.equal(s.draft.kind, 'trim');
  assert.ok(/LLM/.test(s.note), 'note 应说明由外部 LLM 理解');
});

test('reduce UNDERSTAND：llmResult 为非法 kind 时回落关键词（仍可理解常见句）', function () {
  const st = E.initial({ primaryKey: '姓名', columns: ['姓名', '工时'], rows: [{ 姓名: 'a', 工时: 1 }], sources: {} });
  const s = E.reduce(st, { type: 'UNDERSTAND', text: '统计工时的合计', llmResult: { kind: 'bogus' } });
  assert.equal(s.stage, 'UNDERSTOOD');
  assert.equal(s.draft.kind, 'sum');
});

// ---- 桥层：deps.understandLlm 注入后，UNDERSTAND 走 LLM 结果（离线关键词作为回落）----
test('panel-bridge understandLlm：注入后 UNDERSTAND 采用 LLM 给的 kind', function () {
  const { makeActionHandler, defaultReadTable } = require('../lib/panel-bridge');
  const path = require('path'), fs = require('fs'), os = require('os');
  const { spawnSync } = require('child_process');
  function hasPython() {
    const c = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
    return c.some((b) => { const r = spawnSync(b, ['-c', 'import openpyxl'], { encoding: 'utf8' }); return !r.error && r.status === 0; });
  }
  if (!hasPython()) return; // 无 python 时读表会失败，跳过（引擎层单测已覆盖核心）
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-llm-'));
  const file = path.join(dir, 'd.xlsx');
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const py = (process.platform === 'win32' ? ['python', 'py'] : ['python3']).find((b) => {
    const r = spawnSync(b, ['-c', 'import openpyxl'], { encoding: 'utf8' }); return !r.error && r.status === 0; });
  const sj = path.join(dir, 's.json');
  fs.writeFileSync(sj, JSON.stringify({ primaryKey: '姓名', columns: { 姓名: 'text', 工时: 'number' }, rows: [{ 姓名: 'a', 工时: 1 }] }), 'utf8');
  spawnSync(py, [bridge, 'create', file, sj]);
  const store = require('../lib/panel-session').createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] });
  const handler = makeActionHandler({
    readTable: defaultReadTable, store: store,
    // 注入「假 LLM」：无论句子是什么都说成 trim + 目标列=姓名
    understandLlm: function () { return { kind: 'trim', params: { 目标列: '姓名' } }; }
  });
  const body = handler({ method: 'POST', url: '/workbench-api/action',
    body: JSON.stringify({ file: file, sessionId: 's1', action: { type: 'UNDERSTAND', text: '随便一句话' } }) }).body;
  assert.equal(body.stage, 'UNDERSTOOD');
  assert.equal(body.draft.kind, 'trim', '应采用注入 LLM 给的 trim');
  assert.ok(/LLM/.test(body.note || ''), 'note 应说明外部 LLM 理解');
});
