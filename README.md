# FT Engine

Language: [English](README.md) | [中文](README_zh.md)

FT Engine is a desktop scoring application for electronic referees and competitive events. It supports free and tournament workflows, BLE/USB clickers, live scoring, OBS overlays, YouTube replay, historical reports, and CSV/SRT/ZIP exports. The local application runs on Electron, TypeScript, SQLite, and a Python Platform Worker for device and window I/O.

## Features

- Free and tournament scoring modes with single or dual referees.
- BLE and USB clicker support with reconnect handling.
- Live score display, penalties, replay, media timelines, and OBS overlay.
- Historical reports and export to CSV, SRT, and ZIP.
- Chinese, English, and Japanese interface.

## Requirements

- Node.js 22 or newer.
- Python 3.10 or newer.
- Bluetooth hardware and USB drivers for physical-device development.

## Development

```bash
npm install
python -m pip install -r requirements.txt
npm run dev
```

The application stores local data in SQLite under Electron's user-data directory and does not require a local HTTP or WebSocket service.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
python -m unittest discover -s tests
```

## Packaging

```bash
npm run build:worker
npm run build:unpack
npm run build:win
npm run build:mac
```

Windows packages use NSIS; macOS packages use DMG.

## Documentation

- [Target architecture](docs/ARCHITECTURE_TARGET_zh.md)
- [Future goals](docs/FUTURE_GOALS_zh.md)
- [Django user service](docs/BACKEND_DJANGO_zh.md)
- [Community product boundary](docs/COMMUNITY_CONTRACT_AND_UI_SPEC_zh.md)
- [Windows and macOS adaptation](docs/PLATFORM_ADAPTATION_zh.md)

## License

Proprietary / Custom License (contact Freakthrow for licensing).
