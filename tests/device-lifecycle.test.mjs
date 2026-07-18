import assert from 'node:assert/strict'
import test from 'node:test'

import { DeviceLifecycle } from '../src/main/match/device-lifecycle.mjs'

test('disconnects the platform worker', async () => {
  const calls = []
  const lifecycle = new DeviceLifecycle({
    disconnectWorker: async () => calls.push('worker')
  })

  const result = await lifecycle.stop('score-page-exit')

  assert.deepEqual(calls, ['worker'])
  assert.deepEqual(result, {
    ok: true,
    worker: { status: 'ok' }
  })
})

test('coalesces concurrent stop requests', async () => {
  let releases
  let workerCalls = 0
  const blocked = new Promise((resolve) => {
    releases = resolve
  })
  const lifecycle = new DeviceLifecycle({
    disconnectWorker: async () => {
      workerCalls += 1
      await blocked
    }
  })

  const first = lifecycle.stop('renderer')
  const second = lifecycle.stop('window-close')
  assert.equal(first, second)
  releases()
  await first
  assert.equal(workerCalls, 1)
})

test('reports a worker shutdown failure', async () => {
  const lifecycle = new DeviceLifecycle({
    disconnectWorker: async () => {
      const error = new Error('worker timed out')
      error.code = 'WORKER_TIMEOUT'
      throw error
    }
  })

  assert.deepEqual(await lifecycle.stop(), {
    ok: false,
    worker: { status: 'error', error: 'WORKER_TIMEOUT' }
  })
})
