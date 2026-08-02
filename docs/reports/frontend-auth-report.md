# 前端设计报告 — 微信一键登录（给后端）

> 前端已就绪：`app.ts` 启动自动调用、`user-service.ts` 已实现完整登录链路。
> 后端只需实现一个接口即可对接。

---

## 一、前端登录流程

```
小程序启动 (app.onLaunch)
  │
  ├─ USE_MOCK=false?
  │   │
  │   └─ userService.loginWithWechat()
  │         │
  │         ├─ 1. wx.login() → 拿到临时 code
  │         │
  │         ├─ 2. POST /api/v1/auth/login
  │         │     Body: { "code": "081x..." }
  │         │
  │         ├─ 3. 后端做 code2Session → 拿 openid
  │         │     ├─ 查 users 表
  │         │     │   ├─ 已有 → 返回 JWT + user
  │         │     │   └─ 没有 → INSERT → 返回 JWT + user
  │         │     └─ code 无效 → 返回 400
  │         │
  │         └─ 4. 前端收到 { token, user }
  │               ├─ token 存入 Storage
  │               ├─ user 缓存（profile 页用）
  │               └─ 后续所有请求自动带 Authorization: Bearer <token>
  │
  └─ USE_MOCK=true? → 走本地 Mock，不调后端
```

---

## 二、后端需实现的唯一接口

### POST /api/v1/auth/login（改造现有接口）

**现状**：仅接受 `{ username, password }`

**需要**：同时支持 `{ code }`（微信临时票据）

```
POST /api/v1/auth/login
Content-Type: application/json
```

#### 请求体（两种互斥）

```json
// 方式 A：用户名密码（已实现，不改动）
{ "username": "testuser", "password": "123456" }

// 方式 B：微信临时 code ← 本次需要新增
{ "code": "081xYz0w3abc..." }
```

#### 后端处理逻辑（code 分支）

```python
# 1. 用 code 向微信服务器换取 openid
#    GET https://api.weixin.qq.com/sns/jscode2session
#      ?appid=wx6f4bd58b88d61bcb
#      &secret=<你的secret>
#      &js_code=<code>
#      &grant_type=authorization_code
#
#    微信返回：{ openid, session_key, unionid? }

# 2. 查 users 表
#    SELECT * FROM users WHERE openid = ?
#
#    有 → 该用户
#    无 → INSERT INTO users (openid) VALUES (?) → 该用户

# 3. 生成 JWT（payload 包含 sub=user.id, role=user.role）
# 4. 返回 { token, user }

# ⚠️ 注意：code2Session 后绝对不要调 getUserProfile / getUserInfo！
# 这两个接口已于 2023 年废弃，调用会报错：
#   "getUserProfile:fail getUserAvatarInfo fail"
# 新用户 openid 不存在时，直接 INSERT 默认昵称即可。
# 用户头像/昵称由前端通过 <button open-type="chooseAvatar"> 单独收集。
```

#### 响应（不变，和 username/password 登录一致）

```json
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": "uuid",
        "nickname": "微信用户",
        "avatar_url": null,
        "role": "user"
    }
}
```

#### 错误响应（code 无效或微信接口失败）

```json
{ "detail": "登录失败" }
// HTTP 400
```

---

## 三、关键接口对照表

所有需要登录的接口，前端自动带 `Authorization: Bearer <token>`：

| 接口 | 方法 | 登录? | 说明 |
|---|---|---|---|
| `/auth/register` | POST | 否 | 已实现，注册后返回 JWT |
| `/auth/login` | POST | 否 | **需改造**：支持 `{ code }` |
| `/users/me` | GET | 是 | 已实现，返回当前用户 |
| `/users/me/favorites` | GET | 是 | 待实现，返回收藏模型列表 |
| `/models/{id}/view` | POST | 是 | 记录浏览 |
| `/models/{id}/favorite/toggle` | POST | 是 | 收藏/取消 |
| `/models` | POST | 是 | 创建模型（需 merchant） |
| `/shops` | POST | 是 | 申请入驻 |
| `/upload/thumbnail` | POST | 是 | 上传缩略图 |
| `/upload/model` | POST | 是 | 上传 3D 文件 |

公共接口（无需登录）：
| `/banners` | GET | 否 | 已实现 |
| `/plans` | GET | 否 | 已实现 |
| `/models` | GET | 否 | 已实现 |
| `/models/{id}` | GET | 否 | 已实现 |
| `/shops/{id}` | GET | 否 | 已实现 |

---

## 四、前端 auth 状态管理

```
Token 存储: wx.Storage('auth_token')
用户缓存:  wx.Storage('cached_user')  ← JSON: { id, nickname, avatar_url, role }

读取链路:
  userService.getCurrentUser() → Storage('cached_user') → { username, role }
  userService.isLoggedIn()     → !!token && !!cachedUser
  userService.getRole()        → cachedUser.role → 'user' | 'merchant' | 'admin'

自动登录:
  app.onLaunch → USE_MOCK=false → loginWithWechat() → 失败静默（公共页面仍可浏览）
```

---

## 五、后端只需做一件事

修改 `POST /api/v1/auth/login`：

```
现在:
  if body 有 username/password → 查数据库验证 → 返回 JWT

改造后:
  if body 有 code       → wx.code2Session → 拿 openid → 查/插 users → 返回 JWT
  elif body 有 username → 现有逻辑不变
  else → 400
```

微信配置需在 `.env` 中加：
```
WECHAT_APPID=wx6f4bd58b88d61bcb
WECHAT_SECRET=<微信小程序 secret>
```

`code2Session` 用 `httpx` 调：
```python
# GET https://api.weixin.qq.com/sns/jscode2session
# params: appid, secret, js_code, grant_type=authorization_code
# response: { openid, session_key, unionid? }
```

前端已全部就绪，后端改完这一个接口即可实现微信一键登录。
