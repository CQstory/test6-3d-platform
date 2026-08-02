# 搜索功能 — 前端变更报告（给后端）

> 分支：`feat/search`
> 日期：2026-08-01
> 状态：前端改造中，待后端联调

---

## 一、功能概述

模型库页（`pages/model-list`）搜索能力升级，包含四项：

| 功能 | 数据源 | 依赖后端 |
|------|--------|---------|
| 关键词搜索 + 分类筛选 + 分页 | `GET /models` | ✅（已有，需扩展 sort） |
| 搜索历史 | 前端本地 `wx.storage` | ❌ |
| 热门搜索词 | `GET /search/hot` | ✅（新增） |
| 搜索建议联想 | `GET /search/suggest` | ✅（新增） |

交互流程：
- 搜索框聚焦 / 关键词为空 → 展示「搜索历史 + 热门搜索词」
- 输入关键词（防抖 300ms）→ 请求搜索建议，下拉展示
- 确认搜索（回车/点击建议/点击历史）→ 请求 `GET /models` 列表，上拉加载更多分页

---

## 二、接口需求

### 2.1 搜索列表 — `GET /models`（扩展已有接口）

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `keyword` | string | 否 | 搜索关键词，匹配模型 `name`、`tags` |
| `category` | string | 否 | 分类：creature/industrial/toy/plant/prop |
| `page` | int | 否 | 页码，默认 1 |
| `size` | int | 否 | 每页条数，默认 20 |
| `sort` | string | 否 | `hot`（默认，按热度）/ `new`（按发布时间倒序） |

**行为约定**
- `keyword` 为空且无 `category` → 返回全部（保持现状）
- 大小写不敏感；`tags` 支持部分匹配
- `keyword` 与 `category` 可组合过滤

**Response**（保持现有结构）
```json
{
  "total": 42,
  "items": [
    {
      "id": "uuid",
      "name": "...",
      "thumbnail": "...",
      "faces": 10240,
      "format": "glb",
      "category": "creature",
      "tags": ["3D", "角色"],
      "view_count": 1200,
      "favorite_count": 56,
      "is_favorited": false,
      "shop": { "id": "uuid", "name": "...", "avatar": "..." }
    }
  ]
}
```

> 说明：`total` 用于前端判断是否还有下一页（`page * size < total`）。

---

### 2.2 热门搜索词 — `GET /search/hot`（新增）

返回全站近期搜索频次最高的关键词，供搜索框空态展示。

**Query 参数**：无（或 `size=10` 可选）

**Response**
```json
{
  "items": [
    { "keyword": "头盔", "count": 1280 },
    { "keyword": "狐狸", "count": 956 },
    { "keyword": "灯笼", "count": 731 }
  ]
}
```

**约定**
- 按 `count` 降序，默认最多 10 条
- `keyword` 为去重后的搜索词（同词不同大小写视为同一词）
- 无需登录

---

### 2.3 搜索建议 — `GET /search/suggest`（新增）

输入关键词时返回联想建议（模型名/标签前缀或包含匹配），供下拉列表展示。

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `keyword` | string | 是 | 输入中的关键词，至少 1 个字符 |
| `size` | int | 否 | 返回条数，默认 10 |

**Response**
```json
{
  "items": [
    { "keyword": "头盔", "type": "tag" },
    { "keyword": "飞行头盔", "type": "name" },
    { "keyword": "骑士头盔", "type": "name" }
  ]
}
```

**约定**
- `type`：`name`（模型名）/ `tag`（标签），前端可据此展示不同样式（可选）
- 匹配规则：模型 `name` 或 `tags` 包含 `keyword`，按热度（view_count）降序
- 仅返回 `status=published` 的模型相关词
- 无需登录

---

## 三、前端改造点

### 3.1 model-service 方法改造

#### 3.1.1 `searchModels`（改造现有方法，破坏性变更）

现有 `searchModels(keyword: string): Promise<Model[]>` 改为分页参数对象，返回分页结果。**当前无其他调用方，可安全变更**。

```ts
// IModelService 接口
searchModels(params: {
  keyword?: string
  category?: string          // '' 或 '' 表示全部；否则为 CategoryType
  page?: number              // 默认 1
  pageSize?: number          // 默认 20
  sort?: 'hot' | 'new'       // 默认 'hot'
}): Promise<{ total: number; items: Model[] }>
```

- **Real**：`GET /models?keyword=&category=&page=&size=&sort=`，响应 `total` + `items`（经 `mapModel` 映射为前端 `Model`）
- **Mock**：在本地 `modelsData` 上模拟过滤：`keyword` 匹配 `name`/`tags`（不区分大小写）、`category` 精确匹配、`hot` 按 `views*0.4 + favorites*0.6*10` 降序、`new` 按数组顺序，再手动切片模拟分页（`total` 为过滤后总数）

#### 3.1.2 `getHotSearchWords`（新增）

