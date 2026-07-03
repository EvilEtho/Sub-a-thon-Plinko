import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

/** Read + parse a JSON file, or null if it does not exist. Throws on other IO errors. */
export async function readJsonFile(path: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(path, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

let tmpCounter = 0

/**
 * Atomically write JSON: write to a UNIQUE temp file then rename over the target. The
 * unique temp name is important because concurrent writers (e.g. many balls dropping at
 * once) must not share a temp path — otherwise one rename removes the temp the other is
 * about to rename (ENOENT).
 */
export async function writeJsonFileAtomic(path: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${(tmpCounter++).toString(36)}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, path)
}

/** Rename a (possibly corrupt) file out of the way so a fresh one can be written. */
export async function backupCorruptFile(path: string): Promise<void> {
  try {
    await fs.rename(path, `${path}.corrupt`)
  } catch {
    /* ignore */
  }
}
