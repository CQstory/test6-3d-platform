# model-viewer 3D 渲染重构 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 three@0.162.0（npm 引入）+ model-viewer 组件化渲染器重构 3D 查看器，根治"从 viewer 返回 detail 后小程序卡死"问题，并用 USE_MOCK 双轨解禁登录支持后端未上线时的真机验证

**Architecture:** 三层依赖（页面 viewer → 组件 model-viewer → lib 库），渲染器自包含在组件内，canvas 在组件内部，分包 subpackages/modelViewer 承载

**Tech Stack:** three@0.162.0, TypeScript, 微信小程序原生框架（分包 + preloadRule）

## Global Constraints

- three@0.162.0（WebGL1/2 双端兼容，适配最多机型；r163+ 官方移除 WebGL1）
- 适配层必须局部作用域注入（createScopedShim），**禁止写全局对象**（替代旧 weapp-adapter 全量全局污染）
- 清理三保险（top-bar 预清理 → 页面 onUnload → 组件 detached），每次 cleanup 幂等（_cleanedUp 标记）
- 清理链必须包含 `renderer.forceContextLoss()` 与纹理显式 dispose（material.dispose 不释放 texture）
- 渲染循环用 `canvas.requestAnimationFrame`，禁止全局 setTimeout 模拟 rAF
- 相机：球坐标轨道（θ 无限制、φ 钳位 0.15π~0.85π、r 钳位 [0.5×radius, 3×radius]），包围球自动取景占屏宽度 2/3~3/4（默认 0.7）
- npm 引用必须用包名路径（require('three')），相对路径 require miniprogram_npm 内文件不被解析
- USE_MOCK 双轨：model-detail 登录拦截仅真实环境（!USE_MOCK）生效

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `package.json` | 修改 | 新增 three@0.162.0 依赖 |
| `scripts/fix-three-cjs.js` | 新建 | three.cjs → three.js + 改 package.json main/type（幂等） |
| `scripts/convert-three-addons.js` | 新建 | GLTFLoader 等 ESM → CJS 转换，输出 addons-cjs/ |
| `subpackages/modelViewer/lib/weapp-shim.ts` | 新建 | 适配层：createScopedShim(canvas) 局部 shim |
| `subpackages/modelViewer/lib/create-scoped-three.ts` | 新建 | 绑定层：createScopedThreejs(canvas) → THREE |
| `subpackages/modelViewer/lib/gltf-loader.ts` | 新建 | GLTFLoader CJS 工厂 + parse() 模式封装 |
| `subpackages/modelViewer/components/model-viewer/model-viewer.json` | 新建 | 渲染器组件配置 |
| `subpackages/modelViewer/components/model-viewer/model-viewer.ts` | 新建 | 组件逻辑：生命周期 + 渲染 + 清理链 |
| `subpackages/modelViewer/components/model-viewer/model-viewer.wxml` | 新建 | canvas + loading/error UI |
| `subpackages/modelViewer/components/model-viewer/model-viewer.wxss` | 新建 | 组件样式 |
| `subpackages/modelViewer/pages/viewer/viewer.json` | 新建 | 页面配置（注册组件） |
| `subpackages/modelViewer/pages/viewer/viewer.ts` | 新建 | 页面逻辑：传参 + 返回预清理 |
| `subpackages/modelViewer/pages/viewer/viewer.wxml` | 新建 | top-bar + model-viewer |
| `subpackages/modelViewer/pages/viewer/viewer.wxss` | 新建 | 页面样式 |
| `miniprogram/app.json` | 修改 | 恢复 subPackages + preloadRule |
| `miniprogram/services/config.ts` | 修改 | USE_MOCK = true |
| `miniprogram/pages/model-detail/model-detail.ts` | 修改 | 登录解禁 + 恢复 onView3D |
| `miniprogram/pages/model-detail/model-detail.wxml` | 修改 | 恢复 3D 查看按钮 |
| `miniprogram/pages/model-detail/model-detail.wxss` | 修改 | 恢复 btn-3d/action-bar 样式 |

---

### Task 1: 依赖安装与构建脚本

**Files:**
- Modify: `package.json`
- Create: `scripts/fix-three-cjs.js`
- Create: `scripts/convert-three-addons.js`

**Interfaces:**
- Produces: three 依赖、幂等构建脚本（.cjs 入口修复 + addons ESM→CJS）

- [x] **Step 1: 安装 three@0.162.0**

```bash
npm install three@0.162.0
```

- [x] **Step 2: 新建 scripts/fix-three-cjs.js**

微信"构建 npm"不识别 .cjs 入口（已验证经验）。脚本幂等：
- 复制 `node_modules/three/build/three.cjs` → `three.js`
- 改 `node_modules/three/package.json`：main 指向 `./build/three.js`、移除 `type: module`（记录原始值便于还原）
- 幂等：已处理则跳过

- [x] **Step 3: 新建 scripts/convert-three-addons.js**

