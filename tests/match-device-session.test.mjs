import assert from 'node:assert/strict'
import test from 'node:test'

import { MatchDeviceSession } from '../src/main/match/match-device-session.mts'

test('owns match device connections and worker control commands', async () => {
  const calls = []
  const devices = new MatchDeviceSession({
    requestWorker: async (method, params, timeoutMs) => {
      calls.push({ method, params, timeoutMs })
      if (method === 'device.connectMany') {
        return {
          connections: params.connections.map((connection) => ({
            ...connection,
            status: 'connected'
          }))
        }
      }
      return { connections: [] }
    }
  })

  const requests = devices.configure([
    {
      index: 1,
      mode: 'DUAL',
      primaryDeviceId: 'primary-1',
      secondaryDeviceId: 'secondary-1'
    },
    {
      index: 2,
      mode: 'SINGLE',
      primaryDeviceId: 'primary-2',
      secondaryDeviceId: 'ignored-secondary'
    }
  ])

  assert.deepEqual(requests, [
    { connectionId: 'match-ref-1-primary', deviceId: 'primary-1' },
    { connectionId: 'match-ref-1-secondary', deviceId: 'secondary-1' },
    { connectionId: 'match-ref-2-primary', deviceId: 'primary-2' }
  ])
  assert.deepEqual(devices.connectionFor('match-ref-1-secondary'), {
    refereeIndex: 1,
    role: 'secondary',
    deviceId: 'secondary-1'
  })

  await devices.disconnectBeforeStart()
  const connected = await devices.connectConfigured()
  await devices.resetAll()

  assert.equal(connected.connections.length, 3)
  assert.deepEqual(
    calls.map(({ method, timeoutMs }) => ({ method, timeoutMs })),
    [
      { method: 'device.disconnectAll', timeoutMs: undefined },
      { method: 'device.connectMany', timeoutMs: 30000 },
      { method: 'device.resetAll', timeoutMs: 10000 }
    ]
  )

  devices.clear()
  assert.equal(devices.connectionFor('match-ref-1-primary'), null)
  assert.deepEqual(devices.connectionRequests(), [])
})

test('rejects invalid worker responses while preserving the original start failure', async () => {
  const devices = new MatchDeviceSession({
    requestWorker: async (method) => {
      if (method === 'device.connectMany') return null
      throw new Error('worker unavailable')
    }
  })

  await assert.rejects(devices.connectConfigured([]), {
    code: 'MATCH_DEVICE_RESPONSE_INVALID'
  })
  await assert.doesNotReject(devices.disconnectAfterCancelledStart())
})
