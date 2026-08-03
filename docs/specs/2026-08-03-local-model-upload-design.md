# 首页本地模型上传 — 设计方案

> 日期：2026-08-03
> 范围：首页 CTA 双入口、聊天记录/本地文件选 GLB、viewer 本地路径传参、渲染器本地读取分支、分包预加载
> 前置背景：model-viewer 渲染器已支持 GLB（GLTFLoader parse 模式，纹理链路已验证），本次在其上新增"本地文件"数据源，渲染管线完全复用

---

## 一、背景与目标

用户希望从**微信聊天记录**或**本地文件**中选择 3D 模型文件，在小程序内完成渲染预览，上传入口放在首页。

**已确认的产品决策：**

| 决策项 | 结论 |
|---|---|
| 功能范围 | 仅本地渲染预览，不保存、不上传平台、不要求登录 |
| 支持格式 | 仅 GLB（自包含二进制，几何+纹理单文件，渲染器原生支持） |
| 入口形态 | 改造首页现有 CTA 横幅为双入口（上传模型 / 商家入驻） |
| 数据通道 | 临时路径直传（wxfile://tmp_xxx → URL 参数 → FileSystemManager.readFile） |

**目标：**

1. 首页提供"上传模型"入口，点击后选择来源（聊天记录 / 本地文件）
2. 选中的 GLB 文件直接进入 3D 查看器渲染（复用现有 model-viewer 管线）
3. 不影响现有 model-detail → viewer 的网络加载路径

---

## 二、方案概述与数据流

核心原则：**模型数据获取（网络 vs 本地）与渲染管线解耦**。现有 `wx.request` success 中的 `parse → 包围球取景 → 入场景` 逻辑抽为 `_parseAndRender(arrayBuffer)`，网络/本地两个分支只负责"拿到 ArrayBuffer"。

```
首页 CTA 双入口（"上传模型" / "商家入驻"）
  └─ 点"上传模型" → wx.showActionSheet
        ├─ 从微信聊天记录选择 → wx.chooseMessageFile({ count:1, type:'file', extension:['glb'] })
        └─ 从本地文件选择    → wx.chooseFile（基础库 <2.26.0 自动降级 chooseMessageFile）
  → 校验（扩展名 / 大小）
  → wx.loadSubpackage('subpackages/modelViewer') 预热（配合 preloadRule 双保险）
  → navigateTo /subpackages/modelViewer/pages/viewer/viewer?localPath=<tmpPath>&name=<文件名>

viewer 页面
  → 解析 localPath 参数 → <model-viewer local-path="...">

model-viewer 组件
  → wx.getFileSystemManager().readFile({ filePath, encoding:'' }) → ArrayBuffer
  → _parseAndRender(buffer) → GLTFLoader.parse → 包围球取景 → 渲染
```

---

## 三、新增工具模块 `miniprogram/utils/local-model.ts`

**职责**：本地 GLB 文件的选择与校验，纯函数与 UI 交互分离（校验可单测，交互在页面层）。

```typescript
/** 本地选中的模型文件 */
export interface LocalModelFile {
  path: string   // wxfile:// 临时路径（会话内有效）
  name: string   // 文件名（含扩展名）
  size: number   // 字节
}

/** 大小常量 */
export const MIN_FILE_SIZE = 1024        // 1KB，小于视为损坏
export const LARGE_FILE_WARN = 50 * 1024 * 1024  // 50MB，提示风险
export const MAX_FILE_SIZE = 100 * 1024 * 1024   // 100MB，chooseMessageFile 单文件上限

/**
 * 从微信聊天记录选择 GLB
 * - 用户取消 → resolve(null)（静默）
 * - 失败 → reject
 */
export function chooseModelFromChat(): Promise<LocalModelFile | null>

/**
 * 从系统文件选择器选择 GLB（wx.chooseFile，基础库 2.26.0+）
 * - 不支持 chooseFile 时降级 chooseModelFromChat()
 * - 用户取消 → resolve(null)（静默）
 */
export function chooseModelFromLocal(): Promise<LocalModelFile | null>

/**
 * 纯校验（同步）
 * - 扩展名非 .glb → { ok:false, error:'仅支持 GLB 格式' }
 * - size < 1KB        → { ok:false, error:'文件无效' }
 * - size > 100MB      → { ok:false, error:'文件超过 100MB 上限' }
 * - 其余              → { ok:true }
 */
export function validateGlbFile(file: LocalModelFile): { ok: boolean; error?: string }
```

