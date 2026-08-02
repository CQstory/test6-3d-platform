# 商户数据看板 — 前端变更报告（给后端）

> 日期：2026-08-02
> 状态：前端已实现，待后端联调
> 关联文档：[2026-08-02-merchant-dashboard-plan.md](../plans/2026-08-02-merchant-dashboard-plan.md)
> 说明：本报告为新增文档。按项目规则，发给后端的报告只新建不修改，后续更新请新建版本化报告（如 `merchant-dashboard-backend-report-1.md`）。

---

## 一、指标口径（重要，后端实现必须对齐）

| 指标 | 前端字段 | 计数规则 | 数据表 | 常理关系 |
|------|---------|---------|--------|---------|
| 浏览量 | `views` | **按天去重**（同日同人同模型只计 1 次） | `model_views`（已有） | 最大 |
| 累计收藏 | `favoriteAdded` | **每次收藏 +1，不去重；收藏后取消仍计入** | `model_favorites_log`（新增） | ≤ 浏览量 |
| 当前收藏 | `favorites` | 存量去重（每用户至多 1，取消即减） | `favorite_count`（已有） | ≤ 累计收藏 |
| 点击量 | `clicks` | **每次点击 +1，不去重** | `model_clicks`（新增） | 常态 < 浏览量 |

> 关键点：**收藏后取消的行为必须被记录**（这是比普通浏览更强的兴趣信号）。差值 `favorite_added - favorite_count` = 曾收藏又取消的人次，看板单独高亮为"深度意向"。

---

## 二、数据表变更

### 2.1 新表 `model_clicks`（点击明细，无唯一约束）

```sql
CREATE TABLE model_clicks (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id),
    model_id     UUID NOT NULL REFERENCES models(id),
    link_url     TEXT,      -- 点击的链接（可选，支持按渠道统计）
    platform     TEXT,      -- 平台名，如 淘宝/京东（可选）
    clicked_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 2.2 新表 `model_favorites_log`（收藏/取消明细，无唯一约束）

```sql
CREATE TABLE model_favorites_log (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id),
    model_id       UUID NOT NULL REFERENCES models(id),
    action         TEXT NOT NULL,          -- 'add' | 'remove'
    favorited_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 2.3 `models` 表新增缓存列（与 `view_count` 同机制）

```sql
click_count    INTEGER NOT NULL DEFAULT 0
favorite_added INTEGER NOT NULL DEFAULT 0   -- 累计收藏次数（含已取消）
```

---

## 三、API 变更

### 3.1 新增接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/models/{model_id}/click` | 👤 登录用户 | 记录一次点击；body 可选 `{link_url, platform}`；每次调用 +1 并回写 `models.click_count`；返回 `{click_count}` |

### 3.2 改造接口

| 方法 | 路径 | 变更 |
|------|------|------|
| POST | `/models/{model_id}/favorite/toggle` | 内部写 `model_favorites_log`（add/remove 各一条）+ 回写 `favorite_count` 与 `favorite_added`；返回 `{favorited, favorite_count, favorite_added}` |
| GET | `/merchant/models` | 每个 item 增加 `click_count` 与 `favorite_added`（与 `view_count`/`favorite_count` 并列） |
| GET | `/models?hot=true` | 热门排序改为新热度公式（见下） |
| GET | `/merchant/stats/trend?days=7\|30` | **P1 增强**：每日三序列 `{dates: [], views: [], clicks: [], favorites: []}`（`GROUP BY viewed_date / clicked_date / favorited_date`） |

### 3.3 POST /models/{id}/click 后端逻辑

```python
# 1. 从 JWT 解析当前用户 user_id
# 2. INSERT INTO model_clicks (user_id, model_id, link_url, platform) VALUES (?, ?, ?, ?)
#    每次点击一条，无去重
# 3. UPDATE models SET click_count = click_count + 1 WHERE id = ?
# 4. 返回 { "click_count": 最新值 }
```

### 3.4 POST /models/{id}/favorite/toggle 后端逻辑（改造）

```python
# 1. 从 JWT 解析当前用户 user_id
# 2. 判断当前是否已收藏（favorite 表）
#    - 未收藏 → INSERT model_favorites_log(action='add')；favorite_added + 1；favorite_count + 1
#    - 已收藏 → INSERT model_favorites_log(action='remove')；favorite_count - 1
# 3. 返回 { "favorited": bool, "favorite_count": 最新, "favorite_added": 最新 }
```

---

## 四、热度公式（特殊浏览量）

```python
weighted_views = view_count + 5 * favorite_added + 3 * click_count
# 首页 /models?hot=true 按此排序；收藏（含取消）≈ 5 次浏览，点击 ≈ 3 次浏览
# 权重为建议值，后端可配置
```

---

## 五、前端已实现功能

| 功能 | 说明 |
|------|------|
| 点击埋点 | 详情页点"购买渠道"链接 → `recordClick`（fire-and-forget，每次 +1） |
| 数据看板 | 总模型数、总浏览、总点击、当前收藏·累计收藏 + 点击/浏览/收藏排行 + 状态分布 + 浏览→点击转化率 + 深度意向条（收藏后取消人次） |
| 趋势图 | 近 7 天浏览/收藏/点击三色柱状图；Real 模式依赖 `/merchant/stats/trend`，未就绪时降级显示文案 |
| 热度 | Mock 模式已按新热度公式排序（`views + 5×favoriteAdded + 3×clicks`），与后端对齐 |

---

## 六、配合测试要点

- 点击计数：同一用户反复点击同一模型链接，`click_count` 每次 +1（不去重）
- 收藏明细：收藏→取消→再收藏，`favorite_added` 累计 +2，`favorite_count` 回到 1
- 深度意向：`favorite_added` > `favorite_count` 时，看板"深度意向"条显示差值
- 趋势：`/merchant/stats/trend` 三序列日期对齐（同一天三个值都有）
- 热门排序：有高收藏（含取消）的模型应比纯高浏览模型排前
