'use strict';
/**
 * 票 #16：仓内按钮注册表（预置按钮）与固化按钮统一入口。
 * 全部经公开 seam（engine 的 loadRegistry / projectButtonLibrary / reduce / initial）
 * 验外部行为，不测内部实现细节。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../lib/engine');
const C = require('../client');

function mkState() {
  return E.initial({
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪', '备注'],
    rows: [
      { 姓名: '阿岚', 部门: '技术', 工时: 160, 时薪: 80, 备注: 'n1' },
      { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 80, 备注: 'n2' },
      { 姓名: '岑溪', 部门: '运营', 工时: 96, 时薪: 60, 备注: 'n3' },
      { 姓名: '丁野', 部门: '运营', 工时: 144, 时薪: 60, 备注: 'n4' },
      { 姓名: '尔芙', 部门: '人事', 工时: 88, 时薪: 70, 备注: 'n5' }
    ],
    sources: { '外勤登记表.csv': { 姓名: 'text', 邮箱: 'text' } }
  });
}

function validEntry(over) {
  return Object.assign({
    schemaVersion: 1,
    name: '补邮箱',
    source: 'preset',
    kind: 'extract',
    params: { 来源文件: '外勤登记表.csv', 匹配列: '姓名', 取哪一列: '邮箱', 写到: '邮箱', scope: 'all', 条件: '' }
  }, over || {});
}

// ---------- AC1：注册表加载 ----------
test('AC1 loadRegistry 空输入 → ok、accepted 空、total 0', () => {
  const r = E.loadRegistry([], mkState());
  assert.equal(r.ok, true);
  assert.deepEqual(r.accepted, []);
  assert.equal(r.total, 0);
});

test('AC1 合法条目被接受，含来源 preset 与派生声明式配方', () => {
  const r = E.loadRegistry([validEntry()], mkState());
  assert.equal(r.ok, true);
  assert.equal(r.accepted.length, 1);
  const b = r.accepted[0];
  assert.equal(b.name, '补邮箱');
  assert.equal(b.source, 'preset');
  assert.equal(b.kind, 'extract');
  assert.equal(b.schemaVersion, 1);
  assert.match(b.id, /^p\d+$/);
  assert.ok(Array.isArray(b.steps) && b.steps.length > 0, '带派生步骤');
  assert.ok(b.medium && typeof b.medium === 'string', '带声明式介质');
});

// ---------- AC3：条目字段齐全 ----------
test('AC3 条目字段：按钮名/参数定义/声明式配方/来源/schemaVersion 都进按钮', () => {
  const r = E.loadRegistry([validEntry({ name: '算应发', kind: 'function',
    params: { 表达式: '工时 * 时薪', 输出列: '应发', scope: 'all', 条件: '' } })], mkState());
  assert.equal(r.ok, true);
  const b = r.accepted[0];
  assert.equal(b.name, '算应发');
  assert.equal(b.kind, 'function');
  assert.equal(b.params['输出列'], '应发');
  assert.equal(b.params['表达式'], '工时 * 时薪');
  assert.equal(b.source, 'preset');
  assert.equal(b.schemaVersion, 1);
});

// ---------- AC4：加载时封闭校验，与配方校验共用规则 ----------
test('AC4 未知 schemaVersion 被拒并报原因', () => {
  const r = E.loadRegistry([validEntry({ schemaVersion: 99 })], mkState());
  assert.equal(r.ok, false);
  assert.equal(r.accepted.length, 0);
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].reason, /schemaVersion/);
});

test('AC4 缺 schemaVersion 被拒', () => {
  const e = validEntry(); delete e.schemaVersion;
  const r = E.loadRegistry([e], mkState());
  assert.equal(r.ok, false);
  assert.match(r.rejected[0].reason, /schemaVersion/);
});

test('AC4 未知顶层字段被拒（封闭白名单）', () => {
  const r = E.loadRegistry([validEntry({ executableCode: 'alert(1)' })], mkState());
  assert.equal(r.ok, false);
  assert.match(r.rejected[0].reason, /未知字段/);
});

test('AC4 来源必须是 preset', () => {
  const r = E.loadRegistry([validEntry({ source: 'user' })], mkState());
  assert.equal(r.ok, false);
  assert.match(r.rejected[0].reason, /preset/);
});

test('AC4 缺按钮名被拒', () => {
  const r = E.loadRegistry([validEntry({ name: '' })], mkState());
  assert.equal(r.ok, false);
  assert.match(r.rejected[0].reason, /name|按钮名/);
});

test('AC4 未知参数字段被拒，且与配方校验共用同一规则', () => {
  const entry = validEntry(); entry.params['凭空字段'] = 'x';
  const r = E.loadRegistry([entry], mkState());
  assert.equal(r.ok, false);
  assert.match(r.rejected[0].reason, /未知字段.*凭空字段/);
  // 同一条 params 在配方校验里也必须失败（共用规则）
  const draft = E.buildDraft('extract', '', entry.params);
  assert.equal(E.validate(draft, mkState()).ok, false);
});

test('AC4 非法条件（scope=match + AND）被拒，与配方校验同一条件闭包', () => {
  const entry = validEntry();
  entry.params.scope = 'match';
  entry.params['条件'] = '工时 > 150 AND 部门 = 技术';
  const r = E.loadRegistry([entry], mkState());
  assert.equal(r.ok, false);
  assert.match(r.rejected[0].reason, /条件|AND/);
});

test('AC4 缺必填参数被拒', () => {
  const entry = validEntry(); delete entry.params['来源文件'];
  const r = E.loadRegistry([entry], mkState());
  assert.equal(r.ok, false);
  assert.match(r.rejected[0].reason, /来源文件/);
});

test('AC4 按钮名重复被拒', () => {
  const r = E.loadRegistry([validEntry(), validEntry()], mkState());
  assert.equal(r.ok, false);
  assert.equal(r.accepted.length, 1);
  assert.match(r.rejected[0].reason, /重复/);
});

test('AC4 一条非法不影响其它合法条目（逐条拒绝，不整体失败）', () => {
  const bad = validEntry({ schemaVersion: 77, name: '坏条目' });
  const good = validEntry({ name: '好条目' });
  const r = E.loadRegistry([bad, good], mkState());
  assert.equal(r.ok, false);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].name, '好条目');
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].name, '坏条目');
});

// ---------- AC2：统一入口、来源可区分 ----------
test('AC2 projectButtonLibrary 合并预置+固化按钮，来源可区分', () => {
  const s = mkState();
  const s2 = E.reduce(s, { type: 'QUICK', kind: 'swap', params: { 字段A: '部门', 字段B: '备注' } });
  const s3 = E.reduce(s2, { type: 'CONFIRM' });
  const s4 = E.reduce(s3, { type: 'SOLIDIFY', name: '我对调' });
  const loaded = E.loadRegistry([validEntry({ name: '预置补邮箱' })], s4);
  const merged = E.hydrateRegistry(s4, loaded.accepted);
  const lib = C.projectButtonLibrary(merged);
  assert.equal(lib.total, 2);
  const bySource = {};
  lib.buttons.forEach(b => { bySource[b.source] = (bySource[b.source] || 0) + 1; });
  assert.equal(bySource.preset, 1);
  assert.equal(bySource.user, 1);
  assert.ok(lib.buttons.some(b => b.name === '预置补邮箱' && b.source === 'preset'));
  assert.ok(lib.buttons.some(b => b.name === '我对调' && b.source === 'user'));
});

test('AC2 固化按钮 source=user、预置按钮 source=preset，clone/水合不丢来源', () => {
  const s = mkState();
  const s2 = E.reduce(s, { type: 'QUICK', kind: 'swap', params: { 字段A: '部门', 字段B: '备注' } });
  const s3 = E.reduce(E.reduce(s2, { type: 'CONFIRM' }), { type: 'SOLIDIFY', name: '我对调' });
  assert.equal(s3.buttons[0].source, 'user');
  const loaded = E.loadRegistry([validEntry()], s3);
  const merged = E.hydrateRegistry(s3, loaded.accepted);
  assert.equal(merged.registryButtons[0].source, 'preset');
  // 导出/水合往返保留来源与版本
  const exported = E.exportButtons(merged) || [];
  assert.ok(Array.isArray(exported));
});

test('AC2 id 不冲突：预置用 p 前缀、固化用 b 前缀', () => {
  const s = mkState();
  const s2 = E.reduce(s, { type: 'QUICK', kind: 'swap', params: { 字段A: '部门', 字段B: '备注' } });
  const s3 = E.reduce(E.reduce(s2, { type: 'CONFIRM' }), { type: 'SOLIDIFY', name: '我对调' });
  const loaded = E.loadRegistry([validEntry()], s3);
  const merged = E.hydrateRegistry(s3, loaded.accepted);
  const lib = C.projectButtonLibrary(merged);
  const ids = lib.buttons.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length, 'id 唯一');
});

// ---------- AC5：仓内注册表文件、git 留痕 ----------
test('AC5 仓内注册表目录存在，每按钮一份 JSON，全部能通过 loadRegistry', () => {
  const regDir = path.join(__dirname, '..', 'registry');
  assert.ok(fs.existsSync(regDir), 'registry 目录应存在');
  const files = fs.readdirSync(regDir).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 2, '至少两份预置按钮 JSON');
  const entries = files.map(f => JSON.parse(fs.readFileSync(path.join(regDir, f), 'utf8')));
  const r = E.loadRegistry(entries, mkState());
  assert.equal(r.rejected.length, 0, '仓内条目应全部合法：' + JSON.stringify(r.rejected));
  assert.equal(r.accepted.length, files.length);
  assert.ok(r.accepted.every(b => b.source === 'preset'));
});

test('AC5 加载脚本存在且为纯文件桥（读 JSON → 调引擎）', () => {
  const p = path.join(__dirname, '..', 'scripts', 'load-registry.js');
  assert.ok(fs.existsSync(p), 'scripts/load-registry.js 应存在');
  const src = fs.readFileSync(p, 'utf8');
  assert.match(src, /loadRegistry/, '调用引擎的 loadRegistry');
  assert.match(src, /readFileSync|readdirSync/, '只做文件读取');
});

// ---------- H1 修复：预置按钮生产接线（加载清单完整 + 可一键运行 + 可 seed） ----------
test('H1 加载脚本输出完整清单：registryButtons 每项含 params/medium/steps/source/schemaVersion', () => {
  const { execFileSync } = require('node:child_process');
  const p = path.join(__dirname, '..', 'scripts', 'load-registry.js');
  const out = execFileSync(process.execPath, [p], { encoding: 'utf8' });
  const manifest = JSON.parse(out);
  assert.equal(manifest.ok, true);
  assert.ok(Array.isArray(manifest.registryButtons) && manifest.registryButtons.length >= 2);
  manifest.registryButtons.forEach(b => {
    assert.equal(b.source, 'preset');
    assert.equal(b.schemaVersion, 1);
    assert.ok(b.params && typeof b.params === 'object' && Object.keys(b.params).length > 0, '带完整 params');
    assert.ok(typeof b.medium === 'string' && b.medium.length > 0, '带 medium');
    assert.ok(Array.isArray(b.steps) && b.steps.length > 0, '带 steps');
  });
  assert.match(manifest.hostContract, /registryButtons/, '带宿主 seed 契约说明');
});

test('H1 加载脚本的 registryButtons 可直接 seed 进 initial()，预置按钮出现在按钮库', () => {
  const { execFileSync } = require('node:child_process');
  const p = path.join(__dirname, '..', 'scripts', 'load-registry.js');
  const manifest = JSON.parse(execFileSync(process.execPath, [p], { encoding: 'utf8' }));
  const base = mkState();
  const seeded = E.initial({
    primaryKey: base.primaryKey, columns: base.columns, rows: base.rows,
    sources: base.sources, registryButtons: manifest.registryButtons
  });
  const lib = C.projectButtonLibrary(seeded);
  assert.equal(lib.total, manifest.registryButtons.length);
  assert.ok(lib.buttons.every(b => b.source === 'preset'));
  assert.ok(lib.buttons.every(b => b.params && Object.keys(b.params).length > 0), 'seed 后按钮配方非空');
});

test('H1 预置按钮可一键运行（统一入口：preset 与 user 都能 RUN_BUTTON）', () => {
  const base = mkState();
  // extract 的 preview 需要源文件的数据行（mkState 的 sources 只有列定义，供 validate 用）。
  const sources = Object.assign({}, base.sources);
  sources['外勤登记表.csv'] = {
    姓名: 'text', 邮箱: 'text',
    rows: [
      { 姓名: '阿岚', 邮箱: 'alan@example.com' }, { 姓名: '柏舟', 邮箱: 'baizhou@example.com' },
      { 姓名: '岑溪', 邮箱: 'cenxi@example.com' }, { 姓名: '丁野', 邮箱: 'dingye@example.com' },
      { 姓名: '尔芙', 邮箱: 'erfu@example.com' }
    ]
  };
  const s = E.initial({ primaryKey: base.primaryKey, columns: base.columns, rows: base.rows, sources: sources });
  const loaded = E.loadRegistry([validEntry({
    name: '预置补邮箱',
    params: { 来源文件: '外勤登记表.csv', 匹配列: '姓名', 取哪一列: '邮箱', 写到: '邮箱', scope: 'all', 条件: '' }
  })], s);
  const seeded = E.hydrateRegistry(s, loaded.accepted);
  const presetId = seeded.registryButtons[0].id;
  const ran = E.reduce(seeded, { type: 'RUN_BUTTON', id: presetId });
  assert.equal(ran.stage, 'EXECUTED', '预置按钮一键运行成功');
  assert.equal(ran.rows[0]['邮箱'], 'alan@example.com', '预置按钮真的写了格子');
  assert.ok(ran.registryButtons[0].lastAffectedRows > 0, '预置按钮运行态标记更新');
});

// ---------- Standards review 测试缺口 ----------
test('S1 导出/水合往返保留 source 与 schemaVersion（旧断言只查 Array.isArray，补真实断言）', () => {
  const s = mkState();
  const s2 = E.reduce(s, { type: 'QUICK', kind: 'swap', params: { 字段A: '部门', 字段B: '备注' } });
  const s3 = E.reduce(E.reduce(s2, { type: 'CONFIRM' }), { type: 'SOLIDIFY', name: '我对调' });
  const exported = E.exportButtons(s3);
  assert.equal(exported.length, 1);
  assert.equal(exported[0].source, 'user');
  assert.equal(exported[0].schemaVersion, 1);
  const rehydrated = E.initial({ columns: s3.columns, rows: s3.rows, sources: s3.sources, buttons: exported });
  assert.equal(rehydrated.buttons[0].source, 'user');
  assert.equal(rehydrated.buttons[0].schemaVersion, 1);
});

test('S2 legacy 按钮（无 source/schemaVersion）经 initial/export 默认为 user/SCHEMA_VERSION', () => {
  const legacy = { id: 'b1', name: '旧按钮', kind: 'swap', params: { 字段A: '部门', 字段B: '备注' }, medium: 'x', steps: ['s'] };
  const s = E.initial({ columns: mkState().columns, rows: mkState().rows, buttons: [legacy] });
  assert.equal(s.buttons[0].source, 'user', '缺 source 默认 user');
  assert.equal(s.buttons[0].schemaVersion, E.SCHEMA_VERSION, '缺 schemaVersion 默认当前版本');
  assert.equal(E.exportButtons(s)[0].source, 'user');
});

test('S3 防御性拷贝：改 loadRegistry 入参条目 / 改返回按钮，不污染内部与其它按钮', () => {
  const entry = validEntry();
  const r = E.loadRegistry([entry], mkState());
  const b = r.accepted[0];
  b.params['写到'] = '篡改';
  b.steps.push('额外步骤');
  assert.equal(entry.params['写到'], '邮箱', '改返回按钮不污染源条目');
  const r2 = E.loadRegistry([entry], mkState());
  assert.equal(r2.accepted[0].params['写到'], '邮箱', '第二次加载不受第一次改动影响');
});

test('S4 seenNames 不用原型字典：constructor/__proto__ 等名字不被误判为重复', () => {
  const e1 = validEntry({ name: 'constructor' });
  const e2 = validEntry({ name: '__proto__' });
  e2.params['写到'] = '邮箱2';
  const r = E.loadRegistry([e1, e2], mkState());
  assert.equal(r.rejected.length, 0, '原型链上的名字不应被误判重复：' + JSON.stringify(r.rejected));
  assert.equal(r.accepted.length, 2);
});

