import { contextBridge, ipcRenderer } from 'electron'

function onInitialData(callback) {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on('overlay:initial-data', listener)
  return () => ipcRenderer.removeListener('overlay:initial-data', listener)
}

const ftOverlay = {
  ready: () => ipcRenderer.send('overlay:ready'),
  close: () => ipcRenderer.send('overlay:close'),
  setClickThrough: (enabled) => ipcRenderer.send('overlay:set-click-through', Boolean(enabled)),
  onInitialData
}

contextBridge.exposeInMainWorld('ftOverlay', ftOverlay)
