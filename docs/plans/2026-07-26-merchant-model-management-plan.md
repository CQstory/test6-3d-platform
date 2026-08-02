# 商家模型管理 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现商家中心的模型管理功能（模型 CRUD、数据看板、电商链接、Tab 角色适配）

**Architecture:** 在现有三层架构（Pages → Services → Data）上扩展，新增 model-item 组件和 model-form 页面，merchant-center 页面重写为角色自适应 + 双 Tab 布局

**Tech Stack:** TypeScript, 微信小程序原生框架, 现有 Service/Mock 架构

## Global Constraints

- USE_MOCK 开关控制 Mock/Real 模式，所有新方法必须支持双模式
- TypeScript strict 模式，禁止 any
- 微信小程序不能有动态 tabBar 配置，角色切换通过页面内判断
- 文件上传 Mock 模式返回模拟 URL
- 电商链接最多 5 条

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `types/model.ts` | 修改 | 新增 ShopLink、ModelStatus，扩展 Model 接口 |
| `data/models.ts` | 修改 | 现有模型数据补充新字段默认值 |
| `components/model-item/model-item.json` | 新建 | 组件配置 |
| `components/model-item/model-item.ts` | 新建 | 组件逻辑：属性绑定 + 事件抛出 |
| `components/model-item/model-item.wxml` | 新建 | 组件模板：左图右文三行布局 |
| `components/model-item/model-item.wxss` | 新建 | 组件样式 |
| `components/tab-bar/tab-bar.ts` | 修改 | 新增 role 属性，动态生成第三标签 |
| `pages/merchant-center/merchant-center.ts` | 重写 | 角色判断、双 Tab 切换、数据加载 |
| `pages/merchant-center/merchant-center.wxml` | 重写 | 双 Tab + model-item 列表 + 浮动按钮 + 通知占位 |
| `pages/merchant-center/merchant-center.wxss` | 重写 | 新布局样式 |
| `pages/model-form/model-form.json` | 新建 | 页面配置 |
| `pages/model-form/model-form.ts` | 新建 | 表单逻辑：新增/编辑、文件上传、电商链接动态列表 |
| `pages/model-form/model-form.wxml` | 新建 | 表单模板 |
| `pages/model-form/model-form.wxss` | 新建 | 表单样式 |
| `pages/model-detail/model-detail.wxml` | 修改 | 新增价格、材质、规格、电商链接展示 |
| `pages/model-detail/model-detail.wxss` | 修改 | 新增展示区域样式 |
| `services/model-service.ts` | 修改 | 新增 5 个方法 |
| `app.json` | 修改 | 注册 model-form 路由 |
| 使用 tab-bar 的 4 个页面 wxml | 修改 | 传入 role 属性 |

---

### Task 1: 类型扩展 + Mock 数据补充

**Files:**
- Modify: `miniprogram/types/model.ts`
- Modify: `miniprogram/data/models.ts`

**Interfaces:**
- Produces: `ShopLink` interface, `ModelStatus` type, 扩展后的 `Model` interface（含 price, material, dimensions, status, shopLinks）

- [ ] **Step 1: 扩展 types/model.ts**

在 `types/model.ts` 中，`CATEGORY_MAP` 之前添加：

```typescript
/** 电商链接 */
export interface ShopLink {
  platform: string
  shopName: string
  url: string
}

/** 模型发布状态 */
export type ModelStatus = 'published' | 'flagged' | 'removed'
```

在 `Model` 接口中，`favorites: number` 之后添加：

```typescript
  price: number
  material: string
  dimensions: string
  status: ModelStatus
  shopLinks: ShopLink[]
```

- [ ] **Step 2: 补充 data/models.ts 中所有模型条目的新字段**

为 `modelsData` 中每个模型对象追加以下默认值（在 `favorites` 行之后）：

```typescript
    price: 0,
    material: '',
    dimensions: '',
    status: 'published',
    shopLinks: [],
```

每个模型独立添加，共 8 个条目。例如第一个：

```typescript
// Damaged Helmet — 在 favorites: 386, 之后加：
    price: 0,
    material: '',
    dimensions: '',
    status: 'published',
    shopLinks: [],
```

- [ ] **Step 3: 编译验证**

运行 TypeScript 编译检查是否有类型错误：

```powershell
npx tsc --noEmit
```

预期：无错误输出。

- [ ] **Step 4: Commit**

```bash
git add miniprogram/types/model.ts miniprogram/data/models.ts
git commit -m "feat: 扩展 Model 类型，新增 price/material/dimensions/status/shopLinks 字段"
```

---

### Task 2: model-item 组件

**Files:**
- Create: `miniprogram/components/model-item/model-item.json`
- Create: `miniprogram/components/model-item/model-item.ts`
- Create: `miniprogram/components/model-item/model-item.wxml`
- Create: `miniprogram/components/model-item/model-item.wxss`

**Interfaces:**
- Consumes: `Model`（扩展后）
- Produces: `model-item` 组件：属性 `model: Model`, `showStatus: Boolean`, `showPrice: Boolean`；事件 `bind:tap`

- [ ] **Step 1: 创建 model-item.json**

```json
{
  "component": true,
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 model-item.ts**

```typescript
import { Model, CATEGORY_MAP } from '../../types/model'

