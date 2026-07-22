# FT Engine 目标架构与项目结构

## 1. 架构原则

- Renderer 只负责展示和交互，通过受控、校验后的 IPC 调用本地能力。
- Electron Main 是本地应用层和组合根，SQLite 是赛事唯一权威存储。
- Python Platform Worker 只负责 BLE、USB 和系统窗口等本机 I/O，不聚合业务分数。
- Django 是独立用户/社区服务；不可用时不影响本地创建赛事、计分、复盘和导出。
- CSV、SRT、XLSX 和 ZIP 都是导出，不参与实时状态恢复。
- 不兼容旧项目目录、旧 CSV 或旧 SQLite；重构允许清空本地数据并从新 Schema 开始。
- 平台差异只存在于适配层；领域对象不读取操作系统名称。
- `FREE` 和 `TOURNAMENT` 共享 SQLite 实体与计分事件模型，但必须拥有不同的配置入口；自由模式不暴露赛事配置概念。
- 自由模式固定使用隐式 `Main` Stage、隐式 `Free Mode` 组和 `attempt_number = 1`；尝试次数只在赛事模式的配置界面出现。

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

### 5.1 模式化存储映射

模式差异只影响创建和运行入口，不新增模式专用表：

```text
FREE:
competition
└─ Main(stage, attempts=1)
   └─ Free Mode(group)
      └─ Player 1 / 当前自由上下文(contestant)
         └─ MatchSession(attempt_number=1)

TOURNAMENT:
competition
└─ Stage(s, attempts=1..20)
   └─ Group(s)
      └─ Contestant(s)
         └─ MatchSession(attempt_number=1..attempts)
```

自由模式的 Renderer 输入只需要项目名称和裁判数量；Main/Application 层负责生成统一 Stage/Group/Contestant/MatchSession 结构。赛事模式提交完整 graph 配置。两种模式最终都由相同的 `score_events`、复盘查询和导出查询读取。

`attempt_number` 是领域和持久化字段，不是自由模式的用户概念。自由模式固定传 `1`，赛事模式在范围 `1..20` 内校验并允许选择。旧仓库的 `config.json`、组目录和裁判 CSV 仅作为对照，不进入新运行时恢复路径。

### 5.2 进程边界数据

Platform Worker 的 JSONL 响应、Electron Main 的 IPC 返回值和 Renderer 状态只能传递 JSON 可序列化 DTO。扫描结果不得包含 Bleak 设备实例、广告对象、异常实例、函数、句柄或循环引用。错误统一转换为稳定的 `code/message/retryable` 结构；原始异常只写入 Main/Worker 日志。

## 6. Legacy 删除边界

`server.py` 不再拆分成新的 Python Web 服务。SQLite 导出补齐后，直接删除：

- FastAPI/Uvicorn 进程、路由和 backend 打包产物。
- Python 设备、计分、媒体锚点、项目存储和导出实现。
- legacy importer、shadow stdout event 和 `match_data` 扫描。
- 旧 JSON/CSV/SQLite migration、兼容 DTO 与相应测试 fixture。

唯一保留的 Python 运行单元是 Platform Worker；它只通过 JSONL stdio 暴露本机 I/O，不提供 HTTP 服务。

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
- 应用不读取或迁移 legacy `config.json`、计分 CSV、`match_data` 或旧 SQLite。
- 活动设备只由一个 Platform Worker 实例持有。
- SQLite 可独立完成创建、计分、崩溃恢复、复盘和导出。
- 自由模式从项目配置直接进入设备绑定和计分；赛事模式保留 Stage/组别/选手/尝试次数配置。
- 自由模式前端不显示尝试次数，数据库中的自由会话始终使用 `attempt_number = 1`。
- 设备扫描失败时 Renderer 只显示稳定本地化错误和重试动作，不显示 `DataCloneError` 等跨进程原始异常文本。
- Django/PostgreSQL 下线时，本地全流程保持可用。
- `index.js`、Store 或任何新组合根不重新聚合所有业务实现。
