# 飞书 tenant_access_token_internal 与 IP 白名单：凭据向导 stage 4/5 一手取证

> **存放理由**：为「飞书/腾讯文档云端冒烟测试凭据向导」的 stage 4（用 app_id/app_secret 换 tenant_access_token）与 stage 5（配 IP 白名单）补齐可照做的一手操作事实，与 `docs/research/` 既有取证笔记同处，便于向导实现时直接引用而不必再查。

## 取证口径

- 只采一手来源：飞书开放平台官方文档页（`open.feishu.cn` / `open.larksuite.com`）、官方 API 参考、官方 SDK 源码（`github.com/larksuite/oapi-sdk-go`、`github.com/larksuite/oapi-sdk-python`）、GitHub 上飞书官方 org（`larksuite`）的仓库。
- 网络层事实另用 RFC Editor、Microsoft Learn 的一手标准/厂商文档，**仅**用于解释「本机内网 IPv4 ≠ 公网出口 IP」，不用于断言飞书的白名单规则。
- `open.feishu.cn` / `open.larksuite.com` 的文档页与开发者控制台页都是 SPA：抓取只返回 HTTP 200 加 `<title>`，正文取不到。因此凡只存在于这些页面里的字段说明、错误码表、页面标签、控制台精确路径，一律标「未验证」，不补二手转述（例：https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/set-ip-allowlist 只返回标题「设置 IP 白名单 - 服务端 API - 飞书开放平台」）。
- 搜索结果里的镜像站、第三方文档仓库、博客一律不采，也不在本文转述其内容。
- 全文不含任何真实凭据；curl 中的 `<APP_ID>` / `<APP_SECRET>` 是占位符。

---

## 1. 自建应用获取 tenant_access_token（tenant_access_token_internal）

### HTTP 方法与完整 URL

- 方法 `POST`：官方 Go SDK `service/auth/v3/resource.go` 中 `apiReq.HttpMethod = http.MethodPost`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/resource.go 。官方 Python SDK `internal_tenant_access_token_request.py` 中 `http_method = HttpMethod.POST`；https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/auth/v3/model/internal_tenant_access_token_request.py 。
- 路径 `/open-apis/auth/v3/tenant_access_token/internal`：Go SDK `resource.go` 的 `apiReq.ApiPath = "/open-apis/auth/v3/tenant_access_token/internal"`，且 `core/constants.go` 常量逐字 `TenantAccessTokenInternalUrlPath string = "/open-apis/auth/v3/tenant_access_token/internal"`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/resource.go 、https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/constants.go 。Python SDK 同路径 `uri = "/open-apis/auth/v3/tenant_access_token/internal"`；https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/auth/v3/model/internal_tenant_access_token_request.py 。
- 域名 `https://open.feishu.cn`（国际版 `https://open.larksuite.com`）：官方 Python SDK `core/const.py` 逐字 `FEISHU_DOMAIN = "https://open.feishu.cn"`、`LARK_DOMAIN = "https://open.larksuite.com"`；https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/core/const.py 。Go SDK `core/reqtranslator.go` 中 `newPath = fmt.Sprintf("%s%s", config.BaseUrl, newPath)`，即完整 URL = BaseUrl + ApiPath（BaseUrl 字段见 `core/config.go`）；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/reqtranslator.go 、https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/config.go 。
- **完整 URL**：`https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal`（国际版把域名换成 `https://open.larksuite.com`）。依据同上四条一手 URL。
- 对应官方文档页 URL 与主题已从一手确认：HTTP 200，标题「自建应用获取 tenant_access_token - 服务端 API - 飞书开放平台」，英文标题「Get custom app tenant_access_token - Server API - Feishu Open Platform」；https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal 、https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal?lang=en-US 。但该页正文取不到，页内字段表/错误码表标「未验证」。
- 不需要 `Authorization` 头：Go SDK `resource.go` 中 `apiReq.SupportedAccessTokenTypes = []larkcore.AccessTokenType{}`，Python SDK `token_types = {}`；`core/tokenmanager.go` 实际发请求时 `SupportedAccessTokenTypes: []larkcore.AccessTokenType{larkcore.AccessTokenTypeNone}`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/resource.go 、https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/auth/v3/model/internal_tenant_access_token_request.py 、https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 。

