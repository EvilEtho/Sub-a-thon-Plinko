import { join } from 'node:path'
import {
  RUNTIME_SCHEMA_VERSION,
  runtimeStateSchema,
  type RuntimeState
} from '../../shared/schema/runtime.schema'
import { migrate, runtimeMigrations } from '../../shared/schema/migrations'
import { backupCorruptFile, readJsonFile, writeJsonFileAtomic } from './jsonFile'

/**
 * Persists live subathon state. All writes are SERIALIZED through a single promise chain
 * and COALESCED — a burst of concurrent saves (e.g. many balls dropping at once) collapses
 * into one write of the latest state. Writes never reject (errors are logged), so callers
 * can fire-and-forget without risking unhandled rejections.
 */
export class RuntimeStore {
  private readonly path: string
  private latest: RuntimeState | null = null
  private pending = false
  private chain: Promise<void> = Promise.resolve()

  constructor(dir: string) {
    this.path = join(dir, 'runtime.json')
  }

  async load(): Promise<RuntimeState | null> {
    const raw = await readJsonFile(this.path)
    if (raw === null) return null
    try {
      const migrated = migrate(raw as Record<string, unknown>, runtimeMigrations, RUNTIME_SCHEMA_VERSION)
      return runtimeStateSchema.parse(migrated)
    } catch (err) {
      console.error('[RuntimeStore] invalid runtime state, starting fresh:', err)
      await backupCorruptFile(this.path)
      return null
    }
  }

  /** Fire-and-forget save (coalesced). */
  scheduleSave(state: RuntimeState): void {
    this.latest = state
    void this.kick()
  }

  /** Save and await completion of the (coalesced) write. */
  saveNow(state: RuntimeState): Promise<void> {
    this.latest = state
    return this.kick()
  }

  /** Await any in-flight/pending write. */
  flush(): Promise<void> {
    return this.kick()
  }

  private kick(): Promise<void> {
    this.pending = true
    this.chain = this.chain.then(() => this.drain())
    return this.chain
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      this.pending = false
      const snapshot = this.latest
      if (!snapshot) return
      try {
        await writeJsonFileAtomic(this.path, snapshot)
      } catch (err) {
        console.error('[RuntimeStore] write failed:', err)
      }
    }
  }
}
