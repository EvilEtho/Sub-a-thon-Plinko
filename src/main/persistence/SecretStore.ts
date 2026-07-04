import { join } from 'node:path'
import { safeStorage } from 'electron'
import { backupCorruptFile, readJsonFile, writeJsonFileAtomic } from './jsonFile'

/**
 * Encrypted storage for integration tokens using Electron safeStorage (Windows DPAPI).
 * Ciphertext is kept in secrets.json; plaintext never touches the config profile.
 */
export class SecretStore {
  private readonly path: string
  private cache: Record<string, string> = {}

  constructor(dir: string) {
    this.path = join(dir, 'secrets.json')
  }

  async load(): Promise<void> {
    // A corrupt secrets.json must never crash bootstrap — back it up and start fresh.
    try {
      const raw = await readJsonFile(this.path)
      if (raw && typeof raw === 'object') this.cache = raw as Record<string, string>
    } catch (err) {
      console.error('[SecretStore] invalid secrets.json, backing up + resetting:', err)
      await backupCorruptFile(this.path)
      this.cache = {}
    }
  }

  private async persist(): Promise<void> {
    await writeJsonFileAtomic(this.path, this.cache)
  }

  async set(key: string, value: string): Promise<void> {
    if (safeStorage.isEncryptionAvailable()) {
      this.cache[key] = safeStorage.encryptString(value).toString('base64')
    } else {
      // Fallback for environments without OS encryption (dev only).
      this.cache[key] = `plain:${Buffer.from(value, 'utf8').toString('base64')}`
    }
    await this.persist()
  }

  get(key: string): string | null {
    const v = this.cache[key]
    if (!v) return null
    try {
      if (v.startsWith('plain:')) return Buffer.from(v.slice(6), 'base64').toString('utf8')
      return safeStorage.decryptString(Buffer.from(v, 'base64'))
    } catch {
      return null
    }
  }

  has(key: string): boolean {
    return !!this.cache[key]
  }

  async delete(key: string): Promise<void> {
    delete this.cache[key]
    await this.persist()
  }
}

/** Canonical secret keys. */
export const SecretKeys = {
  streamlabsToken: 'streamlabs.token',
  streamElementsJwt: 'streamelements.jwt',
  twitchTokens: 'twitch.tokens', // JSON: { accessToken, refreshToken, expiresAt, scope[] }
  obsPassword: 'obs.password'
} as const
