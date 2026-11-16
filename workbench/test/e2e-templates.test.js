'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const E = require('../lib/engine');

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
