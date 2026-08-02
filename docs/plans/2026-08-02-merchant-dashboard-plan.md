# 商户数据看板 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现商户数据看板。核心指标为**浏览量**与**点击量**双线，辅以收藏数；明确**不做订单/成交**。含电商链接点击埋点（每次点击 +1）、看板概览卡片、浏览/点击排行、状态分布，以及浏览→点击转化率。

**Architecture:** 在现有三层架构（Pages → Services → Data）上扩展。埋点侧：模型详情页 `onOpenLink` 内 fire-and-forget 调用 `recordClick`（与现有 `recordView` 同模式）。看板侧：`merchant-center` 数据看板 Tab 从占位改为真实聚合，概览/排行纯前端聚合 `getMyModels()` 返回的 `views/clicks/favorites`，趋势区块走后端 trend 接口（未就绪时优雅降级）。

**Tech Stack:** TypeScript, 微信小程序原生框架, 现有 Service/Mock 双轨架构

## Global Constraints

- **不做订单/成交指标**，价格矩阵数据不进看板
- 点击计数：**每次点击 +1，不去重**（点击"购买渠道"链接一次记一次）
- 浏览计数：沿用现有 `POST /models/{id}/view` **按天去重**（同日同人同模型只计 1 次）
- 因去重规则不同，**浏览量可以小于点击量**（同一用户一天浏览 1 次、点击多次）——这是正常漏斗，看板需能正确展示且不算异常
- USE_MOCK 开关控制 Mock/Real 模式，所有新方法必须支持双模式
- TypeScript strict 模式，禁止 any
- 小程序不能直接打开外链，"点击跳转"以用户点击"购买渠道"链接（复制链接）为触发点
- 埋点不阻塞用户操作（fire-and-forget，与 `recordView` 一致）

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `types/model.ts` | 修改 | `Model` 接口新增 `clicks` 字段 |
| `data/models.ts` | 修改 | mock 模型数据补充 `clicks` 基础值（部分 clicks > views 体现指标差异） |
| `services/model-service.ts` | 修改 | 新增 `recordClick`、`getStatsTrend`；`getMyModels`/`mapModel` 映射 `click_count` |
| `pages/model-detail/model-detail.wxml` | 修改 | `link-card` 增加 `data-platform` |
| `pages/model-detail/model-detail.ts` | 修改 | `onOpenLink` 中调用 `recordClick`（fire-and-forget） |
| `pages/merchant-center/merchant-center.ts` | 修改 | stats 聚合：总览/转化率/双排行/状态分布/趋势 |
| `pages/merchant-center/merchant-center.wxml` | 修改 | 数据看板 Tab 占位 → 真实看板 UI |
| `pages/merchant-center/merchant-center.wxss` | 修改 | 看板样式 |
| `docs/reports/2026-08-02-merchant-dashboard-backend-report.md` | 新建 | 发给后端的报告：指标口径、表结构、API 契约、热度公式（按项目规则只新建不修改） |

> 后端（非本仓库）：新增 `model_clicks` 表、`POST /models/{id}/click` 接口、`models.click_count` 字段、`GET /merchant/stats/trend` 接口，详见 Task 1 契约。

---

## 一、指标定义（口径矩阵）

> 口径原则：浏览量被"按天去重"低估，收藏/点击按行为累计。**常态排序为：浏览量 ≥ 累计收藏 ≥ 当前收藏，且浏览量 > 点击量**；特殊场景（同人反复点击链接）可出现点击量 > 浏览量，属正常口径差异，不算异常。

| 指标 | 触发点 | 计数规则 | 数据表 | 常理关系 | 现状 |
|------|--------|---------|--------|---------|------|
| 浏览量 `views` | 进入模型详情页（`onLoad` → `recordView`） | **按天去重**（UNIQUE user+model+date，防刷） | `model_views`（已有） | 最大（被去重低估） | ✅ 已上线 |
| 累计收藏 `favoriteAdded` | 点击收藏（含取消后重收） | **每次 add +1，不去重；收藏后取消仍计入** | `model_favorites_log`（新增） | ≤ 浏览量（收藏前必先浏览） | 🆕 本次 |
| 当前收藏 `favorites` | 当前仍收藏的用户数 | 存量去重（每用户至多 1，取消即减） | `favorite_count`（已有） | ≤ 累计收藏 | ✅ 已上线 |
| 点击量 `clicks` | 点击"购买渠道"链接（`onOpenLink`） | **每次 +1，不去重** | `model_clicks`（新增） | 常态 < 浏览量；可 > 浏览 | 🆕 本次 |
| ~~成交/订单~~ | — | — | — | — | ❌ 明确不做 |