### 请求头

- `Content-Type: application/json; charset=utf-8`：Go SDK `core/constants.go` 逐字 `const contentTypeJson = "application/json"`、`const defaultContentType = contentTypeJson + "; charset=utf-8"`、`const contentTypeHeader = "Content-Type"`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/constants.go 。`core/reqtranslator.go` 的 `payload()` 用 `contentType := defaultContentType`，并在 `newHTTPRequest()` 里 `httpRequest.Header.Set(contentTypeHeader, contentType)`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/reqtranslator.go 。
- Python SDK `core/const.py` 逐字 `CONTENT_TYPE = "Content-Type"`、`APPLICATION_JSON = "application/json"`；https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/core/const.py 。
- 「只写 `Content-Type: application/json`（不带 charset）是否被接受」：**未验证**（官方 SDK 原值带 `; charset=utf-8`，未单独取证），curl 按 SDK 原值给出。

### 请求体 JSON 字段与含义

- 两个字段 `app_id`、`app_secret`（字符串）：Python SDK `internal_tenant_access_token_request_body.py` 中 `_types = {"app_id": str, "app_secret": str}`，builder 方法 `app_id()`、`app_secret()`；https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/auth/v3/model/internal_tenant_access_token_request_body.py 。Go SDK `core/tokenmanager.go` 中 `type SelfBuiltAppAccessTokenReq struct { AppID string \`json:"app_id"\`; AppSecret string \`json:"app_secret"\` }`，且该结构正是 `getCustomTenantAccessTokenThenCache()` 发往本接口的 body；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 。
- 含义（Go SDK 生成模型注释逐字）：`AppId *string \`json:"app_id,omitempty"\` // 应用唯一标识，创建应用后获得。有关\`app_id\` 的详细介绍。请参考[通用参数](https://open.feishu.cn/document/ukTMukTMukTM/uYTM5UjL2ETO14iNxkTN/terminology)介绍`；`AppSecret *string \`json:"app_secret,omitempty"\` // 应用秘钥，创建应用后获得。`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/model.go 。该文件中的示例值是 SDK 注释里的占位/示例字符串，不是真实凭据；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/model.go 。

### 成功回包字段

- 顶层 `code`、`msg`、`tenant_access_token`、`expire`：Go SDK `core/tokenmanager.go` 逐字 `type TenantAccessTokenResp struct { *ApiResp \`json:"-"\`; CodeError; Expire int \`json:"expire"\`; TenantAccessToken string \`json:"tenant_access_token"\` }`，且 `getCustomTenantAccessTokenThenCache()` 直接 `json.Unmarshal(rawResp.RawBody, tenantAccessTokenResp)`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 。`CodeError` 定义在 `core/apiresp.go`：`Code int \`json:"code"\``、`Msg string \`json:"msg"\``，另有可选 `error` 对象（含 `log_id`、`troubleshooter`、`details`、`permission_violations`、`field_violations`、`helps`）；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/apiresp.go 。
- `code == 0` 为成功：Go SDK `core/tokenmanager.go` 逐字 `func (t *TenantAccessTokenResp) Success() bool { return t.Code == 0 }`，并且 `if tenantAccessTokenResp.Code != 0 { ... return "", tenantAccessTokenResp.CodeError }`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 。`CodeError.String()` 输出形态为 `msg:<Msg>,code:<Code>`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/apiresp.go 。
- `tenant_access_token` = 「租户访问凭证。」，`expire` = 「`tenant_access_token` 的过期时间，单位为秒。」（Go SDK `service/auth/v3/model.go` 的 `InternalTenantAccessTokenRespData` 注释逐字）；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/model.go 。SDK 缓存 TTL 用 `expire` 减去 `expiryDelta = 3 * time.Minute`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/constants.go 、https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 。
- 有效期（Go SDK `resource.go` 注释逐字）：「tenant_access_token 的最大有效期是 2 小时。如果在有效期小于 30 分钟的情况下，调用本接口，会返回一个新的 tenant_access_token，这会同时存在两个有效的 tenant_access_token。」；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/resource.go 。
- **一手来源内部存在层级分歧，须留意**：`core/tokenmanager.go`（SDK 自动取 token 的实际运行路径）把 `tenant_access_token` / `expire` 解析为**顶层**；而生成模型 `service/auth/v3/model.go` 的 `InternalTenantAccessTokenResp` 把它们放在 `Data *InternalTenantAccessTokenRespData \`json:"data"\`` 下，Python SDK `internal_tenant_access_token_response.py` 同样是 `{"data": InternalTenantAccessTokenResponseBody}`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 、https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/model.go 、https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/auth/v3/model/internal_tenant_access_token_response.py 。curl 示例按 SDK 运行路径（顶层）解析；HTTP 原始回包是否另有 `data` 包裹，官方页正文未取到 → **未验证**，向导解析时建议同时兼容顶层与 `data` 两种形态。

