# FT Engine - 专业电子裁判系统

语言：[English](README.md) | [中文](README_zh.md)

FT Engine 是面向竞技比赛的 Electron 桌面计分应用，支持 BLE/USB 计分器、SINGLE/DUAL 裁判模式、OBS 悬浮窗、YouTube 计分时间轴、历史报表和导出。

## 当前架构状态

项目正在执行路线 B 重构。当前版本是可运行的双链路过渡架构：

- Vue Renderer 的窗口、快捷键、Overlay、窗口枚举、设备扫描/停止、历史项目列表/删除、报表和复盘已使用受控 IPC。
- Electron Main 管理安全边界、Platform Worker 和影子 SQLite `ft-engine.db`。
- Python Platform Worker 负责窗口能力和设备扫描，并已具备设备会话能力。
- Legacy FastAPI backend 仍负责项目写入、实时计分、WebSocket、媒体锚点、CSV 和导出。
- SQLite 已支持版本化迁移、备份、legacy 导入、计分影子写入以及历史列表/报表/复盘读取，但尚未成为唯一权威存储。

具体进度、阻断项和下一步见 [路线 B 重构状态](docs/REFACTOR_PLAN_ROUTE_B_zh.md)。不要依据目标架构文档假定 localhost backend 已经移除。

## 主要能力

- 自由模式和赛事模式。
- BLE/USB 单机、双机裁判设备。
- 退出计分或关闭应用时统一关断 BLE/USB 会话。
- 实时分数、重点扣分、波形和选手切换。
- OBS 友好的透明悬浮窗与窗口定位。
- YouTube 视频计分、播放器时间锚点和视频复盘悬浮分数。
- 历史报表、CSV、SRT 和 ZIP 导出。
- 中文、英文和日文界面。

## 开发环境

前置依赖：

- Node.js 22+。
- Python 3.10+，推荐使用项目 `.venv`。
- 开发真实设备功能时开启系统蓝牙并安装相应 USB 驱动。

安装依赖：

~~~bash
npm install
python -m pip install -r requirements.txt
~~~

启动开发版：

~~~bash
npm run dev
~~~

Electron 会同时启动 legacy backend、Platform Worker 和本地 SQLite。开发版 Renderer 通常位于 `http://localhost:5173`，legacy backend 默认监听 `127.0.0.1:8000`。

## 验证

~~~bash
npm test
npm run typecheck
npm run lint
npm run build
python -m unittest discover -s tests
~~~

其中 Node 测试覆盖计分领域、IPC/Worker、安全边界、SQLite、legacy 导入、报表和复盘；Python 测试覆盖设备协议、设备服务、平台适配、legacy 计分与媒体锚点。

## 构建

~~~bash
# 当前平台的 Python 产物
npm run build:backend

# 仅生成 Electron 解包目录
npm run build:unpack

# Windows / macOS 安装产物
npm run build:win
npm run build:mac
~~~

当前安装包仍包含两个 Python 产物：

- `backend-engine`：过渡期 legacy FastAPI backend。
- `local-platform-worker`：JSONL stdio 本机能力 Worker。

## 数据位置

开发模式默认写入仓库目录，打包后写入 Electron 用户数据目录。

| 数据 | 说明 |
| --- | --- |
| `config.yaml` | legacy backend 端口等运行配置 |
| `app_settings.json` | 当前 legacy 设置 |
| `match_data/` | 当前 legacy 项目和 CSV 权威数据 |
| `ft-engine.db` | 路线 B 影子 SQLite |
| `backups/` | SQLite 迁移前备份 |
| `logs/` | 启动和运行日志 |

常见打包后目录：Windows `%APPDATA%/FT Engine/`，macOS `~/Library/Application Support/FT Engine/`。

## 关键目录

~~~text
src/main/
  domain/             TypeScript 计分领域
  persistence/        SQLite、迁移和 legacy importer
  worker/             WorkerClient
  legacy/             影子事件兼容层
src/preload/          主窗口与 Overlay 的窄化 API
src/shared/           IPC 类型契约
src/renderer/         Vue 界面
workers/local_platform_worker/
                      BLE、USB 和窗口 Worker
server.py             过渡期 FastAPI backend
utils/                legacy 存储、导出和媒体模块
tests/                Node 与 Python 回归测试
~~~

## 文档

- [路线 B 重构状态](docs/REFACTOR_PLAN_ROUTE_B_zh.md)
- [桌面产品与社区目标规范](docs/COMMUNITY_CONTRACT_AND_UI_SPEC_zh.md)
- [Windows 与 macOS 平台适配规范](docs/PLATFORM_ADAPTATION_zh.md)
- [中文使用说明](Manual_Doc/zh/manual.md)

## License

Proprietary / Custom License（授权请联系 Freakthrow）。

## Author

Freakthrow Team
