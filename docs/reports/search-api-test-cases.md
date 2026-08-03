# 搜索功能 — 后端接口测试案例

> 对应需求：`search-backend-report.md`（前端变更报告）
> 测试日期：2026-08-01
> 覆盖接口：`GET /api/v1/models`（搜索扩展）、`GET /api/v1/search/hot`、`GET /api/v1/search/suggest`

---

## 一、测试环境与前置条件

### 1.1 服务启动

```powershell
cd d:\Code\benchuang\bakend
.\venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

启动时自动 `create_all` 创建 `search_keywords` 表。

### 1.2 示例数据准备（首次或数据缺失时执行）

```powershell
# 1) 管理员/套餐/轮播图种子数据
.\venv\Scripts\python -m app.seed

# 2) 商家/店铺/模型示例数据（依赖 pro 套餐，需先执行 seed）
.\venv\Scripts\python -m app.data_import
```

示例数据包含 8 个模型，其中 2 个名称含 "Helmet"、标签含 "头盔"（Damaged Helmet、Flight Helmet）。

### 1.3 测试工具约定

本文档所有请求使用 `curl.exe`（PowerShell 中 `curl` 是 `Invoke-WebRequest` 别名，必须用 `curl.exe`）。中文参数需 URL 编码，例如：`头盔` → `%E5%A4%B4%E7%9B%94`，`盔` → `%E7%9B%94`。

### 1.4 数据库检查（可选）

```powershell
# 查看搜索词统计表（需 psql 或数据库客户端）
SELECT keyword, keyword_norm, count FROM search_keywords ORDER BY count DESC;
```

---

## 二、接口总览

| 接口 | 方法 | 说明 | 是否需登录 |
|------|------|------|-----------|
| `/api/v1/models` | GET | 模型列表：keyword/category 过滤 + 分页 + sort 排序 | 否 |
| `/api/v1/search/hot` | GET | 热门搜索词（按搜索次数降序） | 否 |
| `/api/v1/search/suggest` | GET | 搜索建议联想（模型名/标签） | 否 |

---

## 三、测试用例

### 3.1 搜索列表 — `GET /api/v1/models`

#### TC-101 无参数返回全部模型
- **前置**：已导入示例数据
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models"`
- **预期**：200；`total=8`，`items` 按热度降序（Fox 排首位——热度以收藏数为主，其 `favorite_count=523` 最高）

#### TC-102 keyword 部分匹配模型名
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=Helmet"`
- **预期**：200；`total=2`，items 为 Damaged Helmet、Flight Helmet

#### TC-103 keyword 部分匹配标签
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=%E7%9B%94"`（关键词：盔）
- **预期**：200；`total=2`，命中标签"头盔"的 2 个模型（模型名本身不含"盔"）

#### TC-104 keyword 大小写不敏感
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=FOX"`
- **预期**：200；`total=1`，命中模型 Fox

#### TC-105 keyword 无结果
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=%E4%B8%8D%E5%AD%98%E5%9C%A8"`（关键词：不存在）
- **预期**：200；`total=0`，`items=[]`（前端展示空状态）

#### TC-106 keyword + category 组合过滤
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=Helmet&category=prop"`
- **预期**：200；`total=2`（Helmet 均属 prop 类）
- **补充**：`keyword=Helmet&category=toy` → `total=0`

#### TC-107 category 单独过滤
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?category=creature"`
- **预期**：200；`total=2`（Barramundi Fish、Fox）

#### TC-108 分页（page/size）
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?size=3&page=1"` 与 `...&size=3&page=2`
- **预期**：200；page1 返回 3 条、page2 返回 3 条，无重复无遗漏；`total=8` 恒定；`page * size >= total` 时为最后一页

#### TC-109 默认排序 sort=hot（热度降序）
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=Helmet"`（不传 sort）
- **预期**：200；Damaged Helmet 排在 Flight Helmet 前（前者 view_count 更高）

#### TC-110 排序 sort=new（发布时间倒序）
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=Helmet&sort=new"`
- **预期**：200；与 TC-109 顺序相反，最新创建的在前

#### TC-111 sort 非法值校验
- **请求**：`curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:8000/api/v1/models?sort=bad"`
- **预期**：422（参数校验拦截，仅允许 `hot` / `new`）

#### TC-112 size 超范围校验
- **请求**：`curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:8000/api/v1/models?size=200"`
- **预期**：422（size 允许 1~100）

#### TC-113 搜索埋点（计入热门统计）
- **前置**：记录当前 `search_keywords` 中"头盔"的 count
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=%E5%A4%B4%E7%9B%94"`
- **预期**：200；随后 `GET /api/v1/search/hot` 中"头盔"的 `count` 比前置值 +1

#### TC-114 同词不同大小写合并计数
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=Fox"` 后，再请求 `...?keyword=FOX`
- **预期**：200；`search_keywords` 表中只存在一条记录（keyword_norm 唯一），count 累加为 2，keyword 字段保留首次写法 `Fox`

#### TC-115 空 keyword 不埋点
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?keyword=%20"`（纯空格）
- **预期**：200；`total=8` 全量返回；`search_keywords` 表无新增记录

---

