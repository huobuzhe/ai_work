'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const E = require('../lib/engine');
const FS = require('../scripts/feishu-adapter');
const TS = require('../scripts/tencent-adapter');

const BRIDGE = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');
const PY = process.env.WORKBENCH_PY || 'python';

function probe(file) {
  return JSON.parse(execFileSync(PY, [BRIDGE, 'probe', file], { encoding: 'utf8' }).trim());
}

test('e2e-templates: load-templates.js 读仓内清单全合法，输出完整模板', () => {
  const p = path.join(__dirname, '..', 'scripts', 'load-templates.js');
  const out = JSON.parse(execFileSync(process.execPath, [p], { encoding: 'utf8' }));
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  assert.ok(out.templates.length >= 2, '至少两份仓内模板');
  out.templates.forEach(t => {
    assert.ok(t.name && t.primaryKey && t.columns && Object.keys(t.columns).length > 0);
  });
  assert.ok(typeof out.hostContract === 'string' && out.hostContract.length > 0, '带宿主契约说明');
  const names = out.templates.map(t => t.name);
  assert.ok(names.includes('员工工时表') && names.includes('项目预算表'));
});

test('e2e-templates: probe 正常 xlsx → isZip/openable 真', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-tpl-'));
  const ok = path.join(dir, 'ok.xlsx');
  // 用 python 造正常 xlsx，避免额外依赖
  execFileSync(PY, ['-c', 'from openpyxl import Workbook; Workbook().save(r"' + ok.replace(/\\/g, '/') + '")']);
  const pr = probe(ok);
  assert.equal(pr.ext, '.xlsx');
  assert.equal(pr.isZip, true);
  assert.equal(pr.openable, true);
  assert.equal(pr.hasMacro, false);
  assert.equal(E.checkUpload(pr).ok, true, '正常 xlsx 应通过 checkUpload');
});

test('e2e-templates: probe 伪装（非 zip 命名 .xlsx）→ 被 checkUpload 以格式拒', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-tpl-'));
  const fake = path.join(dir, 'fake.xlsx');
  fs.writeFileSync(fake, 'not a real workbook');
  const pr = probe(fake);
  assert.equal(pr.ext, '.xlsx');
  assert.equal(pr.isZip, false);
  const r = E.checkUpload(pr);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === '格式'));
});

test('e2e-templates: .xlsm 扩展名经 probe → checkUpload 以格式拒（不在白名单）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-tpl-'));
  const xlsm = path.join(dir, 'macro.xlsm');
  execFileSync(PY, ['-c', 'from openpyxl import Workbook; Workbook().save(r"' + xlsm.replace(/\\/g, '/') + '")']);
  const pr = probe(xlsm);
  assert.equal(pr.ext, '.xlsm');
  const r = E.checkUpload(pr);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === '格式' && /格式|不支持/.test(e.reason)));
});

test('e2e-templates: 全链路 probe → checkUpload → validateRows → createTable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-tpl-'));
  const csvp = path.join(dir, 'data.csv');
  fs.writeFileSync(csvp, '姓名,部门,工时,时薪\n阿岚,技术,160,80\n柏舟,技术,176,80\n');
  const pr = probe(csvp);
  assert.equal(E.checkUpload(pr).ok, true, 'csv 格式通过');
  const manifest = { schemaVersion: 1, name: '员工工时表', primaryKey: '姓名', columns: { 姓名: 'text', 部门: 'text', 工时: 'number', 时薪: 'number' } };
  const rows = [
    { 姓名: '阿岚', 部门: '技术', 工时: 160, 时薪: 80 },
    { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80 }
  ];
  assert.equal(E.validateRows(rows, manifest).ok, true);
  const built = E.createTable({ mode: 'upload', manifest, rows });
  assert.equal(built.ok, true);
  assert.equal(built.structure.rows.length, 2);
  assert.equal(built.structure.primaryKey, '姓名');
});

// ============================================================================
// 票 #37（Slice 2 / S6）：模板来源锁死仓内声明式清单（验证既有、不加产品行为）。
// #10/#16 已钉四入口、上传校验、冲突显式替换、registry 仓内加载；本票补四条
// 「边界不可越界」的回归护栏，全部针对既有实现，不改产品代码：
//  AC1 模板/注册表来源纯仓内文件桥：加载脚本无网络调用、只读 templates/ 与 registry/；
//  AC2 四入口（blank/template/upload/description）均走同一 createTable 引擎；云端
//      adapter 不另建表入口，本地与云端只导同一份仓内清单结构（不逐平台截图）；
//  AC3 type-mapping 名字级映射：值全为不含数字的名字串、与引擎 TYPE_MAP 同源；
//  AC4 冲突/上传校验单一引擎 seam，冲突显式替换（不静默覆盖/不自动合并）。
// 范围说明：AC2 只断言「四入口同引擎 + 云端 adapter 无独立 builder + 结构来自仓内清单」，
//  不逐平台实测云端建表（本切片不联网）——这是必要的验证边界，非覆盖缺口；
//  TYPE_MAP 只存名字级映射（str/text/number/…），平台特有的数字字段码在 adapter 的
//  FIELD_TYPE 表、由 unverifiedTypes[] 闸门管控，不属本票模板来源范围。
//  不引入在线模板中心/GitHub 拉取来源——这属产品改动、本票范围外。
// ============================================================================

