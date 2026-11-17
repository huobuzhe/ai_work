# 腾讯文档云端冒烟测试 Step 6：新建在线表格请求 / 回包精确形态（一手核实）

> **存放理由**：循 `docs/research/` 既有取证笔记习惯（本目录已有 8 份，首份 [spreadsheet-platform-capabilities.md](<F:/ai_work/docs/research/spreadsheet-platform-capabilities.md>)、同属「腾讯文档云端冒烟测试凭据向导」的 [tencent-scope-application-steps.md](<F:/ai_work/docs/research/tencent-scope-application-steps.md>)、[feishu-tenant-token-ip-whitelist.md](<F:/ai_work/docs/research/feishu-tenant-token-ip-whitelist.md>) 等），本篇专为 Step 6（新建在线表格）核实请求 / 回包的**精确形态**、坐实回包里 `fileId` 的键名，与前述笔记并列存放，便于 `SMOKE-RUNBOOK.md` 的 Step 6 / Step 7 直接引用而不必再查。

## 取证口径

- **只采一手**：腾讯文档开放平台官方开发文档 `docs.qq.com/open/document/app/...`（`openapi/v2/file/files/create.html`、`openapi/v2/file/`、`openapi/v2/`、`openapi/v3/`、`openapi/v2/sheet/`、`get_started.html`、`oauth2/`、`scope.html`、`FAQ/how_to_debug.html` 等）、官方 page 内嵌的示例与官方 SDK 页。凡一手页正文取不到、或各一手来源互相矛盾之处，一律写「未验证」并说明原因，**不补二手转述、不编字段名或 URL**。
- **本轮可达性实测**：本轮所引 `docs.qq.com/open/document/app/*.html` 各页均 HTTP 200 且**正文全文可取**（含「请求包体 / 示例 / 响应包体」代码块），未出现 SPA 空壳；这与 [tencent-scope-application-steps.md](<F:/ai_work/docs/research/tencent-scope-application-steps.md>) 里记的 `https://docs.qq.com/open/developers/`、`https://docs.qq.com/open/` 是 SPA 正文取不到并不冲突（那是另外两页）。因此本篇的多数断言能落到逐字原文。
- **全文只用占位符，不写任何真实凭据**：所有 curl / 请求示例中的 token、ID、Secret 一律为占位符；官方响应示例里出现的示例文档 ID（如 `300000000$AAAAAAAAAAAA`）与昵称「张三」为**逐字抄录**的文档示例值，不是凭据，按第 3 题「逐字抄出」的要求保留原样；官方教程里那串示例 `access_token` / `client_secret=xxx` 一律不抄。
- **控制台 / 页面按钮标签一律标「未验证、以页面实际标签为准」**：官方文档页的导航文字不等于实时控制台 UI 标签。
- 每条断言后紧跟一手 URL；查不到的写「未验证」并说明原因。本轮未在 `F:\ai_work` 检得 `SMOKE-RUNBOOK.md`（glob 无命中），按约束**不改动任何其它文件**，只在「对决策的影响」里给出可替换进 Step 6 的确定文本。

## 一句话结论

URL / 方法 / 参数位置 / 响应 ID 键名 / scope 名**五项全部拿到一手依据**：完整 URL `https://docs.qq.com/openapi/drive/v2/files`、`POST`、参数放**表单 body**（`application/x-www-form-urlencoded`，官方参数表逐字写「查询参数 无」）、回包文件 ID 键是 **`data.ID`（大写 `ID`）**、所需权限 `scope.drive.creatable`。**一处需要纠正既有笔记**：回包外层是 `ret` / `msg` / `data`，**不是** `code` / `msg` / `data`；`code` / `message` / `data.responses` 是 V3 批量更新接口的响应结构。另有一处需纠正：`scope.drive.creatable` 之外的 scope 命名仍无官方总表，且「V2 在线表格接口已废弃」只波及 `/openapi/sheetbook/v2/*`，**不波及** `/openapi/drive/v2/files`。仍未验证的项见文末汇总。

---

## 1. 完整 URL、HTTP 方法、V3 建文件接口、「V2 已废弃」的波及范围

### 1.1 完整 URL（含域名）与方法 —— 一手确认

- 官方「请求格式」表逐字（`create.html`）：`Path | /openapi/drive/v2/files`、`Method | POST`、`Content-Type | application/x-www-form-urlencoded`、`Accept | application/json`。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- 含域名的完整 URL 由官方两个 curl 示例给出，均为 `https://docs.qq.com/openapi/drive/v2/files`：`create.html` 「示例」逐字 `curl --location --request POST 'https://docs.qq.com/openapi/drive/v2/files' \`；`get_started.html` §5 逐字 `curl --location --request POST 'https://docs.qq.com/openapi/drive/v2/files' \`。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html ）
- 官方「请求包体」原始 HTTP 块逐字含 `POST /openapi/drive/v2/files HTTP/1.1` 与 `Host: docs.qq.com`。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- 文件管理接口索引表逐字：`新建文档 | POST | /openapi/drive/v2/files`。（https://docs.qq.com/open/document/app/openapi/v2/file/ ）
- **结论**：完整 URL `https://docs.qq.com/openapi/drive/v2/files`，方法 `POST`，一手确认，可写死进 Step 6。

### 1.2 有没有 V3 版本的建文件接口 —— 主通道未检得；SaaS 通道另有一个 V3，但不可混用

