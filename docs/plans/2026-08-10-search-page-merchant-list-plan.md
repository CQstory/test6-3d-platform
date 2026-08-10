# 搜索页改版与商家列表实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将第二个 Tab「模型库」升级为统一「搜索」页，页内用 inner-tabs 切换「搜索商家 / 搜索模型」两个子页面，商家子页面按名称/简介/擅长领域筛选商家并展示代表作缩略图。

**Architecture:** 复用 `pages/model-list` 路由作为搜索页容器，原模型列表逻辑整体保留为「搜索模型」子页面；新建 `merchant-card` 组件渲染单列商家卡片（列表行 + 3 张缩略图条）；`Merchant` 类型新增 `specialties` 字段驱动领域筛选 chips。

**Tech Stack:** 微信小程序原生框架 + TypeScript + wxss(rpx)；无单测框架，验证方式为 `npx tsc --noEmit` + 微信开发者工具手动走查。

**对应设计文档:** `docs/specs/2026-08-10-search-page-merchant-list-design.md`

---

## Task 1: Merchant 类型与 mock 数据新增 specialties

**Files:**
- Modify: `miniprogram/types/model.ts`（`Merchant` 接口）
- Modify: `miniprogram/data/merchants.ts`（4 家 mock 商家）

**Interfaces:**
- `Merchant.specialties: string[]` — 商家擅长领域标签，必填（无数据时为 `[]`）

**Steps:**

- [x] **Step 1: 修改 Merchant 接口**

在 `miniprogram/types/model.ts` 的 `Merchant` 接口 `description: string` 之后新增：

```ts
/** 商家 */
export interface Merchant {
  id: string
  name: string
  avatar: string
  cover: string
  description: string
  /** 擅长领域标签（筛选 chips 与卡片展示用） */
  specialties: string[]
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
```

- [x] **Step 2: 补充 4 家 mock 商家的 specialties**

在 `miniprogram/data/merchants.ts` 中，每家商家 `description` 字段之后新增一行（此步后 `tsc` 会报错直到全部补齐，属预期）：

```ts
// merchant-1 星河模型工坊
specialties: ['科幻军事', '摄影道具'],
// merchant-2 萌趣手办社
specialties: ['Q版手办', '动物造型'],
// merchant-3 像素工坊
specialties: ['道具场景', '沙盘'],
// merchant-4 龙鳞雕塑室
specialties: ['东方神兽', '雕塑'],
```

- [x] **Step 3: 验证类型**

Run: `npx tsc --noEmit`（工作目录 `d:\Code\benchuang\test6`）
Expected: 可能仍有报错（merchant-service.ts 的 mapShop/mock 构造缺 specialties），Task 2 修复；本任务涉及的两个文件不应出现新错误。

- [x] **Step 4: Commit**

```bash
git add miniprogram/types/model.ts miniprogram/data/merchants.ts
git commit -m "feat(types): Merchant 新增 specialties 擅长领域字段并补充 mock"
```

---

## Task 2: merchant-service 适配 specialties

**Files:**
- Modify: `miniprogram/services/merchant-service.ts`（`ShopResponse`、`mapShop`）

**Interfaces:**
- `ShopResponse.specialties?: string[]` — 后端可选返回，缺省映射为 `[]`

**Steps:**

- [x] **Step 1: ShopResponse 增加可选字段**

```ts
interface ShopResponse {
  id: string; name: string; avatar: string; cover: string; description: string
  specialties?: string[]
  model_count?: number; total_views?: number
  contact?: { wechat: string; phone: string; email: string }
  stats?: { models: number; views: number; rating: number }
}
```

- [x] **Step 2: mapShop 映射 specialties（缺省 []）**

```ts
function mapShop(item: ShopResponse): Merchant {
  return {
    id: item.id, name: item.name, avatar: item.avatar,
    cover: item.cover, description: item.description,
    specialties: item.specialties || [],
    contact: item.contact || { wechat: '', phone: '', email: '' },
    stats: {
      models: firstDefined(item.model_count, item.stats && item.stats.models, 0),
      views: firstDefined(item.total_views, item.stats && item.stats.views, 0),
      rating: (item.stats && item.stats.rating) || 0,
    },
  }
}
```