将 GLTFLoader 等必要 addons 从 ESM 转 CJS：
- 输入：`node_modules/three/examples/jsm/loaders/GLTFLoader.js` 及依赖（DRACOLoader 等按需）
- 转换：import → require（相对路径映射包内绝对路径）、export → module.exports
- **延迟 require three**（函数内 require），避免顶层解构 null 崩溃（已验证经验）
- 输出：`node_modules/three/build/addons-cjs/` 下同名 .js
- 幂等：目标已存在且较新则跳过

- [x] **Step 4: 验证构建脚本**

```bash
node scripts/fix-three-cjs.js
node scripts/convert-three-addons.js
node --check 生成的 addons-cjs/GLTFLoader.js
```

---

### Task 2: 适配层 + 绑定层（lib/）

**Files:**
- Create: `miniprogram/subpackages/modelViewer/lib/weapp-shim.ts`
- Create: `miniprogram/subpackages/modelViewer/lib/create-scoped-three.ts`
- Create: `miniprogram/subpackages/modelViewer/lib/gltf-loader.ts`

**Interfaces:**
- Produces: `createScopedShim(canvas) → shim`、`createScopedThreejs(canvas) → THREE`、`createGLTFLoader(THREE) → loader`

- [x] **Step 1: lib/weapp-shim.ts — 局部适配层**

`createScopedShim(canvas)` 返回局部环境对象（绝不写全局）：
- `document.createElement('canvas')` → `wx.createOffscreenCanvas({ type: 'webgl' })`
- `document.createElement('img')` → `canvas.createImage()`
- `Image` 类桥接 `canvas.createImage()`
- `requestAnimationFrame/cancelAnimationFrame` → 优先 `canvas.requestAnimationFrame`
- `TextDecoder/TextEncoder` polyfill（GLTFLoader 需要，JSCore 无原生）
- `Blob` polyfill（GLB 内嵌贴图关键路径）

- [x] **Step 2: lib/create-scoped-three.ts — three 绑定层**

`createScopedThreejs(canvas)`：
1. 调 `createScopedShim(canvas)` 造局部环境
2. `require('three')`（包名路径，运行时映射 miniprogram_npm）
3. 返回绑定到该 canvas 的 THREE 命名空间（Renderer 构造时传入 `{ canvas, context }`）
4. 记录 `THREE.REVISION` 与 webgl2 探测结果

- [x] **Step 3: lib/gltf-loader.ts — GLTFLoader 工厂**

`createGLTFLoader(THREE)`：
- 函数内 `require('three/build/addons-cjs/GLTFLoader.js')`（延迟加载）
- 用 `parse(buffer, '', cb)` 模式加载（绕开 fetch/XHR），二进制由调用方 wx.request arraybuffer 获取

---

### Task 3: model-viewer 渲染器组件

**Files:**
- Create: `miniprogram/subpackages/modelViewer/components/model-viewer/model-viewer.json`
- Create: `miniprogram/subpackages/modelViewer/components/model-viewer/model-viewer.ts`
- Create: `miniprogram/subpackages/modelViewer/components/model-viewer/model-viewer.wxml`
- Create: `miniprogram/subpackages/modelViewer/components/model-viewer/model-viewer.wxss`

**Interfaces:**
- Properties: `modelUrl: String`、`modelName: String`
- Methods: `cleanup()`（页面/兜底调用，幂等）
- Produces: 渲染器（scene/camera/renderer/加载/交互/清理）

- [x] **Step 1: 组件骨架（json/wxml/wxss）**

- json：`{ "component": true }`
- wxml：canvas（id="glCanvas"，type="webgl"，wx:if="{{canvasVisible}}"）+ loading 覆盖层 + 错误提示 + 模型名标题
- wxss：canvas 占满组件（100% × 100%），覆盖层绝对定位

- [x] **Step 2: 组件生命周期与初始化**

- `lifetimes.ready`：SelectorQuery 取 canvas node → 补 canvas.style/clientWidth 等最小属性 → `getContext('webgl', { antialias, alpha, depth, stencil, preserveDrawingBuffer: false, powerPreference: 'high-performance' })` → `createScopedThreejs(canvas)` → 建 scene/camera/renderer（ACESFilmicToneMapping + SRGBColorSpace）→ 加载模型 → 包围球自动取景 → startLoop
- `pageLifetimes.show` → startLoop；`pageLifetimes.hide` → stopLoop
- `lifetimes.detached` → `_cleanup()`

- [x] **Step 3: 模型加载（GLTFLoader parse 模式）**

- `wx.request({ url, responseType: 'arraybuffer' })` 下载
- `createGLTFLoader(THREE)` → `loader.parse(buffer, '', cb)` → 模型入场景 → 包围盒/包围球 → 相机取景（占屏 0.7，clamp [0.5r, 3r]）
- 加载超时（30s）与重试（3 次，1.5s 递增延迟）

- [x] **Step 4: 相机轨道与手势**