### 常见错误码含义

- 已一手确认的机制：`code != 0` 即失败，`msg` 是报错文案，SDK 用 `resp.CodeError` 作为错误返回；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 、https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/apiresp.go 。
- SDK 常量 `10012`（app_ticket invalid）、`99991663`（tenant_access_token invalid）、`99991664`（app_access_token invalid）、`99991671`（access token invalid）是 SDK 判定「已有 token 失效需刷新」用的，**不是本接口的专属错误码表**；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/constants.go 。
- 本接口「常见错误码含义」表、以及「IP 不在白名单」的错误码与报错文案：**未验证**。原因是官方「自建应用获取 tenant_access_token」文档页与「通用错误码」页都是 SPA，抓取只回标题，正文（错误码表）取不到；https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal 、https://open.feishu.cn/document/ukTMukTMukTM/ugjM14COyUjL4ITN 。

### 可直接复制运行的 curl（占位符，无真实凭据）

```bash
curl -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json; charset=utf-8' \
  -d '{"app_id":"<APP_ID>","app_secret":"<APP_SECRET>"}'
```

- 逐段依据：POST/路径 → https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/resource.go ；域名 → https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/core/const.py ；`Content-Type` → https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/constants.go 与 https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/reqtranslator.go ；body 字段 → https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 与 https://raw.githubusercontent.com/larksuite/oapi-sdk-python/v2_main/lark_oapi/api/auth/v3/model/internal_tenant_access_token_request_body.py ；不带 `Authorization` → https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/resource.go 。
- 期望成功回包形态（顶层，依据 `core/tokenmanager.go`）：`{"code":0,"msg":"<成功说明>","tenant_access_token":"<令牌>","expire":<秒数>}`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 。`msg` 的具体取值、`expire` 的具体数值：**未验证**（官方页正文取不到），不要硬编码。

---

## 2. IP 白名单约束的是哪个 IP

- 官方「设置 IP 白名单」文档页 URL 一手确认：HTTP 200，标题「设置 IP 白名单 - 服务端 API - 飞书开放平台」，英文标题「Set IP allowlist - Server API - Feishu Open Platform」；https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/set-ip-allowlist?lang=zh-CN 、https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/set-ip-allowlist?lang=en-US 。官方「网关变更 - 开放平台IP白名单」FAQ 页 URL 一手确认，标题「网关变更 - 开放平台IP白名单 - 开发指南 - 飞书开放平台」；https://open.feishu.cn/document/faq/breaking-change/gateway-change-ip-allowlist?lang=zh-CN 。
- **官方对「IP 白名单」的定义原文：未验证**。上述两页均为 SPA，抓取只回标题，正文取不到；按口径不补二手转述；https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/set-ip-allowlist?lang=zh-CN 、https://open.feishu.cn/document/faq/breaking-change/gateway-change-ip-allowlist?lang=zh-CN 。
- **「约束的是调用方服务器公网出口 IP 还是本机内网 IPv4」这一飞书侧断言：未验证**（同上原因）。能给出的只是一手网络标准事实，用于排除「本机内网 IPv4」：
  - RFC 1918 §3 逐字："The Internet Assigned Numbers Authority (IANA) has reserved the following three blocks of the IP address space for private internets: 10.0.0.0 - 10.255.255.255 (10/8 prefix) / 172.16.0.0 - 172.31.255.255 (172.16/12 prefix) / 192.168.0.0 - 192.168.255.255 (192.168/16 prefix)"；以及 "Because private addresses have no global meaning, routing information about private networks shall not be propagated on inter-enterprise links, and packets with private source or destination addresses should not be forwarded across such links."；https://www.rfc-editor.org/rfc/rfc1918 。
  - 网络层推理（**不是**飞书官方断言）：192.168 / 10 / 172.16 段地址只在机构内唯一，不会作为源地址出现在公网对端，飞书服务端看到的来源 IP 只能是 NAT/网关转换后的公网地址，所以本机 `ipconfig` 里的内网 IPv4 不可能是白名单要填的值；但「飞书按公网出口 IP 校验」这句话本身仍 **未验证、以页面实际标签为准**。
