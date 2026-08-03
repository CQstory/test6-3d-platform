# 3D 模型展示平台 — 后端设计报告

> 基于前端小程序代码分析，完整设计 PostgreSQL 数据库 + FastAPI 架构。

---

## 一、数据库 DDL

### 1.1 ER 关系图

```
users ──1:1── shops ──1:N── models
  │        │
  │        └──N:1── plans
  │
  ├──M:N── favorites ──N:1── models
  │
  └──M:N── model_views ──N:1── models

banners (独立)
```

### 1.2 建表 SQL

```sql
-- 扩展：启用 UUID 生成
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- 1. users 用户表
-- =============================================================
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    openid      VARCHAR(64)  NOT NULL UNIQUE,
    unionid     VARCHAR(64),
    nickname    VARCHAR(64),
    avatar_url  VARCHAR(512),
    role        VARCHAR(16)  NOT NULL DEFAULT 'user'
                             CHECK (role IN ('user', 'merchant', 'admin')),
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 2. plans 套餐表（种子数据）
-- =============================================================
CREATE TABLE plans (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_key       VARCHAR(32)  NOT NULL UNIQUE,
    name           VARCHAR(64)  NOT NULL,
    price          DECIMAL(10,2) NOT NULL,
    slots          INTEGER      NOT NULL,          -- 可上传模型数量
    features       TEXT[]       NOT NULL DEFAULT '{}',
    is_highlighted BOOLEAN      NOT NULL DEFAULT false,
    sort_order     INTEGER      NOT NULL DEFAULT 0
);

-- 种子数据
INSERT INTO plans (plan_key, name, price, slots, features, is_highlighted, sort_order) VALUES
('basic',    '基础版',  99,  3,  ARRAY['3个模型上传位','基础展示','标准支持'],  false, 1),
('pro',      '专业版', 299, 10,  ARRAY['10个模型上传位','优先展示','高级支持','数据统计'], true, 2),
('flagship', '旗舰版', 599, -1,  ARRAY['无限模型上传位','首页推荐','专属客服','数据统计','API接口'], false, 3);
-- slots=-1 表示无限

-- =============================================================
-- 3. shops 店铺表
-- =============================================================
CREATE TABLE shops (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         NOT NULL UNIQUE REFERENCES users(id),
    plan_id         UUID         NOT NULL REFERENCES plans(id),
    name            VARCHAR(128) NOT NULL,
    avatar          VARCHAR(512),
    cover           VARCHAR(512),
    description     TEXT,
    contact_wechat  VARCHAR(64),
    contact_phone   VARCHAR(20),
    contact_email   VARCHAR(128),
    status          VARCHAR(16)  NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'active', 'disabled')),
    sub_expires     DATE,                           -- 订阅到期日
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_shops_user_id ON shops(user_id);
CREATE INDEX idx_shops_status   ON shops(status);

-- =============================================================
-- 4. models 模型表
-- =============================================================
CREATE TABLE models (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id         UUID         NOT NULL REFERENCES shops(id),
    name            VARCHAR(256) NOT NULL,
    description     TEXT,
    thumbnail       VARCHAR(512),
    model_url       VARCHAR(512),
    category        VARCHAR(32)  NOT NULL
                                 CHECK (category IN ('creature','industrial','toy','plant','prop')),
    tags            TEXT[]       NOT NULL DEFAULT '{}',
    faces           INTEGER      NOT NULL DEFAULT 0,
    format          VARCHAR(16)  NOT NULL DEFAULT 'glb',
    status          VARCHAR(16)  NOT NULL DEFAULT 'pending_review'
                                 CHECK (status IN ('draft','pending_review','approved','rejected')),
    review_comment  TEXT,
    is_featured     BOOLEAN      NOT NULL DEFAULT false,  -- 管理员设为精选
    view_count      INTEGER      NOT NULL DEFAULT 0,
    favorite_count  INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_models_shop_id   ON models(shop_id);
CREATE INDEX idx_models_category  ON models(category);
CREATE INDEX idx_models_status    ON models(status);
CREATE INDEX idx_models_featured  ON models(is_featured) WHERE is_featured = true;
CREATE INDEX idx_models_hot_score ON models(view_count DESC, favorite_count DESC) WHERE status = 'approved';

-- =============================================================
-- 5. favorites 收藏表
-- =============================================================
CREATE TABLE favorites (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id),
    model_id   UUID NOT NULL REFERENCES models(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, model_id)
);
CREATE INDEX idx_favorites_user_id  ON favorites(user_id);
CREATE INDEX idx_favorites_model_id ON favorites(model_id);

-- =============================================================
-- 6. model_views 浏览记录表（去重用）
-- =============================================================
CREATE TABLE model_views (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    model_id    UUID NOT NULL REFERENCES models(id),
    viewed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, model_id, viewed_date)
);
CREATE INDEX idx_model_views_model_id ON model_views(model_id);

-- =============================================================
-- 7. banners 轮播图表
-- =============================================================
CREATE TABLE banners (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image      VARCHAR(512) NOT NULL,
    title      VARCHAR(128),
    subtitle   VARCHAR(256),
    link       VARCHAR(256),
    sort_order INTEGER      NOT NULL DEFAULT 0,
    is_active  BOOLEAN      NOT NULL DEFAULT true,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

---

## 二、前端所需完整 API 列表

Base URL: `/api/v1`

### 2.1 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 微信登录，body: `{code}` → `{token, user}` |

### 2.2 用户

| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/users/me` | 当前用户信息 |
| GET  | `/users/me/favorites` | 我的收藏列表（分页，返回模型详情） |

