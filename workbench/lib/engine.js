'use strict';
/**
 * 动作配方引擎（纯模块，主 seam）—— 从 prototypes/workbench.PROTOTYPE.html 的
 * throwaway 分支 prototype/spreadsheet-workbench@commit d29d2c8 lift 而来。
 *
 * 约束（规格 #8 Slice 1）：
 *  - 只有数据进、数据出；不碰 DOM / 浏览器 / 插件注册 / xlsx 文件 / HMR state。
 *  - 输入是「声明式表格数据 + 一句话 / 参数」，输出是校验结果 / 影响预览 / 写值动作。
 *  - 动作配方为声明式、不含可执行代码。
 *  - 跨切面决策：scope=all|match(condition) 公共字段、默认 all、零命中允许确认；
 *    条件闭包单比较（= ≠ > ≥ < ≤）解析失败即拒绝；schemaVersion 封闭校验在预览前跑完。
 */

const SCHEMA_VERSION = 1;

const KINDS = {
  extract: {
    label: '① 提取字段', short: '提取字段',
    medium: '结构化动作：按主键左连接 + 写列',
    // 票 #20（T3 Contract）：旧 params 默认值 map 已删除，默认参数统一由 paramSpec 的「默认值」派生（见 defaultsFor）。
    // 票 #18（T1 Expand）：带类型参数声明层。自 #19（T2）起由 validate 主流程按 paramSpec 派生。
    paramSpec: [
      { key: '来源文件', 类型: '文件', 必填: true, 默认值: '外勤登记表.csv', 约束: {} },
      { key: '匹配列', 类型: '列名', 必填: true, 默认值: '姓名', 约束: { mustExist: true } },
      { key: '取哪一列', 类型: 'text', 必填: true, 默认值: '邮箱', 约束: {} },
      { key: '写到', 类型: '列名', 必填: true, 默认值: '邮箱', 约束: { newColumn: true } }
    ]
  },
  swap: {
    label: '② 调换两段字段', short: '调换两段字段',
    medium: '结构化动作：两列整列互换',
    // 票 #20：默认参数由 paramSpec 派生。
    paramSpec: [
      { key: '字段A', 类型: '列名', 必填: true, 默认值: '部门', 约束: { mustExist: true } },
      { key: '字段B', 类型: '列名', 必填: true, 默认值: '备注', 约束: { mustExist: true } }
    ]
  },
  conditional: {
    label: '③ 带条件增删', short: '带条件增删',
    medium: '结构化动作：条件筛选 + 写值 / 清空',
    // 带条件增删的本质是「条件」，默认 match 才名副其实（scope 是公共字段、默认值在 COMMON_PARAMS）。
    // 票 #20：默认参数由 paramSpec + COMMON_PARAMS 派生；conditional 的 scope 默认在 COMMON_PARAMS 是 all，
    // 故下方 paramSpec 之外用 defaultsFor 覆盖——见 defaultsFor 里对 conditional scope 的处理。
    paramSpec: [
      { key: '动作', 类型: '枚举', 必填: true, 默认值: '增加', 约束: { enum: ['增加', '删去', '删除', '清空'] } },
      { key: '目标列', 类型: '列名', 必填: true, 默认值: '备注', 约束: { newColumn: true } },
      { key: '值', 类型: 'text', 必填: false, 默认值: '加班', 约束: {} }
    ]
  },
  function: {
    label: '④ 自定义函数计算', short: '自定义函数计算',
    medium: '公式字符串：应发 = 工时 × 时薪',
    // 票 #20：默认参数由 paramSpec 派生。
    paramSpec: [
      { key: '表达式', 类型: '表达式', 必填: true, 默认值: '工时 * 时薪', 约束: { translatable: true } },
      { key: '输出列', 类型: '列名', 必填: true, 默认值: '应发', 约束: { newColumn: true } },
      // ② 写公式而非值（🟡 便宜增量）：数值=算好真实数字（历史默认）；公式=写 A1 公式串，交 Excel/WPS 打开后重算。
      { key: '写入方式', 类型: '枚举', 必填: false, 默认值: '数值', 约束: { enum: ['数值', '公式'] } }
    ]
  },
  // ⑤ dedupe（最小扩展示例，见 docs/usage-and-extension-guide.md 第六节）：
  // 按主键去重——保留策略（首条/末条）保留一条，其余重复行的可见列清空。
  // 诚实边界：applyCells 只写单元格值、不物理删行，故「去重」= 把重复行清空（不是删行）；
  // 这是纯 seam 包内最小可跑的形态，物理删行需宿主层提供删行动作、不在本 demo 范围。
  dedupe: {
    label: '⑤ 按主键去重', short: '按主键去重',
    medium: '结构化动作：按主键保留一条、清空其余重复行',
    paramSpec: [
      { key: '保留策略', 类型: '枚举', 必填: true, 默认值: '首条', 约束: { enum: ['首条', '末条'] } }
    ]
  },
  // ⑥ replace（日常常用）：把某列中的「查找文本」替换成「替换为」。
  // 语义：在 scope 范围内逐行对目标列做子串替换。
  //   查找为空、替换为非空 → 整列赋值为替换值（批量改，属合法用法）；
  //   查找为空且替换为也为空 → 会清空整列，属误操作（用户 m10775 实机发现），引擎层予以拦截不产出格子。
  // 故「查找」保持非必填，真正的拦截由 preview 分支对「查找空且替换为空」的判断负责。
  replace: {
    label: '⑥ 文本替换', short: '文本替换',
    medium: '结构化动作：把一列里的某段文字替换成另一段',
    paramSpec: [
      { key: '目标列', 类型: '列名', 必填: true, 默认值: '部门', 约束: { mustExist: true } },
      { key: '查找', 类型: 'text', 必填: false, 默认值: '' },
      { key: '替换为', 类型: 'text', 必填: false, 默认值: '' }
    ]
  },
  // ⑦ fill（日常常用）：把某列的空单元格填上一个值（scope 范围内）。
  // 语义：目标列在该行为空/仅空白时，写入「填充值」；已有值不动（只看空、不覆盖）。
  fill: {
    label: '⑦ 空值填充', short: '空值填充',
    medium: '结构化动作：把一列里的空单元格填上默认值',
    paramSpec: [
      { key: '目标列', 类型: '列名', 必填: true, 默认值: '备注', 约束: { newColumn: true } },
      { key: '填充值', 类型: 'text', 必填: true, 默认值: '待补' }
    ]
  },
  // ⑧ trim（日常常用）：去掉某列文本首尾空白（scope 范围内）。
  trim: {
    label: '⑧ 去首尾空格', short: '去首尾空格',
    medium: '结构化动作：清理一列文本的首尾空白',
    paramSpec: [
      { key: '目标列', 类型: '列名', 必填: true, 默认值: '姓名', 约束: { mustExist: true } }
    ]
  },
  // ⑨ case（日常常用）：把某列英文统一成大写 / 小写。
  case: {
    label: '⑨ 英文大小写', short: '英文大小写',
    medium: '结构化动作：把一列英文统一成大写或小写',
    paramSpec: [
      { key: '目标列', 类型: '列名', 必填: true, 默认值: '部门', 约束: { mustExist: true } },
      { key: '模式', 类型: '枚举', 必填: true, 默认值: 'upper', 约束: { enum: ['upper', 'lower'] } }
    ]
  },
  // ⑩ affix（日常常用）：给某列每格文本统一加前缀 / 后缀（如统一补单位、补编号前缀）。
  affix: {
    label: '⑩ 加前缀后缀', short: '加前缀后缀',
    medium: '结构化动作：给一列文本统一加上前缀或后缀',
    paramSpec: [
      { key: '目标列', 类型: '列名', 必填: true, 默认值: '姓名', 约束: { mustExist: true } },
      { key: '位置', 类型: '枚举', 必填: true, 默认值: 'prefix', 约束: { enum: ['prefix', 'suffix'] } },
      { key: '文本', 类型: 'text', 必填: true, 默认值: '#' }
    ]
  },
  // ⑪ sort（日常常用，「便宜增量」之一）：按某列升序 / 降序重排整表行顺序。
  // 结构性动作：不改任何单元格的值，只改行的先后顺序。预览产 preview.sortOrder（新行序下标数组），
  // 确认后 applyCells 依 sortOrder 重排 rows。排序列必须存在（mustExist）；字符串按码点稳定排序（同值保原序）。
  sort: {
    label: '⑪ 按列排序', short: '按列排序',
    medium: '结构化动作：按一列排序、重排整表行顺序（行内容不变，只改先后）',
    paramSpec: [
      { key: '排序列', 类型: '列名', 必填: true, 默认值: '工时', 约束: { mustExist: true } },
      { key: '方向', 类型: '枚举', 必填: true, 默认值: 'asc', 约束: { enum: ['asc', 'desc'] } }
    ]
  },
  // ⑫ highlight 回写单元格底色（「便宜增量」之一）：给「目标列」满足条件的行刷底色，不改任何值。
  // paramSpec：目标列（mustExist）+ 条件（可空=整列）+ 底色（黄/红/绿/蓝）。确认后 python 桥刷 PatternFill。
  highlight: {
    label: '⑫ 单元格标色', short: '单元格标色',
    medium: '结构化动作：给一列满足条件的单元格刷底色（不改值）',
    paramSpec: [
      { key: '目标列', 类型: '列名', 必填: true, 默认值: '工时', 约束: { mustExist: true } },
      { key: '条件', 类型: 'text', 必填: false, 默认值: '' },
      { key: '底色', 类型: '枚举', 必填: true, 默认值: 'yellow', 约束: { enum: ['yellow', 'red', 'green', 'blue'] } }
    ]
  }
};

// 票 #18：公共字段（scope / 条件）——所有动作共有，不算私有参数，故不列入各动作 paramSpec。
// 自 #19（T2）起由 validate 经 typedParamSpec() 合并进 paramSpec 一并派生校验；默认值仍由 defaultsFor() 统一派生。
const COMMON_PARAMS = [
  { key: 'scope', 类型: '枚举', 必填: false, 默认值: 'all', 约束: { enum: ['all', 'match'] } },
  { key: '条件', 类型: 'text', 必填: false, 默认值: '' }
];

// ============================================================================
// 票 #21（Slice 2 / S1）：统一表格操作 adapter 抽象层 + 公式能力位契约。
// 规格 #8 Slice 2「Adapter 抽象」与「公式能力契约」段：
//  - 一套按钮模型/动作配方落在不同平台，差异收敛在 adapter 内。
//  - 能力位是 binary 结论（true/false），false 的动作在该 adapter 上禁用并明确提示，
//    绝不静默降级、不写死值、不偷偷把公式算成值。
//  - 本票只做接口 + 能力位契约 + 禁用/提示逻辑，不接真实云端后端（云端实装见 S3/S4）。
//  - 能力位填充值取既有事实矩阵，不重新研究（证据：docs/research/cloud-capability-matrix.md）。
//    · 本地 Excel（local）：四格 true —— 本仓已实测「写公式→LibreOffice 重算→读回缓存值」闭环
//      （engine 的 function 介质 + xlsx_bridge.py read-values + acceptance:formula）。
//    · 飞书（feishu）：四格 false —— 文档层无公式写入/重算/读计算值接口（矩阵按文档层 false）。
//    · 腾讯（tencent）：四格 false —— 一手负面证据已验证：V3 batchUpdate 的 CellValue 无公式字段、
//      无重算接口、无读计算值接口（见 docs/research/cloud-capability-matrix.md 与
//      docs/research/tencent-v3-batchupdate-request-shape.md）。
// adapter 是纯声明：字段只有 id / label / capabilities / formulaCapabilities / evidence，
// 不含任何可执行函数（本引擎不在此处做 I/O；真实读写的文件桥/HTTP 在 scripts/ 与后续 S3/S4）。
// ============================================================================

