# 商户数据看板 — 后端完成报告

> 日期：2026-08-02
> 状态：后端已实现，待前端联调
> 关联需求：[2026-08-02-merchant-dashboard-backend-report.md](./2026-08-02-merchant-dashboard-backend-report.md)

---

## 一、实现总览

| 需求项 | 状态 | 说明 |
|--------|------|------|
| `model_clicks` 新表 | ✅ 已实现 | 每次点击一条，无去重约束 |
| `model_favorites_log` 新表 | ✅ 已实现 | 每次收藏/取消一条，`action='add'`/`'remove'` |
| `models` 表新增 `click_count`、`favorite_added` | ✅ 已实现 | 原子递增回写，与 `view_count` 同机制 |
| `POST /models/{id}/click` | ✅ 已实现 | 返回 `{click_count}` |
| `POST /models/{id}/favorite/toggle` 改造 | ✅ 已实现 | 返回 `{favorited, favorite_count, favorite_added}` |
| `GET /merchant/models` 新字段 | ✅ 已实现 | 每个 item 自动携带 `click_count`、`favorite_added` |
| `GET /models?hot=true` 热度公式 | ✅ 已实现 | `view + 5×favorite_added + 3×click_count` |
| `GET /merchant/stats` | ✅ 已实现 | 返回完整看板汇总 |
| `GET /merchant/stats/trend?days=N` | ✅ 已实现 | 三序列日期对齐，空天补 0 |
| 数据库迁移脚本 | ✅ 已提供 | `docs/2026-08-02-merchant-dashboard-migration.sql` |

---

## 二、API 契约确认

### 2.1 `POST /api/v1/models/{model_id}/click`（新增）

记录一次点击，不去重，每次 +1。

**鉴权**：登录用户

**Request**（body 可选）：
```json
{
  "link_url": "https://taobao.com/xxx",
  "platform": "淘宝"
}
```

**Response**：
```json
{ "click_count": 42 }
```

### 2.2 `POST /api/v1/models/{model_id}/favorite/toggle`（改造）

收藏/取消收藏，同时写入 `model_favorites_log`。

**Response**（新增 `favorite_added`）：
```json
{
  "favorited": true,
  "favorite_count": 15,
  "favorite_added": 23
}
```

> `favorite_added - favorite_count` = 曾收藏又取消的人次（前端"深度意向"指标）。

### 2.3 `GET /api/v1/merchant/models`（改造）

每个 item 通过 `ModelDetail` schema 自动携带新字段：

```json
{
  "id": "uuid",
  "name": "...",
  "view_count": 100,
  "favorite_count": 10,
  "click_count": 30,
  "favorite_added": 15,
  "...": "其余字段不变"
}
```

### 2.4 `GET /api/v1/models`（改造）

列表每个 item 新增 `click_count`、`favorite_added`。

热门排序公式已更新为：
```
score = view_count + 5 × favorite_added + 3 × click_count
```

### 2.5 `GET /api/v1/merchant/stats`（新增）

商家看板汇总统计。

**鉴权**：商家/管理员

**Response**：
```json
{
  "model_count": 8,
  "total_views": 1200,
  "total_clicks": 350,
  "total_favorites": 80,
  "total_favorite_added": 95
}
```

> 前端"深度意向"= `total_favorite_added - total_favorites`。

### 2.6 `GET /api/v1/merchant/stats/trend?days=7`（新增）

近 N 天每日浏览/点击/收藏趋势（`days` 范围 1-90，默认 7）。

**Response**：
```json
{
  "dates": ["2026-07-27", "2026-07-28", "2026-07-29", "..."],
  "views":     [12, 8, 15, 0, 20, 18, 22],
  "clicks":    [3,  2,  5, 0,  8,  6,  7],
  "favorites": [2,  1,  3, 0,  4,  2,  5]
}
```

- 三个序列日期完全对齐，共 `days` 个元素
- 某天无数据补 0

---

## 三、数据表变更

### 新增表

| 表名 | 用途 | 约束 |
|------|------|------|
| `model_clicks` | 点击明细 | 无唯一约束（每次 +1 不去重） |
| `model_favorites_log` | 收藏/取消明细 | 无唯一约束，`action` 取值 `add`/`remove` |

### 修改表

