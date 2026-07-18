import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-contract.ts'
import type { DesktopWindowManager } from '../app/windows.mts'

export function registerWindowIpc(windows: DesktopWindowManager): void {
  ipcMain.on(IPC_CHANNELS.window.setContentProtection, (event, enabled) => {
    if (
      windows.rejectUnexpectedSender(
        event,
        windows.getMainWindow(),
        IPC_CHANNELS.window.setContentProtection
      )
    ) {
      return
    }
    windows.setMainContentProtection(enabled)
  })

  ipcMain.on(IPC_CHANNELS.window.toggleMaximize, (event) => {
    if (
      windows.rejectUnexpectedSender(
        event,
        windows.getMainWindow(),
        IPC_CHANNELS.window.toggleMaximize
      )
    ) {
      return
    }
    windows.toggleMaximize(event)
  })

  ipcMain.on(IPC_CHANNELS.window.minimize, (event) => {
    if (
      windows.rejectUnexpectedSender(event, windows.getMainWindow(), IPC_CHANNELS.window.minimize)
    ) {
      return
    }
    windows.minimize(event)
  })

  ipcMain.on(IPC_CHANNELS.window.close, (event) => {
    if (windows.rejectUnexpectedSender(event, windows.getMainWindow(), IPC_CHANNELS.window.close)) {
      return
    }
    windows.closeMain(event)
  })
}
