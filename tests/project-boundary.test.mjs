import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('routes the project lifecycle through typed IPC', () => {
  const store = readFileSync(
    new URL('../src/renderer/src/stores/refereeStore.js', import.meta.url),
    'utf8'
  )
  for (const method of ['create', 'update', 'get', 'list', 'delete']) {
    assert.equal(store.includes(`ftEngine.projects.${method}`), true, method)
  }
})
