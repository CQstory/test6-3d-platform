# 首页本地 3D 模型选择与渲染功能交付报告

> 日期：2026-08-15
> 范围：首页 cta-banner 改为本地 3D 模型渲染入口；新增 model-pick（文件选择/缓冲页）与 model-render（渲染页）两个分包页面；model-viewer 组件支持本地文件路径加载。对应计划 `docs/plans/2026-08-13-local-model-render-plan.md`
> 前置背景：model-viewer 渲染器此前仅支持远程 URL（wx.request arraybuffer）；model-detail 远程查看已验证可用

## 一、功能概述

页面链路：**首页 cta-banner → model-pick 选择页（缓冲页）→ model-render 渲染页**。

选择页承担分包加载缓冲（用户选择文件期间分包已就绪，渲染页跳转无需等待，故不新增 preloadRule）。渲染页复用 `model-viewer` 组件，组件通过「修改模型文件路径」支持本地路径：内部 `FileSystemManager.readFile` 读 ArrayBuffer 后走既有 `GLTFLoader.parse` 链路，远程 URL 分支保持不变。

## 二、交付内容

### 2.1 model-viewer 组件改造（`components/model-viewer/model-viewer.ts`）

| 改动 | 说明 |
|------|------|
| `_loadModel` 路径分派 | `wxfile://`（真机）/ `http://tmp/`（开发者工具）前缀 → `FileSystemManager.readFile`；其余 → 原 `wx.request` |
| `_parseAndMount(data)` 抽取 | GLTFLoader.parse + 模型挂载公共链路，远程/本地共用 |
| 二进制数据归一化 | 兼容 ArrayBuffer / TypedArray 视图 / 工具桥接对象，**强制拷贝为真 ArrayBuffer**（详见桥接报告） |
| `_handleLoadError(err, retry)` | 本地读取失败不自动重试（`retry: false`），手动点重试；终止态清理超时定时器防幽灵重试 |
| 空 modelUrl 静默 | 不报"缺少模型地址"，由页面层空态遮盖 |
| 超时策略 | 本地分支不挂网络超时（无网络语义），仅远程 URL 挂 30s 超时 |

### 2.2 model-pick 选择页（新建，缓冲页）

- `wx.chooseMessageFile({ count: 1, type: 'file', extension: ['glb', 'gltf'] })`
  - extension **不带点**（PC 端带点会失效）；鸿蒙 5.0 存在后缀缺失 bug，按 `file.name` 兜底白名单校验
- 大小上限 50MB（toast 拒绝）、格式白名单（toast 拒绝）
- 选中后展示文件名/大小，「开始渲染」跳转渲染页（`modelUrl`/`name` 均 `encodeURIComponent`）
- 空态/已选两态 UI，iOS 提示"本地文件先发文件传输助手"

### 2.3 model-render 渲染页（新建）

- 解析跳转参数（`decodeURIComponent`）→ 透传 `model-viewer` 组件
- 清理三保险：onBack 显式 cleanup → onUnload 兜底 → 组件 detached（全部幂等）
- 空 modelUrl 时页面层显示"未获取到模型文件地址"遮罩（组件静默待命）

### 2.4 首页 cta-banner

- 绑定从 `onGoMerchant`（商户入驻）改为 `onGoViewer` → `navigateTo` model-pick
- 文案改为"点击选择文件，即刻渲染预览效果"

### 2.5 配置

- `app.json` subPackages.modelViewer.pages 注册两个新页面（不新增 preloadRule）

## 三、验证结果

| 场景 | 结果 |
|------|------|
| 开发者工具选择本地 GLB（Fox.glb / COLLADA2GLTF 导出文件） | ✅ 渲染成功（`model loaded`） |
| 开发者工具远程查看（Avocado.glb，8.3MB，cdn.jsdelivr.net） | ✅ 渲染成功（纹理 data URI → ScopedImage → 2048×2048 纹理全部加载） |
| 损坏文件/格式错误 | 显示错误 + 重试按钮，不再自动重试 |
| 多次进出渲染页 | 清理链生效，无卡死（cleanup start → cleanup done → onUnload fallback） |
| `npx tsc --noEmit` | exit code 0 |

## 四、已知限制（选择页文案已提示）

1. 仅支持**自包含 GLB**；`.gltf` 引用外部 `.bin`/纹理文件无法加载（单文件，无相对资源可寻）
2. 单文件 ≤ 50MB（避免低端机渲染卡顿/崩溃）
3. iOS 无法直接选择本地文件，需先发送到「文件传输助手」
4. 临时文件本会话有效，用完即弃，无持久化

## 五、后续建议

- 真机双端验证（Android 本地文件 / iOS 聊天记录）
- 可选：支持 OBJ/STL（需引入对应 loader）；"最近打开"本地历史（需 `wx.saveFile` 持久化，注意 10MB 单文件限制）
- 诊断日志（`GLB diag` 系列）仅在失败时输出，可长期保留

## 六、提交记录

| Commit | 内容 |
|--------|------|
| `ed31f44` | model-viewer 支持 wxfile:// 本地路径加载 |
| `e0ffd00` | model-pick 选择页 + app.json 注册 |
| `0d40647` | model-render 渲染页 |
| `d7116dd` | 首页 cta-banner 入口改造 |
| `3fd07de` | 审查修复（http://tmp/ 前缀、幽灵重试、空态兜底） |
| `8fe572b` `19808e2` `b832b73` | readFile 桥接对象归一化系列修复 |
