# H5 迁移方案研究报告

> 日期：2026-08-04
> 目标：将现有微信小程序（test6）迁移为 H5 项目，并具备转换到其他小程序（如抖音）的能力
> 结论先行：**推荐采用跨端框架 Taro 4（React + TS）整体重构**，一套代码直接输出 H5 + 微信 + 抖音三端；"先做纯 H5 再转小程序"的路径不可行（详见第二节）。

---

## 一、项目现状盘点

### 1.1 技术栈

| 维度 | 现状 |
|---|---|
| 形态 | 原生微信小程序（`miniprogram/`），微信开发者工具 + TypeScript 编译 |
| 页面 | 15 个主包页面 + 1 个分包页面（3D viewer），`navigationStyle: custom` 自定义导航 |
| 组件 | 4 个自定义组件：model-card、model-item、tab-bar（自定义 tabBar）、top-bar |
| 服务层 | `services/`：api（wx.request 封装）、user-service、model-service（385 行）、merchant-service、public-service |
| 数据层 | `data/`：4 个 mock 文件（models/merchants/plans/banners） |
| 3D 渲染 | `subpackages/modelViewer/`：three@0.162 + 433 行 weapp-shim 全局注入 + GLTFLoader CJS 转换产物 |
| 后端 | REST API（`http://39.101.73.244:26014/api/v1`），Bearer Token，前端有 `USE_MOCK` 开关 |
| 登录 | 微信一键登录（wx.login → code 换 token）+ 手机号/密码登录 |

### 1.2 代码规模（迁移工作量基数）

- 总计约 103 个文件、230KB（ts/wxml/wxss/json）
- 页面 WXML 约 860 行、页面 TS 约 1240 行
- 平台 API 使用统计（18 种，共 130+ 次调用）：

| API | 次数 | 迁移去向 |
|---|---|---|
| showToast | 28 | Taro.showToast（三端自动映射） |
| navigateTo / navigateBack / switchTab / reLaunch / redirectTo | 40 | Taro 路由 API（H5 端为 history 路由） |
| getStorageSync / setStorageSync / removeStorageSync | 37 | Taro storage（H5 端映射 localStorage） |
| getSystemInfoSync / getWindowInfo | 6 | Taro.getWindowInfo（H5 端返回窗口尺寸） |
| chooseImage / chooseMessageFile / uploadFile | 5 | Taro.chooseImage / Taro.uploadFile |
| login | 2 | Taro.login（自动适配微信/抖音） |
| showModal / setClipboardData | 3 | Taro 对应 API |

**结论：wx API 使用面很窄、模式统一（集中在小程序通用能力），跨端适配成本低。这是本项目迁移的最大有利条件。**

### 1.3 3D 查看器架构（迁移难点，也是最大受益点）

```
createScopedThreejs(canvas)
  └─ createScopedShim(canvas).install()      # 433 行：注入 document/Image/Blob/URL/TextDecoder/rAF
  └─ require('three')                        # miniprogram_npm 映射
  └─ GLTFLoader（scripts/convert-three-addons.js 转 CJS 产物）
```

- 渲染核心逻辑（model-viewer.ts 655 行中的约 500 行：球坐标轨道、包围球自动取景、惯性、清理链）**与平台无关，可直接复用**
- 需替换的只有：canvas 获取、全局 shim、GLTFLoader 引入方式
- **H5 端是 three.js 的原生主场**：433 行 shim 全部删除，three 直接 npm 引入，GLTFLoader 从 `three/examples/jsm` 直引，代码反而更简单

---

## 二、关键认知澄清（必须先明确）

### 2.1 "H5 不能转成小程序"

- 目前**不存在**通用的 "H5 → 抖音小程序 / 微信小程序" 源码转换器。
- 抖音开放平台提供的是反向能力（小程序运行层 web 化 / 小程序转 H5），方向相反，且只适合内容展示类页面，交互复杂与 3D 场景不适用。
- **因此"先做 H5，再方便转其他小程序"的正确解读是：用一套能同时输出 H5 + 各端小程序的跨端框架开发**，H5 只是该框架的输出端之一。

### 2.2 两条可行路线

| 路线 | 含义 | 最终形态 |
|---|---|---|
| ① 跨端框架一步到位 | 用 Taro / uni-app 重构，框架直接输出 H5 + 微信 + 抖音 | 一套代码，三端产物 |
| ② 纯 H5 先行 | 新建独立 H5 项目（Vite + React/Vue），只解决"网页版"诉求 | H5 产物；小程序端后续仍需走路线①重构 |

路线② 的 H5 代码**不能**被路线①复用（框架模板语法不同），仅 services/types/data 纯逻辑层可复用。若用户明确"几个月内只做 H5 展示版"，可选 ②；若最终目标含多端小程序，应直接选 ①。

---

## 三、方案对比

### 3.1 候选方案总览

