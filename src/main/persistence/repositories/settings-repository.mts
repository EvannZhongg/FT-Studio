import {
  createDefaultAppSettings,
  isAppSettingKey,
  normalizeAppSetting,
  type AppSettings
} from '../../application/settings/app-settings.mts'
import type { SqliteConnection } from '../sqlite/connection.mts'

export class SettingsRepository {
  private readonly connection: SqliteConnection

  constructor(connection: SqliteConnection) {
    this.connection = connection
  }

  get(): AppSettings {
    const settings = createDefaultAppSettings()
    const rows = this.connection
      .requireDatabase()
      .prepare('SELECT key, value_json FROM app_settings')
      .all() as Array<{ key: string; value_json: string }>
    for (const row of rows) {
      if (!isAppSettingKey(row.key)) continue
      try {
        Object.assign(settings, {
          [row.key]: normalizeAppSetting(row.key, JSON.parse(row.value_json))
        })
      } catch {
        // Keep the stable default when one setting row is corrupt.
      }
    }
    return settings
  }

  set(key: string, value: unknown): AppSettings {
    if (!isAppSettingKey(key)) throw new Error('SETTINGS_KEY_INVALID')
    const normalized = normalizeAppSetting(key, value)
    this.connection
      .requireDatabase()
      .prepare(
        `
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `
      )
      .run(key, JSON.stringify(normalized), new Date().toISOString())
    return this.get()
  }
}
