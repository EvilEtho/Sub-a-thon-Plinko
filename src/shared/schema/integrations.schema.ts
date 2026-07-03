import { z } from 'zod'

/**
 * Non-secret integration config (enable flags + Streamer.bot connection). Tokens/secrets
 * are NOT stored here — they live encrypted in the SecretStore (Electron safeStorage).
 */
export const integrationsConfigSchema = z.object({
  twitch: z
    .object({
      enabled: z.boolean().default(false),
      /** Use the streamer's OWN Twitch app instead of the built-in public client id. */
      useCustomClientId: z.boolean().default(false),
      /** The streamer's own public Twitch client id (not a secret). */
      customClientId: z.string().default('')
    })
    .default(() => ({ enabled: false, useCustomClientId: false, customClientId: '' })),
  streamlabs: z
    .object({ enabled: z.boolean().default(false) })
    .default(() => ({ enabled: false })),
  streamElements: z
    .object({ enabled: z.boolean().default(false) })
    .default(() => ({ enabled: false })),
  streamerbot: z
    .object({
      enabled: z.boolean().default(false),
      host: z.string().default('127.0.0.1'),
      port: z.number().int().positive().default(8080),
      /** Crowd Control coin sources to EXCLUDE (e.g. coins bought with bits). */
      excludeSources: z.array(z.string()).default(['Twitch-Bits'])
    })
    .default(() => ({ enabled: false, host: '127.0.0.1', port: 8080, excludeSources: ['Twitch-Bits'] }))
})
export type IntegrationsConfig = z.infer<typeof integrationsConfigSchema>
export const defaultIntegrationsConfig = (): IntegrationsConfig => integrationsConfigSchema.parse({})

/**
 * Resolve which Twitch client id to use: the streamer's own when they've opted in and set one,
 * otherwise the built-in public client id baked in at build time. Pure (for easy testing).
 */
export function resolveTwitchClientId(
  builtin: string,
  twitch: { useCustomClientId: boolean; customClientId: string }
): string {
  return twitch.useCustomClientId && twitch.customClientId.trim()
    ? twitch.customClientId.trim()
    : builtin
}