| 方案 | 技术路线 | H5 | 抖音 | 微信 | 转换工具 | 维护现状 | 工作量（单人） |
|---|---|---|---|---|---|---|---|
| **A. Taro 4 重构**（推荐） | React + TS（可选 Vue3） | ✅ | ✅ 官方插件平台 | ✅ | `taro convert`（wx2taro，批量转 WXML/WXSS/JS） | 活跃，TS 支持一流 | 2.5–4 周 |
| **B. uni-app 重构** | Vue3 | ✅ | ✅ 官方文档支持 | ✅ | `miniprogram-to-uniapp`（w2uni） | 活跃，国内生态全 | 2.5–4 周 |
| C. 纯 H5 项目 | Vite + React/Vue + three 原生 | ✅ | ❌ 需再重构 | 保留原版 | 无 | — | 1–2 周 |
| D. 原生三端双写 | wx→tt 适配层 + H5 另建 | ✅ | ✅（适配层） | ✅ | 无 | 三套代码，维护成本高 | 3–5 周 |
| E. kbone | Web 语法 → 微信/H5 | ✅ | ❌ | ✅ | 官方 | **已不活跃，仅支持微信端** | 不推荐 |

### 3.2 推荐方案 A：Taro 4 + React + TS

理由：

1. **项目已是 TypeScript**，Taro + React 的 TS 支持最完整，页面/服务层逻辑可直接迁移而非重写
2. **官方多端支持含抖音**：`@tarojs/plugin-platform-tt`（字节跳动/抖音端运行时），Taro 4.x 官方文档含《从原生小程序迁移》指南；抖音基础库 3110+ 已支持 tt-dom 渲染接口
3. **`taro convert`（wx2taro）可批量转换**：把 WXML/WXSS/JS 转成 React 组件与页面，静态展示类页面转换质量尚可，可省 30–50% 手工量（复杂交互仍需手工修复，本项目 model-edit 等表单页需重点核对）
4. **H5 端输出标准 React SPA**：three.js 直接用浏览器原生能力，433 行 weapp-shim 整体删除；H5 调试可用任意浏览器 DevTools
5. **微信端产物保持发布能力**，可边迁移边验证，风险可控

备选方案 B（uni-app + Vue3）：若团队更熟悉 Vue，选型逻辑完全相同（官方有《通过 uni-app 框架开发抖音小程序》文档 + 社区 w2uni 转换器）。两者在抖音端支持度上无本质差异，**选型取决于团队框架偏好**。

### 3.3 明确不推荐

- **kbone**：只输出微信端 + H5，不支持抖音，且已不活跃
- **原生双写（方案 D）**：抖音 tt.\* API 与 wx.\* 高度相似（tt.login/tt.request/tt.setStorageSync），适配层可行，但 H5 端 UI 无法复用，最终三套 UI 代码，长期维护成本最高

---

## 四、迁移架构设计（方案 A 展开）

### 4.1 目标仓库结构（Taro 4 单仓）

```
test6/                        # 现有仓库保留（可归档 miniprogram/ 为 legacy/）
└── (新建 taro 子目录或平级目录 h5-app/)
    ├── src/
    │   ├── app.ts / app.config.ts
    │   ├── pages/            # 原 15 页面迁移（taro convert 产物 + 修复）
    │   ├── components/       # model-card / model-item / top-bar / tab-bar
    │   ├── services/         # 原 services/ 直接迁移（api 适配 30 行内）
    │   ├── data/             # 原 data/ 直接复制
    │   ├── lib/3d/           # 3D 查看器重写（删除 weapp-shim）
    │   └── types/
    └── config/               # Taro 三端编译配置（h5 / weapp / tt）
```

### 4.2 分层迁移对照表

| 原模块 | 迁移方式 | 预估 |
|---|---|---|
| `services/api.ts` | `wx.request` → `Taro.request`；`wx.getStorageSync` → `Taro.getStorageSync`；其余 1:1 | 0.5 天 |
| `services/user-service.ts` | `wx.login` → `Taro.login`（自动适配端）；H5 端微信登录降级为手机号密码登录 | 1 天 |
| `services/model-service.ts` 等 | 纯逻辑 + api 调用，**几乎原样复制** | 0.5 天 |
| `data/*.ts` | 直接复制 | 0.1 天 |
| `pages/*`（WXML+TS+WXSS） | `taro convert` 批量转 + 手工修复（rpx 单位由 Taro 自动换算） | 4–6 天 |
| `components/*` | convert 转 React 组件 + 修复 | 1 天 |
| 自定义 tabBar | 微信端保留 `custom: true` 配置；H5 端用路由组件渲染（tab-bar.tsx） | 1 天 |
| top-bar 自定义导航 | 组件化后三端通用；H5 端无状态栏，`--status-bar-height` 按 0 处理 | 0.5 天 |
| **3D viewer 分包** | 删除 weapp-shim + create-scoped-three；three 直引 npm；保留渲染核心逻辑 | 3–4 天 |
| 后端配合 | 加 CORS 头（H5 必须）；`/auth/login` 增加 platform 参数（抖音 code 换 openid） | 1–2 天 |

### 4.3 3D 查看器迁移细节

