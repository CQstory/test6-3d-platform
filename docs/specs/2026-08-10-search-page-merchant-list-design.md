# 搜索页改版与商家列表布局设计

- 日期：2026-08-10
- 类型：设计文档（spec）
- 状态：已与用户确认

## 1. 背景与目标

当前第二个 Tab「模型库」（`pages/model-list/model-list`）仅提供模型列表。由于商家业务领域不同（擅长摄影道具、手办、沙盘等），用户需要一条「按业务领域快速锁定商家」的通道。本次改版将第二个 Tab 升级为**统一搜索页**，内含「搜索模型」「搜索商家」两个子页面。

核心目标：用户可通过商家名称、简介、擅长领域关键词快速找到业务匹配的商家。

## 2. Tab-bar 整体结构（4 个 Tab 不变）

| Tab | 标签 | 图标 | 路由 | 变化 |
|---|---|---|---|---|
| 1 | 主页 | 🏠 | `pages/index/index` | 不变 |
| 2 | 搜索 | 🔍 | `pages/model-list/model-list` | 原「模型库 📦」改为统一搜索页 |
| 3 | 消息 / 商家 | 💬 / 🏪 | `pages/merchant-center/merchant-center` | 不变（保留角色感知切换） |
| 4 | 我的 | 👤 | `pages/profile/profile` | 不变 |

**路由决策**：不新建页面，直接将现有 `model-list` 页面升级为搜索页容器。该页面已在 `app.json` 的 `tabBar.list` 中注册，改动最小；原模型列表功能完整保留为「搜索模型」子页面。

`components/tab-bar/tab-bar.ts` 中 `browse` Tab 的 label 由「模型库」改为「搜索」，icon 由 📦 改为 🔍；路由映射不变。

## 3. 搜索页布局（model-list 页面改造）

自上而下：

1. `top-bar`，标题「搜索」
2. **inner-tabs**：`搜索商家` / `搜索模型`
   - 样式完全复用 `pages/merchant-center/merchant-center.wxss` 的 `.inner-tabs`（横向两 Tab + 下划线指示）
   - 默认选中「搜索模型」，保持老用户习惯
3. 子页面内容区：`wx:if` 切换，两个子页面各自维护独立的搜索框关键词与筛选状态（切换 Tab 不互相清空）
4. `bottom-spacer` + `<tab-bar active="browse" role="{{role}}" />`

## 4. 搜索商家子页面布局

自上而下：

### 4.1 搜索框
- placeholder：「店铺名称 / 简介关键词」
- 匹配字段：`name` + `description` + `specialties`（不区分大小写）

### 4.2 擅长领域筛选条
- 横向滚动 chips（`scroll-view scroll-x`，复用 model-list 的 `.category-scroll` 结构）
- 首项固定「全部」；其余项从全量商家 `specialties` 去重生成
- 选中态：品牌色 `#4ecdc4`，与现有分类筛选样式一致

### 4.3 商家卡片列表（单列）

新建自定义组件 `components/merchant-card/`（ts/wxml/wxss/json 四件套），风格对齐现有 `model-card`（白色卡片、`16rpx/24rpx` 圆角、轻量阴影）。每张卡片结构：

```
┌────────────────────────────────────────┐
│ (头像 圆形)  店铺名              ⭐评分 │
│             标签摘要（单行省略）        │
│             📦 N 模型 · 👁️ 浏览量      │
│ ┌────────┐ ┌────────┐ ┌────────┐      │
│ │ 缩略图1 │ │ 缩略图2 │ │ 缩略图3 │      │
│ └────────┘ └────────┘ └────────┘      │
└────────────────────────────────────────┘
```

- **上行**：圆形头像（约 `92rpx`）+ 右侧信息区（店铺名/评分、简介单行省略、数据行）
- **下行**：3 张等宽代表作缩略图（横向三等分，圆角 `16rpx`）
  - 数据来源：该商家名下浏览量（views）最高的前 3 个模型的 `thumbnail`
  - 不足 3 个时显示实际数量；无模型时隐藏该行
- **交互**：
  - 点击卡片主体 → `wx.navigateTo` 至 `/pages/store-front/store-front?id={merchantId}`
  - 点击缩略图 → `wx.navigateTo` 至 `/pages/model-detail/model-detail?id={modelId}`（阻止冒泡）
  - 组件通过 `bind:tap` 向外抛 `detail.merchant` / `detail.model`，与 model-card 的事件风格一致

