import { z } from 'zod'
import { profileSchema, type Profile } from './profile.schema'

/**
 * A "layout" is the shareable game design — everything the designer edits except the
 * per-user identity + integration config. Saving/loading/exporting layouts lets streamers
 * swap boards or share them; full settings export (the whole profile) is separate.
 */
export const layoutSchema = profileSchema.pick({
  board: true,
  slots: true,
  superSlot: true,
  timer: true,
  rules: true,
  theme: true,
  overlayTheme: true,
  dropMode: true,
  autoDropGapMs: true,
  prizes: true
})
export type Layout = z.infer<typeof layoutSchema>

export function extractLayout(profile: Profile): Layout {
  return {
    board: profile.board,
    slots: profile.slots,
    superSlot: profile.superSlot,
    timer: profile.timer,
    rules: profile.rules,
    theme: profile.theme,
    overlayTheme: profile.overlayTheme,
    dropMode: profile.dropMode,
    autoDropGapMs: profile.autoDropGapMs,
    prizes: profile.prizes
  }
}

/** Merge a (possibly partial) layout onto a profile and re-validate. */
export function applyLayoutToProfile(profile: Profile, layout: Partial<Layout>): Profile {
  return profileSchema.parse({ ...profile, ...layout })
}