// 三维证据状态枚举（票 #35 / 规格 #34）：能力位除 binary 结论外，再带一个「证据状态」+ 一手来源。
//  - verified-true：真跑四格全过（仅 local，acceptance:formula valuesMatch:true）。
//  - verified-false：一手负面已验证（腾讯三格：无公式字段/无重算接口/无读计算值接口）。
//  - unverified-default-false：文档层未验证 / 使用者豁免，按共识 ⑲ 保守记 false（飞书四格 + 腾讯 functionSet）。
// 不变量：只有 evidenceStatus === verified-true 且布尔结论为真时动作才解锁；其余一律禁用 + 预览提示。
// 绝不因「链路能建表」或「使用者豁免」就把未验证位重测成 true；不提供 opt-in 覆盖开关。
const EVIDENCE_STATUS = Object.freeze({
  VERIFIED_TRUE: 'verified-true',
  VERIFIED_FALSE: 'verified-false',
  UNVERIFIED_DEFAULT_FALSE: 'unverified-default-false'
});

// 统一表格操作接口的四类能力名（纯声明，供文档/校验/后续 adapter 实装对齐用）。
const ADAPTER_INTERFACE = ['读表', '写单元格', '建表', '读回计算值'];

// 四类动作对「公式能力」的依赖：只有 function（公式字符串产物）依赖公式能力位；
// 结构化动作（extract/swap/conditional）只读写单元格值、不依赖公式能力，任何 adapter 都可用。
// 每个依赖项写明：需要的能力位 + 该位为 false 时给出的原因提示（用户故事：不静默降级）。
const KIND_CAPABILITY_DEPS = {
  function: [
    { cap: 'canWriteFormula', need: '写入公式', reason: '该平台能力位 canWriteFormula=false：不能写入公式，自定义函数计算在此平台禁用。' },
    { cap: 'canRecalc', need: '重算公式', reason: '该平台能力位 canRecalc=false：不会重算公式，写入的公式无法得到计算值。' },
    { cap: 'canReadComputed', need: '读回计算值', reason: '该平台能力位 canReadComputed=false：无法读回公式的计算值。' }
  ]
};

const ADAPTERS = {
  local: {
    id: 'local',
    label: '本地 Excel（零凭据）',
    capabilities: { 读表: true, 写单元格: true, 建表: true, 读回计算值: true },
    formulaCapabilities: { canWriteFormula: true, canRecalc: true, canReadComputed: true, functionSet: true },
    formulaEvidenceStatus: {
      canWriteFormula: EVIDENCE_STATUS.VERIFIED_TRUE, canRecalc: EVIDENCE_STATUS.VERIFIED_TRUE,
      canReadComputed: EVIDENCE_STATUS.VERIFIED_TRUE, functionSet: EVIDENCE_STATUS.VERIFIED_TRUE
    },
    evidence: '仓内实测：function 公式字符串产物 + LibreOffice recalculate + xlsx_bridge.py read-values 闭环（acceptance:formula，valuesMatch:true）。'
  },
  feishu: {
    id: 'feishu',
    label: '飞书多维表格 / 电子表格',
    capabilities: { 读表: true, 写单元格: true, 建表: true, 读回计算值: false },
    formulaCapabilities: { canWriteFormula: false, canRecalc: false, canReadComputed: false, functionSet: false },
    formulaEvidenceStatus: {
      canWriteFormula: EVIDENCE_STATUS.UNVERIFIED_DEFAULT_FALSE, canRecalc: EVIDENCE_STATUS.UNVERIFIED_DEFAULT_FALSE,
      canReadComputed: EVIDENCE_STATUS.UNVERIFIED_DEFAULT_FALSE, functionSet: EVIDENCE_STATUS.UNVERIFIED_DEFAULT_FALSE
    },
    evidence: '按文档层 false：飞书开放平台未见写公式/重算/读计算值的一手接口（docs/research/cloud-capability-matrix.md）；使用者豁免 Step7/8/9，能力位零实测。'
  },
  tencent: {
    id: 'tencent',
    label: '腾讯文档在线表格',
    capabilities: { 读表: true, 写单元格: true, 建表: true, 读回计算值: false },
    formulaCapabilities: { canWriteFormula: false, canRecalc: false, canReadComputed: false, functionSet: false },
    formulaEvidenceStatus: {
      canWriteFormula: EVIDENCE_STATUS.VERIFIED_FALSE, canRecalc: EVIDENCE_STATUS.VERIFIED_FALSE,
      canReadComputed: EVIDENCE_STATUS.VERIFIED_FALSE, functionSet: EVIDENCE_STATUS.UNVERIFIED_DEFAULT_FALSE
    },
    evidence: '一手负面已验证：V3 batchUpdate 的 CellValue 无公式字段、无重算接口、无读计算值接口（docs/research/cloud-capability-matrix.md、tencent-v3-batchupdate-request-shape.md）。'
  }
};

const DEFAULT_ADAPTER = 'local';

// 纯函数：resolve 出当前 state 使用的 adapter（非法/缺省回退 local）。
function adapterOf(state) {
  const id = state && state.adapter;
  return ADAPTERS[id] ? ADAPTERS[id] : ADAPTERS[DEFAULT_ADAPTER];
}

// 纯函数：某 adapter 的某能力位是否「解锁」——只有布尔结论为真且证据状态为 verified-true 才解锁。
// 恰好两个参数 (adapterId, bit)，不提供第三参数做强制解锁（无 opt-in 覆盖口）。
// 布尔为真但证据状态非 verified-true（漂移）/任何非解锁态，一律返回 false（禁用 + 预览提示由 blocker 负责）。
function isCapabilityUnlocked(adapterId, bit) {
  const adapter = ADAPTERS[adapterId];
  if (!adapter) return false;
  return adapter.formulaCapabilities[bit] === true
    && adapter.formulaEvidenceStatus && adapter.formulaEvidenceStatus[bit] === EVIDENCE_STATUS.VERIFIED_TRUE;
}

// 纯函数：给定配方草稿 draft 与 state，返回被当前 adapter 能力位挡下的 blocker 列表。
// 每项 { cap, need, reason }；空数组 = 无阻塞（该动作在当前 adapter 可用）。
// 只有依赖公式能力位的动作（function）可能被挡；结构化动作永远返回 []。
// 解锁判据统一走 isCapabilityUnlocked（verified-true 才放行），杜绝只看布尔结论就放行的漂移。
function capabilityBlockersOf(draft, state) {
  if (!draft || !draft.kind) return [];
  const deps = KIND_CAPABILITY_DEPS[draft.kind];
  if (!deps) return [];
  const adapterId = adapterOf(state).id;
  const out = [];
  deps.forEach(function (d) {
    if (!isCapabilityUnlocked(adapterId, d.cap)) out.push({ cap: d.cap, need: d.need, reason: d.reason });
  });
  return out;
}

// ============================================================================
// 票 #22（Slice 2 / S2）：凭据契约（只定接口与校验，绝不接触真实凭据值）
// 规格 #8 Slice 2：两套云鉴权凭据各自独立、绝不共用凭据层。
//  - 每个云端 adapter 声明：所需字段名 + 注入方式（env / 本机凭据文件）+ 失效/刷新行为 + 错误映射。
//  - 加载时校验：缺字段即明确报错并指出缺哪个字段，不静默继续。
//  - 真实凭据值零进仓库 / 配方 / 日志 / issue；校验结果只返回 {ok, missing, error}，绝不回显任何凭据值。
// 字段名对齐 /wizard 产出的 credentials.env（FEISHU_* / TENCENT_*，见 docs/research/ 与票 #5 冒烟链路）。
// ============================================================================
const CREDENTIAL_CONTRACTS = {
  feishu: {
    adapterId: 'feishu',
    sharedLayer: 'feishu-tenant-token', // 与 tencent 不同层：两套凭据绝不共用
    // 建表/加字段/写记录/读回需要：应用凭据换 tenant_access_token（或 user_access_token）。
    fields: [
      { name: 'FEISHU_APP_ID', label: '自建应用 App ID', injection: 'env', envKey: 'FEISHU_APP_ID', required: true },
      { name: 'FEISHU_APP_SECRET', label: '自建应用 App Secret', injection: 'env', envKey: 'FEISHU_APP_SECRET', required: true, secret: true },
      { name: 'FEISHU_TENANT_ACCESS_TOKEN', label: 'tenant_access_token', injection: 'env', envKey: 'FEISHU_TENANT_ACCESS_TOKEN', required: true, secret: true }
    ],
    injectionModes: ['env', 'file'],
    // 失效/刷新：tenant_access_token expire 约 2 小时（最大约 7200s）；用 app_id+app_secret 重换。
    expiry: {
      field: 'FEISHU_TENANT_ACCESS_TOKEN',
      ttlSeconds: 7200,
      refresh: '用 FEISHU_APP_ID + FEISHU_APP_SECRET 重新调用 tenant_access_token_internal 换新 token（不缓存密钥到仓库）'
    },
    // 错误映射：HTTP / code → 可读原因。
    // 一手出处：HTTP 401/403 权限语义见 spreadsheet-platform-capabilities.md:33-34；99991663（tenant_access_token 无效）
    // 见 feishu-tenant-token-ip-whitelist.md:48（Go SDK 常量）。无一手出处的错误码不写（见下方 unsourced 备注）。
    errorMap: {
      '401': '应用凭据无效或 tenant_access_token 缺失（inferred：官方页以 403/400 记权限问题，未逐字列 401 语义）',
      '403': '应用非该文档的所有者/协作者，或缺少对应 API scope（文档级权限 + API scope 两层）',
      '99991663': 'tenant_access_token 无效或已过期'
    }
  },
  tencent: {
    adapterId: 'tencent',
    sharedLayer: 'tencent-oauth-openid', // 与 feishu 不同层：两套凭据绝不共用
    // 建表/写值/读回需要：OAuth2 换 access_token + Client-Id + Open-Id 三头鉴权。
    // CLIENT_SECRET 与 REFRESH_TOKEN 仅在换取/刷新 token 时使用（官方要求只放后台服务，不随每次 API 调用注入，
    // 故不列入运行时三头必填字段；此处显式声明为「token 刷新专用」、与 feishu 的 app_secret 语义对称——见下方 tokenRefresh 段）。
    fields: [
      { name: 'TENCENT_ACCESS_TOKEN', label: 'OAuth2 access_token', injection: 'env', envKey: 'TENCENT_ACCESS_TOKEN', required: true, secret: true },
      { name: 'TENCENT_CLIENT_ID', label: '应用 Client ID', injection: 'env', envKey: 'TENCENT_CLIENT_ID', required: true },
      { name: 'TENCENT_OPEN_ID', label: 'OAuth2 user_id（Open-Id）', injection: 'env', envKey: 'TENCENT_OPEN_ID', required: true }
    ],
    // token 换取/刷新专用字段（不参与每次 API 调用的三头，但刷新 token 时必需；官方要求只留后台服务）。
    tokenRefresh: {
      fields: ['TENCENT_CLIENT_SECRET', 'TENCENT_REFRESH_TOKEN'],
      note: 'client_secret + refresh_token 仅在 OAuth2 token 接口换/刷新 access_token 时使用，须置于后台服务、绝不随 CALL 注入。'
    },
    injectionModes: ['env', 'file'],
    // 失效/刷新：access_token expires_in 约 2592000s（30 天）；用 refresh_token 刷新。
    expiry: {
      field: 'TENCENT_ACCESS_TOKEN',
      ttlSeconds: 2592000,
      refresh: '用 TENCENT_REFRESH_TOKEN（配合 TENCENT_CLIENT_SECRET）走 OAuth2 token 接口刷新（grant_type=refresh_token），不缓存密钥到仓库'
    },
    // 错误映射：**这是 V2 OpenAPI 的错误码**（create.html / values/update.html 一手逐字），
    // 不是 V3 batchUpdate 的错误码表（V3 用 HTTP 级 400x，见下方 v3ErrorMap）。
    // 一手出处：docs/research/tencent-create-file-request-shape.md:308、docs/research/tencent-v3-batchupdate-request-shape.md:359。
    errorMap: {
      '10313': 'Access-Token 为空',
      '10303': 'Open-Id 错误',
      '10302': 'Client-Id 错误',
      '37019': 'Token 校验失败或过期'
    },
    // V3 batchUpdate 的通用错误码（code.html 逐字，10 行），S3/S4 走 V3 时用这张，勿把上表 V2 码套到 V3。
    v3ErrorMap: {
      '400001': '请求参数错误', '400002': '服务端请求超时', '400003': '访问的资源不存在',
      '400004': '创建的资源已存在', '400005': '不允许访问该资源', '400006': '资源操作未授权（确认鉴权三元组合法有效）',
      '400007': '请求数超过限制', '400008': '访问了超过范围的资源', '400009': '服务处于不可用状态', '400010': '服务内部错误'
    }
  }
};