const STATUS_MAP: Record<string, string> = {
  published: '已发布',
  flagged: '违规',
  removed: '已撤回',
}

Component({
  properties: {
    model: { type: Object, value: {} as Model },
    showStatus: { type: Boolean, value: true },
    showPrice: { type: Boolean, value: true },
  },
  data: {
    categoryText: '',
    statusText: '',
    statusClass: '',
  },
  observers: {
    'model.category'(cat: string) {
      this.setData({ categoryText: CATEGORY_MAP[cat as keyof typeof CATEGORY_MAP] || cat })
    },
    'model.status'(s: string) {
      const status = s || 'published'
      this.setData({
        statusText: STATUS_MAP[status] || status,
        statusClass: 'status-' + status,
      })
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { model: this.properties.model })
    },
  },
})
```

- [ ] **Step 3: 创建 model-item.wxml**

```xml
<view class="model-item" bindtap="onTap">
  <image class="item-thumb" src="{{model.thumbnail}}" mode="aspectFill" />
  <view class="item-info">
    <text class="item-name">{{model.name}}</text>
    <view class="item-meta">
      <text class="item-price" wx:if="{{showPrice && model.price > 0}}">¥{{model.price}}</text>
      <text class="item-price free" wx:if="{{showPrice && model.price === 0}}">免费</text>
      <text class="item-category" wx:if="{{categoryText}}"> · {{categoryText}}</text>
    </view>
    <view class="item-footer">
      <text class="item-views">👁️ {{model.views}}</text>
      <text class="item-status {{statusClass}}" wx:if="{{showStatus}}">{{statusText}}</text>
    </view>
  </view>