### 1.1 收藏口径（重点）

普通用户"批量收藏 → 浏览对比 → 取消大部分"是常态行为：当前收藏数会被整理动作**抹掉**，但**收藏过又取消**恰恰是比普通浏览更强的兴趣信号（用户认真看过才收藏）。

- `favoriteAdded`（累计收藏）= 收藏动作次数，**含已取消部分**，不因取消而回退
- `favorites`（当前收藏）= 存量值，取消即减
- 差值 `favoriteAdded - favorites` = "曾收藏又取消"人数，看板单独高亮为**深度意向**信号

### 1.2 特殊浏览量 / 热度（加权）

收藏（含取消）与点击均按**加权折合浏览量**参与热度计算：

```
weighted_views = view_count + 5 × favorite_added + 3 × click_count
hot_score     = weighted_views   （即"特殊浏览量"）
```

- 收藏一次 ≈ 5 次普通浏览（含取消也计，体现强意向）
- 点击一次 ≈ 3 次普通浏览
- 权重为建议值，后端可配；首页 `GET /models?hot=true` 与看板"热度"排行共用该公式

### 1.3 转化率

- **浏览→点击转化率 = 点击量 / 浏览量**（点击不去重，可达 100%+）
- **浏览→收藏转化率 = 当前收藏 / 浏览量**（≤ 100%）

---

## 二、后端契约（交付后端，非本仓库）

### 2.1 新表 `model_clicks` 与 `model_favorites_log`

两张明细表均**无唯一约束**（每次行为一条记录），与 `model_views`（去重）区分。

```sql
CREATE TABLE model_clicks (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id),
    model_id     UUID NOT NULL REFERENCES models(id),
    link_url     TEXT,      -- 点击的链接（可选，支持按渠道统计）
    platform     TEXT,      -- 平台名，如 淘宝/京东（可选）
    clicked_date DATE NOT NULL DEFAULT CURRENT_DATE,  -- 按天聚合趋势用
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
-- 无 UNIQUE 约束：每次点击插入一条

CREATE TABLE model_favorites_log (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id),
    model_id       UUID NOT NULL REFERENCES models(id),
    action         TEXT NOT NULL,          -- 'add' | 'remove'
    favorited_date DATE NOT NULL DEFAULT CURRENT_DATE,  -- 按天聚合趋势用
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
-- 每次收藏/取消各插一条；favorite_added = COUNT(action='add')
```

`models` 表新增缓存列（与 `view_count` 同机制）：

```sql
click_count    INTEGER NOT NULL DEFAULT 0
favorite_added INTEGER NOT NULL DEFAULT 0   -- 累计收藏次数（含已取消）
```

### 2.2 接口清单

| 优先级 | 方法 | 路径 | 鉴权 | 说明 |
|--------|------|------|------|------|
| P0 必做 | POST | `/models/{model_id}/click` | 👤 登录用户 | 记录一次点击；body 可选 `{link_url, platform}`；每次调用 +1 并回写 `models.click_count`；返回 `{click_count}` |
| P0 必做 | POST | `/models/{model_id}/favorite/toggle` | 👤 登录用户 | **改造**：内部写 `model_favorites_log`（add/remove 各一条）+ 回写 `favorite_count` 与 `favorite_added`；返回 `{favorited, favorite_count, favorite_added}` |
| P0 必做 | GET | `/merchant/models` | 🏪 商户 | 每个 item 增加 `click_count` 与 `favorite_added`（与 `view_count`/`favorite_count` 并列） |
| P0 必做 | GET | `/models?hot=true` | 🔓 公开 | **改造**：按新热度公式 `view_count + 5×favorite_added + 3×click_count` 排序 |
| P1 增强 | GET | `/merchant/stats/overview` | 🏪 商户 | `{model_count, view_count, click_count, favorite_count, favorite_added, conversion_rate}` |
| P1 增强 | GET | `/merchant/stats/trend?days=7\|30` | 🏪 商户 | 每日**三序列**：`{dates: [], views: [], clicks: [], favorites: []}`（`GROUP BY viewed_date / clicked_date / favorited_date`） |

