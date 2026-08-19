# three.js 适配层进程污染问题解释报告

> 日期：2026-08-09
> 范围：git 提交 `d2f8388`（2026-07-25，"后端直连数据库,bug为退出three.js的卡死问题"）中导致"退出 three.js 后进程污染/卡死"的根因分析，重点排查 three.js 适配层
> 前置背景：旧架构（r152 本地 bundle + weapp-adapter + 分包）因"从 viewer 返回 detail 后小程序卡死"被整体移除；本报告解释该卡死的进程污染机制，供后续架构审计与回归参考

## 一、问题定义

**进程污染**：小程序逻辑层的全局对象（`globalThis` 及其 `window/self/document/XMLHttpRequest/Image/URL/Blob/requestAnimationFrame` 等）被第三方代码**一次性、不可逆地改写**，改写后：

1. 页面销毁、模块卸载均无法还原（无 restore 机制）；
2. 污染持续到整个进程（IDE 模拟器 / 真机 JS 运行时）结束；
3. 进程内其他页面与 IDE 内部工具链运行在被污染的环境上，表现为卡死、白屏、请求异常。

## 二、污染入口（触发操作）

`miniprogram/subpackages/modelViewer/pages/viewer/viewer.ts` 模块顶层：

```ts
const __adapter = require('../../adapters/weapp-adapter')   // 第 8 行，模块加载即执行
```

**只要进入 viewer 页面，weapp-adapter 的顶层副作用立即执行**。小程序运行时对模块的 require 缓存使该副作用在进程生命周期内只执行一次，但**全局写入不会因页面退出而还原**——这是污染不可逆的直接原因。

## 三、适配层污染操作清单（weapp-adapter.js，按危害排序）

weapp-adapter.js 在模块顶层（非函数内）完成以下全局写入：

| # | 操作 | 代码位置 | 危害 |
|---|------|----------|------|
| 1 | `var g = globalThis`，随后 `g.window = g`、`g.self = g`（条件） | 文件顶部 | 拿到并直接操作真实全局对象；后续所有 `win.xxx` 写入即全局写入 |
| 2 | `win.XMLHttpRequest = FakeXMLHttpRequest` | 第 7 节（无条件） | **最危险**：全局 XHR 被替换为基于 `wx.request` 的假实现，响应结构/时序/状态码语义与标准 XHR 完全不同，IDE 内部工具链与其他页面的所有 XHR 请求错乱 |
| 3 | `win.Image = createFakeImage` | 第 7 节（无条件） | 全局 Image 构造器被替换，后续创建的 Image 均为假对象（onload 用 setTimeout 模拟或永不触发） |
| 4 | `win.innerWidth = 375`、`win.innerHeight = 667`、`win.devicePixelRatio = 2`、`win.screen = {...}`、`win.location = {...}` | 第 8 节（无条件写死） | 覆盖 IDE 真实尺寸/URL 信息，其他页面与 IDE 内部代码读到错误值 |
| 5 | `win.requestAnimationFrame = g.requestAnimationFrame`（16ms setTimeout 版） | 第 7/8 节（无条件） | 原生 rAF 被替换为定时器轮询；且 fake 内 `try { cb() } catch(e) {}` **吞掉渲染循环所有异常**，故障无法暴露 |
| 6 | `g.document = _doc`、`g.navigator = {...}`（条件） | 文件顶部 | 用假 document/navigator 填充全局；本提交虽为 `_doc` 增加 `toString/location/URL` 等字段以缓解 IDE 内部路径解析崩溃，但仅修了 document，Image/XHR/location 等仍为无条件覆盖 |
| 7 | `g.Blob` / `g.TextDecoder` / `g.TextEncoder` / `g.atob` / `g.btoa` / `g.URL`（条件 polyfill） | 第 6/7 节 | 假 Blob 仅含 `_data`（无 size/slice/arrayBuffer），假 URL 仅含 createObjectURL/revokeObjectURL |
| 8 | three-bundle 顶层 `window.__THREE__ = REVISION` | three-bundle.js 末尾 | 因 `window === global`，向全局写入 `__THREE__` 属性（轻微） |