### 4.4 空态
- 无匹配结果时显示：「未找到相关商家」，样式对齐 model-list 的 `.empty`

## 5. 搜索模型子页面

现有 `model-list` 的搜索框 + 分类横向筛选 + `model-grid`（model-card 双列网格）原样迁入该子页面，逻辑与样式不变。

## 6. 数据与契约变更

### 6.1 前端类型与数据
- `types/model.ts`：`Merchant` 接口新增 `specialties: string[]`（擅长领域标签）
- `data/merchants.ts`：4 家 mock 商家补充 specialties 示例值：
  - 星河模型工坊：`['科幻军事', '摄影道具']`
  - 萌趣手办社：`['Q版手办', '动物造型']`
  - 像素工坊：`['道具场景', '沙盘']`
  - 龙鳞雕塑室：`['东方神兽', '雕塑']`

### 6.2 服务层
- `services/merchant-service.ts`：
  - `ShopResponse` 增加可选字段 `specialties?: string[]`
  - `mapShop` 映射 `specialties`，缺省为 `[]`
- 商家卡片缩略图由页面层聚合：调用 `modelService` 获取全量模型后按 `merchantId` 分组，取 views 前 3

### 6.3 后端契约（需出后端协作报告）
- 要求 `GET /shops/{id}` 与后续店铺列表接口的响应体新增 `specialties: string[]` 字段
- 报告按命名规范输出至 `docs/reports/2026-08-10-merchant-specialties-backend-report.md`

### 6.4 其他改动点
- `pages/index/index.ts` 中跳转「模型库」的入口（`onGoBrowse`）无需改动（路由未变）
- `app.json`：`tabBar.list` 中 model-list 项的 `text` 由「模型库」改为「搜索」（自定义 tab-bar 下运行时由组件渲染 text，此改动仅为配置一致性）；pages/subPackages/preloadRule 均不变

## 7. 文件改动清单

| 文件 | 改动 |
|---|---|
| `components/tab-bar/tab-bar.ts` | browse Tab label/icon 改为「搜索 🔍」 |
| `pages/model-list/model-list.wxml` | 增加 inner-tabs；拆分为商家/模型两个子页面区块 |
| `pages/model-list/model-list.ts` | 新增 activeTab、商家列表/筛选/领域 chips 状态与事件；模型子页面逻辑保留 |
| `pages/model-list/model-list.wxss` | 新增 inner-tabs（复用 merchant-center 样式）、商家列表与缩略图条样式 |
| `pages/model-list/model-list.json` | usingComponents 注册 `merchant-card` |
| `components/merchant-card/*` | 新增组件（ts/wxml/wxss/json） |
| `types/model.ts` | `Merchant` 新增 `specialties` |
| `data/merchants.ts` | mock 数据补充 specialties |
| `services/merchant-service.ts` | `ShopResponse`/`mapShop` 适配 specialties |
| `app.json` | tabBar 中 model-list 的 `text` 改为「搜索」 |
| `docs/reports/2026-08-10-merchant-specialties-backend-report.md` | 后端协作报告（新增） |

## 8. 验证方式

1. `tsc --noEmit` 编译通过
2. 微信开发者工具走查：
   - 底部 4 Tab 切换正常，「搜索」Tab 高亮正确
   - inner-tabs 切换「搜索商家 / 搜索模型」，两侧状态互不干扰
   - 商家关键词搜索（名称/简介/领域词）、领域 chips 筛选、组合筛选
   - 商家卡片缩略图数量正确（≤3），点击卡片进店铺、点击缩略图进模型详情
   - 空态展示
   - 商家角色登录后第三个 Tab 仍显示「商家」

## 9. 已否决的备选方案

- **新增第 5 个 Tab 放商家入口**：Tab 过多，且用户明确选择 4 Tab 内切换方案
- **搜索框内下拉前缀切换**：子页面概念弱化，筛选区需动态适配
- **商家卡片双列网格 / 封面大卡**：前者放不下简介，后者一屏信息量低；最终采用列表行 + 3 缩略图条
- **缩略图纵排右侧**：30px 尺寸看不清作品细节
- **领域标签取自简介关键词提取 / 模型分类聚合**：提取不可靠 / 语义不符，最终新增 `specialties` 字段
