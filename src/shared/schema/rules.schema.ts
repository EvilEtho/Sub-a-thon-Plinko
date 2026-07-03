import { z } from 'zod'

/**
 * How platform events convert into Plinko balls. All fields are user-configurable; these
 * defaults match the product spec.
 */
export const CURRENCY_MODES = ['faceValue', 'primaryOnly', 'convert'] as const
export type CurrencyMode = (typeof CURRENCY_MODES)[number]

export const conversionRulesSchema = z.object({
  dollarsPerBall: z.number().positive().default(5),
  bitsPerBall: z.number().int().positive().default(500),
  subTier1Balls: z.number().int().nonnegative().default(1),
  subTier2Balls: z.number().int().nonnegative().default(2),
  subTier3Balls: z.number().int().nonnegative().default(5),
  ccCoinsPerBall: z.number().int().positive().default(500),
  /** When true, each gifted sub awards balls per its tier; otherwise 1 ball each. */
  giftSubCountsPerSub: z.boolean().default(true),
  /**
   * When true, leftover bits / $ / CC coins are banked per-viewer and added to their next
   * event (e.g. 700 bits at 500/ball = 1 ball now + 200 carried). When false, every event
   * floors independently and the remainder is discarded.
   */
  carryRemainder: z.boolean().default(true),
  /**
   * How to treat donation currencies:
   * - faceValue: use the amount as-is regardless of currency (default)
   * - primaryOnly: only count donations in `primaryCurrency`
   * - convert: multiply by `currencyRates[currency]` (rate → primary units)
   */
  currencyMode: z.enum(CURRENCY_MODES).default('faceValue'),
  primaryCurrency: z.string().default('USD'),
  currencyRates: z.record(z.string(), z.number()).default({})
})
export type ConversionRules = z.infer<typeof conversionRulesSchema>
export const defaultConversionRules = (): ConversionRules => conversionRulesSchema.parse({})

/**
 * Effective donation amount (in primary-currency units) after applying the currency mode.
 * Returns null when the donation should be ignored entirely (primaryOnly, other currency).
 */
export function effectiveDonationAmount(
  rules: ConversionRules,
  amount: number,
  currency: string | undefined
): number | null {
  const cur = (currency ?? rules.primaryCurrency).toUpperCase()
  const primary = rules.primaryCurrency.toUpperCase()
  switch (rules.currencyMode) {
    case 'primaryOnly':
      return cur === primary ? amount : null
    case 'convert': {
      if (cur === primary) return amount
      const rate = rules.currencyRates[cur] ?? rules.currencyRates[currency ?? '']
      return typeof rate === 'number' ? amount * rate : amount
    }
    case 'faceValue':
    default:
      return amount
  }
}

/** Balls for a subscription tier per the rules. */
export function ballsForTier(rules: ConversionRules, tier: 1 | 2 | 3): number {
  switch (tier) {
    case 1:
      return rules.subTier1Balls
    case 2:
      return rules.subTier2Balls
    case 3:
      return rules.subTier3Balls
    default:
      return rules.subTier1Balls
  }
}
