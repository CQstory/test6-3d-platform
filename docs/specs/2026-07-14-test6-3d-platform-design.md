# test6 3D 展示平台 — 重构设计方案

> 项目：benchuang/test6
> 日期：2026-07-14
> 目标：TypeScript 重构 test2 UI + 融入 test3 three.js 渲染逻辑

---

## 一、技术选型

| 项目 | 选择 | 理由 |
|------|------|------|
| three.js 方案 | 手写适配器 + v152 本地打包 | r152 最后一个完整支持 WebGL 1.0，npm 在小程序不可靠 |
| 渲染引擎 | Skyline | 同层渲染，UI 可叠加 canvas 上方 |
| 组件框架 | Glass-Easel | 与 Skyline 配套，TS Component 定义 |
| 3D viewer 位置 | 分包 subpackages/modelViewer | 主包体积控制，预加载优化 |
| 页面范围 | test2 全量 13 页面 + 3D viewer 分包 | 完整迁移 |
| 用户系统 | 保留 UI，数据 mock | 后端后续对接 |
| 数据层 | Service 封装 + TS Interface | 后续替换 API 零 UI 改动 |
| 3D 格式 | GLB + OBJ | 自解析器 + 统一路由 |
| 代码风格 | 严格 TS，禁止 any | 类型安全 |

---

## 二、项目目录结构

```
test6/
├── miniprogram/
│   ├── adapters/                  # three.js 适配层
│   │   ├── weapp-adapter.js       # DOM/BOM polyfill（精简版）
│   │   ├── three-bundle.js        # three.js v152 本地打包（~600KB）
│   │   ├── glb-loader.js          # GLB 二进制 → Three.js 场景图
│   │   ├── obj-loader.ts          # OBJ 文本 → BufferGeometry
│   │   └── model-loader.ts        # 统一加载入口（格式检测 + 路由）
│   ├── components/                # 全局组件（TS Component）
│   │   ├── top-bar/               # 顶部导航栏
│   │   ├── tab-bar/               # 底部 Tab 导航
│   │   └── model-card/            # 模型展示卡片
│   ├── services/                  # 数据服务层
│   │   ├── model-service.ts       # 模型查询/搜索/推荐
│   │   ├── merchant-service.ts    # 商家数据
│   │   └── user-service.ts        # 用户/登录（mock）
│   ├── types/                     # 全局类型定义
│   │   ├── model.ts               # Model, Banner, Merchant, Plan 接口
│   │   └── common.ts              # 通用响应/分页类型
│   ├── data/                      # 静态数据（临时）
│   │   ├── banners.ts
│   │   ├── merchants.ts
│   │   ├── models.ts
│   │   └── plans.ts
│   ├── pages/                     # 主包页面（13 个）
│   │   ├── index/                 # 首页（Banner + 热门 + 精选 + CTA）
│   │   ├── model-list/            # 模型库
│   │   ├── model-detail/          # 模型详情
│   │   ├── merchant-center/       # 商户中心
│   │   ├── merchant-models/       # 商户模型
│   │   ├── store-front/           # 店铺首页
│   │   ├── profile/               # 个人中心
│   │   ├── favorites/             # 收藏
│   │   ├── pricing/               # 套餐定价
│   │   ├── shop-settings/         # 店铺设置
│   │   ├── login/                 # 登录
│   │   ├── register/              # 注册
│   │   └── reset-pwd/             # 密码重置
│   ├── subpackages/
│   │   └── modelViewer/
│   │       └── pages/
│   │           └── viewer/        # 3D 模型查看器
│   ├── app.ts
│   ├── app.json
│   └── app.wxss
├── typings/                       # 微信 API 类型声明
├── tsconfig.json
├── package.json
├── project.config.json
└── project.private.config.json    # Skyline + Glass-Easel
```

---

## 三、数据流架构

```
Pages (UI) → Services (业务) → Data Sources
    ↓              ↓                ↓
 只依赖接口    封装排序/过滤   静态文件 (当前)
              Promise<T>     wx.request (后续)
```

**Service 接口规范：**
- 所有方法返回 `Promise<T>`，为异步 API 预留
- UI 仅通过 Service 调用，不直接引用 data/
- Service 内部可切换数据源，对外接口不变

**类型定义：**

```typescript
// types/model.ts
interface Model {
  id: string
  name: string
  description: string
  thumbnail: string
  merchantId: string
  merchantName: string
  category: string
  tags: string[]
  fileUrl: string          // GLB/OBJ 下载地址
  fileFormat: 'glb' | 'obj'
  fileSize: number
  dimensions?: string
  material?: string
  price: number
  views: number
  favorites: number
  createdAt: string
}

interface Banner {
  id: string
  image: string
  title: string
  subtitle: string
  link: string
}
```

**ModelService 核心方法：**
- `getHotModels(limit?: number): Promise<Model[]>` — 热门排行
- `getFeaturedModels(limit?: number): Promise<Model[]>` — 精选推荐
- `getModelById(id: string): Promise<Model | null>` — 单体查询
- `getModelsByCategory(cat: string): Promise<Model[]>` — 分类筛选
- `getModelsByMerchant(id: string): Promise<Model[]>` — 商家模型
- `searchModels(keyword: string): Promise<Model[]>` — 搜索

---

