# FT Engine Django 用户服务目标

## 1. 定位

第一期建立独立的用户数据服务，采用 Django、Django REST Framework 和 PostgreSQL。它只承载账号、资料和会话，后续再增加社区内容；本地赛事数据不上传到该服务，也不依赖它才能运行。本地自由/赛事模式、计分、复盘和导出均以 Electron Main 的 SQLite 为准，模式与存储约束见 [当前架构](./ARCHITECTURE_CURRENT_zh.md) 和 [目标架构](./ARCHITECTURE_TARGET_zh.md)。

当前 Docker PostgreSQL 基线：容器 `pgvector-db`，镜像 `pgvector/pgvector:pg16`，宿主 `5433` 映射容器 `5432`。应用通过环境变量连接，不提交真实账号或密码。

## 2. 建议目录

~~~text
services/community/
├─ manage.py
├─ pyproject.toml
├─ .env.example
├─ README.md
├─ config/
│  ├─ settings/
│  │  ├─ base.py
│  │  ├─ development.py
│  │  └─ production.py
│  ├─ urls.py
│  ├─ asgi.py
│  └─ wsgi.py
└─ apps/
   ├─ accounts/
   │  ├─ models.py
   │  ├─ services.py
   │  ├─ api.py
   │  └─ migrations/
   ├─ profiles/
   ├─ sessions/
   └─ health/
~~~

API View 只验证请求和调用 service；认证、会话轮换和资料规则不堆入 `views.py`。生产配置与开发配置分离。

## 3. 环境变量

`.env.example` 只提供占位符：

~~~dotenv
DJANGO_SETTINGS_MODULE=config.settings.development
DJANGO_SECRET_KEY=replace-me
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
DATABASE_URL=postgresql://ft_engine:replace-me@127.0.0.1:5433/ft_engine
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
~~~

正式环境必须使用单独数据库角色、TLS、秘密管理和 `DEBUG=false`。桌面客户端不能假设开发端口或容器名称。

## 4. 首期数据模型

| 模型 | 关键字段 |
| --- | --- |
| User | UUID、email、password hash、status、created_at |
| Profile | user、display_name、avatar_url、bio、locale、updated_at |
| RefreshSession | UUID、user、token_hash、device_name、created_at、expires_at、revoked_at |
| AuditEvent | actor、event_type、IP/客户端摘要、created_at |

使用自定义 User 模型并在第一次 migration 前确定。邮箱规范化并唯一；Refresh Token 只保存哈希，支持轮换、单设备撤销和全量撤销。头像第一期只保存可选 URL，不提前引入文件存储。

## 5. API v1

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/health/` | 进程存活，不访问外部依赖 |
| GET | `/api/v1/ready/` | 检查数据库 migration 和连接 |
| POST | `/api/v1/auth/login/` | 邮箱密码登录 |
| POST | `/api/v1/auth/refresh/` | Refresh Token 轮换 |
| POST | `/api/v1/auth/logout/` | 撤销当前会话 |
| GET | `/api/v1/me/` | 当前用户和资料 |
| PATCH | `/api/v1/me/profile/` | 更新显示名、简介和语言 |
| GET | `/api/v1/me/sessions/` | 登录设备列表 |
| DELETE | `/api/v1/me/sessions/{id}/` | 撤销指定会话 |

第一期不实现帖子、关注、媒体上传、赛事同步和公开 Feed。pgvector 扩展可随镜像存在，但没有明确检索需求前不建立向量字段。

## 6. 桌面接入边界

~~~text
Renderer -> typed account IPC -> Electron Main AuthService
                                  ├─ SecureTokenStore
                                  └─ HttpCommunityGateway -> Django
~~~

- Renderer 只接收登录状态和非敏感 Profile，不接收 Access/Refresh Token。
- Token 使用 Electron `safeStorage` 封装的系统安全存储。
- Gateway 设置短连接超时、取消、离线错误映射和 Refresh 单飞锁，避免多个请求并发刷新。
- 未登录、超时、DNS/网络失败或服务维护时，工作台、赛事、计分、复盘和导出照常可用。
- Django 只允许明确的桌面客户端来源/协议；不要用 `CORS_ALLOW_ALL_ORIGINS` 解决接入问题。

## 7. 稳定错误码

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_SESSION_EXPIRED`
- `AUTH_ACCOUNT_SUSPENDED`
- `AUTH_RATE_LIMITED`
- `PROFILE_INVALID`
- `SERVICE_UNAVAILABLE`
- `NETWORK_UNAVAILABLE`

响应体不返回 traceback、SQL 或内部异常文本。Renderer 根据错误码本地化。

## 8. 安全和运维

- Django 密码哈希优先 Argon2，启用常规密码校验器。
- 登录、刷新和资料写入有速率限制与审计日志；日志不记录密码或 Token。
- 所有生产流量使用 HTTPS，配置 HSTS、Secure Cookie（若使用 Cookie）和可信代理头。
- Migration 在部署任务中显式执行，不在每个进程启动时隐式修改 Schema。
- PostgreSQL 定期备份并执行恢复演练；用户数据与本地赛事 SQLite 分开备份。
- 健康接口不泄露数据库地址、版本、密钥或用户数量。

## 9. 第一阶段验收

- 在端口 5433 的开发 PostgreSQL 上完成 migration、创建用户、登录、刷新、退出和资料更新。
- 重复邮箱、错误密码、过期/撤销 Refresh Token 和并发刷新有自动测试。
- PostgreSQL 停止时 `/health/` 可返回存活，`/ready/` 明确失败，桌面本地功能不受影响。
- Token 不出现在 Renderer DevTools、IPC 返回值、日志或数据库明文中。
- 服务端和桌面 Gateway 使用版本化契约，未来增加社区模块无需修改本地赛事领域。
