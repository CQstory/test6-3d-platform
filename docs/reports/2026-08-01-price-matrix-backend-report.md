# 价格矩阵 — 前端接口需求报告（给后端）

> 对应：`2026-08-01-price-matrix-design.md`（后端方案）、`2026-08-01-price-matrix-frontend-plan.md`（前端规划）
> 日期：2026-08-01
> 状态：前端已实现，待后端确认/实现接口后联调
> 涉及文件：`miniprogram/services/model-service.ts`、`miniprogram/pages/model-edit/model-edit.ts`、`miniprogram/types/model.ts`

---

## 一、前端已实现概览

| 功能 | 说明 |
|------|------|
| 编辑页多维定价录入 | 模式切换（单一定价/多维矩阵）、三维选项勾选 + 系数输入、一键生成、逐格微调、编辑回填 |
| 自定义选项 | 编辑页可新增自定义选项（依赖 G3 接口） |
| 兼容性 | 列表接口 `price` 字段不变，列表页零改动；旧模型 `price_matrix=null` 走单一定价展示 |
| 降级策略 | G3 接口未就绪时，编辑页自动回退使用前端内置预置选项（PLA/树脂/尼龙、S/M/L/XL、简单/中等/复杂），后端就绪后自动切换，**前端无需改动** |

---

## 二、接口清单总览

| # | 接口 | 方法 | 鉴权 | 状态 | 前端调用点 |
|---|------|------|------|------|-----------|
| 1 | `/price-options?dimension=` | GET | 商家 | **待后端实现（G3）** | 编辑页加载三维选项 |
| 2 | `/price-options` | POST | 商家 | **待后端实现（G3）** | 编辑页新增自定义选项 |
| 3 | `/models/price-matrix/preview` | POST | 商家 | ✅ 已占位实现（G1），正式版需补校验 | 一键生成矩阵预览 |
| 4 | `/models` | POST | 商家 | 需扩展 `price_matrix` 等字段 | 创建模型（矩阵模式） |
| 5 | `/models/{id}` | PUT | 商家 | 需扩展 `price_matrix` 等字段 | 更新模型（矩阵模式） |
| 6 | `/models/{id}` | GET | 公开 | 需扩展返回 `price_matrix` | 编辑页回填 / 详情展示 |
| 7 | `/models/{id}/price-options` | GET | 公开 | 暂缓（G2，本期不做详情页选择器） | — |

---

## 三、接口详细契约

### 3.1 `GET /api/v1/price-options`（G3，待实现）

拉取某维度可用选项（平台预置 + 当前商家自定义，`is_active=true`）。

**Query**：`dimension=material|size|complexity`（必填，非法值 422）

**Response**：
```json
{
  "items": [
    { "id": "uuid", "dimension": "material", "label": "PLA", "description": null, "is_preset": true, "is_active": true },
    { "id": "uuid", "dimension": "material", "label": "ABS", "description": "商家自定义", "is_preset": false, "is_active": true }
  ]
}
```

> 前端按 `items` 数组渲染，空数组也可（前端有预置回退）。

### 3.2 `POST /api/v1/price-options`（G3，待实现）

新增自定义选项（商家）。

**Request**：
```json
{ "dimension": "material", "label": "ABS", "description": "可选" }
```

**Response**：201，返回 `PriceOption`（同上结构）

**错误**：同维度同商家重名 → `409`（前端 Toast 提示"该选项已存在"）

### 3.3 `POST /api/v1/models/price-matrix/preview`（G1，已占位实现）

一键生成矩阵预览，纯计算、不落库。

**Request**（`factors` 为 维度 → 选项id → 系数 的嵌套结构；选项列表为**对象数组**，注意非纯 id 数组）：
```json
{
  "base_price": 99.0,
  "factors": {
    "material":    { "opt_pla": 1.0, "opt_resin": 1.6 },
    "size":        { "opt_s": 1.0, "opt_m": 1.3 },
    "complexity":  { "opt_easy": 1.0, "opt_med": 1.4 }
  },
  "materials":    [ { "id": "opt_pla", "label": "PLA" }, { "id": "opt_resin", "label": "树脂" } ],
  "sizes":        [ { "id": "opt_s", "label": "S" }, { "id": "opt_m", "label": "M" } ],
  "complexities": [ { "id": "opt_easy", "label": "简单" }, { "id": "opt_med", "label": "中等" } ]
}
```

**Response**：`PriceMatrix`（`materials/sizes/complexities` 回显 + 全组合 `prices`）：
```json
{
  "materials": [ { "id": "opt_pla", "label": "PLA" } ],
  "sizes":     [ { "id": "opt_s", "label": "S" } ],
  "complexities": [ { "id": "opt_easy", "label": "简单" } ],
  "prices": {
    "opt_pla:opt_s:opt_easy": 99.0,
    "opt_pla:opt_s:opt_med": 138.6
  }
}
```

