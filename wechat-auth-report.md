# 微信登录改造报告

## 改动文件

**仅 1 个文件被修改：`app/api/v1/auth.py`**

`POST /api/v1/auth/login` 从仅支持用户名密码，改为双模式：

```python
if body.code:          # 新增：微信小程序一键登录
    → wechat_code2session(code) → openid
    → get_or_create_user_by_openid(openid)
    → 返回 JWT

elif body.username:    # 不变：用户名密码登录
    → authenticate_user(username, password)
    → 返回 JWT
```

**`.env` 更新密钥：**

```
WECHAT_APPID=wx6f4bd58b88d61bcb
WECHAT_SECRET=439bd1a2333635c8cc002946bd98f93a
```

## 已有基础设施（未改动）

| 文件 | 作用 |
|---|---|
| `app/utils/wechat.py` | `wechat_code2session(code)` — 调用微信 `jscode2session` 接口 |
| `app/services/auth_service.py` | `get_or_create_user_by_openid(openid)` — 查 `users` 表，无则自动创建 |
| `app/utils/security.py` | `create_access_token()` — 生成 JWT |

## 数据库就绪用户

| 字段 | 值 |
|---|---|
| openid | `o6zAJs4pmf6C4i6lYkRlODU6EFc0` |
| nickname | 测试用户 |
| role | user |

## 完整请求链路

### 小程序端

```
wx.login() → 获取临时 code
  → POST /api/v1/auth/login
    Body: { "code": "081xYz0w3abc..." }
```

### 后端处理

```
1. 接收 { "code" }

2. httpx.GET https://api.weixin.qq.com/sns/jscode2session
     ?appid=wx6f4bd58b88d61bcb
     &secret=439bd1a2333635c8cc002946bd98f93a
     &js_code=<code>
     &grant_type=authorization_code

3. 微信返回:
   {
     "openid": "o6zAJs4pmf6C4i6lYkRlODU6EFc0",
     "session_key": "xxxxx"
   }

4. SELECT * FROM users WHERE openid = ?
     有 → 返回该用户
     无 → INSERT INTO users → 返回新用户

5. JWT({ sub: user.id, role: user.role })

6. 返回:
   {
     "token": "eyJhbGciOi...",
     "user": {
       "id": "uuid",
       "nickname": "测试用户",
       "avatar_url": null,
       "role": "user"
     }
   }
```

### 小程序收到响应后

```
token → Storage('auth_token')
user  → Storage('cached_user')
后续请求 → 自动带 Authorization: Bearer <token>
```

## 两种登录方式

| 方式 | Request | 场景 |
|---|---|---|
| 微信一键登录 | `{ "code": "081x..." }` | 小程序端 |
| 用户名密码 | `{ "username": "admin", "password": "admin123" }` | 网页管理端 / 开发调试 |

## 测试验证

```powershell
# 用户名密码登录（管理端用）
Invoke-RestMethod http://localhost:8000/api/v1/auth/login `
  -Method POST -ContentType "application/json" `
  -Body '{"username":"admin","password":"admin123"}'

# 微信登录（需真实 code，从小程序 wx.login() 获取）
Invoke-RestMethod http://localhost:8000/api/v1/auth/login `
  -Method POST -ContentType "application/json" `
  -Body '{"code":"从wx.login()获取的真实code"}'
```

## Swagger

http://localhost:8000/docs
