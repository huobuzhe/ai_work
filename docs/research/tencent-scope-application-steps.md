# 腾讯文档 stage 7：申请在线表格相关 scope 的一手可照做步骤

> **存放理由**：循 `docs/research/` 既有取证笔记习惯（首份 [spreadsheet-platform-capabilities.md](<docs/research/spreadsheet-platform-capabilities.md>)、以及同属「飞书/腾讯文档云端冒烟测试凭据向导」stage 4/5 的 [feishu-tenant-token-ip-whitelist.md](<docs/research/feishu-tenant-token-ip-whitelist.md>)），本篇为该向导 stage 7（腾讯文档申请在线表格相关 scope）补齐一手、陌生人可照做的具体步骤，与前述笔记并列存放，便于向导实现时直接引用而不必再查。

## 取证口径

- 只采一手来源：腾讯文档开放平台官方开发文档（`docs.qq.com/open/document/...`）、官方 API 参考页、官方文档页内嵌的官方控制台/授权页截图（图片 URL 亦给出）、以及官方开放平台入口 URL。凡 SPA 页正文取不到、控制台 UI 标签查不到、或各一手来源互相矛盾之处，一律写「未验证」并说明原因，**不补二手转述、不臆造点击路径**。
- 本文所有 `curl` 与授权链接中的 `<CLIENT_ID>` / `<CLIENT_SECRET>` / `<ACCESS_TOKEN>` / `<OPEN_ID>` / `<CODE>` / `<STATE>` / `<FILE_ID>` 均为占位符；**全文不含任何真实凭据**，官方文档示例里的示例 token 字符串一律不抄。
- 可达性实测：`docs.qq.com/open/document/app/*.html` 各页 HTTP 200 且正文全文可取；`https://docs.qq.com/open/developers/` 与 `https://docs.qq.com/open/` 是 SPA，只返回「腾讯文档开放生态」标题、正文取不到；`https://docs.qq.com/open/document/app/faq/` 返回 404；官方截图 CDN（`cdn.addon.tencentsuite.com` / `docimg6.docs.qq.com`）可下载并读到像素（后者需带 Referer，首次直连 403）。
- 背景事实（已见首份笔记，本轮复核一致）：新建在线表格 `POST /openapi/drive/v2/files`（`type=sheet`，需 `scope.drive.creatable`，https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）；写入用 V3 `POST /openapi/spreadsheet/v3/files/{fileId}/batchUpdate`（单次操作数 ≤5，需 `scope.sheet` 或 `scope.sheet.editable`，https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）；V2 在线表格接口已废弃（https://docs.qq.com/open/document/app/openapi/v2/sheet/ ）；自 2025-07-01 起每应用限免 20000 次 API（https://docs.qq.com/open/document/app/ ）。

## 一句话结论

