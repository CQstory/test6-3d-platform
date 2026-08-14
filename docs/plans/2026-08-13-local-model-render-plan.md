# 首页本地 3D 模型选择与渲染实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首页 cta-banner 从「入驻引导」改为「本地 3D 模型渲染」入口；新增两个分包页面：模型文件选择页（缓冲页）+ 本地模型渲染页，复用现有 `model-viewer` 组件渲染从本地文件系统/微信聊天记录选择的 GLB/GLTF 模型。

**Architecture:** 页面链路为「首页 → model-pick 选择页 → model-render 渲染页」。选择页承担分包加载缓冲（用户选择文件期间分包已就绪，故**不新增 preloadRule**）；渲染页复用 `model-viewer` 组件，组件通过「修改模型文件路径」支持 `wxfile://` 本地路径：内部 `FileSystemManager.readFile` 读 ArrayBuffer 后走既有 `GLTFLoader.parse` 链路，远程 URL 分支保持不变。现有 `viewer` 页面与远程查看功能零改动。

**Tech Stack:** 微信小程序原生框架 + TypeScript + wxss(rpx)；无单测框架，验证方式为 `npx tsc --noEmit` + 微信开发者工具手动走查（真机验证选择文件）。

---

## Task 1: model-viewer 组件支持本地文件路径加载

**Files:**
- Modify: `miniprogram/subpackages/modelViewer/components/model-viewer/model-viewer.ts`

**Interfaces:**
- 内部方法新增：`_parseAndMount(data: ArrayBuffer)` — 抽取 `_loadModel` 中 GLTFLoader.parse + 模型挂载逻辑，远程/本地共用
- `_loadModel()` 加载分支：`modelUrl` 以 `wxfile://` 开头 → `FileSystemManager.readFile`（不传 encoding 返回 ArrayBuffer）；否则走原 `wx.request`（`http/https` 远程）
- `_handleLoadError(err, retry = true)` 增加第二参数：本地读取失败不自动重试（`retry: false`），由用户手动点组件自带「重试」按钮（`onRetry` → `_loadModel` 重新读取）
- `modelUrl` 为空：静默待命（`loading: false`、无 `errorMsg`），不再报「缺少模型地址」

**Steps:**

- [ ] **Step 1: 抽取 `_parseAndMount(data)`**

将 `_loadModel()` 中 `success` 回调内的以下逻辑（自 `try {` 起至 `loader.parse` 完整回调）抽为独立方法 `_parseAndMount(data: ArrayBuffer)`：

```ts
_parseAndMount(data: ArrayBuffer) {
  if (!data || !(data instanceof ArrayBuffer)) {
    this._handleLoadError(new Error('模型数据格式错误'))
    return
  }
  try {
    const THREE = this.data._scoped!.THREE
    const loader = createGLTFLoader(THREE)
    loader.parse(
      data,
      '',
      (gltf: any) => {
        if (this.data._loadTimeoutId) {
          clearTimeout(this.data._loadTimeoutId)
          this.data._loadTimeoutId = null
        }
        const model = (gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]))) || null
        if (!model) {
          this._handleLoadError(new Error('模型场景为空'))
          return
        }
        this._onModelLoaded(model)
      },
      (err: any) => {
        this._handleLoadError(err || new Error('模型解析失败'))
      }
    )
  } catch (e: any) {
    this._handleLoadError(e)
  }
}
```

- [ ] **Step 2: 改写 `_loadModel()` 为路径分支 + 空值静默**

