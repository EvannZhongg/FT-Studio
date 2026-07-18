import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('keeps domain IPC registration out of the Main composition root', () => {
  const main = source('src/main/index.js')
  for (const domain of ['settings', 'match', 'replay', 'reports', 'projects', 'exports']) {
    assert.equal(main.includes(`ipcMain.handle(IPC_CHANNELS.${domain}`), false, domain)
  }
  for (const registration of [
    'registerSettingsIpc',
    'registerCompetitionIpc',
    'registerMatchIpc',
    'registerQueryIpc',
    'registerExportIpc'
  ]) {
    assert.equal(main.includes(`${registration}(`), true, registration)
  }
})

test('keeps SQLite schema and connection lifecycle outside the repository facade', () => {
  const facade = source('src/main/persistence/local-database.mts')
  const connection = source('src/main/persistence/sqlite/connection.mts')
  const schema = source('src/main/persistence/sqlite/schema.mts')
  for (const implementation of ['CREATE TABLE', 'copyFileSync', 'new DatabaseSync']) {
    assert.equal(facade.includes(implementation), false, implementation)
  }
  assert.equal(connection.includes('new DatabaseSync'), true)
  assert.equal(connection.includes('createResetBackup'), true)
  assert.equal(schema.includes('CREATE TABLE competitions'), true)
})

test('delegates settings persistence to its repository', () => {
  const facade = source('src/main/persistence/local-database.mts')
  const repository = source('src/main/persistence/repositories/settings-repository.mts')
  assert.equal(facade.includes('FROM app_settings'), false)
  assert.equal(facade.includes('new SettingsRepository'), true)
  assert.equal(repository.includes('FROM app_settings'), true)
  assert.equal(repository.includes('SETTINGS_KEY_INVALID'), true)
})
