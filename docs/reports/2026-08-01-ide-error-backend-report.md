# IDE 报错 — 后端协作报告（给后端）

> 对应：`2026-08-01-ide-error-log.md`（原始报错日志）
> 日期：2026-08-01
> 状态：前端可修复项已处理，剩余 4 项依赖后端

---

## 一、总览

| # | 报错 | 责任方 | 状态 |
|---|------|--------|------|
| 1 | `GET /api/v1/shops/mine` 404 | 后端 | ⏳ 待实现 |
| 2 | `GET /api/v1/merchant/models` 400「请先申请入驻店铺」 | 后端（数据/流程） | ⏳ 待确认 |
| 3 | `GET /api/v1/price-options?dimension=xxx` 404 | 后端 | ⏳ 待实现（G3） |
| 4 | 缩略图 `ERR_CONNECTION_RESET`（raw.githubusercontent.com） | 后端（数据源） | ⏳ 待迁移 |
| 5 | `wx.getSystemInfoSync is deprecated` | 前端 | ✅ 已修复 |
| 6 | 400 未捕获 → MiniProgramError | 前端 | ✅ 已修复 |

---

## 二、待后端处理项

### 2.1 `GET /api/v1/shops/mine` 返回 404（接口未实现）

- **现象**：商家进入店铺中心时请求 `GET /shops/mine` → 404
- **原因**：API.md 已定义该接口（我的店铺详情，需 `role=merchant`），后端未实现
- **要求**：按 API.md 实现，响应结构与 `GET /shops/{id}` 一致：
  ```json
  {
    "id": "uuid", "name": "...", "avatar": "...", "cover": "...",
    "description": "...",
    "contact": { "wechat": "...", "phone": "...", "email": "..." },
    "stats": { "models": 12, "views": 3500, "rating": 4.8 }
  }
  ```
- **前端现状**：`getMyShop()` 已 catch 失败返回 null，页面显示空店铺卡；接口就绪即自动恢复

### 2.2 `GET /api/v1/merchant/models` 返回 400「请先申请入驻店铺」

- **现象**：商家用户（`role=merchant`）进入店铺中心 → 400，且此前因前端未捕获产生 MiniProgramError（已修复）
- **原因**：当前测试账号在数据库中**没有店铺记录**（或入驻审核未通过）
- **需确认**：
  - 测试环境是否已准备「已入驻商家」账号？若无，请提供一个（或说明入驻审核流程）
  - 前端应在 400 时提示引导入驻？还是返回空列表即可？（当前前端 catch 后显示空列表「暂无模型」）
- **建议**：后端在商家角色下返回 400 属于预期校验，但请确认前端在未入驻状态下的正确交互（显示"去入驻"引导 vs 空态）

### 2.3 `GET /api/v1/price-options` 返回 404（G3 接口未实现）

- **现象**：编辑页加载选项（material/size/complexity 三维度）→ 404 ×3
- **原因**：价格矩阵方案中的 G3 接口未实现（`GET /price-options?dimension=`、`POST /price-options`）
- **要求**：详见 `2026-08-01-price-matrix-backend-report.md` 第 3.1/3.2 节
- **前端现状**：已 catch 回退内置预置选项，无功能影响；接口就绪后自动启用

### 2.4 缩略图数据源不可达（raw.githubusercontent.com）

- **现象**：部分模型缩略图 `https://raw.githubusercontent.com/...` 加载失败 `ERR_CONNECTION_RESET`（Fox、Avocado、Lantern、Flight Helmet、Barramundi Fish）
- **原因**：GitHub raw 域名在国内网络不可达；后端 `data_import` 导入的 8 个模型中仅 3 个（Damaged Helmet / Antique Camera / Duck）使用了本地 `localhost:8000/static/picture/`，其余 5 个用了 GitHub 外链
- **要求**：将全部模型缩略图迁移到后端静态目录（`/static/picture/`），或更换国内可达图床；前端已加 `binderror` 兜底占位（1x1 透明图），但不解决根本问题
- **影响**：列表/详情/商家中心缩略图大面积空白

---

## 三、前端已修复项（仅供知晓）

| 项 | 修复内容 |
|----|---------|
| 未捕获异常 | `merchant-center._loadData` 对 `getMyShop` / `getMyModels` 分别 try/catch，失败显示空态不再抛 MiniProgramError |
| API 弃用 | `top-bar.ts` / `app.ts` 的 `wx.getSystemInfoSync` → `wx.getWindowInfo`（基础库 3.x 推荐 API） |
| 图片兜底 | `model-card` / `model-item` / `model-detail` 增加 `binderror` 回退占位图（utils 新增 `FALLBACK_IMAGE` 常量） |

---

## 四、验收建议（后端）

- [ ] `GET /shops/mine` 返回店铺详情，前端店铺卡正常展示
- [ ] 已入驻商家调用 `GET /merchant/models` 返回模型列表（200）
- [ ] 未入驻商家调用 `GET /merchant/models` 返回 400 与明确提示（前端按约定展示）
- [ ] `GET /price-options` / `POST /price-options` 就绪，编辑页选项来自后端
- [ ] 全部模型缩略图可从 `/static/` 或国内可达地址访问