**POST /models/{id}/click 后端逻辑**（仿照 view 接口）：

```python
# 1. 从 JWT 解析当前用户 user_id
# 2. INSERT INTO model_clicks (user_id, model_id, link_url, platform)
#    VALUES (?, ?, ?, ?)                      # 每次点击一条，无去重
# 3. UPDATE models SET click_count = click_count + 1 WHERE id = ?
# 4. 返回 { "click_count": 最新值 }
```

### 2.3 与现有接口的关系

| 接口 | 用途 | 字段来源 |
|------|------|---------|
| `GET /models` | 列表 | `models.view_count`、`models.click_count` |
| `GET /models/{id}` | 详情 | 同上 |
| `POST /models/{id}/view` | 记录浏览 | `model_views`（去重）+ 回写 `view_count` |
| `POST /models/{id}/click` | 记录点击（新增） | `model_clicks`（不去重）+ 回写 `click_count` |
| `POST /models/{id}/favorite/toggle` | 收藏/取消（改造） | `model_favorites_log`（add/remove 明细）+ 回写 `favorite_count`/`favorite_added` |
| `GET /models?hot=true` | 热门排序（改造） | 新热度公式 `weighted_views` |

---

## 三、前端实现

### Task 1: 类型扩展

**Files:** `miniprogram/types/model.ts`

在 `Model` 接口 `favorites: number` 之后添加：

```typescript
  clicks: number          // 点击量（电商链接点击跳转次数，每次+1，不去重）
```

**Files:** `miniprogram/data/models.ts`

为 `merchant-1` 的模型补充 `clicks` 基础值；**刻意让部分模型 clicks > views**（如 Damaged Helmet）以验证"浏览量可小于点击量"的漏斗展示；无电商链接的模型 clicks 可为 0。

### Task 2: Service 层

**Files:** `miniprogram/services/model-service.ts`

1. `ModelItem` 接口增加 `click_count?: number` 与 `favorite_added?: number`
2. `mapModel` 返回值增加 `clicks: item.click_count || 0` 与 `favoriteAdded: item.favorite_added || 0`
3. `IModelService` 接口新增：

```typescript
  recordClick(modelId: string, data?: { link_url?: string; platform?: string }): Promise<number>
  getStatsTrend(days?: number): Promise<{ dates: string[]; views: number[]; clicks: number[]; favorites: number[] }>
```

4. `realApi` 实现：

```typescript
  async recordClick(modelId: string, data?: { link_url?: string; platform?: string }) {
    const res = await api.post<{ click_count: number }>(`/models/${modelId}/click`, data || {})
    return res.click_count
  },
  async getStatsTrend(days = 7) {
    const res = await api.get<{ dates: string[]; views: number[]; clicks: number[] }>(
      `/merchant/stats/trend?days=${days}`
    )
    return res
  },
```

5. `mockApi` 实现：

```typescript
  async recordClick(modelId: string, _data?: { link_url?: string; platform?: string }) {
    const key = 'mock_clicks_' + modelId
    const n = (Number(wx.getStorageSync(key)) || 0) + 1
    try { wx.setStorageSync(key, n) } catch (_) {}
    return n
  },
  async getStatsTrend(days = 7) {
    // 模拟近 N 天三序列（常态：浏览 ≥ 收藏 ≥ 点击）
    const dates: string[] = []; const views: number[] = []; const clicks: number[] = []; const favorites: number[] = []
    const now = Date.now()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000)
      dates.push(`${d.getMonth() + 1}/${d.getDate()}`)
      const v = 40 + Math.round(Math.random() * 60)
      views.push(v)
      favorites.push(Math.round(v * 0.6))
      clicks.push(Math.round(v * 0.3))
    }
    return { dates, views, clicks, favorites }
  },
```