### 2.3 模型（公开浏览）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/models` | 模型列表，query: `category`, `keyword`, `hot`, `featured`, `shop_id`, `page`, `size` |
| GET  | `/models/{id}` | 模型详情（含店铺信息） |
| POST | `/models/{id}/view` | 记录浏览（需登录） |
| POST | `/models/{id}/favorite/toggle` | 收藏/取消收藏（需登录） |

### 2.4 模型（商家管理）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST  | `/models` | 创建模型（审核状态: `pending_review`） |
| PUT   | `/models/{id}` | 修改模型（被驳回的可重提，状态回 `pending_review`） |
| GET   | `/merchant/models` | 我的模型列表（含各状态筛选） |

### 2.5 店铺

| 方法 | 路径 | 说明 |
|---|---|---|
| POST  | `/shops` | 申请入驻（status: `pending`） |
| PUT   | `/shops/mine` | 修改我的店铺信息 |
| GET   | `/shops/mine` | 我的店铺详情 |
| GET   | `/shops/{id}` | 店铺公开页（含统计：模型数、浏览数、评分） |
| GET   | `/shops/{id}/models` | 某店铺的已通过模型列表 |

### 2.6 上传

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/upload/thumbnail` | 上传缩略图 → `{url}` |
| POST | `/upload/model` | 上传 3D 文件 → `{url}` |

### 2.7 公共

| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/banners` | 启用的轮播图（按 sort_order） |
| GET  | `/plans` | 所有套餐 |
| GET  | `/categories` | 分类列表（静态或数据库） |

### 2.8 管理员

| 方法 | 路径 | 说明 |
|---|---|---|
| GET    | `/admin/shops/pending` | 待审核店铺列表 |
| POST   | `/admin/shops/{id}/approve` | 通过店铺审核（改 role→merchant） |
| POST   | `/admin/shops/{id}/reject` | 驳回店铺申请 |
| GET    | `/admin/models/pending` | 待审核模型列表 |
| POST   | `/admin/models/{id}/approve` | 通过模型审核 |
| POST   | `/admin/models/{id}/reject` | 驳回模型（含 review_comment） |
| PUT    | `/admin/models/{id}/featured` | 设为/取消精选 |
| POST   | `/admin/banners` | 添加轮播图 |
| PUT    | `/admin/banners/{id}` | 修改轮播图 |
| DELETE | `/admin/banners/{id}` | 删除轮播图 |

---

## 三、关键 API 请求/响应格式

### 3.1 微信登录

```
POST /api/v1/auth/login
Request:  { "code": "0b3x..." }
Response: {
    "token": "eyJhbG...",
    "user": {
        "id": "uuid",
        "nickname": "...",
        "avatar_url": "...",
        "role": "user"
    }
}
```

### 3.2 模型列表（首页热门）

```
GET /api/v1/models?hot=true&size=8
Response: {
    "total": 8,
    "items": [{
        "id": "uuid",
        "name": "...",
        "thumbnail": "...",
        "faces": 10240,
        "format": "glb",
        "category": "creature",
        "tags": ["3D", "角色"],
        "view_count": 1200,
        "favorite_count": 56,
        "shop": {
            "id": "uuid",
            "name": "银河模型工坊",
            "avatar": "..."
        }
    }]
}
```

### 3.3 收藏/取消收藏

```
POST /api/v1/models/{id}/favorite/toggle
Request:  (仅需 token)
Response: { "favorited": true, "favorite_count": 57 }
```

