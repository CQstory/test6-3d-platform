# test6 3D 展示平台实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TypeScript 重构 test2 全量 UI + test3 three.js v152 渲染管线，在 test6 中搭建完整的 3D 模型展示平台

**Architecture:** 分层架构：types → services → components → pages。3D viewer 独立分包含适配器 + GLB/OBJ 解析器。Skyline 渲染引擎 + Glass-Easel 组件框架。静态数据通过 Service 层封装，后续替换 API 零 UI 改动。

**Tech Stack:** TypeScript 5.x, three.js v152 (本地打包), 微信小程序 Skyline, Glass-Easel, CommonJS

## Global Constraints

- three.js: v152（本地打包 three-bundle.js），WebGL 1.0 路径
- 渲染引擎: Skyline (`skylineRenderEnable: true`)
- 组件框架: Glass-Easel (`componentFramework: "glass-easel"`)
- 基础库: `libVersion: "trial"`（>= 3.16.2）
- TypeScript: CommonJS 输出，strict 模式，禁止 any
- 不设置 HTMLImageElement 假对象
- 图片用 canvas.createImage()，非 wx.createImage()
- 模型下载用 downloadFile + readFileSync
- 分包: subpackages/modelViewer，首页预加载
- 文件名: 所有页面和组件使用 kebab-case
- 页面级 Component: 使用 Component({...}) 定义（非 Page）
- 仅在 test6 工作空间内操作，不修改其他目录文件

---

### Task 1: 基础设施搭建（项目配置）

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `project.private.config.json`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/app.ts`

**Interfaces:**
- Produces: app.json 注册全部 13 页面 + 分包 + preloadRule

- [ ] **Step 1: 更新 app.json — 注册全部页面、分包、tabBar、preloadRule**

`miniprogram/app.json`:

```json
{
  "pages": [
    "pages/index/index",
    "pages/model-list/model-list",
    "pages/merchant-center/merchant-center",
    "pages/profile/profile",
    "pages/model-detail/model-detail",
    "pages/store-front/store-front",
    "pages/merchant-models/merchant-models",
    "pages/pricing/pricing",
    "pages/shop-settings/shop-settings",
    "pages/favorites/favorites",
    "pages/login/login",
    "pages/register/register",
    "pages/reset-pwd/reset-pwd"
  ],
  "subPackages": [
    {
      "root": "subpackages/modelViewer",
      "pages": ["pages/viewer/viewer"]
    }
  ],
  "preloadRule": {
    "pages/index/index": {
      "network": "all",
      "packages": ["subpackages/modelViewer"]
    },
    "pages/model-list/model-list": {
      "network": "all",
      "packages": ["subpackages/modelViewer"]
    },
    "pages/model-detail/model-detail": {
      "network": "all",
      "packages": ["subpackages/modelViewer"]
    }
  },
  "tabBar": {
    "custom": true,
    "list": [
      { "pagePath": "pages/index/index", "text": "主页" },
      { "pagePath": "pages/model-list/model-list", "text": "模型库" },
      { "pagePath": "pages/merchant-center/merchant-center", "text": "消息" },
      { "pagePath": "pages/profile/profile", "text": "我的" }
    ]
  },
  "window": {
    "navigationStyle": "custom",
    "navigationBarTextStyle": "black"
  },
  "style": "v2",
  "componentFramework": "glass-easel",
  "lazyCodeLoading": "requiredComponents"
}
```

- [ ] **Step 2: 更新 project.private.config.json — 确认 Skyline 配置**

`project.private.config.json`:

```json
{
  "libVersion": "trial",
  "setting": {
    "skylineRenderEnable": true
  }
}
```

- [ ] **Step 3: 更新全局样式 app.wxss**

`miniprogram/app.wxss`:

```css
/* 全局默认样式 */
page {
  background: #0f0c29;
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

button {
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  line-height: inherit;
  font-size: inherit;
}
button::after { border: none; }

.safe-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}
```

- [ ] **Step 4: 更新 app.ts 入口**

`miniprogram/app.ts`:

```typescript
App<IAppOption>({
  globalData: {
    userInfo: null as any,
    systemInfo: null as WechatMiniprogram.SystemInfo | null,
  },
  onLaunch() {
    // 获取系统信息
    const info = wx.getSystemInfoSync()
    this.globalData.systemInfo = info
    // 设置 CSS 变量（供 top-bar 使用）
    const statusBarHeight = info.statusBarHeight || 44
    document.documentElement.style.setProperty('--status-bar-height', statusBarHeight + 'px')

    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    wx.login({
      success: res => { console.log('login code:', res.code) },
    })
  },
})
```

- [ ] **Step 5: 删除旧页面 logs 目录**

删除 `miniprogram/pages/logs/` 整个目录。

- [ ] **Step 6: 验证 tsc 编译**

```bash
cd d:\Code\benchuang\test6 && npx tsc --noEmit
```

---

### Task 2: 类型定义

**Files:**
- Create: `miniprogram/types/model.ts`
- Create: `miniprogram/types/common.ts`

**Interfaces:**
- Produces: `Model`, `Banner`, `Merchant`, `Plan`, `CategoryType` 等类型

- [ ] **Step 1: 创建 types/model.ts**

```typescript
/** 模型分类 */
export type CategoryType = 'creature' | 'industrial' | 'toy' | 'plant' | 'prop'

/** 模型数据模型 */
export interface Model {
  id: string
  name: string
  description: string
  thumbnail: string
  modelUrl: string
  category: CategoryType
  tags: string[]
  faces: number
  format: string
  merchantId: string
  merchantName: string
  merchantAvatar: string
  views: number
  favorites: number
}

/** Banner 轮播图 */
export interface Banner {
  id: string
  image: string
  title: string
  subtitle: string
  link: string
}

/** 商家 */
export interface Merchant {
  id: string
  name: string
  avatar: string
  cover: string
  description: string
  contact: {
    wechat: string
    phone: string
    email: string
  }
  stats: {
    models: number
    views: number
    rating: number
  }
}

/** 套餐 */
export interface Plan {
  id: string
  name: string
  price: number
  unit: string
  slots: number // -1 表示不限
  features: string[]
  highlight: boolean
}

/** 分类标签映射 */
export const CATEGORY_MAP: Record<CategoryType, string> = {
  creature: '生物',
  industrial: '工业模具',
  toy: '玩具',
  plant: '植物',
  prop: '道具',
}
```

- [ ] **Step 2: 创建 types/common.ts**

```typescript
/** 通用 API 响应结构（预留） */
export interface ApiResponse<T> {
  code: number
  data: T
  msg: string
}

/** 分页参数 */
export interface PageParams {
  page: number
  pageSize: number
}