6. `mockApi.getMyModels` 合并本地点击计数（favoriteAdded 直接用 mock 静态数据）
7. `mockApi.getHotModels` 热度公式升级：

```typescript
  async getHotModels(limit?: number) {
    // 新热度公式：特殊浏览量 = views + 5×favoriteAdded + 3×clicks（含取消收藏加权）
    const sorted = [...modelsData]
      .map(m => ({ ...m, hotScore: m.views + m.favoriteAdded * 5 + m.clicks * 3 }))
      .sort((a, b) => b.hotScore - a.hotScore)
    return sorted.slice(0, limit != null ? limit : sorted.length)
  },
```

```typescript
  async getMyModels() {
    const user = userService.getCurrentUser()
    const merchantId = 'merchant-1'
    const name = user ? user.nickname : '星河模型工坊'
    return modelsData
      .filter(m => m.merchantId === merchantId)
      .map(m => ({
        ...m,
        merchantName: name,
        clicks: m.clicks + (Number(wx.getStorageSync('mock_clicks_' + m.id)) || 0),
      }))
  },
```

### Task 3: 点击埋点

**Files:** `miniprogram/pages/model-detail/model-detail.wxml`

`link-card` 增加平台数据：

```xml
<view class="link-card" wx:for="{{model.shopLinks}}" wx:key="url" bindtap="onOpenLink" data-url="{{item.url}}" data-platform="{{item.platform}}">
```

**Files:** `miniprogram/pages/model-detail/model-detail.ts`

`onOpenLink` 中追加埋点（fire-and-forget，不阻塞复制）：

```typescript
  onOpenLink(e: any) {
    const url = e.currentTarget.dataset.url
    if (url) {
      // 点击跳转埋点：每次点击 +1，不去重（浏览量可能小于点击量）
      modelService.recordClick(this._modelId, {
        link_url: url,
        platform: e.currentTarget.dataset.platform || '',
      }).catch(() => {})
      wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none' }),
      })
    }
  },
```

### Task 4: 数据看板 UI（merchant-center）

**Files:** `miniprogram/pages/merchant-center/merchant-center.ts`

`data` 增加看板字段：

```typescript
  data: {
    // ... 现有字段
    stats: { total: 0, views: 0, clicks: 0, favorites: 0, favoriteAdded: 0, conversion: 0 },
    favoriteDiff: 0,              // 收藏后取消人数 = 累计收藏 - 当前收藏（深度意向）
    topByViews: [] as Model[],
    topByClicks: [] as Model[],
    topByFavorites: [] as Model[],
    statusDist: { published: 0, flagged: 0, removed: 0 } as Record<string, number>,
    trend: { dates: [] as string[], views: [] as number[], clicks: [] as number[], favorites: [] as number[] },
    trendReady: false,
    rankTab: 'clicks' as 'views' | 'clicks' | 'favorites',
  },
```

`_loadData` 中模型加载成功后聚合（`getMyModels()` 一次调用，全部派生）：

```typescript
    const total = models.length
    const views = models.reduce((s, m) => s + m.views, 0)
    const clicks = models.reduce((s, m) => s + m.clicks, 0)
    const favorites = models.reduce((s, m) => s + m.favorites, 0)
    const favoriteAdded = models.reduce((s, m) => s + m.favoriteAdded, 0)
    const conversion = views > 0 ? Math.round((clicks / views) * 1000) / 10 : 0
    const statusDist = { published: 0, flagged: 0, removed: 0 }
    models.forEach(m => { if (statusDist[m.status] != null) statusDist[m.status]++ })
    this.setData({
      models,
      stats: { total, views, clicks, favorites, favoriteAdded, conversion },
      favoriteDiff: favoriteAdded - favorites,
      topByViews: [...models].sort((a, b) => b.views - a.views).slice(0, 5),
      topByClicks: [...models].sort((a, b) => b.clicks - a.clicks).slice(0, 5),
      topByFavorites: [...models].sort((a, b) => b.favoriteAdded - a.favoriteAdded).slice(0, 5),
      statusDist,
    })
    // 趋势：Real 模式调后端，失败降级；Mock 模式返回模拟数据
    modelService.getStatsTrend(7)
      .then((raw) => {
        const max = Math.max(...raw.views, ...raw.clicks, ...raw.favorites, 1)
        this.setData({
          trend: {
            dates: raw.dates,
            views: raw.views.map(v => Math.round((v / max) * 100)),
            clicks: raw.clicks.map(c => Math.round((c / max) * 100)),
            favorites: raw.favorites.map(f => Math.round((f / max) * 100)),
          },
          trendReady: true,
        })
      })
      .catch(() => this.setData({ trendReady: false }))
```