注意：mock 分支的 `getMockShop()` 基于 `merchantsData[0]` 展开、`updateShop` 合并 `current`，均天然携带 specialties，无需额外改动。

- [x] **Step 3: 验证类型**

Run: `npx tsc --noEmit`
Expected: exit code 0（Task 1 引入的类型缺口在此补齐）

- [x] **Step 4: Commit**

```bash
git add miniprogram/services/merchant-service.ts
git commit -m "feat(service): merchant-service 映射 specialties 字段"
```

---

## Task 3: 新建 merchant-card 组件

**Files:**
- Create: `miniprogram/components/merchant-card/merchant-card.ts`
- Create: `miniprogram/components/merchant-card/merchant-card.wxml`
- Create: `miniprogram/components/merchant-card/merchant-card.wxss`
- Create: `miniprogram/components/merchant-card/merchant-card.json`

**Interfaces:**
- Properties: `merchant: Merchant`、`topModels: Model[]`（代表作，≤3，页面层传入）
- Events: `bind:tap` → `{ merchant }`（点卡片主体）；`bind:modeltap` → `{ model }`（点缩略图）

**Steps:**

- [x] **Step 1: merchant-card.json**

```json
{
  "component": true,
  "usingComponents": {}
}
```

- [x] **Step 2: merchant-card.ts**

```ts
import { FALLBACK_IMAGE } from '../../utils/util'

Component({
  properties: {
    merchant: { type: Object, value: {} },
    topModels: { type: Array, value: [] },
  },
  data: {
    avatarError: false,
    imgFallback: FALLBACK_IMAGE,
    thumbErrors: {} as Record<number, boolean>,
  },
  observers: {
    'merchant': function (this: any) {
      // 商家切换时重置图片错误态
      this.setData({ avatarError: false, thumbErrors: {} })
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { merchant: this.properties.merchant })
    },
    onThumbTap(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number
      const model = (this.properties.topModels as any[])[index]
      if (model) this.triggerEvent('modeltap', { model })
    },
    onAvatarError() {
      this.setData({ avatarError: true })
    },
    onThumbError(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number
      this.setData({ ['thumbErrors.' + index]: true } as any)
    },
  },
})
```

- [x] **Step 3: merchant-card.wxml**

```xml
<view class="m-card" bindtap="onTap">
  <view class="m-card-row">
    <image
      class="m-avatar"
      src="{{avatarError ? imgFallback : merchant.avatar}}"
      mode="aspectFill"
      binderror="onAvatarError"
    />
    <view class="m-info">
      <view class="m-name-line">
        <text class="m-name">{{merchant.name}}</text>
        <text class="m-rating">⭐{{merchant.stats.rating}}</text>
      </view>
      <text class="m-desc">{{merchant.description}}</text>
      <text class="m-stats">📦{{merchant.stats.models}} 模型 · 👁️{{merchant.stats.views}}</text>
    </view>
  </view>
  <view class="m-thumbs" wx:if="{{topModels.length > 0}}">
    <view class="m-thumb-wrap" wx:for="{{topModels}}" wx:key="id">
      <image
        class="m-thumb"
        src="{{thumbErrors[index] ? imgFallback : item.thumbnail}}"
        mode="aspectFill"
        lazy-load
        data-index="{{index}}"
        catchtap="onThumbTap"
        binderror="onThumbError"
      />
    </view>
  </view>
</view>
```

- [x] **Step 4: merchant-card.wxss**

```css
.m-card {
  background: #fff; border-radius: 24rpx; padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04);
}
.m-card-row { display: flex; gap: 20rpx; }
.m-avatar { width: 92rpx; height: 92rpx; border-radius: 50%; flex-shrink: 0; background: #f0f0f0; }
.m-info { flex: 1; min-width: 0; }
.m-name-line { display: flex; justify-content: space-between; align-items: center; }
.m-name { font-size: 30rpx; font-weight: 600; color: #333; }
.m-rating { font-size: 24rpx; color: #f7b733; }
.m-desc {
  display: block; margin-top: 6rpx;
  font-size: 24rpx; color: #999;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.m-stats { display: block; margin-top: 6rpx; font-size: 22rpx; color: #bbb; }
.m-thumbs { display: flex; gap: 12rpx; margin-top: 16rpx; }
.m-thumb-wrap { flex: 1; height: 150rpx; border-radius: 16rpx; overflow: hidden; background: #f0f0f0; }
.m-thumb { width: 100%; height: 100%; }
```

