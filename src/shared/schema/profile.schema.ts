import { z } from 'zod'
import { conversionRulesSchema } from './rules.schema'
import { timerConfigSchema } from './timer.schema'
import { slotConfigSchema, defaultSlots } from './slots.schema'
import { superSlotConfigSchema } from './superslot.schema'
import { boardLayoutSchema } from './board.schema'
import { prizeSchema } from './prize.schema'
import { integrationsConfigSchema } from './integrations.schema'
import { themeSchema } from './theme.schema'
import { overlayThemeSchema } from './overlay.schema'
import { savedThemePresetSchema } from './themePreset.schema'

/**
 * Versioned streamer profile. Bump SCHEMA_VERSION and add a migration in
 * ./migrations whenever the persisted shape changes.
 */
export const SCHEMA_VERSION = 1

export const DROP_MODES = ['auto', 'manual'] as const
export type DropMode = (typeof DROP_MODES)[number]

export const profileSchema = z.object({
  schemaVersion: z.number().int().default(SCHEMA_VERSION),
  id: z.string().default('default'),
  displayName: z.string().default('My Subathon'),
  rules: conversionRulesSchema.default(() => conversionRulesSchema.parse({})),
  timer: timerConfigSchema.default(() => timerConfigSchema.parse({})),
  slots: z.array(slotConfigSchema).default(() => defaultSlots()),
  superSlot: superSlotConfigSchema.default(() => superSlotConfigSchema.parse({})),
  board: boardLayoutSchema.default(() => boardLayoutSchema.parse({})),
  theme: themeSchema.default(() => themeSchema.parse({})),
  overlayTheme: overlayThemeSchema.default(() => overlayThemeSchema.parse({})),
  savedThemePresets: z.array(savedThemePresetSchema).default([]),
  dropMode: z.enum(DROP_MODES).default('auto'),
  autoDropGapMs: z.number().int().positive().default(1200),
  prizes: z.array(prizeSchema).default([]),
  integrations: integrationsConfigSchema.default(() => integrationsConfigSchema.parse({}))
})

export type Profile = z.infer<typeof profileSchema>
export const defaultProfile = (): Profile => profileSchema.parse({})
