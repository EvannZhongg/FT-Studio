import type {
  RankingContext,
  RankingSnapshot,
  RankingContestant
} from '../../../shared/ranking.mts'
import type { SqliteConnection } from '../sqlite/connection.mts'

export class RankingQuery {
  private readonly connection: SqliteConnection

  constructor(connection: SqliteConnection) {
    this.connection = connection
  }

  get(context: RankingContext): RankingSnapshot | null {
    const database = this.connection.requireDatabase()
    const group = database
      .prepare(
        `
      SELECT g.id, s.name AS stage_name FROM competition_groups g
      JOIN stages s ON s.id = g.stage_id
      WHERE s.competition_id = ? AND s.id = ? AND g.name = ?
    `
      )
      .get(context.sourceKey, context.stageId, context.groupName) as
      | { id: string; stage_name: string }
      | undefined
    if (!group) return null
    const referees = database
      .prepare(
        `
      SELECT referee_index AS 'index', mode FROM referees WHERE group_id = ? ORDER BY referee_index
    `
      )
      .all(group.id) as unknown as RankingSnapshot['referees']
    const rows = database
      .prepare(
        `
      SELECT p.id, p.name, p.position, ms.status, r.referee_index,
        ss.current_total, ss.total_plus, ss.total_minus, ss.major_penalty
      FROM contestants p
      JOIN match_sessions ms ON ms.contestant_id = p.id AND ms.attempt_number = ?
      LEFT JOIN score_snapshots ss ON ss.match_session_id = ms.id
      LEFT JOIN referees r ON r.id = ss.referee_id
      WHERE p.group_id = ? ORDER BY p.position, r.referee_index
    `
      )
      .all(context.attemptNumber, group.id) as Array<Record<string, string | number | null>>
    const contestants = new Map<string, RankingContestant>()
    for (const row of rows) {
      const id = String(row.id)
      let contestant = contestants.get(id)
      if (!contestant) {
        contestant = {
          id,
          name: String(row.name),
          position: Number(row.position),
          status: row.status as RankingContestant['status'],
          scores: {}
        }
        contestants.set(id, contestant)
      }
      if (row.referee_index !== null)
        contestant.scores[Number(row.referee_index)] = {
          total: Number(row.current_total),
          plus: Number(row.total_plus),
          minus: Number(row.total_minus),
          penalty: Number(row.major_penalty)
        }
    }
    return {
      context: { ...context },
      stageName: group.stage_name,
      referees,
      contestants: [...contestants.values()]
    }
  }
}
