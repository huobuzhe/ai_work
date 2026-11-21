'use strict';
// 一句话理解·真 LLM 适配器（可选，离线默认关闭）。
//   设计原则（延续引擎纪律）：
//   - 只负责「一句话 → {kind, params}」，不碰状态机、不改文件；理解之外的封闭校验由引擎 understand 做。
//   - 网络与密钥全在这里，且**永不抛错阻断主路径**：任何失败（无密钥/网络错/超时/返回非 JSON/未知 kind）
//     都返回 null，让引擎静默回落离线关键词匹配。
//   - 兼容 OpenAI Chat Completions 协议，因此同时覆盖 DeepSeek / OpenAI / 任何兼容网关
//     （base 换成对应 endpoint + model 名即可）；也支持自定义 fetch 注入（便于测试，零真实网络）。
//
// 用法（宿主侧）：
//   const { createUnderstandLlm } = require('dsh-workbench/lib/llm-adapter');   // 或 './lib/llm-adapter'
//   const understandLlm = createUnderstandLlm({
//     baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: process.env.DEEPSEEK_API_KEY
//   });
//   const handler = makeActionHandler({ understandLlm });   // UNDERSTAND 动作就会先问 LLM，失败回落关键词
//
// 返回给引擎的形状：{ kind: '<KINDS 里的 kind>', params: { <paramSpec.key>: <值> } }。
// params 里只保留该 kind 的 paramSpec 允许的键（引擎还会再封闭校验一次），其余丢弃。

// 每个 kind 的「填写提示」，用于拼 system prompt，引导 LLM 输出合法 params。
// 这里刻意不复制 paramSpec 的类型约束（引擎已有权威 paramSpec），只给人类可读的用途说明。
const KIND_HINTS = {
  extract: '从同目录的另一个数据源文件按匹配列把某列补到本表某列（参数：来源文件、匹配列、取哪一列、写到）',
  swap: '调换本表两列的内容（参数：字段A、字段B）',
  conditional: '按条件对目标列做增删/改值（参数：动作、目标列、值；可选条件）',
  'function': '用表达式算一个新列或改写某列，如 应发 = 工时 * 时薪（参数：表达式、输出列、写入方式= 数值|公式）',
  dedupe: '按主键去重、保留首条或末条（参数：保留策略 = 首条|末条）',
  replace: '对目标列做文本子串替换（参数：目标列、查找、替换为；查找与替换为不能同时为空）',
  fill: '把目标列的空白格填成固定值（参数：目标列、填充值）',
  trim: '去掉目标列首尾空格（参数：目标列）',
  'case': '把目标列英文字母转大小写（参数：目标列、模式 = upper|lower）',
  affix: '给目标列加前缀/后缀（参数：目标列、位置 = 前缀|后缀、文本）',
  sort: '按某列升序/降序重排整表行顺序（参数：排序列、方向 = asc|desc）',
  highlight: '给目标列满足条件的单元格刷底色（参数：目标列、条件、底色 = 黄|红|绿|蓝；或用规则组做分级）',
  sum: '对某数值列做汇总统计（参数：目标列、聚合方式 = sum|avg|count|max|min）'
};

// 从引擎 KINDS 取每个 kind 的合法参数键集合（惰性、带缓存）。引擎不可用时退回空集（仅放行 kind）。
let _paramKeysCache = null;
function paramKeysByKind() {
  if (_paramKeysCache) return _paramKeysCache;
  const map = {};
  try {
    const E = require('./engine.js');
    Object.keys(E.KINDS || {}).forEach(function (k) {
      map[k] = (E.KINDS[k].paramSpec || []).map(function (p) { return p.key; });
    });
  } catch (_) { /* 引擎加载失败：map 留空，下面会按「无键约束」处理 */ }
  _paramKeysCache = map;
  return map;
}