**页面层交互规则**（首页调用方）：`validateGlbFile` 返回 `ok=false` 时 toast error 并中止；`size > 50MB` 时弹 `wx.showModal` 确认"文件较大，低配机型可能渲染失败，是否继续？"。

---

## 四、首页 CTA 双入口改造

**文件**：`pages/index/index.wxml` / `index.ts` / `index.wxss`

### UI 布局

现有"拥有自己的3D模型？立即入驻"单横幅改为双卡片 flex 布局：

```
┌──────────────────────────────────────────────┐
│ ┌─────────────────────┐ ┌───────────────────┐ │
│ │ ⬆️ 上传模型          │ │ 📦 商家入驻        │ │
│ │ 从聊天记录或本地文件   │ │ 拥有自己的3D模型？ │ │
│ │ 导入，立即 3D 预览    │ │ 获得专属展示位     │ │
│ └─────────────────────┘ └───────────────────┘ │
└──────────────────────────────────────────────┘
```

- 左卡片 `bindtap="onUploadModel"`，右卡片沿用现有 `onGoMerchant`
- 视觉基调与现有 CTA 一致（主色 `#4ecdc4` 渐变 / 圆角卡片）

### 交互流程（index.ts `onUploadModel`）

```
wx.showActionSheet(['从微信聊天记录选择', '从本地文件选择'])
  → file = await (chat | local) 选择函数；file === null → return（用户取消）
  → v = validateGlbFile(file)；!v.ok → wx.showToast(v.error) + return
  → size > 50MB → showModal 确认，取消则 return
  → wx.loadSubpackage({ name: 'subpackages/modelViewer' })（不阻塞跳转，fail 忽略）
  → wx.navigateTo({ url: '/subpackages/modelViewer/pages/viewer/viewer'
       + '?localPath=' + encodeURIComponent(file.path)
       + '&name=' + encodeURIComponent(file.name) })
```

---

## 五、viewer 页面传参

**文件**：`subpackages/modelViewer/pages/viewer/viewer.ts` / `viewer.wxml`

- `data` 增加 `localPath: ''`
- `onLoad` 解析新参数（与现有 modelUrl 解析一致）：

```typescript
const localPath = (options && options.localPath && decodeURIComponent(options.localPath)) || ''
this.setData({ modelName, modelUrl, modelId, localPath })
```

- wxml：`<model-viewer id="modelViewer" model-url="{{modelUrl}}" model-name="{{modelName}}" local-path="{{localPath}}" class="viewer-content" />`

---

## 六、model-viewer 渲染器改造

**文件**：`subpackages/modelViewer/components/model-viewer/model-viewer.ts`

### 1. properties 扩展

```typescript
properties: {
  modelUrl: { type: String, value: '' },
  modelName: { type: String, value: '' },
  localPath: { type: String, value: '' },   // 新增：本地临时文件路径
}
```

### 2. `_loadModel()` 拆双分支

```typescript
_loadModel() {
  const url = this.properties.modelUrl
  const localPath = this.properties.localPath
  if (!url && !localPath) { setData errorMsg '缺少模型地址'; return }
  if (!this.data._scoped) { /* 原 three 未就绪提示 */ return }

  // 超时保护（保留，本地读取异常挂起时兜底）
  // 本地分支
  if (localPath) {
    wx.getFileSystemManager().readFile({
      filePath: localPath,
      encoding: '',
      success: (res: any) => { this._parseAndRender(res.data as ArrayBuffer) },
      fail: (err: any) => { this._handleLoadError(new Error('本地文件读取失败：' + (err && err.errMsg ? err.errMsg : String(err)))) },
    })
    return
  }
  // 网络分支（原逻辑不变）
  wx.request({ url, method: 'GET', responseType: 'arraybuffer', success: ..., fail: ... })
}
```

### 3. 抽取 `_parseAndRender(data: ArrayBuffer)`

把原 `wx.request.success` 中的 `GLTFLoader.parse → 模型入场景 → 包围球取景` 逻辑整体抽出，网络/本地两分支共用：

