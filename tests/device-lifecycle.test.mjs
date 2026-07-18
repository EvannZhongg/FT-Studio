import assert from 'node:assert/strict'
import test from 'node:test'

import { DeviceLifecycle } from '../src/main/match/device-lifecycle.mjs'


test('disconnects worker and legacy device owners together', async () => {
  const calls = []
  const lifecycle = new DeviceLifecycle({
    disconnectWorker: async () => calls.push('worker'),
    disconnectLegacy: async () => calls.push('legacy')
  })

  const result = await lifecycle.stop('score-page-exit')

  assert.deepEqual(new Set(calls), new Set(['worker', 'legacy']))
  assert.deepEqual(result, {
    ok: true,
    worker: { status: 'ok' },
    legacy: { status: 'ok' }
  })
})

test('coalesces concurrent stop requests', async () => {
  let releases
  let workerCalls = 0
  const blocked = new Promise((resolve) => { releases = resolve })
  const lifecycle = new DeviceLifecycle({
    disconnectWorker: async () => {
      workerCalls += 1
      await blocked
    },
    disconnectLegacy: async () => {}
  })

  const first = lifecycle.stop('renderer')
  const second = lifecycle.stop('window-close')
  assert.equal(first, second)
  releases()
  await first
  assert.equal(workerCalls, 1)
})

test('reports one owner failure without skipping the other owner', async () => {
  let legacyCalled = false
  const lifecycle = new DeviceLifecycle({
    disconnectWorker: async () => {
      const error = new Error('worker timed out')
      error.code = 'WORKER_TIMEOUT'
      throw error
    },
    disconnectLegacy: async () => { legacyCalled = true }
  })

  assert.deepEqual(await lifecycle.stop(), {
    ok: false,
    worker: { status: 'error', error: 'WORKER_TIMEOUT' },
    legacy: { status: 'ok' }
  })
  assert.equal(legacyCalled, true)
})
