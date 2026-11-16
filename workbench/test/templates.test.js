'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');

// 一张合法模板清单（仓内声明式文件的内存形态）
function manifest(over) {
  return Object.assign({
    schemaVersion: 1,
    name: '员工工时表',
    primaryKey: '姓名',
    columns: { 姓名: 'text', 部门: 'text', 工时: 'number', 时薪: 'number' }
  }, over || {});
}

// ---------------- AC1：清单校验 + 四种入口建结构 ----------------
test('AC1 TYPE_ENUM 是三家交集五类且 TYPE_MAP 全覆盖', () => {
  assert.deepEqual(E.TYPE_ENUM.slice().sort(), ['bool', 'date', 'enum', 'number', 'text']);
  E.TYPE_ENUM.forEach(t => assert.ok(E.TYPE_MAP[t], '每类有平台字段映射: ' + t));
});

test('AC1 合法清单通过校验，产出结构（primaryKey 默认姓名）', () => {
  const r = E.validateManifest(manifest());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.structure.primaryKey, '姓名');
  assert.deepEqual(r.structure.columns, ['姓名', '部门', '工时', '时薪']);
});

test('AC1 无 primaryKey 默认为姓名', () => {
  const m = manifest(); delete m.primaryKey;
  const r = E.validateManifest(m);
  assert.equal(r.ok, true);
  assert.equal(r.structure.primaryKey, '姓名');
});

test('AC1 四种建表入口都产出统一结构', () => {
  const blank = E.createTable({ mode: 'blank' });
  assert.equal(blank.ok, true);
  assert.equal(blank.structure.mode, 'blank');
  const tpl = E.createTable({ mode: 'template', manifest: manifest() });
  assert.equal(tpl.ok, true);
  assert.deepEqual(tpl.structure.columns, ['姓名', '部门', '工时', '时薪']);
  const up = E.createTable({ mode: 'upload', manifest: manifest(), rows: [{ 姓名: '阿岚', 部门: '技术', 工时: 8, 时薪: 100 }] });
  assert.equal(up.ok, true);
  assert.equal(up.structure.rows.length, 1);
  const desc = E.createTable({ mode: 'description', description: '一张员工表，列：姓名（文本）、工时（数字），主键姓名' });
  assert.equal(desc.ok, true);
  assert.deepEqual(desc.structure.columns, ['姓名', '工时']);
});

// ---------------- AC2：上传格式 / 必填列 / 主键 / 类型校验 ----------------
test('AC2 格式白名单：.xlsx/.csv/.tsv 收，.xls/.xlsb 拒并报格式列', () => {
  assert.equal(E.checkUpload({ filename: 'a.xlsx', ext: '.xlsx', isZip: true, openable: true, hasMacro: false }).ok, true);
  assert.equal(E.checkUpload({ filename: 'a.csv', ext: '.csv', isZip: false, openable: true, hasMacro: false }).ok, true);
  ['.xls', '.xlsb'].forEach(ext => {
    const r = E.checkUpload({ filename: 'a' + ext, ext, isZip: false, openable: true, hasMacro: false });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.field === '格式'), ext + ' 应报格式列');
  });
});

test('AC2 加密 / 带宏 / 改名伪装被拒并报格式列', () => {
  const enc = E.checkUpload({ filename: 'a.xlsx', ext: '.xlsx', isZip: true, openable: false, encrypted: true, hasMacro: false });
  assert.equal(enc.ok, false);
  assert.ok(enc.errors.some(e => e.field === '格式' && /加密/.test(e.reason)));
  const macro = E.checkUpload({ filename: 'a.xlsx', ext: '.xlsx', isZip: true, openable: true, hasMacro: true });
  assert.equal(macro.ok, false);
  assert.ok(macro.errors.some(e => e.field === '格式' && /宏/.test(e.reason)));
  const fake = E.checkUpload({ filename: 'a.xlsx', ext: '.xlsx', isZip: false, openable: false, hasMacro: false });
  assert.equal(fake.ok, false);
  assert.ok(fake.errors.some(e => e.field === '格式' && /伪装|非.*xlsx|魔数/.test(e.reason)));
});

