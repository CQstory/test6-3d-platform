# 模型价格矩阵持久化 — 后端交付回执

> 日期：2026-08-11
> 状态：✅ 已交付并验证通过
> 关联需求：`docs/2026-08-11-price-matrix-persistence-backend-report.md`
> 关联设计：`docs/2026-08-01-price-matrix-design.md`（字段契约与同步规则）
> 环境：本地开发后端 `http://localhost:8000`（实测复现与验证同环境）

---

## 一、交付内容

| 需求 | 状态 | 说明 |
|------|------|------|
| `POST /models` 支持矩阵三字段 | ✅ | `ModelCreate` 新增 `base_price`/`factors`/`price_matrix`（均可选） |
| `PUT /models/{id}` 支持矩阵三字段 | ✅ | `ModelUpdate` 同上；显式 `price_matrix=null` 清除矩阵 |
| `GET /models/{id}` 返回矩阵 | ✅ | `ModelDetail` 新增 `price_matrix`/`base_price`/`factors`（**注：需求文档称"已含"，实际后端缺失，本次补齐**） |
| `GET /models` 列表 | ✅ | 按设计契约**无变化**（`price` 起售价照旧，矩阵写入时同步） |

## 二、实现要点

### 2.1 数据模型（models 表新增 4 列）

| 列 | 类型 | 说明 |
|----|------|------|
| `price_matrix` | JSONB | 权威矩阵（materials/sizes/complexities/prices） |
| `min_price` | FLOAT | 派生最低价（`min(prices.values())`） |
| `base_price` | FLOAT | 生成基准价（编辑回填） |
| `factors` | JSONB | 维度系数（编辑回填） |

### 2.2 冗余同步规则（矩阵为权威）

写入矩阵时同步：`min_price = min(prices)`、`price = min_price`、`material` = 材料 label `/` 拼接、`dimensions` = 尺寸 label `/` 拼接。

### 2.3 PUT 部分更新语义（测试要点 2 的明确约定）

| 请求情况 | 行为 |
|----------|------|
| 传完整 `price_matrix` | 覆盖矩阵 + 同步派生字段（同时传的 price/material/dimensions 被矩阵值覆盖） |
| 传 `price_matrix=null` | **清除矩阵回单一价**；price 取请求值（有）或保留原值（无） |
| 不传矩阵三字段 | 矩阵不动，其他字段正常部分更新 |
| 只传 `base_price`/`factors` | 仅更新配置字段（矩阵保留，供编辑页回填） |
| **只传 `price`（矩阵存在时）** | **矩阵保留，price 强制回 min_price**（矩阵权威，避免不一致） |

### 2.4 校验规则（422）

- `price_matrix` 不能为空对象；三选项列表与 `prices` 非空
- 组合键须为 `材料id:尺寸id:复杂度id` 且 ∈ 三选项笛卡尔积（**允许缺省组合**，缺键即不售）
- 价格必须 > 0、最多 2 位小数
- `base_price` > 0；factors 系数 > 0（维度限 material/size/complexity）
- 注：选项存在性校验依赖 G3 `PriceOption` 表（本期未建），暂跳过，后续 G3 落地后补充

## 三、代码变更清单

| 文件 | 变更 |
|------|------|
| `app/models/model_3d.py` | 新增 `price_matrix`/`min_price`/`base_price`/`factors` 4 列 |
| `app/schemas/model.py` | ModelCreate/ModelUpdate 加三字段；ModelDetail 加 `price_matrix`/`base_price`/`factors` |
| `app/services/model_service.py` | 新增 `apply_model_price_matrix`（校验+同步）、`clear_model_price_matrix`、`refresh_model_price_derived` |
| `app/api/v1/models.py` | create/update 接入矩阵处理（含部分更新语义与派生一致性） |
| `docs/2026-08-11-price-matrix-persistence-migration.sql` | 迁移脚本（4 列 + 旧数据 `min_price=price` 回填） |

## 四、验证结果（本地实测，覆盖需求测试要点 1~3）

| # | 用例 | 结果 |
|---|------|------|
| 1 | PUT 完整三字段 → GET 详情 | ✅ `price_matrix` 与请求完全一致；`price`=min_price=99.0；`material`="PLA/树脂"；`dimensions`="S/M" |
| 2 | PUT 仅传 `price` | ✅ 矩阵保留，price 恒等于 min_price（矩阵权威语义，见 2.3） |
| 3 | PUT `price_matrix=null` | ✅ 矩阵及配置字段清除，`price` 取请求值回单一价 |
| 4 | 编辑回填 | ✅ GET 详情返回 `base_price`/`factors`，编辑页可完整回填（端到端依赖） |
| 5 | 非法组合键 / 价格≤0 / 系数≤0 | ✅ 均 422 |
| 6 | 缺省组合 | ✅ 合法（删组合键后 `prices` 7 项正常入库） |

测试数据已还原（模型原单一价 259.0 恢复）。

## 五、前端联调说明

1. **编辑回填**：`GET /models/{id}` 现返回 `price_matrix` + `base_price` + `factors` 三字段，`mapModel` 可完整还原编辑页矩阵模式
2. **买家侧展示**：列表 `price` 已同步为矩阵最低价，`formatPriceText` 的「¥x 起」逻辑无需改动；矩阵模式详情页如需组合选择器属 G2（暂缓），本期未实现 `GET /models/{id}/price-options`
3. **兼容性**：不传矩阵字段的旧请求行为与改造前完全一致；无矩阵旧模型 `price_matrix` 返回 `null`
4. **生产部署提醒**：上线前需在生产库执行 `docs/2026-08-11-price-matrix-persistence-migration.sql`
5. **遗留（G3）**：`PriceOption` 选项字典表与 `GET/POST /price-options` 接口未在本期实现（前端已有预置回退），选项存在性校验待 G3 落地后补充
