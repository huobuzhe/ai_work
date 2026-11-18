'use strict';
/**
 * 票 #52「从模板新建表格」—— seam 单测。
 * seam A（Host 纯函数）：buildCreateSpec(templates, req) → 结构 或 errors。
 * seam C（路由）：makeTemplatesHandler / makeCreateHandler。
 * 另加 python create 子命令的真实建表复核。
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { buildCreateSpec } = require('../lib/panel-state');
const { makeTemplatesHandler, makeCreateHandler, defaultCreateTable } = require('../lib/panel-bridge');

const TEMPLATES = [
  { file: 'employee-worklog.json', name: '员工工时表', primaryKey: '姓名', columns: { 姓名: 'text', 部门: 'text', 工时: 'number', 时薪: 'number', 备注: 'text' } },
  { file: 'project-budget.json', name: '项目预算表', primaryKey: '项目', columns: { 项目: 'text', 预算: 'number' } }
];

// ---- seam A ----
test('#52 AC-A1 buildCreateSpec 按模板名产出结构，主键正确', () => {
  const r = buildCreateSpec(TEMPLATES, { mode: 'template', template: '员工工时表' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.structure.primaryKey, '姓名');
  assert.ok(r.structure.columns['工时'] === 'number', '列类型保留');
  assert.strictEqual(r.structure.name, '员工工时表');
});

test('#52 AC-A2 buildCreateSpec 支持按文件名匹配 + 自定义 name', () => {
  const r = buildCreateSpec(TEMPLATES, { template: 'project-budget.json', name: '2026 预算' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.structure.primaryKey, '项目');
  assert.strictEqual(r.structure.name, '2026 预算');
});

test('#52 AC-A3 buildCreateSpec 找不到模板 → errors', () => {
  const r = buildCreateSpec(TEMPLATES, { template: '不存在的模板' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].field === 'template');
});

test('#52 AC-A4 buildCreateSpec 缺 template → errors', () => {
  const r = buildCreateSpec(TEMPLATES, {});
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].reason.indexOf('template') >= 0);
});

// ---- seam C ----
test('#52 AC-C1 makeTemplatesHandler 列模板 200', () => {
  const h = makeTemplatesHandler({ loadTemplates: () => TEMPLATES });
  const r = h({ method: 'GET', url: '/workbench-api/templates' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.templates.length, 2);
});

test('#52 AC-C2 makeCreateHandler 建文件并回地址 200', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-create-'));
  const created = [];
  const h = makeCreateHandler({
    loadTemplates: () => TEMPLATES,
    resolveDir: () => dir,
    createTable: (file, structure) => { created.push({ file, structure }); fs.writeFileSync(file, 'x'); return { ok: true }; }
  });
  const r = h({ method: 'POST', url: '/workbench-api/create', body: JSON.stringify({ mode: 'template', template: '项目预算表' }) });
  assert.strictEqual(r.status, 200);
  assert.ok(fs.existsSync(r.body.file), '文件应已创建');
  assert.ok(r.body.address.indexOf('dsh-resource://file/absolute/') === 0, '地址前缀');
  assert.strictEqual(created[0].structure.primaryKey, '项目');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('#52 AC-C3 makeCreateHandler 缺 target dir → 400', () => {
  const h = makeCreateHandler({
    loadTemplates: () => TEMPLATES,
    resolveDir: () => { throw new Error('无 cwd'); },
    createTable: () => ({ ok: true })
  });
  const r = h({ method: 'POST', url: '/workbench-api/create', body: JSON.stringify({ template: '员工工时表' }) });
  assert.strictEqual(r.status, 400);
});

test('#52 AC-C4 makeCreateHandler 非 POST → 405；非法模板 → 400', () => {
  const h = makeCreateHandler({ loadTemplates: () => TEMPLATES, resolveDir: () => os.tmpdir(), createTable: () => ({ ok: true }) });
  assert.strictEqual(h({ method: 'GET', url: '/workbench-api/create' }).status, 405);
  const bad = h({ method: 'POST', url: '/workbench-api/create', body: JSON.stringify({ template: '不存在' }) });
  assert.strictEqual(bad.status, 400);
});

test('#52 AC-C5 makeCreateHandler 重名不覆盖（追加序号）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-create-'));
  // 预先占用同名文件
  fs.writeFileSync(path.join(dir, '项目预算表.xlsx'), 'existing');
  const h = makeCreateHandler({
    loadTemplates: () => TEMPLATES,
    resolveDir: () => dir,
    createTable: (file) => { fs.writeFileSync(file, 'x'); return { ok: true }; }
  });
  const r = h({ method: 'POST', url: '/workbench-api/create', body: JSON.stringify({ template: '项目预算表' }) });
  assert.strictEqual(r.status, 200);
  assert.ok(/项目预算表 \(1\)\.xlsx$/.test(r.body.file), '应追加序号不覆盖: ' + r.body.file);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- python create 真实建表 ----
test('#52 AC-D1 defaultCreateTable 真实建空表 + read-values 复核列头', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-create-'));
  const file = path.join(dir, 'tpl.xlsx');
  const structure = { primaryKey: '姓名', columns: { 姓名: 'text', 部门: 'text', 工时: 'number' }, name: '员工工时表' };
  const r = defaultCreateTable(file, structure);
  assert.strictEqual(r.ok, true);
  // read-values 复核
  const bridge = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let out = null, lastErr = null;
  for (const bin of candidates) {
    const rr = spawnSync(bin, [bridge, 'read-values', file], { encoding: 'utf8' });
    if (rr.error) { lastErr = rr.error; continue; }
    if (rr.status !== 0) { lastErr = new Error(rr.stderr); continue; }
    out = JSON.parse((rr.stdout || '').trim()); break;
  }
  if (!out) { fs.rmSync(dir, { recursive: true, force: true }); throw lastErr || new Error('read-values 失败'); }
  assert.deepStrictEqual(out.columns.slice(0, 3), ['姓名', '部门', '工时'], '主键置首 + 列序');
  assert.strictEqual(out.rows.length, 0, '无数据行');
  fs.rmSync(dir, { recursive: true, force: true });
});
