import { describe, it, expect } from 'vitest'
import { resolveTwitchClientId } from './integrations.schema'

describe('resolveTwitchClientId', () => {
  const builtin = 'builtin-id'

  it('uses the built-in id when not opted into a custom one', () => {
    expect(resolveTwitchClientId(builtin, { useCustomClientId: false, customClientId: 'x' })).toBe('builtin-id')
  })

  it('uses the custom id when opted in and set', () => {
    expect(resolveTwitchClientId(builtin, { useCustomClientId: true, customClientId: 'my-id' })).toBe('my-id')
  })

  it('falls back to built-in when the custom id is empty/whitespace', () => {
    expect(resolveTwitchClientId(builtin, { useCustomClientId: true, customClientId: '   ' })).toBe('builtin-id')
    expect(resolveTwitchClientId(builtin, { useCustomClientId: true, customClientId: '' })).toBe('builtin-id')
  })

  it('trims the custom id', () => {
    expect(resolveTwitchClientId(builtin, { useCustomClientId: true, customClientId: '  abc  ' })).toBe('abc')
  })
})
