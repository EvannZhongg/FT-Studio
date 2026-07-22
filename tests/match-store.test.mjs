import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { createServer } from 'vite'

test('starts a match with the context selected on the device binding page', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true } })
  try {
    const { useCompetitionStore } = await vite.ssrLoadModule(
      '/src/renderer/src/stores/competitionStore.js'
    )
    const { useMatchStore } = await vite.ssrLoadModule('/src/renderer/src/stores/matchStore.js')
    setActivePinia(createPinia())
    const competitionStore = useCompetitionStore()
    competitionStore.projectConfig = {
      id: 'competition-1',
      name: 'Test',
      mode: 'FREE',
      groups: []
    }
    competitionStore.activeStageId = 'stage-1'
    competitionStore.activeAttemptNumber = 1

    let startInput = null
    globalThis.window = {
      ftEngine: {
        match: {
          start: async (input) => {
            startInput = input
            return {
              status: {
                state: 'active',
                persistence: 'idle',
                worker: 'ready',
                media: 'not_ready',
                errorCode: null,
                lastSavedAt: null
              }
            }
          }
        }
      }
    }

    const store = useMatchStore()
    await store.startMatch({
      groupName: 'Free Mode',
      contestantName: 'Player 1',
      referees: [
        {
          index: 1,
          name: 'Referee 1',
          mode: 'SINGLE',
          primaryDeviceId: 'ble-device-1',
          secondaryDeviceId: ''
        }
      ]
    })

    assert.deepEqual(startInput, {
      sourceKey: 'competition-1',
      stageId: 'stage-1',
      groupName: 'Free Mode',
      contestantName: 'Player 1',
      attemptNumber: 1,
      referees: [
        {
          index: 1,
          name: 'Referee 1',
          mode: 'SINGLE',
          primaryDeviceId: 'ble-device-1',
          secondaryDeviceId: null
        }
      ]
    })
    assert.deepEqual(store.currentContext, {
      groupName: 'Free Mode',
      contestantName: 'Player 1'
    })
    assert.equal(store.matchActive, true)
  } finally {
    delete globalThis.window
    await vite.close()
  }
})