/** 分页结果 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
```

---

### Task 3: 静态数据 TypeScript 化

**Files:**
- Create: `miniprogram/data/models.ts`
- Create: `miniprogram/data/banners.ts`
- Create: `miniprogram/data/merchants.ts`
- Create: `miniprogram/data/plans.ts`
- Delete: `miniprogram/data/models.js`
- Delete: `miniprogram/data/banners.js`
- Delete: `miniprogram/data/merchants.js`
- Delete: `miniprogram/data/plans.js`

**Interfaces:**
- Produces: `modelsData: Model[]`, `bannersData: Banner[]`, `merchantsData: Merchant[]`, `plansData: Plan[]`

- [ ] **Step 1: 将 models.js 转为 models.ts — 添加类型标注**

从现有 `miniprogram/data/models.js` 读取内容，转为 TS:

```typescript
import { Model } from '../types/model'

export const modelsData: Model[] = [
  {
    id: 'damaged-helmet',
    name: 'Damaged Helmet',
    description: '锈迹斑斑的科幻风格头盔，PBR材质完美呈现金属磨损质感，适合科幻场景道具展示',
    thumbnail: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/screenshot/screenshot.png',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
    category: 'prop',
    tags: ['科幻', '头盔', 'PBR', '金属'],
    faces: 14200,
    format: 'glTF-Binary',
    merchantId: 'merchant-1',
    merchantName: '星河模型工坊',
    merchantAvatar: 'https://api.dicebear.com/8.x/shapes/svg?seed=galaxy',
    views: 12580,
    favorites: 386,
  },
  // ... 其余 7 个模型数据保持不变，仅加类型标注
]
```

- [ ] **Step 2: 将 banners.js 转为 banners.ts**

```typescript
import { Banner } from '../types/model'

export const bannersData: Banner[] = [
  {
    id: 'banner-1',
    image: 'https://picsum.photos/800/400?random=1',
    title: '探索3D世界',
    subtitle: '海量精品模型等你发现',
    link: '/pages/model-list/model-list',
  },
  {
    id: 'banner-2',
    image: 'https://picsum.photos/800/400?random=2',
    title: '沉浸式体验',
    subtitle: '360度全方位查看细节',
    link: '/pages/model-list/model-list',
  },
  {
    id: 'banner-3',
    image: 'https://picsum.photos/800/400?random=3',
    title: '创作者入驻',
    subtitle: '展示你的创意作品',
    link: '/pages/merchant-center/merchant-center',
  },
]
```

- [ ] **Step 3: 将 merchants.js 转为 merchants.ts**

```typescript
import { Merchant } from '../types/model'

export const merchantsData: Merchant[] = [
  // 保持现有数据，加类型标注
]
```

- [ ] **Step 4: 将 plans.js 转为 plans.ts**

```typescript
import { Plan } from '../types/model'

export const plansData: Plan[] = [
  // 保持现有数据，加类型标注
]
```

- [ ] **Step 5: 删除旧的 .js 文件**

删除 `miniprogram/data/models.js`、`banners.js`、`merchants.js`、`plans.js`。

- [ ] **Step 6: 验证 tsc 编译**

```bash
cd d:\Code\benchuang\test6 && npx tsc --noEmit
```

---

### Task 4: 数据服务层

**Files:**
- Create: `miniprogram/services/model-service.ts`
- Create: `miniprogram/services/merchant-service.ts`
- Create: `miniprogram/services/user-service.ts`

**Interfaces:**
- Consumes: `modelsData` from `data/models.ts`, `merchantsData` from `data/merchants.ts`
- Produces: `modelService: IModelService`, `merchantService: IMerchantService`, `userService: IUserService`

- [ ] **Step 1: 创建 model-service.ts**

```typescript
import { Model, CATEGORY_MAP, CategoryType } from '../types/model'
import { modelsData } from '../data/models'

export interface IModelService {
  getHotModels(limit?: number): Promise<Model[]>
  getFeaturedModels(limit?: number): Promise<Model[]>
  getModelById(id: string): Promise<Model | null>
  getModelsByCategory(cat: CategoryType): Promise<Model[]>
  getModelsByMerchant(merchantId: string): Promise<Model[]>
  searchModels(keyword: string): Promise<Model[]>
  getAllCategories(): { key: CategoryType; label: string }[]
}

const createModelService = (): IModelService => ({
  async getHotModels(limit?: number) {
    const sorted = [...modelsData]
      .map(m => ({ ...m, hotScore: m.views * 0.4 + m.favorites * 0.6 * 10 }))
      .sort((a, b) => b.hotScore - a.hotScore)
    return sorted.slice(0, limit ?? sorted.length)
  },

  async getFeaturedModels(limit?: number) {
    return modelsData.slice(0, limit ?? 4)
  },

  async getModelById(id: string) {
    return modelsData.find(m => m.id === id) || null
  },

  async getModelsByCategory(cat: CategoryType) {
    return modelsData.filter(m => m.category === cat)
  },

  async getModelsByMerchant(merchantId: string) {
    return modelsData.filter(m => m.merchantId === merchantId)
  },

  async searchModels(keyword: string) {
    const kw = keyword.toLowerCase()
    return modelsData.filter(m =>
      m.name.toLowerCase().includes(kw) ||
      m.tags.some(t => t.includes(kw)) ||
      m.description.toLowerCase().includes(kw)
    )
  },

  getAllCategories() {
    return Object.entries(CATEGORY_MAP).map(([key, label]) => ({
      key: key as CategoryType,
      label,
    }))
  },
})

export const modelService = createModelService()
```

- [ ] **Step 2: 创建 merchant-service.ts**

```typescript
import { Merchant } from '../types/model'
import { merchantsData } from '../data/merchants'

export interface IMerchantService {
  getMerchantById(id: string): Promise<Merchant | null>
  getAllMerchants(): Promise<Merchant[]>
}

const createMerchantService = (): IMerchantService => ({
  async getMerchantById(id: string) {
    return merchantsData.find(m => m.id === id) || null
  },
  async getAllMerchants() {
    return merchantsData
  },
})

export const merchantService = createMerchantService()
```

- [ ] **Step 3: 创建 user-service.ts（mock 实现）**

```typescript
export interface IUserService {
  login(username: string, password: string): Promise<{ success: boolean; userId?: string; msg: string }>
  register(username: string, password: string): Promise<{ success: boolean; msg: string }>
  resetPassword(username: string): Promise<{ success: boolean; msg: string }>
  isLoggedIn(): boolean
  getCurrentUser(): { username: string } | null
  logout(): void
}

const createUserService = (): IUserService => ({
  async login(username: string, _password: string) {
    // Mock: 任意用户名 + 长度 >= 3 即成功
    if (username.length >= 3) {
      wx.setStorageSync('user', { username })
      return { success: true, userId: 'mock-' + username, msg: '登录成功' }
    }
    return { success: false, msg: '用户名至少3个字符' }
  },

  async register(username: string, _password: string) {
    wx.setStorageSync('user', { username })
    return { success: true, msg: '注册成功' }
  },

  async resetPassword(_username: string) {
    return { success: true, msg: '重置链接已发送' }
  },

  isLoggedIn() {
    return !!wx.getStorageSync('user')
  },

  getCurrentUser() {
    return wx.getStorageSync('user') || null
  },

  logout() {
    wx.removeStorageSync('user')
  },
})

export const userService = createUserService()
```

- [ ] **Step 4: 验证 tsc 编译**

```bash
cd d:\Code\benchuang\test6 && npx tsc --noEmit
```

---

### Task 5: 全局组件 — top-bar

**Files:**
- Create: `miniprogram/components/top-bar/top-bar.ts`
- Create: `miniprogram/components/top-bar/top-bar.json`
- Create: `miniprogram/components/top-bar/top-bar.wxml`
- Create: `miniprogram/components/top-bar/top-bar.wxss`

**Interfaces:**
- Produces: top-bar 组件 `properties: { title: string, showBack: boolean }`, `triggerEvent('back')`

- [ ] **Step 1: 创建 top-bar.json**

```json
{
  "component": true,
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 top-bar.wxml**

```xml
<view class="top-bar">
  <view class="status-bar-spacer"></view>
  <view class="bar-content">
    <view class="back-btn" wx:if="{{showBack}}" bindtap="onBack">
      <text class="back-icon">‹</text>
      <text class="back-text">返回</text>
    </view>
    <text class="page-title">{{title}}</text>
  </view>
</view>
```

- [ ] **Step 3: 创建 top-bar.wxss**

```css
.top-bar {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 999;
  background: #ffffff;
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05);
}
.status-bar-spacer { height: var(--status-bar-height, 44px); }
.bar-content {
  display: flex; align-items: center; justify-content: center;
  height: 88rpx; position: relative;
}
.back-btn {
  position: absolute; left: 16rpx;
  display: flex; align-items: center;
  padding: 12rpx 20rpx;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 32rpx;
}
.back-icon { font-size: 40rpx; color: #1a1a1a; margin-right: 4rpx; }
.back-text { font-size: 28rpx; color: #1a1a1a; }
.page-title { font-size: 36rpx; font-weight: 600; color: #1a1a1a; }
```

- [ ] **Step 4: 创建 top-bar.ts**

```typescript
Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
  },
  methods: {
    onBack() {
      this.triggerEvent('back')
      wx.navigateBack({ delta: 1 })
    },
  },
})
```

---

### Task 6: 全局组件 — tab-bar

**Files:**
- Create: `miniprogram/components/tab-bar/tab-bar.ts`
- Create: `miniprogram/components/tab-bar/tab-bar.json`
- Create: `miniprogram/components/tab-bar/tab-bar.wxml`
- Create: `miniprogram/components/tab-bar/tab-bar.wxss`

**Interfaces:**
- Produces: tab-bar 组件 `properties: { active: string }`

- [ ] **Step 1: 创建 tab-bar.json**

```json
{
  "component": true,
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 tab-bar.wxml**

```xml
<view class="tab-bar">
  <view
    wx:for="{{tabs}}"
    wx:key="key"
    class="tab-item {{active === item.key ? 'active' : ''}}"
    data-key="{{item.key}}"
    bindtap="onTabTap"
  >
    <text class="tab-icon">{{item.icon}}</text>
    <text class="tab-label">{{item.label}}</text>
    <view class="tab-indicator" wx:if="{{active === item.key}}"></view>
  </view>
</view>
```

- [ ] **Step 3: 创建 tab-bar.wxss**

```css
.tab-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 999;
  display: flex; align-items: flex-start; justify-content: space-around;
  height: 100rpx; padding-top: 10rpx;
  padding-bottom: env(safe-area-inset-bottom);
  background: #ffffff; border-top: 1rpx solid #f0f0f0;
  box-sizing: border-box;
}
.tab-item { display: flex; flex-direction: column; align-items: center; position: relative; padding: 4rpx 0; flex: 1; }
.tab-icon { font-size: 38rpx; margin-bottom: 2rpx; transition: opacity 0.2s; opacity: 0.4; }
.tab-item.active .tab-icon { opacity: 1; }
.tab-label { font-size: 20rpx; color: #999999; transition: color 0.2s; }
.tab-item.active .tab-label { color: #4ecdc4; font-weight: 500; }
.tab-indicator { position: absolute; top: -10rpx; width: 40rpx; height: 4rpx; background: #4ecdc4; border-radius: 0 0 4rpx 4rpx; }
```

- [ ] **Step 4: 创建 tab-bar.ts**

```typescript
Component({
  properties: {
    active: { type: String, value: 'home' },
  },
  data: {
    tabs: [
      { key: 'home', label: '主页', icon: '🏠' },
      { key: 'browse', label: '模型库', icon: '📦' },
      { key: 'merchant', label: '消息', icon: '💬' },
      { key: 'profile', label: '我的', icon: '👤' },
    ],
  },
  methods: {
    onTabTap(e: WechatMiniprogram.TouchEvent) {
      const key = e.currentTarget.dataset.key as string
      if (key === this.properties.active) return

      const routes: Record<string, string> = {
        home: '/pages/index/index',
        browse: '/pages/model-list/model-list',
        merchant: '/pages/merchant-center/merchant-center',
        profile: '/pages/profile/profile',
      }
      wx.switchTab({ url: routes[key] })
    },
  },
})
```

---

### Task 7: 全局组件 — model-card

**Files:**
- Create: `miniprogram/components/model-card/model-card.ts`
- Create: `miniprogram/components/model-card/model-card.json`
- Create: `miniprogram/components/model-card/model-card.wxml`
- Create: `miniprogram/components/model-card/model-card.wxss`

**Interfaces:**
- Consumes: `Model` from `types/model`, `CATEGORY_MAP` from `types/model`
- Produces: model-card 组件 `properties: { model: Model }`, `triggerEvent('tap', { model })`, `triggerEvent('favorite', { modelId, isFavorite })`

- [ ] **Step 1: 创建 model-card.json**

```json
{
  "component": true,
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 model-card.wxml**

```xml
<view class="card" bindtap="onTap">
  <view class="card-thumb-wrap">
    <image class="card-thumb" src="{{model.thumbnail}}" mode="aspectFill" lazy-load />
    <view class="card-tag" wx:if="{{model.faces}}">
      <text class="tag-text">{{facesText}}</text>
    </view>
    <view class="favorite-btn" catchtap="onFavorite">
      <text class="favorite-icon">{{isFavorite ? '❤️' : '🤍'}}</text>
    </view>
  </view>
  <view class="card-body">
    <text class="card-name">{{model.name}}</text>
    <text class="card-desc">{{model.description || '暂无简介'}}</text>
    <view class="card-footer">
      <view class="card-merchant">
        <image class="merchant-avatar" src="{{model.merchantAvatar}}" mode="aspectFill" />
        <text class="merchant-name">{{model.merchantName}}</text>
      </view>
      <view class="card-category">
        <text class="category-text">{{categoryText}}</text>
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 创建 model-card.wxss**

直接复制 test2 `components/model-card/model-card.wxss` 全部内容（已在上下文读取过）。

- [ ] **Step 4: 创建 model-card.ts**

```typescript
import { CATEGORY_MAP, CategoryType } from '../../types/model'

Component({
  properties: {
    model: { type: Object, value: {} },
  },
  data: {
    isFavorite: false,
    facesText: '',
    categoryText: '',
  },
  observers: {
    'model': function (this: any, model: any) {
      if (model) {
        this.loadFavoriteStatus(model.id)
        this.setData({
          facesText: model.faces ? ((model.faces / 1000).toFixed(1) + 'K面') : '',
          categoryText: CATEGORY_MAP[model.category as CategoryType] || '道具',
        })
      }
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { model: this.properties.model })
    },
    loadFavoriteStatus(modelId: string) {
      try {
        const favorites: string[] = wx.getStorageSync('favorites') || []
        this.setData({ isFavorite: favorites.includes(modelId) })
      } catch (_) {
        this.setData({ isFavorite: false })
      }
    },
    onFavorite() {
      const modelId = (this.properties.model as any).id as string
      let favorites: string[] = []
      try { favorites = wx.getStorageSync('favorites') || [] } catch (_) {}

      let newFavorites: string[]
      let isFavorite: boolean
      if (favorites.includes(modelId)) {
        newFavorites = favorites.filter(id => id !== modelId)
        isFavorite = false
        wx.showToast({ title: '已取消收藏', icon: 'none' })
      } else {
        newFavorites = [...favorites, modelId]
        isFavorite = true
        wx.showToast({ title: '收藏成功', icon: 'success' })
      }
      try { wx.setStorageSync('favorites', newFavorites) } catch (_) {}
      this.setData({ isFavorite })
      this.triggerEvent('favorite', { modelId, isFavorite })
    },
  },
})
```

---

### Task 8: 首页 (index)

**Files:**
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/index/index.json`

**Interfaces:**
- Consumes: `modelService` from `services/model-service`, `bannersData` from `data/banners`
- Produces: 首页完整 UI

- [ ] **Step 1: 创建 index.json**

```json
{
  "usingComponents": {
    "top-bar": "/components/top-bar/top-bar",
    "tab-bar": "/components/tab-bar/tab-bar",
    "model-card": "/components/model-card/model-card"
  },
  "navigationStyle": "custom"
}
```

- [ ] **Step 2: 创建 index.wxml**

```xml
<view class="home-page">
  <top-bar title="主页" />
  <view class="page-content">
    <!-- 轮播图 -->
    <view class="banner-section">
      <swiper
        class="banner-swiper"
        indicator-dots autoplay interval="4000" duration="500" circular
        indicator-color="rgba(255,255,255,0.3)"
        indicator-active-color="#4ecdc4"
      >
        <swiper-item wx:for="{{banners}}" wx:key="id" bindtap="onBannerTap" data-link="{{item.link}}">
          <view class="banner-item">
            <image class="banner-image" src="{{item.image}}" mode="aspectFill" />
            <view class="banner-overlay"></view>
            <view class="banner-content">
              <text class="banner-title">{{item.title}}</text>
              <text class="banner-subtitle">{{item.subtitle}}</text>
            </view>
          </view>
        </swiper-item>
      </swiper>
    </view>

    <!-- 热门推荐 -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">热门推荐</text>
      </view>
      <view class="hot-list">
        <view
          wx:for="{{displayHotModels}}" wx:key="id" class="hot-item"
          bindtap="onHotItemTap" data-model="{{item}}"
        >
          <view class="hot-image-wrapper">
            <image class="hot-image" src="{{item.thumbnail}}" mode="aspectFill" />
            <view class="hot-rank" wx:if="{{index < 3}}">
              <text class="rank-num">{{index + 1}}</text>
            </view>
          </view>
          <view class="hot-info">
            <text class="hot-name">{{item.name}}</text>
            <text class="hot-merchant">{{item.merchantName}}</text>
            <view class="hot-stats">
              <text class="hot-stat">👁️ {{item.views}}</text>
              <text class="hot-stat">❤️ {{item.favorites}}</text>
            </view>
          </view>
        </view>
      </view>
      <view class="expand-btn" wx:if="{{hotModels.length > 2 && !hotExpanded}}" bindtap="onExpandHot">
        <text class="expand-text">展开更多 ({{hotModels.length - 2}}个)</text>
        <text class="expand-icon">▼</text>
      </view>
      <view class="expand-btn" wx:if="{{hotExpanded}}" bindtap="onCollapseHot">
        <text class="expand-text">收起</text>
        <text class="expand-icon">▲</text>
      </view>
    </view>

    <!-- 精选模型 -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">精选模型</text>
        <text class="section-more" bindtap="onGoBrowse">查看全部 ›</text>
      </view>
      <scroll-view class="featured-scroll" scroll-x enhanced show-scrollbar="{{false}}">
        <view class="featured-list">
          <view wx:for="{{featuredModels}}" wx:key="id" class="featured-item">
            <model-card model="{{item}}" bind:tap="onCardTap" />
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 商家入驻引导 -->
    <view class="section">
      <view class="cta-banner" bindtap="onGoMerchant">
        <view class="cta-text">
          <text class="cta-title">拥有自己的3D模型？</text>
          <text class="cta-subtitle">立即入驻，获得专属展示位，让更多人看见你的作品</text>
        </view>
        <view class="cta-arrow">›</view>
      </view>
    </view>

    <view class="bottom-spacer"></view>
  </view>
  <tab-bar active="home" />
</view>
```

- [ ] **Step 3: 创建 index.wxss**

复制 test2 `pages/index/index.wxss` 全部内容。

- [ ] **Step 4: 创建 index.ts**

```typescript
import { Model, Banner } from '../../types/model'
import { modelService } from '../../services/model-service'
import { bannersData } from '../../data/banners'

Component({
  data: {
    banners: [] as Banner[],
    hotModels: [] as Model[],
    displayHotModels: [] as Model[],
    hotExpanded: false,
    featuredModels: [] as Model[],
  },
  lifetimes: {
    async attached() {
      const hotModels = await modelService.getHotModels()
      const featuredModels = await modelService.getFeaturedModels()
      this.setData({
        banners: bannersData,
        hotModels,
        displayHotModels: hotModels.slice(0, 2),
        featuredModels,
      })
    },
  },
  methods: {
    onExpandHot() {
      this.setData({ displayHotModels: this.data.hotModels, hotExpanded: true })
    },
    onCollapseHot() {
      this.setData({ displayHotModels: this.data.hotModels.slice(0, 2), hotExpanded: false })
    },
    onHotItemTap(e: any) {
      const model = e.currentTarget.dataset.model as Model
      if (model) {
        wx.navigateTo({ url: '/pages/model-detail/model-detail?id=' + model.id })
      }
    },
    onCardTap(e: any) {
      const model = e.detail?.model as Model
      if (model) {
        wx.navigateTo({ url: '/pages/model-detail/model-detail?id=' + model.id })
      }
    },
    onBannerTap(e: any) {
      const link = e.currentTarget.dataset.link as string
      if (link) {
        if (link.startsWith('/pages/model-list')) {
          wx.switchTab({ url: link })
        } else {
          wx.navigateTo({ url: link })
        }
      }
    },
    onGoBrowse() {
      wx.switchTab({ url: '/pages/model-list/model-list' })
    },
    onGoMerchant() {
      wx.switchTab({ url: '/pages/merchant-center/merchant-center' })
    },
  },
})
```

---

### Task 9: 模型列表页 (model-list)

**Files:**
- Create: `miniprogram/pages/model-list/model-list.ts`
- Create: `miniprogram/pages/model-list/model-list.json`
- Create: `miniprogram/pages/model-list/model-list.wxml`
- Create: `miniprogram/pages/model-list/model-list.wxss`

**Interfaces:**
- Consumes: `modelService`, `CATEGORY_MAP`
- Produces: 模型库 Tab 页面（分类筛选 + 搜索 + 网格列表）

- [ ] **Step 1: 创建 model-list 页面**

`model-list.json`:

```json
{
  "usingComponents": {
    "top-bar": "/components/top-bar/top-bar",
    "tab-bar": "/components/tab-bar/tab-bar",
    "model-card": "/components/model-card/model-card"
  },
  "navigationStyle": "custom"
}
```

`model-list.wxml`:

```xml
<view class="page">
  <top-bar title="模型库" />
  <view class="page-content">
    <view class="search-bar">
      <input class="search-input" placeholder="搜索模型..." value="{{keyword}}" bindinput="onSearchInput" />
    </view>
    <scroll-view class="category-scroll" scroll-x show-scrollbar="{{false}}">
      <view class="category-list">
        <view
          wx:for="{{categories}}" wx:key="key"
          class="cat-item {{activeCategory === item.key ? 'active' : ''}}"
          data-key="{{item.key}}" bindtap="onCategoryTap"
        >
          <text>{{item.label}}</text>
        </view>
      </view>
    </scroll-view>
    <view class="model-grid">
      <view wx:for="{{displayModels}}" wx:key="id" class="grid-item">
        <model-card model="{{item}}" bind:tap="onCardTap" />
      </view>
    </view>
    <view class="empty" wx:if="{{displayModels.length === 0}}">
      <text>暂无模型</text>
    </view>
    <view class="bottom-spacer"></view>
  </view>
  <tab-bar active="browse" />
</view>
```

`model-list.wxss`:

```css
page { background: #f5f5f5; }
.page { min-height: 100vh; }
.page-content { padding-top: 180rpx; padding-bottom: 120rpx; padding-left: 24rpx; padding-right: 24rpx; }

.search-bar { padding: 16rpx 0; }
.search-input {
  background: #fff; border-radius: 32rpx; padding: 16rpx 32rpx;
  font-size: 28rpx; color: #333; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04);
}

.category-scroll { margin: 16rpx 0; white-space: nowrap; }
.category-list { display: flex; gap: 12rpx; }
.cat-item {
  display: inline-flex; padding: 12rpx 28rpx;
  background: #fff; border-radius: 32rpx; font-size: 26rpx; color: #666;
  box-shadow: 0 2rpx 6rpx rgba(0,0,0,0.04);
}
.cat-item.active { background: #4ecdc4; color: #fff; font-weight: 500; }

.model-grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
.grid-item { width: 340rpx; margin-bottom: 16rpx; }

.empty { text-align: center; padding: 80rpx 0; color: #999; font-size: 28rpx; }
.bottom-spacer { height: 20rpx; }
```

`model-list.ts`:

```typescript
import { Model, CATEGORY_MAP, CategoryType } from '../../types/model'
import { modelService } from '../../services/model-service'

Component({
  data: {
    keyword: '',
    activeCategory: 'all',
    categories: [] as { key: string; label: string }[],
    allModels: [] as Model[],
    displayModels: [] as Model[],
  },
  lifetimes: {
    async attached() {
      const models = await modelService.getHotModels()
      const cats = [{ key: 'all', label: '全部' }, ...modelService.getAllCategories()]
      this.setData({ allModels: models, displayModels: models, categories: cats })
    },
  },
  methods: {
    onSearchInput(e: any) {
      const keyword = (e.detail.value || '').trim()
      this.setData({ keyword })
      this._filter()
    },
    onCategoryTap(e: any) {
      this.setData({ activeCategory: e.currentTarget.dataset.key })
      this._filter()
    },
    _filter() {
      let list = this.data.allModels
      if (this.data.activeCategory !== 'all') {
        list = list.filter(m => m.category === this.data.activeCategory)
      }
      if (this.data.keyword) {
        const kw = this.data.keyword.toLowerCase()
        list = list.filter(m =>
          m.name.toLowerCase().includes(kw) || m.tags.some(t => t.includes(kw))
        )
      }
      this.setData({ displayModels: list })
    },
    onCardTap(e: any) {
      const model = e.detail?.model as Model
      if (model) {
        wx.navigateTo({ url: '/pages/model-detail/model-detail?id=' + model.id })
      }
    },
  },
})
```

---

### Task 10: 模型详情页 (model-detail)

**Files:**
- Create: `miniprogram/pages/model-detail/model-detail.ts`
- Create: `miniprogram/pages/model-detail/model-detail.json`
- Create: `miniprogram/pages/model-detail/model-detail.wxml`
- Create: `miniprogram/pages/model-detail/model-detail.wxss`

**Interfaces:**
- Consumes: `modelService`
- Produces: 模型详情页（大图 + 信息 + 3D查看按钮）

- [ ] **Step 1: 创建 model-detail 页面**

`model-detail.json`:

```json
{
  "usingComponents": {
    "top-bar": "/components/top-bar/top-bar"
  },
  "navigationStyle": "custom"
}
```

`model-detail.wxml`:

```xml
<view class="page">
  <top-bar title="{{model.name || '模型详情'}}" showBack="{{true}}" />
  <view class="page-content">
    <image class="detail-image" src="{{model.thumbnail}}" mode="aspectFill" />
    <view class="info-card">
      <text class="model-name">{{model.name}}</text>
      <text class="model-desc">{{model.description}}</text>
      <view class="info-row">
        <text class="info-label">面数</text>
        <text class="info-value">{{facesText}}</text>
      </view>
      <view class="info-row">
        <text class="info-label">格式</text>
        <text class="info-value">{{model.format}}</text>
      </view>
      <view class="info-row">
        <text class="info-label">商家</text>
        <text class="info-value">{{model.merchantName}}</text>
      </view>
      <view class="info-row">
        <text class="info-label">浏览量</text>
        <text class="info-value">👁️ {{model.views}}</text>
      </view>
    </view>
    <view class="action-bar">
      <button class="btn-3d" bindtap="onView3D">🔍 3D 查看</button>
    </view>
    <view class="bottom-spacer"></view>
  </view>
</view>
```

`model-detail.wxss`:

```css
page { background: #f5f5f5; }
.page { min-height: 100vh; }
.page-content { padding-top: 180rpx; padding-bottom: 40rpx; }

.detail-image { width: 100%; height: 500rpx; }
.info-card {
  margin: 24rpx; padding: 24rpx;
  background: #fff; border-radius: 16rpx; box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.06);
}
.model-name { font-size: 34rpx; font-weight: 600; color: #1a1a1a; display: block; margin-bottom: 12rpx; }
.model-desc { font-size: 26rpx; color: #666; line-height: 1.6; display: block; margin-bottom: 20rpx; }
.info-row { display: flex; justify-content: space-between; padding: 12rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 26rpx; color: #999; }
.info-value { font-size: 26rpx; color: #333; }

.action-bar { padding: 24rpx; }
.btn-3d {
  width: 100%; padding: 24rpx;
  background: linear-gradient(135deg, #4ecdc4, #44a08d);
  color: #fff; border-radius: 16rpx; font-size: 32rpx; font-weight: 500;
  text-align: center;
}
.bottom-spacer { height: 40rpx; }
```

`model-detail.ts`:

```typescript
import { Model } from '../../types/model'
import { modelService } from '../../services/model-service'

Component({
  data: {
    model: {} as Model,
    facesText: '',
  },
  methods: {
    async onLoad(options: { id?: string }) {
      const id = options.id || ''
      const model = await modelService.getModelById(id)
      if (model) {
        this.setData({
          model,
          facesText: model.faces ? ((model.faces / 1000).toFixed(1) + 'K面') : '',
        })
      }
    },
    onView3D() {
      const model = this.data.model
      wx.navigateTo({
        url: '/subpackages/modelViewer/pages/viewer/viewer?id=' + model.id +
          '&name=' + encodeURIComponent(model.name),
      })
    },
  },
})
```

---

### Task 11: 商户中心 (merchant-center) / 商户模型 (merchant-models) / 店铺首页 (store-front)

**模板页面（结构相似，数据不同）：**

- [ ] **Step 1: merchant-center** — 消息列表占位页，用 top-bar + tab-bar(active="merchant")

```json
{ "usingComponents": { "top-bar": "/components/top-bar/top-bar", "tab-bar": "/components/tab-bar/tab-bar" }, "navigationStyle": "custom" }
```

wxml: 简单占位布局（顶部栏+中间提示"消息中心建设中"+底部tab-bar）

ts: 空 Component

- [ ] **Step 2: merchant-models** — 商家模型列表页，带 top-bar(showBack=true)，调用 modelService.getModelsByMerchant(id)

- [ ] **Step 3: store-front** — 店铺首页，显示商家信息（avatar/cover/description/stats）

以上三个页面均创建完整的 .ts/.json/.wxml/.wxss 四件套。

---

### Task 12: profile / favorites / pricing / shop-settings 页面

**模板页面（结构相似）：**

- [ ] **Step 1: profile** — 个人中心 Tab 页，top-bar(title="我的") + tab-bar(active="profile")，显示用户头像占位 + 登录/注册入口 + 收藏/设置链接
- [ ] **Step 2: favorites** — 收藏夹，top-bar(title="我的收藏", showBack=true)，读取 Storage 中收藏列表，展示 model-card 列表
- [ ] **Step 3: pricing** — 套餐定价，top-bar(title="套餐定价", showBack=true)，展示 plansData 三个套餐卡片
- [ ] **Step 4: shop-settings** — 店铺设置，top-bar(title="店铺设置", showBack=true)，表单占位页

---

### Task 13: login / register / reset-pwd 页面

- [ ] **Step 1: login** — 登录页，top-bar(title="登录", showBack=true)，用户名+密码输入框，调用 userService.login()
- [ ] **Step 2: register** — 注册页，top-bar(title="注册", showBack=true)，用户名+密码+确认密码，调用 userService.register()
- [ ] **Step 3: reset-pwd** — 密码重置，top-bar(title="找回密码", showBack=true)，输入用户名，调用 userService.resetPassword()

---

### Task 14: 分包 — 适配器文件迁移

**Files:**
- Create: `miniprogram/subpackages/modelViewer/adapters/weapp-adapter.js` — 从 test3 复制
- Create: `miniprogram/subpackages/modelViewer/adapters/glb-loader.js` — 从 test3 复制
- Create: `miniprogram/subpackages/modelViewer/adapters/three-bundle.js` — 从 test3 复制
- Create: `miniprogram/subpackages/modelViewer/adapters/model-db.js` — 从 test3 复制

**注意：** 修改适配器中的相对路径引用，使其指向分包内路径。

- [ ] **Step 1: 从 test3 复制 weapp-adapter.js**

源: `d:\Code\benchuang\test3\miniprogram\utils\weapp-adapter.js`
目标: `miniprogram/subpackages/modelViewer/adapters/weapp-adapter.js`

- [ ] **Step 2: 从 test3 复制 glb-loader.js**

源: `d:\Code\benchuang\test3\miniprogram\utils\glb-loader.js`
目标: `miniprogram/subpackages/modelViewer/adapters/glb-loader.js`

- [ ] **Step 3: 从 test3 复制 three-bundle.js**

源: `d:\Code\benchuang\test3\miniprogram\utils\three-bundle.js`
目标: `miniprogram/subpackages/modelViewer/adapters/three-bundle.js`

- [ ] **Step 4: 从 test3 复制 model-db.js**

源: `d:\Code\benchuang\test3\miniprogram\utils\model-db.js`
目标: `miniprogram/subpackages/modelViewer/adapters/model-db.js`

- [ ] **Step 5: 修改 model-db.js 中的路径引用**

将 `model-db.js` 中对数据文件的引用改为指向分包内的数据副本（或主包 data 目录）：
`require('../../data/models')` → `require('../../data/models')`（分包内做数据副本）

- [ ] **Step 6: 在分包目录下创建 data/models.js 副本**

```javascript
// 从 miniprogram/data/models.ts 导出的数据，因为 adapter 是 .js，需 CommonJS 格式
// 实际内容与 test3 miniprogram/data/models.js 一致
module.exports = [ /* 8 个模型数据 */ ]
```

---

### Task 15: 分包 — OBJ 加载器

**Files:**
- Create: `miniprogram/subpackages/modelViewer/adapters/obj-loader.ts`

**Interfaces:**
- Consumes: `THREE`
- Produces: `loadOBJ(arrayBuffer: ArrayBuffer, THREE: any): THREE.Group`

- [ ] **Step 1: 创建 obj-loader.ts — OBJ 文本解析器**

```typescript
/**
 * OBJ 文件自解析器
 * 将 OBJ 文本格式解析为 THREE.BufferGeometry
 * 支持: v, vn, vt, f (三角面/四边面)
 */
