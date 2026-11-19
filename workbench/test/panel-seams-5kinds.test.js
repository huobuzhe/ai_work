'use strict';
// 票 #56 回归补充（真实接缝缺口修复 #57）：
// 五动作在真实面板路径各跑一遍时发现的两个缺口，此文件用**真实 makeActionHandler + 真实
// defaultReadTable/defaultApplyTable/defaultRecalc（真 python 桥 + 真 LibreOffice Kit）**
// 端到端覆盖，防止回退：
//   缺口 A（extract）：defaultReadTable 此前只回 {columns,rows}、无 sources →
//     引擎 extract 的「来源文件」永远报「不在声明式数据源里」→ extract 在真实面板不可用。
//     修复：defaultReadTable 收集同目录 .csv/.xlsx 兄弟文件为 sources（collectSiblingSources）。
//   缺口 B（function）：xlsx_bridge.py apply 只写公式字符串、不计算；read-values 用
//     data_only=True 读缓存值 → 新写公式无缓存 → 应发列读回为空（看似没算）。
//     修复：写公式后就地重算（defaultRecalc 调 bundled LibreOffice Kit，tmp 输出再回写）。
//
// 与 panel-e2e-real.test.js 的区别：那边驱动真实 React 组件（swap 全链 + lowercase 路径）；
// 这边聚焦两个新接缝的 Host 侧闭链，不重复 React 垫片。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const {
  makeActionHandler, defaultReadTable, defaultApplyTable, defaultRecalc, collectSiblingSources,
  loadSourcesForExtract, invalidateReadCache
} = require('../lib/panel-bridge');
const { createSessionStore } = require('../lib/panel-session');

const BRIDGE = path.join(__dirname, '..', 'scripts', 'xlsx_bridge.py');

function py(args) {
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let lastErr = null;
  for (const bin of candidates) {
    const r = spawnSync(bin, [BRIDGE].concat(args), { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { lastErr = r.error; continue; }
    if (r.status !== 0) { lastErr = new Error(r.stderr || ('exit ' + r.status)); continue; }
    return (r.stdout || '').trim();
  }
  throw lastErr || new Error('python 不可用');
}
function pyReadValues(file) { return JSON.parse(py(['read-values', file])); }

function makeTable(dir, structure) {
  const file = path.join(dir, 'main.xlsx');
  const s = path.join(dir, 'structure.json');
  fs.writeFileSync(s, JSON.stringify(structure), 'utf8');
  py(['create', file, s]);
  return file;
}

function makeHandler() {
  return makeActionHandler({
    readTable: defaultReadTable,
    applyTable: defaultApplyTable,
    recalc: defaultRecalc,
    resolveFile: (f) => f,
    store: createSessionStore({ loadButtons: () => null, saveButtons: () => true, loadRegistry: () => [] })
  });
}
function act(h, file, action) {
  return h({ method: 'POST', url: '/workbench-api/action', body: JSON.stringify({ file, action }) }).body;
}

// 面板「五动作一键化」回归：每个快捷按钮发 QUICK，须在任意真实表上直接出合法预览（PREVIEWED）。
// 关键缺口：QUICK 在引擎 reduce 内部立刻 preview+校验，默认列名（部门/备注）落真实表必失败；
// 修复：panel-session 在 QUICK 前按真实列预归一化 params（preNormalizeQuickParams），
// 且 extract 的 QUICK 需在 handler 里同样挂 sources。此测试钉住五个动作全部直达 PREVIEWED。
test('一键动作 QUICK：五动作在真实表上都能直接出合法预览（PREVIEWED）', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-quick5-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let file;
  try {
    file = makeTable(dir, {
      primaryKey: '姓名',
      columns: { 姓名: 'text', 工时: 'number', 时薪: 'number' }, name: '一键五动作',
      rows: [
        { 姓名: '阿岚', 工时: 160, 时薪: 80 },
        { 姓名: '柏舟', 工时: 176, 时薪: 90 }
      ]
    });
    // extract 需要同目录兄弟数据源
    fs.writeFileSync(path.join(dir, '外勤登记表.csv'), '姓名,邮箱\n阿岚,a@x.com\n柏舟,b@x.com\n', 'utf8');
  } catch (e) { t.skip('python/openpyxl 不可用：' + e.message); return; }
  const h = makeHandler();
  for (const kind of ['swap', 'conditional', 'function', 'dedupe', 'extract']) {
    const v = act(h, file, { type: 'quick', kind });
    assert.equal(v.stage, 'PREVIEWED', 'kind=' + kind + ' QUICK 应直达 PREVIEWED，实际 ' + v.stage + '：' + v.note);
    assert.ok(v.preview, 'kind=' + kind + ' 应有 preview');
  }
});

// 语义落点回归：QUICK 不能盲目取前两列（那会把 swap 换到 姓名/部门、把 conditional/function/extract
// 落到 姓名 列覆盖主键）。带「备注」列 + 数字列（工时/时薪）的真实表上，验证每个动作改的是「对的列」。
test('一键动作 QUICK：语义落点正确（换数字列/写到备注列，不覆盖主键）', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-quick-sem-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let file;
  try {
    file = makeTable(dir, {
      primaryKey: '姓名',
      columns: { 姓名: 'text', 部门: 'text', 工时: 'number', 时薪: 'number', 备注: 'text' }, name: '语义落点',
      rows: [
        { 姓名: '阿岚', 部门: '销售', 工时: 160, 时薪: 80, 备注: '' },
        { 姓名: '柏舟', 部门: '技术', 工时: 176, 时薪: 90, 备注: '' }
      ]
    });
    fs.writeFileSync(path.join(dir, '外勤登记表.csv'), '姓名,邮箱\n阿岚,a@x.com\n柏舟,b@x.com\n', 'utf8');
  } catch (e) { t.skip('python/openpyxl 不可用：' + e.message); return; }
  const h = makeHandler();
  const changedCols = (v) => {
    const set = {};
    (v.preview && v.preview.cells || []).forEach((c) => { set[c.col] = true; });
    return Object.keys(set);
  };
  // swap：改的是 工时/时薪 两列，姓名/部门 不动
  let v = act(h, file, { type: 'quick', kind: 'swap' });
  let cols = changedCols(v).sort();
  assert.deepEqual(cols, ['工时', '时薪'].sort(), 'swap 应对调 工时↔时薪，实际改 ' + cols.join(','));
  // function：写到 备注 列（不覆盖姓名/工时/时薪）
  v = act(h, file, { type: 'quick', kind: 'function' });
  cols = changedCols(v);
  assert.ok(cols.indexOf('备注') !== -1 && cols.indexOf('姓名') === -1, 'function 应写到备注列、不碰姓名，实际 ' + cols.join(','));
});