### 3.4 记录浏览（按天去重）

```
POST /api/v1/models/{id}/view
Request:  (仅需 token)
Response: { "view_count": 1201 }
-- 后端: INSERT ON CONFLICT DO NOTHING + 重新 COUNT 更新 models.view_count
```

### 3.5 创建模型

```
POST /api/v1/models
Request: {
    "name": "...",
    "description": "...",
    "category": "creature",
    "tags": ["标签1", "标签2"],
    "faces": 15000,
    "format": "glb",
    "thumbnail": "/uploads/thumbnails/xxx.jpg",
    "model_url": "/uploads/models/xxx.glb"
}
Response: { "id": "uuid", "status": "pending_review" }
-- 后端校验: 已通过模型数 < plans.slots
```

### 3.6 管理员审核模型

```
POST /api/v1/admin/models/{id}/approve
Request:  (无)
Response: { "status": "approved" }

POST /api/v1/admin/models/{id}/reject
Request:  { "comment": "模型质量不符合要求" }
Response: { "status": "rejected" }
```

---

## 四、FastAPI 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI 入口，注册路由、中间件
│   ├── config.py                # 配置（DB URL、JWT Secret、微信 AppID/Secret）
│   ├── database.py              # SQLAlchemy async engine + session
│   │
│   ├── models/                  # SQLAlchemy ORM 模型
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── shop.py
│   │   ├── model.py             # model_3d（避免与 models 包冲突）
│   │   ├── favorite.py
│   │   ├── model_view.py
│   │   ├── banner.py
│   │   └── plan.py
│   │
│   ├── schemas/                 # Pydantic 请求/响应模型
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── shop.py
│   │   ├── model.py
│   │   ├── favorite.py
│   │   ├── banner.py
│   │   └── plan.py
│   │
│   ├── api/                     # 路由层
│   │   ├── __init__.py
│   │   ├── deps.py              # 依赖注入（get_db, get_current_user）
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── auth.py
│   │       ├── users.py
│   │       ├── models.py
│   │       ├── shops.py
│   │       ├── upload.py
│   │       ├── banners.py
│   │       ├── plans.py
│   │       └── admin.py
│   │
│   ├── services/                # 业务逻辑层
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── user_service.py
│   │   ├── shop_service.py
│   │   ├── model_service.py
│   │   ├── favorite_service.py
│   │   ├── view_service.py
│   │   ├── banner_service.py
│   │   └── plan_service.py
│   │
│   └── utils/
│       ├── __init__.py
│       ├── security.py          # JWT 生成/验证
│       ├── wechat.py            # code2Session 封装
│       └── file_upload.py       # 文件上传工具
│
├── uploads/                     # 本地上传目录
│   ├── thumbnails/
│   └── models/
│
├── alembic/                     # 数据库迁移
│   └── versions/
│
├── alembic.ini
├── requirements.txt
├── .env                         # 环境变量
└── Dockerfile
```

### requirements.txt

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
alembic==1.13.0
python-jose[cryptography]==3.3.0
python-multipart==0.0.9
aiofiles==24.1.0
httpx==0.27.0
pydantic-settings==2.5.0
```

### .env 示例

```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/model_market
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256
JWT_EXPIRE_DAYS=30
WECHAT_APPID=wx6f4bd58b88d61bcb
WECHAT_SECRET=your-wechat-secret
UPLOAD_DIR=./uploads
```

---

## 五、关键业务逻辑总结

| 场景 | 关键逻辑 |
|---|---|
| **登录** | `wx.login` → code → `code2Session` → openid → 查/插 users → 返回 JWT（含 role） |
| **申请商家审核通过后** | shops.status→active + users.role→merchant → 用户重登刷新 token |
| **上传模型** | 校验 `已通过模型数 < plans.slots` → 插入 status=`pending_review` |
| **模型驳回重提** | 修改原记录 → status 回 `pending_review` |
| **浏览去重** | `model_views` 按 `(user_id, model_id, viewed_date)` 唯一约束 |
| **收藏防抖** | 前端 500ms 防抖 → 后端 toggle（INSERT/DELETE） |
| **首页热门** | `(view_count * 0.4 + favorite_count * 0.6 * 10)` 降序 |
| **首页精选** | `is_featured = true`，管理员手动设置 |
| **店铺公开页统计** | `COUNT(models)`, `SUM(view_count)`, `AVG(rating 暂无)` |
| **套餐上传数量限制** | `slots=-1` 表示无限 |
| **静态文件** | FastAPI `StaticFiles` 挂载 `uploads/` 目录 |