- 官方 V3 介绍「注意」原文：「**文件管理、在线表格、在线智能表格、在线收集表相关接口请查阅 OpenAPI V2 介绍**」；同页说 V3「目前主要提供 `文档操作 API` 和 `doc`、`sheet`、`smartsheet` 等品类的内容操作 API」。（https://docs.qq.com/open/document/app/openapi/v3/ ）
- 官方开放接口首页「文件管理 API」段落逐字「文件管理 API 提供了文档内容无关的通用文件操作，如**新建一个文件**、为文档设置访问权限等」，链接指向 `/open/document/app/openapi/v2/file/`；「在线文档 API」才指向 `openapi/v3/doc/`。即主通道里「新建文件」明确归 V2。（https://docs.qq.com/open/document/app/ ）
- 本轮在 `openapi/v3/` 及其页内导航中**未检得任何建文件接口**；`openapi/v3/sheet/batchupdate/update.html` 的侧栏 V3 分类下只有「总览 / 在线表格资源描述 / 批量更新接口 / 查询工作表信息接口 / 范围内容查询接口」，无文件管理。（https://docs.qq.com/open/document/app/openapi/v3/ 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- **未验证**：主 Open API（`app/`）通道是否存在一个未挂进导航的 V3 建文件接口。官方没有一句「不存在 V3 建文件接口」的否定原文，只能确认「V3 介绍把文件管理指向 V2」+「本轮未检得」，故按口径不写死「一定没有」。
- **另检得一个 V3 建文件接口，但属不同通道**：SaaS 版「新建文件」页逐字 `Path | /openapi/drive/v3/files`、`Method | POST`、`Content-Type | application/json; charset=utf-8`，请求示例 `curl --location 'https://{domain}/openapi/drive/v3/files'`、JSON body `{"name":"V3测试表格","type":"SHEET",...}`、响应示例顶层为 `meta.id`。该页域名是 `{domain}` 占位（企业自建应用 / SaaS 部署），请求头示例只有 `Access-Token` 与 `Client-Id`（无 `Open-Id`），参数名是 `name` / `type` / `folderId`，与 Step 6 的第三方应用主通道（`scope=all` 授权、`docs.qq.com` 固定域名、三元组请求头、`title` / `type=sheet`）**不是同一套**（https://docs.qq.com/open/document/saas/openapi/file/create.html ）。**Step 6 不得改用这个 V3 接口**，否则冒烟前提全变。
- 附带记录该 SaaS 页内部不一致：其「文件类型 FileType」表逐字为 `SHEET | 在线幻灯片`、`SLIDE | 在线表格`（中文描述互换），与 `create.html` 的 `type` 枚举及主流命名不一致；属官方页内部矛盾，标**未验证**，不据此推断 Step 6 的 `type` 取值。（https://docs.qq.com/open/document/saas/openapi/file/create.html ）
- **官方 SDK / 官方示例代码仓库：未验证**。顶栏「腾讯文档 SDK」指向的 `https://docs.qq.com/open/document/websdk/` 正文是「腾讯文档在线预览服务」（前端 JS-SDK，能力表为文档 / 表格 / 幻灯片 / PDF 的预览与视图操作，**不含 OpenAPI 建文件**），不是服务端 OpenAPI SDK（https://docs.qq.com/open/document/websdk/ ）。外部检索命中 `github.com/easy-wx/qq-doc` 为**第三方社区 SDK，非官方**，按「只采一手」口径排除，不作依据。

### 1.3「V2 在线表格接口已废弃」到底波及谁 —— 只波及 `/openapi/sheetbook/v2/*`，不波及建文件接口

- 废弃标注的**原文位置**：`https://docs.qq.com/open/document/app/openapi/v2/sheet/` 侧栏逐字为「在线表格 → **V3 版本（推荐）** / **V2 版本（已废弃）**」；该页「接口索引」列出的 V2 路径全部是 `/openapi/sheetbook/v2/{bookID}/...`（查询子表、添加子表、删除行列、清空区域内容、更新区域内容、批量插入图片）。（https://docs.qq.com/open/document/app/openapi/v2/sheet/ ）
- 同样标注在 V3 批量更新页侧栏逐字可见「V2 版本（已废弃）」，且该标注挂在「在线表格」分类下。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）
- **文件管理侧无废弃标注**：`https://docs.qq.com/open/document/app/openapi/v2/file/` 的接口索引页（上次编辑于 2025年7月2日）仍逐字列出「新建文档 | POST | /openapi/drive/v2/files」，页面无「已废弃」字样；`create.html` 本身（上次编辑于 2023年11月3日）也无废弃标注。（https://docs.qq.com/open/document/app/openapi/v2/file/ 、https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- **教程仍在教这个 V2 建文件接口**：`get_started.html`（上次编辑于 2026年7月1日）§5 逐字「调用[新建文档接口](/open/document/app/openapi/v2/file/files/create.html) 接口，填写相应参数」，并给出可用的 `curl ... POST 'https://docs.qq.com/openapi/drive/v2/files'` 与完整回包。（https://docs.qq.com/open/document/app/get_started.html ）
- **结论（一手可判定）**：「V2 在线表格接口已废弃」这句只针对在线表格**内容写入**接口 `/openapi/sheetbook/v2/*`，**不波及**文件管理接口 `/openapi/drive/v2/files`；Step 6 用 V2 建文件是现行官方做法，Step 7 写入改用 V3 `batchUpdate`。
- **仍未验证**（沿用首份笔记的判断，本轮复核一致）：V3 是否**完整覆盖** V2 的所有写入动作 —— `openapi/v3/` 说「在线表格…请查阅 OpenAPI V2 介绍」，`openapi/v3/sheet/batchupdate/update.html` 又确实存在 V3 在线表格批量更新接口，两处口径不一致，需实测确认。（https://docs.qq.com/open/document/app/openapi/v3/ 、https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

---

## 2. 参数在查询字符串还是表单 body；示例出现的位置；必填 / 可选；`type` / `title` 限制

### 2.1 参数位置 —— 表单 body，非查询字符串

- `create.html` 「请求格式」表逐字：`Content-Type | application/x-www-form-urlencoded`。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- `create.html` 「请求参数」分三节，逐字：「**路径参数 无**」「**查询参数 无**」「**请求体**（表）」；即 `title` / `type` / `folderID` 全部在**请求体**（表单 body），查询字符串为空。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- V2 / V3 介绍页也逐字写请求参数支持 `Path Parameters` / `Query Parameters` / `Body Parameters` 三种，具体由每个接口描述决定。（https://docs.qq.com/open/document/app/openapi/v2/ 、https://docs.qq.com/open/document/app/openapi/v3/ ）

