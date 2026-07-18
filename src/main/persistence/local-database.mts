import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'


export const LATEST_SCHEMA_VERSION = 1

export interface StoredScoreEvent {
  eventId: string
  matchSessionId?: string | null
  refereeId?: string | null
  connectionId: string
  deviceId: string
  role: 'primary' | 'secondary'
  eventType: number
  deviceTimestampMs: number
  receivedAt: string
  systemTime: string
  totalPlus: number
  totalMinus: number
  currentTotal: number
  majorPenalty: number
  mediaProvider?: string
  mediaId?: string
  mediaTimeMs?: number | null
  mediaSyncStatus?: string
}

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS competitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('FREE', 'TOURNAMENT')),
        status TEXT NOT NULL DEFAULT 'draft',
        event_date TEXT,
        location TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS stages (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
        UNIQUE (competition_id, position)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS competition_groups (
        id TEXT PRIMARY KEY,
        stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        UNIQUE (stage_id, position)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS contestants (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES competition_groups(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        UNIQUE (group_id, position)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS referees (
        id TEXT PRIMARY KEY,
        stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
        referee_index INTEGER NOT NULL,
        name TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('SINGLE', 'DUAL')),
        UNIQUE (stage_id, referee_index)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS device_bindings (
        id TEXT PRIMARY KEY,
        referee_id TEXT NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
        device_id TEXT NOT NULL,
        transport TEXT NOT NULL CHECK (transport IN ('BLE', 'USB')),
        UNIQUE (referee_id, role)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS match_sessions (
        id TEXT PRIMARY KEY,
        contestant_id TEXT NOT NULL REFERENCES contestants(id),
        attempt_number INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT,
        invalidated_at TEXT,
        rule_version TEXT NOT NULL,
        UNIQUE (contestant_id, attempt_number)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS score_events (
        event_id TEXT PRIMARY KEY,
        match_session_id TEXT REFERENCES match_sessions(id),
        referee_id TEXT REFERENCES referees(id),
        connection_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
        event_type INTEGER NOT NULL,
        device_timestamp_ms INTEGER NOT NULL,
        received_at TEXT NOT NULL,
        system_time TEXT NOT NULL,
        total_plus INTEGER NOT NULL,
        total_minus INTEGER NOT NULL,
        current_total INTEGER NOT NULL,
        major_penalty INTEGER NOT NULL DEFAULT 0,
        media_provider TEXT NOT NULL DEFAULT '',
        media_id TEXT NOT NULL DEFAULT '',
        media_time_ms INTEGER,
        media_sync_status TEXT NOT NULL DEFAULT 'not_ready',
        raw_payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS score_events_session_time
        ON score_events(match_session_id, system_time, event_id);

      CREATE TABLE IF NOT EXISTS media_bindings (
        id TEXT PRIMARY KEY,
        contestant_id TEXT NOT NULL REFERENCES contestants(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        media_id TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        UNIQUE (contestant_id, provider)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS export_records (
        id TEXT PRIMARY KEY,
        competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
        format TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        output_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS share_drafts (
        id TEXT PRIMARY KEY,
        competition_id TEXT REFERENCES competitions(id) ON DELETE SET NULL,
        snapshot_json TEXT NOT NULL,
        snapshot_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS upload_tasks (
        id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL REFERENCES share_drafts(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        next_attempt_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS legacy_imports (
        source_key TEXT PRIMARY KEY,
        source_hash TEXT NOT NULL,
        competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        imported_at TEXT NOT NULL
      ) STRICT;
    `
  }
] as const


export class LocalDatabase {
  readonly databasePath: string
  readonly backupRoot: string
  private database: DatabaseSync | null = null

  constructor(databasePath: string, backupRoot: string) {
    this.databasePath = path.resolve(databasePath)
    this.backupRoot = path.resolve(backupRoot)
  }

  open(): void {
    if (this.database) return
    mkdirSync(path.dirname(this.databasePath), { recursive: true })
    mkdirSync(this.backupRoot, { recursive: true })
    const existing = existsSync(this.databasePath) && statSync(this.databasePath).size > 0
    let currentVersion = 0
    if (existing) {
      const probe = new DatabaseSync(this.databasePath, { readOnly: true })
      try {
        const row = probe.prepare('PRAGMA user_version').get() as { user_version: number }
        currentVersion = Number(row.user_version)
      } finally {
        probe.close()
      }
      if (currentVersion > LATEST_SCHEMA_VERSION) {
        throw new Error(`Database schema ${currentVersion} is newer than this application`)
      }
      if (currentVersion < LATEST_SCHEMA_VERSION) this.createMigrationBackup(currentVersion)
    }

    const database = new DatabaseSync(this.databasePath)
    this.database = database
    database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
    if (currentVersion < LATEST_SCHEMA_VERSION) {
      this.applyMigrations(currentVersion)
    }
  }

  close(): void {
    if (!this.database) return
    this.database.close()
    this.database = null
  }

  getSchemaVersion(): number {
    const row = this.requireDatabase().prepare('PRAGMA user_version').get() as { user_version: number }
    return Number(row.user_version)
  }

  listTableNames(): string[] {
    const rows = this.requireDatabase().prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as Array<{ name: string }>
    return rows.map((row) => row.name)
  }

  appendScoreEvent(event: StoredScoreEvent): boolean {
    validateScoreEvent(event)
    const result = this.requireDatabase().prepare(`
      INSERT OR IGNORE INTO score_events (
        event_id, match_session_id, referee_id, connection_id, device_id, role,
        event_type, device_timestamp_ms, received_at, system_time, total_plus,
        total_minus, current_total, major_penalty, media_provider, media_id,
        media_time_ms, media_sync_status, raw_payload
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      event.eventId,
      event.matchSessionId ?? null,
      event.refereeId ?? null,
      event.connectionId,
      event.deviceId,
      event.role,
      event.eventType,
      event.deviceTimestampMs,
      event.receivedAt,
      event.systemTime,
      event.totalPlus,
      event.totalMinus,
      event.currentTotal,
      event.majorPenalty,
      event.mediaProvider ?? '',
      event.mediaId ?? '',
      event.mediaTimeMs ?? null,
      event.mediaSyncStatus ?? 'not_ready',
      JSON.stringify(event)
    )
    return Number(result.changes) === 1
  }

  getScoreEvents(): StoredScoreEvent[] {
    const rows = this.requireDatabase().prepare(
      'SELECT raw_payload FROM score_events ORDER BY system_time, event_id'
    ).all() as Array<{ raw_payload: string }>
    return rows.map((row) => JSON.parse(row.raw_payload) as StoredScoreEvent)
  }

  private applyMigrations(currentVersion: number): void {
    const database = this.requireDatabase()
    database.exec('BEGIN IMMEDIATE')
    try {
      for (const migration of MIGRATIONS) {
        if (migration.version <= currentVersion) continue
        database.exec(migration.sql)
        database.exec(`PRAGMA user_version = ${migration.version}`)
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  private createMigrationBackup(currentVersion: number): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(
      this.backupRoot,
      `ft-engine-v${currentVersion}-${timestamp}.db`
    )
    copyFileSync(this.databasePath, backupPath)
    return backupPath
  }

  private requireDatabase(): DatabaseSync {
    if (!this.database) throw new Error('Local database is not open')
    return this.database
  }
}


function validateScoreEvent(event: StoredScoreEvent): void {
  if (
    !event ||
    typeof event.eventId !== 'string' ||
    !event.eventId ||
    typeof event.connectionId !== 'string' ||
    !event.connectionId ||
    typeof event.deviceId !== 'string' ||
    !event.deviceId ||
    (event.role !== 'primary' && event.role !== 'secondary') ||
    !Number.isSafeInteger(event.eventType) ||
    !Number.isSafeInteger(event.deviceTimestampMs) ||
    event.deviceTimestampMs < 0 ||
    !Number.isSafeInteger(event.totalPlus) ||
    event.totalPlus < 0 ||
    !Number.isSafeInteger(event.totalMinus) ||
    event.totalMinus < 0 ||
    !Number.isSafeInteger(event.currentTotal) ||
    !Number.isSafeInteger(event.majorPenalty)
  ) {
    throw new Error('Invalid score event')
  }
}
