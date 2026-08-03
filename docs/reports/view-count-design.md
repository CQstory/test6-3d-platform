# 模型浏览计数 — 前后端交互设计

## 一、前端实现

### 1.1 用户流

```
用户点击模型卡片 → wx.navigateTo(model-detail)
  │
  ├─ isLoggedIn()?
  │   ├─ false → Toast "请先登录" → 跳转登录页 → 登录后回首页
  │   └─ true  → 加载模型数据 + 调用 recordView()
  │
  └─ recordView(modelId)
        → POST /api/v1/models/{id}/view
        → 后端处理（见下方）
        → 前端不等待结果（fire-and-forget）
```

### 1.2 前端关键代码

**登录门控**（`pages/model-detail/model-detail.ts`）：

```typescript
async onLoad(options: { id?: string }) {
  if (!userService.isLoggedIn()) {
    wx.showToast({ title: '请先登录', icon: 'none' })
    wx.navigateTo({ url: '/pages/login/login' })
    return  // 阻止加载，页面空白
  }
  // ... 加载模型 + 调用 recordView
}
```

**记录浏览**：

```typescript
modelService.recordView(id).catch(() => {})
// fire-and-forget，不阻塞页面渲染
```

### 1.3 前端 API 调用

```
POST /api/v1/models/{id}/view
Header: Authorization: Bearer <token>   ← 已登录用户一定有 token
Body:   无
```

---

## 二、后端需实现的接口

### POST /api/v1/models/{id}/view

记录一次浏览，**同一天同一用户同一模型只计一次**。

#### 请求

```
POST /api/v1/models/cdb478a1-b7d1-4087-8073-7d4f1e743a1f/view
Authorization: Bearer eyJhbG...
```

#### 后端处理逻辑

```python
# 1. 从 JWT 解析当前用户 user_id
# 2. 获取当前日期 today = date.today()

# 3. UPSERT 到 model_views 表
#    INSERT INTO model_views (user_id, model_id, viewed_date)
#    VALUES (?, ?, ?)
#    ON CONFLICT (user_id, model_id, viewed_date) DO NOTHING
#
#    同一天 + 同一用户 + 同一模型 → 唯一约束阻止重复插入

# 4. 重新 COUNT 更新 models.view_count
#    UPDATE models SET view_count = (
#      SELECT COUNT(*) FROM model_views WHERE model_id = ?
#    ) WHERE id = ?

# 5. 返回当前 view_count
```

#### 响应

```json
{ "view_count": 1201 }
```

#### 数据库依赖

`model_views` 表（已设计，见 `backend-design-report.md`）：

```sql
CREATE TABLE model_views (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    model_id    UUID NOT NULL REFERENCES models(id),
    viewed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, model_id, viewed_date)
);
```

`models` 表已有 `view_count` 字段：

```sql
view_count INTEGER NOT NULL DEFAULT 0
```

---

## 三、去重规则

| 场景 | 是否计数 | 原因 |
|---|---|---|
| 用户 A 今天第 1 次打开模型 X | +1 | 新记录 |
| 用户 A 今天第 2 次打开模型 X | 不计数 | INSERT ON CONFLICT DO NOTHING |
| 用户 A 明天打开模型 X | +1 | 新日期，新记录 |
| 用户 B 今天打开模型 X | +1 | 不同用户，新记录 |
| 未登录用户 | 不调用接口 | 前端门控拦截 |

---

## 四、与现有接口的关系

| 接口 | 用途 | `view_count` 来源 |
|---|---|---|
| `GET /models` | 模型列表 | `models.view_count`（缓存值，读不写） |
| `GET /models/{id}` | 模型详情 | `models.view_count` |
| `POST /models/{id}/view` | 记录浏览 | 写入 → model_views 表 + 更新 models.view_count |

首页热门排序公式无需改变，`view_count` 已经在 models 表中实时更新。

---

## 五、前端改动清单

| 文件 | 改动 |
|---|---|
| `pages/model-detail/model-detail.ts` | 新增 `isLoggedIn()` 门控 + `recordView()` 调用 |
| `services/model-service.ts` | `recordView()` 已实现（Mock=返回0，API=POST /models/{id}/view） |

**后端只需实现 `POST /models/{id}/view` 这一个接口**，model_views 表已设计好，models 表已有 view_count 字段。