「申请 API 权限 / scope」的**规则与审核门槛**有一手依据（官方 [应用权限](https://docs.qq.com/open/document/app/scope.html) 页正文 + 官方内嵌控制台截图），但 **scope 名称没有一份官方总表**：`scope.html` 正文一个 scope 名都不列，只有一张「用户授权」分类的截图；与「新建/编辑在线表格」相关的确切 scope 字符串散落在各接口页「权限说明」里且互相不一致；**控制台的精确 URL、应用详情页、权限管理页、审核耗时、API Explorer/调试台均未从一手取到**，这些必须标「未验证、以页面实际标签为准」。

---

## 1. 「申请 API 权限 / scope」的具体流程（问题 1）

### 1.1 从哪个页面进入、规则原文

- 官方原文：「调用腾讯文档开放接口时，可能会访问用户的隐私信息，也可能需要操作用户的文档数据。出于数据安全考虑，应用需要申请访问资源所需的权限，并经过开放平台的审核后，才能调用对应权限的开放接口。开发者可以在开放平台管理应用的权限列表。」（https://docs.qq.com/open/document/app/scope.html ）
- 进入路径（唯一从一手确认的控制台入口）：「登录[腾讯文档开放合作平台](https://docs.qq.com/open/developers/)，注册成为开发者。创建第三方应用且应用审核成功后，系统将自动分配 `Client ID` 和 `Client Secret`。」——这句在官方 [接入教程 §0](https://docs.qq.com/open/document/app/get_started.html) 与 [授权流程 §1 准备工作](https://docs.qq.com/open/document/app/oauth2/) 两处逐字出现，且都把 `https://docs.qq.com/open/developers/` 作为「腾讯文档开放合作平台」的链接目标。
- **注意区分**：`https://docs.qq.com/open/document/app/scope.html` 是**开发文档页**（标题「应用权限」，侧栏归在「开放接口概述」下），不是控制台里的权限管理页；它描述规则，不在其上勾选权限（https://docs.qq.com/open/document/app/scope.html ）。

### 1.2 scope 在控制台叫什么名字、粒度、是否逐个申请

以下 UI 标签来自官方 [应用权限](https://docs.qq.com/open/document/app/scope.html) 页**内嵌的官方控制台截图**（`https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670` ，2764×1268，本轮已下载读到像素）；这是官方图片证据，不是实时控制台页面正文，落地时仍须「以页面实际标签为准」：

- 页面标题「请配置应用权限」；左侧分类导航为「用户授权 / 文件管理 / 在线表格 / 在线智能表格 / 在线收集表」（「用户授权」为当前选中项）；表格列头为「权限名称 | 关联 API | 权限类型」；每行一个 `scope.*` 字符串、带勾选框、「关联 API」是一个链接、「权限类型」取值为「免审核」或「需审核」。（https://docs.qq.com/open/document/app/scope.html 、https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670 ）
- 表单字段：`* 授权目的：`（占位提示「审核通过后补齐到授权页文案中，请确保语句通顺，可参考下方预览，最多50个字符」、`预览：授权…获取你的腾讯文档权限，用于`）、`* 授权目的说明：`（占位提示「请详细说明使用以上 API 的场景，审核人员将根据最小够用原则进行审核，描述不清或无法论证使用该能力的必要性，将无法通过审核，最多1000个字符」）、底部「提交」按钮。（同上两张官方 URL）
- **粒度＝两层**：配置层是**按应用粒度**——「开发者可以在开放平台管理应用的权限列表」「管理员要根据最少必要原则，为第三方应用勾选需审核的权限」，即一个第三方应用一份权限列表、页面内逐行勾选、单个「提交」按钮（https://docs.qq.com/open/document/app/scope.html ）；校验层是**按接口粒度**——官方 V2/V3 介绍页原文「每个接口描述会标注 `Access Token` 需要的 `scope`，而 `scope` 则依赖第三方应用的所获得的 `scope` 和发起授权时指定的 `scope`」（https://docs.qq.com/open/document/app/openapi/v2/ 、https://docs.qq.com/open/document/app/openapi/v3/ ），且 Token 回包的 `scope` 字段为「`Access Token` 的权限范围，用 `,` 分隔」（https://docs.qq.com/open/document/app/oauth2/access_token.html ）。
- **是否要逐个申请：部分未验证**。官方正文只有「勾选需审核的权限」与「第三方应用将默认开通免审核权限」（即免审核类无需申请），**没有**「逐个申请」「按接口逐个提交」的措辞；截图显示的是多行勾选框 + 一个「提交」按钮，但「是否一次勾选多个需审核权限后统一提交、勾选后是否还需单独走一次审核」的交互细节只来自截图、正文未写明（https://docs.qq.com/open/document/app/scope.html ）。

### 1.3 哪些是「需审核」类、审核耗时

- 官方原文：「腾讯文档OPEN API将分为「免审核」与「需审核」两类，第三方应用将默认开通免审核权限，管理员要根据**最少必要原则**，为第三方应用勾选需审核的权限。」（https://docs.qq.com/open/document/app/scope.html 「注意」第 1 条）
- 官方原文：「根据国家法律规定，第三方应用在获取用户权限时，必须在授权页披露目的，请管理员描述授权目的，这部分内容将在授权页面展示，建议根据管理后台「授权目的」下方的「预览」优化文案，若展示在授权页的文案不通顺，将影响审核结果。」（同上「注意」第 2 条）
- 官方原文：「请在「授权目的说明」详细描述 OPEN API 的使用场景，审核人员将根据**最少必要原则**进行审核，若无法说明使用该能力的必要性，将影响审核结果。」（同上「注意」第 3 条）
- 官方原文：「若应用权限发生变动，应用需要让用户[重新授权](https://docs.qq.com/open/document/app/oauth2/authorize.html)以获取最新的权限范围的授权令牌，否则可能会影响接口的调用。」（同上「注意」第 4 条）
- **完整「需审核」scope 清单：未验证**。官方 `scope.html` 正文没有列名；官方截图只展示了「用户授权」分类下的两行（见 §2.2），其中仅 `scope.auth.account` 标为「需审核」、`scope.user.info.base` 标为「免审核」，**「在线表格」分类下的 scope 行截图未展示**，故 `scope.drive.creatable` / `scope.sheet` / `scope.sheet.editable` 属于免审核还是需审核，一手不可判定（https://docs.qq.com/open/document/app/scope.html 、https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670 ）。
- **审核耗时：未验证**。本轮取到全文的官方页（scope.html、get_started.html、oauth2/ 全套、openapi v2/v3 介绍页、频率控制页）均无审核时长/工作日说明；官方 FAQ 目录 `https://docs.qq.com/open/document/app/faq/` 返回 404，搜索引擎未命中任何官方审核时长页，故不填任何数字。

### 1.4 精确 URL（逐条注明：URL 是否从一手确认 / 页面正文是否取到）

| 页面 | 精确 URL | URL 是否从一手确认 | 页面正文是否取到 |
| --- | --- | --- | --- |
| 开发文档「应用权限」页（**文档页，非控制台**） | https://docs.qq.com/open/document/app/scope.html | 是：官方侧栏「应用权限说明」链接 + 直接 HTTP 200 | **是**：全文取到（含 4 条「注意」） |
| 腾讯文档开放合作平台（开发者/控制台入口） | https://docs.qq.com/open/developers/ | 是：官方 [接入教程 §0](https://docs.qq.com/open/document/app/get_started.html) 与 [授权流程 §1](https://docs.qq.com/open/document/app/oauth2/) 均以此 URL 链接 | **否**：SPA，仅返回「腾讯文档开放生态」 |
| 开放生态首页 | https://docs.qq.com/open/ | 是：HTTP 200 | **否**：SPA，仅返回「腾讯文档开放生态」 |
| 反馈入口（官方每页顶栏「我要反馈」，hash 路由，非权限管理页） | https://docs.qq.com/open/#/feedback | 是：官方各页顶栏链接 | **否**：SPA hash 路由 |
| **开发者后台精确 URL** | **未验证** | 否：官方文档只给「开放合作平台」入口，未给后台精确路径；`https://docs.qq.com/open/developers/` 正文取不到 | 否 |
| **应用详情页精确 URL** | **未验证** | 否：同上，官方只说「创建第三方应用且应用审核成功后系统自动分配 `Client ID`/`Client Secret`」，未给详情页 URL | 否 |
| **权限管理/配置页精确 URL** | **未验证** | 否：只有官方截图「请配置应用权限」（`https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670` ），截图中无地址栏、无 URL | 否（截图像素已取到） |
| 官方 API Explorer / 调试台 | **未验证**：见 §4 | 否 | 否 |

---

## 2. 官方 scope 参考页（`scope.html`）到底列了哪些 scope（问题 2）

### 2.1 结论：页面正文一个 scope 名都没列

- `https://docs.qq.com/open/document/app/scope.html` 的**正文**只有上述申请规则、1 张截图和 4 条「注意」，**没有任何 scope 名称与含义的文字清单**（本轮全文取到并逐行核对，https://docs.qq.com/open/document/app/scope.html ）。因此「官方 scope 参考页原文列出的 scope 名」在文字层面为空；唯一的 scope 名来自该页内嵌截图，且只覆盖「用户授权」分类。
- **未验证**：是否存在另一份官方「scope 总表/权限列表」页（本轮在官方侧栏「开放接口概述 / 用户授权 / 文件管理 / 在线表格 / 在线智能表 / 在线文档 / 在线收集表 / FAQ / 常见错误码」与顶栏「Open API / 小程序 / MCP / SaaS版 / 腾讯文档 SDK」中未检得；外部搜索未命中官方总表）。

### 2.2 官方页内嵌截图里逐条抄下来的 scope 名（「用户授权」分类，逐字）

| 权限名称 | 含义（截图副标题） | 关联 API（截图） | 权限类型（截图） | 勾选状态 |
| --- | --- | --- | --- | --- |
| `scope.user.info.base` | 获取用户昵称、头像基础信息 | 获取用户信息 | 免审核 | 已勾选 |
| `scope.auth.account` | 支持获取应用级账号 | 获取应用级账号Token | 需审核 | 未勾选 |

（来源：官方 [应用权限](https://docs.qq.com/open/document/app/scope.html) 页内嵌截图 https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670 。截图分类导航另有「文件管理 / 在线表格 / 在线智能表格 / 在线收集表」五个标签，但**仅「用户授权」被展开**，其余分类下的 scope 行未出现在截图中 → 未验证。）

### 2.3 与「新建在线表格 / 编辑在线表格内容」相关的确切 scope 字符串（来自各接口页「权限说明」，逐字）

| 动作 | 官方接口 | 官方「权限说明」原文 | 一手 URL |
| --- | --- | --- | --- |
| 新建在线表格 | `POST /openapi/drive/v2/files`（`type=sheet`） | 「本接口需要拥有以下任意一项权限：`scope.drive.creatable`」 | https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html |
| 编辑在线表格内容（V3，推荐） | `POST /openapi/spreadsheet/v3/files/{fileId}/batchUpdate` | 「本接口需要拥有以下任意一项权限：`scope.sheet` • `scope.sheet.editable`」 | https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html |
| 更新区域内容（V2，**已废弃**） | `PUT /openapi/sheetbook/v2/{bookID}/values/{range}` | 「本接口需要拥有以下任意一项权限：`scope.sheet`」 | https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html |

即向导 stage 7 要申请的目标是这两个接口对应的权限：`scope.drive.creatable`（建表）与 `scope.sheet` / `scope.sheet.editable`（编辑内容）。**但控制台「权限名称」列里它们显示成什么字符串，未验证**（截图没展示「在线表格」/「文件管理」分类），必须以页面实际标签为准。

### 2.4 官方 Token 回包/响应示例里出现的 scope 名（逐字抄，供核对，不是总表）

- 官方 [接入教程 §4](https://docs.qq.com/open/document/app/get_started.html) Token 回包 `scope` 字段逐字：
  `scope.attachment.queryable,scope.auth.direct,scope.doc.editable,scope.doc.readonly,scope.drive.form,scope.drive.group,scope.drive.presentation,scope.file.creatable,scope.file.deletable,scope.file.modifiable,scope.file.queryable,scope.folder.creatable,scope.folder.deletable,scope.folder.modifiable,scope.folder.queryable,scope.sheet.editable,scope.sheet.readonly,scope.smartsheet.editable,scope.smartsheet.readonly,scope.user.info,scope.user.login`
- 官方 [获取 Access Token](https://docs.qq.com/open/document/app/oauth2/access_token.html) 响应示例逐字：`"scope": "scope.file.editable,scope.folder.creatable"`。

### 2.5 一手来源之间互相矛盾，不得合并（重要）

- `scope.drive.creatable`（建表页 https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）**不在** §2.4 的 Token 回包清单里；回包里是 `scope.file.creatable` / `scope.drive.form` / `scope.drive.group` / `scope.drive.presentation`（https://docs.qq.com/open/document/app/get_started.html ）。
- `scope.sheet`（V2/V3 接口页 https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html ）**不在**回包里；回包里是 `scope.sheet.editable` / `scope.sheet.readonly`（https://docs.qq.com/open/document/app/get_started.html ）。
- `scope.file.editable`（响应示例 https://docs.qq.com/open/document/app/oauth2/access_token.html ）既不在回包里、也不在任何接口「权限说明」里。
- 截图里的 `scope.user.info.base` / `scope.auth.account`（https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670 ）与回包里的 `scope.user.info` / `scope.user.login` / `scope.auth.direct` 又是另一套命名。
- **结论**：官方各页对 scope 命名不一致，且 `scope.html` 正文无总表（与首份笔记 §2.1 的「未验证」一致，https://docs.qq.com/open/document/app/scope.html ）。向导**不得**把某个字符串硬编码成「控制台里应该出现的那个 scope 名」，只能给出上述候选并让用户按页面实际标签核对。

---

## 3. OAuth2 授权链接里 `scope` 参数的官方取值、`state`、授权页披露（问题 3）

### 3.1 是不是固定 `scope=all`？有没有按 scope 分别授权？

- **是，官方 [发起授权](https://docs.qq.com/open/document/app/oauth2/authorize.html) 参数表逐字**：`scope | string | 是 | 固定为 all`；同页请求示例逐字 `GET https://docs.qq.com/oauth/v2/authorize?client_id=CLIENT_ID&redirect_uri=https%3a%2f%2fexample.com%2fcallback&new_login=1&response_type=code&scope=all&state=STATE`。官方 [接入教程 §1](https://docs.qq.com/open/document/app/get_started.html) 示例同为 `scope=all`（`https://docs.qq.com/oauth/v2/authorize?client_id=docs_qq_com&redirect_uri=https://docs.qq.com&new_login=1&response_type=code&scope=all&state=123`）。
- **「按 scope 分别授权」的写法：未验证 / 官方参数表未给出**。官方「发起授权」页 `scope` 只写「固定为 all」，没有列出其他取值、没有按单个 scope 授权的写法（https://docs.qq.com/open/document/app/oauth2/authorize.html ）。但 V2/V3 介绍页有「`scope` 则依赖第三方应用的所获得的 `scope` 和**发起授权时指定的 `scope`**」的措辞（https://docs.qq.com/open/document/app/openapi/v2/ 、https://docs.qq.com/open/document/app/openapi/v3/ ），与「固定为 all」口径不完全一致；按取证口径不擅自推断，以「发起授权」参数表为准，其余标未验证。
- 注意：`scope=all` 是**授权请求参数**，不等于 Token 一定拿到全部权限——官方「获取 Access Token」响应体把 `scope` 定义为「`Access Token` 的权限范围，用 `,` 分隔」（https://docs.qq.com/open/document/app/oauth2/access_token.html ），即实际授予范围取决于应用已获权限（见 §1.2 的 V2/V3 介绍页原文）。
- 附带修正：首份笔记里的简写授权链接省略了官方参数表标为**必选**的 `redirect_uri` 与 `new_login`。官方参数表逐字：`client_id`（是）、`redirect_uri`（是，「需要 `URL Encode`，后台会校验域名是否在白名单中」）、`new_login`（是，「固定填写 `1`」）、`response_type`（是，「固定填写 `code`」）、`scope`（是，「固定为 `all`」）、`state`（否）（https://docs.qq.com/open/document/app/oauth2/authorize.html ）；且「授权回调地址 `redirect_uri` 仅支持 `HTTPS` 协议」（同上）；新版授权登录组件要求容器宽 ≥480px、高 ≥610px（https://docs.qq.com/open/document/app/oauth2/authorize.html 、https://docs.qq.com/open/document/app/get_started.html ）。

### 3.2 `state` 参数的要求

- 官方 [发起授权](https://docs.qq.com/open/document/app/oauth2/authorize.html) 参数表逐字：`state | string | 否 | 授权成功后原样带回给第三方，该参数用于防 CSRF 攻击，建议带上`；响应体逐字：`state | string | 如果请求时传递参数，会回传该参数`；响应示例 `http://example.com/callback?code=CODE&state=STATE`；错误响应示例亦带 `&state=STATE`。官方 [接入教程 §1/§3](https://docs.qq.com/open/document/app/get_started.html) 用 `state=123`，回调示例 `curl 'https://docs.qq.com/?code=...&state=123&u=...'`。
- 即：`state` 可选但**建议带上**用于防 CSRF，且会原样回传，向导应生成随机值并校验回调里的 `state` 与发出的一致。（https://docs.qq.com/open/document/app/oauth2/authorize.html ）

### 3.3 授权页会披露哪些权限、用户如何确认

- 官方 [应用权限](https://docs.qq.com/open/document/app/scope.html) 「注意」第 2 条：授权页会展示管理员填写的**「授权目的」**文案（「这部分内容将在授权页面展示，建议根据管理后台「授权目的」下方的「预览」优化文案，若展示在授权页的文案不通顺，将影响审核结果」）。
- 官方 [接入教程 §2](https://docs.qq.com/open/document/app/get_started.html) 逐字：「首次登录授权需同意腾讯文档的服务协议和隐私政策。」「用户可快速、扫码登录授权。」「登录授权后，勾选并同意。」官方 [授权流程 §2](https://docs.qq.com/open/document/app/oauth2/) 第 2 步为「用户手动点击同意授权」。
- 官方 [发起授权](https://docs.qq.com/open/document/app/oauth2/authorize.html) 接口说明逐字：「不同的端发起授权，用户看到的页面是会有区别。浏览器中发起授权，用户看到的是扫码页；微信内发起授权，用户会直接进入授权确认页面。」「用户授权成功后，会重定向到授权回调地址，并且带上 `code` 和 `state` 参数。」
- 官方授权页截图（[接入教程 §2](https://docs.qq.com/open/document/app/get_started.html) 内嵌，https://docimg6.docs.qq.com/image/pLGK15ANITmNw76F4LevcQ.png?w=1058&h=1488 ，本轮带 Referer 下载读到像素）逐字可见：「授权腾讯文档测试使用你的腾讯文档权限」、登录账号「微信帐号」、「同意即授权腾讯文档测试获得腾讯文档相关权限　查看全部」、勾选项「我已阅读并同意腾讯文档的《服务协议》和《隐私政策》」、按钮「同意」（未勾选时置灰）。
- **未验证**：授权页「查看全部」展开后是否逐条列出具体 `scope.*` 名称、以及「需审核」类 scope 在授权页如何标注——官方截图只显示一句汇总文案与「查看全部」链接，正文未列逐条权限清单（https://docs.qq.com/open/document/app/get_started.html 、https://docimg6.docs.qq.com/image/pLGK15ANITmNw76F4LevcQ.png?w=1058&h=1488 ）。
- 另：用户可主动关闭授权，官方 [用户取消授权](https://docs.qq.com/open/document/app/oauth2/user_cancal_auth.html) 逐字「用户可以主动关闭第三方应用的授权……需要重新进行授权流程」（错误码 37029）。

---

## 4. 官方 API Explorer / 调试台，以及 Client ID/Secret 在哪里看（问题 4）

- **官方 API Explorer / 调试台：未验证**。本轮取到全文的官方各页导航一致为「开放接口概述 / 用户授权 / 文件管理 / 在线表格 / 在线智能表 / 在线文档 / 在线收集表 / FAQ / 常见错误码」，顶栏为「Open API / 小程序 / MCP / 腾讯文档SaaS版(限免) / 腾讯文档 SDK / 我要反馈」（例：https://docs.qq.com/open/document/app/ 、https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/oauth2/authorize.html ），**未出现「API Explorer」「调试台」「在线调试」条目**；唯一带 hash 路由的是「我要反馈」`https://docs.qq.com/open/#/feedback`（非调试台）；外部搜索与 GitHub 仓库检索均未命中腾讯文档官方 OpenAPI 调试台的一手 URL。故不给任何调试台 URL，也不断言「一定没有」。
- **「权限申请成功后在哪里看到 Client ID/Secret」：部分可答、精确位置未验证**。
  - 一手可答：官方 [接入教程 §0](https://docs.qq.com/open/document/app/get_started.html) 与 [授权流程 §1 准备工作](https://docs.qq.com/open/document/app/oauth2/) 逐字「创建第三方应用且应用审核成功后，系统将自动分配 `Client ID` 和 `Client Secret`」；`Client ID` =「第三方应用的唯一标识，在 `OAuth2.0` 授权和后续 `OpenAPI` 调用流程中需要作为请求参数」，`Client Secret` =「`Client ID` 对应的密钥，在后台服务间接口调用时用来验证应用的合法性」，并注明「如发生泄露请及时登录开放平台修改」（https://docs.qq.com/open/document/app/oauth2/ ）；换取 Token 的请求「需要由第三方服务发起」、所有 Open API 请求「需由后台服务发起」（https://docs.qq.com/open/document/app/oauth2/access_token.html 、https://docs.qq.com/open/document/app/oauth2/ ）。
  - **未验证**：具体在控制台哪个页面/菜单查看或复制这两个值（官方文档未给「应用详情页/凭证页」精确 URL；`https://docs.qq.com/open/developers/` 是 SPA、正文取不到）——**不要**编造「应用详情 → 凭证信息」之类的点击路径。
- 「请求头三元组」的一手依据（供向导填变量）：`Access-Token`、`Client-Id`、`Open-Id` 都必须放请求头（https://docs.qq.com/open/document/app/openapi/v3/ 、https://docs.qq.com/open/document/app/openapi/v2/ ）；官方 [接入教程 §5](https://docs.qq.com/open/document/app/get_started.html) 明确 `Access-Token` = Token 回包 `access_token`、`Open-Id` = 回包 `user_id`、`Client-Id` =「注册成为开发者后申请应用获得」。

---

## 未验证汇总

| 项 | 原因 |
| --- | --- |
| 开发者后台 / 应用详情页 / 权限管理页的精确 URL | 官方只给 `https://docs.qq.com/open/developers/` 入口，正文 SPA 取不到；截图无地址栏 |
| 控制台 UI 标签（除官方截图所示外）、点击路径 | 仅 `scope.html` 内嵌官方截图可见，实时控制台页面正文未取到 |
| 完整「需审核」scope 清单；`scope.drive.creatable`/`scope.sheet`/`scope.sheet.editable` 属免审核还是需审核 | `scope.html` 正文无清单，截图只展开「用户授权」分类 |
| 审核耗时 / 工作日 | 所有取到全文的官方页无说明；FAQ 目录 404；搜索未命中官方页 |
| 官方 scope 名称总表 | `scope.html` 正文一个 scope 名都不列；各接口页/回包命名互相矛盾（§2.5） |
| 「按 scope 分别授权」的写法 / `scope` 除 `all` 外的取值 | 「发起授权」参数表只写「固定为 all」；V2/V3 介绍页措辞与之不完全一致 |
| 授权页「查看全部」展开后的逐条权限清单 | 官方截图只有汇总文案 + 「查看全部」链接 |
| 官方 API Explorer / 调试台 URL | 官方导航与正文、外部搜索均未检得 |
| Client ID / Client Secret 在控制台的查看页面与菜单 | 官方只说「审核成功后系统自动分配」，未给凭证页 URL |
| 换取 token 的 `code` 有效期 | 官方内部矛盾：[接入教程](https://docs.qq.com/open/document/app/get_started.html) / [授权流程](https://docs.qq.com/open/document/app/oauth2/) 写 5 分钟，[发起授权](https://docs.qq.com/open/document/app/oauth2/authorize.html) / [获取 Access Token](https://docs.qq.com/open/document/app/oauth2/access_token.html) 写 10 分钟 |

---

## stage 7 建议步骤（可直接抄进向导）

> 说明：`【一手】`＝该动作/取值有紧跟的一手 URL；`【未验证·以页面实际标签为准】`＝控制台 UI 或精确路径未从一手取到，只能给导航式指令，不得写死标签或路径。全文只用占位符，不写任何真实凭据。变量命名沿用向导现有约定（`TENCENT_CLIENT_ID` / `TENCENT_CLIENT_SECRET` / `TENCENT_ACCESS_TOKEN` / `TENCENT_OPEN_ID` / `TENCENT_FILE_ID`），若向导里名字不同请按实际变量名替换。

1. **打开开发者入口**：浏览器打开 `https://docs.qq.com/open/developers/`（腾讯文档开放合作平台），登录并「注册成为开发者」。【一手】https://docs.qq.com/open/developers/ 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/ 。**【未验证·以页面实际标签为准】** 该页是 SPA，本环境正文取不到，「注册开发者」的具体按钮/菜单位置以页面实际标签为准。
2. **创建第三方应用并等审核**：在该平台创建一个「第三方应用」，等待「应用审核成功」；官方原文是审核成功后「系统将自动分配 `Client ID` 和 `Client Secret`」。【一手】https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/ 。**【未验证·以页面实际标签为准】** 「创建应用」的入口菜单、应用审核耗时（官方无说明）均未知，不要写「N 个工作日」或写死点击路径。
3. **复制两个值**：把 `Client ID` 复制填入 `TENCENT_CLIENT_ID`，把 `Client Secret` 复制填入 `TENCENT_CLIENT_SECRET`（`Client Secret` 只可放在后台服务，不要写进前端或提交到仓库）。【一手：字段含义与后台调用要求】https://docs.qq.com/open/document/app/oauth2/ 、https://docs.qq.com/open/document/app/oauth2/access_token.html 。**【未验证·以页面实际标签为准】** 这两个值显示在控制台哪个页面/菜单，官方未给精确 URL。
4. **进入应用权限配置**：打开该应用的权限配置页——官方开发文档称「应用权限」、官方截图标题为「请配置应用权限」，左侧分类含「在线表格」标签。【一手：文档页与截图】https://docs.qq.com/open/document/app/scope.html 、https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670 。**【未验证·以页面实际标签为准】** 权限管理页的精确 URL 未从一手取到，只能写「进入目标应用 → 按页面实际标签找到权限/应用权限配置」。
5. **定位要申请的 scope**：在「在线表格」（以及涉及建表的「文件管理」）分类下，按「权限名称」列核对下列候选字符串——建表接口 `POST /openapi/drive/v2/files`（`type=sheet`）需 `scope.drive.creatable`【一手】https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ；写入接口 `POST /openapi/spreadsheet/v3/files/{fileId}/batchUpdate` 需 `scope.sheet` 或 `scope.sheet.editable`【一手】https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 。**【未验证·以页面实际标签为准】** 官方各页 scope 命名互相矛盾且无总表（§2.5），控制台里实际显示成什么字符串未验证，**不要**硬编码「必须看到 `scope.drive.creatable`」；让用户以页面实际标签及「关联 API」列（是否指向新建文档/在线表格批量更新）为准。
6. **判断并处理「需审核」类**：若某行「权限类型」列显示「需审核」，勾选它——官方规则是「腾讯文档 OPEN API 将分为「免审核」与「需审核」两类，第三方应用将默认开通免审核权限，管理员要根据最少必要原则，为第三方应用勾选需审核的权限」。【一手】https://docs.qq.com/open/document/app/scope.html 。**【未验证·以页面实际标签为准】** 完整的需审核清单、以及第 5 步那几个 scope 是否属于需审核类，官方未给出，只能让用户看该行的「权限类型」列。
7. **填审核材料并提交**：填写 `* 授权目的：`（≤50 字符，官方提示「审核通过后补齐到授权页文案中……可参考下方预览」，务必用「预览」检查通顺度）与 `* 授权目的说明：`（≤1000 字符，详述 OPEN API 使用场景，审核人员按「最少必要/最小够用」原则审核），点「提交」。【一手】https://docs.qq.com/open/document/app/scope.html （4 条「注意」）、https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670 。**【未验证·以页面实际标签为准】** 是否需逐个权限分别提交、提交后是否还有二次确认，官方正文未写明（仅截图可见逐行勾选 + 单个「提交」按钮）。
8. **等审核结果**：等开放平台审核通过。**【未验证·以页面实际标签为准】** 审核耗时官方无任何说明，向导不要给时限数字；也不要谎称「提交即生效」。
9. **权限变动后发起重授权**：官方原文「若应用权限发生变动，应用需要让用户重新授权以获取最新的权限范围的授权令牌，否则可能会影响接口的调用」。【一手】https://docs.qq.com/open/document/app/scope.html 。拼接授权链接（**必选参数按官方参数表补齐**）：
   `https://docs.qq.com/oauth/v2/authorize?client_id=<TENCENT_CLIENT_ID>&redirect_uri=<URL 编码后的 HTTPS 回调地址>&new_login=1&response_type=code&scope=all&state=<随机 STATE>`
   其中 `scope` **固定 `all`**、`new_login` 固定 `1`、`response_type` 固定 `code`、`redirect_uri` 需 URL Encode 且仅 HTTPS 并域名在白名单中、`state` 建议带随机值防 CSRF。【一手】https://docs.qq.com/open/document/app/oauth2/authorize.html 、https://docs.qq.com/open/document/app/get_started.html 。**【未验证】** 官方没有「按单个 scope 分别授权」的写法，不要让用户把 `scope` 改成某个 `scope.*`。
10. **用户在授权页确认**：浏览器打开看到扫码页、微信内直接看到授权确认页面；页面展示应用名与「同意即授权…获得腾讯文档相关权限　查看全部」；用户勾选「我已阅读并同意腾讯文档的《服务协议》和《隐私政策》」后点「同意」。【一手】https://docs.qq.com/open/document/app/oauth2/authorize.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/ 、https://docimg6.docs.qq.com/image/pLGK15ANITmNw76F4LevcQ.png?w=1058&h=1488 。**【未验证】** 授权页「查看全部」里的逐条 scope 清单未从一手取到。
11. **回调取 code 换 Token**：从回调 URL 解析 `code`（并校验 `state` 与第 9 步一致），由**后台服务**发起
   `GET https://docs.qq.com/oauth/v2/token?client_id=<TENCENT_CLIENT_ID>&client_secret=<TENCENT_CLIENT_SECRET>&redirect_uri=<与第 9 步一致的 URL 编码回调>&grant_type=authorization_code&code=<CODE>`；
   回包取 `access_token` → 填 `TENCENT_ACCESS_TOKEN`（请求头 `Access-Token`），`user_id` → 填 `TENCENT_OPEN_ID`（请求头 `Open-Id`），请求头 `Client-Id` = `TENCENT_CLIENT_ID`，并核对回包 `scope`（逗号分隔）是否覆盖第 5 步需要的范围。【一手】https://docs.qq.com/open/document/app/oauth2/access_token.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/openapi/v3/ 。**【未验证】** `code` 有效期官方内部矛盾（5 分钟 vs 10 分钟），向导应提示「尽快换取」而不硬编码秒数。
12. **冒烟验证**：由后台服务 `POST /openapi/drive/v2/files`，表单 `type=sheet&title=<标题>`，头带 `Access-Token`/`Client-Id`/`Open-Id`，从回包 `data.ID` 取 `fileId` 填 `TENCENT_FILE_ID`；再 `POST /openapi/spreadsheet/v3/files/<TENCENT_FILE_ID>/batchUpdate`，`requests` 单次 ≤5 个操作。【一手】https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 。提醒：自 2025-07-01 起每应用限免 20000 次 API（https://docs.qq.com/open/document/app/ ），冒烟调用计入该额度。

---

## 对决策的影响

1. **能写成可照做具体指令的部分**：开发者入口 `https://docs.qq.com/open/developers/`、应用审核成功后自动分配 `Client ID`/`Client Secret`、授权链接 `https://docs.qq.com/oauth/v2/authorize`（`scope` 固定 `all`、`new_login=1`、`response_type=code`、`redirect_uri` 仅 HTTPS 且 URL Encode、`state` 建议带随机值防 CSRF）、`https://docs.qq.com/oauth/v2/token` 换 Token 及 `Access-Token`/`Client-Id`/`Open-Id` 三元组对应关系、权限变动后必须重新授权、授权目的/授权目的说明的填写与字数限制、以及最终两个冒烟接口与所需 scope 字符串——全部有一手 URL，可直接落成 stage 7 的确定句（https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/authorize.html 、https://docs.qq.com/open/document/app/oauth2/access_token.html 、https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）。
2. **必须标「未验证、以页面实际标签为准」的部分**：开发者后台/应用详情页/权限管理页的精确 URL、控制台「进入→勾选→提交」的点击路径、Client ID/Secret 的查看菜单位置、审核耗时、完整「需审核」scope 清单——这些官方文档只给规则与一张截图，`https://docs.qq.com/open/developers/` 又是 SPA 正文取不到；向导只能写导航式指令（「进入目标应用 → 按页面实际标签找到权限配置」），不能写死 URL、标签或时限（https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/developers/ 、https://cdn.addon.tencentsuite.com/static/%E5%BA%94%E7%94%A8%E6%9D%83%E9%99%90.png?w=1556&h=1670 ）。
3. **stage 7 不能硬编码「应该看到哪个 scope 名」**：`scope.html` 正文无总表，且 `scope.drive.creatable`（建表页）、`scope.sheet`/`scope.sheet.editable`（V3 页）、Token 回包的 `scope.file.creatable`/`scope.sheet.editable`、响应示例的 `scope.file.editable`、截图里的 `scope.user.info.base` 互相不一致（§2.5）；向导应把候选字符串列出来让用户按控制台「权限名称」与「关联 API」列核对，而不是断言唯一正确名（https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/access_token.html 、https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）。
4. **scope 申请与 OAuth 授权是两件事，别合并成一步**：控制台里按应用粒度勾选权限（含需审核类走审核）决定「应用能获得哪些 scope」；授权链接里 `scope=all` 只是发起授权的固定参数，Token 实际拿到的 `scope` 来自应用已获权限（回包逗号分隔）。因此 stage 7 的验收应是「后台勾选/审核通过 → 重新授权 → 回包 `scope` 含所需范围 → 冒烟接口 200」，而不是「URL 里填了某个 scope 就生效」（https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/oauth2/authorize.html 、https://docs.qq.com/open/document/app/oauth2/access_token.html 、https://docs.qq.com/open/document/app/openapi/v2/ 、https://docs.qq.com/open/document/app/openapi/v3/ ）。另外官方 API Explorer/调试台 URL 未检得（未验证），向导不要给出调试台链接，也不要承诺不存在的点击路径。