interface OBJParsed {
  positions: number[]
  normals: number[]
  uvs: number[]
  faces: { v: number[]; vn: number[]; vt: number[] }[]
}

function parseOBJText(text: string): OBJParsed {
  const result: OBJParsed = { positions: [], normals: [], uvs: [], faces: [] }
  const lines = text.split('\n')

  for (let line of lines) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue

    const parts = line.split(/\s+/)
    const type = parts[0]

    switch (type) {
      case 'v': // 顶点
        result.positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]))
        break
      case 'vn': // 法线
        result.normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]))
        break
      case 'vt': // UV
        result.uvs.push(parseFloat(parts[1]), parseFloat(parts[2]))
        break
      case 'f': { // 面
        // 格式: f v1/vt1/vn1 v2/vt2/vn2 v3/vt3/vn3 或 f v1//vn1 v2//vn2 v3//vn3
        const face: OBJParsed['faces'][0] = { v: [], vn: [], vt: [] }
        for (let i = 1; i < parts.length; i++) {
          const indices = parts[i].split('/')
          face.v.push(parseInt(indices[0]) - 1)  // OBJ 索引从 1 开始
          face.vt.push(indices[1] ? parseInt(indices[1]) - 1 : -1)
          face.vn.push(indices[2] ? parseInt(indices[2]) - 1 : -1)
        }
        result.faces.push(face)
        break
      }
    }
  }
  return result
}