- 球坐标：θ（无限制）、φ（clamp 0.15π~0.85π）、r（clamp [minDist, maxDist]），目标值 lerp 阻尼
- 单指拖动旋转：`θ += dx×0.008`、`φ += dy×0.008`；松手惯性衰减（0.95ⁿ）
- 双指捏合缩放：`r = startR × (起始间距/当前间距)`
- 自动旋转：默认开启，手势介入暂停，2s 无操作恢复；toggle 开关
- 初始距离 `d = radius / (0.7 × tan(hFov/2))`，hFov 由竖屏 aspect 换算

- [x] **Step 5: 清理链（根治卡死）**

`cleanup()` / `_cleanup()`（幂等）：
1. stopLoop（cancel rAF）
2. scene.traverse：geometry/material/**texture** 全量 dispose，texture.image 置空
3. `renderer.dispose()` + **`renderer.forceContextLoss()`**
4. setData 隐藏 canvas 节点（`canvasVisible: false`，触发 WebView 销毁 GL 图层）
5. 全部引用置 null，`_cleanedUp = true`

---

### Task 4: viewer 页面

**Files:**
- Create: `miniprogram/subpackages/modelViewer/pages/viewer/viewer.json`
- Create: `miniprogram/subpackages/modelViewer/pages/viewer/viewer.ts`
- Create: `miniprogram/subpackages/modelViewer/pages/viewer/viewer.wxml`
- Create: `miniprogram/subpackages/modelViewer/pages/viewer/viewer.wxss`

**Interfaces:**
- Input: options `id/name/modelUrl`（encodeURIComponent 传入）
- Produces: 页面（top-bar + model-viewer，返回三保险）

- [x] **Step 1: 页面骨架（json/wxml/wxss）**

- json：注册 `model-viewer` 组件（`../../components/model-viewer/model-viewer`）；top-bar 若主包组件可被分包页面引用则注册，否则页面自带返回栏
- wxml：top-bar（title="{{modelName || '3D 查看器'}}"，showBack）+ model-viewer（id="modelViewer"，占满剩余）
- wxss：页面黑底，model-viewer flex:1

- [x] **Step 2: 页面逻辑**

- `onLoad(options)`：解析 id/name/modelUrl（decodeURIComponent）→ setData 传给组件
- 返回处理：`onBack()` → `selectComponent('#modelViewer').cleanup()` → `wx.navigateBack`（fail 兜底 switchTab 主页）
- `onUnload()`：兜底 `selectComponent('#modelViewer').cleanup()`（幂等，防绕过 onBack 的系统返回）

---

### Task 5: 分包注册 + 接入 model-detail + 登录解禁

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/services/config.ts`
- Modify: `miniprogram/pages/model-detail/model-detail.ts`
- Modify: `miniprogram/pages/model-detail/model-detail.wxml`
- Modify: `miniprogram/pages/model-detail/model-detail.wxss`

**Interfaces:**
- Produces: 分包 + preloadRule、USE_MOCK=true、登录解禁、3D 查看入口

- [x] **Step 1: app.json 恢复分包与预加载**

```json
"subPackages": [{ "root": "subpackages/modelViewer", "pages": ["pages/viewer/viewer"] }],
"preloadRule": {
  "pages/model-detail/model-detail": { "network": "all", "packages": ["subpackages/modelViewer"] }
}
```

- [x] **Step 2: config.ts 开启 Mock**

`USE_MOCK = true`

- [x] **Step 3: model-detail 登录解禁 + 恢复 3D 入口**

- 登录拦截：`if (!USE_MOCK && !userService.isLoggedIn())`
- 恢复 `onView3D()`：navigateTo `subpackages/modelViewer/pages/viewer/viewer?id=..&name=..&modelUrl=..`（encodeURIComponent）
- wxml 恢复 action-bar + btn-3d 按钮；wxss 恢复样式

---

### Task 6: 编译验证

**Files:**
- Run: `npx tsc --noEmit -p tsconfig.json`

- [x] **Step 1: TypeScript 编译检查**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [x] **Step 2: 残留引用检查**

```bash
# 确认无 weapp-adapter / 旧全局 shim 残留引用
grep -ri "weapp-adapter" miniprogram/ --include="*.ts" --include="*.js"
```

- [ ] **Step 3: 真机测试清单**

1. detail → 3D 查看 → 模型渲染（旋转/缩放/自动旋转）
2. **返回 detail → 页面可正常触摸交互（卡死验收项）**
3. 反复进出 viewer 5 次无卡死、内存无持续上涨
4. 后台/前台切换渲染循环正确暂停恢复
5. console 确认 webgl2 探测结果 → 记录版本结论（r162 终版 or 可升级 r185）

## Assumptions

- 主包组件（top-bar）可被分包页面引用；若不允许，viewer 页自带轻量返回栏
- three@0.162.0 的 npm 包结构与已验证经验一致（.cjs 入口 + type:module 需脚本处理）
- 小程序真机支持 canvas type="webgl" 同层渲染（官方文档确认 2.9.0+）
