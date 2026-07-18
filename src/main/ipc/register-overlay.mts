import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-contract.ts'
import type { DesktopWindowManager } from '../app/windows.mts'

export function registerOverlayIpc(
  windows: DesktopWindowManager,
  getMatchStatus: () => unknown
): void {
  ipcMain.on(IPC_CHANNELS.overlay.ready, (event) => {
    if (
      windows.rejectUnexpectedSender(event, windows.getOverlayWindow(), IPC_CHANNELS.overlay.ready)
    ) {
      return
    }
    windows.handleOverlayReady(event, getMatchStatus())
  })

  ipcMain.on(IPC_CHANNELS.overlay.open, (event, value) => {
    if (windows.rejectUnexpectedSender(event, windows.getMainWindow(), IPC_CHANNELS.overlay.open)) {
      return
    }
    windows.openOverlay(value)
  })

  ipcMain.on(IPC_CHANNELS.overlay.close, (event) => {
    if (
      !windows.isSender(event, windows.getMainWindow()) &&
      !windows.isSender(event, windows.getOverlayWindow())
    ) {
      console.warn('[Electron] Blocked unauthorized IPC: overlay:close')
      return
    }
    windows.closeOverlay()
  })

  ipcMain.on(IPC_CHANNELS.overlay.setClickThrough, (event, ignore) => {
    if (
      windows.rejectUnexpectedSender(
        event,
        windows.getOverlayWindow(),
        IPC_CHANNELS.overlay.setClickThrough
      )
    ) {
      return
    }
    windows.setOverlayClickThrough(event, ignore)
  })
}