function triangulate(parsed: OBJParsed): { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } {
  const out = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[] }
  const vertexMap = new Map<string, number>()
  let nextIndex = 0

  const getVertexKey = (vIdx: number, vtIdx: number, vnIdx: number): string =>
    `${vIdx}/${vtIdx}/${vnIdx}`

  const addVertex = (vIdx: number, vtIdx: number, vnIdx: number): number => {
    const key = getVertexKey(vIdx, vtIdx, vnIdx)
    if (vertexMap.has(key)) return vertexMap.get(key)!

    // 位置 (vIdx * 3 是因为每个顶点的 x,y,z 连续存储)
    out.positions.push(
      parsed.positions[vIdx * 3],
      parsed.positions[vIdx * 3 + 1],
      parsed.positions[vIdx * 3 + 2]
    )
    // 法线
    if (vnIdx >= 0 && parsed.normals.length > 0) {
      out.normals.push(
        parsed.normals[vnIdx * 3],
        parsed.normals[vnIdx * 3 + 1],
        parsed.normals[vnIdx * 3 + 2]
      )
    }
    // UV
    if (vtIdx >= 0 && parsed.uvs.length > 0) {
      out.uvs.push(parsed.uvs[vtIdx * 2], parsed.uvs[vtIdx * 2 + 1])
    }
    const idx = nextIndex++
    vertexMap.set(key, idx)
    return idx
  }

  for (const face of parsed.faces) {
    // Fan triangulation for quads/n-gons
    for (let j = 1; j < face.v.length - 1; j++) {
      out.indices.push(
        addVertex(face.v[0], face.vt[0], face.vn[0]),
        addVertex(face.v[j], face.vt[j], face.vn[j]),
        addVertex(face.v[j + 1], face.vt[j + 1], face.vn[j + 1])
      )
    }
  }

  return out
}

