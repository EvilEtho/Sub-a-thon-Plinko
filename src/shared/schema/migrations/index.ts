/**
 * Schema migrations. Each entry migrates data from version N to N+1. On load, the store
 * applies migrations in order until data reaches the current version.
 *
 * No migrations yet (v1 is the initial schema). When the shape changes, bump
 * SCHEMA_VERSION / RUNTIME_SCHEMA_VERSION and add a function here keyed by the OLD version.
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

export const profileMigrations: Record<number, Migration> = {}
export const runtimeMigrations: Record<number, Migration> = {}

/** Apply migrations from `data.schemaVersion` up to `target`. */
export function migrate(
  data: Record<string, unknown>,
  migrations: Record<number, Migration>,
  target: number
): Record<string, unknown> {
  let current = data
  let version = typeof current.schemaVersion === 'number' ? current.schemaVersion : 0
  while (version < target && migrations[version]) {
    current = migrations[version](current)
    version = typeof current.schemaVersion === 'number' ? current.schemaVersion : version + 1
  }
  return current
}
