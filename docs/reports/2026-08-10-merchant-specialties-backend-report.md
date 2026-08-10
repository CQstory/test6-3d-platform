# 商家擅长领域（specialties）与店铺列表 API 需求报告

- 日期：2026-08-10
- 受众：后端
- 类型：backend-report（前后端对接契约）
- 关联设计：`docs/specs/2026-08-10-search-page-merchant-list-design.md`
- 关联计划：`docs/plans/2026-08-10-search-page-merchant-list-plan.md`

## 1. 背景

前端第二个 Tab「模型库」改版为统一「搜索」页，新增「搜索商家」子页面：用户可通过商家名称、简介、**擅长领域**（如摄影道具、手办、沙盘）快速锁定业务匹配的商家。领域标签为结构化字段，不能依赖简介关键词提取，需后端提供数据支撑。

## 2. 需求清单总览

| # | 需求 | 优先级 | 说明 |
|---|---|---|---|
| 1 | 店铺响应体新增 `specialties` 字段 | P0 | 所有返回店铺对象的接口 |
| 2 | 新增店铺列表 API `GET /shops` | P0 | 前端当前用静态 mock 顶替（`getAllMerchants` 注释「后端无全量列表」），搜索商家页必须走真实列表 |
| 3 | 店铺创建/编辑支持 specialties 录入 | P1 | 商家入驻与店铺设置可维护领域标签 |

## 3. 字段契约

### 3.1 新增字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `specialties` | `string[]` | 否（缺省视为 `[]`） | 商家擅长领域标签，建议 1~5 个，如 `["科幻军事", "摄影道具"]`；前端用于卡片展示与领域筛选 chips 去重生成 |

### 3.2 受影响的现有接口

以下接口的响应体（ShopOut / ShopMineOut）均需补充 `specialties`：

| API 路径 | 方法 | 变更 |
|---|---|---|
| `/api/v1/shops/{id}` | GET | 响应新增 `specialties` |
| `/api/v1/shops/mine` | GET | 响应新增 `specialties` |
| `/api/v1/shops` | POST | 请求体可选入参 `specialties`（P1） |
| `/api/v1/shops/mine` | PUT | 请求体可选入参 `specialties`（P1） |

### 3.3 期望响应示例

```json
{
  "id": "merchant-1",
  "name": "星河模型工坊",
  "avatar": "https://...",
  "cover": "https://...",
  "description": "专注科幻与军事题材3D建模…",
  "specialties": ["科幻军事", "摄影道具"],
  "model_count": 12,
  "total_views": 3680,
  "contact": { "wechat": "galaxy_model", "phone": "138-0000-1001", "email": "galaxy@model.com" }
}
```

## 4. 新增店铺列表 API

### 4.1 接口定义

```
GET /api/v1/shops
```

### 4.2 Query 参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `keyword` | string | 否 | 匹配店铺名称与简介（后端模糊匹配） |
| `specialty` | string | 否 | 精确匹配单个擅长领域标签 |
| `page` | int | 否 | 页码，默认 1 |
| `size` | int | 否 | 每页数量，默认 20，最大 50 |

说明：当前前端商家量为个位数，`keyword`/`specialty` 筛选前端会做本地兜底，但分页与权威数据必须由后端提供；筛选参数可分二期交付。

### 4.3 Response

沿用项目列表包裹格式（与 `/models` 一致，`items` + 总数）：

```json
{
  "items": [
    {
      "id": "merchant-1",
      "name": "星河模型工坊",
      "avatar": "https://...",
      "cover": "https://...",
      "description": "专注科幻与军事题材3D建模…",
      "specialties": ["科幻军事", "摄影道具"],
      "model_count": 12,
      "total_views": 3680
    }
  ],
  "total": 1
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `items[].model_count` | int | 该商家已发布模型数（映射前端 `stats.models`） |
| `items[].total_views` | int | 该商家模型累计浏览量（映射前端 `stats.views`） |
| `items[].specialties` | string[] | 擅长领域，缺省 `[]` |
| `total` | int | 满足条件的店铺总数 |

注意：评分 `stats.rating` 目前仅 mock 提供，后端暂无评分体系，列表接口可不返回（前端缺省显示 0），后续评分体系上线后再补充。

## 5. 测试要点

| # | 用例 | 预期 |
|---|---|---|
| 1 | `GET /shops` 无参 | 返回全部店铺，含 `specialties`、`model_count`、`total_views` |
| 2 | `GET /shops?specialty=摄影道具` | 仅返回领域命中的店铺 |
| 3 | `GET /shops?keyword=手办` | 名称或简介命中「手办」的店铺 |
| 4 | `GET /shops/{id}` | 详情含 `specialties` |
| 5 | 店铺无 specialties 数据 | 返回 `[]` 或省略字段（前端按 `[]` 兜底） |
| 6 | `size=50` 上限 | 超出截断为 50，不报错 |

## 6. 前端适配状态与联调开关

- 前端 `Merchant` 类型已新增 `specialties: string[]`；`merchant-service.mapShop` 对缺省字段按 `[]` 兜底，**后端未交付时前端不会崩溃**
- `services/config.ts` 的 `USE_MOCK = true`：走静态 mock（含 specialties 示例值），可先行验证 UI
- `USE_MOCK = false`：`getAllMerchants()` 目前仍返回静态 mock（注释「后端无全量列表」），`GET /shops` 交付后前端将切换为真实请求，届时另出前端变更说明
- 交付后请在本报告基础上回执（新建报告，不修改本文件）