新增事件：`onRankTabTap(e)` 切换排行 Tab（clicks/views/favorites，按累计收藏排序）。

**Files:** `miniprogram/pages/merchant-center/merchant-center.wxml`

数据看板 Tab 占位 → 真实 UI：

```xml
<!-- 数据看板 Tab -->
<view class="tab-content" wx:if="{{activeTab === 'stats'}}">
  <!-- 概览卡片：模型/浏览/点击/收藏（收藏卡双值：当前·累计） -->
  <view class="stats-cards">
    <view class="stat-card"><text class="stat-num">{{stats.total}}</text><text class="stat-label">模型总数</text></view>
    <view class="stat-card"><text class="stat-num">{{stats.views}}</text><text class="stat-label">总浏览量</text></view>
    <view class="stat-card"><text class="stat-num">{{stats.clicks}}</text><text class="stat-label">总点击量</text></view>
    <view class="stat-card">
      <text class="stat-num">{{stats.favorites}}</text>
      <text class="stat-label">当前收藏 · 累计 {{stats.favoriteAdded}}</text>
    </view>
  </view>

  <!-- 深度意向：曾收藏又取消 -->
  <view class="intent-bar" wx:if="{{favoriteDiff > 0}}">
    <text>深度意向：{{favoriteDiff}} 人次曾收藏后取消（未转化为当前收藏，但强于普通浏览）</text>
  </view>

  <!-- 转化率 -->
  <view class="conv-bar">
    <text class="conv-label">浏览 → 点击转化率</text>
    <text class="conv-value">{{stats.conversion}}%</text>
    <view class="conv-track"><view class="conv-fill" style="width: {{stats.conversion}}%"></view></view>
  </view>

  <!-- 排行：点击/浏览/收藏 三 Tab（收藏按累计 favoriteAdded 排序） -->
  <view class="rank-section">
    <view class="rank-tabs">
      <text class="rank-tab {{rankTab === 'clicks' ? 'active' : ''}}" data-tab="clicks" bindtap="onRankTabTap">点击</text>
      <text class="rank-tab {{rankTab === 'views' ? 'active' : ''}}" data-tab="views" bindtap="onRankTabTap">浏览</text>
      <text class="rank-tab {{rankTab === 'favorites' ? 'active' : ''}}" data-tab="favorites" bindtap="onRankTabTap">收藏</text>
    </view>
    <view class="rank-row" wx:for="{{rankList}}" wx:key="id">
      <text class="rank-idx">{{index + 1}}</text>
      <text class="rank-name">{{item.name}}</text>
      <text class="rank-num">👁️ {{item.views}}</text>
      <text class="rank-num fav">❤️ {{item.favoriteAdded}}</text>
      <text class="rank-num click">🖱️ {{item.clicks}}</text>
    </view>
  </view>

  <!-- 状态分布 -->
  <view class="status-dist">
    <text class="dist-chip">已发布 {{statusDist.published}}</text>
    <text class="dist-chip warn">违规 {{statusDist.flagged}}</text>
    <text class="dist-chip gray">已撤回 {{statusDist.removed}}</text>
  </view>

  <!-- 趋势（P1：三指标，后端接口就绪后显示） -->
  <view class="trend-section" wx:if="{{trendReady}}">
    <text class="trend-title">近 7 天浏览 / 收藏 / 点击</text>
    <view class="trend-chart">
      <view class="trend-bars">
        <view class="bar-group" wx:for="{{trend.dates}}" wx:key="*this">
          <view class="bar-stack">
            <view class="bar bar-view" style="height: {{trend.views[index]}}%"></view>
            <view class="bar bar-fav" style="height: {{trend.favorites[index]}}%"></view>
            <view class="bar bar-click" style="height: {{trend.clicks[index]}}%"></view>
          </view>
          <text class="bar-date">{{item}}</text>
        </view>
      </view>
      <view class="trend-legend">
        <text class="legend-item view">■ 浏览</text>
        <text class="legend-item fav">■ 收藏</text>
        <text class="legend-item click">■ 点击</text>
      </view>
    </view>
  </view>
  <view class="trend-placeholder" wx:else>
    <text>趋势数据即将上线（需后端 /merchant/stats/trend）</text>
  </view>
</view>
```

