# FT Engine - Professional Electronic Referee System

Language: [English](README.md) | [中文](README_zh.md)

FT Engine is an Electron desktop scoring application for competitive events. It supports BLE/USB clickers, SINGLE/DUAL referee modes, OBS overlays, YouTube scoring timelines, historical reports, and exports.

## Current Architecture

Route B is being introduced incrementally. The current application is a working dual-runtime transition:

- Window, shortcut, overlay, window discovery, device scan/stop, historical project list/delete, report, and replay flows use constrained IPC.
- Electron Main owns the security boundary, Platform Worker, and shadow SQLite database.
- The Python Platform Worker provides window capabilities and device discovery and already contains device-session primitives.
- The legacy FastAPI backend still owns project writes, live scoring, WebSocket updates, media anchors, CSV storage, and exports.
- SQLite has versioned migrations, backups, legacy import, shadow score writes, and historical list/report/replay readers, but is not yet the only authoritative store.

See [Route B refactor status](docs/REFACTOR_PLAN_ROUTE_B_zh.md) for the exact progress, blockers, and cutover order. Do not assume the localhost backend has already been removed.

## Features

- Free and Tournament modes.
- BLE/USB clickers with single and dual-device referees.
- Coordinated BLE/USB shutdown when leaving scoring or closing the application.
- Live scoring, major penalties, waveform display, and contestant navigation.
- Transparent OBS-friendly overlay and target-window positioning.
- YouTube video scoring, playback anchors, and score overlays during replay.
- Historical reports plus CSV, SRT, and ZIP exports.
- Chinese, English, and Japanese UI.

## Development

Prerequisites:

- Node.js 22+.
- Python 3.10+; the project `.venv` is recommended.
- Bluetooth and the relevant USB drivers for physical-device development.

~~~bash
npm install
python -m pip install -r requirements.txt
npm run dev
~~~

Electron currently starts the legacy backend, Platform Worker, and SQLite together. The development Renderer normally uses `http://localhost:5173`; the legacy backend defaults to `127.0.0.1:8000`.

## Verification

~~~bash
npm test
npm run typecheck
npm run lint
npm run build
python -m unittest discover -s tests
~~~

Node tests cover the scoring domain, IPC/Worker protocol, security boundary, SQLite, legacy import, reports, and replay. Python tests cover device protocols and services, platform adapters, legacy scoring parity, and media anchors.

## Packaging

~~~bash
npm run build:backend
npm run build:unpack
npm run build:win
npm run build:mac
~~~

Transition builds still package two Python executables: `backend-engine` for the legacy FastAPI runtime and `local-platform-worker` for the JSONL stdio worker.

## Local Data

Development data is written under the repository; packaged builds use Electron's user-data directory.

| Data | Purpose |
| --- | --- |
| `config.yaml` | Legacy backend runtime configuration |
| `app_settings.json` | Current legacy settings |
| `match_data/` | Authoritative legacy projects and CSV files |
| `ft-engine.db` | Route B shadow SQLite database |
| `backups/` | Pre-migration SQLite backups |
| `logs/` | Startup and runtime logs |

Typical packaged locations are `%APPDATA%/FT Engine/` on Windows and `~/Library/Application Support/FT Engine/` on macOS.

## Key Directories

~~~text
src/main/domain/                 TypeScript scoring domain
src/main/persistence/            SQLite, migrations, and legacy importer
src/main/worker/                 WorkerClient
src/main/legacy/                 Shadow-event compatibility
src/preload/                     Narrow main/overlay APIs
src/shared/                      IPC type contracts
src/renderer/                    Vue UI
workers/local_platform_worker/   BLE, USB, and window worker
server.py                        Transitional FastAPI backend
utils/                           Legacy storage, exports, and media
tests/                           Node and Python regression tests
~~~

## Documentation

- [Route B refactor status](docs/REFACTOR_PLAN_ROUTE_B_zh.md)
- [Desktop product and community target](docs/COMMUNITY_CONTRACT_AND_UI_SPEC_zh.md)
- [Windows and macOS adaptation](docs/PLATFORM_ADAPTATION_zh.md)
- [English user manual](Manual_Doc/en/manual.md)

## License

Proprietary / Custom License (contact Freakthrow for licensing).

## Author

Freakthrow Team
