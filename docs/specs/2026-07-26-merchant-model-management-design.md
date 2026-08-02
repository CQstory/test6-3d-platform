# 商家模型管理 — 设计方案

> 日期：2026-07-26
> 范围：商家中心、模型 CRUD、数据看板、电商链接、Tab 角色适配

---

## 一、Tab Bar 角色适配

`tab-bar` 组件根据 `role` 动态切换第三个标签：

```
role === 'merchant' → { key: 'merchant', label: '商家', icon: '🏪' }
否则               → { key: 'merchant', label: '消息', icon: '💬' }
```

新增属性 `role: string`，调用方从 `userService.getCurrentUser().role` 传入。

---

## 二、类型扩展

`types/model.ts`：

```typescript
/** 电商链接 */
interface ShopLink {
  platform: string    // 平台名，如 "淘宝"、"京东"
  shopName: string    // 店铺名
  url: string         // 链接
}

/** 模型状态 */
type ModelStatus = 'published' | 'flagged' | 'removed'

interface Model {
  // 现有字段不变
  id: string; name: string; description: string; thumbnail: string
  modelUrl: string; category: CategoryType; tags: string[]
  faces: number; format: string
  merchantId: string; merchantName: string; merchantAvatar: string
  views: number; favorites: number

  // 新增字段
  price: number              // 价格（元），默认 0
  material: string           // 材质描述
  dimensions: string         // 规格/尺寸
  status: ModelStatus        // 状态，默认 'published'
  shopLinks: ShopLink[]      // 电商链接
}
```

---

## 三、新增组件 `model-item`

**文件**：`components/model-item/`

**职责**：商家模型管理列表中单个项。

### 属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | `Model` | — | 模型数据 |
| `showStatus` | `Boolean` | `true` | 是否显示状态标签 |
| `showPrice` | `Boolean` | `true` | 是否显示价格 |

### 事件

| 事件 | 说明 |
|------|------|
| `bind:tap` | 点击整行，进入编辑 |

### UI

```
┌──────────────────────────────────┐
│ ┌─────────┐  名称                │
│ │  缩略图  │  ¥199 · 生物         │
│ │         │  👁️320  [已发布]     │
│ └─────────┘                      │
└──────────────────────────────────┘
```

- 左侧：缩略图，固定 120rpx × 120rpx，圆角
- 右侧三行：名称（粗体）、价格 + 分类标签、浏览数 + 状态标签
- 状态颜色：已发布 `#4ecdc4`、违规 `#f0ad4e`、已撤回 `#999`

---

## 四、merchant-center 改造

### 页面结构

```
┌──────────────────────────────┐
│  top-bar "商家" / "消息"      │  ← 根据 role 切换
├──────────────────────────────┤
│  role !== 'merchant':        │
│    通知占位（物流等预留）      │
├──────────────────────────────┤
│  role === 'merchant':        │
│  ┌────────────────────────┐  │
│  │  [模型管理]  [数据看板]  │  │  ← 内部 Tab
│  └────────────────────────┘  │
│                              │
│  Tab "模型管理":              │
│  - model-item 列表           │
│  - 浮动 "+" 按钮 → 新增模型   │
│                              │
│  Tab "数据看板":              │
│  - 概览卡片（总模型/浏览量/收藏）│
│  - 按浏览量排序的模型列表      │
│                              │
└──────────────────────────────┘
│  tab-bar                     │
```

### 数据看板

- 概览卡片：三列数字（总模型数、总浏览量、总收藏数），从模型列表前端聚合
- 排行列表：按 `views` 降序，使用 `model-item`（`showStatus=false`, `showPrice=false`）

---

## 五、model-form 新增页面

**文件**：`pages/model-form/`（新增）

**路由区分**：
- 无 `id` 参数 → 新增模式，标题"新增模型"
- 有 `id` 参数 → 编辑模式，标题"编辑模型"，回填已有数据

### 表单字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 模型文件 | 文件上传 | 新增必填 | .zip 压缩包，调用 `uploadModelFile` |
| 缩略图 | 图片上传 | 否 | 调用 `uploadThumbnail` |
| 名称 | text | 是 | |
| 描述 | textarea | 否 | |
| 分类 | picker | 是 | creature/industrial/toy/plant/prop |
| 标签 | text | 否 | 逗号分隔 |
| 面数 | number | 否 | |
| 格式 | radio | 是 | glb / obj |
| 价格 | number | 否 | 单位元 |
| 材质 | text | 否 | |
| 规格/尺寸 | text | 否 | |
| 电商链接 | 动态列表 | 否 | 可添加多条，每条：平台名、店铺名、URL |

### 电商链接子区域

每一条链接：platform + shopName + url 三个输入框 + 删除按钮。底部"添加链接"按钮动态追加。最多 5 条。

### 保存逻辑

- 上传即发布：status 默认 `'published'`，后台通知管理员
- 编辑已有模型：保留原 status，修改后保存
- Mock 模式下数据写回 `modelsData` 数组（内存），切换页面后丢失

---

## 六、Service 层变更

`services/model-service.ts` 新增方法：

| 方法 | 说明 |
|------|------|
| `getMyModels()` | 获取当前商家模型列表（Mock: 过滤 merchantId） |
| `createModel(data)` | 创建模型 |
| `updateModel(id, data)` | 编辑模型 |
| `uploadModelFile(filePath)` | 上传 3D 压缩包，返回 URL |
| `uploadThumbnail(filePath)` | 上传缩略图，返回 URL |

---

## 七、涉及修改的文件

| 文件 | 变更 |
|------|------|
| `types/model.ts` | 新增 ShopLink、ModelStatus，扩展 Model |
| `components/tab-bar/` | 新增 role 属性，动态切换第三标签 |
| `components/model-item/` | **新增**组件 |
| `pages/merchant-center/` | 完全重写（角色判断 + 双 Tab + 通知占位） |
| `pages/model-form/` | **新增**页面（新增/编辑共用） |
| `pages/model-detail/` | 显示价格、材质、规格、电商链接 |
| `services/model-service.ts` | 新增 5 个方法 |
| `data/models.ts` | 现有数据补全新字段默认值 |
| `app.json` | 注册 model-form 页面路由 |

---

## 八、实现顺序

1. 类型扩展 + Mock 数据补充
2. `model-item` 组件
3. `tab-bar` 角色适配
4. `merchant-center` 重写
5. `model-form` 页面
6. Service 层新方法
7. `model-detail` 补充展示
8. 集成验证

---

## 九、边界与约束

- 普通用户进入 merchant-center 仅看到通知占位，不加载商家数据
- Mock 模式下模型状态依赖管理员手动修改数据（模拟），不实现完整审核流
- 文件上传在 Mock 模式返回模拟 URL，真实模式走 `POST /upload/model`
- 电商链接最多 5 条，超出时"添加链接"按钮置灰
- 模型价格默认 0（免费），不输入时按 0 处理
