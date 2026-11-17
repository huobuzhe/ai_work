'use strict';
/**
 * 票 #14：封闭校验系统 + 预览卡完整五段形态。
 * 主 seam（lib/engine.js）+ 面板投影（client）两层断言。
 * 规格 #8：
 *  - 校验是按参数类型系统机械派生的「封闭清单」，未知版本/未知字段/缺失必填/
 *    非法 scope·condition 一律拒绝并报具体原因，在预览前跑完，不落盘部分结果。
 *  - 预览卡固定五段：① 解释 ② 封闭校验清单结果（失败项 + 就地修正 + 禁用确认）
 *    ③ 作用范围与命名参数 ④ 影响预览 ⑤ 确认/取消。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine');
const { projectPreviewCard } = require('../client');

function mkState() {
  const people = [
    ['阿岚', '技术', 160, 80], ['柏舟', '技术', 176, 80],
    ['岑溪', '运营', 96, 60], ['丁野', '运营', 144, 60],
    ['尔芙', '人事', 88, 70]
  ];
  const emails = {
    '阿岚': 'alan@example.com', '柏舟': 'baizhou@example.com',
    '岑溪': 'cenxi@example.com', '丁野': 'dingye@example.com', '尔芙': 'erfu@example.com'
  };
  return E.initial({
    primaryKey: '姓名',
    columns: ['姓名', '部门', '工时', '时薪', '备注'],
    rows: people.map(function (p) { return { '姓名': p[0], '部门': p[1], '工时': p[2], '时薪': p[3], '备注': '' }; }),
    sources: {
      '外勤登记表.csv': {
        columns: ['姓名', '邮箱'],
        rows: people.map(function (p) { return { '姓名': p[0], '邮箱': emails[p[0]] }; })
      }
    }
  });
}
function reasonText(v) { return v.errors.join('；'); }

// ================= AC1：schemaVersion 封闭校验 =================

test('AC1a 未知字段被拒绝并报出具体字段名（不允许凭空造参数）', () => {
  const d = E.buildDraft('extract', null, { 凭空字段: 'x' });
  const v = E.validate(d, mkState());
  assert.equal(v.ok, false, '含未知字段的配方应被拒绝');
  assert.ok(/凭空字段/.test(reasonText(v)), '报错应点名未知字段：' + reasonText(v));
});

test('AC1b 缺失 schemaVersion 被拒绝', () => {
  const d = E.buildDraft('extract');
  delete d.schemaVersion;
  const v = E.validate(d, mkState());
  assert.equal(v.ok, false, '缺 schemaVersion 应被拒绝');
  assert.ok(/schemaVersion/.test(reasonText(v)), '报错应提到 schemaVersion：' + reasonText(v));
});

test('AC1c 未知 schemaVersion 被拒绝（读不懂就拒绝、不迁移）', () => {
  const d = E.buildDraft('extract');
  d.schemaVersion = 999;
  const v = E.validate(d, mkState());
  assert.equal(v.ok, false);
  assert.ok(/schemaVersion/.test(reasonText(v)));
});

test('AC1d 缺失必填项 / 非法 scope / 非法 condition 被拒绝（基线回归）', () => {
  assert.equal(E.validate(E.buildDraft('extract', null, { 来源文件: '' }), mkState()).ok, false);
  assert.equal(E.validate(E.buildDraft('extract', null, { scope: 'maybe' }), mkState()).ok, false);
  assert.equal(E.validate(E.buildDraft('extract', null, { scope: 'match', 条件: '>>>' }), mkState()).ok, false);
});

test('AC1e 校验失败项带结构化字段（供预览卡第②段就地修正）', () => {
  const v = E.validate(E.buildDraft('extract', null, { 凭空字段: 'x', 来源文件: '' }), mkState());
  assert.equal(v.ok, false);
  assert.ok(Array.isArray(v.issues), 'validate 应返回结构化 issues 数组');
  assert.ok(v.issues.length >= 2, '每个失败项应各有一条 issue');
  v.issues.forEach(function (it) {
    assert.ok(it.field, 'issue 应带 field');
    assert.ok(it.reason, 'issue 应带 reason');
  });
  assert.ok(v.issues.some(function (it) { return it.field === '凭空字段'; }), '应有未知字段 issue');
  assert.ok(v.issues.some(function (it) { return it.field === '来源文件'; }), '应有缺失必填 issue');
});

test('AC1f 合法配方通过封闭校验', () => {
  const v = E.validate(E.buildDraft('extract'), mkState());
  assert.equal(v.ok, true, reasonText(v));
  assert.equal(v.issues.length, 0);
});

// ================= AC2：预览卡完整五段形态 =================

function previewedState(draft) {
  const s = mkState();
  const pv = E.preview(s, draft);
  s.draft = draft;
  s.preview = pv;
  s.stage = pv.invalid ? 'IDLE' : 'PREVIEWED';
  return s;
}

test('AC2a 预览卡暴露固定五段 sections', () => {
  const s = previewedState(E.buildDraft('extract'));
  const card = projectPreviewCard(s);
  assert.ok(card, '合法配方应有预览卡');
  assert.ok(card.sections, '预览卡应有 sections');
  ['explain', 'validation', 'scopeParams', 'impact', 'confirm'].forEach(function (k) {
    assert.ok(card.sections[k], '缺第 ' + k + ' 段');
  });
});

test('AC2b 第①段解释含 kind / medium / 参数 / 步骤', () => {
  const d = E.buildDraft('extract');
  const card = projectPreviewCard(previewedState(d));
  const ex = card.sections.explain;
  assert.equal(ex.kind, 'extract');
  assert.ok(ex.medium && /结构化动作/.test(ex.medium));
  assert.ok(ex.params && ex.params['来源文件'] === '外勤登记表.csv');
  assert.ok(Array.isArray(ex.steps) && ex.steps.length > 0);
});

test('AC2c 第②段封闭校验清单：通过时 ok=true、issues 空', () => {
  const card = projectPreviewCard(previewedState(E.buildDraft('extract')));
  assert.equal(card.sections.validation.ok, true);
  assert.equal(card.sections.validation.issues.length, 0);
});

test('AC2d 校验失败仍出卡：第②段列失败项、第⑤段禁用确认（不是返回 null）', () => {
  const bad = E.buildDraft('extract', null, { 凭空字段: 'x' });
  const pv = E.preview(mkState(), bad);
  assert.equal(pv.invalid, true, '非法配方的预览应标 invalid');
  const s = mkState();
  s.draft = bad; s.preview = pv; s.stage = 'IDLE';
  const card = projectPreviewCard(s);
  assert.ok(card, '校验失败也必须出卡（不是 null）');
  assert.equal(card.sections.validation.ok, false);
  assert.ok(card.sections.validation.issues.some(function (it) { return it.field === '凭空字段'; }));
  assert.equal(card.sections.confirm.canConfirm, false, '失败项存在时禁用确认');
});

test('AC2e 第③段作用范围与命名参数来自引擎', () => {
  const card = projectPreviewCard(previewedState(E.buildDraft('extract', null, { scope: 'match', 条件: '工时 > 150' })));
  const sp = card.sections.scopeParams;
  assert.equal(sp.scope, 'match');
  assert.equal(sp.condition, '工时 > 150');
  assert.equal(sp.scopeLabel, '符合条件');
});

test('AC2f 第④段影响预览来自引擎实际计算（非死数据），改参数联动格子', () => {
  const c1 = projectPreviewCard(previewedState(E.buildDraft('extract'))).sections.impact;
  const c2 = projectPreviewCard(previewedState(E.buildDraft('extract', null, { 写到: '邮箱2' }))).sections.impact;
  assert.ok(c1.cells.length > 0);
  assert.equal(c1.cells[0].col, '邮箱');
  assert.equal(c2.cells[0].col, '邮箱2', '改参数应联动影响格子');
  assert.equal(c1.affectedRows, 5);
  assert.equal(c1.totalRows, 5);
  assert.ok(/影响 5 行 \/ 共 5 行/.test(c1.summary));
});

test('AC2g 第⑤段确认/取消状态随 stage 与校验结果', () => {
  const ok = projectPreviewCard(previewedState(E.buildDraft('extract')));
  assert.equal(ok.sections.confirm.canConfirm, true);
  assert.equal(ok.sections.confirm.canCancel, true);
  // 行为断言：非 PREVIEWED 阶段（即便有合法预览）也不能确认
  const idleState = previewedState(E.buildDraft('extract'));
  idleState.stage = 'IDLE';
  const idle = projectPreviewCard(idleState);
  assert.equal(idle.sections.confirm.canConfirm, false, '非 PREVIEWED 阶段必须禁用确认');
});

test('AC2i 失败项带 currentValue，宿主可预填出错现值（就地修正控件元数据）', () => {
  const bad = E.buildDraft('extract', null, { 凭空字段: 'x' });
  const s = mkState();
  s.draft = bad; s.preview = E.preview(mkState(), bad);
  const issues = projectPreviewCard(s).sections.validation.issues;
  const unknown = issues.filter(function (it) { return it.field === '凭空字段'; })[0];
  assert.ok(unknown, '应含未知字段失败项');
  assert.equal(unknown.currentValue, 'x', '失败项须带出错现值供宿主预填修正控件');
});

test('AC2h 尚无预览时不返回卡（IDLE 无 draft/preview）', () => {
  assert.equal(projectPreviewCard(mkState()), null);
});

// ================= AC4：共用引擎，不新起第二套 =================

test('AC4 预览卡第②段与引擎 validate 结果一致（同一份失败项）', () => {
  const bad = E.buildDraft('extract', null, { 凭空字段: 'x' });
  const v = E.validate(bad, mkState());
  const s = mkState();
  s.draft = bad; s.preview = E.preview(mkState(), bad); s.stage = 'IDLE';
  const card = projectPreviewCard(s);
  const cardIssues = card.sections.validation.issues;
  // 卡把引擎的失败项原样带出（field/reason 一致），另加 currentValue 供宿主渲染修正控件。
  assert.equal(cardIssues.length, v.issues.length, '失败项条数应与引擎一致');
  v.issues.forEach(function (it, i) {
    assert.equal(cardIssues[i].field, it.field, '失败项字段应来自引擎');
    assert.equal(cardIssues[i].reason, it.reason, '失败项原因应来自引擎');
  });
});

// ================= AC1 续：非法条件必须单独报错、绝不静默当零命中（规格 line 103 / 用户故事 17 / Spec HARD finding） =================

test('AC1g AND 复合条件被拒绝并报具体原因', () => {
  const s = mkState();
  const v = E.validate(E.buildDraft('extract', null, {
    '来源文件': '外勤登记表.csv', '匹配列': '姓名', '取哪一列': '邮箱', '写到': '备注',
    scope: 'match', '条件': '工时 > 8 AND 部门 = 技术'
  }), s);
  assert.equal(v.ok, false, 'AND 复合条件必须被拒绝');
  assert.ok(/AND|复合/.test(reasonText(v)), '报错应点名复合条件非法：' + reasonText(v));
});

test('AC1h 中文 OR 复合条件被拒绝', () => {
  const s = mkState();
  const v = E.validate(E.buildDraft('extract', null, {
    '来源文件': '外勤登记表.csv', '匹配列': '姓名', '取哪一列': '邮箱', '写到': '备注',
    scope: 'match', '条件': '工时 > 100 或 部门 = 技术'
  }), s);
  assert.equal(v.ok, false);
  assert.ok(/或|复合|OR/.test(reasonText(v)), reasonText(v));
});

test('AC1i 列间比较被拒绝（值不能是列名）', () => {
  const s = mkState();
  const v = E.validate(E.buildDraft('extract', null, {
    '来源文件': '外勤登记表.csv', '匹配列': '姓名', '取哪一列': '邮箱', '写到': '备注',
    scope: 'match', '条件': '工时 > 时薪'
  }), s);
  assert.equal(v.ok, false, '列间比较必须被拒绝');
  assert.ok(/列间|列名/.test(reasonText(v)), '报错应点名列间比较：' + reasonText(v));
});

test('AC1j 非法条件不能静默变成零命中预览（必须 invalid、不产格子）', () => {
  const s = mkState();
  const bad = E.buildDraft('extract', null, {
    '来源文件': '外勤登记表.csv', '匹配列': '姓名', '取哪一列': '邮箱', '写到': '备注',
    scope: 'match', '条件': '工时 > 8 AND 部门 = 技术'
  });
  const pv = E.preview(s, bad);
  assert.equal(pv.invalid, true, '非法条件的预览必须标 invalid');
  assert.equal(pv.cells.length, 0, '不得产出格子');
  assert.ok(/复合|AND|校验未通过/.test(pv.summary), '摘要须说明是校验失败而非「零命中允许确认」：' + pv.summary);
});

test('AC1k 合法条件仍可用（不误伤）', () => {
  const s = mkState();
  const v = E.validate(E.buildDraft('extract', null, {
    '来源文件': '外勤登记表.csv', '匹配列': '姓名', '取哪一列': '邮箱', '写到': '备注',
    scope: 'match', '条件': '工时 > 150'
  }), s);
  assert.equal(v.ok, true, '合法单比较条件不应被拒绝：' + reasonText(v));
});

// ================= AC5：非法配方不进入执行阶段 =================

test('AC5 非法配方的预览不能被确认执行', () => {
  const bad = E.buildDraft('extract', null, { 凭空字段: 'x' });
  const s = mkState();
  s.draft = bad;
  s.preview = E.preview(mkState(), bad);
  s.stage = 'PREVIEWED'; // 即便被人为置成 PREVIEWED，非法预览也不能执行
  const after = E.reduce(s, { type: 'CONFIRM' });
  assert.equal(after.stage, 'PREVIEWED', '非法配方 CONFIRM 应被拦下、表格不动');
  assert.equal(after.rows[0]['邮箱'], undefined, '不应写入任何单元格');
});

test('AC5b 纵深防御：即便预览被篡改成 invalid:false，执行前重校验仍拦下漂移的非法配方', () => {
  // 模拟宿主持久化/重水合或外部改动导致的 state 漂移：预览是合法预览的壳，但 draft 已被塞进未知字段。
  const good = E.buildDraft('extract');
  const s = mkState();
  s.draft = good;
  s.preview = E.preview(mkState(), good); // 合法预览（invalid:false）
  s.stage = 'PREVIEWED';
  s.draft = Object.assign({}, good, { params: Object.assign({}, good.params, { 凭空字段: 'x' }) }); // 数据漂移
  assert.equal(s.preview.invalid, false, '前提：预览本体仍是合法的');
  const after = E.reduce(s, { type: 'CONFIRM' });
  assert.equal(after.stage, 'PREVIEWED', '重校验必须拦下已漂移的非法配方，不得进入 EXECUTED');
  assert.equal(after.rows[0]['邮箱'], undefined, '不应写入任何单元格');
});

// ================= 向后兼容：扁平字段仍在（#12/#13 已消费） =================

test('兼容：预览卡保留 #9/#12/#13 的扁平字段', () => {
  const card = projectPreviewCard(previewedState(E.buildDraft('extract')));
  assert.equal(card.summary, card.sections.impact.summary);
  assert.ok(Array.isArray(card.cells));
  assert.equal(card.scope, 'all');
  assert.equal(card.affectedRows, 5);
  assert.ok('disclosure' in card && 'swapBanner' in card);
});

// ================= 票 #38（Slice 2 / S6）：条件闭包锁死单比较 + AND/OR 推迟 v2（验证既有、不加产品行为） =================
// 既有 AC1g-k / scope.test.js 已钉 AND/OR/列间/语法错/非静默零命中 与 scope 公共字段。
// 本票补四条边界回归护栏，全部针对既有实现，不改产品代码：
//  AC1 闭包恰为 = ≠ > ≥ < ≤ 六 op、别名归一；对具名误写符号设 tripwire（真正的闭包保证是
//      engine.js parseCondition 的封闭 op 白名单正则，本用例不穷举第七种符号，不把 tripwire 说成证明）；
//  AC2 包含/为空/contains/is empty 一律被拒、预览 invalid 不产格子（非静默零命中），
//      值位写法另点名原因，操作符位写法走通用格式提示；
//  AC3 scope 不预留扩展枚举、四类动作 + 公共参数无逻辑连接符字段（AND/OR 只在 condition 内且禁用）。
//  AC2 门禁 非法条件预览即使被置 PREVIEWED 也不能 CONFIRM 执行。
// 范围说明：v2 完整重画是 Further Notes 触发式指针（交 /to-spec 后使用者拿真实例子说写不出 →
//  另起 /grilling → 另起 effort），不在代码内实现；本票不写 AND/OR 语法本体。

test('#38 AC1 条件闭包恰为 = ≠ > ≥ < ≤ 六 op，别名归一，具名误写符号不解析', () => {
  const s = mkState();
  // 显式配对（不用平行数组 + 下标），与别名用例同构、改一处不会错位。
  [['工时 = 8', '='], ['工时 ≠ 8', '≠'], ['工时 > 8', '>'], ['工时 ≥ 8', '≥'], ['工时 < 8', '<'], ['工时 ≤ 8', '≤']]
    .forEach(function (pair) {
      const c = E.parseCondition(pair[0], s);
      assert.ok(c, pair[0] + ' 应解析');
      assert.equal(c.op, pair[1], pair[0] + ' 应归一到 ' + pair[1]);
      assert.equal(c.value, '8', pair[0] + ' 比较值应为字面量 8');
    });
  [['==', '='], ['!=', '≠'], ['>=', '≥'], ['<=', '≤']].forEach(function (pair) {
    const c = E.parseCondition('工时 ' + pair[0] + ' 8', s);
    assert.ok(c, pair[0] + ' 别名应解析');
    assert.equal(c.op, pair[1], pair[0] + ' 应归一到 ' + pair[1]);
  });
  // tripwire（非穷举）：下列具名误写符号一律不解析。结构性闭包由 engine.js 的封闭 op
  // 白名单正则保证，本断言不声称"已证明无第七种 op"，只钉住这些已知误写不会意外放行。
  ['~', 'like', 'contains', 'in'].forEach(function (sym) {
    assert.equal(E.parseCondition('工时 ' + sym + ' 8', s), null, '具名误写符号不应解析：' + sym);
  });
});

test('#38 AC2 包含/为空/contains/is empty 被拒且预览不产格子（非静默零命中）', () => {
  const s = mkState();
  // 值位写法（工时 > 包含）：走 contains/is-empty 专用守卫，报错点名 token。
  ['工时 > 包含', '工时 > 为空', '工时 > contains', '工时 > is empty'].forEach(function (t) {
    const d = E.buildDraft('extract', null, {
      '来源文件': '外勤登记表.csv', '匹配列': '姓名', '取哪一列': '邮箱', '写到': '备注',
      scope: 'match', '条件': t
    });
    const v = E.validate(d, s);
    assert.equal(v.ok, false, t + ' 必须被拒');
    assert.ok(/包含|为空|contains|is empty/i.test(reasonText(v)), t + ' 值位写法报错应点名：' + reasonText(v));
    const pv = E.preview(s, d);
    assert.equal(pv.invalid, true, t + ' 预览必须 invalid');
    assert.equal(pv.cells.length, 0, t + ' 不得产出格子（不能当零命中放行）');
  });
  // 操作符位写法（姓名 包含 张）：走通用「格式应为」守卫，不点名 token 但同样拒绝、
  // 同样 invalid、同样零格子。点名原因只在值位写法成立，此处不重复该断言。
  ['姓名 包含 张', '部门 contains 技术', '姓名 为空'].forEach(function (t) {
    const d = E.buildDraft('extract', null, {
      '来源文件': '外勤登记表.csv', '匹配列': '姓名', '取哪一列': '邮箱', '写到': '备注',
      scope: 'match', '条件': t
    });
    const v = E.validate(d, s);
    assert.equal(v.ok, false, t + ' 操作符位写法必须被拒');
    assert.ok(/条件格式应为/.test(reasonText(v)), t + ' 操作符位写法应报通用格式错：' + reasonText(v));
    const pv = E.preview(s, d);
    assert.equal(pv.invalid, true, t + ' 预览必须 invalid');
    assert.equal(pv.cells.length, 0, t + ' 不得产出格子');
  });
});

test('#38 AC3 scope 不预留扩展枚举、四类动作无逻辑连接符参数字段', () => {
  const scopeDecl = E.COMMON_PARAMS.find(function (p) { return p.key === 'scope'; });
  assert.deepEqual(scopeDecl['约束'].enum, ['all', 'match'], 'scope 枚举恰为 all|match，不预留 match-and 等扩展');
  // 词边界避免 'and'/'or' 命中 error/sort 等无关字段名的子串；连接符若藏在公共参数
  // （跨动作字段的自然归属）也应被检出，所以 COMMON_PARAMS 与 KINDS[].paramSpec 一起扫。
  const connector = /\b(and|or)\b|且|或|与|逻辑|connector|条件2|&&|\|\|/i;
  const fields = [['COMMON_PARAMS', E.COMMON_PARAMS]].concat(
    ['extract', 'swap', 'conditional', 'function'].map(function (k) { return [k, E.KINDS[k].paramSpec || []]; })
  );
  fields.forEach(function (pair) {
    pair[1].forEach(function (p) {
      assert.ok(!connector.test(p.key), pair[0] + ' 不得有逻辑连接符参数字段：' + p.key);
    });
  });
  // 逻辑连接符若塞进 scope 值域，一律拒绝（AND/OR 仅在 condition 内、且第一版禁用）。
  ['match AND', 'match OR', 'all AND'].forEach(function (scope) {
    const v = E.validate(E.buildDraft('extract', null, {
      '来源文件': '外勤登记表.csv', '匹配列': '姓名', '取哪一列': '邮箱', '写到': '备注', scope: scope
    }), mkState());
    assert.equal(v.ok, false, 'scope 不得取扩展值：' + scope);
  });
});

test('#38 AC2 确认门禁：条件非法的预览即使被置 PREVIEWED 也不能 CONFIRM 执行', () => {
  const s = mkState();
  const bad = E.buildDraft('extract', null, {
    '来源文件': '外勤登记表.csv', '匹配列': '姓名', '取哪一列': '邮箱', '写到': '备注',
    scope: 'match', '条件': '工时 > 8 AND 部门 = 技术'
  });
  s.draft = bad;
  s.preview = E.preview(mkState(), bad);
  s.stage = 'PREVIEWED';
  assert.equal(s.preview.invalid, true, '前提：非法条件预览 invalid');
  const after = E.reduce(s, { type: 'CONFIRM' });
  assert.equal(after.stage, 'PREVIEWED', '非法条件不得进入 EXECUTED，须先修正并经用户确认');
  // 写到目标列是「备注」（合法条件会写入 alan@example.com），断言它仍为空才是真正的未写入证据；
  // 不断言源列「邮箱」——它本就不在主表列集合里，永远 undefined，是恒真式。
  assert.equal(after.rows[0]['备注'], '', '写到目标列不应被写入');
});
