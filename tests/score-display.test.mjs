import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createScoreDisplayModel } from '../src/renderer/src/features/scoring/scoreDisplay.mjs'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('shares total, split and combined score rendering across player and OBS surfaces', () => {
  const display = source('src/renderer/src/components/RefereeScoreDisplay.vue')
  const compactPanel = source('src/renderer/src/components/ScoreOverlayPanel.vue')
  const obsOverlay = source('src/renderer/src/components/OverlayView.vue')

  for (const mode of ['TOTAL', 'SPLIT', 'COMBINED']) {
    assert.equal(display.includes(`'${mode}'`), true, mode)
  }
  assert.equal(display.includes('createScoreDisplayModel'), true)
  assert.equal(
    compactPanel.includes("import RefereeScoreDisplay from './RefereeScoreDisplay.vue'"),
    true
  )
  assert.equal(
    obsOverlay.includes("import RefereeScoreDisplay from './RefereeScoreDisplay.vue'"),
    true
  )
  assert.equal(compactPanel.includes('<RefereeScoreDisplay'), true)
  assert.equal(obsOverlay.includes('<RefereeScoreDisplay'), true)
  assert.equal(obsOverlay.includes("config.displayMode === 'REALTIME'"), true)
})

test('normalizes shared score display modes, values and scale bounds', () => {
  assert.deepEqual(
    createScoreDisplayModel(
      { mode: 'DUAL', total: 12, plus: 15, minus: 3, penalty: 2 },
      'SPLIT',
      9
    ),
    {
      mode: 'SPLIT',
      scale: 2.4,
      score: { total: 12, plus: 15, minus: 3, penalty: 2 },
      hasPenalty: true
    }
  )
  assert.deepEqual(createScoreDisplayModel({ mode: 'SINGLE' }, 'UNKNOWN', 0).score, {
    total: 0,
    plus: 0,
    minus: 0,
    penalty: 0
  })
  assert.equal(createScoreDisplayModel({}, 'UNKNOWN', 0).mode, 'COMBINED')
  assert.equal(createScoreDisplayModel({}, 'TOTAL', 0).scale, 0.6)
})
