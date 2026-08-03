# 生产环境部署报告 — FastAPI + PostgreSQL

> 日期：2026-08-03
> 状态：✅ 已完成并公网验证通过
> 服务器：阿里云 ECS `39.101.73.244`（Ubuntu 24.04 LTS）
> 项目：3D Model Market 后端（FastAPI + PostgreSQL + SQLAlchemy async）

---

## 一、部署概述

将本地 FastAPI 后端项目（含 PostgreSQL 数据库）部署至阿里云 ECS 生产服务器，采用**裸机部署**方案（venv + systemd 托管 uvicorn，复用系统 PostgreSQL 16），Web 入口使用自定义端口 **26014**。

### 决策点记录

| 决策点 | 结论 | 说明 |
|--------|------|------|
| 部署方式 | 裸机部署 | 服务器 2 核 1.6G 内存、无 Docker、项目无 Dockerfile，裸机最省资源 |
| Web 入口 | 端口 26014 直连 | 避开 80（apache2 占用）与常用端口，暂不配置反代/HTTPS |
| 数据库 | 复用系统 PostgreSQL 16.14 | 与本地版本完全一致，新建专用用户与库 |
| 数据初始化 | seed + 示例数据 | 管理员、套餐、轮播图 + 示例商家、14 个模型 |
| 微信配置 | 沿用开发 appid/secret | 小程序侧配置后续再调 |
| 静态资源 | 全量上传 resources/ | 81MB，含 GLB 模型与图片，挂载于 /static |

## 二、服务器环境（探测确认）

| 项目 | 值 |
|------|-----|
| 系统 | Ubuntu 24.04.4 LTS，Linux 6.8.0-124 x86_64 |
| 规格 | 2 核 CPU / 1.6GiB 内存 / 40G 磁盘（余 31G） |
| Python | 3.12.3（系统自带） |
| PostgreSQL | 16.14（apt 安装，运行中） |
| 端口占用 | 80 → apache2；5432 → PostgreSQL；26014 → 本服务 |
| 防火墙 | ufw inactive，iptables ACCEPT（安全组在阿里云侧管控） |

## 三、部署执行记录

### 3.1 代码传输
- 本地打包 `tar.gz`（135 个文件，81MB，排除 venv/.git/.qoder/.env 等）
- SFTP 上传至服务器解压到 `/opt/bakend`
- 说明：`resources/` 位于 `.gitignore`（从未被 git 跟踪），打包上传保证与本地工作区一致

### 3.2 依赖安装
- `apt-get install python3-venv` → `python3 -m venv venv`
- `pip install -r requirements.txt` 全部成功（fastapi 0.115.0 / sqlalchemy 2.0.35 / asyncpg 0.29.0，与本地一致）

### 3.3 数据库初始化
- 创建角色 `bakend`（随机密码）+ 数据库 `model_market`
- 表结构由应用启动时 `init_db()`（`Base.metadata.create_all`）自动创建（项目未使用 alembic，alembic 目录为空）
- 运行 `python -m app.seed`：管理员 + 3 套餐 + 3 轮播图
- 运行 `python -m app.data_import`：4 商家 + 14 模型（依赖 pro 套餐，顺序不可颠倒）

### 3.4 生产配置 `.env`
```
DATABASE_URL=postgresql+asyncpg://bakend:***@localhost:5432/model_market
JWT_SECRET=<随机生成>
JWT_ALGORITHM=HS256
JWT_EXPIRE_DAYS=30
WECHAT_APPID=wx6f4bd58b88d61bcb
UPLOAD_DIR=/opt/bakend/uploads
APP_NAME=3D Model Market
DEBUG=false
```
- JWT_SECRET / DB 密码均为随机生成；`DEBUG=false`（关闭 SQL echo 与热重载）

### 3.5 服务托管（systemd）

`/etc/systemd/system/bakend.service`：
```ini
[Unit]
Description=3D Model Market FastAPI Backend
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/bakend
ExecStart=/opt/bakend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 26014 --workers 2
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
- `systemctl enable --now bakend` 开机自启 + 崩溃自动重启
- 运行内存约 146MB（2 workers）

## 四、数据初始化结果

| 表 | 数量 |
|----|------|
| users | 5（1 管理员 + 4 商家） |
| shops | 4 |
| models | 14 |
| plans | 3 |
| banners | 3 |
| search_keywords | 0（运行时积累） |

## 五、公网验证结果

| 测试项 | 结果 |
|--------|------|
| `GET /health` | ✅ 200 `{"status":"ok"}` |
| `GET /docs` | ✅ 200（Swagger UI） |
| `GET /` | ✅ 200 |
| `POST /api/v1/auth/login` | ✅ 200（返回 JWT） |
| `GET /api/v1/models/` | ✅ 307→200（FastAPI 尾斜杠重定向，标准行为） |
| `GET /static/picture/*.png` | ✅ 200（正常图片） |

## 六、安全加固

1. **管理员凭据随机化**：`admin/admin123` → 随机用户名 + 随机密码（已公网验证新凭据可登录、旧凭据 401 拒绝）。管理员权限由 `role=admin` 字段判定，改用户名不影响权限
2. **数据库端口不暴露**：阿里云安全组仅放行 TCP 26014，5432 未放行（仅内网访问）
3. **生产配置**：强 JWT_SECRET、`DEBUG=false`

> ⚠️ 凭据敏感信息不写入本报告，请通过部署会话记录或服务器 `/opt/bakend/.env` 获取。

## 七、已知遗留问题

1. **8 个损坏静态资源文件**（用户决定保持现状）：
   - 5 个模型 PNG（`Avocado.png`、`Fox.png`、`Flight_Helmet.png`、`Barramundi_Fish.png`、`Lantern.png`）为 14 字节 `"404: Not Found"` 占位文件
   - 3 个 banner jpg 为 0 字节空文件
   - 根因：`resources/` 在 `.gitignore` 中从未被 git 跟踪，损坏文件仅存在于本地工作区；且 `data_import.py` 中这 5 个模型的 thumbnail 外链（官方 glTF-Sample-Models 仓库）本身即 404，官方新旧仓库均已无这些缩略图
   - 影响：前端若直接引用 `/static/picture/*.png` 或模型缩略图外链会裂图，后端 API 功能不受影响

2. **代码隐患**：`main.py` 中 `app.mount("/static", StaticFiles(directory="resources"))` 强依赖 `resources/` 目录存在，但该目录被 `.gitignore` 忽略 → 他人从 GitHub clone 后直接运行会启动失败（StaticFiles 目录不存在报 RuntimeError），建议后续增加目录存在性保护或启动时自动创建

## 八、运维指南

```bash
ssh root@39.101.73.244
systemctl status bakend        # 查看状态
systemctl restart bakend       # 重启
journalctl -u bakend -f        # 实时日志
# 代码更新流程：本地打包 → SFTP 上传 /opt/bakend → systemctl restart bakend
```

## 九、附录：关键位置

| 内容 | 位置 |
|------|------|
| 应用代码 | `/opt/bakend`（venv 在 `/opt/bakend/venv`） |
| 生产配置 | `/opt/bakend/.env` |
| 上传目录 | `/opt/bakend/uploads` |
| systemd 服务 | `/etc/systemd/system/bakend.service` |
| 数据库 | PostgreSQL `model_market`，用户 `bakend` |
| API 地址 | `http://39.101.73.244:26014`，文档 `/docs` |