// 仅保留某 kind 的合法参数键；值必须是字符串/数字/布尔（引擎会再校验类型/必填/枚举）。
function sanitizeParams(kind, rawParams) {
  const allowed = paramKeysByKind()[kind];
  if (!allowed) return rawParams && typeof rawParams === 'object' ? rawParams : null;
  const out = {};
  if (rawParams && typeof rawParams === 'object') {
    allowed.forEach(function (k) {
      if (rawParams[k] === undefined || rawParams[k] === null) return;
      const v = rawParams[k];
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else out[k] = String(v);
    });
  }
  return Object.keys(out).length ? out : null;
}

function buildSystemPrompt(columns) {
  const kinds = Object.keys(KIND_HINTS).map(function (k) { return '- ' + k + '：' + KIND_HINTS[k]; }).join('\n');
  const colLine = (Array.isArray(columns) && columns.length)
    ? '当前表格可用的列名（参数里涉及列时请**优先用这些真实列名**）：' + columns.join('、') + '。'
    : '当前表格的列名未知；参数里涉及列时按用户在句子里提到的名字填。';
  return [
    '你是「表格工作台」的一句话理解器。用户会用中文说一句想对表格做的操作，你要把它归类到**唯一一个动作类型**并抽取参数。',
    '只允许下面这些动作类型（kind）：',
    kinds,
    colLine,
    '输出要求：只输出**一个 JSON 对象**，不要任何解释文字、不要 markdown 代码块。格式：',
    '{"kind":"<上面某个 kind>","params":{...}}',
    'params 的键必须是该 kind 括号里列出的参数名（中文键）。若某个非必填参数在句子里没提到，就不要写它。',
    '如果不属于以上任何动作，输出 {"kind":null}。'
  ].join('\n');
}

// 从模型返回文本里抠出第一个 JSON 对象（容忍 ```json 代码块、前后多余文字）。
function parseModelJson(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim();
  // 去 markdown 代码块围栏
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // 直接试整段
  try { return JSON.parse(t); } catch (_) {}
  // 抠第一个 { ... }（用括号配对，字符串感知，避免 params 里的花括号/引号误判）
  const start = t.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) {
      try { return JSON.parse(t.slice(start, i + 1)); } catch (_) { return null; }
    } }
  }
  return null;
}

// 创建同步版 understandLlm 工厂：内部**发**请求，但通过同步阻塞等待拿到结果返回，
//   以匹配 makeActionHandler 对 deps.understandLlm 的同步调用约定。
//   实现方式：若宿主注入了 fetch（可返回 Promise），同步版无法直接 await——因此本工厂同时提供：
//     - createUnderstandLlm(...)  → 同步 `(sentence, {columns}) => result|null`（内部用 sync-http 阻塞请求）
//     - createUnderstandLlmAsync(...) → async `(sentence, {columns}) => Promise<result|null>`（推荐，交给 understandAsync）
//
// 同步版用一个最小 http(s) 请求（child_process 无法阻塞 await），这里用 node 内置 http/https 的同步封装不现实，
// 故同步版基于 `child_process.spawnSync` 调一个内联 node 脚本发请求（零第三方依赖、跨平台、可超时）。
// （若更愿意纯 async，用 Async 版 + understandAsync，宿主在 action handler 外 await 好再注入 llmResult。）

function buildRequestBody(cfg, sentence, columns) {
  return {
    model: cfg.model || 'deepseek-chat',
    messages: [
      { role: 'system', content: buildSystemPrompt(columns) },
      { role: 'user', content: String(sentence == null ? '' : sentence) }
    ],
    temperature: cfg.temperature != null ? cfg.temperature : 0,
    stream: false
  };
}

