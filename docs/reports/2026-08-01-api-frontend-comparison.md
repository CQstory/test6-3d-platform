# 前端调用 API 与后端清单对比报告

> 后端依据：`2026-08-01-api-list.md`（32 个端点）
> 前端依据：`miniprogram/services/` 下 5 个 service 的实际调用（25 处）
> 日期：2026-08-01

---

## 一、前端实际调用的 API（去重后 22 个端点）

| # | 前端调用点 | 方法+路径 | 后端清单 |
|---|-----------|-----------|---------|
| 1 | user-service.login / loginWithWechat | POST `/auth/login` | ✅ |
| 2 | user-service.register | POST `/auth/register` | ✅ |
| 3 | user-service.getMyFavorites | GET `/users/me/favorites` | ✅ |
| 4 | model-service.getHotModels | GET `/models?hot=true&size=` | ✅ |
| 5 | model-service.getFeaturedModels | GET `/models?featured=true&size=` | ✅ |
| 6 | model-service.getModelById | GET `/models/{id}` | ✅ |
| 7 | model-service.getModelsByCategory | GET `/models?category=` | ✅ |
| 8 | model-service.getModelsByMerchant | GET `/models?shop_id=` | ✅ |
| 9 | model-service.searchModels（旧签名） | GET `/models?keyword=` | ✅（未用分页/sort） |
| 10 | model-service.recordView | POST `/models/{id}/view` | ✅ |
| 11 | model-service.toggleFavorite | POST `/models/{id}/favorite/toggle` | ✅ |
| 12 | model-service.createModel | POST `/models` | ✅ |
| 13 | model-service.updateModel | PUT `/models/{id}` | ✅ |
| 14 | model-service.getMyModels | GET `/merchant/models` | ✅ |
| 15 | model-service.previewPriceMatrix | POST `/models/price-matrix/preview` | ⚠️ 鉴权冲突（见三） |
| 16 | **model-service.getPriceOptions** | GET `/price-options?dimension=` | ❌ **清单缺失** |
| 17 | **model-service.createPriceOption** | POST `/price-options` | ❌ **清单缺失** |
| 18 | merchant-service.getMerchantById | GET `/shops/{id}` | ✅ |
| 19 | merchant-service.getMyShop | GET `/shops/mine` | ✅ |
| 20 | merchant-service.updateShop | PUT `/shops/mine` | ✅ |
| 21 | merchant-service.applyShop | POST `/shops` | ✅ |
| 22 | public-service.getBanners / getPlans | GET `/banners`、`/plans` | ✅ |
| 23 | **model-service.uploadModelFile** | POST `/upload/model` | ❌ **清单缺失** |
| 24 | **model-service.uploadThumbnail / merchant-service.uploadImage** | POST `/upload/thumbnail` | ❌ **清单缺失** |

---

## 二、对比结论

### A. 前端调用但后端清单缺失（4 个，均为阻塞级）

| 接口 | 影响 | 备注 |
|------|------|------|
| `GET /price-options` | 编辑页选项来自后端（G3） | 前端已回退预置选项，接口就绪自动启用 |
| `POST /price-options` | 自定义选项 | 同上 |
| `POST /upload/model` | **发布模型核心**——3D 文件上传 | 前端已实现，无此接口则无法上传模型文件 |
| `POST /upload/thumbnail` | 缩略图/店铺图片上传 | 同上 |

> ⚠️ **上传接口缺失是最大风险**：商家发布模型（POST /models 需带 thumbnail/model_url）依赖上传返回 URL，无上传接口则发布链路断裂。

### B. 后端有但前端未用（12 个）

| 接口 | 前端现状 |
|------|---------|
| GET `/users/me` | **从未调用**——审核通过后 role 无法刷新（已列入驻流程缺口 2） |
| GET `/models/categories` | 前端用本地 `CATEGORY_MAP` 常量，未接 |
| GET `/shops/{id}/models` | store-front 孤儿页可接，未使用 |
| GET `/search/hot`、`/search/suggest` | 搜索功能待实现（契约已定） |
| GET/POST `/admin/shops/...`、`/admin/models/...`、`/admin/banners/...`（8 个） | 管理端未开发 |

### C. 鉴权/行为冲突（2 个）

| 接口 | 后端清单 | 实际/前端预期 | 说明 |
|------|---------|--------------|------|
| `POST /models/price-matrix/preview` | 🔓 公开 | 需商家登录（`get_merchant_user`） | 实测无 token 返回 401；清单标注公开，**需后端确认以哪个为准** |
| `GET /shops/mine` | 👤 登录用户 | API.md 原写需 merchant；实测 404 | 清单已按登录用户放开，但实际仍 404（接口未实现），**需确认实现进度** |

---

## 三、前端未接入/待改造点（自研）

- `searchModels` 仍是旧签名（无分页/sort）——搜索功能改造待启动
- `GET /users/me` 刷新机制（refreshUserInfo）待补——入驻审核闭环必需
- `GET /shops/{id}/models` 可用于激活 store-front 孤儿页

---

## 四、建议行动清单

### 给后端（补齐 4 个缺失 + 确认 2 个冲突）
- [ ] 实现 `POST /upload/model`、`POST /upload/thumbnail`（或确认已有等价端点）
- [ ] 实现 `GET /price-options`、`POST /price-options`（G3）
- [ ] 确认 `price-matrix/preview` 鉴权（公开 vs 商家）
- [ ] 确认 `GET /shops/mine` 实现进度（当前 404）

### 给前端（2 项）
- [ ] 补 `userService.refreshUserInfo()`（GET /users/me），profile/merchant-center onShow 刷新 role
- [ ] 搜索功能前端改造（searchModels 分页化 + model-list 页面）