### 2.2 `type=sheet&title=test&folderID=FOLDER_ID` 出现在页面的哪个位置

- **出现在「请求包体」代码块**（原始 HTTP 报文的最后一行，逐字），不是参数表、也不是查询参数说明。完整逐字：

```
POST /openapi/drive/v2/files HTTP/1.1
Host: docs.qq.com
Access-Token: ACCESS_TOKEN
Client-Id: CLIENT_ID
Open-Id: OPEN_ID
Content-Type: application/x-www-form-urlencoded
Content-Length: 40

type=sheet&title=test&folderID=FOLDER_ID
```
（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

- 同一页「**示例**」curl 把同一组参数拆成三条 `--data-urlencode`：逐字
```
curl --location --request POST 'https://docs.qq.com/openapi/drive/v2/files' \
--header 'Access-Token: ACCESS_TOKEN' \
--header 'Client-Id: CLIENT_ID' \
--header 'Open-Id: OPEN_ID' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'type=sheet' \
--data-urlencode 'title=test' \
--data-urlencode 'folderID=FOLDER_ID'
```
（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

- 第三方佐证：`get_started.html` §5 的 curl 也是 `--data-urlencode 'title=Hello Tdoc' --data-urlencode 'type=doc'`（body，非 query）。（https://docs.qq.com/open/document/app/get_started.html ）
- **结论**：该串是 **`application/x-www-form-urlencoded` 表单 body**；官方页面位置为「请求包体」（原始报文）与「示例」（curl `--data-urlencode`）。**不要**写成 `?type=sheet&title=...`。

### 2.3 必填 / 可选（`create.html`「请求体」表逐字）

| 参数名 | 类型 | 必选 | 官方描述（逐字） |
| :--- | :--- | :--- | :--- |
| `title` | string | 是 | 文档的标题（长度不超过`36`字符） |
| `type` | string | 是 | 文档类型，枚举值（见下） |
| `templateID` | string | 否 | 文档模板唯一标识，默认创建空白文档。目前仅支持官方模板 |
| `templateVersion` | string | 是 | 模板的版本号，默认为 0 |
| `folderID` | string | 否 | 文档所在文件夹唯一标识，默认为 `/` |
| `ext` | string | 是 | `Drive`插件文档缩略图的类型，仅 `type`=`addon`时需要填写 |

（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

- **官方页内部不一致（标未验证，影响「照抄参数表」的安全性）**：参数表把 `templateVersion` 与 `ext` 标为「是」，但 `templateVersion` 自己写「默认为 0」、`ext` 自己写「仅 `type=addon` 时需要填写」，而官方两个 curl 示例（建 `sheet` 与建 `doc`）**都只带 `title` + `type`（+可选 `folderID`），不带 `templateVersion` / `ext`**。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html ）→ 对「仅建 `sheet` 时 `templateVersion` / `ext` 是否真的必填」标**未验证**；Step 6 应照官方可运行示例只带 `type` + `title`，不要照参数表补这两个字段。
- `folderID` 的官方说明页：`https://docs.qq.com/open/document/app/openapi/v2/file/common/folder_id/`（由 `create.html` 参数表链接，本轮未单独取正文，其具体取值规则标**未验证**）。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

### 2.4 `type=sheet` 枚举值是否精确 / `title` 限制

- `create.html` 「接口说明」逐字：「本接口用于新建一个在线文档。可以创建的文档类型有 `doc` 、`sheet`、`form`、`slide`、`mind`、`flowchart`、`smartsheet`，在不传 `templateID` 字段的情况下 默认创建一个空白文档。」；「请求体」`type` 枚举逐字：`doc`（在线文档，**默认值**）、`sheet`（**在线表格**）、`form`（在线收集表）、`slide`（在线幻灯片）、`mind`（在线思维导图）、`flowchart`（在线流程图表）、`addon`（在线插件文档，仅供 `插件` 应用使用）、`smartsheet`（在线智能表格）。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- **`type=sheet` 精确值一手确认**：`sheet`＝在线表格；注意默认值是 `doc`，**不传 `type` 会得到在线文档而非表格**，Step 6 必须显式带 `type=sheet`。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- 另有官方「文件类型」页给出更长的清单（`doc` / `slide` / `sheet` / `form` / `pdf` / `smartcanvas` / `smartsheet` / `board` / `mind` / `flowchart` / `folder` / `file`），并逐字写 `sheet | 在线表格`；但该表**不含 `addon`**、且多出 `pdf` / `smartcanvas` / `board` / `folder` / `file` 等，与 `create.html` 的 `type` 枚举不完全一致。（https://docs.qq.com/open/document/app/openapi/v2/file/common/file_type.html ）→ **未验证**：两份官方表哪一份是 `type` 的权威全集；但两处对 `sheet`＝在线表格一致，不影响 Step 6。
- **`title` 限制**：逐字「文档的标题（长度不超过`36`字符）」→ 长度上限 36 字符，一手确认。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）**未验证**：字符集 / 禁用字符 / 是否按字节计 / 空白标题是否允许 —— 官方页只给长度上限，未给其它字符规则，不擅自补。

---

## 3. 响应体精确结构：文件 ID 的键名与层级（本篇核心）

### 3.1 官方响应示例逐字抄出（`create.html`「响应包体」）

```
HTTP/1.1 200 OK
Date: Thu, 28 Jul 2022 15:34:46 GMT
Content-Type: text/plain; charset=utf-8
Content-Length: 3
Connection: keep-alive
 
{'ret': 0, 'msg': 'Succeed', 'data': {'ID': '300000000$AAAAAAAAAAAA', 'title': 'test', 'type': 'sheet', 'url': 'https://docs.qq.com/sheet/DAAAAAAAAAAAA', 'status': 'normal', 'isCreator': True, 'isOwner': True, 'createTime': 1599811876, 'ownerName': '张三', 'creatorName': '张三'}}
```
（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

### 3.2 第二份独立官方响应示例（`get_started.html` §5「请求结果」，标准 JSON）

