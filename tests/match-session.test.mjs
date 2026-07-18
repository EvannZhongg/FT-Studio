import assert from 'node:assert/strict'
import test from 'node:test'

import { MatchSessionService } from '../src/main/match/match-session.mts'


function createFixture() {
  const workerCalls = []
  const updates = []
  const events = []
  const mediaBindings = []
  let monotonicMs = 1000
  const service = new MatchSessionService({
    requestWorker: async (method, params = {}) => {
      workerCalls.push({ method, params })
      if (method === 'device.connectMany') {
        return {
          connections: params.connections.map((value) => ({ ...value, status: 'connected' }))
        }
      }
      return { connections: [] }
    },
    appendEvent: (event) => {
      events.push(event)
      return true
    },
    ensureEventContext: (_sourceKey, groupName, contestantName, refereeIndex) => ({
      matchSessionId: `session-${groupName}-${contestantName}`,
      refereeId: `referee-${refereeIndex}`
    }),
    upsertMediaBinding: (...args) => {
      mediaBindings.push(args)
      return true
    },
    emitRefereeUpdate: (update) => updates.push(update),
    now: () => new Date('2026-07-18T12:00:00.000Z'),
    monotonicNow: () => monotonicMs
  })
  return {
    service,
    workerCalls,
    updates,
    events,
    mediaBindings,
    advance: (milliseconds) => { monotonicMs += milliseconds }
  }
}

const startInput = {
  sourceKey: '20260718_120000_Demo',
  groupName: 'Final',
  contestantName: 'Alice',
  referees: [{
    index: 1,
    name: 'Judge A',
    mode: 'DUAL',
    primaryDeviceId: 'device-primary',
    secondaryDeviceId: 'device-secondary'
  }]
}

test('connects bindings in one worker request and aggregates worker events', async () => {
  const fixture = createFixture()
  await fixture.service.start(startInput)

  assert.deepEqual(fixture.workerCalls.map((value) => value.method), [
    'device.disconnectAll',
    'device.connectMany'
  ])
  assert.equal(fixture.workerCalls[1].params.connections.length, 2)

  fixture.service.handleWorkerEvent({
    event: 'device.counter',
    eventId: 'event-primary',
    payload: {
      connectionId: 'match-ref-1-primary',
      deviceId: 'device-primary',
      totalPlus: 5,
      totalMinus: 2,
      eventType: 1,
      deviceTimestampMs: 100
    }
  })
  fixture.service.handleWorkerEvent({
    event: 'device.counter',
    eventId: 'event-secondary',
    payload: {
      connectionId: 'match-ref-1-secondary',
      deviceId: 'device-secondary',
      totalPlus: 3,
      totalMinus: 4,
      eventType: -1,
      deviceTimestampMs: 110
    }
  })

  assert.deepEqual(fixture.updates.at(-1).score, {
    total: 2,
    plus: 5,
    minus: 3,
    penalty: 6
  })
  assert.deepEqual(fixture.events.at(-1), {
    eventId: 'event-secondary',
    matchSessionId: 'session-Final-Alice',
    refereeId: 'referee-1',
    connectionId: 'match-ref-1-secondary',
    deviceId: 'device-secondary',
    role: 'secondary',
    eventType: -1,
    deviceTimestampMs: 110,
    receivedAt: '2026-07-18T12:00:00.000Z',
    systemTime: '2026-07-18T12:00:00.000Z',
    totalPlus: 5,
    totalMinus: 3,
    currentTotal: 2,
    majorPenalty: 6,
    mediaProvider: '',
    mediaId: '',
    mediaTimeMs: null,
    mediaSyncStatus: 'not_ready'
  })
})

test('deduplicates device events and resets all active connections', async () => {
  const fixture = createFixture()
  await fixture.service.start(startInput)
  const event = {
    event: 'device.counter',
    eventId: 'duplicate-event',
    payload: {
      connectionId: 'match-ref-1-primary',
      deviceId: 'device-primary',
      totalPlus: 1,
      totalMinus: 0,
      eventType: 1,
      deviceTimestampMs: 100
    }
  }
  fixture.service.handleWorkerEvent(event)
  fixture.service.handleWorkerEvent(event)
  assert.equal(fixture.events.length, 1)

  await fixture.service.reset()
  assert.equal(fixture.workerCalls.at(-1).method, 'device.resetAll')
  assert.deepEqual(fixture.updates.at(-1).score, { total: 0, plus: 0, minus: 0, penalty: 0 })
})

test('rejects duplicate device bindings before connecting', async () => {
  const fixture = createFixture()
  await assert.rejects(fixture.service.start({
    ...startInput,
    referees: [
      startInput.referees[0],
      {
        index: 2,
        name: 'Judge B',
        mode: 'SINGLE',
        primaryDeviceId: 'device-primary',
        secondaryDeviceId: null
      }
    ]
  }), { code: 'MATCH_CONFIG_INVALID' })
})

test('captures a fresh playback anchor and persists media bindings', async () => {
  const fixture = createFixture()
  await fixture.service.start(startInput)
  assert.equal(fixture.service.setMediaBinding('Final', 'Alice', {
    provider: 'youtube',
    mediaId: 'dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  }), true)
  fixture.service.updatePlayback({
    group: 'Final',
    contestant: 'Alice',
    video_id: 'dQw4w9WgXcQ',
    video_time_ms: 4500,
    state: 'playing',
    playback_rate: 1
  })
  fixture.advance(200)
  fixture.service.handleWorkerEvent({
    event: 'device.counter',
    eventId: 'video-event',
    payload: {
      connectionId: 'match-ref-1-primary',
      totalPlus: 1,
      totalMinus: 0,
      eventType: 1,
      deviceTimestampMs: 120
    }
  })

  assert.equal(fixture.mediaBindings.length, 1)
  assert.deepEqual({
    provider: fixture.events[0].mediaProvider,
    mediaId: fixture.events[0].mediaId,
    mediaTimeMs: fixture.events[0].mediaTimeMs,
    status: fixture.events[0].mediaSyncStatus
  }, {
    provider: 'youtube',
    mediaId: 'dQw4w9WgXcQ',
    mediaTimeMs: 4700,
    status: 'aligned'
  })
})
