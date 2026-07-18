import { normalizeYouTubeUrl, type YouTubeMediaBinding } from '../../shared/media/youtube.mts'
import { MatchSessionError } from './match-session-error.mts'

export type MatchMediaStatus = 'not_ready' | 'aligned' | 'stale' | 'context_mismatch'

export interface MatchMediaContext {
  sourceKey: string
  stageId: string
  groupName: string
  contestantName: string
}

export interface MatchMediaCapture {
  provider: string
  mediaId: string
  mediaTimeMs: number | null
  status: MatchMediaStatus
}

interface PlaybackAnchor {
  groupName: string
  contestantName: string
  videoId: string
  videoTimeMs: number
  state: 'playing' | 'paused' | 'buffering' | 'cued' | 'ended'
  playbackRate: number
  receivedAtMs: number
}

interface MatchMediaSessionDependencies {
  upsertMediaBinding?: (
    sourceKey: string,
    stageId: string,
    groupName: string,
    contestantName: string,
    binding: { provider: string; mediaId: string; canonicalUrl: string }
  ) => boolean
  monotonicNow?: () => number
}

export class MatchMediaSession {
  private readonly dependencies: MatchMediaSessionDependencies
  private playbackAnchor: PlaybackAnchor | null = null

  constructor(dependencies: MatchMediaSessionDependencies = {}) {
    this.dependencies = dependencies
  }

  reset(): void {
    this.playbackAnchor = null
  }

  updatePlayback(value: Record<string, unknown>, context: MatchMediaContext): MatchMediaStatus {
    const groupName = stringValue(value.group)
    const contestantName = stringValue(value.contestant)
    const videoId = stringValue(value.video_id)
    const state = stringValue(value.state)
    const videoTimeMs = Number(value.video_time_ms)
    const playbackRate = Number(value.playback_rate ?? 1)
    if (
      !groupName ||
      !contestantName ||
      !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
      !['playing', 'paused', 'buffering', 'cued', 'ended'].includes(state) ||
      !Number.isFinite(videoTimeMs) ||
      videoTimeMs < 0 ||
      !Number.isFinite(playbackRate) ||
      playbackRate <= 0 ||
      playbackRate > 4
    ) {
      throw new MatchSessionError('MATCH_PLAYBACK_INVALID', 'Playback anchor is invalid')
    }
    this.playbackAnchor = {
      groupName,
      contestantName,
      videoId,
      videoTimeMs: Math.round(videoTimeMs),
      state: state as PlaybackAnchor['state'],
      playbackRate,
      receivedAtMs: this.monotonicNow()
    }
    return this.capture(context).status
  }

  setMediaBinding(
    context: MatchMediaContext,
    groupName: string,
    contestantName: string,
    url: string
  ): YouTubeMediaBinding {
    if (!groupName || !contestantName) {
      throw new MatchSessionError('MATCH_MEDIA_INVALID', 'Media binding is invalid')
    }
    let binding: YouTubeMediaBinding
    try {
      binding = normalizeYouTubeUrl(url)
    } catch (error) {
      throw new MatchSessionError(
        stableErrorCode(error, 'MATCH_MEDIA_INVALID'),
        'Media binding is invalid'
      )
    }
    const saved =
      this.dependencies.upsertMediaBinding?.(
        context.sourceKey,
        context.stageId,
        groupName,
        contestantName,
        {
          provider: binding.provider,
          mediaId: binding.video_id,
          canonicalUrl: binding.canonical_url
        }
      ) ?? false
    if (!saved) {
      throw new MatchSessionError('MATCH_MEDIA_CONTEXT_NOT_FOUND', 'Media context was not found')
    }
    return binding
  }

  capture(context: MatchMediaContext): MatchMediaCapture {
    const anchor = this.playbackAnchor
    if (!anchor) return { provider: '', mediaId: '', mediaTimeMs: null, status: 'not_ready' }
    if (
      anchor.groupName !== context.groupName ||
      anchor.contestantName !== context.contestantName
    ) {
      return {
        provider: 'youtube',
        mediaId: anchor.videoId,
        mediaTimeMs: null,
        status: 'context_mismatch'
      }
    }
    const ageMs = Math.max(0, this.monotonicNow() - anchor.receivedAtMs)
    if (ageMs > 500) {
      return { provider: 'youtube', mediaId: anchor.videoId, mediaTimeMs: null, status: 'stale' }
    }
    const advanced = anchor.state === 'playing' ? ageMs * anchor.playbackRate : 0
    return {
      provider: 'youtube',
      mediaId: anchor.videoId,
      mediaTimeMs: Math.max(0, Math.round(anchor.videoTimeMs + advanced)),
      status: 'aligned'
    }
  }

  private monotonicNow(): number {
    return (this.dependencies.monotonicNow ?? (() => performance.now()))()
  }
}

function stableErrorCode(error: unknown, fallback: string): string {
  return isRecord(error) && typeof error.code === 'string' && error.code ? error.code : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
