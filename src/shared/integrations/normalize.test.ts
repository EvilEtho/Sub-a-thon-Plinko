import { describe, it, expect } from 'vitest'
import { mapStreamElementsTip, mapStreamlabsDonation, tierFromTwitch } from './normalize'

describe('tierFromTwitch', () => {
  it('maps tier strings/numbers to 1/2/3', () => {
    expect(tierFromTwitch('1000')).toBe(1)
    expect(tierFromTwitch('2000')).toBe(2)
    expect(tierFromTwitch('3000')).toBe(3)
    expect(tierFromTwitch(undefined)).toBe(1)
    expect(tierFromTwitch('prime')).toBe(1) // NaN -> tier 1
  })
})

describe('mapStreamlabsDonation', () => {
  it('parses string amounts and currency', () => {
    const e = mapStreamlabsDonation({ name: 'Alice', amount: '13.37', currency: 'USD' })
    expect(e.kind).toBe('donation')
    expect(e.source).toBe('streamlabs')
    expect(e.amount).toBeCloseTo(13.37)
    expect(e.currency).toBe('USD')
    expect(e.displayName).toBe('Alice')
  })
  it('defaults anonymous + zero on bad input', () => {
    const e = mapStreamlabsDonation({ amount: 'oops' })
    expect(e.amount).toBe(0)
    expect(e.displayName).toBe('Anonymous')
  })
})

describe('mapStreamElementsTip', () => {
  it('maps tip amount + name', () => {
    const e = mapStreamElementsTip({ username: 'bob', amount: 5, currency: 'USD' })
    expect(e.source).toBe('streamelements')
    expect(e.kind).toBe('donation')
    expect(e.amount).toBe(5)
    expect(e.userId).toBe('bob')
  })
})
