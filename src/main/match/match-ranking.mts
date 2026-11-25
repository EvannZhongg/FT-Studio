import type { RankingSnapshot } from '../../shared/ranking.mts'

// Bound read/IPC work during bursts; scoring events themselves are never dropped.
export class MatchRankingPublisher {
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly read: () => RankingSnapshot | null
  private readonly emit: (value: RankingSnapshot | null) => void
  private readonly onError: (error: unknown) => void

  constructor(
    read: () => RankingSnapshot | null,
    emit: (value: RankingSnapshot | null) => void,
    onError: (error: unknown) => void
  ) {
    this.read = read
    this.emit = emit
    this.onError = onError
  }

  schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), 33)
    this.timer.unref?.()
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      this.emit(this.read())
    } catch (error) {
      this.emit(null)
      this.onError(error)
    }
  }
}
