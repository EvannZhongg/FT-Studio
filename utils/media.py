import re
import threading
import time
from dataclasses import asdict, dataclass
from typing import Optional
from urllib.parse import parse_qs, urlparse


YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
YOUTUBE_HOSTS = {
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
}
PLAYBACK_STATES = {"playing", "paused", "buffering", "cued", "ended"}


def normalize_youtube_url(value: str) -> dict:
  raw = (value or "").strip()
  if not raw:
    raise ValueError("YouTube URL is required")

  if "://" not in raw:
    raw = "https://" + raw

  parsed = urlparse(raw)
  host = (parsed.hostname or "").lower()
  video_id = None

  if host == "youtu.be":
    video_id = parsed.path.strip("/").split("/")[0]
  elif host in YOUTUBE_HOSTS:
    parts = [part for part in parsed.path.split("/") if part]
    if parsed.path.rstrip("/") == "/watch":
      video_id = parse_qs(parsed.query).get("v", [None])[0]
    elif len(parts) >= 2 and parts[0] in {"shorts", "embed", "live"}:
      video_id = parts[1]
  else:
    raise ValueError("Only youtube.com and youtu.be links are supported")

  if not video_id or not YOUTUBE_ID_RE.fullmatch(video_id):
    raise ValueError("Invalid YouTube video link")

  return {
    "provider": "youtube",
    "video_id": video_id,
    "canonical_url": f"https://www.youtube.com/watch?v={video_id}",
  }


@dataclass(frozen=True)
class MediaCapture:
  provider: str = ""
  video_id: str = ""
  video_time_ms: Optional[int] = None
  sync_status: str = "not_ready"

  def to_dict(self):
    return asdict(self)


@dataclass(frozen=True)
class PlaybackAnchor:
  group: str
  contestant: str
  video_id: str
  video_time_ms: int
  state: str
  playback_rate: float
  received_monotonic: float


class PlaybackAnchorStore:
  def __init__(self, max_age_seconds: float = 0.5, clock=time.monotonic):
    self.max_age_seconds = max_age_seconds
    self._clock = clock
    self._lock = threading.Lock()
    self._anchor: Optional[PlaybackAnchor] = None

  def update(self, data: dict, received_monotonic: Optional[float] = None) -> PlaybackAnchor:
    group = str(data.get("group") or "").strip()
    contestant = str(data.get("contestant") or "").strip()
    video_id = str(data.get("video_id") or "").strip()
    state = str(data.get("state") or "").strip().lower()

    if not group or not contestant:
      raise ValueError("Playback context is required")
    if not YOUTUBE_ID_RE.fullmatch(video_id):
      raise ValueError("Invalid YouTube video id")
    if state not in PLAYBACK_STATES:
      raise ValueError("Player is not ready")

    try:
      video_time_ms = max(0, int(round(float(data.get("video_time_ms")))))
      playback_rate = float(data.get("playback_rate", 1))
    except (TypeError, ValueError) as exc:
      raise ValueError("Invalid playback position") from exc

    if playback_rate <= 0 or playback_rate > 4:
      raise ValueError("Invalid playback rate")

    anchor = PlaybackAnchor(
      group=group,
      contestant=contestant,
      video_id=video_id,
      video_time_ms=video_time_ms,
      state=state,
      playback_rate=playback_rate,
      received_monotonic=self._clock() if received_monotonic is None else received_monotonic,
    )
    with self._lock:
      self._anchor = anchor
    return anchor

  def clear(self):
    with self._lock:
      self._anchor = None

  def capture(self, group: str, contestant: str, at_monotonic: Optional[float] = None) -> MediaCapture:
    with self._lock:
      anchor = self._anchor

    if anchor is None:
      return MediaCapture()
    if anchor.group != group or anchor.contestant != contestant:
      return MediaCapture(provider="youtube", video_id=anchor.video_id, sync_status="context_mismatch")

    now = self._clock() if at_monotonic is None else at_monotonic
    age = max(0.0, now - anchor.received_monotonic)
    if age > self.max_age_seconds:
      return MediaCapture(provider="youtube", video_id=anchor.video_id, sync_status="stale")

    video_time_ms = anchor.video_time_ms
    if anchor.state == "playing":
      video_time_ms += round(age * 1000 * anchor.playback_rate)

    return MediaCapture(
      provider="youtube",
      video_id=anchor.video_id,
      video_time_ms=max(0, video_time_ms),
      sync_status="aligned",
    )


playback_anchors = PlaybackAnchorStore()