- [x] **Step 5: 验证类型**

Run: `npx tsc --noEmit`
Expected: exit code 0

- [x] **Step 6: Commit**

```bash
git add miniprogram/components/merchant-card
git commit -m "feat(components): 新增 merchant-card 商家卡片组件（列表行+缩略图条）"
```

---

## Task 4: tab-bar 与 app.json 文案改为「搜索」

**Files:**
- Modify: `miniprogram/components/tab-bar/tab-bar.ts`（`_buildTabs` 中 browse 项）
- Modify: `miniprogram/app.json`（`tabBar.list` 中 model-list 项 text）

**Interfaces:** 无新增；`browse` Tab key 与路由 `/pages/model-list/model-list` 均保持不变。

**Steps:**

- [x] **Step 1: tab-bar.ts 修改 browse 项**

将 `_buildTabs` 中的：

```ts
{ key: 'browse', label: '模型库', icon: '📦' },
```

改为：

```ts
{ key: 'browse', label: '搜索', icon: '🔍' },
```

- [x] **Step 2: app.json 修改 text**

将 `tabBar.list` 中的：

```json
{ "pagePath": "pages/model-list/model-list", "text": "模型库" },
```

改为：

```json
{ "pagePath": "pages/model-list/model-list", "text": "搜索" },
```

- [x] **Step 3: Commit**

```bash
git add miniprogram/components/tab-bar/tab-bar.ts miniprogram/app.json
git commit -m "feat(tab-bar): 模型库 Tab 更名搜索"
```

---

## Task 5: model-list 页面改造为搜索页容器

**Files:**
- Modify: `miniprogram/pages/model-list/model-list.json`（注册 merchant-card）
- Modify: `miniprogram/pages/model-list/model-list.ts`（整体重写，见 Step 2）
- Modify: `miniprogram/pages/model-list/model-list.wxml`（整体重写，见 Step 3）
- Modify: `miniprogram/pages/model-list/model-list.wxss`（追加 inner-tabs 与商家列表样式）

**Interfaces:**
- 页面 data 新增：`activeTab: 'models' | 'merchants'`（默认 `'models'`）、`merchantKeyword`、`activeSpecialty`、`specialties`、`allMerchants`、`displayMerchants`、`top3ModelsMap`
- 页面方法新增：`onInnerTabTap`、`onMerchantSearchInput`、`onSpecialtyTap`、`_filterMerchants`、`onMerchantTap`、`onThumbModelTap`；原 `onSearchInput`/`onCategoryTap`/`_filter`/`onCardTap` 保留给模型子页面

**Steps:**

- [x] **Step 1: model-list.json 注册组件**

```json
{
  "usingComponents": {
    "top-bar": "/components/top-bar/top-bar",
    "tab-bar": "/components/tab-bar/tab-bar",
    "model-card": "/components/model-card/model-card",
    "merchant-card": "/components/merchant-card/merchant-card"
  },
  "navigationStyle": "custom"
}
```

- [x] **Step 2: model-list.ts 整体重写**

