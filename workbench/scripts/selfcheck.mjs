// 一键自检：不依赖宿主、不联网，只读。检查包结构、构建产物、引擎可跑、测试/验收命令存在。
// 用法：node scripts/selfcheck.mjs   或   npm run selfcheck
// 退出码 0 = 全部通过；1 = 有失败项。
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

let fail = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.log('  ❌ ' + m); fail++; };
const check = (cond, m) => (cond ? ok(m) : bad(m));

console.log('表格工作台 一键自检\n');

// 1) package.json 基本元信息
console.log('[1] package.json');
let pkg = {};
try { pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); ok('package.json 可解析'); }
catch (e) { bad('package.json 不可解析: ' + e.message); }
check(pkg.name === 'dsh-workbench', 'name=dsh-workbench');
check(/^\d+\.\d+\.\d+/.test(pkg.version || ''), 'version 合法: ' + pkg.version);
check(!!pkg.description, 'description 非空');
check(Array.isArray(pkg.keywords) && pkg.keywords.length > 0, 'keywords 非空');
check(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web', 'dsh.client.platform=web');
check(!!(pkg.exports && pkg.exports['.']), 'exports["."] 存在');

// 2) 关键文件齐全
console.log('\n[2] 关键文件');
for (const f of ['lib/index.mjs', 'lib/engine.js', 'client/client.js', 'client/index.js',
  'cordis.patch.yml', 'README.md', 'CHANGELOG.md', 'scripts/xlsx_bridge.py']) {
  check(existsSync(join(ROOT, f)), f);
}

// 3) 引擎可加载 + 10 动作齐全
console.log('\n[3] 引擎');
let E = null;
try { E = require(join(ROOT, 'lib/engine.js')); ok('lib/engine.js 可加载'); }
catch (e) { bad('lib/engine.js 加载失败: ' + e.message); }
if (E && E.KINDS) {
  const want = ['extract', 'swap', 'conditional', 'function', 'dedupe', 'replace', 'fill', 'trim', 'case', 'affix'];
  const have = Object.keys(E.KINDS);
  check(want.every((k) => have.includes(k)), '10 个动作齐全 (' + have.length + ')');
  // 每个动作都有 paramSpec 且可派生默认值
  let specOk = true;
  for (const k of want) {
    const s = E.KINDS[k];
    if (!s || !Array.isArray(s.paramSpec) || s.paramSpec.length === 0) specOk = false;
  }
  check(specOk, '每个动作都有 paramSpec');
  // 快速跑一次 understand
  if (typeof E.understand === 'function') {
    const r = E.understand('对调工时和时薪两列');
    check(r && r.kind === 'swap', 'understand("对调工时和时薪两列") → swap');
  }
}

// 4) npm scripts
console.log('\n[4] npm scripts');
for (const s of ['test', 'acceptance', 'acceptance:formula', 'build:client', 'selfcheck']) {
  check(pkg.scripts && pkg.scripts[s], 'scripts.' + s + ' 存在');
}

console.log('\n' + (fail === 0 ? '全部通过 ✅' : fail + ' 项失败 ❌'));
process.exit(fail === 0 ? 0 : 1);