```ts
getHotSearchWords(): Promise<string[]>
```

- **Real**：`GET /search/hot`，响应 `items` 映射为 `keyword` 字符串数组（仅取 `keyword` 字段，前端不展示 count）
- **Mock**：返回内置数组 `['头盔', '狐狸', '灯笼', '相机', '牛油果']`

#### 3.1.3 `getSearchSuggest`（新增）

```ts
getSearchSuggest(keyword: string): Promise<{ keyword: string; type: 'name' | 'tag' }[]>
```

- **Real**：`GET /search/suggest?keyword=<encodeURIComponent(keyword)>&size=10`，响应 `items` 直接透传
- **Mock**：在 `modelsData` 上过滤 `name`/`tags` 包含关键词的词，按 `views` 降序取前 10

---

### 3.2 搜索历史（新增 `utils/search-history.ts`）

纯前端本地实现，不依赖后端：

```ts
export const SEARCH_HISTORY_KEY = 'search_history'   // storage key
const MAX_HISTORY = 10                                 // 上限 10 条

export function getHistory(): string[]                // 读取（容错解析）
export function addHistory(keyword: string): string[] // 去重置顶、截断到 10 条、写回并返回
export function removeHistory(keyword: string): void  // 单条删除
export function clearHistory(): void                  // 全部清除
```

约定：
- 存储结构为 `string[]`，最新在前
- `addHistory` 对关键词去空格、去重（已存在则移到最前）
- 所有读写均 `try/catch` 包裹，storage 异常不影响页面

---

### 3.3 model-list 页面状态设计

```ts
Page({
  data: {
    keyword: '',
    activeCategory: 'all',
    categories: [] as { key: string; label: string }[],
    // 列表与分页
    models: [] as Model[],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
    loading: false,          // 首屏/翻页中
    // 搜索面板
    showPanel: false,        // 历史 + 热词面板（关键词为空时）
    history: [] as string[],
    hotWords: [] as string[],
    suggestions: [] as { keyword: string; type: string }[],
    showSuggest: false,      // 建议下拉层
  },
})
```

私有状态（`this` 上，非渲染数据）：
- `_searchTimer`：防抖定时器
- `_seq`：请求序号，递增，用于丢弃过期响应（竞态保护）
- `_pending`：标记列表请求进行中，防止 onReachBottom 重复触发

---

### 3.4 页面事件流

```
onLoad
  ├─ 构建分类列表（全部 + 5 类）
  ├─ getHistory() → history
  ├─ getHotSearchWords() → hotWords
  └─ doSearch({ reset: true })  // 加载默认列表 page=1

onSearchInput(e)
  ├─ 更新 keyword
  ├─ 防抖 300ms：
  │    ├─ keyword 为空 → 显示历史+热词面板（showPanel=true），关闭建议
  │    └─ keyword 非空 → getSearchSuggest() 填充 suggestions（带 _seq 竞态保护）

onSearchConfirm()        // 键盘回车
onSuggestTap(e)          // 点击建议词
onHotWordTap(e)          // 点击热门词
onHistoryTap(e)          // 点击历史词
  └─ 统一走 doSearch(keyword)：
       ├─ 清空建议/关闭面板
       ├─ addHistory(keyword)
       └─ 请求 page=1 替换列表

onCategoryTap(e)         // 切换分类
  └─ 更新 activeCategory → doSearch({ reset: true })

onReachBottom()          // 上拉加载更多
  └─ hasMore && !loading → page+1 追加到列表尾部

onClearHistory() / onRemoveHistory(e)
```

`doSearch` 核心逻辑（防竞态，即 `_fetchList`）：

```ts
async _fetchList(reset: boolean) {
  const seq = ++this._seq
  this.setData({ loading: true })
  try {
    const res = await modelService.searchModels({
      keyword: this.data.keyword,
      category: this.data.activeCategory === 'all' ? '' : this.data.activeCategory,
      page: reset ? 1 : this.data.page + 1,
      pageSize: this.data.pageSize,
      sort: 'hot',
    })
    if (seq !== this._seq) return          // 过期响应丢弃
    const merged = reset ? res.items : [...this.data.models, ...res.items]
    this.setData({
      models: merged,
      total: res.total,
      page: reset ? 1 : this.data.page + 1,
      hasMore: merged.length < res.total,
      loading: false,
    })
  } catch (e) {
    if (seq !== this._seq) return
    this.setData({ loading: false })
    wx.showToast({ title: '加载失败，请重试', icon: 'none' })  // 保留旧列表不清空
  }
}
```

---

### 3.5 WXML 结构示意

