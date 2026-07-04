import { z } from 'zod'

/** The 11 palette color fields (mirrors PresetPalette and the Theme's color fields). */
export const presetPaletteSchema = z.object({
  backgroundColor: z.string(),
  backgroundOpacity: z.number(),
  circlePegColor: z.string(),
  flatPegColor: z.string(),
  spinnerPegColor: z.string(),
  trianglePegColor: z.string(),
  pegGlowColor: z.string(),
  frameColor: z.string(),
  ballColor: z.string(),
  trailColor: z.string(),
  gateColor: z.string()
})

/** A user-saved theme preset (palette only), stored in the profile and shown in the picker. */
export const savedThemePresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  palette: presetPaletteSchema
})
export type SavedThemePreset = z.infer<typeof savedThemePresetSchema>
