# FT Engine 路线 B 重构状态

## 1. 文档用途

本文记录当前代码事实、过渡边界和剩余切换顺序，不再重复已经完成的阶段任务。

目标架构仍是：Vue Renderer 通过受控 IPC 访问 Electron Main；Electron Main 持有本地业务和 SQLite；Python Worker 只处理 BLE、USB 和系统窗口；社区服务独立部署。本地赛事必须离线可用。

配套规范：

- 产品目标和社区边界见 [社区接口与桌面产品规范](./COMMUNITY_CONTRACT_AND_UI_SPEC_zh.md)。
- 权限、Worker、OBS、打包和平台验收见 [Windows 与 macOS 平台适配规范](./PLATFORM_ADAPTATION_zh.md)。

## 2. 当前运行架构

应用处于双链路过渡期，不是目标架构的最终状态。

~~~text
Vue Renderer
  ├─ typed IPC ─ Electron Main
  │                ├─ node:sqlite / ft-engine.db
  │                ├─ Python Platform Worker (JSONL stdio)
  │                └─ Overlay / Window / Shortcut / Update
  │
  └─ HTTP + WS ─ Legacy FastAPI backend
                   ├─ 当前赛事和实时计分
                   ├─ JSON / CSV 主写入
                   ├─ YouTube 播放锚点
                   └─ 导出与部分设置
~~~

Electron 开发版和打包版目前同时启动：

1. `server.py` legacy backend。
2. `workers/local_platform_worker` 本机能力 Worker。
3. Electron Main 内的 SQLite。

因此，文档和代码中不得把 SQLite 描述为当前唯一权威存储，也不得声称本地 REST 已移除。

## 3. 已完成的基础能力

| 范围 | 当前状态 | 说明 |
| --- | --- | --- |
| Electron 安全边界 | 已完成基础加固 | 主窗口与 Overlay 使用独立 Preload；`contextIsolation=true`、`nodeIntegration=false`、`sandbox=true`、`webSecurity=true`；外链和 Overlay 参数有校验。 |
| Typed IPC | 部分完成 | 应用窗口、快捷键、Overlay、窗口枚举、设备扫描、比赛停止、legacy 项目列表/删除、报表和复盘已定义共享契约。 |
| Python Worker 协议 | 已完成基础层 | JSON Lines over stdio、请求 ID、错误码、事件、超时、协议违规终止和有限重启已有测试。 |
| 平台窗口能力 | 已切换 | Renderer 经 IPC 调用 Worker 的窗口列表和边界查询。 |
| 设备扫描与退出 | 扫描已切换，退出已收口 | Renderer 经 IPC 调用 Worker 扫描 BLE/USB；退出计分页、窗口关闭、更新和清除数据会由 Main 并行关断 Worker 与 legacy 会话。连接、计分和 Reset 尚未切换。 |
| TypeScript 计分领域 | 已实现但未接管运行时 | SINGLE、DUAL、重点扣分、Reset 和事件去重为纯函数，并与 legacy 用例对齐。 |
| SQLite | 已建立影子库 | 使用 Electron 自带 `node:sqlite` 和显式 SQL；Schema 版本为 4，包含迁移前备份。当前没有使用 Drizzle。 |
| Legacy 导入 | 已实现 | `config.json` 与裁判 CSV 可幂等导入；启动、项目列表和报表/复盘读取前会按需同步，源哈希变化时替换对应赛事。 |
| 计分影子写入 | 已实现 | Legacy backend 在 CSV 写入后输出不可变事件，Electron Main 追加到 SQLite。 |
| 历史读取与删除 | 已切到 SQLite 主链路 | 列表、报表和复盘通过 IPC 读取；数据库或增量导入不可用时，Renderer 在过渡期回退 REST。删除同时移除受校验的 legacy 源目录和 SQLite 赛事。 |
| YouTube Demo | Legacy 链路可用 | URL 规范化、IFrame 播放、500ms 锚点、计分事件媒体时间和视频复盘已实现。 |

当前测试覆盖计分领域、Worker 协议与跨语言握手、平台设备服务、SQLite 迁移、legacy 导入、影子事件、报表、复盘、媒体锚点和安全边界。