test('AC2 必填列缺失报具体列', () => {
  const r = E.validateRows([{ 姓名: '阿岚' }], manifest());
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === '部门' && /必填|缺/.test(e.reason)));
});

test('AC2 主键重复 / 空值报主键列', () => {
  const dup = E.validateRows([{ 姓名: '阿岚', 工时: 8 }, { 姓名: '阿岚', 工时: 9 }], manifest());
  assert.equal(dup.ok, false);
  assert.ok(dup.errors.some(e => e.field === '姓名' && /唯一|重复/.test(e.reason)));
  const empty = E.validateRows([{ 姓名: '', 工时: 8 }], manifest());
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some(e => e.field === '姓名' && /非空|空/.test(e.reason)));
});

test('AC2 类型不可映射报类型列', () => {
  const m = manifest({ columns: { 姓名: 'text', 工时: 'number', 备注: 'blob' } });
  const r = E.validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === '类型' || e.field === '备注'));
});

// ---------------- AC3：冲突检测 + 显式替换 ----------------
test('AC3 同名不同内容逐条列冲突项并拒绝', () => {
  const existing = [manifest()];
  const incoming = manifest({ columns: { 姓名: 'text', 工时: 'number' } });
  const r = E.detectConflicts(incoming, existing, false);
  assert.equal(r.allowed, false);
  assert.ok(r.conflicts.length >= 1);
  assert.ok(r.conflicts.some(c => /列|columns/.test((c.field || '') + (c.reason || ''))));
});

test('AC3 同主键不同模板名也判冲突', () => {
  const existing = [manifest({ name: '旧名' })];
  const incoming = manifest({ name: '新名', columns: { 姓名: 'text', 工时: 'number' } });
  const r = E.detectConflicts(incoming, existing, false);
  assert.equal(r.allowed, false);
  assert.ok(r.conflicts.some(c => /主键|primaryKey/.test((c.field || '') + (c.reason || ''))));
});

test('AC3 显式 replace 才放行，且不自动合并', () => {
  const existing = [manifest()];
  const incoming = manifest({ columns: { 姓名: 'text', 工时: 'number' } });
  const r = E.detectConflicts(incoming, existing, true);
  assert.equal(r.allowed, true, '显式替换放行');
  assert.equal(r.autoMerged, false, '不自动合并');
});

test('AC3 无冲突（不同名不同主键）放行', () => {
  const existing = [manifest()];
  const incoming = manifest({ name: '客户表', primaryKey: '客户号', columns: { 客户号: 'text', 等级: 'enum' } });
  const r = E.detectConflicts(incoming, existing, false);
  assert.equal(r.allowed, true);
  assert.equal(r.conflicts.length, 0);
});

// ---------------- AC4：主键可配置 + 映射表进仓内 ----------------
test('AC4 主键可配置为非姓名列', () => {
  const m = manifest({ primaryKey: '工号', columns: { 工号: 'text', 工时: 'number' } });
  const r = E.validateManifest(m);
  assert.equal(r.ok, true);
  assert.equal(r.structure.primaryKey, '工号');
});

test('AC4 主键不在 columns 中报具体错误', () => {
  const m = manifest({ primaryKey: '工号', columns: { 姓名: 'text', 工时: 'number' } });
  const r = E.validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'primaryKey' || /主键.*不在/.test(e.reason)));
});

// ---------------- AC5：描述建表信息不足就问，不猜值 ----------------
test('AC5 信息不足返回 questions，不填猜测值', () => {
  const r = E.createTable({ mode: 'description', description: '帮我建个表' });
  assert.equal(r.ok, false);
  assert.ok(Array.isArray(r.questions) && r.questions.length > 0);
  assert.equal(r.structure, undefined, '信息不足不产出结构（不猜值）');
});

test('AC5 信息充分时产出结构且无 questions', () => {
  const r = E.createTable({ mode: 'description', description: '建一张项目表，主键项目号（文本），列：项目号（文本）、预算（数字）、截止（日期）' });
  assert.equal(r.ok, true);
  assert.equal(r.structure.primaryKey, '项目号');
  assert.deepEqual(r.structure.columns, ['项目号', '预算', '截止']);
  assert.ok(!r.questions || r.questions.length === 0);
});