</view>
```

- [ ] **Step 4: 创建 model-item.wxss**

```css
.model-item {
  display: flex;
  align-items: center;
  padding: 24rpx;
  background: #fff;
  border-radius: 16rpx;
  margin-bottom: 16rpx;
}
.item-thumb {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
  background: #f0f0f0;
}
.item-info {
  flex: 1;
  margin-left: 20rpx;
  overflow: hidden;
}
.item-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1a2e;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-meta {
  margin-top: 8rpx;
  display: flex;
  align-items: center;
}
.item-price {
  font-size: 28rpx;
  color: #e74c3c;
  font-weight: 500;
}
.item-price.free {
  color: #4ecdc4;
}
.item-category {
  font-size: 24rpx;
  color: #999;
}
.item-footer {
  margin-top: 8rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.item-views {
  font-size: 24rpx;
  color: #999;
}
.item-status {
  font-size: 22rpx;
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
}
.status-published {
  background: #e8f8f5;
  color: #4ecdc4;
}
.status-flagged {
  background: #fef5e7;
  color: #f0ad4e;
}
.status-removed {
  background: #f2f2f2;
  color: #999;
}
```

- [ ] **Step 5: 编译验证**

```powershell
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add miniprogram/components/model-item/
git commit -m "feat: 新增 model-item 组件，用于商家模型管理列表"
```

---

### Task 3: tab-bar 角色适配

**Files:**
- Modify: `miniprogram/components/tab-bar/tab-bar.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/model-list/model-list.wxml`
- Modify: `miniprogram/pages/merchant-center/merchant-center.wxml`
- Modify: `miniprogram/pages/profile/profile.wxml`

**Interfaces:**
- Consumes: `userService.getCurrentUser().role`
- Produces: tab-bar 组件新增 `role` 属性

- [ ] **Step 1: 修改 tab-bar.ts**

添加 `role` 属性，动态构建 tabs 数组：

```typescript
import { userService } from '../../services/user-service'

Component({
  properties: {
    active: { type: String, value: 'home' },
    role: { type: String, value: '' },
  },
  data: {
    tabs: [] as { key: string; label: string; icon: string }[],
  },
  lifetimes: {
    attached() {
      this._buildTabs()
    },
  },
  observers: {
    'role'() {
      this._buildTabs()
    },
  },
  methods: {
    _buildTabs() {
      const role = this.properties.role || (userService.getCurrentUser() || {} as any).role || 'user'
      const isMerchant = role === 'merchant'
      this.setData({
        tabs: [
          { key: 'home', label: '主页', icon: '🏠' },
          { key: 'browse', label: '模型库', icon: '📦' },
          {
            key: 'merchant',
            label: isMerchant ? '商家' : '消息',
            icon: isMerchant ? '🏪' : '💬',
          },
          { key: 'profile', label: '我的', icon: '👤' },
        ],
      })
    },
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

- [ ] **Step 2: 修改 4 个使用 tab-bar 的页面 wxml**

为每个 tab-bar 组件添加 `role` 属性。需要各页面先获取 role。

**pages/index/index.ts** 中 onLoad 里获取 role 并 setData：

```typescript
import { userService } from '../../services/user-service'
// 在 data 中添加：
role: '',
// 在 onLoad 中添加：
const user = userService.getCurrentUser()
this.setData({ role: user ? user.role : 'user' })
```

**pages/index/index.wxml**: `<tab-bar active="home" role="{{role}}" />`

同理修改 `model-list`、`merchant-center`、`profile` 的 ts 和 wxml。

具体地：

`pages/model-list/model-list.ts` — 在 data 加 `role: ''`，在 onLoad 中获取 role：

```typescript
import { userService } from '../../services/user-service'
// data 添加：
role: '',
// onLoad 末尾添加：
const user = userService.getCurrentUser()
this.setData({ role: user ? user.role : 'user' })
```

`pages/model-list/model-list.wxml`: `<tab-bar active="browse" role="{{role}}" />`

`pages/merchant-center/merchant-center.ts` — 在 data 加 `role: ''`（后面 Task 4 会重写此文件，此处为过渡）：

```typescript
import { userService } from '../../services/user-service'
// data 添加：
role: '',
// Page({}) 内添加 onLoad:
onLoad() {
  const user = userService.getCurrentUser()
  this.setData({ role: user ? user.role : 'user' })
},
```

`pages/merchant-center/merchant-center.wxml`: `<tab-bar active="merchant" role="{{role}}" />`

`pages/profile/profile.ts` — 在 data 加 `role: ''`，在 refresh 中获取：

```typescript
refresh() {
  const loggedIn = userService.isLoggedIn()
  const info = userService.getCurrentUser()
  this.setData({
    isLoggedIn: loggedIn,
    userInfo: info,
    role: info ? info.role : 'user',
  })
},
```

`pages/profile/profile.wxml`: `<tab-bar active="profile" role="{{role}}" />`

- [ ] **Step 3: 编译验证**

```powershell
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add miniprogram/components/tab-bar/tab-bar.ts miniprogram/pages/index/index.ts miniprogram/pages/index/index.wxml miniprogram/pages/model-list/model-list.ts miniprogram/pages/model-list/model-list.wxml miniprogram/pages/merchant-center/merchant-center.ts miniprogram/pages/merchant-center/merchant-center.wxml miniprogram/pages/profile/profile.ts miniprogram/pages/profile/profile.wxml
git commit -m "feat: tab-bar 新增 role 属性，根据角色动态切换第三标签（商家/消息）"
```

---

### Task 4: merchant-center 重写

**Files:**
- Modify: `miniprogram/pages/merchant-center/merchant-center.ts`
- Modify: `miniprogram/pages/merchant-center/merchant-center.wxml`
- Modify: `miniprogram/pages/merchant-center/merchant-center.wxss`

**Interfaces:**
- Consumes: `Model`（扩展后）、`modelService`、`userService`、`model-item` 组件
- Produces: 商家中心页面（角色判断 + 双 Tab + 通知占位）

- [ ] **Step 1: 重写 merchant-center.json**

添加 model-item 引用：

```json
{
  "usingComponents": {
    "top-bar": "/components/top-bar/top-bar",
    "tab-bar": "/components/tab-bar/tab-bar",
    "model-item": "/components/model-item/model-item"
  }
}
```

- [ ] **Step 2: 重写 merchant-center.ts**

```typescript
import { Model } from '../../types/model'
import { modelService } from '../../services/model-service'
import { userService } from '../../services/user-service'

Page({
  data: {
    role: '',
    isMerchant: false,
    activeTab: 'models' as 'models' | 'stats',
    models: [] as Model[],
    sortedModels: [] as Model[],
    stats: { total: 0, views: 0, favorites: 0 },
  },
  onLoad() {
    const user = userService.getCurrentUser()
    const role = user ? user.role : 'user'
    const isMerchant = role === 'merchant'
    this.setData({ role, isMerchant })
    if (isMerchant) {
      this._loadData()
    }
  },
  onShow() {
    const user = userService.getCurrentUser()
    const role = user ? user.role : 'user'
    const isMerchant = role === 'merchant'
    this.setData({ role, isMerchant })
    if (isMerchant) {
      this._loadData()
    }
  },
  async _loadData() {
    const models = await modelService.getMyModels()
    const total = models.length
    const views = models.reduce((s, m) => s + m.views, 0)
    const favorites = models.reduce((s, m) => s + m.favorites, 0)
    const sortedModels = [...models].sort((a, b) => b.views - a.views)
    this.setData({
      models,
      sortedModels,
      stats: { total, views, favorites },
    })
  },
  onTabTap(e: any) {
    this.setData({ activeTab: e.currentTarget.dataset.tab as 'models' | 'stats' })
  },
  onModelTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-form/model-form?id=' + model.id,
      })
    }
  },
  onAddModel() {
    wx.navigateTo({ url: '/pages/model-form/model-form' })
  },
})
```

- [ ] **Step 3: 重写 merchant-center.wxml**

```xml
<view class="page">
  <top-bar title="{{isMerchant ? '商家' : '消息'}}" />
  <view class="page-content">
    <!-- 普通用户：通知占位 -->
    <view class="placeholder" wx:if="{{!isMerchant}}">
      <text class="placeholder-icon">💬</text>
      <text class="placeholder-text">暂无新消息</text>
      <text class="placeholder-sub">系统通知、物流信息等将显示在此处</text>
    </view>

    <!-- 商家角色 -->
    <block wx:if="{{isMerchant}}">
      <!-- 内部 Tab -->
      <view class="inner-tabs">
        <view
          class="inner-tab {{activeTab === 'models' ? 'active' : ''}}"
          data-tab="models" bindtap="onTabTap"
        >模型管理</view>
        <view
          class="inner-tab {{activeTab === 'stats' ? 'active' : ''}}"
          data-tab="stats" bindtap="onTabTap"
        >数据看板</view>
      </view>

      <!-- 模型管理 Tab -->
      <view class="tab-content" wx:if="{{activeTab === 'models'}}">
        <view wx:if="{{models.length === 0}}" class="empty-state">
          <text class="empty-icon">📦</text>
          <text class="empty-text">暂无模型</text>
        </view>
        <view wx:for="{{models}}" wx:key="id">
          <model-item model="{{item}}" showStatus="{{true}}" showPrice="{{true}}" bind:tap="onModelTap" />
        </view>
      </view>

      <!-- 数据看板 Tab -->
      <view class="tab-content" wx:if="{{activeTab === 'stats'}}">
        <view class="stats-cards">
          <view class="stat-card">
            <text class="stat-num">{{stats.total}}</text>
            <text class="stat-label">模型总数</text>
          </view>
          <view class="stat-card">
            <text class="stat-num">{{stats.views}}</text>
            <text class="stat-label">总浏览量</text>
          </view>
          <view class="stat-card">
            <text class="stat-num">{{stats.favorites}}</text>
            <text class="stat-label">总收藏数</text>
          </view>
        </view>
        <view class="rank-section">
          <text class="rank-title">浏览排行</text>
          <view wx:for="{{sortedModels}}" wx:key="id" wx:if="{{index < 10}}">
            <model-item model="{{item}}" showStatus="{{false}}" showPrice="{{false}}" />
          </view>
        </view>
      </view>

      <!-- 浮动新增按钮 -->
      <view class="fab" wx:if="{{activeTab === 'models'}}" bindtap="onAddModel">
        <text class="fab-icon">+</text>
      </view>
    </block>

    <view class="bottom-spacer"></view>
  </view>
  <tab-bar active="merchant" role="{{role}}" />
</view>
```

- [ ] **Step 4: 重写 merchant-center.wxss**

```css
.page {
  min-height: 100vh;
  background: #f5f5f5;
}
.page-content {
  padding-top: 20rpx;
  padding-bottom: 120rpx;
}

/* 占位 */
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 200rpx 0;
}
.placeholder-icon { font-size: 80rpx; margin-bottom: 24rpx; }
.placeholder-text { font-size: 30rpx; color: #333; margin-bottom: 12rpx; }
.placeholder-sub { font-size: 24rpx; color: #999; }

/* 内部 Tab */
.inner-tabs {
  display: flex;
  background: #fff;
  margin: 0 24rpx 20rpx;
  border-radius: 16rpx;
  overflow: hidden;
}
.inner-tab {
  flex: 1;
  text-align: center;
  padding: 24rpx 0;
  font-size: 28rpx;
  color: #666;
  border-bottom: 4rpx solid transparent;
}
.inner-tab.active {
  color: #1a1a2e;
  font-weight: 600;
  border-bottom-color: #1a1a2e;
}

/* Tab 内容 */
.tab-content {
  padding: 0 24rpx;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 0;
}
.empty-icon { font-size: 80rpx; margin-bottom: 20rpx; }
.empty-text { font-size: 28rpx; color: #999; }

/* 数据看板 */
.stats-cards {
  display: flex;
  gap: 16rpx;
  margin-bottom: 32rpx;
}
.stat-card {
  flex: 1;
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx 0;
  text-align: center;
}
.stat-num {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #1a1a2e;
}
.stat-label {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}
.rank-section {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
}
.rank-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 16rpx;
  display: block;
}

/* 浮动按钮 */
.fab {
  position: fixed;
  right: 40rpx;
  bottom: 180rpx;
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #4ecdc4, #44a08d);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(78, 205, 196, 0.4);
  z-index: 100;
}
.fab-icon {
  font-size: 48rpx;
  color: #fff;
  line-height: 1;
}

.bottom-spacer { height: 40rpx; }
```

- [ ] **Step 5: 编译验证**

```powershell
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/merchant-center/
git commit -m "feat: 重写 merchant-center，实现角色判断+双Tab+通知占位"
```

---

### Task 5: Service 层新增方法

**Files:**
- Modify: `miniprogram/services/model-service.ts`

**Interfaces:**
- Consumes: `Model`（扩展后）、`modelsData`、`userService`
- Produces: `getMyModels`, `createModel`, `updateModel`, `uploadModelFile`, `uploadThumbnail`

- [ ] **Step 1: 在 model-service.ts 中新增 mock 方法**

在 `IModelService` 接口中新增方法声明：

```typescript
interface CreateModelData {
  name: string; description: string; category: CategoryType
  tags: string[]; faces: number; format: string
  price: number; material: string; dimensions: string
  shopLinks: ShopLink[]; thumbnail: string; modelUrl: string
}

export interface IModelService {
  // ... 现有方法 ...
  getMyModels(): Promise<Model[]>
  createModel(data: CreateModelData): Promise<Model>
  updateModel(id: string, data: Partial<CreateModelData>): Promise<Model>
  uploadModelFile(filePath: string): Promise<string>
  uploadThumbnail(filePath: string): Promise<string>
}
```

在文件顶部 `import` 区添加：

```typescript
import { ShopLink } from '../types/model'
import { userService } from './user-service'
```

在 `mockApi` 对象中添加方法：

```typescript
  async getMyModels() {
    const user = userService.getCurrentUser()
    // Mock: 当前商家 ID 写死为 merchant-1
    const merchantId = 'merchant-1'
    const name = user ? user.nickname : '星河模型工坊'
    return modelsData
      .filter(m => m.merchantId === merchantId)
      .map(m => ({ ...m, merchantName: name }))
  },
  async createModel(data: CreateModelData) {
    const user = userService.getCurrentUser()
    const newModel: Model = {
      id: 'model-' + Date.now(),
      name: data.name,
      description: data.description || '',
      thumbnail: data.thumbnail || 'https://picsum.photos/400/400?random=' + Date.now(),
      modelUrl: data.modelUrl || '',
      category: data.category,
      tags: data.tags || [],
      faces: data.faces || 0,
      format: data.format || 'glb',
      merchantId: 'merchant-1',
      merchantName: user ? user.nickname : '星河模型工坊',
      merchantAvatar: user ? user.avatar : 'https://api.dicebear.com/8.x/shapes/svg?seed=galaxy',
      views: 0,
      favorites: 0,
      price: data.price || 0,
      material: data.material || '',
      dimensions: data.dimensions || '',
      status: 'published',
      shopLinks: data.shopLinks || [],
    }
    modelsData.unshift(newModel)
    return newModel
  },
  async updateModel(id: string, data: Partial<CreateModelData>) {
    const idx = modelsData.findIndex(m => m.id === id)
    if (idx === -1) throw new Error('模型未找到')
    const existing = modelsData[idx]
    const updated: Model = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.faces !== undefined && { faces: data.faces }),
      ...(data.format !== undefined && { format: data.format }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.material !== undefined && { material: data.material }),
      ...(data.dimensions !== undefined && { dimensions: data.dimensions }),
      ...(data.shopLinks !== undefined && { shopLinks: data.shopLinks }),
      ...(data.thumbnail !== undefined && { thumbnail: data.thumbnail }),
      ...(data.modelUrl !== undefined && { modelUrl: data.modelUrl }),
    }
    modelsData[idx] = updated
    return updated
  },
  async uploadModelFile(_filePath: string) {
    return 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb'
  },
  async uploadThumbnail(_filePath: string) {
    return 'https://picsum.photos/400/400?random=' + Date.now()
  },
```

在 `realApi` 对象中添加对应方法（真实 API 调用）：

```typescript
  async getMyModels() {
    const res = await api.get<ModelListResponse>('/merchant/models')
    return res.items.map(mapModel)
  },
  async createModel(data: CreateModelData) {
    const res = await api.post<ModelItem>('/models', data)
    return mapModel(res)
  },
  async updateModel(id: string, data: Partial<CreateModelData>) {
    const res = await api.put<ModelItem>('/models/' + id, data)
    return mapModel(res)
  },
  async uploadModelFile(filePath: string) {
    const res = await uploadFile(filePath, '/upload/model')
    return res.url
  },
  async uploadThumbnail(filePath: string) {
    const res = await uploadFile(filePath, '/upload/thumbnail')
    return res.url
  },
```

- [ ] **Step 2: 编译验证**

```powershell
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add miniprogram/services/model-service.ts
git commit -m "feat: model-service 新增 getMyModels/createModel/updateModel/uploadModelFile/uploadThumbnail"
```

---

### Task 6: model-form 新增页面

**Files:**
- Create: `miniprogram/pages/model-form/model-form.json`
- Create: `miniprogram/pages/model-form/model-form.ts`
- Create: `miniprogram/pages/model-form/model-form.wxml`
- Create: `miniprogram/pages/model-form/model-form.wxss`
- Modify: `miniprogram/app.json`（注册路由）

**Interfaces:**
- Consumes: `Model`（扩展后）、`modelService.createModel/updateModel/uploadModelFile/uploadThumbnail`、`CATEGORY_MAP`
- Produces: 模型新增/编辑页面

- [ ] **Step 1: 注册路由**

在 `app.json` 的 `pages` 数组中，`pages/index/index` 之前插入：

```json
"pages/model-form/model-form",
```

- [ ] **Step 2: 创建 model-form.json**

```json
{
  "usingComponents": {
    "top-bar": "/components/top-bar/top-bar"
  }
}
```

- [ ] **Step 3: 创建 model-form.ts**

```typescript
import { Model, CATEGORY_MAP, ShopLink } from '../../types/model'
import { modelService } from '../../services/model-service'

const CATEGORIES = Object.entries(CATEGORY_MAP).map(([key, label]) => ({ key, label }))

interface ShopLinkInput extends ShopLink {
  _key: string
}

Page({
  data: {
    isEdit: false,
    modelId: '',
    title: '新增模型',

    // 表单字段
    name: '',
    description: '',
    category: 'creature' as string,
    categoryIndex: 0,
    categoriesList: CATEGORIES.map(c => c.label),
    tagInput: '',
    faces: '' as string,
    format: 'glb',
    price: '' as string,
    material: '',
    dimensions: '',
    shopLinks: [] as ShopLinkInput[],
    thumbnail: '',
    modelUrl: '',
    thumbnailPath: '' as string,
    modelFilePath: '' as string,

    uploading: false,
  },

  onLoad(options: { id?: string }) {
    if (options.id) {
      const id = options.id
      this.setData({ isEdit: true, modelId: id, title: '编辑模型' })
      this._loadModel(id)
    }
  },

  async _loadModel(id: string) {
    const model = await modelService.getModelById(id)
    if (!model) return
    const catIdx = CATEGORIES.findIndex(c => c.key === model.category)
    this.setData({
      name: model.name,
      description: model.description,
      category: model.category,
      categoryIndex: catIdx >= 0 ? catIdx : 0,
      tagInput: model.tags.join('，'),
      faces: String(model.faces || ''),
      format: model.format || 'glb',
      price: model.price ? String(model.price) : '',
      material: model.material || '',
      dimensions: model.dimensions || '',
      shopLinks: (model.shopLinks || []).map((l, i) => ({ ...l, _key: 'link-' + i })),
      thumbnail: model.thumbnail || '',
      modelUrl: model.modelUrl || '',
    })
  },

  // 分类选择
  onCategoryChange(e: any) {
    const idx = parseInt(e.detail.value, 10)
    this.setData({ categoryIndex: idx, category: CATEGORIES[idx].key })
  },

  // 格式切换
  onFormatChange(e: any) {
    this.setData({ format: e.currentTarget.dataset.format })
  },

  // 电商链接
  onAddLink() {
    if (this.data.shopLinks.length >= 5) {
      wx.showToast({ title: '最多添加5条链接', icon: 'none' })
      return
    }
    const links = [...this.data.shopLinks, { platform: '', shopName: '', url: '', _key: 'link-' + Date.now() }]
    this.setData({ shopLinks: links })
  },
  onRemoveLink(e: any) {
    const key = e.currentTarget.dataset.key
    this.setData({ shopLinks: this.data.shopLinks.filter(l => l._key !== key) })
  },
  onLinkInput(e: any) {
    const key = e.currentTarget.dataset.key
    const field = e.currentTarget.dataset.field as keyof ShopLinkInput
    const value = e.detail.value
    this.setData({
      shopLinks: this.data.shopLinks.map(l =>
        l._key === key ? { ...l, [field]: value } : l
      ),
    })
  },

  // 缩略图上传
  onChooseThumbnail() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res: any) => {
        this.setData({ thumbnailPath: res.tempFilePaths[0] })
      },
    })
  },

  // 模型文件上传
  onChooseModelFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res: any) => {
        this.setData({ modelFilePath: res.tempFiles[0].path })
      },
    })
  },

  // 保存
  async onSave() {
    const { name, category, format } = this.data
    if (!name.trim()) { wx.showToast({ title: '请输入名称', icon: 'none' }); return }

    if (!this.data.isEdit && !this.data.modelFilePath) {
      wx.showToast({ title: '请上传模型文件', icon: 'none' }); return
    }

    this.setData({ uploading: true })

    try {
      let thumbnail = this.data.thumbnail
      let modelUrl = this.data.modelUrl

      if (this.data.thumbnailPath) {
        thumbnail = await modelService.uploadThumbnail(this.data.thumbnailPath)
      }
      if (this.data.modelFilePath) {
        modelUrl = await modelService.uploadModelFile(this.data.modelFilePath)
      }

      const tags = this.data.tagInput
        .split(/[,，]/)
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const shopLinks: ShopLink[] = this.data.shopLinks.map(l => ({
        platform: l.platform,
        shopName: l.shopName,
        url: l.url,
      })).filter(l => l.platform && l.url)

      const data = {
        name: name.trim(),
        description: this.data.description.trim(),
        category: category as any,
        tags,
        faces: parseInt(this.data.faces, 10) || 0,
        format,
        price: parseFloat(this.data.price) || 0,
        material: this.data.material.trim(),
        dimensions: this.data.dimensions.trim(),
        shopLinks,
        thumbnail,
        modelUrl,
      }

      if (this.data.isEdit) {
        await modelService.updateModel(this.data.modelId, data)
      } else {
        await modelService.createModel(data)
      }

      wx.showToast({ title: this.data.isEdit ? '已保存' : '已发布', icon: 'success' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200)
    } catch (e: any) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },
})
```

- [ ] **Step 4: 创建 model-form.wxml**

```xml
<view class="page">
  <top-bar title="{{title}}" showBack="{{true}}" />
  <view class="page-content">
    <!-- 模型文件上传 -->
    <view class="form-section">
      <text class="section-label" wx:if="{{!isEdit}}">模型文件（.zip，必填）</text>
      <text class="section-label" wx:if="{{isEdit}}">模型文件（.zip）</text>
      <view class="upload-btn" bindtap="onChooseModelFile">
        <text wx:if="{{!modelFilePath && !modelUrl}}">📁 点击选择文件</text>
        <text wx:else>📁 已选择文件</text>
      </view>
    </view>

    <!-- 缩略图 -->
    <view class="form-section">
      <text class="section-label">缩略图</text>
      <view class="upload-btn" bindtap="onChooseThumbnail">
        <text wx:if="{{!thumbnailPath && !thumbnail}}">🖼 点击上传</text>
        <image wx:else class="preview-img" src="{{thumbnailPath || thumbnail}}" mode="aspectFill" />
      </view>
    </view>

    <!-- 基础信息 -->
    <view class="form-group">
      <view class="form-item">
        <text class="form-label">名称 *</text>
        <input class="form-input" value="{{name}}" bindinput="onInput" data-field="name" placeholder="模型名称" />
      </view>
      <view class="form-item">
        <text class="form-label">描述</text>
        <textarea class="form-textarea" value="{{description}}" bindinput="onInput" data-field="description" placeholder="模型描述..." />
      </view>
      <view class="form-item">
        <text class="form-label">分类 *</text>
        <picker mode="selector" range="{{categoriesList}}" value="{{categoryIndex}}" bindchange="onCategoryChange">
          <view class="form-picker">{{categoriesList[categoryIndex]}}</view>
        </picker>
      </view>
      <view class="form-item">
        <text class="form-label">标签</text>
        <input class="form-input" value="{{tagInput}}" bindinput="onInput" data-field="tagInput" placeholder="标签，多个用逗号分隔" />
      </view>
      <view class="form-item">
        <text class="form-label">面数</text>
        <input class="form-input" type="number" value="{{faces}}" bindinput="onInput" data-field="faces" placeholder="面数" />
      </view>
      <view class="form-item">
        <text class="form-label">格式 *</text>
        <view class="format-row">
          <view class="format-opt {{format === 'glb' ? 'active' : ''}}" data-format="glb" bindtap="onFormatChange">GLB</view>
          <view class="format-opt {{format === 'obj' ? 'active' : ''}}" data-format="obj" bindtap="onFormatChange">OBJ</view>
        </view>
      </view>
    </view>

    <!-- 价格与规格 -->
    <view class="form-group-title">价格与规格</view>
    <view class="form-group">
      <view class="form-item">
        <text class="form-label">价格（元）</text>
        <input class="form-input" type="digit" value="{{price}}" bindinput="onInput" data-field="price" placeholder="0 表示免费" />
      </view>
      <view class="form-item">
        <text class="form-label">材质</text>
        <input class="form-input" value="{{material}}" bindinput="onInput" data-field="material" placeholder="如：PBR金属、树脂" />
      </view>
      <view class="form-item">
        <text class="form-label">规格/尺寸</text>
        <input class="form-input" value="{{dimensions}}" bindinput="onInput" data-field="dimensions" placeholder="如：15×10×8cm" />
      </view>
    </view>

    <!-- 电商链接 -->
    <view class="form-group-title">电商链接</view>
    <view class="form-group">
      <view class="link-item" wx:for="{{shopLinks}}" wx:key="_key">
        <view class="link-row">
          <input class="link-input" value="{{item.platform}}" data-key="{{item._key}}" data-field="platform" bindinput="onLinkInput" placeholder="平台（淘宝/京东...）" />
          <input class="link-input" value="{{item.shopName}}" data-key="{{item._key}}" data-field="shopName" bindinput="onLinkInput" placeholder="店铺名" />
        </view>
        <view class="link-row">
          <input class="link-input full" value="{{item.url}}" data-key="{{item._key}}" data-field="url" bindinput="onLinkInput" placeholder="链接地址" />
          <text class="link-remove" data-key="{{item._key}}" bindtap="onRemoveLink">✕</text>
        </view>
      </view>
      <view class="add-link" bindtap="onAddLink" wx:if="{{shopLinks.length < 5}}">
        <text>+ 添加电商链接</text>
      </view>
    </view>

    <!-- 保存按钮 -->
    <view class="save-area">
      <button class="btn-save" bindtap="onSave" loading="{{uploading}}" disabled="{{uploading}}">
        {{isEdit ? '保存修改' : '上传并发布'}}
      </button>
    </view>

    <view class="bottom-spacer"></view>
  </view>
</view>
```

`onInput` 通用方法需要在 ts 中添加：

```typescript
  onInput(e: any) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },
```

- [ ] **Step 5: 创建 model-form.wxss**

```css
.page { min-height: 100vh; background: #f5f5f5; }
.page-content { padding-bottom: 60rpx; }

.form-section {
  background: #fff;
  padding: 24rpx;
  margin: 0 24rpx 16rpx;
  border-radius: 16rpx;
}
.section-label {
  font-size: 28rpx;
  color: #333;
  display: block;
  margin-bottom: 16rpx;
}
.upload-btn {
  border: 2rpx dashed #ccc;
  border-radius: 12rpx;
  padding: 40rpx;
  text-align: center;
  color: #999;
  font-size: 26rpx;
}
.preview-img {
  width: 200rpx;
  height: 200rpx;
  border-radius: 8rpx;
}

.form-group-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a2e;
  padding: 24rpx 48rpx 16rpx;
}
.form-group {
  background: #fff;
  margin: 0 24rpx 16rpx;
  border-radius: 16rpx;
  overflow: hidden;
}
.form-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}
.form-item:last-child { border-bottom: none; }
.form-label { font-size: 28rpx; color: #333; flex-shrink: 0; width: 160rpx; }
.form-input { flex: 1; text-align: right; font-size: 28rpx; color: #333; }
.form-textarea { flex: 1; text-align: right; font-size: 28rpx; color: #333; height: 120rpx; }
.form-picker { flex: 1; text-align: right; font-size: 28rpx; color: #333; }

.format-row { display: flex; gap: 16rpx; }
.format-opt {
  padding: 12rpx 36rpx;
  border-radius: 8rpx;
  border: 2rpx solid #ddd;
  font-size: 26rpx;
  color: #666;
}
.format-opt.active {
  border-color: #4ecdc4;
  color: #4ecdc4;
  background: #e8f8f5;
}

/* 电商链接 */
.link-item {
  padding: 20rpx 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
  background: #fafafa;
}
.link-item:last-child { border-bottom: none; }
.link-row {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}
.link-row:last-child { margin-bottom: 0; }
.link-input {
  flex: 1;
  font-size: 26rpx;
  background: #fff;
  border: 1rpx solid #eee;
  border-radius: 8rpx;
  padding: 12rpx 16rpx;
  margin-right: 12rpx;
}
.link-input.full { flex: 4; }
.link-input:last-child { margin-right: 0; }
.link-remove { font-size: 28rpx; color: #e74c3c; padding: 8rpx; }
.add-link {
  text-align: center;
  padding: 24rpx;
  color: #4ecdc4;
  font-size: 26rpx;
}

.save-area { padding: 40rpx 24rpx; }
.btn-save {
  width: 100%;
  background: linear-gradient(135deg, #4ecdc4, #44a08d);
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
  border-radius: 16rpx;
  padding: 28rpx;
}

.bottom-spacer { height: 40rpx; }
```

- [ ] **Step 6: 编译验证**

```powershell
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/model-form/ miniprogram/app.json
git commit -m "feat: 新增 model-form 页面，商家新增/编辑模型共用同一套表单"
```

---

### Task 7: model-detail 补充展示

**Files:**
- Modify: `miniprogram/pages/model-detail/model-detail.wxml`
- Modify: `miniprogram/pages/model-detail/model-detail.wxss`

**Interfaces:**
- Consumes: `Model`（扩展后，含 price/material/dimensions/shopLinks）

- [ ] **Step 1: 修改 model-detail.wxml**

在现有的"格式"信息行之后、"商家"信息行之前，插入新增字段：

```xml
<view class="info-row" wx:if="{{model.price > 0}}">
  <text class="info-label">价格</text>
  <text class="info-value price">¥{{model.price}}</text>
</view>
<view class="info-row" wx:if="{{model.material}}">
  <text class="info-label">材质</text>
  <text class="info-value">{{model.material}}</text>
</view>
<view class="info-row" wx:if="{{model.dimensions}}">
  <text class="info-label">规格</text>
  <text class="info-value">{{model.dimensions}}</text>
</view>
```

在"3D 查看"按钮之后、"bottom-spacer"之前，加入电商链接区域：

```xml
<view class="shop-links" wx:if="{{model.shopLinks && model.shopLinks.length > 0}}">
  <text class="links-title">购买渠道</text>
  <view class="link-card" wx:for="{{model.shopLinks}}" wx:key="url" bindtap="onOpenLink" data-url="{{item.url}}">
    <text class="link-platform">{{item.platform}}</text>
    <text class="link-shop">{{item.shopName}}</text>
    <text class="link-arrow">去购买 ›</text>
  </view>
</view>
```

- [ ] **Step 2: 在 model-detail.ts 中新增 onOpenLink 方法**

```typescript
onOpenLink(e: any) {
  const url = e.currentTarget.dataset.url
  if (url) {
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none' }),
    })
  }
},
```

- [ ] **Step 3: 在 model-detail.wxss 中新增样式**

```css
.price { color: #e74c3c; font-weight: 600; }

.shop-links {
  margin: 32rpx 24rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
}
.links-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 16rpx;
  display: block;
}
.link-card {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}
.link-card:last-child { border-bottom: none; }
.link-platform {
  font-size: 26rpx;
  color: #e74c3c;
  background: #fdf2f2;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
  margin-right: 16rpx;
}
.link-shop {
  flex: 1;
  font-size: 26rpx;
  color: #333;
}
.link-arrow {
  font-size: 26rpx;
  color: #4ecdc4;
}
```

- [ ] **Step 4: 编译验证**

```powershell
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/model-detail/
git commit -m "feat: model-detail 补充展示价格/材质/规格/电商链接"
```

---

### Task 8: 集成验证

- [ ] **Step 1: 最终编译检查**

```powershell
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 2: 检查文件清单**

确认以下文件均已正确修改/创建：

- `types/model.ts` — 新增 ShopLink、ModelStatus、Model 扩展字段
- `data/models.ts` — 8 个条目补全新字段
- `components/model-item/` — 4 个文件新建
- `components/tab-bar/tab-bar.ts` — 新增 role 属性 + 动态 tabs
- `pages/index/index.ts` + `.wxml` — role 传入
- `pages/model-list/model-list.ts` + `.wxml` — role 传入
- `pages/merchant-center/` — 3 个文件重写
- `pages/model-form/` — 4 个文件新建
- `pages/model-detail/model-detail.wxml` + `.wxss` + `.ts` — 新增展示 + onOpenLink
- `pages/profile/profile.ts` + `.wxml` — role 传入
- `services/model-service.ts` — 新增 5 个方法
- `app.json` — 注册 model-form 路由

- [ ] **Step 3: Commit**

```bash
git add -A
git status
git commit -m "chore: 集成验证，确认商家模型管理全部文件就绪"
```
