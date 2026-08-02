# G1 价格矩阵预览端点 — 占位实现反馈报告

> 对应缺口：`2026-08-01-price-matrix-frontend-plan.md` 二、G1
> 实现日期：2026-08-01
> 状态：**占位实现，待数据确定后完善**

---

## 一、实现摘要

### 1.1 端点定义

| 属性 | 值 |
|------|-----|
| 路径 | `POST /api/v1/models/price-matrix/preview` |
| 鉴权 | `get_merchant_user`（需商家登录） |
| 落库 | **否**（纯计算，无数据库写入） |
| 文件 | `app/api/v1/models.py:138-159` |

### 1.2 请求/响应结构

**请求体 `PriceMatrixPreviewRequest`：**

```json
{
  "base_price": 99.0,
  "factors": {
    "materials": { "opt_pla": 1.0, "opt_resin": 1.6 },
    "sizes": { "opt_s": 1.0, "opt_m": 1.3 },
    "complexities": { "opt_easy": 1.0, "opt_med": 1.4 }
  },
  "materials": [
    { "id": "opt_pla", "label": "PLA" },
    { "id": "opt_resin", "label": "树脂" }
  ],
  "sizes": [
    { "id": "opt_s", "label": "S" },
    { "id": "opt_m", "label": "M" }
  ],
  "complexities": [
    { "id": "opt_easy", "label": "简单" },
    { "id": "opt_med", "label": "中等" }
  ]
}
```

**响应体 `PriceMatrix`：**

```json
{
  "materials": [ { "id": "opt_pla", "label": "PLA" }, ... ],
  "sizes": [ { "id": "opt_s", "label": "S" }, ... ],
  "complexities": [ { "id": "opt_easy", "label": "简单" }, ... ],
  "prices": {
    "opt_pla:opt_s:opt_easy": 99.0,
    "opt_pla:opt_s:opt_med": 138.6,
    "opt_pla:opt_m:opt_easy": 128.7,
    ...
  }
}
```

### 1.3 核心算法

```
价格 = round(base_price × 材料系数 × 尺寸系数 × 复杂度系数, 2)
```

- 系数缺省值：`1.0`（未传 factors 中的某选项时）
- 四舍五入：保留 2 位小数
- 实现位置：`app/services/price_matrix_service.py:build_price_matrix()`

---

## 二、待确定事项（阻塞完整实现的决策点）

### 2.1 选项 ID 来源与校验

**现状**：占位实现直接信任前端传入的 `materials/sizes/complexities`，不做 ID 校验。

**待确定**：
- [ ] 选项 ID 是否必须来自 `PriceOption` 表？（设计文档要求：是）
- [ ] 是否需要校验 ID 存在性？（推荐：是，避免无效数据）
- [ ] 校验失败时返回 400 还是 422？（推荐：422，与其他校验一致）

**影响**：当前占位版本可接受任意 ID，正式版本需加 `PriceOption` 表查询校验。

### 2.2 系数的合理范围

**现状**：未对 `factors` 中的系数做范围校验。

**待确定**：
- [ ] 系数是否应限制范围？（如 `0.5 ~ 10.0`）
- [ ] 是否允许系数为 `0`？（生成价格为 0 是否合法？）
- [ ] 是否允许负系数？（推荐：否，价格不能为负）

**影响**：正式版本需加系数校验，避免异常数据。

### 2.3 `base_price` 的校验

**现状**：未校验 `base_price` 的合法范围。

**待确定**：
- [ ] `base_price` 是否必须 > 0？（推荐：是）
- [ ] 是否需要上限？（如 `base_price <= 1000000`）
- [ ] 小数位数是否限制？（推荐：最多 2 位）

**影响**：正式版本需加数值校验。

### 2.4 组合键格式校验

**现状**：未校验 `prices` 字典的键是否符合 `material_id:size_id:complexity_id` 格式。

**待确定**：
- [ ] 是否需要严格校验键格式？（推荐：是）
- [ ] 键顺序是否固定？（如必须 `材料:尺寸:复杂度`，不可调换）
- [ ] 键中 ID 是否必须存在于请求的 `materials/sizes/complexities` 中？（推荐：是）

**影响**：正式版本需加键格式校验，确保数据一致性。

### 2.5 预览与提交的边界

**现状**：占位实现仅生成矩阵，不涉及提交逻辑。