// 纯函数：校验某 adapter 的凭据是否齐备。
// 返回 { ok:boolean, missing:string[], error?:string }——只回字段名，绝不回显任何凭据值。
// env 或 opts 均可提供值（一次性读取本机环境变量 / 本机凭据文件后的键值对象）。
function validateCredentials(adapterId, provided) {
  const contract = CREDENTIAL_CONTRACTS[adapterId];
  if (!contract) {
    return { ok: false, missing: [], error: '未知的平台 adapter「' + adapterId + '」，无凭据契约' };
  }
  const src = provided || {};
  const missing = [];
  contract.fields.forEach(function (f) {
    if (!f.required) return;
    const v = src[f.envKey];
    if (v === undefined || v === null || String(v).length === 0) {
      missing.push(f.envKey);
    }
  });
  if (missing.length > 0) {
    return { ok: false, missing: missing, error: '缺少凭据字段：' + missing.join(', ') + '（不静默继续）' };
  }
  return { ok: true, missing: [] };
}

// ============================================================================
// 票 #10：模板库与建表（纯 seam，不读文件；字节探测由文件桥 xlsx_bridge.py probe 提供）
// 规格 #8 line 110/111/121-123：
//  - 清单类型枚举取三家交集 text/number/date/bool/enum；映射到平台字段类型的映射表进仓内。
//  - 主键列可配置（默认「姓名」）；上传格式白名单 + 加密/带宏/伪装判定 + 必填列/主键/类型校验。
//  - 冲突检测逐条比对、显式替换才放行、不自动合并；描述建表信息不足就问、不猜值。
// ============================================================================
const TYPE_ENUM = ['text', 'number', 'date', 'bool', 'enum'];
// 清单类型 → 平台字段类型映射表（Slice 1 本地零凭据：local=openpyxl/Univer；云端列留给 Slice 2 adapter，不在此实现）。
const TYPE_MAP = {
  text:   { local: 'str',   feishu: 'text',   tencent: 'text' },
  number: { local: 'int',   feishu: 'number', tencent: 'number' },
  date:   { local: 'date',  feishu: 'date',   tencent: 'date' },
  bool:   { local: 'bool',  feishu: 'checkbox', tencent: 'checkbox' },
  enum:   { local: 'str',   feishu: 'single_select', tencent: 'select' }
};
const UPLOAD_WHITELIST = ['.xlsx', '.csv', '.tsv'];
const DEFAULT_PRIMARY_KEY = '姓名';
// 模块加载期一次性断言：清单类型枚举与平台映射表键集必须完全一致（避免「在 TYPE_ENUM 但无映射」的隐性失败态）。
['local', 'feishu', 'tencent'].forEach(platform => {
  TYPE_ENUM.forEach(t => {
    if (!TYPE_MAP[t] || TYPE_MAP[t][platform] === undefined) {
      throw new Error('TYPE_MAP 缺少平台映射：' + t + '.' + platform);
    }
  });
});

// 清单结构校验：字段白名单（未知顶层字段拒绝）、类型枚举、primaryKey 在 columns 内、schemaVersion 封闭。
function validateManifest(m) {
  const errors = [];
  const fail = (field, reason) => errors.push({ field, reason });
  if (!m || typeof m !== 'object') return { ok: false, errors: [{ field: 'manifest', reason: '清单不是对象' }] };
  const allowed = ['schemaVersion', 'name', 'primaryKey', 'columns', 'description', 'requiredColumns'];
  Object.keys(m).forEach(k => { if (allowed.indexOf(k) < 0) fail(k, '未知清单字段'); });
  if (m.schemaVersion === undefined) fail('schemaVersion', '缺少 schemaVersion');
  else if (m.schemaVersion !== SCHEMA_VERSION) fail('schemaVersion', 'schemaVersion 不匹配：' + m.schemaVersion + ' != ' + SCHEMA_VERSION);
  if (!m.name || typeof m.name !== 'string') fail('name', '缺少模板名');
  const pk = m.primaryKey === undefined ? DEFAULT_PRIMARY_KEY : m.primaryKey;
  if (!m.columns || typeof m.columns !== 'object' || Array.isArray(m.columns)) {
    fail('columns', 'columns 必须是「列名 → 类型」对象');
    return { ok: false, errors };
  }
  const colNames = Object.keys(m.columns);
  if (colNames.length === 0) fail('columns', 'columns 不能为空');
  colNames.forEach(c => {
    if (TYPE_ENUM.indexOf(m.columns[c]) < 0) fail(c, '类型不可映射：' + m.columns[c] + '（仅收 ' + TYPE_ENUM.join('/') + '）');
  });
  if (colNames.indexOf(pk) < 0) fail('primaryKey', '主键列「' + pk + '」不在 columns 中');
  // 可选 requiredColumns 白名单：缺省 = 全部白名单列必填；给了则只用它（主键列恒必填）。
  let required = colNames.slice();
  if (m.requiredColumns !== undefined) {
    if (!Array.isArray(m.requiredColumns)) fail('requiredColumns', 'requiredColumns 必须是列名数组');
    else m.requiredColumns.forEach(c => { if (colNames.indexOf(c) < 0) fail(c, 'requiredColumns 含不在 columns 的列「' + c + '」'); });
    if (Array.isArray(m.requiredColumns)) {
      required = m.requiredColumns.slice();
      if (required.indexOf(pk) < 0) required.push(pk); // 主键恒必填
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], structure: { primaryKey: pk, columns: colNames, types: Object.assign({}, m.columns), required } };
}

