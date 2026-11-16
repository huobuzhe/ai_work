'use strict';
/**
 * 票 #23（Slice 2 / S3）：飞书 adapter 实装。
 * 纯声明 + 请求计划：把一条动作配方（draft）落成飞书多维表格的
 * 「换 tenant_access_token → 建表 → 加字段 → 写记录 → records/search 读回」请求计划。
 * 主 seam 仍是纯函数（数据进数据出），真正的 HTTP I/O 交给 scripts/feishu-adapter.js（可 stub）。
 * 本测试钉住：
 *  - AC1 五段链路齐备（换token/建表/加字段/写记录/读回，共 7 步）、复用票 #5 实测 URL/方法/头/体字段名（见 SMOKE-RUNBOOK Step 1-5）
 *  - AC2 formulaCapabilities 四格 false 且 function 动作在飞书被能力位挡下并提示；extract 不被挡
 *  - AC3 凭据只来自契约字段名、请求计划里绝不出现真实凭据值（用 stub 值验证不回显）
 *  - AC4 一条 extract 动作能从 draft 生成请求计划、并在 stub 回放上端到端「跑通并读回」
 */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine');
const F = require('../lib/feishu-adapter');

// ---- AC1：四步链路请求计划（建表 → 加字段 → 写记录 → 读回），复用票 #5 实测形状 ----
test('AC1 从 extract 配方 + 主表结构生成飞书请求计划（换token/建表/加字段/写记录/读回 五段，共 7 步）', function () {
  const table = {
    primaryKey: '姓名',
    columns: ['姓名', '工时', '时薪'],
    types: { 姓名: 'text', 工时: 'number', 时薪: 'number' },
    rows: [
      { 姓名: '阿岚', 工时: 8, 时薪: 100 },
      { 姓名: '柏舟', 工时: 10, 时薪: 80 }
    ]
  };
  const plan = F.buildFeishuPlan(table, { appName: 'workbench-smoke' });
  assert.equal(plan.ok, true, '规划应成功：' + JSON.stringify(plan.errors));
  const kinds = plan.steps.map(function (s) { return s.step; });
  // 加字段是一次一字段（票 #5：一次调用只建一个字段），3 列 → 3 个「加字段」步骤
  assert.equal(kinds[0], '换token', '第一步应是换 token');
  assert.equal(kinds[1], '建表', '第二步应是建表');
  assert.equal(kinds.filter(function (k) { return k === '加字段'; }).length, 3, '3 列 → 3 个加字段步骤');
  assert.ok(kinds.indexOf('写记录') !== -1, '应有写记录步骤');
  assert.equal(kinds[kinds.length - 1], '读回', '最后一步应是读回');
  assert.equal(kinds.length, 7, '换token + 建表 + 3×加字段 + 写记录 + 读回 = 7');

  const byStep = {};
  plan.steps.forEach(function (s) { byStep[s.step] = s; });

  assert.equal(byStep['换token'].method, 'POST');
  assert.equal(byStep['换token'].url, 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal');

  assert.equal(byStep['建表'].method, 'POST');
  assert.equal(byStep['建表'].url, 'https://open.feishu.cn/open-apis/bitable/v1/apps');
  assert.ok(byStep['建表'].body.name, '建表 body 应有 name');

  const addFieldSteps = plan.steps.filter(function (s) { return s.step === '加字段'; });
  assert.equal(addFieldSteps[0].method, 'POST');
  assert.ok(/\/bitable\/v1\/apps\/\{app_token\}\/tables\/\{table_id\}\/fields$/.test(addFieldSteps[0].url),
    '加字段 URL 应走 fields');
  assert.deepEqual(addFieldSteps.map(function (s) { return s.field; }), ['姓名', '工时', '时薪'],
    '三个字段各一次（一次一字段）');

  assert.equal(byStep['写记录'].method, 'POST');
  assert.ok(/\/records\/batch_create$/.test(byStep['写记录'].url), '写记录走 batch_create');
  assert.equal(byStep['写记录'].body.records.length, 2, '两行记录');

  assert.equal(byStep['读回'].method, 'POST');
  assert.ok(/\/records\/search$/.test(byStep['读回'].url), '读回走 records/search');
});

test('AC1 飞书类型映射：number→type:2、text→type:1（复用票 #5 type:2=Number）', function () {
  assert.equal(F.FEISHU_FIELD_TYPE.number, 2);
  assert.equal(F.FEISHU_FIELD_TYPE.text, 1);
  const table = { primaryKey: '姓名', columns: ['姓名', '工时'], types: { 姓名: 'text', 工时: 'number' }, rows: [] };
  const plan = F.buildFeishuPlan(table);
  const addFields = plan.steps.filter(function (s) { return s.step === '加字段'; });
  const names = addFields.map(function (s) { return s.field; });
  assert.ok(names.indexOf('姓名') !== -1);
  assert.ok(names.indexOf('工时') !== -1);
  const gs = addFields.filter(function (s) { return s.field === '工时'; })[0];
  assert.equal(gs.body.type, 2);
});

// ---- HARD/MEDIUM 修复回归：类型解析单一来源、不静默降级、未验证码不静默 ----
test('HARD 修复：类型名取自 engine.TYPE_MAP（单源），number 已验证、text 未验证进 unverifiedTypes', function () {
  const table = { primaryKey: '姓名', columns: ['姓名', '工时', '时薪'], types: { 姓名: 'text', 工时: 'number', 时薪: 'number' }, rows: [] };
  const plan = F.buildFeishuPlan(table);
  assert.equal(plan.ok, true);
  // text 列（姓名）数字码未验证 → 进 unverifiedTypes；number 列已验证 → 不进
  const fields = plan.unverifiedTypes.map(function (u) { return u.field; });
  assert.deepEqual(fields, ['姓名'], '只有未验证类型的列（姓名/text）进 unverifiedTypes');
  assert.equal(plan.unverifiedTypes[0].code, 1);
  // 单源：解析结果的名字来自 engine.TYPE_MAP[x].feishu
  const r = F.resolveFeishuType('number');
  assert.equal(r.ok, true);
  assert.equal(r.name, E.TYPE_MAP.number.feishu, '类型名取自 engine.TYPE_MAP');
  assert.equal(r.verified, true, 'number 已验证');
  assert.equal(F.resolveFeishuType('text').verified, false, 'text 未验证（如实标记）');
});

test('MEDIUM 修复：未知/缺失类型不静默降级为 text——记 error 且整计划 fail', function () {
  // 未知类型（TYPE_MAP 里没有）
  const t1 = { primaryKey: '姓名', columns: ['姓名', '怪列'], types: { 姓名: 'text', 怪列: 'mystery' }, rows: [] };
  const p1 = F.buildFeishuPlan(t1);
  assert.equal(p1.ok, false, '未知类型应整计划判 fail');
  assert.ok(p1.errors.some(function (e) { return e.field === '怪列'; }), '应报出未知类型的列');
  // 缺失类型（types 里没有该列的键）
  const t2 = { primaryKey: '姓名', columns: ['姓名', '工时'], types: { 姓名: 'text' }, rows: [] };
  const p2 = F.buildFeishuPlan(t2);
  assert.equal(p2.ok, false, '缺类型应整计划判 fail（不默认 text）');
  assert.ok(p2.errors.some(function (e) { return e.field === '工时'; }), '应报出缺类型的列');
  // 兼容旧签名 toFeishuType 也抛错而非回退
  assert.throws(function () { F.toFeishuType('mystery'); }, /未知字段类型/);
  assert.throws(function () { F.toFeishuType(); }, /缺少字段类型/);
});

test('MEDIUM 修复：--live 在含未验证数字码时默认拒绝真跑（不静默发 magic number）', function () {
  // 通过子进程跑 --live（无凭据）验证：即便有凭据，含未验证 type 也应先被 refused 兜住。
  // 这里不真连网——先设假凭据、含 text 列 → 应在「凭据齐全→ plan 含未验证→refused」处被拦。
  const { execFileSync } = require('node:child_process');
  const { resolve } = require('node:path');
  const SCRIPT = resolve(__dirname, '..', 'scripts', 'feishu-adapter.js');
  // 造一个只有 text 列的表（未验证码），走 --live
  const tmp = resolve(require('node:os').tmpdir(), 'feishu-live-text-only.json');
  require('node:fs').writeFileSync(tmp, JSON.stringify({ primaryKey: '姓名', columns: ['姓名'], types: { 姓名: 'text' }, rows: [] }));
  let out;
  try {
    out = execFileSync(process.execPath, [SCRIPT, '--live', '--table', tmp], {
      encoding: 'utf8', env: Object.assign({}, process.env, { FEISHU_APP_ID: 'stub-id', FEISHU_APP_SECRET: 'stub-secret' })
    });
  } catch (e) { out = e.stdout || ''; }
  const r = JSON.parse(out);
  assert.equal(r.ok, false, '含未验证 type 的 live 应被拒绝');
  assert.equal(r.refused, true, '应标记 refused');
  assert.ok(Array.isArray(r.unverifiedTypes) && r.unverifiedTypes.length === 1, '应列出未验证的字段');
  assert.ok(/allow-unverified-types/.test(r.error), '错误应提示显式开关');
});

// ---- AC2：能力位 false、function 被挡、extract 不被挡 ----
test('AC2 飞书 formulaCapabilities 四格 false、函数动作被能力位挡下并提示', function () {
  const fc = E.ADAPTERS.feishu.formulaCapabilities;
  assert.deepEqual(fc, { canWriteFormula: false, canRecalc: false, canReadComputed: false, functionSet: false });

  const stateFeishu = E.initial({ adapter: 'feishu', columns: ['工时', '时薪'], rows: [] });
  let s = E.reduce(stateFeishu, { type: 'SET_INPUT', text: '把工时乘以时薪算成应发' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  assert.equal(s.draft.kind, 'function');
  s = E.reduce(s, { type: 'PREVIEW' });
  // 被能力位挡下时：不产预览（preview===null）、留在 UNDERSTOOD、给出 warn 与明确禁用原因——绝不静默降级。
  assert.equal(s.preview, null, 'blocked function 不应产出预览');
  assert.notEqual(s.stage, 'PREVIEWED', 'blocked function 不应进入 PREVIEWED');
  assert.equal(s.noteTone, 'warn', '应给出 warn 提示');
  assert.ok(/禁用/.test(s.note), 'note 应说明禁用');
  assert.ok(/canWriteFormula/.test(s.note), 'note 应说明具体能力位');
  // 直接问引擎要 blocker，确认非空（AC2 要求给出 blocker）
  const blockers = E.capabilityBlockers(s.draft, s);
  assert.ok(blockers.length > 0, '应给出能力位 blocker');
  assert.ok(blockers.some(function (b) { return b.cap === 'canWriteFormula'; }), 'blocker 应含 canWriteFormula');
});

test('AC2 extract 在飞书上不被能力位挡（结构化动作不依赖公式位）', function () {
  const stateFeishu = E.initial({
    adapter: 'feishu', columns: ['姓名', '邮箱'],
    sources: { '外勤登记表.csv': { rows: [{ 姓名: '阿岚', 邮箱: 'a@x.com' }] } }
  });
  let s = E.reduce(stateFeishu, { type: 'SET_INPUT', text: '从外勤登记表把邮箱提出来' });
  s = E.reduce(s, { type: 'UNDERSTAND' });
  assert.equal(s.draft.kind, 'extract');
  s = E.reduce(s, { type: 'PREVIEW' });
  assert.equal(s.preview.disabled, false, 'extract 在飞书上不应被禁用');
  assert.equal(s.preview.capabilityBlockers.length, 0);
});

// ---- AC3：凭据只来自契约字段名、请求计划不含真实凭据值 ----
test('AC3 请求计划只引用契约字段名（占位符），绝不内嵌真实凭据值', function () {
  const STUB_TOKEN = 't-stub-SECRET-DO-NOT-LEAK';
  const table = { primaryKey: '姓名', columns: ['姓名'], types: { 姓名: 'text' }, rows: [{ 姓名: '阿岚' }] };
  const plan = F.buildFeishuPlan(table);
  const dump = JSON.stringify(plan);
  assert.equal(dump.indexOf(STUB_TOKEN), -1, '计划里不应出现任何 token 值');
  // 所有需要鉴权的步骤用占位 header，值来自 S2 契约字段名
  const authed = plan.steps.filter(function (s) { return s.auth; });
  assert.ok(authed.length >= 1, '应有需要鉴权的步骤');
  authed.forEach(function (s) {
    assert.equal(s.auth.scheme, 'Bearer');
    assert.equal(s.auth.tokenFrom, 'FEISHU_TENANT_ACCESS_TOKEN', '鉴权 token 取自契约字段名');
  });
  // 建表需要 token；换 token 需要 app_id + app_secret（走 body 占位）
  const tokenStep = plan.steps.filter(function (s) { return s.step === '换token'; })[0];
  assert.equal(tokenStep.bodyFrom.app_id, 'FEISHU_APP_ID');
  assert.equal(tokenStep.bodyFrom.app_secret, 'FEISHU_APP_SECRET');
});

// ---- AC4：stub 回放端到端跑通并读回 ----
test('AC4 一条 extract 在飞书 stub 回放上端到端跑通并读回（值一致）', function () {
  const table = {
    primaryKey: '姓名', columns: ['姓名', '工时', '时薪'],
    types: { 姓名: 'text', 工时: 'number', 时薪: 'number' },
    rows: [{ 姓名: '阿岚', 工时: 8, 时薪: 100 }, { 姓名: '柏舟', 工时: 10, 时薪: 80 }]
  };
  const plan = F.buildFeishuPlan(table, { appName: 'workbench-smoke' });
  const result = F.runFeishuPlanWithStub(plan);
  assert.equal(result.ok, true, '端到端应成功：' + JSON.stringify(result.failed));
  assert.equal(result.appToken, 'bascnSTUBAPPTOKEN', 'stub 建表回 app_token');
  assert.equal(result.tableId, 'tblSTUBTABLE', 'stub 回 default_table_id');
  assert.deepEqual(result.readBack, [
    { 姓名: '阿岚', 工时: 8, 时薪: 100 },
    { 姓名: '柏舟', 工时: 10, 时薪: 80 }
  ], '读回记录应与写入逐行一致');
});

test('AC4 stub 回放：任一步 code!=0 时如实失败并报错，不假装成功', function () {
  const table = { primaryKey: '姓名', columns: ['姓名'], types: { 姓名: 'text' }, rows: [{ 姓名: '阿岚' }] };
  const plan = F.buildFeishuPlan(table);
  // 让「建表」步骤返回错误码
  const result = F.runFeishuPlanWithStub(plan, { failStep: '建表', code: 99991663, msg: 'token 无效' });
  assert.equal(result.ok, false, '失败步骤应导致整体失败');
  assert.ok(result.failed && result.failed.step === '建表', '应报出失败步骤');
  assert.equal(result.failed.code, 99991663, '应带原始错误码');
});

// ---- 边界：空表仍可规划（仅主键列）----
test('边界：空表（仅主键列）也能规划，加字段最少 1 个', function () {
  const table = { primaryKey: '姓名', columns: ['姓名'], types: { 姓名: 'text' }, rows: [] };
  const plan = F.buildFeishuPlan(table);
  assert.equal(plan.ok, true);
  const addFields = plan.steps.filter(function (s) { return s.step === '加字段'; });
  assert.equal(addFields.length, 1);
  const write = plan.steps.filter(function (s) { return s.step === '写记录'; })[0];
  assert.equal(write.body.records.length, 0, '空表写 0 条记录');
});

// ---- AC4：可复现脚本（scripts/feishu-adapter.js --stub）也能跑通并读回 ----
test('AC4 可复现脚本 scripts/feishu-adapter.js --stub 端到端跑通并读回', function () {
  const { execFileSync } = require('node:child_process');
  const { resolve } = require('node:path');
  const SCRIPT = resolve(__dirname, '..', 'scripts', 'feishu-adapter.js');
  const out = execFileSync(process.execPath, [SCRIPT, '--stub'], { encoding: 'utf8' });
  const r = JSON.parse(out);
  assert.equal(r.ok, true, '脚本 stub 模式应成功：' + out);
  assert.equal(r.tableId, 'tblSTUBTABLE');
  assert.deepEqual(r.readBack, [
    { 姓名: '阿岚', 工时: 8, 时薪: 100 },
    { 姓名: '柏舟', 工时: 10, 时薪: 80 }
  ], '脚本读回应与写入一致');
});