```
{
  "ret": 0,
  "msg": "Succeed",
  "data": {
    "ID": "300000000$fclZsEgvOuLD",
    "title": "Hello Tdoc",
    "type": "doc",
    "url": "https://docs.qq.com/doc/DZmNsWnNFZ3ZPdUxE",
    "status": "normal",
    "isCreator": true,
    "createTime": 1658166722,
    "creatorName": "客服小迈",
    "isOwner": true,
    "ownerName": "客服小迈",
    "lastModifyTime": 1658166722,
    "lastModifyName": "客服小迈",
    "tenant": ""
  }
}
```
（https://docs.qq.com/open/document/app/get_started.html ）

### 3.3 结论：`data.ID`（大写 `ID`）一手坐实

- **文件 ID 的键名与层级 = `data.ID`**（`data` 对象内、键名两个字母全大写 `ID`，区分大小写）。`data.fileId` / `data.id` / 顶层 `ID` **均不是**官方示例里的键名，不要使用。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html ）
- 这**坐实了既有笔记里的存疑点**：[tencent-scope-application-steps.md:172](<F:/ai_work/docs/research/tencent-scope-application-steps.md>) 写的「从回包 `data.ID` 取 `fileId`」是正确的；[spreadsheet-platform-capabilities.md:65](<F:/ai_work/docs/research/spreadsheet-platform-capabilities.md>) 只列了 `type` 与 `url` 而没列 `data.ID`，是**记录不全**，不是取错键。
- **外层结构纠正（重要）**：官方 V2 建文件回包是 **`ret` / `msg` / `data`**，不是 `code` / `msg` / `data`。`create.html`「响应参数」表逐字：`ret | integer | 业务返回码`、`msg | string | 业务返回码描述`、`data | json object | 业务数据，详见 文档信息`。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）`code` / `message` / `data.responses` 是 **V3 在线表格批量更新接口**的响应结构，别混用（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）。V2 介绍页逐字：「大多数 API 的响应体结构包含 `ret、msg、data` 三个部分，有的只包含 `ret、msg`。`ret` 为返回码，`msg` 为返回码描述，`data` 为调用 API 后返回的结果；如果 `ret` 不为 `0` 则认为请求失败」。（https://docs.qq.com/open/document/app/openapi/v2/ ）
- 注意 `create.html` 的响应示例用 **Python 字典字面量**（单引号、`True`）而非严格 JSON；`get_started.html` 的是标准 JSON。两者键名层级一致，都是 `ret` / `msg` / `data.ID`。解析时按 JSON 处理即可（`openapi/v2/` 与 `openapi/v3/` 均逐字写「响应结果：`JSON` 数据格式」，https://docs.qq.com/open/document/app/openapi/v2/ 、https://docs.qq.com/open/document/app/openapi/v3/ ）。
- **官方文档对 `ID` 字段的第二、第三重确认**：「文件信息」表逐字 `ID | string | 文档唯一标识，详见 fileID`（https://docs.qq.com/open/document/app/openapi/v2/file/common/file_info.html ）；「ID 介绍」页逐字「**fileID** 表示在线文档的 ID。获取方式 1. 从[新建文档](/open/document/app/openapi/v2/file/files/create.html)接口的返回值中获取到文档的 `fileID`」（https://docs.qq.com/open/document/app/openapi/v2/file/common/id.html ）。即官方概念名叫 `fileID` / `fileId`，但**回包字段名叫 `ID`**。
- ID 取值形如 `300000000$AAAAAAAAAAAA`，「文件信息」页「关联文档」节逐字「关联文档的 ID，形如 {domainID}${padID}」（https://docs.qq.com/open/document/app/openapi/v2/file/common/file_info.html ）；V3 批量更新接口的路径参数示例 `POST /openapi/spreadsheet/v3/files/300000000$AAAAAAAAAAAA/batchUpdate` 用的是同一形态，可交叉印证 Step 7 的 `{fileId}` 就该填 `data.ID` 的值。（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）

### 3.4 响应里的其它字段（逐字）

- `create.html` 响应示例含：`data.title`、`data.type`（`sheet`）、`data.url`（`https://docs.qq.com/sheet/DAAAAAAAAAAAA`）、`data.status`（`normal`）、`data.isCreator`、`data.isOwner`、`data.createTime`、`data.ownerName`、`data.creatorName`。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- 「文件信息」表另列：`lastModifyTime`、`lastModifyName`、`relativeFiles`（逐字「只有类型为 `form` 或者 `sheet` 的文档可能返回」）、`formCollectingStatus`、`formCollectingEndTime`（后两者逐字「只有 `form` 类型会返回」）。（https://docs.qq.com/open/document/app/openapi/v2/file/common/file_info.html ）
- 官方 FAQ「问题排查」逐字：「通过查看请求的响应体来判断请求是否成功，请求的响应体中包含了 `ret` 和 `msg` 两个字段……一般情况下，通过这两个信息就可以判断请求是否成功以及错误的原因是什么」，成功示例 `{'ret': 0, 'msg': 'Succeed'}`。（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）

### 3.5 保守做法（仅在官方页取不到 / 实际回包形态不同时使用）

本轮官方页**已取到**，`data.ID` 已坐实，正常不需要保守做法。若实跑时回包与官方示例不同（例如字段改名、外层包了别的层），按官方 FAQ 的建议逐字「为了方便定位问题和反馈问题，建议开发者在自己的程序或脚本中**打印完整的 `Request` 和 `Response` 信息**」（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ），然后：① 肉眼在整份回包里找形如 `{domainID}${padID}`（如 `300000000$...`）的字符串值；② 优先取 `data` 对象里键名恰为大写 `ID` 的那个值；③ **不要**凭直觉改成 `.fileId` / `.id` / 顶层 `.ID`；④ 仍拿不准就把该回包连同 `X-Trace-Id` 一并留档（FAQ 逐字「`traceID`：请求的流水号。通过回包 header 的 `X-Trace-Id` 字段返回给调用者」，https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）。

---

## 4. 所需 scope 的精确字符串与官方总表

