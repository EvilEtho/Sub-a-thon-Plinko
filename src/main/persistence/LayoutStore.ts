import { join } from 'node:path'
import { layoutSchema, type Layout } from '../../shared/schema/layout.schema'
import { backupCorruptFile, readJsonFile, writeJsonFileAtomic } from './jsonFile'

/** Named board layouts persisted in a single JSON map. */
export class LayoutStore {
  private readonly path: string
  private cache: Record<string, Layout> = {}

  constructor(dir: string) {
    this.path = join(dir, 'layouts.json')
  }

  async load(): Promise<void> {
    // A corrupt layouts.json must never crash bootstrap — back it up and start fresh.
    let raw: unknown
    try {
      raw = await readJsonFile(this.path)
    } catch (err) {
      console.error('[LayoutStore] invalid layouts.json, backing up + resetting:', err)
      await backupCorruptFile(this.path)
      return
    }
    if (raw && typeof raw === 'object') {
      const parsed: Record<string, Layout> = {}
      for (const [name, data] of Object.entries(raw as Record<string, unknown>)) {
        const r = layoutSchema.safeParse(data)
        if (r.success) parsed[name] = r.data
      }
      this.cache = parsed
    }
  }

  list(): string[] {
    return Object.keys(this.cache).sort()
  }

  /** All layouts with their data (for gallery thumbnails). */
  all(): Record<string, Layout> {
    return { ...this.cache }
  }

  get(name: string): Layout | null {
    return this.cache[name] ?? null
  }

  async save(name: string, layout: Layout): Promise<void> {
    this.cache[name] = layoutSchema.parse(layout)
    await writeJsonFileAtomic(this.path, this.cache)
  }

  async delete(name: string): Promise<void> {
    delete this.cache[name]
    await writeJsonFileAtomic(this.path, this.cache)
  }
}
