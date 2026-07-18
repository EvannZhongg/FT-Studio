import assert from 'node:assert/strict'
import test from 'node:test'

import { MatchMediaSession } from '../src/main/match/media-session.mts'

const context = {
  sourceKey: 'competition-1',
  stageId: 'stage-1',
  groupName: 'Final',
  contestantName: 'Alice'
}

test('captures aligned, mismatched and stale playback without session state', () => {
  let now = 1000
  const media = new MatchMediaSession({ monotonicNow: () => now })

  assert.equal(media.capture(context).status, 'not_ready')
  assert.equal(
    media.updatePlayback(
      {
        group: 'Final',
        contestant: 'Alice',
        video_id: 'dQw4w9WgXcQ',
        video_time_ms: 4500,
        state: 'playing',
        playback_rate: 1
      },
      context
    ),
    'aligned'
  )

  now = 1200
  assert.deepEqual(media.capture(context), {
    provider: 'youtube',
    mediaId: 'dQw4w9WgXcQ',
    mediaTimeMs: 4700,
    status: 'aligned'
  })
  assert.equal(media.capture({ ...context, contestantName: 'Bob' }).status, 'context_mismatch')

  now = 1600
  assert.equal(media.capture(context).status, 'stale')
  media.reset()
  assert.equal(media.capture(context).status, 'not_ready')
})

test('validates and persists stage-scoped media bindings', () => {
  const writes = []
  const media = new MatchMediaSession({
    upsertMediaBinding: (...args) => {
      writes.push(args)
      return true
    }
  })

  assert.deepEqual(
    media.setMediaBinding(context, 'Final', 'Alice', 'https://youtu.be/dQw4w9WgXcQ?si=test'),
    {
      provider: 'youtube',
      video_id: 'dQw4w9WgXcQ',
      canonical_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    }
  )
  assert.deepEqual(writes[0], [
    context.sourceKey,
    context.stageId,
    'Final',
    'Alice',
    {
      provider: 'youtube',
      mediaId: 'dQw4w9WgXcQ',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    }
  ])
  assert.throws(() => media.setMediaBinding(context, 'Final', 'Alice', 'http://example.com'), {
    code: 'MATCH_MEDIA_INVALID'
  })

  const missing = new MatchMediaSession({ upsertMediaBinding: () => false })
  assert.throws(
    () => missing.setMediaBinding(context, 'Final', 'Alice', 'https://youtu.be/dQw4w9WgXcQ'),
    { code: 'MATCH_MEDIA_CONTEXT_NOT_FOUND' }
  )
})