**待确定**：
- [ ] 前端是否会在预览后修改 `prices`？（设计文档：是，商家可微调）
- [ ] 提交时是否使用同一个端点？（设计文档：否，提交走 `POST/PUT /models`）
- [ ] 预览结果是否需要缓存或记录？（推荐：否，纯瞬态）

**影响**：当前占位实现符合设计，无需调整。

---

## 三、已实现文件清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `app/schemas/model.py` | 新增 | `PriceMatrixOption`, `PriceMatrix`, `PriceFactors`, `PriceMatrixPreviewRequest` |
| `app/services/price_matrix_service.py` | 新增 | `build_price_matrix()` 函数 |
| `app/api/v1/models.py` | 新增 | `POST /price-matrix/preview` 端点 |

---

## 四、测试验证（占位版）

### 4.1 启动服务

```bash
cd d:\Code\benchuang\bakend
.\venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 4.2 测试请求

```bash
curl.exe -X POST "http://127.0.0.1:8000/api/v1/models/price-matrix/preview" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <merchant_token>" \
  -d '{
    "base_price": 100.0,
    "factors": {
      "materials": { "mat1": 1.0, "mat2": 1.5 },
      "sizes": { "s1": 1.0, "s2": 1.2 },
      "complexities": { "c1": 1.0, "c2": 1.4 }
    },
    "materials": [
      { "id": "mat1", "label": "PLA" },
      { "id": "mat2", "label": "树脂" }
    ],
    "sizes": [
      { "id": "s1", "label": "S" },
      { "id": "s2", "label": "M" }
    ],
    "complexities": [
      { "id": "c1", "label": "简单" },
      { "id": "c2", "label": "中等" }
    ]
  }'
```

### 4.3 预期响应

```json
{
  "materials": [
    { "id": "mat1", "label": "PLA" },
    { "id": "mat2", "label": "树脂" }
  ],
  "sizes": [
    { "id": "s1", "label": "S" },
    { "id": "s2", "label": "M" }
  ],
  "complexities": [
    { "id": "c1", "label": "简单" },
    { "id": "c2", "label": "中等" }
  ],
  "prices": {
    "mat1:s1:c1": 100.0,
    "mat1:s1:c2": 140.0,
    "mat1:s2:c1": 120.0,
    "mat1:s2:c2": 168.0,
    "mat2:s1:c1": 150.0,
    "mat2:s1:c2": 210.0,
    "mat2:s2:c1": 180.0,
    "mat2:s2:c2": 252.0
  }
}
```

**验证点**：
- ✅ 返回完整 `price_matrix` 结构
- ✅ `prices` 键格式正确（`材料:尺寸:复杂度`）
- ✅ 价格计算正确（如 `mat2:s2:c2 = 100 × 1.5 × 1.2 × 1.4 = 252.0`）
- ✅ 不落库（纯计算）

---

## 五、后续行动

### 5.1 正式版本前置任务

1. **实现 `PriceOption` 表**（设计文档 2.1）
   - 创建模型 `app/models/price_option.py`
   - 迁移脚本预置选项（PLA/树脂/尼龙、S/M/L/XL、简单/中等/复杂）

2. **完善 `Model3D` 字段**（设计文档 2.2）
   - 新增 `price_matrix` JSONB 列
   - 新增 `min_price` Float 列 + 索引
   - 保留 `price`/`material`/`dimensions` 做兼容同步

3. **加校验逻辑**（本报告 二）
   - ID 存在性校验（查 `PriceOption` 表）
   - 系数范围校验（如 `0.5 ~ 10.0`）
   - `base_price` 合法性校验（> 0，最多 2 位小数）
   - 组合键格式校验

4. **扩展创建/更新端点**（设计文档 3.2）
   - `POST /models` 支持 `price_matrix` 提交
   - `PUT /models/{id}` 支持 `price_matrix` 更新
   - 写入时同步 `min_price`/`price`/`material`/`dimensions`

### 5.2 测试覆盖

- [ ] 单元测试：`build_price_matrix()` 算法（含缺省系数、四舍五入）
- [ ] 集成测试：预览端点（含非法数据、边界值）
- [ ] 端到端测试：预览 → 提交 → 详情返回一致

---

## 六、结论

**G1 占位实现已完成**，核心算法可用，前端可基于此端点开发"一键生成"交互。

**待数据确定后**，需按本报告 五、完成正式版本（校验 + 持久化 + 兼容同步）。

**当前状态**：可联调，不可上线。
