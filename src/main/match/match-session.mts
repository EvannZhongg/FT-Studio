import {
  applyDeviceCounterEvent,
  createRefereeScoringState,
  resetRefereeScoringState,
  type DeviceRole,
  type RefereeMode,
  type RefereeScoringState
} from '../domain/scoring.mts'
import type {
  LegacyEventContext,
  StoredScoreEvent
} from '../persistence/local-database.mts'


export interface MatchRefereeBinding {
  index: number
  name: string
  mode: RefereeMode
  primaryDeviceId: string | null
  secondaryDeviceId: string | null
}

export interface MatchStartInput {
  sourceKey: string
  groupName: string
  contestantName: string
  referees: MatchRefereeBinding[]
}

export interface MatchRefereeUpdate {
  index: number
  name: string
  mode: RefereeMode
  score: { total: number; plus: number; minus: number; penalty: number }
  status: { pri: string; sec: string }
}

interface WorkerEventMessage {
  event?: string
  eventId?: string
  payload?: Record<string, unknown>
}

interface RefereeRuntime {
  index: number
  name: string
  mode: RefereeMode
  scoring: RefereeScoringState
  status: { pri: string; sec: string }
}

interface ConnectionRuntime {
  refereeIndex: number
  role: DeviceRole
  deviceId: string
}

