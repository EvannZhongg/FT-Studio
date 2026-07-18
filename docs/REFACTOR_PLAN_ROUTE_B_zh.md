# FT Engine 社区版重构方案（路线 B）

## 1. 目标

FT Engine 重构为“本地桌面应用 + 本机能力 Worker + 独立社区服务器”：

- 保留自由模式、赛事模式、BLE、USB、计分、OBS、YouTube、报表、回放和导出。
- 桌面端不再使用本地 REST 前后端分离。
- Electron Main 统一管理本地业务和 SQLite。
- Python 只负责 BLE、USB 和窗口跟踪，不再提供 FastAPI 或保存业务数据。
- 用户、登录、帖子和已发布记录由独立服务器管理。
- 本地赛事完整离线可用，云端故障不得影响计分。

配套文档：

- 临时登录、用户后端建议、赛事阶段和 UI 见 [社区接口与桌面产品规范](./COMMUNITY_CONTRACT_AND_UI_SPEC_zh.md)。
- 系统权限、BLE/USB、OBS、打包和平台验收见 [Windows 与 macOS 平台适配规范](./PLATFORM_ADAPTATION_zh.md)。

## 2. 核心技术决策

| 范围 | 建议技术 | 责任 |
| --- | --- | --- |
| 桌面壳 | Electron + TypeScript | 窗口、IPC、Overlay、更新、进程管理 |
| 桌面界面 | Vue 3 + TypeScript + Pinia + Vue Router | 赛事、计分、复盘、资料和社区界面 |
| 本地业务 | Electron Main | 计分领域、项目、SQLite、导出和上传队列 |
| 本机 Worker | Python | BLE、USB、设备重连和窗口跟踪 |
| 本地数据库 | SQLite + Drizzle | 本地赛事、事件、设置和上传任务 |
| 云端服务 | NestJS + Fastify | 用户、帖子、评论、分享和审核 |
| 云端数据 | PostgreSQL + 对象存储 | 用户与社区权威数据、附件 |

TypeScript 用于 Renderer、Preload、Electron Main 和云端后端。Python 硬件部分继续保留，避免重写已经验证的 BLE/USB 能力。

## 3. 总体架构

~~~text
Vue Renderer
     │ typed IPC
     ▼
Electron Main ───── SQLite
     │
     ├─ local RPC ─ Python Worker ─ BLE / USB / Window Tracking
     │
     └─ HTTPS ───── Independent Community Server ─ PostgreSQL / Storage
~~~

桌面与云端之间保留正式 HTTPS API。桌面内部只使用受控 IPC 和子进程通信，不再暴露固定 localhost 服务。

## 4. 职责边界

### 4.1 Renderer

- 负责界面和临时交互状态。
- 通过 Preload 调用本地能力和云端能力。
- 不访问 SQLite、文件系统、Python 或登录令牌。
- 不直接使用 Axios 调用本地或云端后端。

Pinia 按赛事、设备、复盘、Overlay、账号和社区拆分，避免继续维护单一大 Store。

### 4.2 Preload

- 只暴露项目、赛事、设备、Overlay、复盘、账号和社区等白名单能力。
- 不暴露通用 ipcRenderer 或 Node.js API。
- IPC 输入和输出统一校验。
- 主窗口和 Overlay 使用不同权限的 Preload。

### 4.3 Electron Main

Electron Main 是本地业务和 SQLite 的唯一所有者：

- 管理项目、赛事阶段、比赛上下文和计分状态。
- 接收 Worker 设备事件并执行计分规则。
- 保存不可变计分事件，生成报表、回放和导出数据。
- 管理 OBS Overlay、YouTube 时间锚点、全局快捷键和应用更新。
- 安全保存登录会话并访问独立服务器。
- 管理分享草稿、幂等上传和失败重试。

### 4.4 Python Worker

保留：

- BLE/USB 扫描、连接、命令、通知解析和重连。
- 设备重命名、Reset 和 Identify。
- 系统窗口枚举、坐标查询和目标窗口跟踪。

移除：

- FastAPI、Uvicorn、CORS 和 WebSocket。
- 项目、组别、选手和比赛流程。
- 分数聚合、报表、CSV 主存储和媒体业务。
- 云端用户与社区逻辑。

## 5. 本地通信和可靠性

第一版建议使用 JSON Lines over stdio：

- Electron 启动 Worker，并通过 stdin/stdout 交换命令、响应和事件。
- stdout 只承载协议，日志写入 stderr。
- 协议包含版本、命令 ID 和稳定错误码。
- Worker 崩溃后由 Electron 有限重启，不清除已保存赛事数据。
- 设备事件具备唯一 ID 或去重依据，避免重连后重复计分。

只有性能测试证明需要时，才考虑 Named Pipe、MessagePack 或其他协议。

## 6. 本地数据

SQLite 是本地唯一权威存储，建议覆盖：

- 项目、阶段、组别、选手、裁判和设备绑定。
- 计分会话与不可变计分事件。
- 媒体绑定、应用设置和导出记录。
- 分享草稿与上传任务。

原则：

- Electron Main 是唯一写入方。
- 计分事件追加写入，报表和快照可由事件重建。
- CSV、XLSX、TXT、SRT 和 ZIP 只作为导出格式。
- 数据库启动时执行版本化迁移，迁移前备份。
- 登录 Refresh Token 使用系统安全存储，不写入 SQLite 明文。

