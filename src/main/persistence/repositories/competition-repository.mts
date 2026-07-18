import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  type CompetitionCreateInput,
  type CompetitionUpdateInput,
  hasSameCompetitionStructure
} from '../../application/competitions/competition-service.mts'
import type {
  CompetitionConfig,
  CompetitionGroupConfig,
  CompetitionListItem,
  CompetitionRefereeConfig
} from '../../../shared/contracts/competition.mts'
import { findFirstStage, resolveCompetition } from '../sqlite/competition-context.mts'
import { stableDatabaseId } from '../sqlite/ids.mts'
import type { SqliteConnection } from '../sqlite/connection.mts'

export class CompetitionRepository {
  private readonly connection: SqliteConnection

  constructor(connection: SqliteConnection) {
    this.connection = connection
  }

  create(input: CompetitionCreateInput): CompetitionConfig {
    const database = this.connection.requireDatabase()
    const competitionId = randomUUID()
    const stageId = randomUUID()
    const now = new Date().toISOString()
    database.exec('BEGIN IMMEDIATE')
    try {
      database
        .prepare(
          `
        INSERT INTO competitions (id, name, mode, status, created_at, updated_at)
        VALUES (?, ?, ?, 'draft', ?, ?)
      `
        )
        .run(competitionId, input.projectName, input.mode, now, now)
      database
        .prepare(
          `
        INSERT INTO stages (id, competition_id, name, position, status, attempts)
        VALUES (?, ?, 'Main', 0, 'draft', 1)
      `
        )
        .run(stageId, competitionId)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    return this.requireConfig(competitionId)
  }

  update(sourceKey: string, input: CompetitionUpdateInput): CompetitionConfig {
    const database = this.connection.requireDatabase()
    const competition = resolveCompetition(database, sourceKey)
    if (!competition) throw new Error('COMPETITION_NOT_FOUND')
    const current = this.requireConfig(sourceKey)
    const hasEvents = this.countEvents(database, competition.id) > 0
    if (hasEvents && !hasSameCompetitionStructure(current, input)) {
      throw new Error('COMPETITION_STRUCTURE_LOCKED')
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      database
        .prepare('UPDATE competitions SET name = ?, mode = ?, updated_at = ? WHERE id = ?')
        .run(input.projectName, input.mode, new Date().toISOString(), competition.id)
      if (hasEvents) {
        this.updateBindings(database, competition.id, sourceKey, input.groups)
      } else {
        this.replaceGraph(database, competition.id, sourceKey, input.groups)
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    return this.requireConfig(sourceKey)
  }

  getConfig(sourceKey: string): CompetitionConfig | null {
    const database = this.connection.requireDatabase()
    const competition = resolveCompetition(database, sourceKey)
    if (!competition) return null
    const stage = findFirstStage(database, competition.id)
    if (!stage) return null
    const groupRows = database
      .prepare(
        `
      SELECT id, name, referee_count
      FROM competition_groups WHERE stage_id = ? ORDER BY position
    `
      )
      .all(stage.id) as Array<{ id: string; name: string; referee_count: number }>
    const groups = groupRows.map((group) => {
      const players = database
        .prepare('SELECT name FROM contestants WHERE group_id = ? ORDER BY position')
        .all(group.id) as Array<{ name: string }>
      const referees = database
        .prepare(
          `
        SELECT r.referee_index, r.name, r.mode,
          MAX(CASE WHEN db.role = 'primary' THEN db.device_id ELSE '' END) AS pri_addr,
          MAX(CASE WHEN db.role = 'secondary' THEN db.device_id ELSE '' END) AS sec_addr
        FROM referees r
        LEFT JOIN device_bindings db ON db.referee_id = r.id
        WHERE r.group_id = ?
        GROUP BY r.id
        ORDER BY r.referee_index
      `
        )
        .all(group.id) as Array<Record<string, string | number>>
      return {
        name: group.name,
        refCount: Number(group.referee_count),
        players: players.map((player) => player.name),
        referees: referees.map((referee) => ({
          index: Number(referee.referee_index),
          name: String(referee.name),
          mode: referee.mode === 'DUAL' ? ('DUAL' as const) : ('SINGLE' as const),
          pri_addr: String(referee.pri_addr || ''),
          sec_addr: String(referee.sec_addr || '')
        }))
      }
    })
    const mediaRows = database
      .prepare(
        `
      SELECT g.name AS group_name, p.name AS contestant_name,
        mb.provider, mb.media_id, mb.canonical_url
      FROM competition_groups g
      JOIN contestants p ON p.group_id = g.id
      JOIN media_bindings mb ON mb.contestant_id = p.id
      WHERE g.stage_id = ?
    `
      )
      .all(stage.id) as Array<Record<string, string>>
    const media: CompetitionConfig['media'] = {}
    for (const row of mediaRows) {
      media[row.group_name] ??= {}
      media[row.group_name][row.contestant_name] = {
        provider: row.provider,
        video_id: row.media_id,
        canonical_url: row.canonical_url
      }
    }
    return {
      project_name: competition.name,
      mode: competition.mode,
      created_at: competition.createdAt,
      source_key: competition.id,
      groups,
      media
    }
  }

  list(): CompetitionListItem[] {
    const rows = this.connection
      .requireDatabase()
      .prepare('SELECT id FROM competitions ORDER BY updated_at DESC, created_at DESC')
      .all() as Array<{ id: string }>
    return rows.flatMap((row) => {
      const config = this.getConfig(row.id)
      return config ? [{ ...config, dir_name: config.source_key }] : []
    })
  }

  delete(sourceKey: string): boolean {
    const result = this.connection
      .requireDatabase()
      .prepare('DELETE FROM competitions WHERE id = ?')
      .run(sourceKey)
    return Number(result.changes) === 1
  }

  hasMatchContext(
    sourceKey: string,
    groupName: string,
    contestantName: string,
    refereeIndexes: number[]
  ): boolean {
    const config = this.getConfig(sourceKey)
    const group = config?.groups.find((value) => value.name === groupName)
    if (!group || !group.players.includes(contestantName)) return false
    const configuredIndexes = new Set(group.referees.map((referee) => referee.index))
    return refereeIndexes.every((index) => configuredIndexes.has(index))
  }

  private requireConfig(sourceKey: string): CompetitionConfig {
    const config = this.getConfig(sourceKey)
    if (!config) throw new Error('COMPETITION_NOT_FOUND')
    return config
  }

  private countEvents(database: DatabaseSync, competitionId: string): number {
    const row = database
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM score_events e
      JOIN match_sessions ms ON ms.id = e.match_session_id
      JOIN contestants p ON p.id = ms.contestant_id
      JOIN competition_groups g ON g.id = p.group_id
      JOIN stages s ON s.id = g.stage_id
      WHERE s.competition_id = ?
    `
      )
      .get(competitionId) as { count: number }
    return Number(row.count)
  }

  private replaceGraph(
    database: DatabaseSync,
    competitionId: string,
    sourceKey: string,
    groups: CompetitionGroupConfig[]
  ): void {
    const stage = findFirstStage(database, competitionId)
    if (!stage) throw new Error('COMPETITION_NOT_FOUND')
    database.prepare('DELETE FROM competition_groups WHERE stage_id = ?').run(stage.id)
    groups.forEach((group, groupPosition) => {
      const groupId = stableDatabaseId(sourceKey, 'group', String(groupPosition), group.name)
      database
        .prepare(
          `
        INSERT INTO competition_groups (id, stage_id, name, position, referee_count)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(groupId, stage.id, group.name, groupPosition, group.refCount)
      group.players.forEach((playerName, playerPosition) => {
        const contestantId = stableDatabaseId(
          sourceKey,
          groupId,
          'contestant',
          String(playerPosition),
          playerName
        )
        database
          .prepare(
            `
          INSERT INTO contestants (id, group_id, name, position, status)
          VALUES (?, ?, ?, ?, 'pending')
        `
          )
          .run(contestantId, groupId, playerName, playerPosition)
        database
          .prepare(
            `
          INSERT INTO match_sessions (id, contestant_id, attempt_number, status, rule_version)
          VALUES (?, ?, 1, 'pending', 'route-b-v1')
        `
          )
          .run(stableDatabaseId(sourceKey, contestantId, 'session', '1'), contestantId)
      })
      group.referees.forEach((referee) => {
        const refereeId = stableDatabaseId(sourceKey, groupId, 'referee', String(referee.index))
        database
          .prepare(
            `
          INSERT INTO referees (id, group_id, referee_index, name, mode)
          VALUES (?, ?, ?, ?, ?)
        `
          )
          .run(refereeId, groupId, referee.index, referee.name, referee.mode)
        this.writeDeviceBindings(database, sourceKey, refereeId, referee)
      })
    })
  }

  private updateBindings(
    database: DatabaseSync,
    competitionId: string,
    sourceKey: string,
    groups: CompetitionGroupConfig[]
  ): void {
    for (const group of groups) {
      const row = database
        .prepare(
          `
        SELECT g.id
        FROM stages s
        JOIN competition_groups g ON g.stage_id = s.id
        WHERE s.competition_id = ? AND g.name = ?
        LIMIT 1
      `
        )
        .get(competitionId, group.name) as { id: string } | undefined
      if (!row) throw new Error('COMPETITION_STRUCTURE_LOCKED')
      for (const referee of group.referees) {
        const stored = database
          .prepare('SELECT id FROM referees WHERE group_id = ? AND referee_index = ?')
          .get(row.id, referee.index) as { id: string } | undefined
        if (!stored) throw new Error('COMPETITION_STRUCTURE_LOCKED')
        database.prepare('DELETE FROM device_bindings WHERE referee_id = ?').run(stored.id)
        this.writeDeviceBindings(database, sourceKey, stored.id, referee)
      }
    }
  }

  private writeDeviceBindings(
    database: DatabaseSync,
    sourceKey: string,
    refereeId: string,
    referee: CompetitionRefereeConfig
  ): void {
    for (const [role, deviceId] of [
      ['primary', referee.pri_addr],
      ['secondary', referee.mode === 'DUAL' ? referee.sec_addr : '']
    ] as const) {
      if (!deviceId) continue
      const transport =
        deviceId.startsWith('usb:') || deviceId.startsWith('usbport:') ? 'USB' : 'BLE'
      database
        .prepare(
          `
        INSERT INTO device_bindings (id, referee_id, role, device_id, transport)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(
          stableDatabaseId(sourceKey, refereeId, 'device', role),
          refereeId,
          role,
          deviceId,
          transport
        )
    }
  }
}