```ts
import { Merchant, Model } from '../../types/model'
import { modelService } from '../../services/model-service'
import { merchantService } from '../../services/merchant-service'
import { userService } from '../../services/user-service'

Page({
  data: {
    activeTab: 'models',
    // 搜索模型子页面
    keyword: '',
    activeCategory: 'all',
    categories: [] as { key: string; label: string }[],
    allModels: [] as Model[],
    displayModels: [] as Model[],
    // 搜索商家子页面
    merchantKeyword: '',
    activeSpecialty: 'all',
    specialties: [] as string[],
    allMerchants: [] as Merchant[],
    displayMerchants: [] as Merchant[],
    top3ModelsMap: {} as Record<string, Model[]>,
    role: '',
  },
  async onLoad() {
    const user = userService.getCurrentUser()
    this.setData({ role: user ? user.role : 'user' })

    // 模型子页面
    const models = await modelService.getHotModels()
    const cats = [
      { key: 'all', label: '全部' },
      ...modelService.getAllCategories(),
    ]
    this.setData({ allModels: models, displayModels: models, categories: cats })

    // 商家子页面
    try {
      const merchants = await merchantService.getAllMerchants()
      // 领域 chips：全量商家 specialties 去重
      const specSet: string[] = []
      merchants.forEach(m => {
        ;(m.specialties || []).forEach(s => {
          if (specSet.indexOf(s) === -1) specSet.push(s)
        })
      })
      // 代表作：每个商家 views 前 3 的模型
      const top3ModelsMap: Record<string, Model[]> = {}
      for (const m of merchants) {
        try {
          const list = await modelService.getModelsByMerchant(m.id)
          top3ModelsMap[m.id] = list
            .sort((a, b) => b.views - a.views)
            .slice(0, 3)
        } catch (_) {
          top3ModelsMap[m.id] = []
        }
      }
      this.setData({
        allMerchants: merchants,
        displayMerchants: merchants,
        specialties: specSet,
        top3ModelsMap,
      })
    } catch (_) {
      this.setData({ allMerchants: [], displayMerchants: [] })
    }
  },
  /* ===== inner tabs ===== */
  onInnerTabTap(e: WechatMiniprogram.TouchEvent) {
    this.setData({ activeTab: e.currentTarget.dataset.tab as string })
  },
  /* ===== 搜索模型子页面（原逻辑保留） ===== */
  onSearchInput(e: any) {
    this.setData({ keyword: (e.detail.value || '').trim() })
    this._filter()
  },
  onCategoryTap(e: any) {
    this.setData({ activeCategory: e.currentTarget.dataset.key as string })
    this._filter()
  },
  _filter() {
    let list = this.data.allModels
    if (this.data.activeCategory !== 'all') {
      list = list.filter(m => m.category === this.data.activeCategory)
    }
    if (this.data.keyword) {
      const kw = this.data.keyword.toLowerCase()
      list = list.filter(
        m =>
          m.name.toLowerCase().includes(kw) ||
          m.tags.some(t => t.includes(kw))
      )
    }
    this.setData({ displayModels: list })
  },
  onCardTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-detail/model-detail?id=' + model.id,
      })
    }
  },
  /* ===== 搜索商家子页面 ===== */
  onMerchantSearchInput(e: any) {
    this.setData({ merchantKeyword: (e.detail.value || '').trim() })
    this._filterMerchants()
  },
  onSpecialtyTap(e: any) {
    this.setData({ activeSpecialty: e.currentTarget.dataset.key as string })
    this._filterMerchants()
  },
  _filterMerchants() {
    let list = this.data.allMerchants
    if (this.data.activeSpecialty !== 'all') {
      list = list.filter(
        m => (m.specialties || []).indexOf(this.data.activeSpecialty) !== -1
      )
    }
    if (this.data.merchantKeyword) {
      const kw = this.data.merchantKeyword.toLowerCase()
      list = list.filter(
        m =>
          m.name.toLowerCase().includes(kw) ||
          m.description.toLowerCase().includes(kw) ||
          (m.specialties || []).some(s => s.toLowerCase().includes(kw))
      )
    }
    this.setData({ displayMerchants: list })
  },
  onMerchantTap(e: any) {
    const merchant = (e.detail && e.detail.merchant) as Merchant
    if (merchant) {
      wx.navigateTo({
        url: '/pages/store-front/store-front?id=' + merchant.id,
      })
    }
  },
  onThumbModelTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-detail/model-detail?id=' + model.id,
      })
    }
  },
})
```

- [x] **Step 3: model-list.wxml 整体重写**