```typescript
_parseAndRender(data: ArrayBuffer) {
  const THREE = this.data._scoped!.THREE
  const loader = createGLTFLoader(THREE)
  loader.parse(data, '', (gltf) => { /* 原 onModelLoaded 逻辑 */ }, (err) => { /* 原错误处理 */ })
}
```

### 4. 错误与重试

- 本地读取失败文案："本地文件读取失败：<errMsg>"，进入现有 `_handleLoadError` 流程
- `onRetry` 复用：本地模式重试仍走 readFile（`_loadModel` 按 localPath 分支路由）
- 友好提示映射（超时/网络/解析）保持不变，本地读取失败不会误报"网络请求失败"

---

## 七、分包预加载优化

**文件**：`miniprogram/app.json`

`preloadRule` 增加首页（与 model-detail 一致），保证首页首次跳转 viewer 秒开：

```json
"preloadRule": {
  "pages/model-detail/model-detail": {
    "network": "all",
    "packages": ["subpackages/modelViewer"]
  },
  "pages/index/index": {
    "network": "all",
    "packages": ["subpackages/modelViewer"]
  }
}
```

双保险：preloadRule（静态声明）+ 首页 `wx.loadSubpackage`（选择文件期间并行预热，失败忽略）。

---

## 八、错误处理矩阵

| 场景 | 处理 |
|---|---|
| 用户取消选择 | 静默返回，无提示 |
| 选了非 .glb 文件 | extension 过滤拦截 + `validateGlbFile` 兜底："仅支持 GLB 格式" |
| 文件 < 1KB | 视为损坏，拒绝："文件无效" |
| 文件 > 100MB | 拒绝："文件超过 100MB 上限" |
| 文件 50–100MB | showModal 确认："文件较大，低配机型可能渲染失败，是否继续？" |
| readFile 失败 | 错误 UI + 重试（onRetry 复用，本地模式重走 readFile） |
| GLB 解析失败（损坏文件） | 现有错误 UI + 重试 |
| 分包首次加载慢 | preloadRule + loadSubpackage 双保险 |
| 返回后再次进入 | 现有"清理三保险"（onBack/onUnload/detached）不受影响 |

---

## 九、测试计划

| 场景 | 方式 | 预期 |
|---|---|---|
| 聊天记录选择渲染 | 开发者工具 chooseMessageFile 模拟选择测试 GLB（Duck.glb） | 渲染正常、纹理正常 |
| 本地文件选择渲染 | 真机 iOS 文件 App / Android 文件管理器（chooseFile） | 渲染正常 |
| 网络加载回归 | model-detail → viewer | 原有 wx.request 路径不受影响 |
| 取消选择 | 选择面板直接返回 | 无报错、无多余 toast |
| 超大文件 | 构造 >100MB 文件 | 拒绝并提示 |
| 损坏 GLB | 篡改文件头 | 错误 UI + 重试可用 |
| 首次进入分包 | 清缓存后从首页进入 | 预热生效，无长时间白屏 |

---

## 十、风险与边界

1. **临时文件生命周期**：`wxfile://tmp_xxx` 会话内有效，本次"仅预览"场景够用；不做持久化拷贝（YAGNI）
2. **内存限制**：50MB+ GLB 读取为 ArrayBuffer 后在低配机型可能 OOM，已用 50MB 确认 + 100MB 硬上限兜底
3. **wx.chooseFile 兼容性**：基础库 2.26.0+；低版本降级到 chooseMessageFile（其选择面板也含"手机文件"来源，覆盖本地文件诉求）
4. **GLTF 外部资源**：仅支持 GLB 单文件；含外部 .bin/纹理引用的 GLTF 不在本期范围，extension 过滤已收窄避免误导
5. **obsolete 日志**：渲染器现有 `[gltf-diag]` 等调试日志不随本期清理（见 2026-08-03-model-viewer-report 遗留项）

---

## 十一、明确不做的事（YAGNI）

- ❌ 上传发布到平台（复用 /upload/model + model-edit 流程）—— 本期仅本地预览
- ❌ OBJ/STL 格式支持 —— 需额外转换 OBJLoader/STLLoader，后续迭代
- ❌ 本地模型历史 / 我的模型库 —— 临时文件不持久化
- ❌ GLTF 外部资源（.bin/纹理）加载 —— 需自定义 FileLoader 桥接
- ❌ 登录门控 —— 本地渲染预览无需登录
