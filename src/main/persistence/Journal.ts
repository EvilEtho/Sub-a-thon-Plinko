import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

export interface JournalEntry {
  tsEpochMs: number
  type: string
  [key: string]: unknown
}

/**
 * Append-only NDJSON journal of events + drops. Durable audit trail used to rebuild
 * totals/accumulators if the runtime snapshot is ever lost or corrupt.
 */
export class Journal {
  private readonly path: string

  constructor(dir: string) {
    this.path = join(dir, 'journal.ndjson')
  }

  async append(entry: JournalEntry): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true })
    await fs.appendFile(this.path, `${JSON.stringify(entry)}\n`, 'utf8')
  }

  async readAll(): Promise<JournalEntry[]> {
    try {
      const raw = await fs.readFile(this.path, 'utf8')
      return raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as JournalEntry)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }
}
