# 3D 模型展示平台 - API 接口文档

Base URL: `/api/v1`

---

## 1. 认证

### POST /auth/login
微信登录

**Request**
```json
{ "code": "微信 wx.login 返回的 code" }
```

**Response**
```json
{
    "token": "eyJhbG...",
    "user": {
        "id": "uuid",
        "nickname": "...",
        "avatar_url": "...",
        "role": "user"
    }
}
```

---

## 2. 用户

### GET /users/me
当前用户信息（需登录）

**Header**: `Authorization: Bearer <token>`

**Response**
```json
{
    "id": "uuid",
    "nickname": "...",
    "avatar_url": "...",
    "role": "user"
}
```

### GET /users/me/favorites
我的收藏列表（需登录，分页）

**Query**: `page=1&size=20`

**Response**
```json
{
    "total": 5,
    "items": [
        {
            "id": "uuid",
            "name": "...",
            "thumbnail": "...",
            "faces": 10240,
            "format": "glb",
            "category": "creature",
            "tags": ["3D"],
            "view_count": 120,
            "favorite_count": 56,
            "shop": { "id": "uuid", "name": "...", "avatar": "..." }
        }
    ]
}
```

---

## 3. 模型（公开浏览）

### GET /models
模型列表

**Query**:

| 参数 | 类型 | 说明 |
|---|---|---|
| category | string | 分类：creature/industrial/toy/plant/prop |
| keyword | string | 搜索关键词（匹配 name、tag） |
| hot | bool | 为 true 时按热度排序 |
| featured | bool | 为 true 时只返回精选 |
| shop_id | string | 某店铺的模型 |
| page | int | 页码，默认 1 |
| size | int | 每页条数，默认 20 |

**Response**
```json
{
    "total": 8,
    "items": [
        {
            "id": "uuid",
            "name": "...",
            "thumbnail": "...",
            "faces": 10240,
            "format": "glb",
            "category": "creature",
            "tags": ["3D", "角色"],
            "view_count": 1200,
            "favorite_count": 56,
            "is_favorited": false,
            "shop": {
                "id": "uuid",
                "name": "银河模型工坊",
                "avatar": "..."
            }
        }
    ]
}
```

### GET /models/{id}
模型详情

**Response**
```json
{
    "id": "uuid",
    "name": "...",
    "description": "...",
    "thumbnail": "...",
    "model_url": "...",
    "category": "creature",
    "tags": ["3D"],
    "faces": 10240,
    "format": "glb",
    "view_count": 1200,
    "favorite_count": 56,
    "is_favorited": false,
    "shop": {
        "id": "uuid",
        "name": "...",
        "avatar": "...",
        "cover": "...",
        "description": "..."
    }
}
```

### POST /models/{id}/view
记录浏览（需登录，同一天同一用户同模型去重）

**Response**
```json
{ "view_count": 1201 }
```

### POST /models/{id}/favorite/toggle
收藏/取消收藏（需登录）

**Response**
```json
{ "favorited": true, "favorite_count": 57 }
```

---

## 4. 模型（商家管理，需 role=merchant）

### POST /models
创建模型

**Request**
```json
{
    "name": "...",
    "description": "...",
    "category": "creature",
    "tags": ["标签1", "标签2"],
    "faces": 15000,
    "format": "glb",
    "thumbnail": "/uploads/thumbnails/xxx.jpg",
    "model_url": "/uploads/models/xxx.glb"
}
```

**Response**
```json
{ "id": "uuid", "status": "pending_review" }
```

### PUT /models/{id}
修改模型（被驳回后重提，状态回 pending_review）

**Request** 同上

**Response**
```json
{ "id": "uuid", "status": "pending_review" }
```

### GET /merchant/models
我的模型列表（需 role=merchant）

**Query**: `status=pending_review&page=1&size=20`

**Response** 同 GET /models，多 `status`、`review_comment` 字段

---

## 5. 店铺

### POST /shops
申请入驻（需登录，role=user）

**Request**
```json
{
    "name": "我的店铺",
    "avatar": "...",
    "cover": "...",
    "description": "...",
    "contact_wechat": "...",
    "contact_phone": "...",
    "contact_email": "...",
    "plan_id": "uuid"
}
```

**Response**
```json
{ "id": "uuid", "status": "pending" }
```

### PUT /shops/mine
修改我的店铺信息（需 role=merchant）

### GET /shops/mine
我的店铺详情（需 role=merchant）

### GET /shops/{id}
店铺公开页

**Response**
```json
{
    "id": "uuid",
    "name": "...",
    "avatar": "...",
    "cover": "...",
    "description": "...",
    "contact": {
        "wechat": "...",
        "phone": "...",
        "email": "..."
    },
    "stats": {
        "models": 12,
        "views": 3500,
        "rating": 4.8
    }
}
```

### GET /shops/{id}/models
店铺的已通过模型列表

**Query**: `page=1&size=20`

**Response** 同 GET /models

---

## 6. 上传

### POST /upload/thumbnail
上传缩略图（需登录）

**Request**: `multipart/form-data`，字段 `file`

**Response**
```json
{ "url": "/uploads/thumbnails/abc.jpg" }
```

### POST /upload/model
上传 3D 文件（需登录）

**Request**: `multipart/form-data`，字段 `file`

**Response**
```json
{ "url": "/uploads/models/abc.glb" }
```

---

## 7. 公共

### GET /banners
启用的轮播图

**Response**
```json
{
    "items": [
        {
            "id": "uuid",
            "image": "...",
            "title": "...",
            "subtitle": "...",
            "link": "..."
        }
    ]
}
```

### GET /plans
全部套餐

**Response**
```json
{
    "items": [
        {
            "id": "uuid",
            "plan_key": "basic",
            "name": "基础版",
            "price": 99,
            "slots": 3,
            "features": ["3个模型上传位", "基础展示", "标准支持"],
            "is_highlighted": false
        }
    ]
}
```

### GET /categories
分类列表

**Response**
```json
{
    "items": [
        { "key": "creature", "label": "生物" },
        { "key": "industrial", "label": "工业模具" },
        { "key": "toy", "label": "玩具" },
        { "key": "plant", "label": "植物" },
        { "key": "prop", "label": "道具" }
    ]
}
```

---

## 8. 管理员（需 role=admin）

### GET /admin/shops/pending
待审核店铺列表

### POST /admin/shops/{id}/approve
通过店铺审核

### POST /admin/shops/{id}/reject
驳回店铺

### GET /admin/models/pending
待审核模型列表

### POST /admin/models/{id}/approve
通过模型审核

### POST /admin/models/{id}/reject
驳回模型

**Request**
```json
{ "comment": "模型质量不符合要求" }
```

### PUT /admin/models/{id}/featured
设为/取消精选

### POST /admin/banners
添加轮播图

### PUT /admin/banners/{id}
修改轮播图

### DELETE /admin/banners/{id}
删除轮播图
