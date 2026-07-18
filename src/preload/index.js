import { contextBridge, ipcRenderer } from 'electron'

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const ftEngine = {
  app: {
    getServerConfig: () => ipcRenderer.invoke('app:get-server-config'),
    deleteLocalData: () => ipcRenderer.invoke('app:delete-local-data'),
    restartForUpdate: () => ipcRenderer.send('app:restart-for-update'),
    onUpdateAvailable: (callback) => subscribe('app:update-available', callback),
    onUpdateDownloaded: (callback) => subscribe('app:update-downloaded', callback)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    setContentProtection: (enabled) =>
      ipcRenderer.send('window:set-content-protection', Boolean(enabled))
  },
  shortcuts: {
    register: (shortcut) => ipcRenderer.invoke('shortcuts:register', shortcut),
    unregister: () => ipcRenderer.send('shortcuts:unregister'),
    onTriggered: (callback) => subscribe('shortcuts:triggered', callback)
  },
  overlay: {
    open: (options) => ipcRenderer.send('overlay:open', options),
    close: () => ipcRenderer.send('overlay:close')
  }
}

contextBridge.exposeInMainWorld('ftEngine', ftEngine)
