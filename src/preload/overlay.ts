import { contextBridge, ipcRenderer } from 'electron'
import {
  type FtOverlayApi,
  type OverlayInitialState,
  type Unsubscribe
} from '../shared/ipc-contract'

type IpcChannels = typeof import('../shared/ipc-contract').IPC_CHANNELS

const IPC_CHANNELS = {
  overlay: {
    open: 'overlay:open',
    close: 'overlay:close',
    ready: 'overlay:ready',
    setClickThrough: 'overlay:set-click-through',
    initialData: 'overlay:initial-data'
  }
} as const satisfies Pick<IpcChannels, 'overlay'>

function onInitialData(callback: (data: OverlayInitialState) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: OverlayInitialState): void => {
    callback(payload)
  }
  ipcRenderer.on(IPC_CHANNELS.overlay.initialData, listener)
  return () => ipcRenderer.removeListener(IPC_CHANNELS.overlay.initialData, listener)
}

const ftOverlay = {
  ready: () => ipcRenderer.send(IPC_CHANNELS.overlay.ready),
  close: () => ipcRenderer.send(IPC_CHANNELS.overlay.close),
  setClickThrough: (enabled) =>
    ipcRenderer.send(IPC_CHANNELS.overlay.setClickThrough, Boolean(enabled)),
  onInitialData
} satisfies FtOverlayApi

contextBridge.exposeInMainWorld('ftOverlay', ftOverlay)
