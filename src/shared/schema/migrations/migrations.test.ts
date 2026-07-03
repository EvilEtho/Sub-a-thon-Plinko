import { describe, it, expect } from 'vitest'
import { migrate, type Migration } from './index'
import { profileSchema } from '../profile.schema'

describe('migrate', () => {
  it('applies migrations in ascending order until target', () => {
    const migrations: Record<number, Migration> = {
      0: (d) => ({ ...d, schemaVersion: 1, step0: true }),
      1: (d) => ({ ...d, schemaVersion: 2, step1: true })
    }
    const out = migrate({ schemaVersion: 0 }, migrations, 2)
    expect(out.schemaVersion).toBe(2)
    expect(out.step0).toBe(true)
    expect(out.step1).toBe(true)
  })

  it('is a no-op when already at target', () => {
    const out = migrate({ schemaVersion: 1, a: 1 }, {}, 1)
    expect(out).toEqual({ schemaVersion: 1, a: 1 })
  })
})

describe('profileSchema upgrade', () => {
  it('fills newly-added fields (theme, integrations) for an old profile', () => {
    // Simulate a pre-theme/pre-integrations profile on disk.
    const old = { schemaVersion: 1, id: 'default', displayName: 'Old' }
    const parsed = profileSchema.parse(old)
    expect(parsed.theme.frameColor).toBeTruthy()
    expect(parsed.integrations.twitch.enabled).toBe(false)
    expect(parsed.slots.length).toBe(9)
  })
})