## 4. 仍由 Legacy Backend 负责的功能

以下 Renderer 操作仍使用 Axios 或 localhost WebSocket：

- 应用设置和设备备注写入。
- 设备永久重命名。
- 项目创建、加载、组别更新和比赛上下文。
- 比赛启动、实时计分 WebSocket、Reset 和停止比赛。
- 媒体绑定与播放器锚点同步。
- 已计分选手状态。
- CSV、SRT 和 ZIP 导出。

Python Worker 已具备设备连接、断开、Reset、重命名和计数器事件能力，但这些方法尚未接入 Electron Main 的正式比赛状态机。

## 5. 当前数据流

### 5.1 启动导入

Electron Main 打开 `ft-engine.db` 后扫描 `match_data`。Importer 根据源目录内容哈希决定跳过或重新导入；打开项目列表时重新扫描，读取报表或复盘前只同步目标项目。导入失败会写日志并让 Renderer 回退 legacy REST，不阻止 legacy backend 继续运行。

### 5.2 实时计分

当前权威写入仍为：

~~~text
硬件 -> legacy backend -> 内存分数 -> CSV
                           └-> FT_SHADOW_EVENT -> SQLite
~~~

影子事件初始没有 `match_session_id` 和 `referee_id`。报表或复盘读取前的单项目增量导入会读取更新后的 CSV，并把相同 `event_id` 的事件关联到正式会话和裁判。

### 5.3 报表与复盘

历史列表、报表和复盘以 SQLite 为主读取，并保持旧 Vue 页面需要的数据形状。数据库未就绪或导入失败时回退 legacy REST。继续项目仍由 legacy backend 加载，因为正式比赛上下文尚未迁入 Electron Main。

## 6. 切换阻断项

### P1：设备存在双所有者

扫描由 Platform Worker 执行，正式连接和实时计分仍由 legacy backend 执行。两套进程都包含 BLE/USB 能力，可能出现缓存不一致、重复扫描、端口占用和重连状态分裂。过渡期的停止操作已经收口到 Electron Main，并会取消、等待心跳和重连任务；这降低了退出计分页后的设备占用风险，但不等于完成唯一所有者切换。设备连接切换完成前必须保留实机回归和清晰的唯一所有者规则。

### P1：目标 UI 架构尚未开始

Renderer 仍是 JavaScript、手写 `currentView` 和单一 `refereeStore`；Vue Router、分域 Store、工作台、Stage/MatchSession 编辑和账号模块尚未落地。产品规范中的目标页面不能标记为当前已实现。

### P2：迁移错误只在日志可见

Importer 返回逐项目错误，但当前 UI 不展示失败项目、重试或数据位置。正式切换前需要可见的迁移结果和恢复入口。

## 7. 下一步顺序

1. 将项目、Stage、Group、Contestant、Referee 和 MatchSession 的创建与状态迁入 Electron Main/SQLite。
2. 让 Platform Worker 成为设备连接、Reset、重命名和事件的唯一所有者；Electron Main 用 TypeScript 领域函数聚合分数并事务写入 SQLite。
3. 迁移设置、媒体锚点、Overlay 状态和导出，移除 Renderer 的 Axios 与 localhost WebSocket。
4. 停止打包和启动 legacy FastAPI backend，删除影子写入和双写兼容层。
5. 最后实施 Vue Router、分域 Store、账号 Gateway 和社区功能。

## 8. 验证命令与切换门槛

常规验证：

~~~bash
npm test
npm run typecheck
npm run lint
npm run build
python -m unittest discover -s tests
~~~

移除 legacy backend 前还必须满足：

- 同一应用运行周期内，新建、继续计分、报表和视频复盘结果一致。
- Worker 扫描到的 BLE/USB 设备可由同一 Worker 完成连接、计分、Reset、重命名和重连。
- SQLite 是项目和事件的唯一写入源，CSV/SRT/ZIP 仅作为导出。
- 未登录、断网或社区服务不可用时可完成完整赛事。
- OBS、BLE、USB、YouTube、导出、Windows 和 macOS 打包通过实机验收。
- 应用不再启动 FastAPI/Uvicorn，不监听本地 HTTP/WebSocket 端口。
