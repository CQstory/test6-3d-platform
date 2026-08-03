# 模型多维价格数据结构设计

> 日期：2026-08-01
> 状态：已批准，待实现
> 关联：`docs/search-backend-report.md`、`docs/search-api-test-cases.md`

---

## 一、背景与目标

当前 `Model3D` 仅支持单一定价（`price` Float + `material` String + `dimensions` String）。需求升级为**多维定价**：价格由 材料 × 尺寸 × 复杂度 三个维度组合决定，组合数最多可达 3×4×5=60 个价格点。

**核心约束（已与需求方确认）：**

| 决策项 | 结论 |
|--------|------|
| 定价方式 | 全矩阵存储 + 基础价一键生成（可微调） |
| 维度选项 | 平台预置常见枚举 + 商家自定义选项 |
| 展示场景 | 列表显示起售价、详情页选组合看价格 |
| 交易 | **无任何交易行为**，仅展示和引流（外部电商链接走现有 `shop_links`） |
| 检索 | 预留 `min_price` 冗余字段 + 索引（暂不做价格排序/筛选） |

---

## 二、数据模型

### 2.1 新增 `PriceOption` — 维度选项字典表

管理 材料 / 尺寸 / 复杂度 三个维度的取值，平台预置与商家自定义并存。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | `gen_uuid()` |
| `dimension` | String(16) | `material` / `size` / `complexity` |
| `label` | String(64) | 如 "PLA" / "S" / "简单"；同维度内唯一 |
| `description` | String(128) nullable | 如复杂度说明"细节多、打印耗时长" |
| `sort_order` | Integer | 默认 0，控制表单/选择器排序 |
| `is_preset` | Boolean | 平台预置 / 商家自定义 |
| `is_active` | Boolean | 软删除标记 |
| `created_by` | UUID nullable | 自定义选项归属商家；预置选项为空 |

**预置选项（迁移脚本写入）：**

| 维度 | 选项 |
|------|------|
| material | PLA、树脂、尼龙 |
| size | S、M、L、XL |
| complexity | 简单、中等、复杂 |

### 2.2 `Model3D` 字段变更

| 字段 | 处理 | 说明 |
|------|------|------|
| `price_matrix`（新增 JSONB） | 权威价格数据 | 该模型启用的选项 + 全组合价格，键用选项 `id` 拼接 |
| `min_price`（新增 Float + 索引） | 权威最低价 | 为将来价格排序/筛选预留；写入时 = `prices` 最小值 |
| `price`（保留列） | 兼容同步 | 写入时同步为 `min_price`；**列表响应仍用 `price` 字段名**，前端零改动 |
| `material`（保留列） | 兼容同步 | 从矩阵第一个材料 label 冗余填充 |
| `dimensions`（保留列） | 兼容同步 | 从矩阵尺寸 label 列表用 `/` 拼接（如 "S/M/L"） |

**`price_matrix` JSON 结构：**

```json
{
  "materials":    [{ "id": "opt_pla", "label": "PLA" }],
  "sizes":        [{ "id": "opt_s", "label": "S" }, { "id": "opt_custom_1", "label": "25cm" }],
  "complexities": [{ "id": "opt_easy", "label": "简单" }],
  "prices": {
    "opt_pla:opt_s:opt_easy": 99.0,
    "opt_pla:opt_custom_1:opt_easy": 159.0
  }
}
```

- 组合键格式：`材料id:尺寸id:复杂度id`
- `prices` 允许缺省组合（商家可不卖某些组合）
- 矩阵为空（`null`）= 单一定价模式，走旧字段展示

---

## 三、API 设计

### 3.1 选项字典接口（新）

| 接口 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `GET /api/v1/price-options?dimension=material` | GET | 商家登录 | 拉取某维度可用选项（预置 + 当前商家自定义），供录入表单渲染 |
| `POST /api/v1/price-options` | POST | 商家登录 | 新增自定义选项 `{dimension, label, description?}`；同维度同商家重名 → 409 |
| `GET /api/v1/models/{id}/price-options` | GET | 公开 | 返回该模型启用的选项全集（含 label/description），供详情页渲染组合选择器 |