```xml
<view class="page">
  <top-bar title="模型库" />
  <view class="page-content">
    <!-- 搜索框 + 取消 -->
    <view class="search-bar">
      <input placeholder="搜索模型..." value="{{keyword}}"
             bindinput="onSearchInput" bindconfirm="onSearchConfirm"
             bindfocus="onSearchFocus" />
      <text wx:if="{{keyword}}" bindtap="onCancelSearch">取消</text>
    </view>

    <!-- 建议下拉层（绝对定位覆盖） -->
    <view class="suggest-layer" wx:if="{{showSuggest && suggestions.length > 0}}">
      <view wx:for="{{suggestions}}" wx:key="keyword" bindtap="onSuggestTap">
        <text class="suggest-tag">{{item.type === 'tag' ? '标签' : '模型'}}</text>
        <text>{{item.keyword}}</text>
      </view>
    </view>

    <!-- 空态面板：历史 + 热门词 -->
    <view class="panel" wx:if="{{showPanel && !keyword}}">
      <block wx:if="{{history.length > 0}}">
        <view class="panel-header">
          <text>搜索历史</text>
          <text bindtap="onClearHistory">清空</text>
        </view>
        <view class="word-tags">
          <view wx:for="{{history}}" wx:key="*this" class="word-tag" bindtap="onHistoryTap">
            <text>{{item}}</text>
            <text data-word="{{item}}" catchtap="onRemoveHistory">×</text>
          </view>
        </view>
      </block>
      <block wx:if="{{hotWords.length > 0}}">
        <view class="panel-header"><text>热门搜索</text></view>
        <view class="word-tags">
          <view wx:for="{{hotWords}}" wx:key="*this" class="word-tag hot" bindtap="onHotWordTap">
            <text>{{item}}</text>
          </view>
        </view>
      </block>
    </view>

    <!-- 分类筛选（仅列表态显示） -->
    <scroll-view class="category-scroll" scroll-x wx:if="{{!showPanel}}">...</scroll-view>

    <!-- 模型列表 -->
    <view class="model-grid">
      <view wx:for="{{models}}" wx:key="id" class="grid-item">
        <model-card model="{{item}}" bind:tap="onCardTap" />
      </view>
    </view>

    <!-- 底部状态 -->
    <view class="list-status">
      <text wx:if="{{loading}}">加载中...</text>
      <text wx:elif="{{models.length === 0 && !showPanel}}">暂无模型</text>
      <text wx:elif="{{!hasMore && models.length > 0}}">已加载全部</text>
    </view>
  </view>
  <tab-bar active="browse" role="{{role}}" />
</view>
```

---

### 3.6 边界与细节约定

| 场景 | 处理 |
|------|------|
| 输入防抖 | `setTimeout` 300ms，新输入清除旧定时器 |
| 请求竞态 | `_seq` 序号递增，仅最新响应生效，旧响应直接丢弃 |
| 快速连点分类 | 每次切换触发 `doSearch`，靠 `_seq` 保证最终展示最新分类结果 |
| 上拉连发 | `loading` 标记 + `hasMore` 双重判断，翻页中不再触发 |
| 翻页失败 | Toast 提示，保留已加载列表，不丢数据 |
| 空结果 | 显示「暂无模型」；建议为空则隐藏下拉层 |
| 分类为空时面板 | 仅当 `keyword` 为空且列表无搜索词时展示面板（面板态隐藏分类栏） |
| 点击「取消」 | 清空 keyword、关闭面板与建议、恢复默认列表 |
| 未登录 | 搜索/历史/热词均可使用，不依赖登录态 |

---

## 四、验收标准

### 4.1 搜索与分页
- 关键词搜索命中 `name`/`tags`（部分匹配、大小写不敏感）
- 关键词 + 分类组合过滤正确
- 分页：每页 20 条，上拉加载无重复、无遗漏，最后一页正确终止
- `sort=hot` 按热度降序，`sort=new` 按时间倒序
- 无结果时显示空状态提示

### 4.2 热门搜索词
- 搜索框空态展示热门词，点击即搜索
- 词条可点击且结果正确

### 4.3 搜索建议
- 输入 1 个字符以上即触发（防抖 300ms）
- 点击建议词 → 以该词发起搜索
- 建议词点击后计入热门搜索统计（后端记录）

### 4.4 搜索历史（纯前端）
- 搜索成功后写入历史，去重置顶
- 上限 10 条，支持单条删除与全部清除
- 冷启动（未登录）也可用

---

## 五、Mock 模式说明

`USE_MOCK = true` 时：
- `searchModels`：在本地 `modelsData` 上模拟 keyword/category 过滤 + 假分页
- `getHotSearchWords`：返回内置热词数组
- `getSearchSuggest`：本地过滤模型 name/tags 模拟联想
- 搜索历史逻辑与真实模式一致（走本地 storage）

---

## 六、风险与依赖

- 后端需实现 `GET /search/hot`、`GET /search/suggest` 两个新接口
- `GET /models` 需支持 `sort` 参数（hot/new）
- 热门词统计依赖后端记录搜索行为（前端每次确认搜索会调用 `GET /models?keyword=`，后端可据此埋点）
