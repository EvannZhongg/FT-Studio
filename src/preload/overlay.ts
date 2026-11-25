import { contextBridge, ipcRenderer } from 'electron'
import {
  type FtOverlayApi,
  type MatchRefereeUpdate,
  type MatchStatusUpdate,
  type OverlayInitialState,
  type Unsubscribe
} from '../shared/ipc-contract'
import type { RankingSnapshot } from '../shared/ranking.mts'

type IpcChannels = typeof import('../shared/ipc-contract').IPC_CHANNELS

const IPC_CHANNELS = {
  match: {
    refereeUpdated: 'match:referee-updated',
    contextUpdated: 'match:context-updated',
    statusUpdated: 'match:status-updated',
    rankingUpdated: 'match:ranking-updated'
  },
  overlay: {
    open: 'overlay:open',
    reset: 'overlay:reset',
    next: 'overlay:next',
    close: 'overlay:close',
    ready: 'overlay:ready',
    setClickThrough: 'overlay:set-click-through',
    initialData: 'overlay:initial-data'
  }
} as const satisfies {
  match: Pick<
    IpcChannels['match'],
    'refereeUpdated' | 'contextUpdated' | 'statusUpdated' | 'rankingUpdated'
  >
  overlay: IpcChannels['overlay']
}

function onInitialData(callback: (data: OverlayInitialState) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: OverlayInitialState): void => {
    callback(payload)
  }
  ipcRenderer.on(IPC_CHANNELS.overlay.initialData, listener)
  return () => ipcRenderer.removeListener(IPC_CHANNELS.overlay.initialData, listener)
}

function subscribe<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const ftOverlay = {
  reset: () => ipcRenderer.invoke(IPC_CHANNELS.overlay.reset),
  next: () => ipcRenderer.invoke(IPC_CHANNELS.overlay.next),
  ready: () => ipcRenderer.send(IPC_CHANNELS.overlay.ready),
  close: () => ipcRenderer.send(IPC_CHANNELS.overlay.close),
  setClickThrough: (enabled) =>
    ipcRenderer.send(IPC_CHANNELS.overlay.setClickThrough, Boolean(enabled)),
  onInitialData,
  onRefereeUpdated: (callback) =>
    subscribe<MatchRefereeUpdate>(IPC_CHANNELS.match.refereeUpdated, callback),
  onContextUpdated: (callback) =>
    subscribe<{ groupName: string; contestantName: string }>(
      IPC_CHANNELS.match.contextUpdated,
      callback
    ),
  onStatusUpdated: (callback) =>
    subscribe<MatchStatusUpdate>(IPC_CHANNELS.match.statusUpdated, callback),
  onRankingUpdated: (callback) =>
    subscribe<RankingSnapshot | null>(IPC_CHANNELS.match.rankingUpdated, callback)
} satisfies FtOverlayApi

contextBridge.exposeInMainWorld('ftOverlay', ftOverlay)