test('缺口A 修复：defaultReadTable 把同目录 CSV 读成 sources（extract 可用）', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-a-src-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let main;
  try {
    main = makeTable(dir, {
      primaryKey: '姓名',
      columns: { 姓名: 'text' }, name: '主表',
      rows: [{ 姓名: '阿岚' }, { 姓名: '柏舟' }]
    });
  } catch (e) { t.skip('python/openpyxl 不可用：' + e.message); return; }
  fs.writeFileSync(path.join(dir, '外勤登记表.csv'),
    '姓名,邮箱\n阿岚,alan@corp.com\n柏舟,bo@corp.com\n', 'utf8');

  // collectSiblingSources 直测：csv 被读成 {columns,rows}
  const srcs = collectSiblingSources(main);
  assert.ok(srcs['外勤登记表.csv'], '应收集到 外勤登记表.csv 数据源');
  assert.deepEqual(srcs['外勤登记表.csv'].columns, ['姓名', '邮箱']);
  assert.equal(srcs['外勤登记表.csv'].rows.length, 2);

  // readTable 本体（性能修复后）不再 eager 带 sources；兄弟源改由 loadSourcesForExtract 惰性加载。
  const tbl = defaultReadTable(main);
  assert.equal(tbl.sources, undefined, 'defaultReadTable 默认不再 eager 附带 sources（性能修复）');
  const lazySrcs = loadSourcesForExtract(main);
  assert.ok(lazySrcs['外勤登记表.csv'], 'loadSourcesForExtract 应惰性加载到 外勤登记表.csv');
  // 面板 action handler 内部会在 extract 场景自动补 sources；此处 invalidate 保证拿到最新
  invalidateReadCache(main);

  // 端到端：extract 一句话 → 理解 → 预览（应通过）→ 确认 → 磁盘邮箱列被填入
  const h = makeHandler();
  let v = act(h, main, { type: 'understand', text: '从外勤登记表提取邮箱补到姓名这一列' });
  assert.equal(v.draft && v.draft.kind, 'extract');
  v = act(h, main, { type: 'preview' });
  assert.equal(v.stage, 'PREVIEWED', 'extract 预览应通过（不再报来源文件不在数据源里）：' + v.note);
  assert.ok(v.preview && !v.preview.invalid);
  const c = act(h, main, { type: 'confirm' });
  assert.equal(c.stage, 'EXECUTED');
  assert.equal(c.writtenOk, true);
  const disk = pyReadValues(main);
  const byName = Object.fromEntries(disk.rows.map((r) => [r['姓名'], r['邮箱']]));
  assert.equal(byName['阿岚'], 'alan@corp.com');
  assert.equal(byName['柏舟'], 'bo@corp.com');
});