- **不配置或配错时返回的错误码 / 报错文案：未验证**。官方「设置 IP 白名单」页与「通用错误码」页正文取不到；https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/set-ip-allowlist?lang=zh-CN 、https://open.feishu.cn/document/ukTMukTMukTM/ugjM14COyUjL4ITN 。官方 Go SDK 源码里也没有任何白名单相关错误码常量；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/constants.go 。

---

## 3. 本机查当前公网出口 IP（2–3 个一手方法）

1. **ipify** — `curl -s https://api.ipify.org` 返回纯文本 IP；`curl -s 'https://api.ipify.org?format=json'` 返回 `{"ip":"<公网 IP>"}`；官方页 API 用法表列出 `https://api.ipify.org`（text）、`?format=json`（json）、`?format=jsonp`（jsonp），并给出 Bash 样例 `ip=$(curl -s https://api.ipify.org)` 与 PowerShell 样例 `$ip = Invoke-RestMethod -Uri 'https://api.ipify.org?format=json'`；https://www.ipify.org/ 。
2. **ifconfig.me** — 官方页 Command Line Interface 表给出 `$ curl ifconfig.me`（返回 IP）、`$ curl ifconfig.me/ip`（只返回 IP）、`curl ifconfig.me/all.json`（全部信息 JSON）；https://ifconfig.me/ 。
3. **Cloudflare trace 端点** — `curl -s https://www.cloudflare.com/cdn-cgi/trace` 返回体逐行含 `ip=<公网 IP>`、`loc=`、`ts=` 等字段；https://www.cloudflare.com/cdn-cgi/trace 。

**Windows Git Bash 下的等价命令**（直接沿用 ipify.org 官方页的 Bash 样例，Git Bash 即为 bash，命令无需改写；https://www.ipify.org/ ）：

```bash
curl -s https://api.ipify.org
curl -s https://ifconfig.me/ip
curl -s https://www.cloudflare.com/cdn-cgi/trace | grep '^ip='
```

PowerShell 下按 ipify.org 官方页给出的写法：`$ip = Invoke-RestMethod -Uri 'https://api.ipify.org?format=json'`；https://www.ipify.org/ 。

**为什么 `ipconfig` 里的「IPv4 地址」不是飞书要的那个值**

- Microsoft Learn 对 `ipconfig` 的定义逐字："Displays all current TCP/IP network configuration values and refreshes Dynamic Host Configuration Protocol (DHCP) and Domain Name System (DNS) settings. Used without parameters, **ipconfig** displays Internet Protocol version 4 (IPv4) and IPv6 addresses, subnet mask, and default gateway for all adapters." —— 它显示的是本机网卡/适配器的地址；https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig 。
- RFC 1918 §3 明确 10/8、172.16/12、192.168/16 为私有地址块，且 "Because private addresses have no global meaning … packets with private source or destination addresses should not be forwarded across such links."；https://www.rfc-editor.org/rfc/rfc1918 。
- 上面三个 echo 服务返回的都是「对端服务器看到的来源 IP」，与 `ipconfig` 的本机适配器地址不是同一个值；https://www.ipify.org/ 、https://ifconfig.me/ 、https://www.cloudflare.com/cdn-cgi/trace 。
- 飞书白名单究竟按哪一层校验：**未验证**（见第 2 节）；因此「应填公网出口 IP」在向导里仍须带「未验证、以页面实际标签为准」后缀。
- 另：`https://checkip.amazonaws.com/` 本次抓取失败（返回短内容/挑战页），故不列入可用方法；https://checkip.amazonaws.com/ 。