- **`create.html`「权限说明」逐字**：「本接口需要拥有以下任意一项权限：`scope.drive.creatable`」。→ 精确字符串 **`scope.drive.creatable`**，一手确认。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）
- **官方总表：未验证 / 正文不存在**。`https://docs.qq.com/open/document/app/scope.html` 正文（本轮全文取到）只有申请规则、1 张内嵌截图和 4 条「注意」，**没有列出任何 scope 名称与含义的文字清单**；其侧栏「开放接口概述」下只有「介绍 / 快速开始 / 频率控制说明 / 应用权限说明」，顶栏为「Open API / 小程序 / MCP / 腾讯文档SaaS版(限免) / 腾讯文档 SDK / 我要反馈」，**无「scope 总表 / 权限列表」条目**。（https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/ ）
- **命名互相矛盾，不得合并（本轮复核与 stage 7 笔记一致）**：`scope.drive.creatable` 出自建文件页（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）；但 `get_started.html` §4 的 Token 回包 `scope` 逐字含 `scope.file.creatable` / `scope.folder.creatable` / `scope.drive.form` 等，**不含 `scope.drive.creatable`**（https://docs.qq.com/open/document/app/get_started.html ）；`oauth2/access_token.html` 响应示例逐字 `"scope": "scope.file.editable,scope.folder.creatable"`（https://docs.qq.com/open/document/app/oauth2/access_token.html ）；写入接口页给的是 `scope.sheet` 或 `scope.sheet.editable`（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html 、https://docs.qq.com/open/document/app/openapi/v2/sheet/values/update.html ）；Token 回包字段定义逐字「`scope` | `Access Token` 的权限范围，用 `,` 分隔」（https://docs.qq.com/open/document/app/oauth2/access_token.html ）。→ **未验证**：是否存在一份把这些名字对齐的官方总表，以及 `scope.drive.creatable` 在控制台「权限名称」列里显示成什么字符串；**以页面实际标签为准**。
- 授权链接里的 `scope` 参数与接口所需 scope 是两件事：官方「发起授权」参数表逐字 `scope | string | 是 | 固定为 all`，请求示例 `GET https://docs.qq.com/oauth/v2/authorize?client_id=CLIENT_ID&redirect_uri=...&new_login=1&response_type=code&scope=all&state=STATE`；`get_started.html` §1 示例同为 `scope=all`。（https://docs.qq.com/open/document/app/oauth2/authorize.html 、https://docs.qq.com/open/document/app/get_started.html ）V2 / V3 介绍页逐字「每个接口描述会标注 `Access Token` 需要的 `scope`，而 `scope` 则依赖第三方应用的所获得的 `scope` 和发起授权时指定的 `scope`」（https://docs.qq.com/open/document/app/openapi/v2/ 、https://docs.qq.com/open/document/app/openapi/v3/ ）。

---

## 5. 三个自定义请求头的精确名称、大小写、对应字段、是否都要带、`Content-Type`

### 5.1 精确名称与大小写 —— 一手确认

- 官方「请求头部」表逐字（`create.html` 该节链接指向此页）：`Access-Token | string | 是 | 访问令牌，用于标识用户和接口鉴权`、`Client-Id | string | 是 | 应用 ID，用于标识应用和接口鉴权`、`Open-Id | string | 是 | 开放平台用户 ID，用于标识用户和接口鉴权`。三者**全部必选**。（https://docs.qq.com/open/document/app/openapi/v2/file/common/req_headers.html ）
- V2 / V3 介绍页「请求规范说明」表同样逐字列出 `Access-Token` / `Client-Id` / `Open-Id` 三项，均标「是」，并逐字「请求头部：需要携带 `Client ID`、`Open ID` 和 `Access Token` 三元组，后台用来做认证与鉴权」。（https://docs.qq.com/open/document/app/openapi/v2/ 、https://docs.qq.com/open/document/app/openapi/v3/ ）
- `create.html` 的请求包体与 curl 示例、`get_started.html` §5 的 curl 示例，大小写均逐字为 `Access-Token:` / `Client-Id:` / `Open-Id:`。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html ）

### 5.2 各自对应 OAuth 回包的哪个字段

- `get_started.html` §5「对应关系」表逐字：`Access-Token` =「经用户授权，完成 Token 获取后获得，为 [获取 Token 接口] 回包中的 `access_token` 参数」；`Client-Id` =「注册成为开发者后申请应用获得」；`Open-Id` =「与 Access-Token 同时获得，对应回包中的 `user_id` 参数」。（https://docs.qq.com/open/document/app/get_started.html ）
- `oauth2/access_token.html` 响应体表逐字：`user_id | string | 用户的唯一标识，也就是 Open ID`；回包另有 `access_token` / `token_type` / `expires_in` / `refresh_token` / `scope`。（https://docs.qq.com/open/document/app/oauth2/access_token.html ）
- `oauth2/` §1 逐字「**Client ID**: 第三方应用的唯一标识。在 `OAuth2.0` 授权和后续 `OpenAPI` 调用流程中需要作为请求参数」；`Client-Id` 不来自 Token 回包，来自应用注册。（https://docs.qq.com/open/document/app/oauth2/ ）

### 5.3 是否所有 OpenAPI 请求都要带

- `oauth2/` §4 逐字：「发起请求时，必须在 `Request Header` 中带上 `Client ID`、`Open ID` 和 `Access Token` 三元组作为校验信息」；§4「注意」逐字「为了安全考虑，**所有访问腾讯文档 `Open API` 的请求需由后台服务发起**」；§2 表逐字「`Access Token`……发起**所有 `OpenAPI` 请求都需要带上**」；§3 逐字「`Open ID` 是用户的唯一标识，发起**所有 `Open API` 请求都需要带上**」。（https://docs.qq.com/open/document/app/oauth2/ ）
- → **是**，三元组对每个 OpenAPI 请求都必带；Step 6 不例外。（https://docs.qq.com/open/document/app/openapi/v2/ 、https://docs.qq.com/open/document/app/openapi/v3/ ）

