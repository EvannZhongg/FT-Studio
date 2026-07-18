import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { LATEST_SCHEMA_VERSION, LocalDatabase } from '../src/main/persistence/local-database.mts'


const tempRoots = []

function createDatabase() {
  const root = path.join(tmpdir(), `ft-engine-db-${randomUUID()}`)
  const databasePath = path.join(root, 'ft-engine.db')
  const backupRoot = path.join(root, 'backups')
  tempRoots.push(root)
  return { root, databasePath, backupRoot, database: new LocalDatabase(databasePath, backupRoot) }
}

test.afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

test('creates the versioned local schema', () => {
  const { database } = createDatabase()
  database.open()
  try {
    assert.equal(database.getSchemaVersion(), LATEST_SCHEMA_VERSION)
    const tables = database.listTableNames()
    for (const table of [
      'competitions', 'stages', 'competition_groups', 'contestants', 'referees',
      'device_bindings', 'match_sessions', 'score_events', 'media_bindings',
      'app_settings', 'share_drafts', 'upload_tasks', 'legacy_imports'
    ]) {
      assert.ok(tables.includes(table), `missing table: ${table}`)
    }
  } finally {
    database.close()
  }
})

test('backs up an existing database before migration', () => {
  const { root, databasePath, backupRoot, database } = createDatabase()
  mkdirSync(root, { recursive: true })
  const legacy = new DatabaseSync(databasePath)
  legacy.exec('CREATE TABLE legacy_marker (value TEXT); PRAGMA user_version = 0;')
  legacy.close()

  database.open()
  database.close()
  const backups = readdirSync(backupRoot)
  assert.equal(backups.length, 1)
  assert.match(backups[0], /^ft-engine-v0-/)
  assert.ok(existsSync(path.join(backupRoot, backups[0])))
})

test('appends immutable score events idempotently', () => {
  const { database } = createDatabase()
  database.open()
  const event = {
    eventId: 'event-1',
    connectionId: 'judge-1-primary',
    deviceId: 'device-1',
    role: 'primary',
    eventType: 1,
    deviceTimestampMs: 100,
    receivedAt: '2026-07-18T08:00:00.100Z',
    systemTime: '2026-07-18T08:00:00.100Z',
    totalPlus: 1,
    totalMinus: 0,
    currentTotal: 1,
    majorPenalty: 0
  }
  try {
    assert.equal(database.appendScoreEvent(event), true)
    assert.equal(database.appendScoreEvent({ ...event, currentTotal: 99 }), false)
    assert.deepEqual(database.getScoreEvents(), [event])
  } finally {
    database.close()
  }
})

test('rejects invalid events before writing', () => {
  const { database } = createDatabase()
  database.open()
  try {
    assert.throws(() => database.appendScoreEvent({ eventId: 'invalid' }), /Invalid score event/)
    assert.deepEqual(database.getScoreEvents(), [])
  } finally {
    database.close()
  }
})
