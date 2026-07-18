import unittest

from utils.media import PlaybackAnchorStore, normalize_youtube_url


class YouTubeUrlTests(unittest.TestCase):
  def test_normalizes_supported_urls(self):
    video_id = "dQw4w9WgXcQ"
    urls = [
      f"https://www.youtube.com/watch?v={video_id}&t=12",
      f"https://youtu.be/{video_id}?si=demo",
      f"https://youtube.com/shorts/{video_id}",
      f"https://m.youtube.com/embed/{video_id}",
      f"youtube.com/live/{video_id}",
    ]
    for url in urls:
      with self.subTest(url=url):
        self.assertEqual(normalize_youtube_url(url), {
          "provider": "youtube",
          "video_id": video_id,
          "canonical_url": f"https://www.youtube.com/watch?v={video_id}",
        })

  def test_rejects_invalid_hosts_and_ids(self):
    invalid = [
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=short",
      "https://youtube.com/channel/dQw4w9WgXcQ",
    ]
    for url in invalid:
      with self.subTest(url=url), self.assertRaises(ValueError):
        normalize_youtube_url(url)


class PlaybackAnchorTests(unittest.TestCase):
  def setUp(self):
    self.now = 10.0
    self.store = PlaybackAnchorStore(clock=lambda: self.now)
    self.base = {
      "group": "Open",
      "contestant": "Alice",
      "video_id": "dQw4w9WgXcQ",
      "video_time_ms": 12000,
      "state": "playing",
      "playback_rate": 1,
    }

  def test_playing_anchor_advances_at_playback_rate(self):
    self.base["playback_rate"] = 2
    self.store.update(self.base)
    self.now = 10.2
    capture = self.store.capture("Open", "Alice")
    self.assertEqual(capture.sync_status, "aligned")
    self.assertEqual(capture.video_time_ms, 12400)

  def test_paused_and_buffering_anchors_do_not_advance(self):
    for state in ("paused", "buffering", "cued", "ended"):
      with self.subTest(state=state):
        self.now = 10.0
        self.base["state"] = state
        self.store.update(self.base)
        self.now = 10.3
        self.assertEqual(self.store.capture("Open", "Alice").video_time_ms, 12000)

  def test_stale_and_context_mismatch_are_not_aligned(self):
    self.store.update(self.base)
    self.now = 10.501
    stale = self.store.capture("Open", "Alice")
    self.assertEqual(stale.sync_status, "stale")
    self.assertIsNone(stale.video_time_ms)

    mismatch = self.store.capture("Open", "Bob", at_monotonic=10.1)
    self.assertEqual(mismatch.sync_status, "context_mismatch")
    self.assertIsNone(mismatch.video_time_ms)

  def test_unready_state_is_rejected(self):
    self.base["state"] = "not_ready"
    with self.assertRaises(ValueError):
      self.store.update(self.base)


if __name__ == "__main__":
  unittest.main()