export function loadOBJ(arrayBuffer: ArrayBuffer, THREE: any): any {
  // 尝试用 TextDecoder 解码，回退到逐字节转换
  let text: string
  try {
    text = new TextDecoder('utf-8').decode(arrayBuffer)
  } catch (_) {
    const arr = new Uint8Array(arrayBuffer)
    let str = ''
    for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i])
    text = str
  }

  const parsed = parseOBJText(text)
  const tri = triangulate(parsed)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.positions, 3))
  if (tri.normals.length > 0) {
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(tri.normals, 3))
  } else {
    geo.computeVertexNormals()
  }
  if (tri.uvs.length > 0) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(tri.uvs, 2))
  }
  geo.setIndex(tri.indices)

  const material = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.5,
    metalness: 0.3,
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.castShadow = true
  mesh.receiveShadow = true

  const group = new THREE.Group()
  group.name = 'OBJ_Model'
  group.add(mesh)
  return group
}
```

---

### Task 16: 分包 — 统一模型加载器

**Files:**
- Create: `miniprogram/subpackages/modelViewer/adapters/model-loader.ts`

**Interfaces:**
- Consumes: `loadOBJ` from `obj-loader`, `glbLoader` from `glb-loader`
- Produces: `loadModel(url, THREE, canvas): Promise<THREE.Group>` — 自动检测格式

- [ ] **Step 1: 创建 model-loader.ts**

```typescript
/**
 * 统一模型加载器
 * 自动检测 GLB/OBJ 格式并路由到对应解析器
 */

