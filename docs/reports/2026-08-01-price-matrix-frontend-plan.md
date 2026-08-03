# 价格矩阵 — 前端改造规划（评审稿）

> 对应：`2026-08-01-price-matrix-design.md`（后端方案，已批准）
> 日期：2026-08-01
> 状态：**仅评审与规划，未实施**；G1 已获后端占位实现，G3 待确认
> 前端范围：类型层 + Service 层 + 编辑页矩阵录入（详情页选择器、列表起售价文案本次不做）

---

## 一、评审结论摘要

| 维度 | 结论 |
|------|------|
| 列表接口兼容性 | ✅ 字段名 `price` 不变，列表页（model-card/model-item）零改动 |
| 详情接口兼容性 | ✅ 旧模型 `price_matrix=null` 走现有展示，无破坏 |
| 前端主要改造点 | 类型定义、Service 扩展、编辑页（model-edit）矩阵录入 |
| 方案缺口 | 一键生成预览接口未定义；`price-options` 与 `price_matrix` 职责边界待明确 |

---

## 二、依赖后端确认的缺口（阻塞项）

| # | 缺口 | 后端反馈 | 状态 |
|---|------|---------|------|
| G1 | 一键生成预览端点未定义 | ✅ 已实现占位版：`POST /api/v1/models/price-matrix/preview`（需商家登录，纯计算不落库）。算法 `round(base_price×材料×尺寸×复杂度,2)`，缺省系数 1.0；ID/系数/base_price 校验留待正式版 | **可联调，不可上线** |
| G2 | `GET /models/{id}/price-options` 与详情 `price_matrix` 数据重叠 | 未反馈（本期不做详情页选择器，可暂缓） | 暂缓 |
| G3 | 商家自定义选项的查询/创建时机 | 待确认 | 阻塞编辑页交互 |

### G1 反馈要点（来自 `2026-08-01-g1-price-matrix-preview-feedback.md`）

**请求体**：

```json
{
  "base_price": 99.0,
  "factors": {
    "materials": { "opt_pla": 1.0, "opt_resin": 1.6 },
    "sizes": { "opt_s": 1.0 },
    "complexities": { "opt_easy": 1.0 }
  },
  "materials": [ { "id": "opt_pla", "label": "PLA" } ],
  "sizes": [ { "id": "opt_s", "label": "S" } ],
  "complexities": [ { "id": "opt_easy", "label": "简单" } ]
}
```

**响应体**：`PriceMatrix`（`materials/sizes/complexities` 回显 + `prices` 全组合）

**⚠ 与前端规划差异（需修正）**：选项列表为**对象数组 `{id, label}`**，而非规划中的 `string[]` id 列表——前端 `previewPriceMatrix` 入参必须同步。

---

## 三、前端改造规划（待 G1/G3 确认后实施）

### 3.1 类型层 — `miniprogram/types/model.ts`

```ts
/** 价格矩阵中单个选项 */
export interface PriceMatrixOption {
  id: string
  label: string
}

/** 价格矩阵（权威数据，随模型详情返回） */
export interface PriceMatrix {
  materials: PriceMatrixOption[]
  sizes: PriceMatrixOption[]
  complexities: PriceMatrixOption[]
  /** 组合键 `材料id:尺寸id:复杂度id` → 价格；允许缺省组合 */
  prices: Record<string, number>
}

/** 维度选项（录入表单用） */
export interface PriceOption {
  id: string
  dimension: 'material' | 'size' | 'complexity'
  label: string
  description?: string
  is_preset: boolean
  is_active: boolean
}

/** 因子系数：选项 id → 系数（一键生成入参） */
export type PriceFactors = Record<string, number>
```

`Model` 接口新增字段：

```ts
priceMatrix: PriceMatrix | null   // null = 单一定价模式（兼容旧数据）
```

### 3.2 Service 层 — `miniprogram/services/model-service.ts`

**`mapModel` 扩展**（透传真实矩阵）：

```ts
priceMatrix: item.price_matrix || null,
```

**`CreateModelData` 扩展**（创建/更新请求体，均可选；都不传 = 单一定价）：

```ts
base_price?: number
factors?: PriceFactors
price_matrix?: PriceMatrix
```

**新增 3 个方法**（均走 `api.get/post`）：

