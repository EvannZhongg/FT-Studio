import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-contract.ts'
import type { DesktopWindowManager } from '../app/windows.mts'
import type { MatchSessionService } from '../match/match-session.mts'
import { requireDatabase, type IpcRegistrationContext } from './context.mts'

export function registerOverlayIpc(
  windows: DesktopWindowManager,
  matchSession: MatchSessionService,
  context: IpcRegistrationContext
): void {
  const assertOverlaySender = (event: Electron.IpcMainInvokeEvent): void => {
    if (!windows.isSender(event, windows.getOverlayWindow())) throw new Error('IPC_UNAUTHORIZED')
  }
  ipcMain.handle(IPC_CHANNELS.overlay.reset, async (event) => {
    assertOverlaySender(event)
    await matchSession.reset()
  })
  ipcMain.handle(IPC_CHANNELS.overlay.next, async (event) => {
    assertOverlaySender(event)
    if (!matchSession.isActive()) throw new Error('MATCH_NOT_ACTIVE')
    const snapshot = matchSession.getRankingSnapshot()
    if (!snapshot) throw new Error('MATCH_CONTEXT_INVALID')
    const currentIndex = snapshot.contestants.findIndex(
      (value) => value.name === snapshot.context.contestantName
    )
    if (currentIndex < 0) throw new Error('MATCH_CONTEXT_INVALID')
    let nextName = snapshot.contestants[currentIndex + 1]?.name
    if (!nextName) {
      const database = requireDatabase(context.getDatabase)
      if (database.getCompetitionConfig(snapshot.context.sourceKey)?.mode !== 'FREE') return null
      let number = snapshot.contestants.length + 1
      const names = new Set(snapshot.contestants.map((value) => value.name))
      while (names.has(`Player ${number}`)) number++
      nextName = `Player ${number}`
      database.appendFreeContestant(snapshot.context.stageId, snapshot.context.groupName, nextName)
    }
    const binding = matchSession.getMediaBinding(snapshot.context.groupName, nextName)
    return matchSession.transitionContext({
      group_name: snapshot.context.groupName,
      contestant_name: nextName,
      binding_version_id: binding?.version_id ?? null,
      progress_mode: 'reset',
      expected_media_key: binding
        ? `${binding.provider}:${binding.media_id}:${binding.segment}`
        : null
    })
  })
  ipcMain.on(IPC_CHANNELS.overlay.ready, (event) => {
    if (
      windows.rejectUnexpectedSender(event, windows.getOverlayWindow(), IPC_CHANNELS.overlay.ready)
    ) {
      return
    }
    windows.handleOverlayReady(event, matchSession.getStatus())
    event.sender.send(IPC_CHANNELS.match.rankingUpdated, matchSession.getRankingSnapshot())
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