**Files:** `miniprogram/pages/merchant-center/merchant-center.wxss`

新增样式：`.stats-cards`（现有）、`.intent-bar`、`.conv-bar/.conv-track/.conv-fill`、`.rank-tabs/.rank-tab/.rank-row/.rank-idx/.rank-name/.rank-num`（`.rank-num.fav` 用 `#e74c3c`、`.click` 用 `#f0ad4e`）、`.status-dist/.dist-chip`、`.trend-section/.trend-bars/.bar-group/.bar-stack/.bar-view/.bar-fav/.bar-click/.bar-date/.trend-legend`、`.trend-placeholder`。沿用现有色板（主色 `#1a1a2e`、浏览 `#4ecdc4`、收藏 `#e74c3c`、点击 `#f0ad4e`）。

柱状图实现：`.bar-stack` 为固定高度容器（如 200rpx），三根子柱 `height: {{n}}%` 并排（宽 ~14rpx，gap 4rpx）。数据为真实值相对最大值（三序列共同 max）的百分比。

**Files:** `docs/reports/2026-08-02-merchant-dashboard-backend-report.md`（新建）

新建发给后端的报告，包含：指标口径矩阵、`model_clicks`/`model_favorites_log` 表结构、API 新增与改造清单、热度公式、前端已实现功能与测试要点。

> 按项目规则，发给后端的报告**只新建不修改**；后续更新通过新建带版本编号的报告表达（如 `merchant-dashboard-backend-report-1.md`），不修改本文件。

---

## 四、Mock 数据补充

`data/models.ts` 补充 `clicks` 与 `favoriteAdded`，**遵循常态排序 views > favorites > clicks**（收藏后取消体现在 favoriteAdded > favorites）：

| 模型 | views | 当前收藏 favorites | 累计收藏 favoriteAdded | clicks | 意图 |
|------|-------|-------------------|----------------------|--------|------|
| Damaged Helmet | 12580 | 386 | ~510 | ~128 | 常态排序 + 收藏后取消（差值）演示 |
| Flight Helmet | 6750 | 189 | ~246 | ~62 | 同上 |
| Lantern | 11230 | 334 | ~451 | ~95 | 同上 |
| 其他商家模型 | — | 保持 | 略高于 favorites | 0 | 无电商链接不计数点击 |

> 注：不再制造 clicks > views 的演示数据；代码逻辑仍兼容该特殊场景（同人反复点击）。

---

## 五、验证清单

- [ ] `npx tsc --noEmit` 无错误
- [ ] Mock 模式：merchant 角色进入数据看板 → 4 张概览卡片有值、收藏卡片显示「当前 X · 累计 Y」（Y > X 体现收藏后取消）
- [ ] 常态排序：浏览 ≥ 累计收藏 ≥ 当前收藏，且浏览 > 点击；无异常告警文案
- [ ] 排行可切换点击/浏览/收藏三个 Tab，收藏排行按累计收藏（favoriteAdded）排序
- [ ] 趋势图显示浏览/收藏/点击三色柱状图
- [ ] 点击埋点：详情页点"购买渠道"链接 → 复制成功 → 返回看板，该模型 clicks +1
- [ ] 收藏埋点：详情页收藏/取消 → 看板收藏卡片数据变化（mock 下当前收藏变化，累计收藏不回退）
- [ ] Real 模式（后端就绪）：看板数据来自 `click_count`/`favorite_added`/`view_count`；trend 接口未就绪时显示降级文案而非报错
- [ ] 普通用户（role=user）：不加载看板数据，无报错
- [ ] 模型管理 Tab 功能回归：列表、编辑、新增不受影响