interface MatchSessionDependencies {
  requestWorker: (method: string, params?: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>
  appendEvent: (event: StoredScoreEvent) => boolean
  ensureEventContext: (
    sourceKey: string,
    groupName: string,
    contestantName: string,
    refereeIndex: number,
    refereeName: string,
    refereeMode: RefereeMode
  ) => LegacyEventContext | null
  emitRefereeUpdate: (update: MatchRefereeUpdate) => void
  emitContextUpdate?: (context: { groupName: string; contestantName: string }) => void
  upsertMediaBinding?: (
    sourceKey: string,
    groupName: string,
    contestantName: string,
    binding: { provider: string; mediaId: string; canonicalUrl: string }
  ) => boolean
  onPersistenceError?: (code: string) => void
  now?: () => Date
  monotonicNow?: () => number
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

export class MatchSessionError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export class MatchSessionService {
  private readonly dependencies: MatchSessionDependencies
  private readonly referees = new Map<number, RefereeRuntime>()
  private readonly connections = new Map<string, ConnectionRuntime>()
  private active = false
  private sourceKey = ''
  private groupName = ''
  private contestantName = ''
  private playbackAnchor: PlaybackAnchor | null = null

  constructor(dependencies: MatchSessionDependencies) {
    this.dependencies = dependencies
  }

  async start(input: MatchStartInput): Promise<{ connections: unknown[] }> {
    const normalized = validateStartInput(input)
    await this.dependencies.requestWorker('device.disconnectAll')
    this.referees.clear()
    this.connections.clear()
    this.sourceKey = normalized.sourceKey
    this.groupName = normalized.groupName
    this.contestantName = normalized.contestantName
    this.active = true

    const requests: Array<{ connectionId: string; deviceId: string }> = []
    for (const binding of normalized.referees) {
      const runtime: RefereeRuntime = {
        index: binding.index,
        name: binding.name,
        mode: binding.mode,
        scoring: createRefereeScoringState(binding.mode),
        status: {
          pri: binding.primaryDeviceId ? 'connecting' : 'n/a',
          sec: binding.mode === 'DUAL' && binding.secondaryDeviceId ? 'connecting' : 'n/a'
        }
      }
      this.referees.set(binding.index, runtime)
      this.addConnection(requests, binding.index, 'primary', binding.primaryDeviceId)
      if (binding.mode === 'DUAL') {
        this.addConnection(requests, binding.index, 'secondary', binding.secondaryDeviceId)
      }
      this.emit(runtime)
    }

    if (requests.length === 0) return { connections: [] }
    return this.connectConfigured(requests, true)
  }

  isActive(): boolean {
    return this.active
  }

  markWorkerUnavailable(): void {
    if (!this.active) return
    for (const runtime of this.referees.values()) {
      if (runtime.status.pri !== 'n/a') runtime.status.pri = 'error'
      if (runtime.status.sec !== 'n/a') runtime.status.sec = 'error'
      this.emit(runtime)
    }
  }

  async reconnectWorker(): Promise<{ connections: unknown[] }> {
    if (!this.active) return { connections: [] }
    const requests = [...this.connections].map(([connectionId, value]) => ({
      connectionId,
      deviceId: value.deviceId
    }))
    for (const runtime of this.referees.values()) {
      if (runtime.status.pri !== 'n/a') runtime.status.pri = 'connecting'
      if (runtime.status.sec !== 'n/a') runtime.status.sec = 'connecting'
      this.emit(runtime)
    }
    return this.connectConfigured(requests, false)
  }

  private async connectConfigured(
    requests: Array<{ connectionId: string; deviceId: string }>,
    deactivateOnFailure: boolean
  ): Promise<{ connections: unknown[] }> {
    try {
      const result = await this.dependencies.requestWorker(
        'device.connectMany',
        { connections: requests },
        30000
      ) as { connections?: unknown[] }
      for (const value of result.connections ?? []) this.applyConnectionResult(value)
      return { connections: result.connections ?? [] }
    } catch (error) {
      if (deactivateOnFailure) this.active = false
      for (const runtime of this.referees.values()) {
        if (runtime.status.pri === 'connecting') runtime.status.pri = 'error'
        if (runtime.status.sec === 'connecting') runtime.status.sec = 'error'
        this.emit(runtime)
      }
      throw error
    }
  }

  setContext(groupName: string, contestantName: string): void {
    if (typeof groupName !== 'string' || !groupName || groupName.length > 256) {
      throw new MatchSessionError('MATCH_CONTEXT_INVALID', 'groupName is required')
    }
    if (typeof contestantName !== 'string' || !contestantName || contestantName.length > 256) {
      throw new MatchSessionError('MATCH_CONTEXT_INVALID', 'contestantName is required')
    }
    this.groupName = groupName
    this.contestantName = contestantName
    this.dependencies.emitContextUpdate?.({ groupName, contestantName })
  }

  async reset(): Promise<unknown> {
    if (!this.active) throw new MatchSessionError('MATCH_NOT_ACTIVE', 'Match is not active')
    const result = await this.dependencies.requestWorker('device.resetAll', {}, 10000)
    for (const runtime of this.referees.values()) {
      runtime.scoring = resetRefereeScoringState(runtime.scoring)
      this.emit(runtime)
    }
    return result
  }

  updatePlayback(value: Record<string, unknown>): void {
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
  }

  setMediaBinding(
    groupName: string,
    contestantName: string,
    binding: { provider: string; mediaId: string; canonicalUrl: string }
  ): boolean {
    if (
      !groupName ||
      !contestantName ||
      binding?.provider !== 'youtube' ||
      !/^[A-Za-z0-9_-]{11}$/.test(binding.mediaId) ||
      typeof binding.canonicalUrl !== 'string' ||
      binding.canonicalUrl.length > 2048
    ) {
      throw new MatchSessionError('MATCH_MEDIA_INVALID', 'Media binding is invalid')
    }
    return this.dependencies.upsertMediaBinding?.(
      this.sourceKey,
      groupName,
      contestantName,
      binding
    ) ?? false
  }

  handleWorkerEvent(message: WorkerEventMessage): void {
    if (!this.active || !message.payload) return
    const connectionId = stringValue(message.payload.connectionId)
    const connection = this.connections.get(connectionId)
    if (!connection) return
    const runtime = this.referees.get(connection.refereeIndex)
    if (!runtime) return

    if (message.event === 'device.status') {
      const status = stringValue(message.payload.status)
      runtime.status[connection.role === 'primary' ? 'pri' : 'sec'] = status || 'error'
      this.emit(runtime)
      return
    }
    if (message.event !== 'device.counter' || typeof message.eventId !== 'string') return

    const next = applyDeviceCounterEvent(runtime.scoring, {
      eventId: message.eventId,
      role: connection.role,
      eventType: integerValue(message.payload.eventType),
      totalPlus: integerValue(message.payload.totalPlus),
      totalMinus: integerValue(message.payload.totalMinus),
      deviceTimestampMs: integerValue(message.payload.deviceTimestampMs)
    })
    if (next === runtime.scoring) return
    runtime.scoring = next
    this.persistEvent(runtime, connectionId, connection, message)
    this.emit(runtime)
  }

  finish(): void {
    this.active = false
    this.connections.clear()
    this.referees.clear()
    this.playbackAnchor = null
  }

  private addConnection(
    requests: Array<{ connectionId: string; deviceId: string }>,
    refereeIndex: number,
    role: DeviceRole,
    deviceId: string | null
  ): void {
    if (!deviceId) return
    const connectionId = `match-ref-${refereeIndex}-${role}`
    this.connections.set(connectionId, { refereeIndex, role, deviceId })
    requests.push({ connectionId, deviceId })
  }

  private applyConnectionResult(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const record = value as Record<string, unknown>
    const connection = this.connections.get(stringValue(record.connectionId))
    if (!connection) return
    const runtime = this.referees.get(connection.refereeIndex)
    if (!runtime) return
    const status = record.status === 'connected' ? 'connected' : 'error'
    runtime.status[connection.role === 'primary' ? 'pri' : 'sec'] = status
    this.emit(runtime)
  }

  private persistEvent(
    runtime: RefereeRuntime,
    connectionId: string,
    connection: ConnectionRuntime,
    message: WorkerEventMessage
  ): void {
    const context = this.dependencies.ensureEventContext(
      this.sourceKey,
      this.groupName,
      this.contestantName,
      runtime.index,
      runtime.name,
      runtime.mode
    )
    if (!context) {
      this.dependencies.onPersistenceError?.('MATCH_EVENT_CONTEXT_NOT_FOUND')
      return
    }
    const timestamp = (this.dependencies.now ?? (() => new Date()))().toISOString()
    const payload = message.payload ?? {}
    const media = this.captureMedia()
    this.dependencies.appendEvent({
      eventId: String(message.eventId),
      matchSessionId: context.matchSessionId,
      refereeId: context.refereeId,
      connectionId,
      deviceId: connection.deviceId,
      role: connection.role,
      eventType: integerValue(payload.eventType),
      deviceTimestampMs: integerValue(payload.deviceTimestampMs),
      receivedAt: timestamp,
      systemTime: timestamp,
      totalPlus: runtime.scoring.score.plus,
      totalMinus: runtime.scoring.score.minus,
      currentTotal: runtime.scoring.score.total,
      majorPenalty: runtime.scoring.score.penalty,
      mediaProvider: media.provider,
      mediaId: media.mediaId,
      mediaTimeMs: media.mediaTimeMs,
      mediaSyncStatus: media.status
    })
  }

  private emit(runtime: RefereeRuntime): void {
    this.dependencies.emitRefereeUpdate({
      index: runtime.index,
      name: runtime.name,
      mode: runtime.mode,
      score: { ...runtime.scoring.score },
      status: { ...runtime.status }
    })
  }

  private captureMedia(): {
    provider: string
    mediaId: string
    mediaTimeMs: number | null
    status: string
  } {
    const anchor = this.playbackAnchor
    if (!anchor) return { provider: '', mediaId: '', mediaTimeMs: null, status: 'not_ready' }
    if (anchor.groupName !== this.groupName || anchor.contestantName !== this.contestantName) {
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

function validateStartInput(input: MatchStartInput): MatchStartInput {
  if (!input || typeof input !== 'object') {
    throw new MatchSessionError('MATCH_CONFIG_INVALID', 'Match config is required')
  }
  for (const value of [input.sourceKey, input.groupName, input.contestantName]) {
    if (typeof value !== 'string' || !value || value.length > 256) {
      throw new MatchSessionError('MATCH_CONFIG_INVALID', 'Match context is invalid')
    }
  }
  if (!Array.isArray(input.referees) || input.referees.length > 32) {
    throw new MatchSessionError('MATCH_CONFIG_INVALID', 'Referees must be a bounded list')
  }
  const indexes = new Set<number>()
  const deviceIds = new Set<string>()
  const referees = input.referees.map((value) => {
    if (
      !value ||
      !Number.isSafeInteger(value.index) ||
      value.index < 1 ||
      value.index > 1000 ||
      typeof value.name !== 'string' ||
      value.name.length > 128 ||
      (value.mode !== 'SINGLE' && value.mode !== 'DUAL')
    ) {
      throw new MatchSessionError('MATCH_CONFIG_INVALID', 'Referee config is invalid')
    }
    if (indexes.has(value.index)) {
      throw new MatchSessionError('MATCH_CONFIG_INVALID', 'Referee indexes must be unique')
    }
    indexes.add(value.index)
    const primaryDeviceId = optionalId(value.primaryDeviceId)
    const secondaryDeviceId = value.mode === 'DUAL' ? optionalId(value.secondaryDeviceId) : null
    for (const deviceId of [primaryDeviceId, secondaryDeviceId]) {
      if (!deviceId) continue
      if (deviceIds.has(deviceId)) {
        throw new MatchSessionError('MATCH_CONFIG_INVALID', 'Device bindings must be unique')
      }
      deviceIds.add(deviceId)
    }
    return { ...value, name: value.name || `Referee ${value.index}`, primaryDeviceId, secondaryDeviceId }
  })
  return { ...input, referees }
}

function optionalId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || value.length > 128) {
    throw new MatchSessionError('MATCH_CONFIG_INVALID', 'Device id is invalid')
  }
  return value
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function integerValue(value: unknown): number {
  return Number.isSafeInteger(value) ? Number(value) : Number.NaN
}