**结构性缺陷**：`module.exports` 仅导出 `updateScreenSize / createImage / downloadBinary / downloadImage`，**不存在任何 restore/unmount 接口**——污染从设计上不可逆。

## 四、退出页面后污染持续生效的机制

`viewer.ts` 的 `_cleanup()`（onBack / onUnload 触发）只做了：`_stopLoop()` → `renderer.dispose()` → `scene.traverse` 中 `geometry/material.dispose()` → 引用置空。**没有任何全局还原步骤**。因此：

1. **全局污染残留**：退出后 IDE 与后续页面仍使用被替换的 `XMLHttpRequest / Image / location / rAF`，行为持续错乱，表现为"退出 three.js 后卡死"。
2. **渲染循环停不下来（竞态）**：`_startLoop` 的 `loop` 内先 `this._rafId = 0` 再 `_scheduleFrame()`；若 `_stopLoop()` 恰在两者之间被调用，`_rafId === 0` 使取消分支被跳过，16ms 定时器循环永不停止，且闭包持有 Page 实例导致页面无法 GC。
3. **加载链在页面销毁后仍运行**：`_cleanup()` 未清除 `_loadTimeoutId`（30s 超时定时器）；`_handleLoadError` 中的重试 `setTimeout(() => this._loadModel(), delay)` 未保存句柄无法取消。页面销毁后下载、GLB 解析、`canvas.createImage()` 建纹理仍继续执行（weapp-adapter 下载另有 30~35s 超时链），反复创建网络/GPU 资源。
4. **GL 资源释放不完整**：`_cleanup()` 无 `forceContextLoss()`，WebGL 上下文不释放；scene.traverse 仅 dispose geometry/material，**无显式 `texture.dispose()`**，GLB 内嵌贴图的 GPU 纹理每次进出页面泄漏一批，内存持续增长。

## 五、与本提交修复尝试的关系

本提交（d2f8388）的适配层改动是**对污染的部分缓解，而非根治**：

- ✅ 为 `_doc` 增加 `toString` / `location` / `URL` / `baseURI` 等字段，缓解 IDE 将 document 转 URL 时 `[object Object]` 崩溃；
- ✅ `win.document` 改为条件设置（不覆盖 IDE 已有 document）——但因 `win === g`，与顶部 `g.document` 的条件检查实为同一判断，仅生效一次；
- ✅ 下载逻辑增强（Buffer → ArrayBuffer 转换、下载失败回退 wx.request）。

但 **Image / XMLHttpRequest / location / innerWidth / rAF 的无条件覆盖、无还原机制、渲染循环与加载链的失控**均未处理，进程污染根因依旧。

## 六、后续修复对照（2026-08-03 重构已验证）

新架构（`lib/weapp-shim.ts` + `components/model-viewer` + `create-scoped-three.ts`）的根治方案：

1. **可逆最小全局注入**：`trySetGlobal` 三级降级（赋值 → `defineProperty` → 保留全局），仅注入 three 必需项，不碰 XHR/location 等；
2. **清理三保险**：页面 onBack 预清理 → onUnload 兜底 → 组件 detached（全部幂等），含 `forceContextLoss` + 纹理全量 dispose + 隐藏 canvas 节点；
3. **渲染循环收敛**：渲染循环生命周期与组件生命周期绑定，退出即停；
4. **验证结论**：返回 detail 不再卡死，纹理链路（`_dispatch` 用 `fn.call(this, e)` 修复 ImageLoader `this` 丢失）已打通。

## 七、结论

| 项 | 结论 |
|----|------|
| 进程污染是否存在 | 是（d2f8388 版本） |
| 直接原因 | weapp-adapter 模块顶层不可逆全局注入（`XMLHttpRequest/Image/location/rAF` 无条件覆盖） |
| 触发操作 | 进入 viewer 页面 → `viewer.ts` 顶层 `require('weapp-adapter')` |
| 恶化因素 | 渲染循环竞态不停 + 加载重试链未取消 + WebGL 上下文/纹理未释放 |
| 为何退出后仍卡死 | 全局污染无还原机制，持续到进程结束 |
| 是否已根治 | 是（2026-08-03 重构，本报告作为历史根因留档） |
