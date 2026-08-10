# 商家擅长领域（specialties）与店铺列表 API — 后端交付回执

> 日期：2026-08-11
> 状态：✅ 已交付并验证通过（P0 全部 + P1 录入）
> 关联需求：`docs/2026-08-10-merchant-specialties-backend-report.md`（原报告未修改，本文件为交付回执）

---

## 一、交付清单

| 需求 | 状态 | 说明 |
|------|------|------|
| 1. 店铺响应体新增 `specialties` | ✅ P0 完成 | 所有返回店铺对象的接口均含 `specialties`（缺省 `[]`） |
| 2. 新增 `GET /shops` 列表 API | ✅ P0 完成 | keyword/specialty 筛选 + 分页 + model_count/total_views |
| 3. 店铺创建/编辑支持 specialties | ✅ P1 完成 | `POST /shops`、`PUT /shops/mine` 均支持 |

## 二、接口与字段变更

### 2.1 新增接口：`GET /api/v1/shops`

| 参数 | 类型 | 说明 |
|------|------|------|
| `keyword` | string | 店铺名称/简介模糊匹配 |
| `specialty` | string | 擅长领域标签精确匹配（数组包含） |
| `page` | int | 默认 1 |
| `size` | int | 默认 20，**上限 50，超出截断不报错**（按需求测试要点 6） |

响应：`{total, items, page, size}`，`items[].{id, name, avatar, cover, description, specialties, model_count, total_views}`

**实现说明**：
- 仅返回 `status=active`（审核通过）的店铺——搜索页面向公开用户，不暴露待审/驳回店铺
- `model_count`/`total_views` 为批量聚合（仅统计 approved 模型），无 N+1
- `rating` 按需求不返回（后端暂无评分体系，前端缺省显示 0）

### 2.2 现有接口补充 `specialties`

| 接口 | 变更 |
|------|------|
| `GET /shops/{id}` | 响应新增 `specialties` |
| `GET /shops/mine` | 响应新增 `specialties` |
| `POST /shops` | 请求体可选入参 `specialties` |
| `PUT /shops/mine` | 请求体可选入参 `specialties`（部分更新） |
| `GET /api/admin/v1/shops`（管理端） | 同步新增 `specialties`（一致性） |

## 三、数据模型变更

```sql
ALTER TABLE shops ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT '{}';
```

- 迁移脚本：`docs/2026-08-10-merchant-specialties-migration.sql`（本地库已执行）
- **生产库需手动执行**（项目无 alembic）

## 四、代码变更清单

| 文件 | 变更 |
|------|------|
| `app/models/shop.py` | 新增 `specialties`（ARRAY(Text)，默认 `[]`） |
| `app/schemas/shop.py` | ShopCreate/ShopUpdate 入参、ShopOut/ShopMineOut/ShopPublicOut 响应、新增 `ShopListOut` |
| `app/crud/shop_crud.py` | 新增 `list_shops`（active 过滤 + keyword/specialty 筛选 + 分页） |
| `app/crud/model_crud.py` | 新增 `get_shops_model_stats`（批量统计，公共域复用） |
| `app/crud/admin_crud.py` | 移除 `get_shop_model_stats`（迁移至 model_crud） |
| `app/api/v1/shops.py` | 新增 `GET /shops`；POST 传参、mine/详情响应加字段 |
| `app/schemas/admin.py`、`app/api/admin/v1/shops.py` | 管理端列表同步 `specialties` |

## 五、验证结果（本地实测，覆盖需求测试要点 1~6）

| # | 用例 | 结果 |
|---|------|------|
| 1 | `GET /shops` 无参 | ✅ total=5（全部 active），items 含 `specialties`/`model_count`/`total_views` |
| 2 | `GET /shops?specialty=摄影道具` | ✅ 精确命中「星河模型工坊」（标签为数组包含匹配） |
| 3 | `GET /shops?keyword=星河` | ✅ 名称模糊命中 |
| 4 | `GET /shops/{id}`、`GET /shops/mine` | ✅ 均含 `specialties` |
| 5 | 无 specialties 数据 | ✅ 返回 `[]`（缺省兜底） |
| 6 | `size=51` | ✅ 返回 200 且 `size=50`（截断不报错） |
| + | `PUT /shops/mine` 设置/清空 | ✅ 写入与部分更新正常 |
| + | 管理端列表 | ✅ 含 `specialties` |

## 六、前端联调说明

1. **筛选语义**：`specialty` 为**精确匹配**（数组元素包含即命中），非模糊；`keyword` 为名称/简介模糊匹配
2. **分页响应**：返回 `{total, items, page, size}`（`page`/`size` 为额外字段，前端按 `items`/`total` 消费即可）
3. **列表范围**：仅返回审核通过（active）店铺，与前端「搜索商家」页语义一致
4. 前端 `USE_MOCK=false` 时，`getAllMerchants()` 可切换为 `GET /shops` 真实请求
5. **生产部署提醒**：上线前需在生产库执行 `docs/2026-08-10-merchant-specialties-migration.sql`
