import assert from 'node:assert/strict'
import test from 'node:test'

import { MatchSessionNotifier } from '../src/main/match/match-session-notifier.mts'

const refereeUpdate = {
  index: 1,
  name: 'Judge A',
  mode: 'SINGLE',
  score: { total: 3, plus: 4, minus: 1, penalty: 0 },
  status: { pri: 'connected', sec: 'n/a' }
}

const statusUpdate = {
  state: 'active',
  persistence: 'saved',
  worker: 'ready',
  media: 'aligned',
  errorCode: null,
  lastSavedAt: '2026-07-19T00:00:00.000Z'
}

test('forwards match notifications through one collaborator', () => {
  const received = []
  const notifier = new MatchSessionNotifier({
    emitRefereeUpdate: (value) => received.push({ type: 'referee', value }),
    emitContextUpdate: (value) => received.push({ type: 'context', value }),
    emitStatusUpdate: (value) => received.push({ type: 'status', value }),
    onError: (code, error) => received.push({ type: 'error', code, error })
  })

  notifier.referee(refereeUpdate)
  notifier.context({ groupName: 'Final', contestantName: 'Alice' })
  notifier.status(statusUpdate)
  notifier.error('MATCH_TEST_ERROR')

  assert.deepEqual(
    received.map((entry) => entry.type),
    ['referee', 'context', 'status', 'error']
  )
  assert.equal(received[0].value, refereeUpdate)
  assert.equal(received[2].value, statusUpdate)
  assert.equal(received[3].code, 'MATCH_TEST_ERROR')
})

test('contains renderer and error-handler failures', () => {
  const errors = []
  const notifier = new MatchSessionNotifier({
    emitRefereeUpdate: () => {
      throw new Error('renderer unavailable')
    },
    onError: (code, error) => errors.push({ code, error })
  })

  assert.doesNotThrow(() => notifier.referee(refereeUpdate))
  assert.equal(errors[0].code, 'MATCH_RENDERER_NOTIFY_FAILED')
  assert.match(errors[0].error.message, /renderer unavailable/)

  const failingReporter = new MatchSessionNotifier({
    emitRefereeUpdate: () => {
      throw new Error('renderer unavailable')
    },
    onError: () => {
      throw new Error('logger unavailable')
    }
  })
  assert.doesNotThrow(() => failingReporter.referee(refereeUpdate))
  assert.doesNotThrow(() => failingReporter.error('MATCH_TEST_ERROR'))
})