function readSrc(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

// ---- AC1：仓内声明式清单为唯一来源，加载脚本纯文件桥、无网络 ----
test('#37 AC1 load-templates/load-registry 无网络拉取、只读仓内目录', () => {
  ['load-templates.js', 'load-registry.js'].forEach(f => {
    const src = readSrc(path.join('scripts', f));
    assert.ok(!/node:https?|require\(['"]https?['"]\)/.test(src), f + ' 不得引入 http(s)');
    assert.ok(!/\bfetch\s*\(/.test(src), f + ' 不得调用 fetch');
    assert.ok(!/axios|node-fetch|got\(/.test(src), f + ' 不得引入网络客户端');
    assert.ok(/readdirSync|readFileSync/.test(src), f + ' 只读本地文件');
  });
  const p = path.join(__dirname, '..', 'scripts', 'load-templates.js');
  const out = JSON.parse(execFileSync(process.execPath, [p], { encoding: 'utf8' }));
  assert.equal(out.ok, true);
  const tplDir = path.join(__dirname, '..', 'templates');
  out.templates.forEach(t => {
    assert.ok(!/^https?:|^git@/.test(t.file), '来源字段不得是在线 URL：' + t.file);
    assert.ok(fs.existsSync(path.join(tplDir, t.file)), '来源必须是仓内文件：' + t.file);
    assert.ok(!/type-mapping/.test(t.file), 'type-mapping 不是模板清单条目');
  });
});

// ---- AC2：四入口共用同一引擎、读同一份仓内清单；云端 adapter 不另起建表入口 ----
test('#37 AC2 四入口共用 createTable 引擎读同一份仓内清单，云端 adapter 无独立 builder', () => {
  // 用仓内真实清单文件（非内联对象）驱动，确认「读同一份仓内清单」不是回显内联输入。
  const manifest = JSON.parse(readSrc(path.join('templates', 'employee-worklog.json')));
  const tpl = E.createTable({ mode: 'template', manifest });
  const up = E.createTable({ mode: 'upload', manifest, rows: [{ 姓名: '阿岚', 部门: '技术', 工时: 8, 时薪: 80, 备注: 'x' }] });
  const blank = E.createTable({ mode: 'blank' });
  const desc = E.createTable({ mode: 'description', description: '主键姓名（文本）、列：姓名（文本）、工时（数字）' });
  [tpl, up, blank, desc].forEach(r => assert.equal(r.ok, true, '四入口均返回结构'));
  // 同引擎同一份清单：template/upload 的列/类型/主键来自文件，非内联回显；
  // blank/description 是同一 createTable 的不同 mode（各自结构不同但不另起引擎）。
  assert.deepEqual(tpl.structure.columns, Object.keys(manifest.columns), 'template 列来自仓内清单文件');
  assert.equal(tpl.structure.primaryKey, manifest.primaryKey, 'template 主键来自仓内清单文件');
  assert.deepEqual(up.structure.types, tpl.structure.types, 'upload 与 template 同清单元数据');
  assert.equal(blank.structure.mode, 'blank', 'blank 走同一引擎的 blank 模式');
  assert.equal(desc.structure.mode, 'description', 'description 走同一引擎的 description 模式');
  // API 面断言（非行为快照）：云端 adapter 只导出 runLive/materialize/main，
  // 没有 createTable/checkUpload/validateRows/loadTemplates/loadRegistry 独立 builder，
  // 故云端建表结构只能来自共用引擎——本地/云端同一套清单结构的依据在此。
  [['feishu', FS], ['tencent', TS]].forEach(([name, adapter]) => {
    ['createTable', 'checkUpload', 'validateRows', 'loadTemplates', 'loadRegistry'].forEach(builder => {
      assert.equal(typeof adapter[builder], 'undefined', name + ' adapter 不得自带 ' + builder + '（应共用引擎）');
    });
  });
});

// ---- AC3：type-mapping 名字级映射，无数字类型编码，与引擎同源 ----
test('#37 AC3 type-mapping.json 名字级映射：值全为字符串名、无数字编码、与引擎 TYPE_MAP 同源', () => {
  const tm = JSON.parse(readSrc(path.join('templates', 'type-mapping.json')));
  assert.deepEqual(tm.TYPE_ENUM.slice().sort(), E.TYPE_ENUM.slice().sort(), 'TYPE_ENUM 与引擎一致');
  const platforms = ['local', 'feishu', 'tencent'];
  E.TYPE_ENUM.forEach(t => {
    assert.ok(tm.MAP[t], 'MAP 覆盖 ' + t);
    platforms.forEach(p => {
      const v = tm.MAP[t][p];
      assert.equal(typeof v, 'string', t + '.' + p + ' 须为字符串名');
      assert.ok(!/\d/.test(v), t + '.' + p + ' 不得含数字类型编码（含内嵌如 ft_5/type:2）：' + v);
      assert.equal(v, E.TYPE_MAP[t][p], t + '.' + p + ' 与引擎 TYPE_MAP 同源');
    });
  });
});

// ---- AC4：单一引擎 seam，冲突显式替换（不静默覆盖/不自动合并）----
test('#37 AC4 冲突/上传校验单一引擎 seam，冲突须显式替换（不静默覆盖）', () => {
  ['checkUpload', 'validateRows', 'detectConflicts', 'createTable'].forEach(k => {
    assert.equal(typeof E[k], 'function', '共用引擎导出 ' + k);
  });
  const existing = [{ schemaVersion: 1, name: '员工工时表', primaryKey: '姓名', columns: { 姓名: 'text' } }];
  const incoming = { schemaVersion: 1, name: '员工工时表', columns: { 姓名: 'text', 工时: 'number' } };
  const denied = E.detectConflicts(incoming, existing, false);
  assert.equal(denied.allowed, false, '冲突默认拒绝，不静默覆盖');
  assert.ok(denied.conflicts.length > 0, '确检测到冲突（非「零命中」假拒绝）');
  assert.equal(denied.autoMerged, false, '不自动合并');
  const allowed = E.detectConflicts(incoming, existing, true);
  assert.equal(allowed.allowed, true, '显式 replace 才放行');
  assert.equal(allowed.replace, true, '标记显式替换');
});
