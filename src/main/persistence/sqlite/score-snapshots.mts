import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

// Control resets are audit events too. Never recover a reset score from an older
// hardware event, or depend on event timestamps / random IDs to order writes.
export function resetScoreSnapshots(
  database: DatabaseSync,
  sessionId: string,
  occurredAt: string
): void {
  const referees = database
    .prepare(
      `
    SELECT r.id FROM match_sessions ms
    JOIN contestants p ON p.id = ms.contestant_id
    JOIN referees r ON r.group_id = p.group_id WHERE ms.id = ?
  `
    )
    .all(sessionId) as Array<{ id: string }>
  for (const referee of referees) {
    const eventId = randomUUID()
    database
      .prepare(
        `
      INSERT INTO score_events (event_id, match_session_id, referee_id, connection_id,
        device_id, role, event_type, device_timestamp_ms, received_at, system_time,
        total_plus, total_minus, current_total, major_penalty)
      VALUES (?, ?, ?, 'system:reset', 'system', 'primary', 0, 0, ?, ?, 0, 0, 0, 0)
    `
      )
      .run(eventId, sessionId, referee.id, occurredAt, occurredAt)
    database
      .prepare(
        `
      INSERT INTO score_snapshots (match_session_id, referee_id, event_id,
        total_plus, total_minus, current_total, major_penalty)
      VALUES (?, ?, ?, 0, 0, 0, 0)
      ON CONFLICT(match_session_id, referee_id) DO UPDATE SET
        event_id = excluded.event_id, total_plus = 0, total_minus = 0,
        current_total = 0, major_penalty = 0
    `
      )
      .run(sessionId, referee.id, eventId)
  }
}
