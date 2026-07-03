import { join } from 'node:path'
import { SCHEMA_VERSION, defaultProfile, profileSchema, type Profile } from '../../shared/schema/profile.schema'
import { migrate, profileMigrations } from '../../shared/schema/migrations'
import { backupCorruptFile, readJsonFile, writeJsonFileAtomic } from './jsonFile'

/** Persists the streamer's configuration profile (config, edited rarely). */
export class ProfileStore {
  private readonly path: string

  constructor(dir: string) {
    this.path = join(dir, 'profile.json')
  }

  async load(): Promise<Profile> {
    const raw = await readJsonFile(this.path)
    if (raw === null) {
      const initial = defaultProfile()
      await this.save(initial)
      return initial
    }
    try {
      const migrated = migrate(raw as Record<string, unknown>, profileMigrations, SCHEMA_VERSION)
      const parsed = profileSchema.parse(migrated)
      // Persist the canonical shape so newly-added fields land on disk after upgrades.
      await this.save(parsed)
      return parsed
    } catch (err) {
      console.error('[ProfileStore] invalid profile, resetting to default:', err)
      await backupCorruptFile(this.path)
      const initial = defaultProfile()
      await this.save(initial)
      return initial
    }
  }

  async save(profile: Profile): Promise<void> {
    await writeJsonFileAtomic(this.path, profile)
  }
}