| 表名 | 新增列 | 类型 | 说明 |
|------|--------|------|------|
| `models` | `click_count` | INTEGER DEFAULT 0 | 累计点击数缓存 |
| `models` | `favorite_added` | INTEGER DEFAULT 0 | 累计收藏次数（含已取消） |

---

## 四、文件变更清单

### 新增文件

| 文件 | 层级 | 说明 |
|------|------|------|
| `app/models/model_click.py` | Model | `ModelClick` — `model_clicks` 表 |
| `app/models/favorite_log.py` | Model | `FavoriteLog` — `model_favorites_log` 表 |
| `app/crud/click_crud.py` | CRUD | 点击记录插入、原子递增、趋势查询 |
| `app/crud/favorite_log_crud.py` | CRUD | 收藏日志写入、`favorite_added` 递增、趋势查询 |
| `app/services/click_service.py` | Service | `record_click` 业务编排 |
| `app/schemas/click.py` | Schema | `ClickCreate` / `ClickResponse` |
| `docs/2026-08-02-merchant-dashboard-migration.sql` | Migration | 已有数据库手动迁移 SQL |

### 修改文件

| 文件 | 变更摘要 |
|------|---------|
| `app/models/model_3d.py` | +`click_count`、`favorite_added` 列及关系 |
| `app/models/user.py` | +`model_clicks`、`favorite_logs` 关系 |
| `app/models/__init__.py` | 注册 `ModelClick`、`FavoriteLog` |
| `app/crud/model_crud.py` | 热度公式更新；`get_shop_stats` 返回 dict |
| `app/crud/view_crud.py` | +`get_view_trend_by_shop` |
| `app/services/favorite_service.py` | 写入日志 + 返回三元组 |
| `app/schemas/model.py` | `ModelListItem`/`ModelDetail` 加字段；+`TrendResponse` |
| `app/schemas/favorite.py` | `FavoriteItemOut` 加字段 |
| `app/api/v1/models.py` | +click 端点；改造 toggle；列表返回新字段 |
| `app/api/v1/shops.py` | 适配 stats dict；店铺模型列表加字段 |
| `app/api/v1/__init__.py` | +stats 和 stats/trend 端点 |

---

## 五、指标口径对齐确认

| 指标 | 前端字段 | 后端实现 | 是否对齐 |
|------|---------|---------|---------|
| 浏览量 | `views` | `model_views` 按天去重（原有逻辑不变） | ✅ |
| 累计收藏 | `favoriteAdded` | `models.favorite_added`，每次收藏 +1（取消不减） | ✅ |
| 当前收藏 | `favorites` | `models.favorite_count`，存量去重（原有逻辑不变） | ✅ |
| 点击量 | `clicks` | `models.click_count`，每次 +1 不去重 | ✅ |
| 深度意向 | `favoriteAdded - favorites` | 前端计算，后端提供两个原始值 | ✅ |

---

## 六、数据库迁移

**新数据库**：启动时 `init_db()` 自动创建所有表和新列，无需额外操作。

**已有数据库**：需手动执行迁移脚本：
```bash
psql -U <user> -d <db> -f docs/2026-08-02-merchant-dashboard-migration.sql
```

迁移内容：
1. `models` 表 `ADD COLUMN click_count` 和 `favorite_added`（`DEFAULT 0`）
2. `CREATE TABLE model_clicks`
3. `CREATE TABLE model_favorites_log`
4. 可选索引（加速趋势查询）

所有语句均带 `IF NOT EXISTS` / `IF NOT EXISTS`，可安全重复执行。

---

## 七、联调测试要点

| 类别 | 用例 | 预期 |
|------|------|------|
| 点击 | 同一用户反复点击同一模型链接 | `click_count` 每次 +1 |
| 收藏日志 | 收藏→取消→再收藏 | `favorite_added` 累计 +2，`favorite_count` = 1 |
| 深度意向 | 有收藏取消记录时 | `favorite_added > favorite_count`，差值 > 0 |
| 趋势 | 查询近 7 天趋势 | 三序列日期对齐，共 7 个元素，空天 = 0 |
| 热门排序 | 高收藏（含取消）vs 纯高浏览 | 新公式下高收藏模型排名更前 |
| 点击 body 可选 | 不传 body 调用 click | 正常记录，`link_url`/`platform` 为 null |
| 兼容 | 旧前端调用 favorite/toggle | 返回多了 `favorite_added`，不影响旧字段解析 |