// 纯逻辑：把 Chat Completions 响应体 → {kind, params}|null（不触网，方便单测）。
function interpretChatResponse(respBody) {
  let obj;
  try { obj = typeof respBody === 'string' ? JSON.parse(respBody) : respBody; } catch (_) { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const choices = obj.choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const msg = choices[0] && choices[0].message;
  const content = msg && msg.content;
  const parsed = parseModelJson(content);
  if (!parsed || typeof parsed !== 'object') return null;
  const kind = parsed.kind;
  if (!kind || typeof kind !== 'string') return null;
  if (!paramKeysByKind()[kind] && !KIND_HINTS[kind]) return null; // 未知 kind
  return { kind: kind, params: sanitizeParams(kind, parsed.params) };
}

// ---- async 版（推荐）----
//   cfg: { baseUrl, model, apiKey, temperature?, timeoutMs?, fetch? }
//   fetch 可注入（便于测试，签名同全局 fetch( url, {method,headers,body,signal} )→Response）
function createUnderstandLlmAsync(cfg) {
  cfg = cfg || {};
  const doFetch = cfg.fetch || (typeof fetch === 'function' ? fetch : null);
  const timeoutMs = cfg.timeoutMs || 15000;
  const baseUrl = String(cfg.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = baseUrl + '/chat/completions';
  return async function understandLlmAsync(sentence, opts) {
    const columns = (opts && Array.isArray(opts.columns)) ? opts.columns : [];
    if (!doFetch) return null; // 无 fetch 能力 → 回落关键词
    let res;
    const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, timeoutMs) : null;
    try {
      res = await doFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (cfg.apiKey || '')
        },
        body: JSON.stringify(buildRequestBody(cfg, sentence, columns)),
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (_) {
      if (timer) clearTimeout(timer);
      return null; // 网络/超时/中断 → 回落
    }
    if (timer) clearTimeout(timer);
    try {
      if (!res || !res.ok) return null;
      const txt = await res.text();
      return interpretChatResponse(txt);
    } catch (_) {
      return null;
    }
  };
}

// ---- sync 版（供 makeActionHandler 的同步 understandLlm 约定）----
//   通过 child_process 调内联 node 脚本（用全局 fetch）发请求并同步拿回 JSON。
//   零第三方依赖；失败一律返回 null。
function createUnderstandLlm(cfg) {
  cfg = cfg || {};
  const { spawnSync } = require('child_process');
  const baseUrl = String(cfg.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = baseUrl + '/chat/completions';
  const timeoutMs = cfg.timeoutMs || 15000;
  // 内联脚本：读 stdin 的 {url,headers,body}，fetch 后把响应文本写 stdout。
  const INLINE = [
    'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",async()=>{',
    'try{const j=JSON.parse(d);',
    'const ac=new AbortController();const t=setTimeout(()=>{try{ac.abort()}catch(e){}},j.timeoutMs||15000);',
    'const r=await fetch(j.url,{method:"POST",headers:j.headers,body:j.body,signal:ac.signal});',
    'clearTimeout(t);const txt=await r.text();process.stdout.write(JSON.stringify({ok:r.ok,status:r.status,text:txt}));',
    '}catch(e){process.stdout.write(JSON.stringify({ok:false,error:String(e&&e.message||e)}))}',
    '});'
  ].join('\n');
  return function understandLlm(sentence, opts) {
    const columns = (opts && Array.isArray(opts.columns)) ? opts.columns : [];
    const payload = JSON.stringify({
      url: url,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (cfg.apiKey || '') },
      body: JSON.stringify(buildRequestBody(cfg, sentence, columns)),
      timeoutMs: timeoutMs
    });
    let r;
    try {
      r = spawnSync(process.execPath, ['-e', INLINE], { input: payload, encoding: 'utf8', timeout: timeoutMs + 5000, maxBuffer: 16 * 1024 * 1024 });
    } catch (_) { return null; }
    if (!r || r.status !== 0 || !r.stdout) return null;
    let wrap;
    try { wrap = JSON.parse(r.stdout); } catch (_) { return null; }
    if (!wrap || !wrap.ok || !wrap.text) return null;
    return interpretChatResponse(wrap.text);
  };
}

module.exports = {
  createUnderstandLlm,
  createUnderstandLlmAsync,
  // 以下导出供单测直接验证纯逻辑（不触网）
  interpretChatResponse,
  parseModelJson,
  sanitizeParams,
  buildSystemPrompt,
  buildRequestBody
};
