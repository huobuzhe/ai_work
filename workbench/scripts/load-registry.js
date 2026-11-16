'use strict';
/**
 * 仓内按钮注册表加载脚本（纯文件桥）——票 #16。
 * 职责单一：读 registry/ 下的 *.json → 调引擎的 loadRegistry → 输出**完整按钮清单**。
 *
 * 【Host seed 契约（AC1 的生产接线，code-review H1 修复）】
 * 本包是纯 seam 包：不读文件、面板 body 由宿主驱动（与 user 按钮「Host 权威源持久化、
 * 本包只投影」对称）。宿主在构造工作台 hostState 时，按如下契约把预置按钮 seed 进来，
 * 它们就会与固化按钮一起出现在按钮库（projectButtonLibrary 合并两类来源）并可一键运行：
 *   1) 运行 `node scripts/load-registry.js`，读 stdout 的 JSON；
 *   2) 取 `.registryButtons`（每项含 id/name/kind/source/schemaVersion/params/medium/steps，
 *      是声明式、无可执行代码的完整按钮），作为 data.registryButtons 传给引擎 initial()，
 *      或传给 hydrateRegistry(state, list) 水合到 state.registryButtons；
 *   3) 面板 body 的 buttonLibrary 即同时含 preset 与 user 两类按钮。
 * 校验分层：加载时做结构性封闭校验（版本/字段白名单/必填/scope/condition 语法）；
 * 与具体表格绑定的检查（来源文件是否在 sources、列是否存在、公式列引用）在运行时
 * QUICK/RUN_BUTTON 针对该表再跑一次 validate——注册表条目是跨表通用的，不能绑死某张表。
 *
 * 无网络、不碰云凭据、不写仓库、不含任何可执行代码；校验规则全在引擎里（与主 seam 共用）。
 *
 * 用法：node scripts/load-registry.js [注册表目录]
 * 退出码：全部合法=0；有条目被拒=2；目录不存在/读取失败=1。
 */
const fs = require('node:fs');
const path = require('node:path');
const E = require('../lib/engine');

const dir = process.argv[2] || path.join(__dirname, '..', 'registry');
if (!fs.existsSync(dir)) {
  console.error('注册表目录不存在：' + dir);
  process.exit(1);
}
const files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); });
const entries = files.map(function (f) {
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  return { file: f, entry: JSON.parse(raw) };
});
// 文件名字段只用于定位报错，不属于条目本体，加载前剥掉，避免被封闭白名单当未知字段拒绝。
const result = E.loadRegistry(entries.map(function (x) { return x.entry; }), null);
if (result.rejected.length) {
  result.rejected.forEach(function (r) { console.error('拒绝：' + r.name + ' → ' + r.reason); });
}
// 输出完整按钮（含 params/medium/steps/source/schemaVersion），宿主可直接 seed；
// 不再输出残缺 manifest（#16 code-review H1：残缺清单即使被 seed 也渲染不出可用按钮）。
console.log(JSON.stringify({
  total: result.total,
  registryButtons: result.accepted,
  rejected: result.rejected,
  ok: result.ok,
  hostContract: '把 registryButtons 作为 data.registryButtons 传给 initial()，或传给 hydrateRegistry(state, registryButtons)'
}, null, 2));
process.exit(result.ok ? 0 : 2);
