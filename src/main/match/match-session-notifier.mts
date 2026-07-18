import type { RefereeMode } from '../domain/scoring.mts'
import type { MatchMediaStatus } from './media-session.mts'

export interface MatchRefereeUpdate {
  index: number
  name: string
  mode: RefereeMode
  score: { total: number; plus: number; minus: number; penalty: number }
  status: { pri: string; sec: string }
}

export type MatchSessionState = 'idle' | 'starting' | 'active' | 'stopping' | 'completed' | 'failed'

export interface MatchStatusUpdate {
  state: MatchSessionState
  persistence: 'idle' | 'saving' | 'saved' | 'error'
  worker: 'idle' | 'ready' | 'reconnecting' | 'error'
  media: MatchMediaStatus
  errorCode: string | null
  lastSavedAt: string | null
}

interface MatchSessionNotifierDependencies {
  emitRefereeUpdate: (update: MatchRefereeUpdate) => void
  emitContextUpdate?: (context: { groupName: string; contestantName: string }) => void
  emitStatusUpdate?: (status: MatchStatusUpdate) => void
  onError?: (code: string, error?: unknown) => void
}

export class MatchSessionNotifier {
  private readonly dependencies: MatchSessionNotifierDependencies

  constructor(dependencies: MatchSessionNotifierDependencies) {
    this.dependencies = dependencies
  }

  referee(update: MatchRefereeUpdate): void {
    this.notifyRenderer(() => this.dependencies.emitRefereeUpdate(update))
  }

  context(value: { groupName: string; contestantName: string }): void {
    this.notifyRenderer(() => this.dependencies.emitContextUpdate?.(value))
  }

  status(value: MatchStatusUpdate): void {
    this.notifyRenderer(() => this.dependencies.emitStatusUpdate?.(value))
  }

  error(code: string, error?: unknown): void {
    try {
      this.dependencies.onError?.(code, error)
    } catch {
      // Error reporting must never escape a Worker EventEmitter callback.
    }
  }

  private notifyRenderer(notify: () => void): void {
    try {
      notify()
    } catch (error) {
      this.error('MATCH_RENDERER_NOTIFY_FAILED', error)
    }
  }
}
