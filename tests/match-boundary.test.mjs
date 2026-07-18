import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('exposes session completion and invalidation through typed IPC', () => {
  const contract = source('src/shared/ipc-contract.ts')
  const preload = source('src/preload/index.ts')
  const registration = source('src/main/ipc/register-matches.mts')
  const store = source('src/renderer/src/stores/refereeStore.js')
  const app = source('src/renderer/src/App.vue')
  const scoreboard = source('src/renderer/src/components/ScoreBoard.vue')

  assert.equal(contract.includes("invalidate: 'match:invalidate'"), true)
  assert.equal(preload.includes('IPC_CHANNELS.match.invalidate'), true)
  assert.equal(registration.includes('matchSession.completeCurrent()'), true)
  assert.equal(registration.includes('matchSession.invalidateCurrent()'), true)
  assert.equal(store.includes('result.sessionFinalized !== false'), true)
  assert.equal(store.includes('async invalidateMatch()'), true)
  assert.equal(store.includes("this.finalizeMatch('invalidate')"), true)
  assert.equal(app.includes('@invalidate="handleInvalidateMatch"'), true)
  assert.equal(scoreboard.includes("emit('invalidate')"), true)
  assert.equal(scoreboard.includes('showInvalidateDialog'), true)
})
