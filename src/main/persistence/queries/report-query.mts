import type { CompetitionConfig } from '../../../shared/contracts/competition.mts'
import type { CompetitionRepository } from '../repositories/competition-repository.mts'
import type { SqliteConnection } from '../sqlite/connection.mts'

export interface CompetitionReport {
  status: 'ok'
  config: CompetitionConfig
  scores: Record<
    string,
    Record<string, Record<number, { total: number; plus: number; minus: number; penalty: number }>>
  >
}

export class ReportQuery {
  private readonly connection: SqliteConnection
  private readonly competitions: Pick<CompetitionRepository, 'getConfig'>

  constructor(
    connection: SqliteConnection,
    competitions: Pick<CompetitionRepository, 'getConfig'>
  ) {
    this.connection = connection
    this.competitions = competitions
  }

  get(sourceKey: string): CompetitionReport | null {
    const config = this.competitions.getConfig(sourceKey)
    if (!config) return null
    const rows = this.connection
      .requireDatabase()
      .prepare(
        `
        SELECT g.name AS group_name, p.name AS contestant_name,
          r.referee_index, e.current_total, e.total_plus, e.total_minus,
          e.major_penalty
        FROM competitions c
        JOIN stages s ON s.competition_id = c.id
        JOIN competition_groups g ON g.stage_id = s.id
        JOIN contestants p ON p.group_id = g.id
        JOIN match_sessions ms ON ms.contestant_id = p.id
        JOIN score_snapshots e ON e.match_session_id = ms.id
        JOIN referees r ON r.id = e.referee_id
        WHERE c.id = ? AND s.position = 0 AND ms.attempt_number = 1
          AND ms.status <> 'invalidated'
    `
      )
      .all(sourceKey) as Array<Record<string, string | number>>
    const scores: CompetitionReport['scores'] = {}
    for (const row of rows) {
      const groupName = String(row.group_name)
      const contestantName = String(row.contestant_name)
      scores[groupName] ??= {}
      scores[groupName][contestantName] ??= {}
      scores[groupName][contestantName][Number(row.referee_index)] = {
        total: Number(row.current_total),
        plus: Number(row.total_plus),
        minus: Number(row.total_minus),
        penalty: Number(row.major_penalty)
      }
    }
    return { status: 'ok', config, scores }
  }
}