// 上传格式/伪装判定：probe = {filename, ext, isZip, openable, encrypted, hasMacro}（字节层由文件桥探测）。
function checkUpload(probe) {
  const errors = [];
  const fail = reason => errors.push({ field: '格式', reason });
  if (!probe || typeof probe !== 'object') return { ok: false, errors: [{ field: '格式', reason: '缺少探测信息' }] };
  const ext = (probe.ext || '').toLowerCase();
  if (UPLOAD_WHITELIST.indexOf(ext) < 0) {
    fail('格式不支持：' + (ext || '未知') + '（仅收 ' + UPLOAD_WHITELIST.join('/') + '）');
    return { ok: false, errors };
  }
  // 加密 / 带宏：直接短路返回，避免与「伪装」重复报因。
  if (probe.encrypted) return { ok: false, errors: [{ field: '格式', reason: '加密工作簿无法读取' }] };
  if (probe.hasMacro) return { ok: false, errors: [{ field: '格式', reason: '带宏工作簿被拒收' }] };
  if (ext === '.xlsx') {
    // xlsx 本质是 zip（PK 魔数）；伪装文件非 zip 或 openpyxl 打不开。
    if (!probe.isZip || probe.openable === false) fail('文件魔数/内容与 .xlsx 不符（改名伪装或损坏）');
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

// 上传数据行按清单校验：必填列全到、主键唯一非空、类型可映射。
function validateRows(rows, m) {
  const errors = [];
  const fail = (field, reason) => errors.push({ field, reason });
  const vm = validateManifest(m);
  if (!vm.ok) return { ok: false, errors: vm.errors };
  const required = vm.structure.required || Object.keys(m.columns);
  const pk = vm.structure.primaryKey;
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) fail('rows', '上传表无数据行');
  const seen = Object.create(null);
  list.forEach((r, i) => {
    required.forEach(c => { if (r[c] === undefined || r[c] === '') fail(c, '第 ' + (i + 1) + ' 行缺少必填列「' + c + '」'); });
    const key = r[pk];
    if (key === undefined || key === '') fail(pk, '第 ' + (i + 1) + ' 行主键为空');
    else if (seen[String(key)]) fail(pk, '主键「' + key + '」重复');
    else seen[String(key)] = true;
  });
  // 类型映射完整性由模块加载期断言保证（见 TYPE_ENUM/TYPE_MAP 定义处），此处无需重复复核。
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

// 冲突检测：同名或同主键逐条比对（name/primaryKey/columns 白名单与类型/schemaVersion），显式替换才放行。
function detectConflicts(incoming, existing, replace) {
  const conflicts = [];
  if (!incoming || typeof incoming !== 'object') {
    return { allowed: false, conflicts: [{ field: 'incoming', reason: '缺少待写入清单' }], autoMerged: false, replace: !!replace };
  }
  const list = Array.isArray(existing) ? existing : [];
  list.forEach(e => {
    const sameName = e.name === incoming.name;
    const samePk = (e.primaryKey || DEFAULT_PRIMARY_KEY) === (incoming.primaryKey || DEFAULT_PRIMARY_KEY);
    if (!sameName && !samePk) return;
    if (sameName) conflicts.push({ field: 'name', reason: '模板名冲突：「' + incoming.name + '」已存在' });
    if (samePk) conflicts.push({ field: 'primaryKey', reason: '主键冲突：「' + (incoming.primaryKey || DEFAULT_PRIMARY_KEY) + '」已被使用' });
    const ec = e.columns || {}, ic = incoming.columns || {};
    const allCols = Object.keys(Object.assign({}, ec, ic));
    allCols.forEach(c => {
      if (ec[c] !== ic[c]) conflicts.push({ field: 'columns', reason: '列「' + c + '」类型/白名单不一致：' + ec[c] + ' vs ' + ic[c] });
    });
    if (e.schemaVersion !== incoming.schemaVersion) conflicts.push({ field: 'schemaVersion', reason: 'schemaVersion 不一致' });
  });
  const allowed = conflicts.length === 0 ? true : !!replace;
  return { allowed, conflicts, autoMerged: false, replace: !!replace };
}

// 四种建表入口统一产出 {mode, structure:{primaryKey,columns,types,rows?}}；描述入口信息不足返回 questions、不猜值。
function createTable(opts) {
  opts = opts || {};
  const mode = opts.mode;
  if (mode === 'blank') {
    return { ok: true, questions: [], structure: { mode: 'blank', primaryKey: DEFAULT_PRIMARY_KEY, columns: [DEFAULT_PRIMARY_KEY], types: { [DEFAULT_PRIMARY_KEY]: 'text' }, rows: [] } };
  }
  if (mode === 'template' || mode === 'upload') {
    const vm = validateManifest(opts.manifest);
    if (!vm.ok) return { ok: false, errors: vm.errors, questions: [] };
    if (mode === 'upload') {
      const vr = validateRows(opts.rows || [], opts.manifest);
      if (!vr.ok) return { ok: false, errors: vr.errors, questions: [] };
    }
    return { ok: true, questions: [], structure: Object.assign({ mode }, vm.structure, { rows: (opts.rows || []).slice() }) };
  }
  if (mode === 'description') {
    const text = typeof opts.description === 'string' ? opts.description : '';
    // 解析「主键X（类型）、列：A（类型）、B（类型）」这类明确描述；只认显式给出的，缺项就问、不猜。
    const pkM = text.match(/主键\s*([^\s（(,，]+)/);
    const colsPart = text.match(/列[：:]\s*(.+)$/);
    if (!pkM || !colsPart) {
      const questions = [];
      if (!pkM) questions.push('请指定主键列（例如「主键 工号」）；默认可用「姓名」吗？');
      if (!colsPart) questions.push('请说明这张表要有哪些列及类型（例如「姓名（文本）、工时（数字）」）');
      return { ok: false, questions, structure: undefined };
    }
    const pk = pkM[1];
    const columns = {}, order = [], missingType = [];
    colsPart[1].split(/[,，、]/).forEach(seg => {
      const s = seg.trim();
      if (!s) return;
      if (/^主键/.test(s)) return; // 「主键X」是主键声明段，不是列定义，跳过
      const m2 = s.match(/([^\s（(]+)\s*[（(]\s*(文本|数字|日期|布尔|枚举|text|number|date|bool|enum)\s*[）)]/);
      if (!m2) { missingType.push(s); return; } // 有列名但没读到类型 → 不静默丢，收集成待问项
      const name = m2[1].trim();
      const raw = m2[2];
      const map = { 文本: 'text', 数字: 'number', 日期: 'date', 布尔: 'bool', 枚举: 'enum', text: 'text', number: 'number', date: 'date', bool: 'bool', enum: 'enum' };
      columns[name] = map[raw]; order.push(name);
    });
    if (order.length === 0 && missingType.length === 0) return { ok: false, questions: ['没能从描述里读出列及类型，请按「列名（类型）」列出'], structure: undefined };
    if (missingType.length > 0) {
      // 用户列出了列但缺类型：信息不足，问清类型，不猜、也不静默省略这些列。
      const questions = missingType.map(seg => '列「' + seg + '」缺少类型，请补充（文本/数字/日期/布尔/枚举）');
      return { ok: false, questions, structure: undefined };
    }
    if (order.indexOf(pk) < 0) return { ok: false, questions: ['主键列「' + pk + '」未在列清单中出现，请补充或改正'], structure: undefined };
    const m = { schemaVersion: SCHEMA_VERSION, name: opts.name || '描述建表', primaryKey: pk, columns };
    const vm = validateManifest(m);
    if (!vm.ok) return { ok: false, errors: vm.errors, questions: [] };
    return { ok: true, questions: [], structure: Object.assign({ mode: 'description' }, vm.structure, { rows: [] }) };
  }
  return { ok: false, errors: [{ field: 'mode', reason: '未知建表入口：' + mode }], questions: [] };
}

function shorten(s) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > 18 ? t.slice(0, 18) + '…' : t;
}

// ---- 条件闭包：= ≠ > ≥ < ≤ 单比较；解析失败返回 null ----
const OP_MAP = {
  '==': '=', '=': '=',
  '!=': '≠', '≠': '≠',
  '>=': '≥', '≥': '≥',
  '<=': '≤', '≤': '≤',
  '>': '>', '<': '<'
};
// 条件值合法性：规格 #8 line 103 —— 第一版只支持「字段 op 值」单比较，
// 值只允许数字 / 文本字面量；AND/OR（含中文）、列间比较、包含 / 为空、内嵌比较符一律非法。
// 解析失败必须报错并禁止确认，绝不静默当成零命中（用户故事 17）。
// 返回 null 表示合法，否则返回具体原因字符串。
function conditionProblem(field, op, value, state) {
  if (!value) return '条件值为空';
  // 值里再出现比较运算符 = 复合条件 / 畸形输入（如「8 AND 部门 = 技术」「>>>」「8 > 5」）
  if (/[><=≠≥≤]/.test(value) || /!(?!=)/.test(value))
    return '条件值不得再含比较运算符（第一版只支持单比较）：' + value;
  // AND / OR / 中文 或、且、并且：第一版不支持复合条件（[v2]，规格 line 22/130）
  if (/\b(and|or)\b/i.test(value) || /或|且|并且/.test(value))
    return '第一版不支持 AND / OR 复合条件：' + value;
  // 包含 / 为空（[v2]）
  if (/包含|为空|contains|is\s+empty/i.test(value))
    return '第一版不支持「包含 / 为空」条件：' + value;
  // 列间比较：值恰好是另一个列名——禁止（规格 line 103）
  if (state && state.columns && state.columns.indexOf(value) !== -1)
    return '不支持列间比较，条件值不能是列名：' + value;
  // 字段必须是当前列
  if (state && state.columns && state.columns.indexOf(field) === -1)
    return '条件字段不是当前列：' + field;
  return null;
}
// 从原始条件文本取具体出错原因（供 validate 报错点名，避免静默）
function conditionProblemFromText(text, state) {
  const m = /^\s*(\S+)\s*(>=|<=|!=|==|≠|≥|≤|>|<|=)\s*(.+?)\s*$/.exec(String(text == null ? '' : text));
  if (!m) return '条件格式应为「字段 op 值」（如 工时 > 8）';
  return conditionProblem(m[1], OP_MAP[m[2]], m[3].trim(), state);
}
function parseCondition(text, state) {
  if (text == null) return null;
  const m = /^\s*(\S+)\s*(>=|<=|!=|==|≠|≥|≤|>|<|=)\s*(.+?)\s*$/.exec(String(text));
  if (!m) return null;
  const value = m[3].trim();
  const op = OP_MAP[m[2]];
  if (conditionProblem(m[1], op, value, state)) return null;
  return { field: m[1], op: op, value: value };
}
// 单一比较分派（数值 / 字符串两种分支共用），避免两套六路比较级联重复。
function compareByOp(op, a, b) {
  if (op === '>') return a > b;
  if (op === '<') return a < b;
  if (op === '≥') return a >= b;
  if (op === '≤') return a <= b;
  if (op === '≠') return a !== b;
  return a === b; // 默认 '='
}
function matches(row, cond) {
  const raw = row[cond.field];
  const a = Number(raw), b = Number(cond.value);
  if (!isNaN(a) && !isNaN(b)) return compareByOp(cond.op, a, b);
  return compareByOp(cond.op, String(raw == null ? '' : raw), cond.value);
}

// ---- 公式字符串生成（票 #11：不实现求值器，只生成公式读回缓存）----
// 规格 #8：function kind 的产物是「公式字符串 + 命名参数」，实际计算交给
// 本地计算引擎（LibreOffice）重算后读回缓存值；引擎本身绝不做 JS 数值求值。
function columnLetter(n) { // 0-based 列序 → A/B/C…（支持多字母列）
  let s = '';
  let i = n + 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}
function toFormula(expr, state, rowIndex) {
  const s = String(expr == null ? '' : expr).replace(/\s+/g, '').replace(/×/g, '*').replace(/−/g, '-');
  const m = /^([^*+\-]+)([*+\-])([^*+\-]+)$/.exec(s);
  if (!m) return null;
  const rowNum = (rowIndex || 0) + 2; // 第 1 行是表头，数据从第 2 行起
  const cols = (state && state.columns) || [];
  const operand = function (tok) {
    if (/^\d+(\.\d+)?$/.test(tok)) return tok;                         // 数字字面量（分隔符已排除 '-'，负号不单独支持）
    if (!/^[\u4e00-\u9fffA-Za-z_][\u4e00-\u9fffA-Za-z0-9_]*$/.test(tok)) return null; // 非法 token（含比较运算符）
    const i = cols.indexOf(tok);
    if (i === -1) return null;                                          // 未知列名
    return columnLetter(i) + rowNum;
  };
  const l = operand(m[1]), r = operand(m[3]);
  if (!l || !r) return null;
  return '=' + l + m[2] + r;
}
// ---- 数值求值（与 toFormula 同文法；用户 m07859 选「存算好的真实数字」）----
// 与 toFormula 共享同一个 operand/operator 文法，但这里把操作数解析成**该行实际单元格数值**并做算术，
// 产出可直接写入单元格的数字（预览与磁盘都显示真实数字，而非 =C2*D2 公式文本）。
// 诚实边界：只支持「操作数 单运算符 操作数」的二元算术（与 toFormula 完全一致的范围），
// 不支持括号/多运算符——超出范围返回 null（调用方回落公式或空）。
function computeValue(expr, state, rowIndex) {
  const s = String(expr == null ? '' : expr).replace(/\s+/g, '').replace(/×/g, '*').replace(/−/g, '-');
  const m = /^([^*+\-]+)([*+\-])([^*+\-]+)$/.exec(s);
  if (!m) return null;
  const rows = (state && state.rows) || [];
  const row = rows[rowIndex || 0] || null;
  if (!row) return null;
  const cols = (state && state.columns) || [];
  const operandValue = function (tok) {
    if (/^\d+(\.\d+)?$/.test(tok)) return Number(tok);         // 数字字面量
    if (!/^[\u4e00-\u9fffA-Za-z_][\u4e00-\u9fffA-Za-z0-9_]*$/.test(tok)) return null;
    if (cols.indexOf(tok) === -1) return null;                 // 未知列名
    const raw = row[tok];
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return isFinite(n) ? n : null;                             // 非数值单元格 → 无法算
  };
  const a = operandValue(m[1]), b = operandValue(m[3]);
  if (a === null || b === null) return null;
  const op = m[2];
  let v;
  if (op === '*') v = a * b;
  else if (op === '+') v = a + b;
  else if (op === '-') v = a - b;
  else return null;
  // 消除浮点误差（如 0.1*3=0.30000000000000004）：保留最多 10 位小数再去尾零。
  const rounded = Math.round(v * 1e10) / 1e10;
  return rounded;
}
// 从「…算成应发 / 写成 X / 得到 X」里抽输出列名（命名参数），抽不到返回 null。
function extractOutputColumn(sentence) {
  const m = /算成([^\s，,。；;]+)|写成([^\s，,。；;]+)|得到([^\s，,。；;]+)|输出([^\s，,。；;]+)/.exec(String(sentence || ''));
  if (!m) return null;
  return (m[1] || m[2] || m[3] || m[4] || '').trim() || null;
}
// 从「把 A 乘以 B 算成 X」里抽表达式本身（F2：不总是用默认表达式）。
// 关键词匹配假编译器的一部分；抽不到就退回 KINDS 默认表达式。
function extractExpression(sentence) {
  const m = /(?:把|将|用)?\s*([^\s，,。；;]+?)\s*(乘以|加上|减去|乘|加|减|\*|×|\+|-)\s*([^\s，,。；;算成写得得到输出结为果]+)/.exec(String(sentence || '').trim());
  if (!m) return null;
  const a = m[1].replace(/^(?:把|将|用)/, '').trim();
  const b = m[3].trim();
  if (!a || !b) return null;
  const opMap = { '乘以': '*', '乘': '*', '×': '*', '*': '*', '加上': '+', '加': '+', '+': '+', '减去': '-', '减': '-', '-': '-' };
  return a + ' ' + (opMap[m[2]] || '*') + ' ' + b;
}

function stepsFor(kind, p) {
  // 票 #12：四类动作都先声明作用范围，steps 如实反映当前 scope（单一计算，各类复用）。
  const isMatch = p.scope === 'match';
  const scopeStep = '作用范围：' + (isMatch
    ? '只作用于满足条件「' + p.条件 + '」的记录'
    : '作用于全部记录');
  if (kind === 'extract') {
    return [
      scopeStep,
      '打开「' + p.来源文件 + '」',
      '按「' + p.匹配列 + '」把两边的记录对齐',
      '取「' + p.取哪一列 + '」这一列',
      '写进当前表的「' + p.写到 + '」列'
    ];
  }
  if (kind === 'swap') return [
    scopeStep,
    '读出「' + p.字段A + '」整列', '读出「' + p.字段B + '」整列', '两段数据整体对调后写回'
  ];
  if (kind === 'conditional') return [
    scopeStep,
    '在范围内的记录上：对「' + p.目标列 + '」执行「' + p.动作 + '」',
    p.动作 === '增加' ? '写入值「' + p.值 + '」' : '清空原值'
  ];
  if (kind === 'function') return [
    scopeStep,
    '把这句话变成公式字符串 ' + p.表达式,
    '按每行的列位置换成 A1 引用（列来自表头、行来自记录序）',
    '公式写进新列「' + p.输出列 + '」，计算交给本地引擎重算后读回缓存值'
  ];
  if (kind === 'dedupe') return [
    scopeStep,
    '按主键把记录分组',
    '每组只保留「' + p.保留策略 + '」，其余重复组的可见列清空'
  ];
  if (kind === 'replace') return [
    scopeStep,
    '在「' + p.目标列 + '」列里查找「' + (p.查找 || '') + '」',
    '替换成「' + (p.替换为 || '') + '」后写回' + (p.查找 ? '（子串替换）' : '（整列赋值）')
  ];
  if (kind === 'fill') return [
    scopeStep,
    '在「' + p.目标列 + '」列里找空单元格',
    '把空的填成「' + p.填充值 + '」，已有值不动'
  ];
  if (kind === 'trim') return [
    scopeStep,
    '把「' + p.目标列 + '」列每格文本的首尾空白去掉后写回'
  ];
  if (kind === 'case') return [
    scopeStep,
    '把「' + p.目标列 + '」列每格英文统一成' + (p.模式 === 'lower' ? '小写' : '大写')
  ];
  if (kind === 'sort') return [
    '按「' + p.排序列 + '」' + (p.方向 === 'desc' ? '降序' : '升序') + '重新排列整表行顺序',
    '行内容不变，只改行的先后顺序（确认后写回整表）'
  ];
  if (kind === 'highlight') return [
    scopeStep,
    '在「' + p.目标列 + '」列上' + (p.条件 ? '筛出满足「' + p.条件 + '」的行' : '取全部行'),
    '给这些单元格刷上底色（' + p.底色 + '），不改任何值'
  ];
  if (kind === 'affix') return [
    scopeStep,
    '给「' + p.目标列 + '」列每格文本' + (p.位置 === 'suffix' ? '末尾追加' : '开头加上') + '「' + p.文本 + '」'
  ];
  return [];
}
function explanationFor(kind, p, sentence) {
  const head = sentence
    ? '把「' + shorten(sentence) + '」理解成「' + KINDS[kind].short + '」'
    : '快捷按钮「' + KINDS[kind].short + '」';
  return head + '；产物介质是' + KINDS[kind].medium + '。下面列出它会影响的单元格，确认前表格不会动。';
}

// 票 #20（T3 Contract）：typed 声明的默认值派生——四类动作的初始参数由 paramSpec 的「默认值」派生，
// 公共字段（scope / 条件）来自 COMMON_PARAMS。旧 KINDS.*.params 默认值 map 已删除，此函数是唯一默认值来源。
// conditional 是唯一例外：它本质是「条件」动作、scope 默认 match（#12/#17 决策：精确保留 #9 的按条件过滤行为），
// 且默认带一个示例条件——这两处覆盖 COMMON_PARAMS 的 all/''，与删除前旧 map 的默认值逐字一致，属行为保真。
const DEFAULT_OVERRIDES = {
  conditional: { scope: 'match', 条件: '工时 > 150' }
};
function typedParamSpec(kind) {
  const spec = KINDS[kind];
  if (!spec) return [];
  return spec.paramSpec.concat(COMMON_PARAMS);
}
function defaultsFor(kind) {
  const out = {};
  typedParamSpec(kind).forEach(function (d) { out[d.key] = d.默认值; });
  const ov = DEFAULT_OVERRIDES[kind];
  if (ov) Object.keys(ov).forEach(function (k) { out[k] = ov[k]; });
  return out;
}

function buildDraft(kind, sentence, overrides) {
  const spec = KINDS[kind];
  if (!spec) return { kind: kind, schemaVersion: SCHEMA_VERSION, params: Object.assign({}, overrides || {}) };
  const defaults = defaultsFor(kind);
  const params = Object.assign({}, defaults, overrides || {});
  // function kind：从句子里抽输出列名与表达式（命名参数），没有显式覆盖才采用。
  if (kind === 'function' && sentence) {
    if (params['输出列'] === defaults['输出列']) {
      const out = extractOutputColumn(sentence);
      if (out) params['输出列'] = out;
    }
    if (params['表达式'] === defaults['表达式']) {
      const ex = extractExpression(sentence);
      if (ex) params['表达式'] = ex;
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: kind,
    name: sentence ? shorten(sentence) : spec.short + '（快捷）',
    sentence: sentence || '',
    params: params,
    medium: spec.medium,
    steps: stepsFor(kind, params),
    explanation: explanationFor(kind, params, sentence)
  };
}

function rebuildDraft(draft, params) {
  const merged = Object.assign({}, draft.params, params || {});
  return {
    schemaVersion: draft.schemaVersion,
    kind: draft.kind, name: draft.name, sentence: draft.sentence,
    params: merged, medium: KINDS[draft.kind].medium,
    steps: stepsFor(draft.kind, merged),
    explanation: explanationFor(draft.kind, merged, draft.sentence)
  };
}

// 假编译器：关键词匹配（真实版本要补 LLM，见研究笔记；此版刻意留成非 LLM）
function understand(sentence) {
  const s = String(sentence == null ? '' : sentence).trim();
  if (!s) return { error: '输入框是空的，先写一句话' };
  let kind = null;
  if (/提取|邮箱|外勤|对应文件|补.*列|拉过来/.test(s)) kind = 'extract';
  else if (/调换|交换|互换|对调/.test(s)) kind = 'swap';
  else if (/条件|大于|小于|超过|删掉|清空|标记|标注|加班/.test(s)) kind = 'conditional';
  else if (/计算|乘|函数|公式|算成|求和|[*+]/.test(s)) kind = 'function';
  else if (/去重|重复|dedupe|唯一/.test(s)) kind = 'dedupe';
  else if (/空格|首尾|trim|去空/.test(s)) kind = 'trim';
  else if (/大写|小写|大小写|upper|lower/.test(s)) kind = 'case';
  else if (/前缀|后缀|加前缀|加后缀|affix/.test(s)) kind = 'affix';
  else if (/排序|按.*排|升序|降序|sort/.test(s)) kind = 'sort';
  else if (/标色|底色|背景色|高亮|涂色|标黄|标红|highlight/.test(s)) kind = 'highlight';
  else if (/替换|换成|改成/.test(s)) kind = 'replace';
  else if (/填充|空值|补齐|补空/.test(s)) kind = 'fill';
  if (!kind) return { error: '没匹配到任何一种功能（本版只是关键词匹配，不是真 LLM）' };
  return { kind: kind, sentence: s };
}

// 封闭 schema 校验：在预览前跑完，不落盘部分结果（票 #14）
// 规格 #8：校验是按参数类型系统机械派生的「封闭清单」——未知版本 / 未知字段 /
// 缺失必填 / 非法 scope·condition 一律拒绝并报具体原因；每条失败同时产出结构化
// issue（field + reason），供预览卡第②段渲染「就地可编辑修正控件」。
function validate(draft, state) {
  const errors = [];
  const issues = [];
  const fail = function (field, msg) {
    issues.push({ field: field, reason: msg });
    errors.push(msg);
  };
  if (!draft || typeof draft !== 'object') {
    fail('draft', '配方草稿不存在');
    return { ok: false, errors: errors, issues: issues };
  }
  if (draft.schemaVersion === undefined) fail('schemaVersion', '缺少 schemaVersion');
  else if (draft.schemaVersion !== SCHEMA_VERSION)
    fail('schemaVersion', 'schemaVersion 不匹配：' + draft.schemaVersion + ' != ' + SCHEMA_VERSION);
  if (!draft.kind || !KINDS[draft.kind]) fail('kind', '未知的功能种类：' + draft.kind);
  const p = draft.params || {};
  // 票 #19（T2 Migrate）：参数封闭校验改由 paramSpec 派生驱动（私有参数 + 公共字段 scope/条件）。
  //   deriveIssues 已含：未知字段拒绝、必填、类型（text/列名/数值/表达式/文件/枚举）、枚举约束、数值约束……
  //   旧的逐 kind「值存在性」硬编码退位，只保留无法由单值类型表达的跨参数/跨表检查（见下方）。
  if (draft.kind && KINDS[draft.kind]) {
    const spec = typedParamSpec(draft.kind);
    const derived = deriveIssues(spec, p, state);
    derived.forEach(function (it) { issues.push(it); errors.push(it.reason); });
  }
  // 跨参数/跨表检查（单值类型系统表达不了，保留在此）：
  if (draft.kind === 'extract') {
    // 来源文件须在声明式数据源里（依赖 state.sources，非单值类型可表达）。
    if (p.来源文件 && state && state.sources && !state.sources[p.来源文件])
      fail('来源文件', '来源文件不在声明式数据源里：' + p.来源文件);
  }
  if (draft.kind === 'swap') {
    // 票 #13：半换边界必须确定且可测——同列自换无意义（列存在性已由 paramSpec mustExist 负责）。
    const a = p.字段A, b = p.字段B;
    if (a && b && a === b) fail('字段B', '字段A 与 字段B 不能相同（同列自换没有确定意义）');
  }
  // 条件合法性（scope=match 时；依赖 state，非单值类型可表达）。
  if (p.scope === 'match') {
    const cond = parseCondition(p.条件, state);
    if (!cond) {
      // 给出具体原因（用户故事 17：写错时单独报错并禁止确认，绝不静默当零命中）
      const reason = conditionProblemFromText(p.条件, state);
      fail('条件', 'scope=match 时条件非法：' + p.条件 + (reason ? '（' + reason + '）' : ''));
    }
  }
  return { ok: errors.length === 0, errors: errors, issues: issues };
}

// 票 #18（T1 Expand）引入、#19（T2 Migrate）接入主流程：带类型参数派生器——给定 paramSpec 与 params，按类型机械派生 issue{field,reason}。
// 纯函数、无副作用；自 #19 起由 validate() 作为参数封闭校验主路径调用（旧的逐 kind「值存在性」硬编码已退位）。
//  类型语义：text（须字符串）/ 列名（约束 newColumn→可新建、mustExist/无标志→须存在；无 state.columns 时只查形状）/ 数值（数字且在约束内）
//           / 表达式（须字符串，约束 translatable 时用 toFormula 查可翻译）/ 文件（非空字符串）/ 枚举（取值在约束 enum 内）
//  另：params 中 paramSpec 未声明的 key 视为未知字段拒绝。
function deriveIssues(paramSpec, params, state) {
  const issues = [];
  const p = params || {};
  const spec = paramSpec || [];
  const declared = {};
  spec.forEach(function (d) { declared[d.key] = true; });

  // 未知字段拒绝（封闭白名单）
  Object.keys(p).forEach(function (key) {
    if (!declared[key]) issues.push({ field: key, reason: '未知字段：' + key });
  });

  spec.forEach(function (d) {
    const v = p[d.key];
    const missing = (v === undefined || v === null || v === '');
    if (missing) {
      if (d.必填) issues.push({ field: d.key, reason: '缺少必填参数：' + d.key });
      return;
    }
    switch (d.类型) {
      case '数值': {
        const n = typeof v === 'number' ? v : Number(v);
        if (typeof v === 'boolean' || isNaN(n)) {
          issues.push({ field: d.key, reason: '数值类型不符：' + d.key + ' = ' + v });
          break;
        }
        const c = d.约束 || {};
        if (c.min !== undefined && n < c.min) issues.push({ field: d.key, reason: '数值超出约束范围（应 >= ' + c.min + '）：' + d.key + ' = ' + n });
        else if (c.max !== undefined && n > c.max) issues.push({ field: d.key, reason: '数值超出约束范围（应 <= ' + c.max + '）：' + d.key + ' = ' + n });
        break;
      }
      case '枚举': {
        const c = d.约束 || {};
        if (Array.isArray(c.enum) && c.enum.indexOf(v) === -1) {
          issues.push({ field: d.key, reason: '取值只能是 ' + c.enum.join('|') + '：' + d.key + ' = ' + v });
        }
        break;
      }
      case '列名': {
        // 票 #19（T2）：存在 or 明确「将新建列」；无 state.columns 时只做形状检查。
        //   约束.mustExist=true  → 列必须已存在（如 swap 两列、extract 匹配列）
        //   约束.newColumn=true  → 允许新建列（如 extract 写到、function 输出列、conditional 目标列）
        //   两者都无时按「必须存在」保守处理（与旧行为一致）。
        const c = d.约束 || {};
        if (state && Array.isArray(state.columns) && state.columns.indexOf(v) === -1) {
          if (c.newColumn) break; // 允许新建列
          issues.push({ field: d.key, reason: d.key + ' 不是当前列（不存在的列）：' + v });
        }
        break;
      }
      case '表达式': {
        // 票 #19（T2）：表达式型需可翻译（与既有 function 校验对齐）；约束.translatable=true 时查 toFormula。
        if (typeof v !== 'string') {
          issues.push({ field: d.key, reason: '表达式 类型不符：' + d.key + ' 需为字符串' });
          break;
        }
        const c = d.约束 || {};
        if (c.translatable && state && toFormula(v, state, 0) === null) {
          issues.push({ field: d.key, reason: '表达式非法或引用了不存在的列：' + v });
        }
        break;
      }
      case 'text':
      case '文件':
      default: {
        if (typeof v !== 'string') {
          issues.push({ field: d.key, reason: (d.类型 || 'text') + ' 类型不符：' + d.key + ' 需为字符串' });
        }
        break;
      }
    }
  });
  return issues;
}

function beforeOf(state, row, col) {
  if (state.columns.indexOf(col) === -1) return '（无此列）';
  const v = row[col];
  return (v === '' || v === undefined || v === null) ? '（空）' : String(v);
}

// 纯函数：算出「会改哪些格子」，不改任何东西
function preview(state, draft) {
  const totalRows = state.rows.length;
  // 票 #21（S1）：把当前 adapter 及其能力位随预览带出（供预览卡第⑥段投影），三条返回路径都带。
  const ad = adapterOf(state);
  const adapterMeta = { adapter: ad.id, adapterLabel: ad.label, formulaCapabilities: Object.assign({}, ad.formulaCapabilities) };
  // 票 #21（S1）：先查当前 adapter 的公式能力位——false 的动作在此平台禁用，
  //   给出明确原因提示（disabled=true / capabilityBlockers），绝不静默降级、不写死值、不产 cells。
  const capabilityBlockers = capabilityBlockersOf(draft, state);
  if (capabilityBlockers.length > 0) {
    const reasons = capabilityBlockers.map(function (b) { return b.reason; });
    return Object.assign({
      cells: [], summary: '该动作在「' + ad.label + '」上被禁用：' + reasons.join('；') +
        ' 不静默降级、不写死值、不偷偷把公式算成值。',
      affectedRows: 0, totalRows, invalid: true, disabled: true,
      errors: reasons, issues: [], capabilityBlockers: capabilityBlockers,
      disclosure: null, swapBanner: '',
      paramSpec: (draft && draft.kind && KINDS[draft.kind]) ? typedParamSpec(draft.kind) : []
    }, adapterMeta);
  }
  const v = validate(draft, state);
  // 票 #20（T3 Contract）：预览带出 typed paramSpec（含类型/必填/默认值/约束），供预览卡第③段展示由宿主渲染控件。
  //   纯数据、不含 UI；非法与合法两条返回路径都带，宿主随时可显示参数元数据。
  const paramSpec = (draft && draft.kind && KINDS[draft.kind]) ? typedParamSpec(draft.kind) : [];
  if (!v.ok) {
    return Object.assign({ cells: [], summary: '校验未通过，不能预览：' + v.errors.join('；'), affectedRows: 0, totalRows,
      invalid: true, disabled: false, errors: v.errors, issues: v.issues, capabilityBlockers: [],
      disclosure: null, swapBanner: '', paramSpec: paramSpec }, adapterMeta);
  }
  let disclosure = null;   // 票 #13：swap 半换披露（swappedRows/unchangedRows/mixedColumns/partial）
  let summaryExtra = '';   // 票 #13：swap 半换 banner，接进 summary
  const previewMeta = {};  // sort 等「结构性动作」把额外元数据（如 sortOrder 行序）挂这里
  const p = draft.params, cells = [];
  const pk = state.primaryKey || '姓名';
  // 票 #13：add 带 source（改动来源）。cells 只含「将改的格子」，未命中行不产格子，
  // 命中/未命中的区分由结构化 disclosure.swappedRows/unchangedRows 承载（不再设恒真的 hit 字段）。
  const add = function (row, col, before, after, invalid, source) {
    // 行索引寻址（去重等需要精确到「第几行」而非「主键值等于什么」的动作）：
    // 记录该行在 state.rows 中的下标。applyCells 优先用它精确定位（重复主键也能清对行）；
    // 无 index 命中（row 不是 state.rows 里的同一对象）时回落按主键值定位，向后兼容。
    const rowIndex = state.rows.indexOf(row);
    const cell = { row: String(row[pk]), col, before, after, invalid: !!invalid, source: source || draft.kind,
      rowIndex: rowIndex === -1 ? undefined : rowIndex };
    cells.push(cell);
    return cell;
  };
  const scopeCond = p.scope === 'match' ? parseCondition(p.条件, state) : null;
  const inScope = function (r) { return !scopeCond || matches(r, scopeCond); };

  if (draft.kind === 'extract') {
    const src = state.sources[p.来源文件].rows;
    state.rows.forEach(function (r) {
      if (!inScope(r)) return;
      const hit = src.filter(function (x) { return x[p.匹配列] === r[p.匹配列]; })[0];
      add(r, p.写到, beforeOf(state, r, p.写到), hit && hit[p.取哪一列] !== undefined ? String(hit[p.取哪一列]) : '', false, 'extract');
    });
  } else if (draft.kind === 'swap') {
    // 票 #13：半换——命中行两格对调、未命中行不动；逐格披露命中与来源，不掩盖部分改动。
    const swappedRows = [], unchangedRows = [];
    state.rows.forEach(function (r) {
      const name = String(r[pk]);
      if (!inScope(r)) { unchangedRows.push(name); return; }
      swappedRows.push(name);
      add(r, p.字段A, beforeOf(state, r, p.字段A), String(r[p.字段B] == null ? '' : r[p.字段B]), false, 'swap');
      add(r, p.字段B, beforeOf(state, r, p.字段B), String(r[p.字段A] == null ? '' : r[p.字段A]), false, 'swap');
    });
    // 两列是否混合两种来源：只有「部分行交换、部分行不变」时才混合；整列互换或零命中都不混合。
    const partial = swappedRows.length > 0 && unchangedRows.length > 0;
    const mixedColumns = partial ? [p.字段A, p.字段B] : [];
    disclosure = {
      kind: 'swap', partial: partial,
      swappedRows: swappedRows, unchangedRows: unchangedRows,
      swappedCount: swappedRows.length, unchangedCount: unchangedRows.length,
      mixedColumns: mixedColumns
    };
    if (partial) {
      const banner = '调换半换：' + swappedRows.length + ' 行交换、' + unchangedRows.length +
        ' 行不变；列「' + p.字段A + '」「' + p.字段B + '」将混合两种来源。';
      summaryExtra = banner;
    }
  } else if (draft.kind === 'conditional') {
    // 票 #12：条件增删也走公共 scope/inScope，不再用自己的私有条件过滤。
    // 动作（增加/删去）决定写什么，公共 scope/条件决定作用于哪些行。
    const isDelete = p.动作 === '删去' || p.动作 === '删除' || p.动作 === '清空';
    state.rows.forEach(function (r) {
      if (!inScope(r)) return;
      add(r, p.目标列, beforeOf(state, r, p.目标列), isDelete ? '' : String(p.值), false, 'conditional');
    });
  } else if (draft.kind === 'function') {
    // ② 写公式而非值：p.写入方式==='公式' 时写 A1 公式串（交给 Excel/WPS 打开后重算）；
    // 默认（数值）算好真实数字。两者共用同一 operand/operator 文法。
    const asFormula = p.写入方式 === '公式';
    if (asFormula) {
      summaryExtra = '（写入方式：公式——每格写入 A1 公式串，打开 Excel/WPS 时按公式重算；不是算好的数字。）';
      state.rows.forEach(function (r, ri) {
        if (!inScope(r)) return;
        const formula = toFormula(p.表达式, state, ri);
        add(r, p.输出列, beforeOf(state, r, p.输出列), formula || '', !formula, 'function');
      });
    } else {
      state.rows.forEach(function (r, ri) {
        if (!inScope(r)) return;
        // 用户 m07859 选「存算好的真实数字」：优先算实际数值写入（预览/磁盘都显示数字，不再是公式文本）。
        // computeValue 与 toFormula 同文法；算不出（非数值单元格/超出文法）时回落公式字符串，
        // 再不行则空串并标 invalid（保持可诊断，不静默错算）。
        const value = computeValue(p.表达式, state, ri);
        if (value !== null) {
          add(r, p.输出列, beforeOf(state, r, p.输出列), value, false, 'function');
          return;
        }
        const formula = toFormula(p.表达式, state, ri);
        add(r, p.输出列, beforeOf(state, r, p.输出列), formula || '', !formula, 'function');
      });
    }
  } else if (draft.kind === 'dedupe') {
    // ⑤ 按主键去重（最小扩展示例）：按主键分组，保留策略（首条/末条）保留一条，
    // 其余重复行的「非主键可见列」清空。applyCells 只写单元格值、不物理删行——诚实边界。
    const keepLast = p.保留策略 === '末条';
    // 按出现顺序分组，只保留在主键上不同值的第一/最后一条索引。
    const seen = Object.create(null);
    state.rows.forEach(function (r, ri) {
      if (!inScope(r)) return;
      const key = String(r[pk]);
      if (seen[key] === undefined) seen[key] = [];
      seen[key].push(ri);
    });
    state.rows.forEach(function (r, ri) {
      if (!inScope(r)) return;
      const group = seen[String(r[pk])];
      const keepIdx = keepLast ? group[group.length - 1] : group[0];
      if (ri === keepIdx) return; // 保留行不动
      // 清空该重复行的所有非主键可见列（主键列保留，避免把整行变空）。
      state.columns.forEach(function (col) {
        if (col === pk) return;
        add(r, col, beforeOf(state, r, col), '', false, 'dedupe');
      });
    });
  } else if (draft.kind === 'replace') {
    // ⑥ 文本替换：在「目标列」里把「查找」子串替换成「替换为」。
    // 查找为空、替换为非空 → 整列赋值为替换值（批量改）。
    // 查找为空且替换为也为空 → 会清空整列，属误操作（用户 m10775 实机发现），此处明确拦截：
    // 返回 invalid 预览、不产出任何单元格，避免静默把一列抹成空。
    const findStr = String(p.查找 == null ? '' : p.查找);
    const repStr = String(p.替换为 == null ? '' : p.替换为);
    if (!findStr && !repStr) {
      return Object.assign({ cells: [], summary: '「查找」和「替换为」都为空：替换不会改动任何单元格（不执行）。',
        affectedRows: 0, totalRows: state.rows.length, invalid: true, disabled: false,
        errors: ['「查找」与「替换为」不能同时为空'], issues: [], capabilityBlockers: [],
        disclosure: null, swapBanner: '', paramSpec: paramSpec }, adapterMeta);
    }
    state.rows.forEach(function (r) {
      if (!inScope(r)) return;
      const before = beforeOf(state, r, p.目标列);
      const cur = r[p.目标列] == null ? '' : String(r[p.目标列]);
      let after;
      if (!findStr) after = repStr;
      else after = cur.split(findStr).join(repStr);
      if (after !== cur) add(r, p.目标列, before, after, false, 'replace');
    });
  } else if (draft.kind === 'fill') {
    // ⑦ 空值填充：目标列在该行为空/仅空白时写入填充值；已有值不动。
    state.rows.forEach(function (r) {
      if (!inScope(r)) return;
      const cur = r[p.目标列] == null ? '' : String(r[p.目标列]);
      if (String(cur).trim() === '') {
        add(r, p.目标列, beforeOf(state, r, p.目标列), String(p.填充值 == null ? '' : p.填充值), false, 'fill');
      }
    });
  } else if (draft.kind === 'trim') {
    // ⑧ 去首尾空格：目标列每格 String.trim() 后若变化则写回。
    state.rows.forEach(function (r) {
      if (!inScope(r)) return;
      const cur = r[p.目标列] == null ? '' : String(r[p.目标列]);
      const after = cur.trim();
      if (after !== cur) add(r, p.目标列, beforeOf(state, r, p.目标列), after, false, 'trim');
    });
  } else if (draft.kind === 'case') {
    // ⑨ 英文大小写：upper→toUpperCase，lower→toLowerCase。
    state.rows.forEach(function (r) {
      if (!inScope(r)) return;
      const cur = r[p.目标列] == null ? '' : String(r[p.目标列]);
      const after = p.模式 === 'lower' ? cur.toLowerCase() : cur.toUpperCase();
      if (after !== cur) add(r, p.目标列, beforeOf(state, r, p.目标列), after, false, 'case');
    });
  } else if (draft.kind === 'affix') {
    // ⑩ 加前缀后缀：每格文本按位置加前缀/后缀。
    state.rows.forEach(function (r) {
      if (!inScope(r)) return;
      const cur = r[p.目标列] == null ? '' : String(r[p.目标列]);
      const txt = String(p.文本 == null ? '' : p.文本);
      const after = p.位置 === 'suffix' ? (cur + txt) : (txt + cur);
      if (after !== cur) add(r, p.目标列, beforeOf(state, r, p.目标列), after, false, 'affix');
    });
  } else if (draft.kind === 'sort') {
    // ⑪ 排序：结构性动作——不改任何单元格，只产 preview.sortOrder（新行序下标数组）。
    // 稳定排序：同值时保持原相对序（用下标兜底比较）。数值列按数值比，其余按字符串比（可空值排最前）。
    const col = p.排序列;
    const desc = p.方向 === 'desc';
    const idx = state.rows.map(function (r, i) { return i; });
    const valOf = function (i) { return state.rows[i][col]; };
    const numOf = function (v) { const n = Number(v); return isFinite(n) && v !== '' && v !== null && v !== undefined ? n : null; };
    idx.sort(function (a, b) {
      const va = valOf(a), vb = valOf(b);
      const na = numOf(va), nb = numOf(vb);
      let cmp;
      if (na !== null && nb !== null) cmp = na - nb;
      else cmp = String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb));
      if (cmp === 0) cmp = a - b; // 稳定：同值保持原相对序
      return desc ? -cmp : cmp;
    });
    previewMeta.sortOrder = idx;
  } else if (draft.kind === 'highlight') {
    // ⑫ 单元格标色：不改值，只给目标列满足条件的行产一格（after=原值 + highlight=底色）。
    // 条件走 matches()；条件空=整列全部行。写盘时 python 桥按 highlight 刷 PatternFill。
    const col = p.目标列;
    const color = p.底色;
    const cond = p.条件 ? parseCondition(p.条件, state) : null;
    state.rows.forEach(function (r, ri) {
      if (!inScope(r)) return;
      if (cond && !matches(r, cond)) return;
      const cell = add(r, col, beforeOf(state, r, col), beforeOf(state, r, col), false, 'highlight');
      cell.highlight = color;
    });
  }
  // 影响行数按「行」去重，不能只按主键值（重复主键会把两行塌成一行、少报影响行数）。
  // 优先用 rowIndex（state.rows 下标，重复主键也能区分），无 rowIndex 时回落主键值。
  const rowSet = {};
  cells.forEach(function (c) {
    const key = (c.rowIndex != null) ? ('#' + c.rowIndex) : ('k:' + c.row);
    rowSet[key] = true;
  });
  const affectedRows = Object.keys(rowSet).length;
  let summary = affectedRows === 0
    ? '影响 0 行 / 共 ' + totalRows + ' 行；没有任何单元格会变 —— 条件没命中任何记录。零命中允许确认。'
    : '影响 ' + affectedRows + ' 行 / 共 ' + totalRows + ' 行；共 ' + cells.length + ' 个单元格会变。确认前表格不会动。';
  // 结构性动作（sort）：没有「单元格变化」，但有「整表行序变化」——如实给出会重排的行数。
  if (previewMeta.sortOrder) {
    const moved = previewMeta.sortOrder.filter(function (v, i) { return v !== i; }).length;
    summary = '按列重排整表行顺序：' + totalRows + ' 行中 ' + moved + ' 行位置会变。确认后写回整表（行内容不变，只改先后顺序）。';
  }
  if (summaryExtra) summary += summaryExtra;
  // 票 #12：预览如实反映当前作用范围，供预览卡渲染「作用范围」控件。
  // 票 #13：disclosure + swapBanner 随预览返回，供面板渲染「命中？列 + 混合来源 banner」。
  return Object.assign({ cells, summary, affectedRows, totalRows, invalid: false, disabled: false, errors: [], issues: [],
    capabilityBlockers: [],
    scope: p.scope || 'all', condition: p.条件 || '',
    disclosure: disclosure, swapBanner: summaryExtra, paramSpec: paramSpec }, previewMeta, adapterMeta);
}

// 纯函数：把预览里的格子落到一份新表格上
// sortOrder（可选）：结构性动作（sort）的新行序下标数组——给了则按它重排 rows（不改任何单元格值）。
function applyCells(state, cells, sortOrder) {
  const pk = state.primaryKey || '姓名';
  const columns = state.columns.slice();
  (cells || []).forEach(function (c) { if (columns.indexOf(c.col) === -1) columns.push(c.col); });
  let rows = state.rows.map(function (r) { return Object.assign({}, r); });
  // 结构性动作：先按 sortOrder 重排整表行序（行内容对象不变，只改先后）。
  if (Array.isArray(sortOrder) && sortOrder.length === rows.length) {
    rows = sortOrder.map(function (i) { return rows[i]; });
  }
  (cells || []).forEach(function (c) {
    // 优先按行索引精确定位（重复主键也能清对行）；无有效 rowIndex 时回落按主键值定位（向后兼容）。
    const byIndex = (typeof c.rowIndex === 'number' && c.rowIndex >= 0 && c.rowIndex < rows.length)
      ? rows[c.rowIndex]
      : null;
    const target = byIndex && String(byIndex[pk]) === c.row
      ? byIndex
      : rows.filter(function (r) { return String(r[pk]) === c.row; })[0];
    if (target) target[c.col] = c.after;
  });
  return { columns: columns, rows: rows };
}

// 票 #15：按钮 id 单调不复用——取现有 b<number> 的最大号 +1，
// 不用 buttons.length+1（删除中间按钮后重建会撞 id）。
function nextButtonId(buttons) {
  let max = 0;
  (buttons || []).forEach(function (b) {
    const m = /^b(\d+)$/.exec(String(b.id || ''));
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  return 'b' + (max + 1);
}
// 按钮是声明式配方 + 运行态标记；Host 权威源持久化时只需存这些字段（票 #15 / 用户故事 32）。
// 这里做防御性拷贝，导出/水合都不共享内部引用、不含任何可执行代码。
// 票 #16：新增来源标记 source（preset=仓内注册表预置 / user=使用者固化）与按钮级 schemaVersion；
// 旧按钮没有 source 时默认 user、没有 schemaVersion 时默认 SCHEMA_VERSION，向后兼容。
function cloneButton(b) {
  return {
    id: b.id, name: b.name, kind: b.kind,
    params: Object.assign({}, b.params || {}),
    medium: b.medium, steps: (b.steps || []).slice(),
    source: b.source === 'preset' ? 'preset' : 'user',
    schemaVersion: b.schemaVersion === undefined ? SCHEMA_VERSION : b.schemaVersion,
    lastAffectedRows: b.lastAffectedRows === undefined ? 0 : b.lastAffectedRows,
    emptyRun: !!b.emptyRun
  };
}
function initial(data) {
  data = data || {};
  // 票 #21（S1）：adapter 选择。非法/缺省回退 local；非法值记一条 warn 让宿主/用户知情（不静默吞）。
  const requestedAdapter = data.adapter;
  const adapterOk = !requestedAdapter || !!ADAPTERS[requestedAdapter];
  const adapter = adapterOk ? (requestedAdapter || DEFAULT_ADAPTER) : DEFAULT_ADAPTER;
  const adapterNote = !adapterOk
    ? { note: '未知的平台 adapter「' + requestedAdapter + '」，已回退到「' + ADAPTERS[DEFAULT_ADAPTER].label + '」。', noteTone: 'warn' }
    : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    adapter: adapter,
    primaryKey: data.primaryKey || '姓名',
    columns: (data.columns || []).slice(),
    rows: (data.rows || []).map(function (r) { return Object.assign({}, r); }),
    sources: data.sources || {},
    stage: 'IDLE', input: '', draft: null, preview: null,
    buttons: (data.buttons || []).map(cloneButton),  // 票 #15：Host 权威源水合（使用者固化）
    registryButtons: (data.registryButtons || []).map(cloneButton),  // 票 #16：仓内注册表预置（git 来源）
    log: [], note: adapterOk ? '先写一句话并「理解」，或按一个快捷按钮。' : adapterNote.note,
    noteTone: adapterOk ? 'info' : 'warn'
  };
}

// ---- 票 #16：仓内声明式按钮注册表（预置按钮，git 作「线上」来源）----
// 纯函数：输入已解析的注册表条目数组 + 可选 state，逐条封闭校验后产出按钮。
// 校验与配方校验系统共用规则（直接调 validate），额外加注册表条目自身的封闭字段检查。
// 非法条目逐条拒绝、不影响其它合法条目；不读文件（文件 I/O 是 scripts/load-registry.js 的职责）。
// 顶层字段白名单只收条目真正声明的 5 个字段；medium/steps 是校验通过后由 buildDraft
// 派生的产物，不接受调用方提供（否则会被悄悄丢弃、形成假声明，见 #16 code-review M4/LOW）。
const REGISTRY_TOP_KEYS = ['schemaVersion', 'name', 'source', 'kind', 'params'];
function loadRegistry(entries, state) {
  const accepted = [];
  const rejected = [];
  // 用无原型字典，避免 constructor / toString / __proto__ 等继承属性被误判为重复
  //（#16 code-review Standards LOW）。
  const seenNames = Object.create(null);
  (entries || []).forEach(function (entry, idx) {
    const label = (entry && entry.name) || ('#' + (idx + 1));
    if (!entry || typeof entry !== 'object') {
      rejected.push({ name: label, reason: '条目不是对象' });
      return;
    }
    // 1) 顶层字段封闭白名单：未知字段（尤其可执行代码）一律拒绝
    const unknown = Object.keys(entry).filter(function (k) { return REGISTRY_TOP_KEYS.indexOf(k) === -1; });
    if (unknown.length) {
      rejected.push({ name: label, reason: '未知字段：' + unknown.join('、') });
      return;
    }
    // 2) 来源必须是 preset（注册表是预置来源；使用者固化按钮不进注册表）
    if (entry.source !== 'preset') {
      rejected.push({ name: label, reason: '注册表条目的 source 必须是 preset' });
      return;
    }
    // 3) 按钮名非空、不重复
    const name = String(entry.name || '').trim();
    if (!name) {
      rejected.push({ name: label, reason: '缺少按钮名 name' });
      return;
    }
    if (seenNames[name]) {
      rejected.push({ name: label, reason: '按钮名重复：' + name });
      return;
    }
    // 4) 配方本体校验：与配方校验系统共用同一套 validate 规则（未合并默认值，
    //    这样缺必填参数能当场抓出；buildDraft 的默认值合并只在通过校验后用于派生 steps）。
    const rawDraft = {
      schemaVersion: entry.schemaVersion,
      kind: entry.kind,
      params: entry.params || {}
    };
    const check = validate(rawDraft, state);
    if (!check.ok) {
      rejected.push({ name: label, reason: check.errors.join('；') });
      return;
    }
    seenNames[name] = true;
    // 5) 通过校验后，用 buildDraft 派生完整声明式配方（默认值 + steps + medium），不含可执行代码。
    const full = buildDraft(entry.kind, null, entry.params);
    accepted.push(cloneButton({
      id: 'p' + (accepted.length + 1),
      name: name, kind: entry.kind, source: 'preset',
      schemaVersion: entry.schemaVersion,
      params: full.params, medium: full.medium, steps: full.steps,
      lastAffectedRows: 0, emptyRun: false
    }));
  });
  return { ok: rejected.length === 0, accepted: accepted, rejected: rejected, total: (entries || []).length };
}

// 把注册表加载结果水合进 state 的 registryButtons（预置来源），不与使用者固化按钮混在一起。
function hydrateRegistry(state, buttons) {
  return set(state, { registryButtons: (buttons || []).map(cloneButton) });
}
function push(state, text, tone) {
  return [{ text: text, tone: tone || 'info' }].concat(state.log).slice(0, 8);
}
function set(state, patch) { return Object.assign({}, state, patch); }
function guard(state, msg) { return set(state, { note: msg, noteTone: 'warn', log: push(state, msg, 'warn') }); }

function reduce(state, action) {
  switch (action.type) {
    case 'RESET': return initial({ primaryKey: state.primaryKey, columns: state.columns, rows: state.rows, sources: state.sources });
    case 'SET_INPUT':
      return set(state, {
        input: action.text,
        note: '输入框里写下了「' + shorten(action.text) + '」；还没理解，表格没动。',
        noteTone: 'info', log: push(state, '输入：' + shorten(action.text))
      });
    case 'UNDERSTAND': {
      const text = action.text !== undefined ? action.text : state.input;
      const got = understand(text);
      if (got.error) return guard(state, got.error);
      return set(state, {
        input: got.sentence, draft: buildDraft(got.kind, got.sentence), preview: null,
        stage: 'UNDERSTOOD', note: '已理解成「' + KINDS[got.kind].short + '」。注意：本版是关键词匹配，不是真 LLM。',
        noteTone: 'info', log: push(state, '理解：' + shorten(got.sentence) + ' → ' + KINDS[got.kind].short)
      });
    }
    case 'QUICK': {
      const draft = buildDraft(action.kind, null, action.params);
      const pv = preview(state, draft);
      if (pv.invalid) return guard(state, pv.summary);
      return set(state, {
        draft: draft, preview: pv, stage: 'PREVIEWED',
        note: '快捷按钮跳过了「理解」，直接给出解释与影响预览：' + pv.summary, noteTone: 'info',
        log: push(state, '快捷按钮「' + KINDS[action.kind].short + '」→ ' + pv.summary)
      });
    }
    case 'PREVIEW': {
      if (!state.draft) return guard(state, '拦住了：还没有配方草稿。先写一句话并「理解」，或按一个快捷按钮。');
      const draft = rebuildDraft(state.draft, action.params);
      const pv = preview(state, draft);
      if (pv.invalid) return guard(state, pv.summary);
      return set(state, {
        draft: draft, preview: pv, stage: 'PREVIEWED',
        note: '解释与影响预览已就绪：' + pv.summary, noteTone: 'info',
        log: push(state, '影响预览：' + pv.summary)
      });
    }
    case 'CONFIRM': {
      if (state.stage !== 'PREVIEWED' || !state.preview || state.preview.invalid)
        return guard(state, '拦住了：没有合法的「解释与影响预览」就不能执行。顺序是 理解 → 预览 → 确认 → 执行。');
      // 票 #14（Standards review finding #1 加固）：执行前再跑一次封闭校验。
      // 正常状态机里 PREVIEW 已校验过，这一步是纵深防御——防止宿主持久化/重水合/外部改动
      // 让 state 在 PREVIEW 与 CONFIRM 之间漂移后，仍能执行一份已失效的配方。
      const reconfirm = validate(state.draft, state);
      if (!reconfirm.ok)
        return guard(state, '拦住了：配方在执行前重新校验未通过（' + reconfirm.errors.join('；') + '）。');
      const applied = applyCells(state, state.preview.cells, state.preview.sortOrder);
      return set(state, {
        columns: applied.columns, rows: applied.rows, stage: 'EXECUTED',
        note: '用户已确认，执行完成：改了 ' + state.preview.cells.length + ' 个单元格。', noteTone: 'ok',
        log: push(state, '确认 → 执行：' + state.preview.cells.length + ' 个单元格变化', 'ok')
      });
    }
    case 'CANCEL':
      return set(state, { stage: 'IDLE', draft: null, preview: null,
        note: '已取消，表格没有变化。', noteTone: 'info', log: push(state, '取消：表格未改动') });
    case 'SOLIDIFY': {
      if (state.stage !== 'EXECUTED' || !state.draft)
        return guard(state, '拦住了：还没执行过，不能把草稿固化成按钮。');
      const name = String(action.name || '').trim() || state.draft.name;
      const affected = state.preview ? state.preview.affectedRows : 0;
      const b = cloneButton({
        id: nextButtonId(state.buttons), name: name, kind: state.draft.kind,
        params: Object.assign({}, state.draft.params, action.params || {}),
        medium: state.draft.medium, steps: state.draft.steps.slice(),
        lastAffectedRows: affected, emptyRun: affected === 0
      });
      return set(state, { buttons: state.buttons.concat([b]), stage: 'SOLIDIFIED',
        note: '已命名参数化为按钮「' + name + '」' + (b.emptyRun ? '（空跑 / 上次影响 0 行）' : '') +
          '。', noteTone: 'ok', log: push(state, '固化为按钮：' + name, 'ok') });
    }
    case 'RENAME_BUTTON': {
      const id = action.id;
      if (!state.buttons.some(function (x) { return x.id === id; })) return guard(state, '按钮库里没有这个按钮，无法重命名。');
      const name = String(action.name || '').trim();
      if (!name) return guard(state, '按钮名不能为空。');
      return set(state, {
        buttons: state.buttons.map(function (x) { return x.id === id ? Object.assign({}, x, { name: name }) : x; }),
        note: '按钮已重命名为「' + name + '」。', noteTone: 'ok', log: push(state, '重命名按钮 → ' + name, 'ok')
      });
    }
    case 'SET_BUTTON_PARAMS': {
      const id = action.id;
      const target = state.buttons.filter(function (x) { return x.id === id; })[0];
      if (!target) return guard(state, '按钮库里没有这个按钮，无法改参数。');
      const merged = Object.assign({}, target.params, action.params || {});
      const rebuilt = buildDraft(target.kind, null, merged);
      // 票 #15 code-review（两轴共同 MEDIUM）：改参数也走封闭校验，
      // 不允许把非法/白名单外的参数写进 Host 权威源、还报成功；在变更边界就拦下。
      const check = validate(rebuilt, state);
      if (!check.ok) return guard(state, '按钮参数没通过封闭校验，未保存：' + check.errors.join('；'));
      return set(state, {
        buttons: state.buttons.map(function (x) {
          return x.id === id ? Object.assign({}, x, {
            params: merged, steps: rebuilt.steps, medium: rebuilt.medium
          }) : x;
        }),
        note: '按钮「' + target.name + '」的参数已更新（改参数重跑时仍会强制退回预览确认）。',
        noteTone: 'info', log: push(state, '改按钮参数：' + target.name)
      });
    }
    case 'DELETE_BUTTON': {
      const id = action.id;
      if (!state.buttons.some(function (x) { return x.id === id; })) return guard(state, '按钮库里没有这个按钮，无法删除。');
      return set(state, {
        buttons: state.buttons.filter(function (x) { return x.id !== id; }),
        note: '按钮已删除。', noteTone: 'info', log: push(state, '删除按钮：' + id)
      });
    }
    case 'RUN_BUTTON': {
      // 票 #16：统一入口——预置（registryButtons, p*）与固化（buttons, b*）两类按钮都能一键运行。
      // 先在固化按钮里找（__last__ 仍是最近固化那个），找不到再查预置按钮。
      const allButtons = (state.buttons || []).concat(state.registryButtons || []);
      const b = action.id === '__last__' ? state.buttons[state.buttons.length - 1]
        : allButtons.filter(function (x) { return x.id === action.id; })[0];
      if (!b) return guard(state, '按钮库里还没有这个按钮。');
      const overrides = action.params || {};
      // 规格 #8 用户故事 7/8：参数一处未改才真「一键」直接执行；
      // 改了 scope / 条件等任何参数，就强制退回「解释与影响预览 → 用户确认」，不许跳过。
      const changedParams = Object.keys(overrides).filter(function (k) {
        return String(b.params[k]) !== String(overrides[k]);
      });
      const draft = buildDraft(b.kind, null, Object.assign({}, b.params, overrides));
      const pv = preview(state, draft);
      if (pv.invalid) return guard(state, pv.summary);
      if (changedParams.length) {
        return set(state, {
          draft: draft, preview: pv, stage: 'PREVIEWED',
          note: '按钮「' + b.name + '」的参数被改过（' + changedParams.join('、') +
            '），不能直接一键执行：已退回解释与影响预览，请确认后再执行。', noteTone: 'warn',
          log: push(state, '按钮参数改动 → 退回预览确认：' + changedParams.join('、'), 'warn')
        });
      }
      const applied = applyCells(state, pv.cells, pv.sortOrder);
      // 票 #15 / 用户故事 18/32：重跑更新运行态标记（上次影响行数 / 空跑），不写回仓库。
      // 票 #16：预置按钮也在对应来源数组里更新标记（p* 在 registryButtons、b* 在 buttons）。
      const stamp = function (x) {
        return x.id === b.id ? Object.assign({}, x, {
          lastAffectedRows: pv.affectedRows, emptyRun: pv.affectedRows === 0
        }) : x;
      };
      const buttons = state.buttons.map(stamp);
      const registryButtons = (state.registryButtons || []).map(stamp);
      const emptyNote = pv.affectedRows === 0 ? '（空跑 / 影响 0 行）' : '';
      return set(state, { columns: applied.columns, rows: applied.rows, draft: draft, preview: pv,
        stage: 'EXECUTED', buttons: buttons, registryButtons: registryButtons,
        note: '一键运行「' + b.name + '」：参数未改，直接执行 ' + pv.cells.length + ' 格' + emptyNote + '。', noteTone: 'ok',
        log: push(state, '一键运行「' + b.name + '」（参数未改）→ ' + pv.cells.length + ' 格变化', 'ok') });
    }
    case 'START_WALK': {
      const fresh = initial({ primaryKey: state.primaryKey, columns: state.columns, rows: state.rows, sources: state.sources });
      return set(fresh, { walk: { id: action.id, step: 0 },
        note: '导览已重置到初始状态。', log: push(fresh, '开始导览：' + action.id) });
    }
    case 'WALK_STEP': {
      const next = reduce(state, action.action);
      return set(next, { walk: { id: state.walk ? state.walk.id : action.walkId, step: (action.step || 0) + 1 } });
    }
    default: return state;
  }
}

// 票 #15：Host 权威源的导出契约——返回按钮库声明式副本（无内部引用、无可执行代码）。
function exportButtons(state) {
  return (state.buttons || []).map(cloneButton);
}

module.exports = {
  SCHEMA_VERSION, KINDS, shorten, parseCondition, matches, columnLetter, toFormula, computeValue, extractOutputColumn, extractExpression,
  initial, understand, buildDraft, validate, preview, applyCells, reduce, exportButtons, nextButtonId,
  loadRegistry, hydrateRegistry,
  TYPE_ENUM, TYPE_MAP, UPLOAD_WHITELIST, DEFAULT_PRIMARY_KEY,
  validateManifest, checkUpload, validateRows, detectConflicts, createTable,
  COMMON_PARAMS, deriveIssues,
  ADAPTERS, ADAPTER_INTERFACE, KIND_CAPABILITY_DEPS, DEFAULT_ADAPTER, EVIDENCE_STATUS,
  adapterOf, isCapabilityUnlocked, capabilityBlockers: capabilityBlockersOf,
  CREDENTIAL_CONTRACTS, validateCredentials
};