import { loadOBJ } from './obj-loader'

const glbLoader = require('./glb-loader')

/** 检测文件格式（基于文件扩展名或 magic bytes） */
function detectFormat(data: ArrayBuffer, url: string): 'glb' | 'obj' {
  // 1. URL 扩展名优先
  const lower = url.toLowerCase()
  if (lower.endsWith('.obj')) return 'obj'
  if (lower.endsWith('.glb')) return 'glb'

  // 2. Magic bytes 检测
  if (data.byteLength >= 4) {
    const magic = new DataView(data).getUint32(0, true)
    if (magic === 0x46546C67) return 'glb'  // 'glTF'
  }

  // 3. 文本首行检测（OBJ 以 'v ' 或 '# ' 开头）
  try {
    const head = new Uint8Array(data.slice(0, 20))
    const str = String.fromCharCode.apply(null, Array.from(head))
    if (str.startsWith('v ') || str.startsWith('# ') || str.includes('mtllib')) return 'obj'
  } catch (_) {}

  return 'glb' // 默认
}

export async function loadModel(
  url: string,
  THREE: any,
  canvas: any,
): Promise<any> {
  // 下载模型文件
  const adapter = require('./weapp-adapter')
  const data: ArrayBuffer = await adapter.downloadBinary(url)

  const format = detectFormat(data, url)
  console.log('[model-loader] Detected format:', format, 'for', url)

  if (format === 'obj') {
    return loadOBJ(data, THREE)
  } else {
    // 调用 glb-loader 的 loadGLBModel（它内部处理下载，这里我们用已下载的数据）
    // glb-loader 需要传入 canvas，走 downloadFile → parse 路径
    // 为保持兼容，直接调用 glbLoader 现有 API
    return glbLoader.loadGLBModel(url, THREE, canvas)
  }
}
```

---

### Task 17: 分包 — 3D Viewer 页面

**Files:**
- Create: `miniprogram/subpackages/modelViewer/pages/viewer/viewer.ts`
- Create: `miniprogram/subpackages/modelViewer/pages/viewer/viewer.json`
- Create: `miniprogram/subpackages/modelViewer/pages/viewer/viewer.wxml`
- Create: `miniprogram/subpackages/modelViewer/pages/viewer/viewer.wxss`

**Interfaces:**
- Consumes: `weapp-adapter`, `three-bundle`, `model-loader`, `model-db`, `data/models`
- Produces: 完整的 3D viewer 页面

- [ ] **Step 1: 创建 viewer.json**

```json
{
  "navigationStyle": "custom",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 viewer.wxml**

```xml
<view class="viewer-page">
  <!-- 自定义导航栏 -->
  <view class="viewer-header">
    <view class="header-back" bindtap="onBack">
      <text class="back-icon">‹</text>
      <text class="back-text">返回</text>
    </view>
    <text class="header-title">{{modelName || '3D 查看器'}}</text>
  </view>

  <!-- Canvas 区域 -->
  <view class="canvas-area">
    <canvas type="webgl" id="glcanvas" class="gl-canvas"
      bindtouchstart="onTouchStart"
      bindtouchmove="onTouchMove"
      bindtouchend="onTouchEnd">
    </canvas>

    <!-- 加载遮罩 -->
    <view class="mask loading-mask" wx:if="{{!modelLoaded && !errorMsg}}">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 错误遮罩 -->
    <view class="mask error-mask" wx:if="{{errorMsg}}">
      <text class="error-text">{{errorMsg}}</text>
      <view class="error-retry" bindtap="onRetry">
        <text>重试</text>
      </view>
    </view>

    <!-- 光源面板 -->
    <view class="light-panel" wx:if="{{showLightPanel}}">
      <view
        wx:for="{{lightPresets}}" wx:key="key"
        class="light-item {{lightPresetIndex === index ? 'active' : ''}}"
        data-index="{{index}}" bindtap="onSelectLightPreset"
      >
        <text>{{item}}</text>
      </view>
    </view>
  </view>

  <!-- 底部控制栏 -->
  <view class="control-bar">
    <view class="ctrl-btn {{showLightPanel ? 'active' : ''}}" bindtap="onToggleLight">
      <text>💡 光源</text>
    </view>
    <view class="ctrl-btn {{isRotating ? 'active' : ''}}" bindtap="onToggleRotation">
      <text>{{isRotating ? '⏸️ 暂停' : '▶️ 旋转'}}</text>
    </view>
    <view class="ctrl-btn" bindtap="onRetry">
      <text>🔄 重置</text>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 创建 viewer.wxss**

```css
.viewer-page { display: flex; flex-direction: column; height: 100vh; background: #1a1a2e; }

.viewer-header {
  height: 88rpx; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.6); position: relative; z-index: 10;
}
.header-back { position: absolute; left: 16rpx; display: flex; align-items: center; padding: 8rpx 16rpx; }
.back-icon { font-size: 44rpx; color: #fff; }
.back-text { font-size: 28rpx; color: #fff; margin-left: 4rpx; }
.header-title { font-size: 32rpx; color: #fff; font-weight: 500; }

.canvas-area { flex: 1; position: relative; overflow: hidden; }
.gl-canvas { width: 100%; height: 100%; }

.mask { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 20; }
.loading-mask { background: rgba(26, 26, 46, 0.85); }
.loading-text { font-size: 30rpx; color: #fff; }
.error-mask { background: rgba(26, 26, 46, 0.9); }
.error-text { font-size: 26rpx; color: #ff6b6b; text-align: center; padding: 0 40rpx; margin-bottom: 24rpx; }
.error-retry { padding: 16rpx 48rpx; background: #4ecdc4; border-radius: 32rpx; color: #fff; font-size: 28rpx; }

.light-panel {
  position: absolute; bottom: 16rpx; left: 16rpx;
  display: flex; flex-direction: column; gap: 8rpx;
  background: rgba(0, 0, 0, 0.7); border-radius: 12rpx; padding: 12rpx; z-index: 30;
}
.light-item { padding: 12rpx 24rpx; border-radius: 8rpx; font-size: 24rpx; color: rgba(255, 255, 255, 0.7); }
.light-item.active { background: #4ecdc4; color: #fff; font-weight: 500; }

.control-bar {
  height: 100rpx; display: flex; align-items: center; justify-content: space-around;
  background: rgba(0, 0, 0, 0.7); z-index: 10;
  padding-bottom: env(safe-area-inset-bottom);
}
.ctrl-btn { padding: 12rpx 24rpx; border-radius: 32rpx; font-size: 26rpx; color: rgba(255, 255, 255, 0.7); transition: all 0.2s; }
.ctrl-btn.active { background: #4ecdc4; color: #fff; font-weight: 500; }
```

- [ ] **Step 4: 创建 viewer.ts（核心逻辑）**

从 test3 `3dplayer.ts` 完整移植，适配新路径。关键修改：
- 适配器路径: `../../adapters/weapp-adapter`
- three.js 路径: `../../adapters/three-bundle`
- 使用 model-loader 统一入口加载模型
- 其余逻辑（场景初始化、光照、手势、渲染循环、内存管理）保持不变

完整代码约 500 行，从 test3 `miniprogram/pages/3dplayer/3dplayer.ts` 移植并适配路径。

---

### Task 18: 集成验证

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd d:\Code\benchuang\test6 && npx tsc --noEmit
```
预期: 零错误

- [ ] **Step 2: 验证文件清单完整性**

检查以下文件全部存在:

主包 types/services/components/pages/*13个页面（每个页面4个文件 + 3个component共12个文件）
分包 adapters/*5个 + viewer/*4个

- [ ] **Step 3: 删除旧文件**

确保 `miniprogram/pages/logs/` 已删除。确保 `miniprogram/utils/util.ts` 若无需保留则删除。

- [ ] **Step 4: 在微信开发者工具中打开编译验证**

预期: 能正常编译，无模块找不到错误。
