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
const ScriptMod = require('../scripts/feishu-adapter');

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
test('类型解析单一来源：五类数字码均已一手核实（verified:true），unverifiedTypes 为空', function () {
  const table = { primaryKey: '姓名', columns: ['姓名', '工时', '时薪', '入职日', '在职', '级别'], types: { 姓名: 'text', 工时: 'number', 时薪: 'number', 入职日: 'date', 在职: 'bool', 级别: 'enum' }, rows: [] };
  const plan = F.buildFeishuPlan(table);
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  // 官方 Go SDK 常量核实后：text=1/number=2/date=5/checkbox(=bool)=7/single_select(=enum)=3 全部 verified:true
  // → 不再有任何列进 unverifiedTypes（安全护栏按 verified 拦，不是按码拦）
  assert.deepEqual(plan.unverifiedTypes, [], '五类码均已一手核实，unverifiedTypes 应为空');
  // 单源：解析结果的名字来自 engine.TYPE_MAP[x].feishu
  const r = F.resolveFeishuType('number');
  assert.equal(r.ok, true);
  assert.equal(r.name, E.TYPE_MAP.number.feishu, '类型名取自 engine.TYPE_MAP');
  // 五类（engine 规范名）的数字码与 verified 全部正确；bool→checkbox=7、enum→single_select=3
  const expect = { text: 1, number: 2, date: 5, bool: 7, enum: 3 };
  Object.keys(expect).forEach(function (t) {
    const res = F.resolveFeishuType(t);
    assert.equal(res.ok, true, t + ' 应可解析');
    assert.equal(res.code, expect[t], t + ' 数字码应为 ' + expect[t]);
    assert.equal(res.verified, true, t + ' 应已一手核实（verified:true）');
  });
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
  // 五类码现已一手核实，真实建表计划不再产生 unverifiedTypes；此测试用单元级注入验证
  // 「护栏本身仍在」：若某计划携带了未验证码，runLive 必须在联网前 refused。
  const orig = F.buildFeishuPlan;
  F.buildFeishuPlan = function () {
    return { ok: true, steps: [], unverifiedTypes: [{ field: '实验列', type: 'text', code: 99, note: '造数据：未验证码' }] };
  };
  const savedId = process.env.FEISHU_APP_ID, savedSecret = process.env.FEISHU_APP_SECRET;
  process.env.FEISHU_APP_ID = 'stub-id'; process.env.FEISHU_APP_SECRET = 'stub-secret';
  return ScriptMod.runLive({ primaryKey: '姓名', columns: ['姓名'], types: { 姓名: 'text' }, rows: [] }, 't', false)
    .then(function (r) {
      assert.equal(r.ok, false, '含未验证 type 的 live 应被拒绝');
      assert.equal(r.refused, true, '应标记 refused');
      assert.ok(Array.isArray(r.unverifiedTypes) && r.unverifiedTypes.length === 1, '应列出未验证的字段');
      assert.ok(/allow-unverified-types/.test(r.error), '错误应提示显式开关');
    })
    .finally(function () {
      F.buildFeishuPlan = orig;
      if (savedId === undefined) delete process.env.FEISHU_APP_ID; else process.env.FEISHU_APP_ID = savedId;
      if (savedSecret === undefined) delete process.env.FEISHU_APP_SECRET; else process.env.FEISHU_APP_SECRET = savedSecret;
    });
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

// ================= 票 #39（Slice 2 / S6）：未验证类型闸门 + 请求体物化回归（验证既有、不加产品行为） =================
// 本票复用既有 seam 把两条真实故障路径钉死，不改产品代码：
//  - AC1/AC3 未验证类型闸门：默认拒绝真跑 + 显式 --allow-unverified-types 绕过；
//    开关命名与 #28/README 既定一致，不新造语义。
//  - AC2/AC3 请求体物化：materialize() 对 body 做 bodyFrom 注入 / 形状保留（gridData.rows 的
//    [{values:[{cellValue}]}] 形状与占位替换由 materialize-body.test.js（票 #28）专测，此处复用不重复）。

test('#39 AC1/AC3 飞书未验证类型闸门：默认拒绝真跑、显式 --allow-unverified-types 才绕过', async function () {
  const orig = F.buildFeishuPlan;
  // 五类码现已一手核实，真实计划不再产生 unverifiedTypes；注入一条模拟“未验证数字码”计划，
  // steps 置空使绕过分支止于「计划未走到读回」，不触网。
  F.buildFeishuPlan = function () {
    return { ok: true, steps: [], unverifiedTypes: [{ field: '实验列', type: 'text', code: 99, note: '造数据：未验证码' }] };
  };
  const savedId = process.env.FEISHU_APP_ID, savedSecret = process.env.FEISHU_APP_SECRET;
  process.env.FEISHU_APP_ID = 'stub-id'; process.env.FEISHU_APP_SECRET = 'stub-secret';
  const table = { primaryKey: '姓名', columns: ['姓名'], types: { 姓名: 'text' }, rows: [] };
  try {
    const refused = await ScriptMod.runLive(table, 't', false);
    assert.equal(refused.ok, false, '含未验证类型的 live 应拒绝');
    assert.equal(refused.refused, true, '应标记 refused');
    assert.equal(refused.unverifiedTypes.length, 1, '应列出未验证字段');
    assert.ok(/--allow-unverified-types/.test(refused.error), '提示应给出确切开关名（命名与规格一致）');
    // 显式确认开关：同一计划允许后不再走 refused 分支（证明开关真能放行，非只是提示文案）。
    const allowed = await ScriptMod.runLive(table, 't', true);
    assert.notEqual(allowed.refused, true, 'allow=true 时不应被闸门拒绝');
    assert.match(allowed.error, /计划未走到读回/, '绕过闸门后应继续执行到无步骤末端');
  } finally {
    F.buildFeishuPlan = orig;
    if (savedId === undefined) delete process.env.FEISHU_APP_ID; else process.env.FEISHU_APP_ID = savedId;
    if (savedSecret === undefined) delete process.env.FEISHU_APP_SECRET; else process.env.FEISHU_APP_SECRET = savedSecret;
  }
});

test('#39 AC2/AC3 飞书 materialize() 对 body 物化：换token 注入真实凭据、写记录保留 records 形状', function () {
  const table = {
    primaryKey: '姓名', columns: ['姓名', '工时'],
    types: { 姓名: 'text', 工时: 'number' },
    rows: [{ 姓名: '阿岚', 工时: 8 }]
  };
  const plan = F.buildFeishuPlan(table, { appName: 'probe' });
  assert.equal(plan.ok, true);
  const ctx = { creds: { FEISHU_APP_ID: 'real-id', FEISHU_APP_SECRET: 'real-secret' }, appToken: 'at', tableId: 'tbl', tenantToken: 'tkn' };

  // 换token 步骤：bodyFrom 应注入真实凭据值，不得残留契约字段名（占位名）当值。
  const tokenStep = plan.steps.filter(function (s) { return s.bodyFrom; })[0];
  assert.ok(tokenStep, '应存在 bodyFrom 换token 步骤');
  const tokenReq = ScriptMod.materialize(tokenStep, ctx);
  assert.equal(tokenReq.body.app_id, 'real-id', 'app_id 应注入真实值');
  assert.equal(tokenReq.body.app_secret, 'real-secret', 'app_secret 应注入真实值');
  assert.ok(!/FEISHU_APP_ID|FEISHU_APP_SECRET/.test(JSON.stringify(tokenReq.body)), 'body 不得残留凭据字段名当占位值');

  // 写记录步骤：body 形状原样保留（records[].fields），不被物化破坏成裸结构。
  const writeStep = plan.steps.filter(function (s) { return s.step === '写记录'; })[0];
  const writeReq = ScriptMod.materialize(writeStep, ctx);
  assert.ok(Array.isArray(writeReq.body.records), '写记录 body 应保留 records 数组');
  assert.deepEqual(writeReq.body.records[0].fields, { 姓名: '阿岚', 工时: 8 }, 'records[].fields 单元格值应原样保留');
});
