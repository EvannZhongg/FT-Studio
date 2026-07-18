import { resolveContestant } from '../sqlite/competition-context.mts'
import type { SqliteConnection } from '../sqlite/connection.mts'

export interface ReplayEvent {
  event_id: string
  system_time: string
  ble_timestamp: number
  referee_index: number
  referee_name: string
  device_role: 'PRIMARY' | 'SECONDARY'
  event_type: number
  delta_plus: number
  delta_minus: number
  delta_penalty: number
  total_plus: number
  total_minus: number
  major_penalty: number
  current_total: number
  media_provider: string
  media_id: string
  media_time_ms: number | null
  media_sync_status: string
}

export class ReplayQuery {
  private readonly connection: SqliteConnection

  constructor(connection: SqliteConnection) {
    this.connection = connection
  }

  listScoredContestants(sourceKey: string, groupName: string): string[] {
    const rows = this.connection
      .requireDatabase()
      .prepare(
        `
      SELECT DISTINCT p.name, p.position
      FROM competitions c
      JOIN stages s ON s.competition_id = c.id
      JOIN competition_groups g ON g.stage_id = s.id
      JOIN contestants p ON p.group_id = g.id
      JOIN match_sessions ms ON ms.contestant_id = p.id
      JOIN score_events e ON e.match_session_id = ms.id
      WHERE c.id = ? AND g.name = ?
      ORDER BY p.position
    `
      )
      .all(sourceKey, groupName) as Array<{ name: string }>
    return rows.map((row) => row.name)
  }

  get(
    sourceKey: string,
    groupName: string,
    contestantName: string
  ): {
    status: 'ok'
    binding: { provider: string; video_id: string; canonical_url: string } | null
    events: ReplayEvent[]
  } | null {
    const database = this.connection.requireDatabase()
    const contestant = resolveContestant(database, sourceKey, groupName, contestantName)
    if (!contestant) return null
    const bindingRow = database
      .prepare(
        `
      SELECT provider, media_id, canonical_url
      FROM media_bindings WHERE contestant_id = ? LIMIT 1
    `
      )
      .get(contestant.id) as
      | { provider: string; media_id: string; canonical_url: string }
      | undefined
    const rows = database
      .prepare(
        `
      SELECT e.*, r.referee_index, r.name AS referee_name
      FROM match_sessions ms
      JOIN score_events e ON e.match_session_id = ms.id
      JOIN referees r ON r.id = e.referee_id
      WHERE ms.contestant_id = ?
      ORDER BY e.system_time, r.referee_index, e.event_id
    `
      )
      .all(contestant.id) as Array<Record<string, string | number | null>>
    const previousByReferee = new Map<number, { plus: number; minus: number; penalty: number }>()
    const events = rows.map((row) => {
      const refereeIndex = Number(row.referee_index)
      const previous = previousByReferee.get(refereeIndex) ?? { plus: 0, minus: 0, penalty: 0 }
      const plus = Number(row.total_plus)
      const minus = Number(row.total_minus)
      const penalty = Number(row.major_penalty)
      previousByReferee.set(refereeIndex, { plus, minus, penalty })
      return {
        event_id: String(row.event_id),
        system_time: String(row.system_time),
        ble_timestamp: Number(row.device_timestamp_ms),
        referee_index: refereeIndex,
        referee_name: String(row.referee_name),
        device_role:
          String(row.role) === 'secondary' ? ('SECONDARY' as const) : ('PRIMARY' as const),
        event_type: Number(row.event_type),
        delta_plus: plus - previous.plus,
        delta_minus: minus - previous.minus,
        delta_penalty: penalty - previous.penalty,
        total_plus: plus,
        total_minus: minus,
        major_penalty: penalty,
        current_total: Number(row.current_total),
        media_provider: String(row.media_provider),
        media_id: String(row.media_id),
        media_time_ms: row.media_time_ms === null ? null : Number(row.media_time_ms),
        media_sync_status: String(row.media_sync_status)
      }
    })
    return {
      status: 'ok',
      binding: bindingRow
        ? {
            provider: bindingRow.provider,
            video_id: bindingRow.media_id,
            canonical_url: bindingRow.canonical_url
          }
        : null,
      events
    }
  }
}
