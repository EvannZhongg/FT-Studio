import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateMainWindowLayout } from '../src/main/app/window-layout.mts'

test('uses the target desktop ratios and centers the main window', () => {
  const layout = calculateMainWindowLayout({ x: 0, y: 0, width: 1920, height: 1040 })
  assert.deepEqual(layout, {
    x: 264,
    y: 106,
    width: 1392,
    height: 829,
    minWidth: 960,
    minHeight: 600
  })
  assert.ok(layout.width / layout.height >= 1.55)
  assert.ok(layout.width / layout.height <= 1.68)
})

test('keeps minimum content size on a 1366 desktop', () => {
  const layout = calculateMainWindowLayout({ x: 0, y: 0, width: 1366, height: 728 })
  assert.deepEqual(layout, {
    x: 188,
    y: 64,
    width: 990,
    height: 600,
    minWidth: 960,
    minHeight: 600
  })
})

test('constrains the aspect ratio on a 2560 desktop', () => {
  const layout = calculateMainWindowLayout({ x: 0, y: 0, width: 2560, height: 1400 })
  assert.deepEqual(layout, {
    x: 352,
    y: 148,
    width: 1856,
    height: 1105,
    minWidth: 960,
    minHeight: 600
  })
  assert.ok(layout.width / layout.height <= 1.68)
})

test('preserves the work area margin before desktop minimums', () => {
  const layout = calculateMainWindowLayout({ x: -800, y: 40, width: 800, height: 500 })
  assert.deepEqual(layout, {
    x: -776,
    y: 64,
    width: 752,
    height: 452,
    minWidth: 752,
    minHeight: 452
  })
})

test('rejects invalid display work areas', () => {
  assert.throws(
    () => calculateMainWindowLayout({ x: 0, y: 0, width: 0, height: 1080 }),
    /WINDOW_WORK_AREA_INVALID/
  )
})
