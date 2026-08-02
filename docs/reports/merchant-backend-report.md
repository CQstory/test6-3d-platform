# 商家模型管理 — 前端变更报告（给后端）

> 分支：`feat/merchant-model-management`
> 日期：2026-07-26
> 状态：前端已实现，待后端联调

---

## 一、新增身份角色

用户 `role` 字段新增值 `merchant`（商家）。

| role | 含义 |
|------|------|
| `user` | 普通用户 |
| `merchant` | 商家（可管理模型） |
| `admin` | 管理员（已有） |

前端行为：
- `role=merchant` → Tab 第三位显示"商家"，进入商家 Dashboard
- `role=user` → Tab 第三位显示"消息"，进入通知占位页
- 角色从 `GET /users/me` 返回的 `user.role` 读取

---

## 二、Model 新增字段

`GET /models` / `GET /models/{id}` / `POST /models` / `PUT /models/{id}` 接口的模型对象需新增以下字段：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `price` | number | `0` | 价格（元），0 表示免费 |
| `material` | string | `""` | 材质描述，如 "PBR金属"、"树脂" |
| `dimensions` | string | `""` | 规格/尺寸，如 "15×10×8cm" |
| `status` | string | `"published"` | 模型状态 |
| `shop_links` | array | `[]` | 电商链接列表 |

### status 枚举值

| 值 | 前端显示 | 说明 |
|----|---------|------|
| `published` | 已发布（绿色） | 正常展示 |
| `flagged` | 违规（橙色） | 管理员标记 |
| `removed` | 已撤回（灰色） | 管理员撤回 |

### shop_links 结构

```json
[
  {
    "platform": "淘宝",
    "shop_name": "XX旗舰店",
    "url": "https://item.taobao.com/..."
  }
]
```

最多 5 条。

---

## 三、新增 API 需求（商家侧）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/merchant/models` | 获取当前商家自己的模型列表（需 `role=merchant`） |
| POST | `/models` | 创建模型（已有接口，需扩展新字段） |
| PUT | `/models/{id}` | 修改模型（已有接口，需扩展新字段） |
| POST | `/upload/model` | 上传 3D 模型文件（已有接口） |
| POST | `/upload/thumbnail` | 上传缩略图（已有接口） |

---

## 四、前端已实现功能

| 功能 | 说明 |
|------|------|
| 商家 Tab | 根据 role 动态切换"商家"/"消息"标签 |
| 商家 Dashboard | 双 Tab：模型管理 + 数据看板 |
| 模型 CRUD | 新增/编辑共用表单，含文件上传、电商链接 |
| 数据看板 | 总模型数、总浏览、总收藏 + 浏览排行 |
| 模型详情 | 展示价格、材质、规格、购买渠道链接 |
| 通知占位 | 普通用户看到占位页，预留物流等扩展 |

---

## 五、配合测试要点

### 5.1 身份测试

- 普通用户（role=user）看不到商家入口，Tab 显示"消息"
- 商家用户（role=merchant）Tab 显示"商家"，可进入管理
- 未登录用户点击模型详情 → 跳转登录页

### 5.2 模型 CRUD 测试

- 新增模型：填写所有字段 → 保存 → 模型列表出现新条目
- 编辑模型：点击已有模型 → 回填所有字段 → 修改后保存
- 电商链接：添加/删除多条，最多 5 条限制
- 文件上传：选择文件后显示文件名，保存时上传
- 价格 0：显示"免费"

### 5.3 返回字段验证

- `GET /models` 返回的模型需包含 price/material/dimensions/status/shop_links
- `GET /merchant/models` 需返回当前商家自己的模型（按 merchant/owner 过滤）
- `POST /models` 创建后返回的模型需含 status="published"
- `PUT /models/{id}` 编辑后保留原 status

---

## 六、Mock 模式说明

当前 `USE_MOCK = true` 时：
- 商家 ID 写死为 `merchant-1`
- 文件上传返回模拟 URL
- 数据存储在内存，刷新后丢失
- 切换 `USE_MOCK = false` 即可对接真实后端