```ts
_loadModel() {
  const url = this.properties.modelUrl
  if (!url) {
    // 空路径：静默待命（本地渲染页未选择文件时由页面空态遮盖，不报错）
    this.setData({ loading: false, errorMsg: '' })
    return
  }
  if (!this.data._scoped) {
    this.setData({ errorMsg: 'three 未就绪，请先执行"构建 npm"', loading: false })
    return
  }

  this.data._loadRetries = this.data._loadRetries || 0
  console.log('[model-viewer] loading model:', url, '(attempt ' + (this.data._loadRetries + 1) + ')')

  // 超时保护（本地读取极快，基本不触发）
  if (this.data._loadTimeoutId) clearTimeout(this.data._loadTimeoutId)
  this.data._loadTimeoutId = setTimeout(() => {
    this.data._loadTimeoutId = null
    this._handleLoadError(new Error('加载超时，请检查网络连接'))
  }, LOAD_TIMEOUT)

  // 本地/聊天记录临时文件（wxfile://）→ FileSystemManager.readFile 读 ArrayBuffer
  if (url.indexOf('wxfile://') === 0) {
    wx.getFileSystemManager().readFile({
      filePath: url,
      success: (res: any) => {
        this._parseAndMount(res && res.data)
      },
      fail: (err: any) => {
        this._handleLoadError(new Error(err && err.errMsg ? err.errMsg : '本地文件读取失败'), false)
      },
    })
    return
  }

  // 远程 URL → wx.request（原逻辑，成功回调改为调用 _parseAndMount）
  wx.request({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    success: (res: any) => {
      this._parseAndMount(res && res.data)
    },
    fail: (err: any) => {
      this._handleLoadError(new Error(err && err.errMsg ? err.errMsg : '网络请求失败'))
    },
  })
}
```

- [ ] **Step 3: `_handleLoadError` 支持关闭自动重试**

```ts
_handleLoadError(err: any, retry = true) {
  this.data._loadRetries = (this.data._loadRetries || 0) + 1
  const msg = err && err.message ? err.message : String(err)
  console.error('[model-viewer] load failed (attempt ' + this.data._loadRetries + '):', msg)

  if (retry && this.data._loadRetries <= MAX_LOAD_RETRIES) {
    const delay = LOAD_RETRY_DELAY * this.data._loadRetries
    this.setData({ progressText: '加载失败，重试中 (' + this.data._loadRetries + '/' + MAX_LOAD_RETRIES + ')...' })
    setTimeout(() => {
      this._loadModel()
    }, delay)
  } else {
    let friendly = '模型加载失败'
    if (msg.indexOf('timeout') >= 0 || msg.indexOf('超时') >= 0) friendly = '加载超时，请检查网络后重试'
    else if (msg.indexOf('fail') >= 0 || msg.indexOf('request') >= 0 || msg.indexOf('网络') >= 0) friendly = '网络请求失败，请检查域名配置或网络连接'
    else if (msg.indexOf('parse') >= 0 || msg.indexOf('解析') >= 0) friendly = '模型格式解析失败'
    this.setData({ loading: false, errorMsg: friendly + '\n(' + msg + ')' })
  }
}
```

- [ ] **Step 4: 验证类型**

Run: `npx tsc --noEmit`（工作目录 `d:\Code\benchuang\test6`）
Expected: exit code 0（仅组件一处改动，viewer 远程模式不应受影响）

- [ ] **Step 5: Commit**

```bash
git add miniprogram/subpackages/modelViewer/components/model-viewer/model-viewer.ts
git commit -m "feat(model-viewer): 支持 wxfile:// 本地文件路径加载（readFile + parse 共用链路）"
```

---

## Task 2: 新建 model-pick 模型文件选择页（缓冲页）

**Files:**
- Create: `miniprogram/subpackages/modelViewer/pages/model-pick/model-pick.json`
- Create: `miniprogram/subpackages/modelViewer/pages/model-pick/model-pick.ts`
- Create: `miniprogram/subpackages/modelViewer/pages/model-pick/model-pick.wxml`
- Create: `miniprogram/subpackages/modelViewer/pages/model-pick/model-pick.wxss`
- Modify: `miniprogram/app.json`（subPackages.modelViewer.pages 注册）

**Interfaces:**
- 页面 data：`fileName: ''`、`fileSizeText: ''`、`modelUrl: ''`、`picked: false`
- 页面方法：`onChooseFile()`、`onStartRender()`、`onBack()`
- 常量：`MAX_FILE_SIZE = 50 * 1024 * 1024`（50MB 上限）、扩展名白名单 `['glb', 'gltf']`
- 跳转契约（→ model-render）：`/subpackages/modelViewer/pages/model-render/model-render?modelUrl=<encodeURIComponent(path)>&name=<encodeURIComponent(name)>&size=<bytes>`

**Steps:**

- [ ] **Step 1: model-pick.json**

```json
{
  "navigationStyle": "custom",
  "usingComponents": {}
}
```

- [ ] **Step 2: model-pick.ts**

