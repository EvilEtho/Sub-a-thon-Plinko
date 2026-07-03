import type { PresetPalette } from './presets'
import type { Profile } from '../schema/profile.schema'
import { defaultTheme } from '../schema/theme.schema'

/**
 * Palette-only themes for the peg board + overlays. Applying one changes ONLY the visual
 * colors (peg/ball/trail/gate/frame/background) — it never touches peg layout, gate geometry,
 * slot outcomes, timer or rules. Distinct from board presets, which also change the layout.
 */
export interface ThemePreset {
  id: string
  name: string
  emoji: string
  vibe: string
  palette: PresetPalette
}

const dt = defaultTheme()

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'stock-pink',
    name: 'Stock Pink',
    emoji: '💗',
    vibe: 'The default neon-pink look.',
    palette: {
      backgroundColor: dt.backgroundColor, backgroundOpacity: dt.backgroundOpacity,
      circlePegColor: dt.circlePegColor, flatPegColor: dt.flatPegColor, spinnerPegColor: dt.spinnerPegColor,
      trianglePegColor: dt.trianglePegColor, pegGlowColor: dt.pegGlowColor, frameColor: dt.frameColor,
      ballColor: dt.ballColor, trailColor: dt.trailColor, gateColor: dt.gateColor
    }
  },
  {
    id: 'mono-white',
    name: 'Mono',
    emoji: '⚪',
    vibe: 'Clean monochrome — white on charcoal.',
    palette: {
      backgroundColor: '#0d0d0f', backgroundOpacity: 0.5,
      circlePegColor: '#f2f2f2', flatPegColor: '#c9c9d1', spinnerPegColor: '#ffffff', trianglePegColor: '#b8b8c2',
      pegGlowColor: '#ffffff', frameColor: '#8a8a95', ballColor: '#ffffff', trailColor: '#d0d0d8', gateColor: '#ffffff'
    }
  },
  {
    id: "cyberpunk-neon", name: "Cyberpunk Neon", emoji: "🏙️", vibe: "Rain-slick Night City: electric magenta and cyan against deep indigo, with a hot amber gate that reads like a warning light.",
    palette: { backgroundColor: "#0a0618", backgroundOpacity: 0.35, circlePegColor: "#00e5ff", flatPegColor: "#7a5cff", spinnerPegColor: "#ff2fb9", trianglePegColor: "#ffd23f", pegGlowColor: "#ff2fb9", frameColor: "#00e5ff", ballColor: "#fdfdff", trailColor: "#ff2fb9", gateColor: "#ffb300" }
  },
  {
    id: "vaporwave-dream", name: "Vaporwave Dream", emoji: "🌅", vibe: "80s mall-poster aesthetic: dusk pink and teal on a bruised-purple sky, soft glow, a mint gate for that pastel nostalgia.",
    palette: { backgroundColor: "#1a0f2e", backgroundOpacity: 0.4, circlePegColor: "#ff6ec7", flatPegColor: "#57e6e0", spinnerPegColor: "#b388ff", trianglePegColor: "#ffd6a5", pegGlowColor: "#ff6ec7", frameColor: "#57e6e0", ballColor: "#fff0fb", trailColor: "#57e6e0", gateColor: "#a0ffcf" }
  },
  {
    id: "synthwave-miami", name: "Synthwave Miami", emoji: "🌴", vibe: "80s Miami sunset synthwave: hot magenta and cyan over a deep indigo grid, dreamy and neon-soft.",
    palette: { backgroundColor: "#1a0b2e", backgroundOpacity: 0.35, circlePegColor: "#ff6ec7", flatPegColor: "#00e5ff", spinnerPegColor: "#c17bff", trianglePegColor: "#ffd166", pegGlowColor: "#ff3ea5", frameColor: "#7b2ff7", ballColor: "#fdf6ff", trailColor: "#00e5ff", gateColor: "#ffe14d" }
  },
  {
    id: "toxic-matrix", name: "Toxic Matrix", emoji: "☢️", vibe: "Digital rain meets hazmat: layered acid greens on near-black with a lime glow, radioactive yellow gate that screams biohazard.",
    palette: { backgroundColor: "#020a04", backgroundOpacity: 0.45, circlePegColor: "#39ff14", flatPegColor: "#0aff9d", spinnerPegColor: "#7dff3a", trianglePegColor: "#c6ff00", pegGlowColor: "#39ff14", frameColor: "#00d46a", ballColor: "#eaffdf", trailColor: "#39ff14", gateColor: "#eaff00" }
  },
  {
    id: "gold-luxe", name: "Gold Luxe", emoji: "👑", vibe: "High-roller casino: warm champagne and antique gold on black velvet, a pearl-white ball and a bright gold gate that feels like a jackpot.",
    palette: { backgroundColor: "#0c0a06", backgroundOpacity: 0.5, circlePegColor: "#ffd76a", flatPegColor: "#c9a227", spinnerPegColor: "#ffe9a8", trianglePegColor: "#e0b34d", pegGlowColor: "#ffcf40", frameColor: "#d4af37", ballColor: "#fff7e0", trailColor: "#ffcf40", gateColor: "#fff1b8" }
  },
  {
    id: "blood-horror", name: "Blood Horror", emoji: "🩸", vibe: "Grindhouse dread: crimson and rust on charcoal-black, a bone-white ball dripping a blood-red trail, sickly ember gate glowing in the dark.",
    palette: { backgroundColor: "#0d0405", backgroundOpacity: 0.5, circlePegColor: "#e01f2b", flatPegColor: "#8a1420", spinnerPegColor: "#ff3b3b", trianglePegColor: "#b5171e", pegGlowColor: "#ff1a1a", frameColor: "#7a0d12", ballColor: "#f2e8dc", trailColor: "#c40d1a", gateColor: "#ff6a2b" }
  },
  {
    id: "oceanic-abyss", name: "Oceanic Abyss", emoji: "🌊", vibe: "Deep-sea bioluminescence: aqua and teal glowing through midnight-blue water, a foam-white ball and a warm coral gate as the one point of heat.",
    palette: { backgroundColor: "#04121f", backgroundOpacity: 0.42, circlePegColor: "#2fe3ff", flatPegColor: "#1f9bd6", spinnerPegColor: "#3affd0", trianglePegColor: "#7fd4ff", pegGlowColor: "#2fe3ff", frameColor: "#0f6f9e", ballColor: "#eafcff", trailColor: "#3affd0", gateColor: "#ff8a5c" }
  },
  {
    id: "holographic-iridescent", name: "Holographic", emoji: "🪩", vibe: "Prismatic foil shimmer: every peg a different facet of the rainbow spectrum on cool graphite dark.",
    palette: { backgroundColor: "#0d0f1a", backgroundOpacity: 0.35, circlePegColor: "#ff9ff3", flatPegColor: "#7afcff", spinnerPegColor: "#b388ff", trianglePegColor: "#a0ffb0", pegGlowColor: "#e0c3fc", frameColor: "#8ec5fc", ballColor: "#ffffff", trailColor: "#ffb3f0", gateColor: "#fff59d" }
  },
  {
    id: "molten-ember", name: "Molten Ember", emoji: "🔥", vibe: "Forge-fire glow: amber and blood-orange embers rising off charcoal-black, a white-hot ball trailing sparks toward a searing golden gate.",
    palette: { backgroundColor: "#100604", backgroundOpacity: 0.48, circlePegColor: "#ff7a18", flatPegColor: "#b5321a", spinnerPegColor: "#ffb43f", trianglePegColor: "#ff5722", pegGlowColor: "#ff8c1a", frameColor: "#7a2410", ballColor: "#fff3e0", trailColor: "#ff9d3f", gateColor: "#ffd54d" }
  }
]

/**
 * Apply a theme preset's palette to the board AND derive matching overlay colors, so one
 * click themes the board + the timer/feed/goals overlays cohesively. Leaves peg layout,
 * slot outcomes, timer and rules untouched.
 */
export function applyThemePreset(profile: Profile, palette: PresetPalette): void {
  Object.assign(profile.theme, palette)
  const o = profile.overlayTheme
  o.accentColor = palette.pegGlowColor
  o.panelColor = palette.backgroundColor
  o.textColor = palette.ballColor
  o.timerColor = palette.ballColor
  o.timerGlowColor = palette.pegGlowColor
  o.goalValueColor = palette.ballColor
  o.goalTimerColor = palette.gateColor
  o.feedSubColor = palette.frameColor
  o.feedBitsColor = palette.circlePegColor
  o.feedCcColor = palette.spinnerPegColor
  o.feedJackpotColor = palette.gateColor
  // donation/prize keep their money-green semantics on purpose.
}
