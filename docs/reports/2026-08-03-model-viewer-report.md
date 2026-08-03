# model-viewer 3D 渲染重构 — 实施报告

> 日期：2026-08-03
> 范围：three.js 重新引入、组件化渲染器、纹理链路打通、卡死问题根治、登录门控恢复
> 前置背景：上次 3D 渲染（r152 本地 bundle + weapp-adapter）因"从 viewer 返回 detail 后小程序卡死"被整体移除；本次以新架构重新引入并修复根因

## 一、目标

1. 以 three@0.162.0（npm 引入）重建 3D 模型查看器
2. 根治"从 viewer 返回 detail 后小程序卡死"问题（上次移除的核心原因）
3. 打通 GLB 纹理加载链路（几何曾可用、纹理一直失败）
4. 组件化渲染器架构（页面 → 组件 → lib 三层）
5. 登录门控临时解禁以支持后端未上线时的真机验证，验证完成后恢复

## 二、架构方案

```
miniprogram/subpackages/modelViewer/
├── pages/viewer/                    # 页面：传参 + 返回三保险前两保险
├── components/model-viewer/         # 渲染器组件：canvas + 渲染 + 清理链（私有状态放 data）
└── lib/
    ├── weapp-shim.ts                # 可逆最小全局注入（document/Image/Blob/URL/TextDecoder/rAF）
    ├── create-scoped-three.ts       # createScopedThreejs(canvas)：three 绑定层
    ├── gltf-loader.ts               # GLTFLoader CJS 工厂（延迟 require）
    └── vendor/                      # 转换产物（GLTFLoader/BufferGeometryUtils ESM→CJS）
```

**关键决策**：
- 版本 `three@0.162.0`：WebGL1/2 双端兼容（r163 起官方移除 WebGL1），适配最多机型；真机探测确认 `webgl2: false`，r162 为正确选择
- 渲染器组件化：canvas 在组件内，three 实例生命周期 = 组件生命周期
- 清理三保险：页面 onBack 预清理 → onUnload 兜底 → 组件 detached（全部幂等）
- 相机：球坐标轨道（θ 无限制、φ 钳位 0.15π~0.85π、r 基于包围球 [0.5r, 3r]）+ 包围球自动取景占屏 2/3~3/4
- 分包 `subpackages/modelViewer` + preloadRule（detail 页进入预加载）

## 三、遇到的问题与解决方案