```ts
/** 模型文件选择页（缓冲页）：首页 → 选文件 → 跳渲染页 */
const MAX_FILE_SIZE = 50 * 1024 * 1024

Page({
  data: {
    fileName: '',
    fileSizeText: '',
    modelUrl: '',
    picked: false,
  },

  onBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' })
      },
    })
  },

  onChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      // 注意：extension 不带点（PC 端带点会失效）；鸿蒙系统存在后缀缺失 bug，下方 name 兜底校验
      extension: ['glb', 'gltf'],
      success: (res: any) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        const name = (file.name || 'model.glb') as string
        const lower = name.toLowerCase()
        if (!(lower.endsWith('.glb') || lower.endsWith('.gltf'))) {
          wx.showToast({ title: '请选择 .glb 或 .gltf 格式的 3D 模型文件', icon: 'none' })
          return
        }
        if (file.size > MAX_FILE_SIZE) {
          wx.showToast({ title: '文件超过 50MB 上限，请压缩后重试', icon: 'none' })
          return
        }
        this.setData({
          fileName: name,
          fileSizeText: this._formatSize(file.size),
          modelUrl: file.path,
          picked: true,
        })
      },
    })
  },

  onStartRender() {
    if (!this.data.modelUrl) return
    wx.navigateTo({
      url:
        '/subpackages/modelViewer/pages/model-render/model-render' +
        '?modelUrl=' + encodeURIComponent(this.data.modelUrl) +
        '&name=' + encodeURIComponent(this.data.fileName) +
        '&size=' + (this.data.fileSizeText || ''),
    })
  },

  _formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return Math.max(1, Math.round(bytes / 1024)) + ' KB'
  },
})
```

- [ ] **Step 3: model-pick.wxml**

```xml
<view class="pick-page">
  <view class="pick-header" style="height: calc({{statusBarHeight}}px + 88rpx)">
    <view class="bar-content" style="top: {{statusBarHeight}}px">
      <view class="back-btn" bindtap="onBack">
        <text class="back-icon">‹</text>
        <text class="back-text">返回</text>
      </view>
      <text class="page-title">选择模型文件</text>
    </view>
  </view>

  <!-- 未选择：空态 -->
  <view class="empty-area" wx:if="{{!picked}}">
    <text class="empty-icon">🧊</text>
    <text class="empty-title">选择你的 3D 模型文件</text>
    <text class="empty-desc">支持从本地文件 / 微信聊天记录中选择</text>
    <text class="empty-desc">格式：GLB 或自包含 GLTF（资源需完整嵌入）</text>
    <text class="empty-desc">大小：不超过 50MB</text>
    <view class="primary-btn" bindtap="onChooseFile">选择 3D 模型文件</view>
  </view>

  <!-- 已选择：文件信息 + 开始渲染 -->
  <view class="file-area" wx:else>
    <text class="file-icon">📦</text>
    <text class="file-name">{{fileName}}</text>
    <text class="file-size">{{fileSizeText}}</text>
    <view class="primary-btn" bindtap="onStartRender">开始渲染</view>
    <view class="secondary-btn" bindtap="onChooseFile">重新选择</view>
  </view>

  <view class="tip-text">iOS 选择本地文件：请先将文件发送到「文件传输助手」再选择</view>
</view>
```

- [ ] **Step 4: model-pick.wxss**

样式骨架复制 `viewer.wxss`（page 背景 `#1a1a2e`、header/bar-content/back-btn 等），新增空态与按钮样式：

```css
.empty-area { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 60rpx; }
.empty-icon { font-size: 120rpx; margin-bottom: 24rpx; }
.empty-title { font-size: 36rpx; font-weight: 600; color: #fff; margin-bottom: 24rpx; }
.empty-desc { font-size: 26rpx; color: rgba(255,255,255,0.6); line-height: 1.8; }
.primary-btn { margin-top: 56rpx; padding: 24rpx 80rpx; background: #4ecdc4; color: #1a1a2e; font-size: 32rpx; font-weight: 600; border-radius: 48rpx; }
.secondary-btn { margin-top: 24rpx; padding: 20rpx 60rpx; border: 2rpx solid rgba(255,255,255,0.4); color: rgba(255,255,255,0.8); font-size: 28rpx; border-radius: 40rpx; }
.file-area { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 60rpx; }
.file-icon { font-size: 100rpx; margin-bottom: 24rpx; }
.file-name { font-size: 32rpx; font-weight: 600; color: #fff; text-align: center; word-break: break-all; margin-bottom: 12rpx; }
.file-size { font-size: 26rpx; color: rgba(255,255,255,0.6); margin-bottom: 24rpx; }
.tip-text { padding: 24rpx 40rpx; text-align: center; font-size: 22rpx; color: rgba(255,255,255,0.4); }
```

