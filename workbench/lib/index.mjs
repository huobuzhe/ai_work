// dsh-workbench 宿主入口（bundle 主入口）。
//
// 为什么需要这个文件：DSH 宿主按 package.json 的 `main` 把每个 bundle 当作一个
// **宿主侧插件模块**加载，要求它是 ESM、默认导出 `{ name, apply(ctx) }`（或等价的
// 具名导出 name/inject/apply）。dsh-workbench 之前 `main` 指向纯引擎 lib/engine.js
// （CommonJS、无宿主入口），所以能被 require 做库用、却不能被宿主当作插件挂进 profile。
//
// 设计取舍：
//  - 包整体仍是 `"type": "commonjs"`（引擎/适配器/测试全是 CJS，不动）；本文件用
//    `.mjs` 后缀强制 ESM，只作宿主入口，不改变引擎的 CommonJS 性质。
//  - `apply()` 里**不重复注册面板**：面板的右栏 tab 与预览卡 body 由 client bundle
//    （client/client.js，经 package.json 的 `dsh.client.platform=web` 由宿主加载）
//    里的 registerWorkbenchPanel 自注册。宿主入口只满足加载契约、不抢注册责任，
//    避免「宿主侧 + 客户端侧」两边都注册造成重复挂载。
//  - 引擎能力通过 `exports["./engine"]` 与 `exports["."]` 两路仍可用（见 package.json），
//    故把 main 从 engine.js 换成 index.mjs 不影响任何 require('dsh-workbench/lib/engine') 用法。

/** 插件名（与 cordis.patch.yml 的 insert.id/name 对齐）。 */
export const name = 'dsh-workbench';

/**
 * bundle 宿主挂载点。
 *
 * 本插件是「纯 seam 引擎 + 客户端面板」结构：宿主侧没有额外服务/路由/工具要注册，
 * 面板挂载完全由 client bundle 承担。故 apply 只做一件事——挂一个空 dispose，
 * 保持插件生命周期整洁（宿主卸载时随 effect 一起释放）。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx 宿主上下文
 */
export function apply(ctx) {
  // 无宿主侧资源需要持有；注册一个空 effect 让生命周期可追踪、可释放。
  if (ctx && typeof ctx.effect === 'function') {
    ctx.effect(() => () => { /* nothing to dispose：面板由 client bundle 管理 */ });
  }
}

export default { name, apply };