| # | 问题 | 根因 | 解决方案 |
|---|------|------|----------|
| 1 | `Component is not found in path "wx://not-found"` | 微信自动热重载不编译**新增**分包/页面/组件 | 手动点"编译"（或清缓存重新编译） |
| 2 | `Cannot set property document of #<Window> which has only a getter` | 基础库 3.x 逻辑层全局对象是 `#<Window>`，`document` 为只读 getter | `trySetGlobal` 安全注入：赋值 → `defineProperty` → 保留全局（三级降级） |
| 3 | `Invalid context type [webgl2]` | 真机/工具只支持 WebGL 1.0 | 探测确认 `webgl2: false`，锁定 r162 |
| 4 | `canvas.addEventListener is not a function` | three WebGLRenderer 构造时监听 contextlost | canvas 节点补 `addEventListener/removeEventListener/dispatchEvent`（no-op） |
| 5 | `Cannot read property 'URL' of undefined` | 微信模块包裹函数的 `self` 参数为 null/undefined，GLTFLoader 裸引用 `self.URL` | 转换脚本替换为 `globalThis.URL`（绕过模块参数遮蔽） |
| 6 | `Failed to execute 'createObjectURL' on 'URL': Overload resolution failed` | 原生 `URL.createObjectURL` 是 WebIDL 方法只接受原生 Blob，MiniBlob 参数类型校验失败 | 无条件覆盖原生 `URL.createObjectURL/revokeObjectURL`（赋值→defineProperty→整体替换 URL） |
| 7 | `Texture marked for update but no image data found`（texture.image = null，**核心问题**） | ① ScopedImage 缺 `addEventListener`（three ImageLoader 用事件监听）；② **ImageLoader 的 `onImageLoad` 依赖 `this` 指向 image**（`onLoad(this)` + `Cache.add(url, this)`），但我们的 `_dispatch` 用 `fn(e)` 普通调用导致 `this` 丢失 | ① ScopedImage 实现 `addEventListener/removeEventListener`；② **`_dispatch` 改用 `fn.call(this, e)` 绑定 this 为 ScopedImage**（最终根因） |
| 8 | `renderer.dispose: Cannot read property 'cancelAnimationFrame' of null` | 微信模块包裹函数 `self` 参数为 null（`typeof null === 'object'` 骗过 three 检查）→ `setContext(null)`；且 WebGLAnimation.context 默认就是 null | patch three 主库：`setContext` 加 `self !== null` 守卫 + `stop` 加 context 空值保护 |
| 9 | 纹理警告每帧刷屏 | `setTexture2D` 对同一纹理每帧警告 | patch three 主库：`_warnedNoImage` Set 去重（每个纹理只警告一次） |
| 10 | GLTFLoader 转换产物打不进 miniprogram_npm | 微信"构建 npm"不追踪分包内 `require('three/build/...')` 子路径 | 转换产物输出到分包 `lib/vendor/`（项目文件，相对路径 require，随分包打包） |
| 11 | three 包 `.cjs` 入口不被"构建 npm"识别 | three@0.162.0 的 `main` 是 `build/three.cjs` + `type: module` | `scripts/fix-three-cjs.js`（幂等）：复制 `.cjs`→`.js`、改 `main`、移除 `type` |
| 12 | three 主库裸引用 `document.createElementNS` 而基础库 document frozen | 基础库 document 为 frozen 对象（无 createElementNS） | patch three 主库 `createElementNS`：回退 `new Image()`（ScopedImage）/离屏 canvas |
| 13 | `gl.texImage2D` 只接受 canvas.createImage() 原生对象 | ScopedImage 是包装对象，WebGL 无法识别 | patch three 主库 `WebGLState.texImage2D`：最后一个参数含 `_img` 时解包为原生对象上传 |
| 14 | examples/jsm 为 ESM，小程序 require 无法加载 | three 加载器是 ESM 模块 | `scripts/convert-three-addons.js`（幂等）：GLTFLoader/BufferGeometryUtils ESM→CJS，self.URL 替换，错误日志增强 |
| 15 | 登录门控阻断真机测试（后端未上线） | 后端未上线，API 数据不可用、登录无法通过 | 临时解禁：`USE_MOCK=true` + detail 页登录拦截仅真实环境生效；**验证完成后已恢复登录门控** |

## 四、最终成果

- ✅ GLB 模型渲染（几何 + 阴影 + **纹理**，Duck 512x512 贴图正常显示）
- ✅ 相机交互：水平旋转（左滑→俯视顺时针）、垂直视角（已按手感反转）、双指缩放、自动旋转、惯性
- ✅ 包围球自动取景：模型占屏幕宽度 2/3~3/4
- ✅ **返回 detail 不再卡死**（清理三保险 + forceContextLoss + 纹理全量 dispose）
- ✅ `renderer.dispose` 不再崩溃（WebGLAnimation 空值保护）
- ✅ 纹理警告不再刷屏（去重）
- ✅ 构建脚本幂等（npm install 后重跑即可）
- ✅ 登录门控已恢复

## 五、遗留与待办

| 项 | 说明 |
|---|---|
| 诊断日志清理 | `[gltf-diag]` / `ScopedImage` / `texture diag` / `createImage test` 等调试日志仍保留，稳定后可统一移除 |
| `USE_MOCK` 状态 | 当前 `true`（后端未上线数据 Mock）；**后端上线后改回 `false`** |
| npm install 后 | 需重跑 `node scripts/fix-three-cjs.js` + `node scripts/convert-three-addons.js`，再"构建 npm" |
| 机型覆盖 | 真机已验证（开发者工具 + 真机预览）；多机型（尤其老 Android）建议回归测试 |
| 升级评估 | 真机 `webgl2: false`，r162 为最终版本；若未来机型支持 WebGL2 可评估升级 r185 |

## 六、核心经验

1. **微信模块包裹函数遮蔽全局标识符**（self/document 等参数化），全局注入对模块内裸引用无效——需在转换/构建阶段改写源码或用 `globalThis`
2. **基础库 3.x 自带只读 Window/document**（为 Web 兼容注入），全局注入必须"安全降级"而非直接赋值
3. **three 内部对 image 对象的 this 绑定敏感**（ImageLoader `onImageLoad` 用 `this`）——自定义事件分发必须 `fn.call(this, e)`
4. **小程序 WebGL 纹理上传只认 canvas.createImage() 原生对象**——桥接对象需在上传点解包
5. **构建 npm 不追踪分包内 npm 子路径 require**——转换产物应放在分包内（项目文件）而非 node_modules