---

## 4. 相关官方页面精确 URL（逐条标注确认状态）

| 页面 | 精确 URL | URL 是否从一手来源确认 | 页面正文是否取到 |
| --- | --- | --- | --- |
| 开发者后台入口 | https://open.feishu.cn/app | 是：官方站点 HTTP 200，标题「开发者后台 - 飞书开放平台」 | 否：SPA，仅标题 |
| 应用详情页（凭证与基础信息） | **未验证** | 否：官方「如何获取应用的 App ID」页 URL 已一手确认（标题「如何获取应用的 App ID - 开发指南 - 飞书开放平台」；https://open.feishu.cn/document/faq/trouble-shooting/how-to-obtain-app-id ），但正文取不到，无法从中确认详情页路径；试探 `https://open.feishu.cn/app/cli_example/baseinfo` 之类子路径只回通用标题「飞书开放平台」，不构成确认 | 否 |
| IP 白名单设置页（控制台内） | **未验证** | 否：同上，`https://open.feishu.cn/app/cli_example/security` 只回通用标题「飞书开放平台」。注意区分：官方「设置 IP 白名单」**文档页** URL 是已确认的 https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/set-ip-allowlist?lang=zh-CN | 否 |
| 官方 API 调试台 / API Explorer | https://open.feishu.cn/api-explorer | 是：Go SDK `service/auth/v3/resource.go` 注释逐字给出带参完整 URL `https://open.feishu.cn/api-explorer?from=op_doc_tab&apiName=internal&project=auth&resource=tenant_access_token&version=v3`；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/resource.go | 否：SPA，仅标题「开发文档 - 飞书开放平台」（https://open.feishu.cn/api-explorer?from=op_doc_tab&apiName=internal&project=auth&resource=tenant_access_token&version=v3 ） |
| 本接口官方文档页 | https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal | 是：HTTP 200 + 标题（中/英） | 否：SPA，仅标题 |
| 设置 IP 白名单文档页 | https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/set-ip-allowlist?lang=zh-CN | 是：HTTP 200 + 标题 | 否：SPA，仅标题 |
| 网关变更 - 开放平台 IP 白名单 FAQ | https://open.feishu.cn/document/faq/breaking-change/gateway-change-ip-allowlist?lang=zh-CN | 是：HTTP 200 + 标题 | 否：SPA，仅标题 |
| 通用错误码 | https://open.feishu.cn/document/ukTMukTMukTM/ugjM14COyUjL4ITN | 是：HTTP 200 + 标题「通用错误码 - 服务端 API - 飞书开放平台」 | 否：SPA，仅标题 |
| 调用 API（调用前置条件所在页） | https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/get-?lang=zh-CN | 是：HTTP 200 + 标题「调用 API - 服务端 API - 飞书开放平台」 | 否：SPA，仅标题 |
| 如何获取应用的 App ID | https://open.feishu.cn/document/faq/trouble-shooting/how-to-obtain-app-id | 是：HTTP 200 + 标题 | 否：SPA，仅标题 |

补充：官方 Go SDK README 的 Introduction Documents 段还列出「SDK FAQs」页 https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/server-side-sdk/faq （标题「常见问题 - 服务端 API - 飞书开放平台」），同样为 SPA、正文未取到；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/README.md 、https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/server-side-sdk/faq 。

---

## 5. 「不配 IP 白名单也能调 tenant_access_token」的情形