### 3.2 热门搜索词 — `GET /api/v1/search/hot`

#### TC-201 默认返回 Top10 且按次数降序
- **前置**：`search_keywords` 表已有若干记录（如"头盔" count=3、"FOX" count=2、"盔" count=1）
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/search/hot"`
- **预期**：200；`items` 顺序为 头盔(3) → FOX(2) → 盔(1)，即 `count` 严格降序

#### TC-202 size 参数限制条数
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/search/hot?size=2"`
- **预期**：200；仅返回前 2 条

#### TC-203 size 超范围校验
- **请求**：`curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:8000/api/v1/search/hot?size=0"`
- **预期**：422（size 允许 1~50）

#### TC-204 无搜索记录时返回空列表
- **前置**：清空 `search_keywords` 表
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/search/hot"`
- **预期**：200；`{"items":[]}`（前端展示空态，不报错）

#### TC-205 无需登录
- **请求**：不携带任何 Authorization 头调用
- **预期**：200（热门词接口无鉴权依赖）

---

### 3.3 搜索建议 — `GET /api/v1/search/suggest`

#### TC-301 keyword 必填校验
- **请求**：`curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:8000/api/v1/search/suggest"`
- **预期**：422（缺少必填参数 keyword）

#### TC-302 模型名联想（type=name）
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/search/suggest?keyword=Helmet"`
- **预期**：200；`items` 含 `{"keyword":"Damaged Helmet","type":"name"}`、`{"keyword":"Flight Helmet","type":"name"}`，按 view_count 降序

#### TC-303 标签联想（type=tag）
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/search/suggest?keyword=%E7%9B%94"`（关键词：盔）
- **预期**：200；`items` 含 `{"keyword":"头盔","type":"tag"}`

#### TC-304 建议词去重
- **前置**：存在 ≥2 个模型均含相同标签（如"头盔"）
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/search/suggest?keyword=%E5%A4%B4%E7%9B%94"`
- **预期**：200；"头盔" 仅出现一次（同词不重复）

#### TC-305 大小写不敏感
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/search/suggest?keyword=helmet"`（小写）
- **预期**：200；命中 Damaged Helmet / Flight Helmet

#### TC-306 无匹配返回空列表
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/search/suggest?keyword=zzzz"`
- **预期**：200；`{"items":[]}`

#### TC-307 size 限制
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/search/suggest?keyword=H&size=1"`
- **预期**：200；仅返回 1 条（最热门的匹配项）

#### TC-308 仅返回已上架（approved）模型
- **前置**：将某模型 status 改为 `pending_review` 或 `rejected`
- **请求**：以该模型专属关键词调用 suggest
- **预期**：200；结果不包含该模型相关词

#### TC-309 无需登录
- **请求**：不携带任何 Authorization 头调用
- **预期**：200（建议接口无鉴权依赖）

---

## 四、回归验证（保证既有功能不受影响）

#### TC-401 首页精选列表回归
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?featured=true"`
- **预期**：200；仅返回 `is_featured=true` 的精选模型，行为与改造前一致

#### TC-402 按店铺筛选回归
- **请求**：`curl.exe -s "http://127.0.0.1:8000/api/v1/models?shop_id=<店铺ID>"`
- **预期**：200；仅返回该店铺模型

#### TC-403 模型详情/浏览/收藏回归
- **请求**：`GET /api/v1/models/{id}`、`POST /api/v1/models/{id}/view`、`POST /api/v1/models/{id}/favorite/toggle`
- **预期**：均 200，行为与改造前一致

#### TC-404 商家模型列表回归
- **请求**：`GET /api/v1/merchant/models`（携带商家 token）
- **预期**：200；商家模型分页正常，未受本次改造影响

---

## 五、验收对照表

| 报告验收标准 | 对应用例 | 状态 |
|-------------|---------|------|
| 关键词命中 name/tags（部分匹配、大小写不敏感） | TC-102/103/104 | ✅ 已实现 |
| 关键词 + 分类组合过滤正确 | TC-106 | ✅ 已实现 |
| 分页每页 20 条、上拉无重复、末页正确终止 | TC-108 | ✅ 已实现 |
| sort=hot 热度降序 / sort=new 时间倒序 | TC-109/110 | ✅ 已实现 |
| 无结果空状态 | TC-105 | ✅ 已实现 |
| 空态展示热门词、点击可搜索、结果正确 | TC-201/205 | ✅ 已实现 |
| 输入 1 字符触发建议 | TC-301/302 | ✅ 已实现 |
| 建议词计入热门统计 | TC-113 | ✅ 已实现 |
| 搜索历史（纯前端本地 storage） | — | 前端职责，后端不涉及 |

---

## 六、已知差异

| 项目 | 报告约定 | 实际实现 | 说明 |
|------|---------|---------|------|
| suggest 模型状态 | `status=published` | `status=approved` | 本仓库审核通过状态值为 `approved`，详见 [models.py](file:///d:/Code/benchuang/bakend/app/api/v1/models.py) |
| 热门词埋点触发 | 前端确认搜索时 | `GET /models` 带非空 keyword 即记录 | 与报告约定一致（报告第六节建议后端据此埋点） |