// ---------------- 与主 seam 共用引擎 ----------------
test('主 seam：validateManifest/checkUpload/detectConflicts/createTable 从同一引擎导出', () => {
  ['validateManifest', 'checkUpload', 'validateRows', 'detectConflicts', 'createTable', 'TYPE_ENUM', 'TYPE_MAP'].forEach(k => {
    assert.ok(E[k] !== undefined, '引擎应导出 ' + k);
  });
  assert.ok(require('../lib/engine') === E, '单一引擎实例');
});

// ---------------- review 修复回归 ----------------
test('REVIEW M1：描述建表对无类型列发问，不静默丢列', () => {
  const r = E.createTable({ mode: 'description', description: '建员工表，主键姓名，列：姓名（文本）、工时（数字）、奖金' });
  assert.equal(r.ok, false);
  assert.equal(r.structure, undefined, '有列缺类型时不产出结构');
  assert.ok(r.questions.some(q => /奖金/.test(q)), '应就「奖金」缺类型发问');
});

test('REVIEW M2：requiredColumns 白名单只校验其列必填，缺省列可选', () => {
  const m = manifest({ requiredColumns: ['姓名', '工时'] });
  const vm = E.validateManifest(m);
  assert.equal(vm.ok, true);
  assert.deepEqual(vm.structure.required.slice().sort(), ['姓名', '工时'].sort());
  // 缺「部门」（非 required）应通过；缺「工时」（required）应失败
  assert.equal(E.validateRows([{ 姓名: '阿岚', 工时: 8 }], m).ok, true);
  assert.equal(E.validateRows([{ 姓名: '阿岚' }], m).ok, false);
});

test('REVIEW M2：requiredColumns 缺省=全部必填；主键恒必填；含未知列报错', () => {
  // 缺省：全列必填（原有行为）
  assert.equal(E.validateRows([{ 姓名: '阿岚' }], manifest()).ok, false);
  // 主键即使不在 requiredColumns 也被视为必填
  const m = manifest({ requiredColumns: ['工时'] });
  const req = E.validateManifest(m).structure.required;
  assert.ok(req.indexOf('姓名') >= 0, '主键列恒必填');
  // requiredColumns 含不在 columns 的列 → 报错
  const bad = E.validateManifest(manifest({ requiredColumns: ['不存在的列'] }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => /不存在的列/.test(e.reason) || e.field === '不存在的列'));
});

test('REVIEW LOW1：detectConflicts 对 null/undefined incoming 不崩溃、不放行', () => {
  [null, undefined].forEach(v => {
    const r = E.detectConflicts(v, [{ name: 'x' }], false);
    assert.equal(r.allowed, false, String(v) + ' 不应静默放行');
    assert.ok(r.conflicts.length >= 1);
  });
});

test('REVIEW LOW：checkUpload 对加密短路返回单条加密错，不与伪装重复', () => {
  const r = E.checkUpload({ filename: 'a.xlsx', ext: '.xlsx', isZip: true, openable: false, encrypted: true });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1, '只报一条加密错');
  assert.ok(/加密/.test(r.errors[0].reason));
});

test('REVIEW LOW2：detectConflicts schemaVersion 冲突分支；createTable 未知 mode；validateRows 空表', () => {
  const a = manifest();
  const b = manifest({ schemaVersion: 2, columns: Object.assign({}, manifest().columns) });
  // schemaVersion 不一致（同名列同名）：需绕过 validateManifest 直接比对
  const r = E.detectConflicts(b, [a], false);
  assert.ok(r.conflicts.some(c => c.field === 'schemaVersion'), 'schemaVersion 冲突应被列出');
  const bad = E.createTable({ mode: 'nope' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.field === 'mode'));
  const empty = E.validateRows([], manifest());
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some(e => e.field === 'rows'));
});

test('REVIEW LOW3：.tsv 白名单通过；真带宏 probe（hasMacro）被拒并报宏', () => {
  assert.equal(E.checkUpload({ filename: 'a.tsv', ext: '.tsv', isZip: false, openable: true, hasMacro: false }).ok, true);
  const r = E.checkUpload({ filename: 'a.xlsx', ext: '.xlsx', isZip: true, openable: true, hasMacro: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /宏/.test(e.reason)));
});