- 白名单留空的含义：**未验证**。官方「设置 IP 白名单」页与「网关变更 - 开放平台 IP 白名单」FAQ 页正文取不到；https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/set-ip-allowlist?lang=zh-CN 、https://open.feishu.cn/document/faq/breaking-change/gateway-change-ip-allowlist?lang=zh-CN 。
- `tenant_access_token`（取 token 这个调用）是否受白名单约束：**未验证**。同上两页正文取不到，且官方 SDK 源码中无相关规则；https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/set-ip-allowlist?lang=zh-CN 、https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/constants.go 。
- 可一手确认、但**不能**推出「白名单豁免」的一点：本接口调用不需要 access token（`SupportedAccessTokenTypes` 为空 / `AccessTokenTypeNone`），这是鉴权方式，不是 IP 白名单规则；https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/service/auth/v3/resource.go 、https://raw.githubusercontent.com/larksuite/oapi-sdk-go/v3_main/core/tokenmanager.go 。
- 结论：本文没有任何一手依据支持「不配白名单也能调」或「留空即不限制」，向导不得把这类说法写成确定指令。

---

## 未验证汇总

| 项 | 原因 |
| --- | --- |
| 官方对「IP 白名单」的定义原文 | 「设置 IP 白名单」页 SPA，只回标题 |
| 白名单校验对象 = 公网出口 IP / 内网 IPv4（飞书侧断言） | 同上；仅有 RFC 1918 + Microsoft Learn 的网络层依据 |
| 不配或配错白名单的错误码与报错文案 | 「设置 IP 白名单」页 + 「通用错误码」页 SPA，只回标题；SDK 无相关常量 |
| 本接口常见错误码含义表 | 「自建应用获取 tenant_access_token」页 + 「通用错误码」页 SPA |
| 白名单留空含义、`tenant_access_token` 是否受白名单约束 | 相关 FAQ/文档页 SPA；SDK 无相关规则 |
| HTTP 原始回包层级（顶层 vs `data` 包裹） | 同一官方 SDK 内 `core/tokenmanager.go` 与生成模型互相冲突，官方页正文未取到 |
| 应用详情页、IP 白名单设置页的控制台精确路径与页面标签 | SPA 子路径只回通用标题，无一手来源给出路径；「如何获取 App ID」页正文未取到 |
| `msg` 成功取值、`expire` 具体数值 | 官方页正文未取到 |
| 只写 `Content-Type: application/json`（不带 charset）是否被接受 | 未单独取证（SDK 原值带 `; charset=utf-8`） |
| `https://checkip.amazonaws.com/` 作为查 IP 方法 | 本次抓取返回短内容/挑战页，不可用 |

---

## 对决策的影响

1. **stage 4 的「换 token」步骤可以写成陌生人可照做的具体指令**：POST + 完整 URL + `Content-Type: application/json; charset=utf-8` + `{"app_id":"<APP_ID>","app_secret":"<APP_SECRET>"}` 的 curl，以及「`code==0` 才算成功、取 `tenant_access_token` 与 `expire`（秒）」的解析规则，全部有官方 SDK 源码一手依据。唯一要留余地的是回包层级：按 `core/tokenmanager.go` 走顶层，同时兼容 `data` 包裹。
2. **stage 5 的「查公网出口 IP」步骤可以写成陌生人可照做的具体指令**：ipify / ifconfig.me / Cloudflare trace 三条 `curl` 与 Windows Git Bash 等价命令都有官方服务页一手依据；「不要用 `ipconfig` 的 IPv4 地址」有 Microsoft Learn + RFC 1918 一手依据。
3. **stage 5 的「去哪儿配、配什么」必须标「未验证、以页面实际标签为准」**：开发者后台入口 https://open.feishu.cn/app 已一手确认，但应用详情页、IP 白名单设置页的精确 URL/标签、白名单留空含义、错误码与报错文案都取不到官方正文；向导只能给「打开开发者后台 → 进入目标应用 → 按页面实际标签找到安全/IP 白名单设置」的导航式指令，不能写死路径或标签。
4. **「不配白名单也能调 tenant_access_token」不能写成确定结论**（未验证）：向导应把「先按页面实际提示配置，再重试 curl」作为默认路径，并把 `code != 0` 时的 `msg` 原样展示给用户，而不是硬编码某个错误码解释。
5. 向导文案里凡涉及飞书侧规则（校验对象 = 公网出口 IP、错误码含义、页面标签）都要保留「未验证、以页面实际标签为准」后缀；只有官方 SDK 源码与 IP echo 官方页覆盖的部分可以写成确定句，避免把二手转述混进陌生人照做流程。
