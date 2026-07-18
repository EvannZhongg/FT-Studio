# FT Engine 当前架构

> 代码核对日期：2026-07-18。本文描述当前工作树事实，包括尚未提交的实时比赛切换代码；它不是目标设计。

## 1. 运行拓扑

~~~text
Vue Renderer
  ├─ typed IPC ─ Electron Main
  │                ├─ MatchSessionService + TypeScript scoring domain
  │                ├─ node:sqlite / ft-engine.db (schema v5)
  │                ├─ Python Platform Worker (JSONL stdio)
  │                └─ Window / Overlay / Shortcut / Update
  │
  └─ Axios + WebSocket ─ Legacy FastAPI backend
                         ├─ project/config JSON and CSV compatibility
                         ├─ settings and media URL normalization
                         ├─ export
                         └─ duplicate legacy hardware/scoring implementation
~~~

Electron 仍同时启动三个运行单元：`server.py`、Platform Worker 和 Electron Main 内 SQLite。当前不能把 FastAPI 或 legacy 文件存储描述为已经移除。

## 2. 已落地边界

| 能力 | 当前主路径 | 状态 |
| --- | --- | --- |
| 窗口、快捷键、Overlay | Renderer -> IPC -> Main | 已切换 |
| 窗口枚举和边界 | Main -> Platform Worker | 已切换 |
| BLE/USB 扫描和重命名 | Main -> Platform Worker | 已切换 |
| 实时设备连接、Reset、计数事件 | Renderer -> Main MatchSession -> Worker | 工作树中已接入，仍需集成加固 |
| 分数聚合 | TypeScript 纯领域函数 | 已接管 Electron 实时路径 |
| 实时事件写入 | MatchSession -> SQLite | 已接入；上下文创建和事件写入尚非单事务 |
| 历史列表、报表、复盘、删除 | SQLite IPC 优先，REST 回退 | 过渡期主路径 |
| legacy 项目导入 | JSON/CSV -> SQLite | 已实现幂等导入和 live-managed 保护 |
| 项目创建、组别编辑、继续项目 | Renderer -> FastAPI | 未切换 |
| 设置和设备备注 | Renderer -> FastAPI | 未切换 |
| 媒体绑定 | FastAPI 规范化并写 JSON，再同步 SQLite | 双写过渡期 |
| 播放锚点 | 活动比赛走 Main；无 IPC 时走 FastAPI | 过渡期 |
| 导出 | FastAPI + legacy ExportManager | 未切换 |

## 3. 实时比赛实际数据流

新建或继续项目仍先由 FastAPI 生成/加载 legacy 配置，并把 `source_key` 交给 Renderer。开始比赛时：

~~~text
Renderer startMatch
  -> Main importLegacyProject(source_key)
  -> SQLite markLegacyProjectLive
  -> FastAPI /teardown (释放 legacy 设备)
  -> MatchSessionService.start
  -> Worker device.connectMany
  -> Worker device.counter event
  -> TypeScript scoring domain
  -> SQLite score_events
  -> IPC refereeUpdated -> Renderer/Overlay
~~~

这使 Electron 路径中的活动设备原则上由 Worker 单独持有，但生产代码仍保留两套设备实现，Renderer 也仍长期连接 legacy WebSocket。项目源目录缺失、FastAPI teardown 失败或 SQLite 未就绪都会阻止新 MatchSession 启动。

## 4. 当前代码集中点

- `server.py` 约 1363 行，同时包含 Scanner、BLE/USB 节点、计分聚合、WebSocket、项目、媒体和导出路由。
- `src/main/index.js` 约 986 行，同时承担进程启动、数据库导入、Worker 监管、MatchSession 组合、全部 IPC 和窗口生命周期。
- `src/renderer/src/stores/refereeStore.js` 约 617 行，混合设置、项目、设备、比赛、Overlay、复盘和导出，并同时维护 IPC 与 REST。
- `App.vue` 使用手写 `currentView`；主窗口与 Overlay 通过 query 参数共享入口。

下一阶段不能只拆 `server.py`；Main 组合根和 Renderer Store 也已达到需要分域的规模。

## 5. 已发现问题

### 高优先级

1. `MatchSession` 先更新内存分数，再分别确保上下文和追加事件。数据库失败只写日志，现场 UI 可能显示一个未持久化分数。
2. Worker `device.counter` payload 进入领域函数前缺少完整边界捕获。非法事件或数据库异常可能从 EventEmitter 监听器抛到 Main。
3. Renderer 的 `setMatchContext` 总是先写 FastAPI，活动比赛再写 Main，形成无事务双写和顺序竞争。
4. `connectWebSocket()` 在关闭后固定重连，没有显式停止标志；主窗口、计分页和 Overlay 都会调用它。FastAPI 移除前应先收口生命周期。

### 中优先级

1. `MatchSession` 只有 `active` 布尔状态，无法准确表达 starting/stopping/failed 和恢复语义。
2. 实时路径仍以导入 legacy 目录作为创建 SQLite 上下文的前置条件，新数据库尚不能独立创建比赛。
3. 媒体 URL 在 Python 规范化后再写 SQLite，Main 的媒体接口不能独立完成绑定。
4. 导入错误、事件持久化错误和 Worker 有限重启耗尽主要写日志，缺少用户可操作状态。
5. Main 的 `index.js` 和 Renderer Store 已成为新的集中式文件，继续追加 IPC 会重复 `server.py` 的问题。

## 6. UI 当前差距

- 主窗口固定 `900 x 670`，没有按显示器工作区计算；当前未发现启动自动最大化或全屏调用。
- 主窗口为无边框、可缩放且有阴影，但启动尺寸和深色背景不符合新的桌面壳层目标。
- 顶部 `NavBar` 承担品牌、设置和窗口控制；没有固定左侧导航和底部用户摘要。
- 首页使用深色 Hero、渐变标题和三张大卡片；历史赛事藏在模态框，不适合高频扫描和继续操作。
- 全局 CSS 包含径向渐变、模板残留样式和多种高饱和动作色，尚无统一 light/dark 语义 Token。
- 大量操作使用 `alert`/`confirm`，错误状态难以持续查看，键盘焦点和可访问性不可控。

## 7. 当前验证基线

2026-07-18 本地检查结果：

- `npm test`：39/39 通过。
- `npm run typecheck`：通过。
- `python -m unittest discover -s tests`：36/36 通过。
- Docker 中存在 `pgvector-db`，镜像 `pgvector/pgvector:pg16`，宿主端口 `5433` 映射容器 `5432`。

这些结果证明单元级基线可用，不代表 Electron 实机、打包版、真实 BLE/USB、OBS 或 YouTube 网络场景已经验收。
