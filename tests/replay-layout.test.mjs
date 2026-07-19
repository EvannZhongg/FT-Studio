import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const replay = readFileSync(
  new URL('../src/renderer/src/components/ReplayView.vue', import.meta.url),
  'utf8'
)

test('keeps replay controls in an overlay drawer without resizing the player', () => {
  const sidebarStart = replay.indexOf('<aside')
  const sidebar = replay.slice(sidebarStart, replay.indexOf('</aside>', sidebarStart))
  const main = replay.match(/<main class="replay-main">([\s\S]*?)<\/main>/)?.[1] || ''

  assert.match(sidebar, /replay_referee[\s\S]*class="timeline"/)
  assert.doesNotMatch(main, /class="timeline"/)
  assert.match(replay, /\.replay-main\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0/)
  assert.match(replay, /\.replay-sidebar\s*\{[^}]*position:\s*absolute/)
  assert.match(replay, /\.replay-sidebar\.open\s*\{[^}]*translateX\(0\)/)
  assert.match(replay, /class="replay-sidebar-rail"/)
  assert.match(replay, /@mouseenter="sidebarOpen = true"/)
  assert.match(replay, /@mouseleave="sidebarOpen = false"/)
  assert.doesNotMatch(replay, /replay-sidebar-toggle/)
  assert.match(replay, /replay_choose_project_action/)
})