### 5.4 `Content-Type` 是否需要手写

- 官方两处 curl 示例都**显式写了** `--header 'Content-Type: application/x-www-form-urlencoded'`，且「请求格式」表逐字给出该值。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html ）
- 「curl `-d` / `--data-urlencode` 会自动补 `Content-Type: application/x-www-form-urlencoded`」是 **curl 工具行为，不是腾讯官方文档断言**，按「只采一手」口径**不作为依据**，标**未验证**；官方文档未讨论「省略该 header 是否等价」。→ Step 6 照官方示例**显式写出**该 header 最稳妥，不需要赌 curl 的自动行为。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

---

## 6. `Client Secret` 的后台限定与 20000 次限免

### 6.1 `Client Secret` 官方原文

- `oauth2/` §1 逐字：「**Client Secret**: `Client ID` 对应的密钥，**在后台服务间接口调用时用来验证应用的合法性**。」；紧随的「注意」逐字：「`Client Secret` 用于验证开发者身份，需要对 `Client Secret` 进行**妥善存储，不要随意泄漏**。如发生泄露请及时登录开放平台修改。」（https://docs.qq.com/open/document/app/oauth2/ ）
- `oauth2/` §2「注意」逐字：「第 4 步中，**必须在第三方应用的后台服务发起换取令牌的请求，谨防密钥泄漏**。需要对用户的 `Access Token` 和 `Refresh Token` 进行妥善存储，不要随意泄漏。」（https://docs.qq.com/open/document/app/oauth2/ ）
- `oauth2/access_token.html` 接口说明「注意」逐字：「**为了防止 `Client Secret` 和 `Token` 泄密，请求需要由第三方服务发起**。」（https://docs.qq.com/open/document/app/oauth2/access_token.html ）
- `oauth2/` §4「注意」逐字：「为了安全考虑，**所有访问腾讯文档 `Open API` 的请求需由后台服务发起**。」（https://docs.qq.com/open/document/app/oauth2/ ）
- **精确边界（不夸大原文）**：官方逐字坐实的是「后台服务间接口调用 / 请求需由后台服务（第三方服务）发起 / 妥善存储、不要随意泄漏、谨防密钥泄漏」。官方**没有**逐字写「绝不进命令行 / 绝不进前端」这句话 —— 该措辞是据上述原文的操作性推论，标**未验证（非逐字原文）**，不冒充官方原话。可确定的是：**Step 6 的 curl 完全不含 `Client Secret`**（只需三元组），`Client Secret` 只出现在用 `code` 换 Token 的那一步，且那一步官方明确要求后台服务发起。（https://docs.qq.com/open/document/app/oauth2/ 、https://docs.qq.com/open/document/app/oauth2/access_token.html ）

### 6.2 自 2025-07-01 起每应用限免 20000 次 —— 一手 URL

- `https://docs.qq.com/open/document/app/` 「限免体验」逐字：「腾讯文档面向开发者提供限时免费的 API 服务。**从2025年7月1日起，每个应用可以免费调用20000次API**，只需轻量级开发即可接入腾讯核心能力。如果你想采买API资源包，可以填写[意向申请表]……」（https://docs.qq.com/open/document/app/ ）
- 补充频控（与 20000 次不是同一维度）：官方「频率控制」页逐字「对于文件操作（如**新建文件**、智能表格新建子表），如无特殊说明频率控制如下：`openID | 300`（次 / 分钟）」；`create.html` 页头也带 `[openID] [300]` 频控标签。（https://docs.qq.com/open/document/app/openapi/v2/frequency_control.html 、https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

---

## 7. 官方「API Explorer / 调试台」入口 URL

- **未验证**：本轮取到全文的官方各页，顶栏一致为「Open API / 小程序 / MCP / 腾讯文档SaaS版(限免) / 腾讯文档 SDK / 我要反馈」，侧栏一致为「开放接口概述 / 用户授权 / 文件管理 / 在线表格 / 在线智能表 / 在线文档 / 在线收集表 / FAQ / 常见错误码」，**未出现「API Explorer」「调试台」「在线调试」任何条目**（例：https://docs.qq.com/open/document/app/ 、https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/oauth2/ ）。唯一 hash 路由是「我要反馈」`https://docs.qq.com/open/#/feedback`，那是反馈表单不是调试台（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）。
- 官方有一份 FAQ **「问题排查」**页 `https://docs.qq.com/open/document/app/FAQ/how_to_debug.html`，但内容是「打印完整 Request / Response」「看 `ret` / `msg`」「到反馈平台提 `traceID`」的排查说明，**不是可交互的 API Explorer / 调试台**，页内也没有调试台 URL。（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）
- 外部检索未命中腾讯文档官方 OpenAPI 调试台的一手 URL（命中的是第三方文章 / 社区仓库，按口径排除）。→ **不给任何调试台 URL，也不断言「一定没有」**。
- **控制台 / 页面按钮标签一律标「未验证、以页面实际标签为准」**：实时控制台页面（`https://docs.qq.com/open/developers/` 为 SPA，正文取不到）的菜单、按钮、权限名称列标签，官方只给规则与一张内嵌截图，不作依据。（https://docs.qq.com/open/document/app/scope.html ）

---

## 8. 综合结论（可直接替换进 Step 6 的确定项）