- [ ] **Step 5: app.json 注册两个新页面**

```json
"subPackages": [
  {
    "root": "subpackages/modelViewer",
    "pages": ["pages/viewer/viewer", "pages/model-pick/model-pick", "pages/model-render/model-render"]
  }
],
```

（不新增 preloadRule：model-pick 选择文件期间即完成分包下载，渲染页跳转时无需等待）

- [ ] **Step 6: 验证类型**

Run: `npx tsc --noEmit`
Expected: exit code 0

- [ ] **Step 7: Commit**

```bash
git add miniprogram/subpackages/modelViewer/pages/model-pick miniprogram/app.json
git commit -m "feat(model-pick): 新增模型文件选择页（本地/聊天记录，含格式与大小校验）"
```

---

## Task 3: 新建 model-render 本地模型渲染页

**Files:**
- Create: `miniprogram/subpackages/modelViewer/pages/model-render/model-render.json`
- Create: `miniprogram/subpackages/modelViewer/pages/model-render/model-render.ts`
- Create: `miniprogram/subpackages/modelViewer/pages/model-render/model-render.wxml`
- Create: `miniprogram/subpackages/modelViewer/pages/model-render/model-render.wxss`

**Interfaces:**
- 页面 data：`modelName: ''`、`modelUrl: ''`、`statusBarHeight: 44`
- onLoad 参数：`modelUrl`（必传，`wxfile://` 本地路径，`decodeURIComponent` 解码）、`name`、`size`（展示用）
- 清理链：沿用 viewer 模式——`onBack` 先调组件 `cleanup()` 再 `navigateBack`；`onUnload` 兜底再调一次（幂等）；组件 `detached` 最后防线

**Steps:**

- [ ] **Step 1: model-render.json**

```json
{
  "navigationStyle": "custom",
  "usingComponents": {
    "model-viewer": "../../components/model-viewer/model-viewer"
  }
}
```

- [ ] **Step 2: model-render.ts**

```ts
Page({
  data: {
    modelName: '',
    modelUrl: '',
    statusBarHeight: 44,
  },

  onLoad(options: Record<string, string>) {
    const modelUrl = (options && options.modelUrl && decodeURIComponent(options.modelUrl)) || ''
    const modelName = (options && options.name && decodeURIComponent(options.name)) || ''
    this.setData({ modelName, modelUrl })

    try {
      const info = (wx as any).getWindowInfo ? (wx as any).getWindowInfo() : wx.getSystemInfoSync()
      this.setData({ statusBarHeight: info.statusBarHeight || 44 })
    } catch (_e) {
      this.setData({ statusBarHeight: 44 })
    }
    console.log('[model-render] onLoad, url:', modelUrl ? 'set' : 'empty')
  },

  onUnload() {
    const comp = this.selectComponent('#modelViewer') as any
    if (comp && comp.cleanup) comp.cleanup()
  },

  onBack() {
    const comp = this.selectComponent('#modelViewer') as any
    if (comp && comp.cleanup) comp.cleanup()
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' })
      },
    })
  },
})
```

- [ ] **Step 3: model-render.wxml**

```xml
<view class="viewer-page">
  <view class="viewer-header" style="height: calc({{statusBarHeight}}px + 88rpx)">
    <view class="bar-content" style="top: {{statusBarHeight}}px">
      <view class="back-btn" bindtap="onBack">
        <text class="back-icon">‹</text>
        <text class="back-text">返回</text>
      </view>
      <text class="page-title">{{modelName || '3D 查看器'}}</text>
    </view>
  </view>
  <model-viewer id="modelViewer" model-url="{{modelUrl}}" model-name="{{modelName}}" class="viewer-content" />
</view>
```

- [ ] **Step 4: model-render.wxss**

直接复制 `viewer.wxss` 全量内容（同构页面：page 背景、viewer-page/viewer-header/bar-content/back-btn/page-title/viewer-content）。

