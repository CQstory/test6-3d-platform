# 模型价格矩阵持久化接口缺口报告

- 日期：2026-08-11
- 受众：后端
- 类型：backend-report（前后端对接契约）
- 环境：本地开发后端 `http://localhost:8000`

## 1. 问题描述

前端 model-edit 页「多维定价」模式提交 `PUT /models/{id}` 时携带 `base_price` + `factors` + `price_matrix` 三字段（见 `miniprogram/pages/model-edit/model-edit.ts` onSave），但本地后端 openapi 中 `ModelCreate` / `ModelUpdate` schema 均**不包含**这三个字段，导致：

1. 请求返回 200 且 `status=approved`，但 `price_matrix` 被静默丢弃，`GET /models/{id}` 返回 `price_matrix=null`
2. 商家在编辑页配置的多维定价无法持久化，重新进入编辑页矩阵丢失
3. 买家侧（model-card / model-detail）永远看不到「¥x 起」的矩阵价展示

实测复现（本地库）：对 Flight Helmet（`abd50240-0969-47a7-84a3-7e935e35f497`）PUT 完整矩阵载荷，响应 200，随后 GET 详情 `price_matrix` 为空。

## 2. 期望变更

| 接口 | 变更 |
|---|---|
| `POST /models` | `ModelCreate` 新增可选字段：`base_price: number`、`factors: PriceFactors`、`price_matrix: PriceMatrixOut` |
| `PUT /models/{id}` | `ModelUpdate` 同上（部分更新：三者都不传时保留原值；传 `price_matrix=null` 视为清除矩阵回单一价） |
| `GET /models`、`GET /models/{id}` | 响应已含 `price_matrix`（现状正确，无需改动） |

说明：`PriceFactors`、`PriceMatrixOption`、`PriceMatrixOut` schema 后端已定义（当前仅 `POST /price-matrix/preview` 使用），复用即可。

## 3. 测试要点

| # | 用例 | 预期 |
|---|---|---|
| 1 | PUT 携带完整三字段 | `GET /models/{id}` 返回的 `price_matrix` 与请求一致 |
| 2 | PUT 仅传 `price`（不含矩阵字段） | 原矩阵保留或按业务约定清除，需在回执中明确语义 |
| 3 | PUT `price_matrix=null` | 矩阵清除，回单一价 |
| 4 | model-edit 矩阵模式端到端 | 保存 → 重进编辑页矩阵回填 → 买家侧显示「¥x 起」 |

## 4. 前端现状说明

- 单一价展示链路已就绪并验证：14 个模型中 13 个已灌入单价（本次通过 API 以商家身份 PUT 写入），model-card / model-detail 正常展示 `¥x`
- `formatPriceText`（`miniprogram/utils/util.ts`）：单价优先，无单价时取矩阵最低价展示「¥x 起」，后端矩阵持久化交付后无需前端改动
- 商家擅长领域（specialties）数据已通过 `PUT /shops/mine` 灌入 4 家店铺，筛选 chips 已可用