## 四、3D Viewer 设计

### 页面结构 (WXML)

```
┌──────────────────────────────┐
│  viewer-header（88rpx）       │  ← 独立导航栏
│  ← 返回  │  模型名称          │
├──────────────────────────────┤
│  canvas-area（flex:1）        │  ← WebGL 画布
│  ┌────────────────────────┐  │
│  │ <canvas type="webgl">  │  │
│  │ loading / error 遮罩   │  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│  control-bar                 │  ← 底部控制
│  💡光源  ▶旋转  ⚙重置       │
└──────────────────────────────┘
```

### 核心功能

| 功能 | 实现 |
|------|------|
| 5 种光照预设 | Ambient+Directional / 明亮 / 柔和 / 戏剧 / 昏暗 |
| 自动旋转 | 启停 + Y 轴 0.005rad/frame |
| 手势旋转 | 单指拖动，灵敏度 0.005，X 轴限制 ±π/2.5 |
| 手势缩放 | 双指捏合，范围 [1.0, 12.0] |
| 双击切换 | 自动旋转开关 |
| 惯性平滑 | lerp 系数 0.08 |
| 模型自适应 | Box3 包围盒计算，自动居中 + 缩放 |
| 格式检测 | 二进制 magic bytes → GLB / 文本首行 → OBJ |
| 内置默认模型 | TorusKnot + 网格 + 粒子（零网络依赖） |
| 加载进度 | 下载百分比 + 解析状态 |
| 错误重试 | 最多 3 次，指数退避 |

### 文件加载管线

```
model-loader.ts（统一入口）
  ├── 检测格式
  │     ├── magic=0x46546C67 → glb-loader.js
  │     └── 文本首行 "v " → obj-loader.ts
  ├── 下载模型
  │     └── wx.downloadFile + readFileSync（ArrayBuffer）
  ├── 解析 → THREE 对象
  └── 加载纹理（GLB 内嵌 / 外部 URI）
        └── canvas.createImage() → data: URI → Texture
```

### 关键适配点（来自 test3 经验）

| 适配点 | 做法 |
|--------|------|
| Canvas DOM 补齐 | addEventListener / style / clientWidth / getBoundingClientRect |
| HTMLImageElement | 不设置假对象，保持 typeof === 'undefined' |
| 图片加载 | `canvas.createImage()` 非 `wx.createImage()` |
| 模型下载 | `downloadFile` + `readFileSync`（支持 200MB，超时 30s） |
| 纹理色彩空间 | baseColor/emissive → sRGB，data/法线/AO → Linear |
| 内存管理 | onUnload → dispose geometry + material + renderer |
| TextDecoder polyfill | 纯 JS 实现（部分 SDK 缺失） |
| Base64 | 优先 `wx.arrayBufferToBase64`，回退手动实现 |

---

## 五、组件设计

### top-bar
- **职责**：顶部导航栏，显示标题 + 条件返回键
- **属性**：`title: string`、`showBack: boolean`
- **事件**：`bind:back`
- **样式**：fixed 定位，白色背景，80rpx 高度，适配刘海屏 `--status-bar-height`

### tab-bar
- **职责**：底部 4 Tab 导航（主页/模型库/消息/我的）
- **属性**：`active: 'home' | 'browse' | 'merchant' | 'profile'`
- **事件**：`bind:tabchange`
- **样式**：fixed 定位，底部安全区适配，选中态高亮指示条

### model-card
- **职责**：模型缩略卡片（缩略图 + 名称 + 商家 + 价格）
- **属性**：`model: Model`
- **事件**：`bind:tap`
- **样式**：圆角卡片，阴影，图片 aspectFill

---

## 六、配置项

### project.config.json
```json
{
  "libVersion": "3.16.2",
  "skylineRenderEnable": true,
  "componentFramework": "glass-easel"
}
```

### app.json
```json
{
  "window": { "navigationStyle": "custom" },
  "subPackages": [{ "root": "subpackages/modelViewer", "pages": ["pages/viewer/viewer"] }],
  "preloadRule": {
    "pages/index/index": { "network": "all", "packages": ["subpackages/modelViewer"] },
    "pages/model-detail/model-detail": { "network": "all", "packages": ["subpackages/modelViewer"] }
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "ES2020",
    "strict": true,
    "allowJs": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true
  }
}
```

---

## 七、实现顺序

1. **基础设施** — types、tsconfig、app 配置、全局样式
2. **数据层** — data 文件 TS 化、Service 层
3. **全局组件** — top-bar、tab-bar、model-card
4. **主包页面** — index → model-list → model-detail → 其余页面
5. **分包 3D viewer** — adapters → viewer 页面
6. **集成验证** — TypeScript 编译检查、页面跳转、3D 渲染

---

## 八、已知风险与约束

| 风险 | 缓解 |
|------|------|
| three-bundle.js 约 600KB，接近 2MB 主包限制 | 放入分包 modelViewer |
| Skyline 热重载不生效 | 开发时关闭热重载，手动编译 |
| 真机调试 Skyline canvas | 开发者工具无法调试原生组件，需真机预览 |
| OBJ 格式无标准纹理方案 | 只解析几何体，纹理用 MTL 路径暂不处理 |
| 微信域名白名单 | 开发阶段 IDE 中勾选"不校验合法域名" |