| 待核实项 | 一手结论 | 一手 URL |
| :--- | :--- | :--- |
| 完整 URL | `https://docs.qq.com/openapi/drive/v2/files` | https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html |
| HTTP 方法 | `POST` | https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/openapi/v2/file/ |
| 参数位置 | 表单 body `application/x-www-form-urlencoded`；官方「查询参数 无」 | https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html |
| 必带参数 | `type=sheet` + `title`（≤36 字符）；`folderID` 可选 | https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html |
| 回包 ID 键名 | **`data.ID`**（外层 `ret` / `msg` / `data`，不是 `code`） | https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/openapi/v2/file/common/file_info.html |
| scope | `scope.drive.creatable`（无官方总表对齐其它名字） | https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/scope.html |
| 请求头 | `Access-Token`（=`access_token`）/ `Client-Id`（应用 Client ID）/ `Open-Id`（=`user_id`），全部必带 | https://docs.qq.com/open/document/app/openapi/v2/file/common/req_headers.html 、https://docs.qq.com/open/document/app/get_started.html |
| 后台要求 | 所有 OpenAPI 请求由后台服务发起；`Client Secret` 妥善存储、不随意泄漏 | https://docs.qq.com/open/document/app/oauth2/ |
| 废弃范围 | 只波及 `/openapi/sheetbook/v2/*`，不波及 `/openapi/drive/v2/files` | https://docs.qq.com/open/document/app/openapi/v2/sheet/ 、https://docs.qq.com/open/document/app/openapi/v2/file/ |
| 官方调试台 | 未验证 | https://docs.qq.com/open/document/app/ 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html |

可直接复制的 Step 6 最小 curl、成功判据、`fileId` 取法与 `export TENCENT_FILE_ID=...` 见文末「## 可直接复制的 Step 6 最小 curl」。

---

## 未验证汇总

| 项 | 原因 |
| :--- | :--- |
| 主 `app/` 通道是否存在 V3 建文件接口 | V3 介绍只说「文件管理…请查阅 OpenAPI V2 介绍」，无否定句；本轮导航未检得，不写死「一定没有」。另检得 SaaS 通道 `POST /openapi/drive/v3/files`，但属不同通道不可混用（https://docs.qq.com/open/document/app/openapi/v3/ 、https://docs.qq.com/open/document/saas/openapi/file/create.html ） |
| V3 是否完整覆盖 V2 全部写入动作 | `openapi/v3/` 与 `openapi/v3/sheet/batchupdate/update.html` 口径不一致，需实测（https://docs.qq.com/open/document/app/openapi/v3/ ） |
| 建 `sheet` 时 `templateVersion` / `ext` 是否真的必填 | 官方参数表标「是」，但两个官方 curl 示例都不带；官方页内部矛盾（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html ） |
| `title` 的字符集 / 禁用字符 / 是否按字节计 | 官方只给「长度不超过 36 字符」（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ） |
| `type` 枚举哪份官方表是权威全集 | `create.html` 枚举与「文件类型」页清单不完全一致（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/openapi/v2/file/common/file_type.html ） |
| 官方 scope 名称总表；`scope.drive.creatable` 在控制台显示成什么 | `scope.html` 正文一个 scope 名都不列，各页 / Token 回包 / 响应示例命名互相矛盾（https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/access_token.html ） |
| 「绝不进命令行 / 前端」是否为官方逐字原文 | 官方只写「后台服务发起 / 妥善存储 / 不要随意泄漏 / 谨防密钥泄漏」，该措辞属推论（https://docs.qq.com/open/document/app/oauth2/ ） |
| curl `-d` 自动补 `Content-Type` 后能否省略手写 | 属 curl 工具行为，官方文档未讨论；两处官方示例都显式写了该 header（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ） |
| 官方 API Explorer / 调试台 URL | 官方导航与正文、外部检索均未检得；FAQ「问题排查」不是调试台（https://docs.qq.com/open/document/app/ 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ） |
| 官方服务端 OpenAPI SDK / 官方示例代码仓库 | `websdk/` 是「在线预览服务」前端 JS-SDK，不含 OpenAPI 建文件示例；命中的 GitHub 仓库为第三方社区 SDK（https://docs.qq.com/open/document/websdk/ ） |
| 控制台 / 页面按钮标签 | 实时控制台为 SPA，正文取不到；一律「未验证、以页面实际标签为准」（https://docs.qq.com/open/document/app/scope.html ） |
| `folderID` 的取值规则细节 | `create.html` 仅链到 `common/folder_id/` 并写「默认为 `/`」，本轮未单独取该页正文（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ） |

---

## 对决策的影响

1. **Step 6 的 URL / 方法 / 参数位置可从占位符换成确定指令**：`POST https://docs.qq.com/openapi/drive/v2/files`、参数走表单 body（`Content-Type: application/x-www-form-urlencoded`）、必带 `type=sheet` + `title`（≤36 字符，`folderID` 可选且默认 `/`）、显式写三个请求头。这些在 `create.html`、文件管理接口索引、`get_started.html` §5 三处逐字可查，可直接落进 `SMOKE-RUNBOOK.md` 的 Step 6，不再写「待确认」。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/openapi/v2/file/ 、https://docs.qq.com/open/document/app/get_started.html ）
2. **`fileId` 从「存疑键名」换成确定指令 `data.ID`**：`create.html`「响应包体」、`get_started.html` §5 回包、`file_info.html` 的 `ID` 字段定义、`id.html`「从新建文档接口的返回值中获取到文档的 `fileID`」四处一手互证，Step 6 可以写死「从回包 `data.ID` 取值」并 `export TENCENT_FILE_ID=...`；同时**必须把外层 `code` 改成 `ret`**（V2 用 `ret`/`msg`/`data`，`code`/`message` 是 V3 批量更新的结构），否则按 `.code` 判成功会误判。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/openapi/v2/file/common/file_info.html 、https://docs.qq.com/open/document/app/openapi/v2/ ）
3. **scope 可写确定值但不得写死控制台标签**：`scope.drive.creatable` 有建文件页逐字依据，Step 6 可写「需 `scope.drive.creatable`」；但 `scope.html` 无总表、Token 回包里是 `scope.file.creatable` 等另一套名字，控制台「权限名称」列实际显示成什么仍**必须标「未验证、以页面实际标签为准」**，且授权链接 `scope` 仍固定 `all`。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/oauth2/authorize.html ）
4. **「V2 已废弃」不再需要作为 Step 6 的风险提示**：废弃标注只挂在「在线表格」分类下的 `/openapi/sheetbook/v2/*`，文件管理索引无废弃标注、教程（最新编辑 2026-07-01）仍在教这个 V2 建文件接口；Step 6 可删掉「V2 可能已废弃」的存疑措辞，Step 7 写入继续用 V3 `batchUpdate`。但「V3 是否完整覆盖 V2 全部写入动作」仍须标未验证。（https://docs.qq.com/open/document/app/openapi/v2/sheet/ 、https://docs.qq.com/open/document/app/openapi/v2/file/ 、https://docs.qq.com/open/document/app/get_started.html ）
5. **仍必须保留「未验证」的项**：`templateVersion` / `ext` 是否真必填、`title` 字符集、`type` 枚举权威全集、官方 scope 总表、官方 API Explorer / 调试台 URL、官方服务端 SDK / 示例仓库、「绝不进命令行」是否官方逐字、控制台按钮标签 —— 这些要么官方页自相矛盾，要么只有规则没有清单，要么 SPA 取不到；照取证口径不得写成确定指令。另外 `Client Secret` 与 20000 次限免有一手原文，可写进 Step 6 的注意事项，但「绝不进命令行/前端」须注明是推论而非逐字原文。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/scope.html 、https://docs.qq.com/open/document/app/oauth2/ 、https://docs.qq.com/open/document/app/ 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）

