'use strict';
/**
 * 模板库加载脚本（纯文件桥，票 #10）——读仓内 templates/*.json → 调引擎 validateManifest → stdout JSON。
 * 与 load-registry.js 对称：本包是纯 seam、不写文件；git 作「线上」来源，实际写入/替换由宿主负责。
 * 冲突检测/格式判定都在 lib/engine.js（checkUpload/detectConflicts），本脚本只做读取与转发。
 * 输出：{ok, templates:[{file,name,primaryKey,columns}], errors:[], hostContract}
 * 退出码：0=全合法；2=有清单非法（stdout 仍给完整错误清单）；1=读取异常。
 */
const fs = require('node:fs');
const path = require('node:path');
const E = require('../lib/engine');

const HOST_CONTRACT = [
  '宿主构造工作台时：本脚本 stdout 的 templates 作为仓内模板库清单来源。',
  '建表四入口均走 E.createTable({mode})：blank/template/upload/description，信息不足看 questions、不猜值。',
  '上传文件先经 xlsx_bridge.py probe 产生 probe JSON → E.checkUpload(probe) 判格式/伪装 → E.validateRows(rows,manifest) 判必填/主键/类型。',
  '写模板前用 E.detectConflicts(incoming, existing, replace) 判同名/同主键冲突；须显式 replace 才写、由宿主走 git 留痕、不自动合并。',
  '清单类型映射表见 templates/type-mapping.json（进仓内）；feishu/tencent 列留给 Slice 2 adapter。'
].join(' ');

function main() {
  const dir = path.join(__dirname, '..', 'templates');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'type-mapping.json').sort();
  const templates = [];
  const errors = [];
  for (const file of files) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (e) {
      errors.push({ file, field: 'json', reason: '解析失败：' + e.message });
      continue;
    }
    const r = E.validateManifest(raw);
    if (!r.ok) {
      r.errors.forEach(x => errors.push(Object.assign({ file }, x)));
      continue;
    }
    templates.push({ file, name: raw.name, primaryKey: r.structure.primaryKey, columns: raw.columns, schemaVersion: raw.schemaVersion });
  }
  const out = { ok: errors.length === 0, templates, errors, hostContract: HOST_CONTRACT };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exitCode = errors.length ? 2 : 0;
}

try { main(); }
catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, templates: [], errors: [{ field: 'load', reason: String(e && e.message || e) }], hostContract: HOST_CONTRACT }) + '\n');
  process.exitCode = 1;
}