test('缺口B 修复：function 写公式后重算，应发列读回非空且数值正确', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-b-recalc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let file;
  try {
    file = makeTable(dir, {
      primaryKey: '姓名',
      columns: { 姓名: 'text', 工时: 'number', 时薪: 'number' }, name: '工资',
      rows: [{ 姓名: '阿岚', 工时: 160, 时薪: 80 }, { 姓名: '柏舟', 工时: 176, 时薪: 90 }]
    });
  } catch (e) { t.skip('python/openpyxl 不可用：' + e.message); return; }

  const h = makeHandler();
  act(h, file, { type: 'understand', text: '计算 工时乘以时薪 算成应发' });
  let v = act(h, file, { type: 'preview' });
  assert.equal(v.stage, 'PREVIEWED', 'function 预览应通过：' + v.note);
  // 预览产物应是公式字符串（=开头），不是 JS 求值
  assert.ok(v.preview.cells.every((c) => typeof c.after === 'string' && c.after.charAt(0) === '='),
    '预览产物应为公式字符串');

  const c = act(h, file, { type: 'confirm' });
  assert.equal(c.stage, 'EXECUTED');
  assert.equal(c.writtenOk, true);
  assert.equal(c.recalcOk, true, '写公式后应就地重算成功');

  // 重算后读回缓存值：应发 = 工时 × 时薪
  const disk = pyReadValues(file);
  const byName = Object.fromEntries(disk.rows.map((r) => [r['姓名'], r['应发']]));
  assert.equal(Number(byName['阿岚']), 160 * 80);
  assert.equal(Number(byName['柏舟']), 176 * 90);
});

test('无公式时不触发重算（swap 等纯值动作 recalcOk 为 undefined）', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-c-norecalc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let file;
  try {
    file = makeTable(dir, {
      primaryKey: '姓名',
      columns: { 姓名: 'text', 工时: 'number', 时薪: 'number' }, name: '对调',
      rows: [{ 姓名: '阿岚', 工时: 160, 时薪: 80 }]
    });
  } catch (e) { t.skip('python/openpyxl 不可用：' + e.message); return; }
  const h = makeHandler();
  act(h, file, { type: 'understand', text: '对调工时和时薪两列' });
  act(h, file, { type: 'preview' });
  const c = act(h, file, { type: 'confirm' });
  assert.equal(c.writtenOk, true);
  assert.equal(c.recalcOk, undefined, '纯值动作不该触发重算');
});

test('缺口C 修复：主键重复时按 rowIndex 精确写回，首个重复行也被改到', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-dup-pk-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let file;
  try {
    file = makeTable(dir, {
      primaryKey: '姓名',
      columns: { 姓名: 'text', 工时: 'number', 时薪: 'number' }, name: '重复主键',
      rows: [
        { 姓名: '阿岚', 工时: 160, 时薪: 80 },
        { 姓名: '柏舟', 工时: 176, 时薪: 90 },
        { 姓名: '阿岚', 工时: 100, 时薪: 50 }   // 重复主键：旧 apply 会把两次写都落到这一行
      ]
    });
  } catch (e) { t.skip('python/openpyxl 不可用：' + e.message); return; }
  const h = makeHandler();
  act(h, file, { type: 'understand', text: '对调工时和时薪两列' });
  let v = act(h, file, { type: 'preview' });
  assert.equal(v.stage, 'PREVIEWED', 'swap 预览应通过：' + v.note);
  const c = act(h, file, { type: 'confirm' });
  assert.equal(c.writtenOk, true);
  // 三行都应被对调（旧实现下第一个 阿岚 行不会被改到）
  const disk = pyReadValues(file);
  assert.deepEqual(
    disk.rows.map((r) => [r['姓名'], String(r['工时']), String(r['时薪'])]),
    [['阿岚', '80', '160'], ['柏舟', '90', '176'], ['阿岚', '50', '100']]
  );
});

test('性能修复：读表 TTL 缓存命中不重复 spawn；写盘后失效拿到最新值', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-cache-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let file;
  try {
    file = makeTable(dir, {
      primaryKey: '姓名',
      columns: { 姓名: 'text', 工时: 'number' }, name: '缓存表',
      rows: [{ 姓名: '阿岚', 工时: 160 }]
    });
  } catch (e) { t.skip('python/openpyxl 不可用：' + e.message); return; }
  invalidateReadCache(file);
  // 第一次读（缓存未命中）
  const a = defaultReadTable(file);
  assert.equal(a.rows.length, 1);
  // 第二次读：应命中缓存（引用同一对象，MS 级；不 spawn python）
  const t0 = Date.now();
  const b = defaultReadTable(file);
  const cachedMs = Date.now() - t0;
  assert.equal(b, a, '缓存命中应返回同一对象引用');
  assert.ok(cachedMs < 50, '缓存命中应远快于 spawn（<50ms），实际 ' + cachedMs + 'ms');
  // 外部改动后 invalidate，再读应拿到新值
  const st = path.join(dir, 'st2.json');
  fs.writeFileSync(st, JSON.stringify({ primaryKey: '姓名', columns: { 姓名: 'text', 工时: 'number' }, name: '缓存表', rows: [{ 姓名: '阿岚', 工时: 99 }] }), 'utf8');
  py(['create', file, st]);
  invalidateReadCache(file);
  const c = defaultReadTable(file);
  assert.equal(String(c.rows[0]['工时']), '99', 'invalidate 后应读到磁盘最新值');
});
