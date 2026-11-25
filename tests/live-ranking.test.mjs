import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { LocalDatabase } from '../src/main/persistence/local-database.mts'
import { MatchSessionService } from '../src/main/match/match-session.mts'
import { MatchRankingPublisher } from '../src/main/match/match-ranking.mts'
import { liveRanking } from '../src/shared/ranking.mts'

function fixture() {
  const root = path.join(tmpdir(), `ft-ranking-${randomUUID()}`)
  const database = new LocalDatabase(path.join(root, 'app.db'), path.join(root, 'backups'))
  database.open()
  const competition = database.createCompetition({ name: 'Ranking', mode: 'FREE' })
  const referees = [1, 2].map((index) => ({
    index,
    name: `Judge ${index}`,
    mode: index === 2 ? 'DUAL' : 'SINGLE',
    primaryDeviceId: `device-${index}`,
    secondaryDeviceId: index === 2 ? 'device-secondary' : ''
  }))
  const groups = [
    { name: 'Open', refCount: 2, players: ['Alice', 'Bob', 'Carol'], referees },
    { name: 'Expert', refCount: 2, players: ['Alice', 'Bob'], referees }
  ]
  const first = database.listStages(competition.id)[0]
  database.updateStage(first.id, { name: 'Qualifying', attempts: 2, groups })
  const final = database.createStage(competition.id, { name: 'Final', attempts: 2, groups })
  const context = (contestantName = 'Alice', attemptNumber = 1, stageId = first.id) => ({
    sourceKey: competition.id,
    stageId,
    groupName: 'Open',
    contestantName,
    attemptNumber
  })
  const rankings = [],
    updates = [],
    errors = []
  let reads = 0
  let failPersistence = false
  let workerImplementation = async (method, params) =>
    method === 'device.connectMany'
      ? {
          connections: params.connections.map((connection) => ({
            ...connection,
            status: 'connected'
          }))
        }
      : {}
  const service = new MatchSessionService({
    requestWorker: (method, params) => workerImplementation(method, params),
    persistEvent: (input) => {
      if (failPersistence) throw new Error('Disk error')
      return database.appendMatchScoreEvent(input)
    },
    activateContext: (...args) => database.activateMatchSession(...args),
    transitionContext: (...args) => database.transitionMatchSession(...args),
    completeContext: (...args) => database.completeMatchSession(...args),
    invalidateContext: (...args) => database.invalidateMatchSession(...args),
    resetScores: (...args) => database.resetMatchScores(...args),
    getRankingSnapshot: (value) => {
      reads++
      return database.getRankingSnapshot(value)
    },
    emitRankingUpdate: (value) => rankings.push(value),
    emitRefereeUpdate: (value) => updates.push(value),
    onError: (code) => errors.push(code),
    now: () => new Date('2026-11-26T06:00:00Z')
  })
  const input = { ...context(), referees }
  const counter = (
    totalPlus,
    eventId = randomUUID(),
    refereeIndex = 1,
    role = 'primary',
    totalMinus = 0
  ) => ({
    event: 'device.counter',
    eventId,
    payload: {
      connectionId: `match-ref-${refereeIndex}-${role}`,
      eventType: 1,
      deviceTimestampMs: 1,
      totalPlus,
      totalMinus
    }
  })
  return {
    root,
    database,
    service,
    context,
    input,
    final,
    rankings,
    updates,
    errors,
    counter,
    get reads() {
      return reads
    },
    fail() {
      failPersistence = true
    },
    setWorker(implementation) {
      workerImplementation = implementation
    },
    cleanup() {
      service.beginStopping()
      service.completeStop(true)
      database.close()
      rmSync(root, { recursive: true, force: true })
    }
  }
}

test('bursts save every event, coalesce ranking reads and ignore duplicates and failed saves', async () => {
  const f = fixture()
  try {
    await f.service.start(f.input)
    f.rankings.length = 0
    const before = f.reads
    for (let value = 1; value <= 100; value++)
      f.service.handleWorkerEvent(f.counter(value, `event-${value}`))
    f.service.handleWorkerEvent(f.counter(100, 'event-100'))
    assert.equal(f.database.getScoreEvents().length, 100)
    assert.equal(f.rankings.length, 0)
    await delay(55)
    assert.equal(f.reads - before, 1)
    assert.equal(f.rankings.length, 1)
    assert.equal(f.rankings[0].contestants[0].scores[1].total, 100)
    f.fail()
    f.service.handleWorkerEvent(f.counter(101))
    await delay(45)
    assert.equal(f.rankings.length, 1)
    assert.equal(f.database.getScoreEvents().length, 100)
    assert.equal(f.updates.at(-1).score.total, 100)
    assert.equal(f.service.getStatus().persistence, 'error')
  } finally {
    f.cleanup()
  }
})