```ts
// 拉取某维度可用选项（商家登录）→ GET /price-options?dimension=material
// 注意：本接口后端尚未实现（G3），此处为规划签名
getPriceOptions(dimension: 'material' | 'size' | 'complexity'): Promise<PriceOption[]>

// 新增自定义选项（商家登录）→ POST /price-options；重名 409 抛错
// 注意：本接口后端尚未实现（G3），此处为规划签名
createPriceOption(data: { dimension: 'material' | 'size' | 'complexity'; label: string; description?: string }): Promise<PriceOption>

// 一键生成矩阵预览（G1 已占位实现，可联调）→ POST /models/price-matrix/preview
previewPriceMatrix(params: {
  base_price: number
  factors: PriceFactors
  materials: PriceMatrixOption[]   // ⚠ 对象数组 {id,label}，与后端一致
  sizes: PriceMatrixOption[]
  complexities: PriceMatrixOption[]
}): Promise<PriceMatrix>
```

**Mock 模式**（`USE_MOCK=true`）：
- `getPriceOptions`：返回内置三组预设选项（PLA/树脂/尼龙、S/M/L/XL、简单/中等/复杂）
- `createPriceOption`：本地数组追加，重名抛错
- `previewPriceMatrix`：本地实现公式 `round(base_price × 材料系数 × 尺寸系数 × 复杂度系数, 2)` 生成全矩阵（入参与真实模式一致：选项为对象数组）

### 3.3 编辑页 — `miniprogram/pages/model-edit/model-edit.ts`（矩阵录入）

**表单新增区块「多维定价」（与「单一定价」互斥）：**

```
┌────────────────────────────────────────┐
│ 定价模式        ○ 单一定价   ● 多维矩阵 │
├────────────────────────────────────────┤
│ 基础价（元）*   [ 99.00 ]               │
│ 材料            [PLA✓][树脂✓][尼龙] + 自定义 │
│ 尺寸            [S✓][M✓][L]  + 自定义   │
│ 复杂度          [简单✓][中等✓] + 自定义  │
│ ── 一键生成（填基础价+勾选选项后点击）── │
│ 系数微调（生成后按组合编辑）             │
│ 矩阵预览表：材料×尺寸×复杂度 → 价格      │
│ （生成结果仅预览，保存时随模型提交）      │
└────────────────────────────────────────┘
```

**交互流程：**

```
进入编辑页
  ├─ isEdit → 拉取模型详情，若有 price_matrix → 切"多维矩阵"模式并回填
  ├─ 拉取 GET /price-options（三维度）→ 勾选态
  └─ 单一定价模式 → 保留现有 price/material/dimensions 输入

选择"多维矩阵"模式
  ├─ 勾选选项（可新增自定义：POST /price-options）
  ├─ 填 base_price
  ├─ 点击"一键生成" → previewPriceMatrix() → 展示矩阵表
  ├─ 可逐格微调价格（本地更新 prices）
  └─ 保存：提交 { base_price, factors, price_matrix }（含 prices）到 POST/PUT /models
```

**校验（前端）**：
- 多维模式必填：`base_price > 0`、至少各选 1 个选项
- 生成后价格 `> 0`、最多 2 位小数
- 未生成/未微调时不允许保存（避免空矩阵）

**保存分支：**
- 多维模式 → 提交 `price_matrix`（方式二：直接提交），后端负责冗余同步 `min_price/price/material/dimensions`
- 单一定价 → 提交旧字段（兼容），后端写 `price_matrix=null`

---

## 四、明确不做（本次）

- ❌ 详情页价格选择器（`GET /models/{id}/price-options` 消费方）——后续迭代
- ❌ 列表卡片「¥xx 起」文案改造——列表字段不变，如需标注"起"属展示优化，另行排期
- ❌ 商家中心数据看板、价格排序/筛选（后端已预留 min_price）

---

## 五、验收要点（规划）

| 类别 | 用例 |
|------|------|
| 类型 | `priceMatrix` 为 null 的旧模型渲染/保存不受影响 |
| 编辑 | 多维模式保存后，详情接口返回 `price_matrix` 与提交一致 |
| 兼容 | 单一定价模式保存后 `price_matrix=null`、`price` 为原值 |
| Mock | `previewPriceMatrix` 生成结果与公式一致（缺省系数 1.0、2 位小数） |
| 交互 | 自定义选项重名 409 → Toast；未生成矩阵不可保存 |