---

## 可直接复制的 Step 6 最小 curl

> 前置：`$TENCENT_ACCESS_TOKEN` / `$TENCENT_CLIENT_ID` / `$TENCENT_OPEN_ID` 已由**后台服务**持有（分别对应 Token 回包 `access_token`、应用 Client ID、回包 `user_id`）；全文只用占位符，无任何真实凭据。官方所有 OpenAPI 请求须由后台服务发起（https://docs.qq.com/open/document/app/oauth2/ ）。

```bash
curl --location --request POST 'https://docs.qq.com/openapi/drive/v2/files' \
  --header "Access-Token: $TENCENT_ACCESS_TOKEN" \
  --header "Client-Id: $TENCENT_CLIENT_ID" \
  --header "Open-Id: $TENCENT_OPEN_ID" \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'type=sheet' \
  --data-urlencode 'title=<标题>'
```

（形态照抄官方 `create.html`「示例」curl，仅把官方示例里的 `ACCESS_TOKEN` / `CLIENT_ID` / `OPEN_ID` 换成变量、把 `title=test` 换成 `<标题>`；`folderID` 官方标为可选、默认 `/`，需要放进指定文件夹时再加一行 `--data-urlencode 'folderID=<文件夹ID>'`。https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）

**成功判据**（逐条，按官方原文）：

- HTTP 状态码 `200`（`openapi/v3/` 逐字「如果接口请求成功，则 `HTTP Status Code` 为 `200`」，https://docs.qq.com/open/document/app/openapi/v3/ ）。
- 回包 `ret == 0`（`openapi/v2/` 逐字「如果 `ret` 不为 `0` 则认为请求失败，失败信息可参考 `msg`」，https://docs.qq.com/open/document/app/openapi/v2/ ；FAQ 逐字「请求的响应体中包含了 `ret` 和 `msg` 两个字段」，https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）。
- **不要**用 `msg` 当成功判据：`openapi/v2/` 逐字「注意，`msg` 仅作为参考，后续可能会有变动，因此不可作为是否调用成功的判断依据」（https://docs.qq.com/open/document/app/openapi/v2/ ）。
- `data.type == "sheet"`、`data.url` 形如 `https://docs.qq.com/sheet/...`、`data.ID` 非空且形如 `300000000$...`（`create.html` 响应包体，https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ；ID 形态 `{domainID}${padID}`，https://docs.qq.com/open/document/app/openapi/v2/file/common/file_info.html ）。
- 失败时按 `create.html` 错误码表排查：`10313` Access-Token 为空、`10303` Open-Id 错误、`10302` Client-Id 错误、`37019` Token 校验失败或过期（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html ）；需要提反馈时留回包 header 的 `X-Trace-Id`（https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）。

**`fileId` 该从回包哪个键取**：从 **`data.ID`**（大写 `ID`，`data` 对象内）取，一手坐实；**不是** `data.fileId` / `data.id` / 顶层 `ID`，外层也不是 `code`（是 `ret`）。若实跑回包与官方示例形态不同，按 §3.5 的保守做法打印完整 `Response` 后肉眼找 `{domainID}${padID}` 形态的值，不要猜键名。（https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html 、https://docs.qq.com/open/document/app/get_started.html 、https://docs.qq.com/open/document/app/FAQ/how_to_debug.html ）

**一次跑通并导出供 Step 7 用**（把上面 curl 的输出存进变量再取键）：

```bash
RESP=$(curl -sS --location --request POST 'https://docs.qq.com/openapi/drive/v2/files' \
  --header "Access-Token: $TENCENT_ACCESS_TOKEN" \
  --header "Client-Id: $TENCENT_CLIENT_ID" \
  --header "Open-Id: $TENCENT_OPEN_ID" \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'type=sheet' \
  --data-urlencode 'title=<标题>')

echo "$RESP"                       # 肉眼核对 ret==0、data.type=="sheet"、data.ID 非空
export TENCENT_FILE_ID=$(printf '%s' "$RESP" | jq -r '.data.ID')
echo "TENCENT_FILE_ID=$TENCENT_FILE_ID"
```

（无 `jq` 时把 `echo "$RESP"` 里的 `data.ID` 值手工填进 `export TENCENT_FILE_ID=<该值>`；`jq` / shell 用法属工具行为，非腾讯官方文档内容，故不作一手依据。）

Step 7 把 `$TENCENT_FILE_ID` 填进 V3 批量更新接口的路径参数 `{fileId}`：`POST /openapi/spreadsheet/v3/files/{fileId}/batchUpdate`，`Content-Type: application/json`，`requests` 单次操作数 ≤ 5（https://docs.qq.com/open/document/app/openapi/v3/sheet/batchupdate/update.html ）。冒烟调用计入「自 2025-07-01 起每应用限免 20000 次 API」额度（https://docs.qq.com/open/document/app/ ），并受文件操作 `openID 300 次 / 分钟` 频控（https://docs.qq.com/open/document/app/openapi/v2/frequency_control.html ）。