**正式版需补校验**（来自 G1 反馈报告）：
- 选项 ID 存在性（查 `PriceOption` 表）→ 422
- 系数范围（建议 `0.5 ~ 10.0`，禁止 0/负数）→ 422
- `base_price > 0`、最多 2 位小数 → 422
- 组合键格式 `材料id:尺寸id:复杂度id`，键集合 ⊆ 笛卡尔积（允许缺省）→ 422

### 3.4 `POST /api/v1/models`、`PUT /api/v1/models/{id}`（扩展，需后端实现）

请求体在现有字段基础上**新增可选字段**（都不传 = 单一定价，兼容旧行为）：

```json
{
  "...现有字段": null,
  "base_price": 99.0,
  "factors": {
    "material": { "opt_pla": 1.0 },
    "size":     { "opt_s": 1.0 },
    "complexity": { "opt_easy": 1.0 }
  },
  "price_matrix": {
    "materials": [ { "id": "opt_pla", "label": "PLA" } ],
    "sizes": [ { "id": "opt_s", "label": "S" } ],
    "complexities": [ { "id": "opt_easy", "label": "简单" } ],
    "prices": { "opt_pla:opt_s:opt_easy": 99.0 }
  }
}
```

**后端落库时需同步（前端依赖）**：
- `min_price = min(prices.values())` + 索引
- `price`（列表展示字段，保持列名不变）= min_price
- `material` = 矩阵材料 label 列表 `/` 拼接（如 `"PLA/树脂"`）
- `dimensions` = 矩阵尺寸 label 列表 `/` 拼接（如 `"S/M"`）

> 前端矩阵模式提交时已自行计算这些冗余字段，后端以矩阵为权威重新计算即可（前端值与后端计算值应一致）。

### 3.5 `GET /api/v1/models/{id}`（扩展）

响应模型对象新增字段（前端 `mapModel` 已按此映射）：

```json
{
  "...现有字段": null,
  "price_matrix": {
    "materials": [ { "id": "opt_pla", "label": "PLA" } ],
    "sizes": [ { "id": "opt_s", "label": "S" } ],
    "complexities": [ { "id": "opt_easy", "label": "简单" } ],
    "prices": { "opt_pla:opt_s:opt_easy": 99.0 }
  }
}
```

- 旧模型（无矩阵）返回 `"price_matrix": null`
- 组合键缺省组合在 `prices` 中直接缺键（前端不渲染）

---

## 四、数据结构（前后端一致约定）

```jsonc
// PriceMatrix
{
  "materials":    [ { "id": "string", "label": "string" } ],
  "sizes":        [ { "id": "string", "label": "string" } ],
  "complexities": [ { "id": "string", "label": "string" } ],
  "prices": { "材料id:尺寸id:复杂度id": 99.0 }   // 缺省组合缺键
}

// PriceOption
{
  "id": "uuid",
  "dimension": "material | size | complexity",
  "label": "string",
  "description": "string | null",
  "is_preset": true,
  "is_active": true
}

// PriceFactors（preview 与创建/更新共用）
{
  "material": { "选项id": 1.0 },
  "size":     { "选项id": 1.0 },
  "complexity": { "选项id": 1.0 }
}
```

---

## 五、状态同步表

| 项 | 状态 | 说明 |
|----|------|------|
| G1 preview 端点 | ✅ 占位实现，前端已联调 | 正式版补校验后即可上线 |
| G2 详情页选择器 | 暂缓 | 本期不做，`GET /models/{id}/price-options` 可延后实现 |
| G3 选项接口 | ⏳ 待后端实现 | 前端已做预置回退，接口就绪即自动启用 |
| 模型创建/更新/详情 | ⏳ 待后端扩展 | 前端已按契约实现并提交 |

---

## 六、验收要点（前端侧配合验证）

| 类别 | 用例 |
|------|------|
| 生成 | preview 缺省系数 = 1.0；四舍五入 2 位小数；空选项列表 422 |
| 校验 | 引用不存在选项 → 422；系数 0/负 → 422；base_price ≤ 0 → 422；缺省组合合法 |
| 同步 | 提交矩阵后详情返回 `price_matrix` 一致；`price` = min_price；material/dimensions 拼接正确 |
| 兼容 | 不传矩阵字段的旧请求 → 单一定价，行为与改造前一致 |
| 权限 | 自定义选项仅本人可见；商家不能改他人模型；未登录访问公开详情正常 |
