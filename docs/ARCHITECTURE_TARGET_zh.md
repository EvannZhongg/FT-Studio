# FT Engine 目标架构与项目结构

## 1. 架构原则

- Renderer 只负责展示和交互，通过受控、校验后的 IPC 调用本地能力。
- Electron Main 是本地应用层和组合根，SQLite 是赛事唯一权威存储。
- Python Platform Worker 只负责 BLE、USB 和系统窗口等本机 I/O，不聚合业务分数。
- Django 是独立用户/社区服务；不可用时不影响本地创建赛事、计分、复盘和导出。
- CSV、SRT、XLSX 和 ZIP 都是导出，不参与实时状态恢复。
- 平台差异只存在于适配层；领域对象不读取操作系统名称。

## 2. 目标运行拓扑

~~~text
Main Window / Overlay Renderer
          │ typed IPC
          v
Electron Main
  ├─ application services
  ├─ scoring/domain
  ├─ SQLite repositories
  ├─ export/media/auth gateways
  └─ Platform Worker client ─ JSONL ─ Python Platform Worker
                                      ├─ BLE adapter
                                      ├─ USB adapter
                                      └─ window tracker

Electron Main AuthGateway ─ HTTPS ─ Django Community Service ─ PostgreSQL
~~~

Renderer 不直接访问 SQLite、Worker、localhost REST 或 Django。Token 不得进入 Renderer。

## 3. 建议目录

为避免一次性搬迁构建配置，先在现有 `src/` 下分层；边界稳定后再评估 monorepo，不把“改目录”本身当作重构目标。

~~~text
src/
├─ main/
│  ├─ app/
│  │  ├─ bootstrap.mts
│  │  ├─ lifecycle.mts
│  │  └─ windows.mts
│  ├─ application/
│  │  ├─ competitions/
│  │  ├─ matches/
│  │  ├─ replay/
│  │  ├─ exports/
│  │  ├─ settings/
│  │  └─ auth/
│  ├─ domain/
│  │  ├─ scoring/
│  │  ├─ competition/
│  │  └─ media/
│  ├─ infrastructure/
│  │  ├─ persistence/sqlite/
│  │  ├─ platform-worker/
│  │  ├─ community-http/
│  │  └─ filesystem/
│  └─ ipc/
│     ├─ register-app.mts
│     ├─ register-projects.mts
│     ├─ register-matches.mts
│     └─ register-overlay.mts
├─ preload/
├─ shared/
│  ├─ contracts/
│  ├─ schemas/
│  └─ errors/
└─ renderer/src/
   ├─ app/
   │  ├─ router/
   │  ├─ layouts/
   │  └─ theme/
   ├─ features/
   │  ├─ dashboard/
   │  ├─ competitions/
   │  ├─ scoring/
   │  ├─ replay/
   │  ├─ settings/
   │  └─ account/
   ├─ components/
   └─ stores/
      ├─ competition.ts
      ├─ match.ts
      ├─ devices.ts
      ├─ settings.ts
      └─ session.ts

workers/local_platform_worker/
├─ ft_worker/application/
├─ ft_worker/platform/
└─ worker_entry.py

services/community/
├─ manage.py
├─ config/
└─ apps/
   ├─ accounts/
   ├─ profiles/
   ├─ sessions/
   └─ health/

compat/legacy_import/
├─ importer.mts
└─ fixtures/
~~~

## 4. Electron Main 模块边界

`bootstrap.mts` 只负责实例化依赖和注册生命周期，不包含 SQL、HTTP 路由语义或计分规则。每个 IPC 注册模块只做发送方授权、输入 Schema 校验、调用 application service 和稳定错误映射。

建议核心服务：

| 服务 | 职责 |
| --- | --- |
| `CompetitionService` | 创建、编辑、继续、归档赛事和阶段 |
| `MatchService` | MatchSession 状态机、上下文切换、完成/作废 |
| `ScoringService` | 消费 Worker 事件并调用纯领域函数 |
| `MediaSyncService` | 媒体绑定、单调时钟锚点和对齐状态 |
| `ReplayService` | 查询事件并构造复盘只读模型 |
| `ExportService` | 从 SQLite 查询快照并生成派生文件 |
| `DeviceService` | 管理 Worker 连接和能力状态，不计算分数 |
| `AuthService` | 安全存储 Token 并调用 CommunityGateway |

## 5. SQLite 事务边界

- 开始比赛：验证配置、创建 MatchSession、保存设备绑定和状态变更应在一个事务内。
- 计分事件：事件去重、上下文关联、累计快照和会话更新时间应在一个事务内。
- 完成并下一位：完成当前会话、创建/激活下一会话和写审计记录应原子提交，再通知 Renderer 切换。
- 原始 `ScoreEvent` 追加后不可修改；纠错通过作废会话或追加校正事件完成。
- Repository 返回领域对象或明确 DTO，不向 Renderer 暴露 SQL 行结构。

## 6. `server.py` 过渡拆分

在完全移除 FastAPI 前，`server.py` 只能保留启动入口：

~~~text
legacy_backend/
├─ app.py                 # create_app / lifespan
├─ routes/
│  ├─ settings.py
│  ├─ projects.py
│  ├─ media.py
│  └─ exports.py
├─ services/
│  ├─ project_service.py
│  └─ export_service.py
└─ infrastructure/
   └─ legacy_storage.py

server.py                 # load config + uvicorn.run(create_app())
~~~

不要为已经迁入 Worker/Main 的 BLE、USB、计分或窗口功能建立新的 legacy 模块。它们应从 `server.py` 删除，而不是永久搬家。拆分只服务于降低剩余兼容代码风险。

## 7. 依赖方向

~~~text
Renderer -> shared contracts -> Main IPC
Main IPC -> application -> domain
application -> repository/gateway interfaces
infrastructure -> implements repository/gateway interfaces
Platform Worker -> platform adapters
~~~

领域层不得依赖 Electron、Vue、SQLite、FastAPI、Django 或 Bleak。跨进程消息必须有协议版本、长度限制、超时和稳定错误码。

## 8. 完成定义

- Electron 不启动 FastAPI/Uvicorn，不监听本地 HTTP/WebSocket 端口。
- Renderer 中没有 Axios、原生 WebSocket、文件系统和平台判断。
- 新赛事不创建 legacy `config.json` 或计分 CSV；旧项目只经 importer 读取。
- 活动设备只由一个 Platform Worker 实例持有。
- SQLite 可独立完成创建、计分、崩溃恢复、复盘和导出。
- Django/PostgreSQL 下线时，本地全流程保持可用。
- `index.js`、Store 或任何新组合根不重新聚合所有业务实现。