```xml
<view class="page">
  <top-bar title="搜索" />
  <view class="page-content">
    <!-- 内部 Tab：复用 merchant-center inner-tabs 样式 -->
    <view class="inner-tabs">
      <view
        class="inner-tab {{activeTab === 'merchants' ? 'active' : ''}}"
        data-tab="merchants" bindtap="onInnerTabTap"
      >搜索商家</view>
      <view
        class="inner-tab {{activeTab === 'models' ? 'active' : ''}}"
        data-tab="models" bindtap="onInnerTabTap"
      >搜索模型</view>
    </view>

    <!-- 搜索商家子页面 -->
    <block wx:if="{{activeTab === 'merchants'}}">
      <view class="search-bar">
        <input class="search-input" placeholder="店铺名称 / 简介关键词" value="{{merchantKeyword}}" bindinput="onMerchantSearchInput" />
      </view>
      <scroll-view class="category-scroll" scroll-x show-scrollbar="{{false}}">
        <view class="category-list">
          <view
            class="cat-item {{activeSpecialty === 'all' ? 'active' : ''}}"
            data-key="all" bindtap="onSpecialtyTap"
          >
            <text>全部</text>
          </view>
          <view
            wx:for="{{specialties}}" wx:key="*this"
            class="cat-item {{activeSpecialty === item ? 'active' : ''}}"
            data-key="{{item}}" bindtap="onSpecialtyTap"
          >
            <text>{{item}}</text>
          </view>
        </view>
      </scroll-view>
      <view class="merchant-list">
        <merchant-card
          wx:for="{{displayMerchants}}" wx:key="id"
          merchant="{{item}}"
          topModels="{{top3ModelsMap[item.id]}}"
          bind:tap="onMerchantTap"
          bind:modeltap="onThumbModelTap"
        />
      </view>
      <view class="empty" wx:if="{{displayMerchants.length === 0}}">
        <text>未找到相关商家</text>
      </view>
    </block>

    <!-- 搜索模型子页面（原 model-list 内容） -->
    <block wx:if="{{activeTab === 'models'}}">
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
    </block>

    <view class="bottom-spacer"></view>
  </view>
  <tab-bar active="browse" role="{{role}}" />
</view>
```

- [x] **Step 4: model-list.wxss 追加样式**

在文件末尾追加（inner-tabs 样式复制自 `merchant-center.wxss`，`margin` 置 0 因页面 `.page-content` 已有左右 padding）：

```css
/* 内部 Tab（复用 merchant-center 样式，margin 适配本页 padding） */
.inner-tabs {
  display: flex;
  background: #fff;
  margin: 0 0 20rpx;
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
/* 商家列表 */
.merchant-list { margin-top: 8rpx; }
```

- [x] **Step 5: 验证类型**

Run: `npx tsc --noEmit`
Expected: exit code 0

- [x] **Step 6: Commit**

```bash
git add miniprogram/pages/model-list
git commit -m "feat(search): model-list 升级为搜索页容器（商家/模型双子页）"
```

---

## Task 6: 端到端走查与后端报告

**Files:**
- Create: `docs/reports/2026-08-10-merchant-specialties-backend-report.md`（给后端的需求报告，内容见同目录已有报告格式）

**Steps:**

- [ ] **Step 1: 微信开发者工具走查清单**

在微信开发者工具（模拟器）逐项验证：

| # | 场景 | 预期 |
|---|---|---|
| 1 | 底部 Tab 第二项 | 显示「搜索 🔍」，进入后高亮 |
| 2 | 默认子页面 | 落在「搜索模型」，原模型搜索/分类筛选行为与改版前一致 |
| 3 | 切「搜索商家」 | 显示搜索框 + 领域 chips（全部/科幻军事/摄影道具/Q版手办/动物造型/道具场景/沙盘/东方神兽/雕塑）+ 4 张商家卡片 |
| 4 | 关键词「手办」 | 仅显示萌趣手办社（简介/领域命中） |
| 5 | 领域 chip「摄影道具」 | 仅显示星河模型工坊 |
| 6 | 关键词 + chip 组合无结果 | 显示「未找到相关商家」空态 |
| 7 | 商家卡片缩略图 | 每卡 ≤3 张；点卡片主体进 store-front，点缩略图进 model-detail |
| 8 | 两子页面状态 | 各自输入/筛选状态互不干扰，切换后保留 |
| 9 | 商家角色登录 | 第三个 Tab 仍显示「商家 🏪」，进入 merchant-center 正常 |

- [x] **Step 2: 确认后端报告已产出**

核对 `docs/reports/2026-08-10-merchant-specialties-backend-report.md` 已存在且包含 specialties 字段契约与店铺列表 API 需求。

- [ ] **Step 3: Commit（如走查产生修复）**

```bash
git add -A
git commit -m "fix(search): 走查修复"
```

---

## 验证命令汇总

```powershell
cd d:\Code\benchuang\test6
npx tsc --noEmit
```

Expected: exit code 0；随后在微信开发者工具中按 Task 6 走查清单逐项验证。
