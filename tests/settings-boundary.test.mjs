import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('keeps Renderer settings off the legacy backend', () => {
  const store = readFileSync(
    new URL('../src/renderer/src/stores/refereeStore.js', import.meta.url),
    'utf8'
  )
  assert.equal(store.includes('/api/settings'), false)
  assert.match(store, /ftEngine\.settings\.get/)
  assert.match(store, /ftEngine\.settings\.set/)
})