- [ ] **Step 5: 验证类型**

Run: `npx tsc --noEmit`
Expected: exit code 0

- [ ] **Step 6: Commit**

```bash
git add miniprogram/subpackages/modelViewer/pages/model-render
git commit -m "feat(model-render): 新增本地模型渲染页（复用 model-viewer，本地路径渲染）"
```

---

## Task 4: 首页 cta-banner 改为本地渲染入口

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.ts`

**Interfaces:**
- 方法：`onGoMerchant` 保留不动（仍用于其他入口）；新增 `onGoViewer()` — `wx.navigateTo` 到 model-pick 页

**Steps:**

- [ ] **Step 1: index.wxml 修改 cta-banner 绑定与文案**

```xml
<view class="cta-banner" bindtap="onGoViewer">
  <view class="cta-text">
    <text class="cta-title">拥有自己的3D模型？</text>
    <text class="cta-subtitle">点击选择文件，即刻渲染预览效果</text>
  </view>
  <view class="cta-arrow">›</view>
</view>
```

- [ ] **Step 2: index.ts 新增 onGoViewer**

```ts
onGoViewer() {
  wx.navigateTo({
    url: '/subpackages/modelViewer/pages/model-pick/model-pick',
  })
},
```

- [ ] **Step 3: 验证类型**

Run: `npx tsc --noEmit`
Expected: exit code 0

- [ ] **Step 4: Commit**

```bash
git add miniprogram/pages/index/index.wxml miniprogram/pages/index/index.ts
git commit -m "feat(index): cta-banner 改为本地 3D 模型渲染入口"
```

---

## Task 5: 端到端走查

**Steps:**

- [ ] **Step 1: 微信开发者工具走查清单**

| # | 场景 | 预期 |
|---|---|---|
| 1 | 首页 cta-banner | 文案更新，点击进入 model-pick 选择页（首次进入等待分包下载属正常） |
| 2 | 选择页空态 | 显示格式/大小说明与「选择 3D 模型文件」按钮 |
| 3 | 选择 .glb 文件 | 显示文件名与大小，可点「开始渲染」；「重新选择」可换文件 |
| 4 | 选择非 glb/gltf 文件 | toast 拒绝并停留选择页 |
| 5 | 选择 >50MB 文件 | toast 拒绝并停留选择页 |
| 6 | 点击开始渲染 | 进入 model-render，组件加载本地文件并正常渲染（自动旋转/手势/缩放可用） |
| 7 | 渲染失败（损坏文件） | 组件显示错误 + 重试按钮，点重试重新读取 |
| 8 | 渲染页返回 | 回到选择页（状态保留），再返回首页；多次进出无卡死（清理链生效） |
| 9 | model-detail 远程查看 | 走 viewer 页面，行为与改版前完全一致（回归） |

- [ ] **Step 2: 真机验证**

| # | 环境 | 场景 | 预期 |
|---|---|---|---|
| 1 | Android | 选择本地文件 | 弹出文件管理器，可选手机存储 .glb 并成功渲染 |
| 2 | iOS | 聊天记录选择 | 从聊天记录选择 .glb 并成功渲染；本地文件需先发文件传输助手 |
| 3 | 开发者工具 | 选择文件 | 桌面端可选择文件并渲染 |

- [ ] **Step 3: Commit（如走查产生修复）**

```bash
git add -A
git commit -m "fix(model-render): 走查修复"
```

---

## 验证命令汇总

```powershell
cd d:\Code\benchuang\test6
npx tsc --noEmit
```

Expected: exit code 0；随后在微信开发者工具中按 Task 5 走查清单逐项验证。

---

## 附：关键限制说明（写入选择页提示文案）

1. 仅支持**自包含 GLB**；`.gltf` 引用外部 `.bin`/纹理文件时无法加载（聊天记录/本地文件为单文件，无相对资源可寻）
2. 单文件 ≤ 50MB，避免低端机渲染卡顿/崩溃
3. iOS 无法直接选择本地文件，需先将文件发送到「文件传输助手」
4. 选择文件为微信临时文件（本会话有效），用完即弃，无持久化需求
5. 已知平台坑：鸿蒙 5.0 选择聊天文件可能丢失扩展名后缀 → 页面按 `file.name` 兜底白名单校验并提示重命名