test('reset, rejudging, switching and invalidation keep persisted standings correct', async () => {
  const f = fixture()
  try {
    await f.service.start(f.input)
    f.service.handleWorkerEvent(f.counter(10))
    await f.service.transitionContext({
      group_name: 'Open',
      contestant_name: 'Bob',
      progress_mode: 'reset',
      binding_version_id: null,
      expected_media_key: null
    })
    assert.deepEqual(
      liveRanking(f.rankings.at(-1)).map((row) => row.name),
      ['Alice']
    )
    f.service.handleWorkerEvent(f.counter(20))
    f.service.handleWorkerEvent(f.counter(4, randomUUID(), 2, 'primary', 3))
    await f.service.reset()
    assert.deepEqual(f.database.getRankingSnapshot(f.context('Bob')).contestants[1].scores[2], {
      total: 0,
      plus: 0,
      minus: 0,
      penalty: 0
    })
    assert.equal(f.database.getReport(f.input.sourceKey).scores.Open.Bob[1].total, 0)
    assert.equal(
      f.database.getCompetitionExportSnapshot(f.input.sourceKey).groups[0].contestants[1]
        .referees[0].currentScore.total,
      0
    )
    assert.equal(
      f.database.getScoreEvents().filter((event) => event.connectionId === 'system:reset').length,
      2
    )
    f.service.handleWorkerEvent(f.counter(5))
    await f.service.transitionContext({
      group_name: 'Open',
      contestant_name: 'Alice',
      progress_mode: 'reset',
      binding_version_id: null,
      expected_media_key: null
    })
    assert.equal(f.rankings.at(-1).contestants[0].scores[1].total, 0)
    assert.equal(f.rankings.at(-1).contestants[1].scores[1].total, 5)
    f.service.invalidateCurrent()
    assert.deepEqual(
      liveRanking(f.rankings.at(-1)).map((row) => row.name),
      ['Bob']
    )
    f.database.close()
    f.database.open()
    assert.equal(f.database.getRankingSnapshot(f.context()).contestants[0].status, 'invalidated')
    assert.equal(f.database.getRankingSnapshot(f.context()).contestants[1].scores[1].total, 5)
  } finally {
    f.cleanup()
  }
})

test('snapshot and event commit atomically, with write order independent of timestamps and UUIDs', async () => {
  const f = fixture()
  let connection
  try {
    await f.service.start(f.input)
    f.service.handleWorkerEvent(f.counter(10, 'z-first'))
    f.service.handleWorkerEvent(f.counter(11, 'a-second'))
    assert.equal(f.service.getRankingSnapshot().contestants[0].scores[1].total, 11)
    connection = new DatabaseSync(f.database.databasePath)
    connection.exec(
      "CREATE TRIGGER fail_snapshot BEFORE UPDATE ON score_snapshots BEGIN SELECT RAISE(ABORT, 'test failure'); END;"
    )
    f.service.handleWorkerEvent(f.counter(12, 'failed'))
    assert.equal(f.database.getScoreEvents().length, 2)
    assert.equal(f.service.getRankingSnapshot().contestants[0].scores[1].total, 11)
    assert.equal(f.updates.at(-1).score.total, 11)
    assert.equal(f.errors.at(-1), 'MATCH_EVENT_PERSIST_FAILED')
    await assert.rejects(f.service.reset(), /test failure/)
    assert.equal(f.database.getScoreEvents().length, 2)
    assert.equal(f.service.getRankingSnapshot().contestants[0].scores[1].total, 11)
    assert.equal(f.updates.at(-1).score.total, 11)
    assert.equal(f.service.getStatus().errorCode, 'MATCH_RESET_PERSIST_FAILED')
  } finally {
    connection?.close()
    f.cleanup()
  }
})

test('rankings isolate stages and attempts even when group and player names repeat', () => {
  const f = fixture()
  try {
    const event = {
      eventId: 'one',
      connectionId: 'c',
      deviceId: 'd',
      role: 'primary',
      eventType: 1,
      deviceTimestampMs: 1,
      receivedAt: '2026-11-26T06:00:00Z',
      systemTime: '2026-11-26T06:00:00Z',
      totalPlus: 10,
      totalMinus: 0,
      currentTotal: 10,
      majorPenalty: 0
    }
    f.database.appendMatchScoreEvent({ ...f.context(), refereeIndex: 1, event })
    f.database.appendMatchScoreEvent({
      ...f.context('Alice', 2),
      refereeIndex: 1,
      event: { ...event, eventId: 'two', totalPlus: 99, currentTotal: 99 }
    })
    f.database.appendMatchScoreEvent({
      ...f.context(),
      groupName: 'Expert',
      refereeIndex: 1,
      event: { ...event, eventId: 'expert', totalPlus: 500, currentTotal: 500 }
    })
    assert.equal(f.database.getRankingSnapshot(f.context()).contestants[0].scores[1].total, 10)
    assert.equal(
      f.database.getRankingSnapshot(f.context('Alice', 2)).contestants[0].scores[1].total,
      99
    )
    assert.deepEqual(
      liveRanking(f.database.getRankingSnapshot(f.context('Alice', 1, f.final.id))),
      []
    )
    assert.equal(
      f.database.getRankingSnapshot({ ...f.context(), sourceKey: 'other-project' }),
      null
    )
  } finally {
    f.cleanup()
  }
})

test('events received during device connection survive session activation', async () => {
  const f = fixture()
  try {
    f.setWorker(async (method, params) => {
      if (method === 'device.connectMany') {
        f.service.handleWorkerEvent(f.counter(1, 'first-click'))
        return {
          connections: params.connections.map((connection) => ({
            ...connection,
            status: 'connected'
          }))
        }
      }
      return {}
    })
    await f.service.start(f.input)
    assert.equal(f.rankings.at(-1).contestants[0].scores[1].total, 1)
    assert.equal(f.updates.filter((update) => update.index === 1).at(-1).score.total, 1)
    assert.equal(f.database.getScoreEvents().length, 1)
  } finally {
    f.cleanup()
  }
})

test('ranking read failures clear the stale board and context flush cancels pending bursts', async () => {
  let fail = false,
    value = 1
  const emissions = [],
    errors = []
  const publisher = new MatchRankingPublisher(
    () => {
      if (fail) throw new Error('read')
      return value
    },
    (snapshot) => emissions.push(snapshot),
    (error) => errors.push(error)
  )
  publisher.schedule()
  value = 2
  publisher.flush()
  await delay(45)
  assert.deepEqual(emissions, [2])
  fail = true
  publisher.flush()
  assert.equal(emissions.at(-1), null)
  assert.equal(errors.length, 1)
})