**微信版（现状）**：
```
createScopedShim(canvas).install()  →  require('three')  →  createOffscreenCanvas('webgl')
GLTFLoader（convert-three-addons.js 转 CJS）→  canvas.createImage() 桥接纹理
```

**Taro 版（目标）**：
```
Taro.createSelectorQuery().select('#glCanvas').node()  →  import * as THREE from 'three'（直引）
GLTFLoader 从 three/examples/jsm 直引
H5 端：原生 <canvas> + 浏览器 Image/URL（原生能力，零 shim）
微信/抖音端：Taro Canvas 组件（type="webgl"），Taro 统一节点获取与事件
```

可 100% 复用：轨道控制、包围球取景、惯性、自动旋转、FPS、清理链（`_cleanup` 的 dispose/forceContextLoss 逻辑）。需重写：canvas 节点获取（约 30 行）、全局 shim 删除、GLTFLoader 引入。

**已知风险**：抖音开发者工具部分基础库版本（如 3.x）对 WebGL canvas 渲染支持有缺陷（社区反馈：工具内不显示模型、控制器失效），**必须真机验证**；真机抖音基础库 2.97+ 可正常渲染。

### 4.4 关键差异点与前置条件

1. **CORS（H5 上线前置条件，必做）**：浏览器跨域访问 `http://39.101.73.244:26014`，后端需返回 `Access-Control-Allow-Origin` 等头（开发期可用 Vite proxy 绕过）
2. **登录链路**：
   - H5：手机号/密码登录（现有接口已支持）；微信登录需换公众号 OAuth 或降级
   - 抖音：`tt.login` → code 传后端，后端按 platform 分流换取 openid（**后端需改造**）
   - 微信：`wx.login` 逻辑不变
3. **存储**：`Taro.getStorageSync` 自动映射 localStorage（H5）/ wx storage / tt storage，现有 storage key（auth_token、user_info 等）无需变更
4. **路由**：`Taro.navigateTo` 在 H5 端映射为 history 路由；**部署时需配置 SPA fallback（nginx try_files / rewrite）**，否则刷新 404
5. **分包/预加载**：`subPackages` 与 `preloadRule` 是小程序专属概念，Taro 在 H5/抖音端自动合并处理，无需迁移
6. **样式**：WXSS 的 rpx 由 Taro 自动换算（designWidth 750）；`navigationStyle: custom` 相关高度计算需按端条件处理
7. **three 版本**：保持 0.162 不变；`scripts/convert-three-addons.js`、`scripts/fix-three-cjs.js` 为小程序专用，迁移后可删除

---

## 五、分步实施计划（方案 A，单人全职）

| Phase | 内容 | 交付物 | 预估 |
|---|---|---|---|
| P0 前置 | 后端加 CORS；注册抖音开放平台应用获取 appid；确认抖音端手机号登录接口可用 | 后端可跨域访问；抖音 appid | 0.5–1 天 |
| P1 骨架 | `npm i -g @tarojs/cli`，`taro init`（react-ts 模板）；配置三端（h5/weapp/tt）；目录映射 | Taro 4 工程骨架，三端可跑 Hello World | 1 天 |
| P2 核心层 | services/data/types 迁移；api 适配层；user-service 多端登录适配 | 登录 + 列表接口三端跑通 | 2–3 天 |
| P3 页面转换 | `taro convert` 批量转换页面/组件 + 手工修复；H5 端优先跑通全部 15 页面 | H5 全功能版 | 4–6 天 |
| P4 3D 查看器 | 删除 weapp-shim；three 直引；渲染核心逻辑复用；三端联调 | 3D 查看器三端可用 | 3–4 天 |
| P5 导航与样式 | 自定义 tabBar 三端方案；top-bar 适配；页面细节走查 | UI 一致性 | 2 天 |
| P6 联调发布 | 微信开发者工具 / 抖音开发者工具 / 浏览器三端验证；真机 3D 验证；部署 H5 | 三端可发布 | 3–5 天 |

**合计约 2.5–4 周（单人全职）**，其中 3D 查看器与页面手工修复是主要风险项。

---

## 六、结论与建议

1. **首选 Taro 4 + React + TS（方案 A）**：一套代码同时输出 H5、微信、抖音，符合"先 H5、后续多端"的目标；项目已是 TS，迁移以"搬运 + 适配"为主而非重写；3D 查看器在 H5 端反而简化（删 shim）。
2. **若团队偏好 Vue3，选 uni-app（方案 B）**，选型逻辑完全一致。
3. **不建议先做纯 H5 项目（方案 C）**，除非明确"只要网页展示版、数月内不做多端"——H5 代码无法转回小程序，届时仍需按方案 A/B 重构。
4. **不建议 kbone / 原生双写**。
5. **后端需配合两件事**：H5 跨域 CORS 头 + 登录接口 platform 分流（抖音 code）。

### 建议下一步

- 确认技术选型（Taro React / Taro Vue / uni-app Vue / 纯 H5 先行）
- 确认后即可从 P1（项目骨架）开始落地，P2 迁移服务层并跑通首页
