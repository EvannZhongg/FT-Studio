import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('dialogs constrain content without horizontal scrolling', () => {
  const shell = readFileSync(
    new URL('../src/renderer/src/components/DialogShell.vue', import.meta.url),
    'utf8'
  )
  const scoreBoard = readFileSync(
    new URL('../src/renderer/src/components/ScoreBoard.vue', import.meta.url),
    'utf8'
  )

  assert.match(shell, /\.dialog-shell-surface\s*\{[^}]*overflow-x:\s*hidden;/s)
  assert.match(shell, /\.dialog-shell-surface\s*\{[^}]*overflow-y:\s*auto;/s)
  assert.match(scoreBoard, /\.modal-content\s*\{[^}]*width:\s*100%;/s)
  assert.match(scoreBoard, /\.media-switch-dialog\s*\{[^}]*max-width:\s*520px;/s)
  assert.doesNotMatch(
    scoreBoard,
    /\.media-switch-dialog\s*\{[^}]*width:\s*min\(520px,\s*calc\(100vw\s*-\s*48px\)\)/s
  )
})