### 3.2 模型创建/更新（扩展 `POST /models`、`PUT /models/{id}`）

请求体新增字段（均可选；都不传 = 单一定价，兼容旧行为）：

```json
{
  "...现有字段": null,
  "base_price": 99.0,
  "factors": {
    "materials":    { "opt_pla": 1.0, "opt_resin": 1.6 },
    "sizes":        { "opt_s": 1.0, "opt_m": 1.3, "opt_custom_1": 2.2 },
    "complexities": { "opt_easy": 1.0, "opt_med": 1.4 }
  },
  "price_matrix": { }
}
```

**两种录入方式（互斥）：**

1. **一键生成**：提交 `base_price` + `factors`，选项 id 列表通过 `price_matrix` 的 `materials/sizes/complexities` 数组携带（**不带 `prices`**）→ 后端按算法生成完整矩阵，**返回给商家预览，不落库**；商家微调后按方式二提交。
2. **直接提交**：提交完整 `price_matrix`（含 `prices`）→ 后端校验后入库，同步冗余字段。

### 3.3 校验规则（后端强制）

| 规则 | 说明 |
|------|------|
| 选项存在性 | 矩阵引用的选项 id 必须存在于 `PriceOption` 表 |
| 组合键格式 | 必须形如 `材料id:尺寸id:复杂度id`，不允许非法键 |
| 组合键范围 | 键集合 ⊆ 三选项列表的笛卡尔积；**允许缺省**（不卖的组合作废） |
| 价格合法 | 所有价格 > 0，最多 2 位小数 |
| 冗余同步 | 入库后 `min_price = min(prices.values())`，并同步 `price` / `material` / `dimensions` |

### 3.4 响应变更（前端影响面）

| 接口 | 变更 |
|------|------|
| `GET /models` 列表项 | 无变化（`price` 起售价、`material` 主材料照旧） |
| `GET /models/{id}` 详情 | 新增 `price_matrix` 字段；无矩阵的旧模型返回 `null` |
| 新端点 `GET /models/{id}/price-options` | 渲染组合选择器用 |

---

## 四、一键生成算法

```
价格 = round(base_price × 材料系数 × 尺寸系数 × 复杂度系数, 2)
```

- `factors` 缺省某选项时系数取 `1.0`；不传 `factors` = 全部组合同价为 `base_price`
- 生成结果先响应预览（不落库），微调后走 `price_matrix` 提交
- 生成逻辑独立为 service 函数 `build_price_matrix(base_price, materials, sizes, complexities, factors)`，可单测

---

## 五、旧数据迁移（幂等脚本 `python -m app.migrate_price_matrix`）

1. 预置 `PriceOption` 选项（重复执行不重建，按 `dimension + label` 查重）
2. 遍历无 `price_matrix` 的模型：`min_price = price`（旧单一定价直接作为起售价），`price_matrix` 置 `null`
3. 幂等：已有矩阵的模型跳过；脚本可重复执行

---

## 六、测试要点

| 类别 | 用例 |
|------|------|
| 生成 | 缺省系数 = 1.0；四舍五入保留 2 位；空选项列表报错 |
| 校验 | 引用不存在选项 → 422；键格式错误 → 422；价格 ≤ 0 → 422；组合允许缺省 |
| 同步 | 写矩阵后 `min_price` / `price` / `material` / `dimensions` 四字段一致 |
| 兼容 | 旧模型无矩阵时，列表/详情行为与改造前完全一致 |
| 权限 | 自定义选项仅本人可见；商家不能修改他人模型 |

---

## 七、明确不做（YAGNI）

- ❌ 订单/购物车/支付：项目明确无交易行为
- ❌ 按价格排序/筛选：`min_price` 已预留，暂不开放查询参数
- ❌ 矩阵缺省组合的"原因"说明（如"该材料不提供"）：前端直接不渲染该组合即可