现有 JSON/CSV 数据通过幂等导入器迁移。切换前应影子写入 SQLite，并比较分数、报表和回放结果。

## 7. OBS 与媒体

OBS 属于发布阻断功能，必须保留：

- 独立透明、无边框、置顶 Overlay。
- OBS Window Capture 能正常捕获。
- 点击穿透、全屏或指定窗口、目标窗口跟踪。
- Overlay 显示裁判分数、连接状态、阶段、组别和选手。
- 主窗口内容保护不能影响 Overlay 捕获。

窗口跟踪由 Python 的通用 WindowTracker 提供，Electron Main 负责调整 Overlay 和推送只读状态。具体系统实现和验收在平台适配文档中维护。

YouTube 保留 URL 规范化、IFrame 播放、时间同步和按视频时间回放。网络或视频不可用时只标记媒体同步状态，不影响本地计分。

## 8. 独立社区服务器

初期采用模块化单体：

- NestJS + Fastify。
- PostgreSQL + Prisma。
- S3 兼容对象存储。
- OpenAPI 契约。

模块按认证、用户、资料、帖子、计分记录、附件和审核划分。初期不拆微服务，也不预先引入消息队列或搜索集群。

数据边界：

- 本地比赛默认不上传。
- 云端保存用户明确发布的版本化快照，不接收整个 SQLite 文件。
- 上传使用本地 UUID 作为幂等键。
- 删除本地赛事不自动删除云端帖子，删除云端账号不自动删除本地赛事。
- 云端不可用只影响登录、社区和上传。

## 9. 登录与离线

- 未登录用户可以使用全部本地赛事功能。
- Access Token 只在 Electron Main 内存中保存。
- Refresh Token 使用系统安全存储。
- Renderer 只接收用户资料和会话状态。
- 只在登录、浏览社区、播放 YouTube 或用户主动上传时访问互联网。
- 后端未上线期间使用开发 Mock Gateway，具体规则见产品规范。

## 10. 分享机制

分享采用本地草稿和上传队列：

1. 用户从复盘结果创建分享草稿。
2. Electron 在事务中生成不可变快照和哈希。
3. 用户确认发布后才创建上传任务。
4. 附件和帖子使用同一幂等键提交。
5. 失败任务可重试或取消，不影响原始赛事。

不实现 SQLite 与 PostgreSQL 的通用双向同步。

## 11. 安全底线

- nodeIntegration=false、contextIsolation=true、webSecurity=true。
- Preload 只暴露窄化 API，IPC 和 Worker 消息均校验。
- Renderer 不持有 Token，不直接访问文件和数据库。
- 社区内容使用受限 Markdown 并净化，不允许任意 HTML 或 iframe。
- 外部链接使用系统浏览器打开并限制协议。
- 云端启用 TLS、鉴权、限速、审计和对象上传限制。
- 正式发布满足各系统的签名和更新校验要求。

## 12. 建议迁移阶段

### 阶段 0：建立行为基线

- 覆盖 SINGLE、DUAL、Reset、重点扣分和历史事件重放。
- 准备脱敏旧项目样例。
- 固定 OBS、BLE、USB、YouTube、报表和导出验收清单。

### 阶段 1：TypeScript 和安全边界

- 渐进迁移 Main、Preload 和 Renderer。
- 引入窄化 IPC、Vue Router 和分域 Store。
- 修复 Electron Web 安全设置。

### 阶段 2：Python Worker

- 提取 BLE、USB 和窗口跟踪。
- 建立子进程协议和虚拟设备测试。
- 新旧事件链路并行对比。

### 阶段 3：计分领域和 SQLite

- 将计分规则迁入 TypeScript 纯函数。
- 建立 SQLite Schema、旧数据导入和影子写入。
- 验证新旧分数、报表和回放一致。

### 阶段 4：切换本地主链路

- Renderer 全部切换到 IPC。
- 移除本地 FastAPI、Axios 和 localhost WebSocket。
- 完成 OBS、导出和媒体新链路。

### 阶段 5：账号和社区

- 先接入独立用户后端和用户资料。
- 再实现分享队列。
- 帖子、评论、关注和审核后续迭代。

每个阶段保持可运行、可打包和可回退。不要在同一阶段同时重做 UI、数据库、硬件协议和云端功能。

## 13. 测试重点

- 计分规则、Worker 协议、数据库迁移和上传幂等单元测试。
- Electron Main 与虚拟 Worker、SQLite 和云端 API 集成测试。
- 创建赛事、计分、OBS、复盘、导出和断网场景端到端测试。
- 各系统安装、升级、权限、BLE/USB 和 OBS 真实设备验收。

## 14. 完成定义

- 应用不再运行 FastAPI/Uvicorn 或监听本地 HTTP 端口。
- Electron Main 是本地业务和 SQLite 的唯一所有者。
- Python Worker 只承担设备和必要系统窗口能力。
- 旧数据可迁移，分数、报表、回放和导出结果一致。
- 未登录、断网和云端宕机时可完成完整赛事。
- OBS、BLE、USB 和 YouTube 在支持平台通过验收。
- 独立服务器管理用户和已发布内容。
- 上传具备明确触发、幂等、重试和错误反馈。
- 正式构建满足 Electron、令牌和平台发布安全要求。
