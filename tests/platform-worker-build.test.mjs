import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('macOS Worker build keeps standard streams for the JSONL protocol', () => {
  const script = readFileSync(new URL('../scripts/build-worker-mac.sh', import.meta.url), 'utf8')

  assert.match(script, /PyInstaller --console --onedir/)
  assert.doesNotMatch(script, /PyInstaller --noconsole/)
})
