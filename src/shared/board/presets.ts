import { generateDefaultPegs, type Peg, type Gate, type StuckBehavior } from '../schema/board.schema'
import { defaultTheme } from '../schema/theme.schema'
import { defaultSlots } from '../schema/slots.schema'
import type { Profile } from '../schema/profile.schema'
import { makeId } from '../util/id'

/**
 * Premade board designs the streamer can pick from in the designer. Each preset is a pure
 * data recipe: a peg-layout generator + a super-gate config + a cohesive color palette +
 * per-slot tint colors. Applying a preset overwrites the BOARD (pegs/gate/stuck) and the
 * VISUAL theme + slot colors, but deliberately preserves the streamer's economy — slot
 * outcomes/labels, timer, conversion rules, prizes and super-slot behavior are untouched.
 *
 * Coordinate system (see boardModel/constants): 720x900 board, 9 slots ~76px wide with
 * centers at SLOT_X, playfield roughly x 30..690 / y 140..730.
 */

/** The color half of a preset — mirrors the color fields of the Theme. */
export interface PresetPalette {
  backgroundColor: string
  backgroundOpacity: number
  circlePegColor: string
  flatPegColor: string
  spinnerPegColor: string
  trianglePegColor: string
  pegGlowColor: string
  frameColor: string
  ballColor: string
  trailColor: string
  gateColor: string
}

export interface BoardPreset {
  id: string
  name: string
  emoji: string
  vibe: string
  palette: PresetPalette
  gate: Gate
  stuckBehavior: StuckBehavior
  /** Exactly 9 hex colors, one per slot (index 4 = center super slot). */
  slotColors: string[]
  /** Build the peg layout fresh (new ids each call). */
  buildPegs: () => Peg[]
}

// Slot-center x positions (9) and the +38px staggered offsets (8) used across recipes.
const SLOT_X = [54, 130, 207, 283, 360, 436, 513, 589, 665]
const OFFSET_X = [92, 168, 245, 321, 398, 474, 551, 627]

// ---- peg factory helpers ------------------------------------------------

const mk = (
  x: number,
  y: number,
  shape: Peg['shape'],
  o: { radius?: number; angle?: number; spin?: number; length?: number; oscillate?: boolean; oscillateRangePx?: number; oscillatePeriodSec?: number } = {}
): Peg => ({
  id: makeId('peg'),
  x: Math.round(x),
  y: Math.round(y),
  radius: o.radius ?? 7,
  shape,
  angle: o.angle ?? 0,
  spin: o.spin ?? 0,
  length: o.length ?? 46,
  oscillate: o.oscillate ?? false,
  oscillateRangePx: o.oscillateRangePx ?? 40,
  oscillatePeriodSec: o.oscillatePeriodSec ?? 3
})
const C = (x: number, y: number, r = 7): Peg => mk(x, y, 'circle', { radius: r })
const S = (x: number, y: number, length: number, spin: number): Peg =>
  mk(x, y, 'spinner', { length, spin, radius: 7 })
const F = (x: number, y: number, length: number, angle: number): Peg =>
  mk(x, y, 'flat', { length, angle, radius: 7 })
const T = (x: number, y: number, r = 8, spin = 0, angle = 0): Peg =>
  mk(x, y, 'triangle', { radius: r, spin, angle })
/** Oscillating circle. */
const OC = (x: number, y: number, r: number, range: number, period: number): Peg =>
  mk(x, y, 'circle', { radius: r, oscillate: true, oscillateRangePx: range, oscillatePeriodSec: period })
/** Keep an x coordinate inside the playfield. */
const cx = (x: number): number => Math.max(30, Math.min(690, x))
/** Two staggered bottom rows that reliably split any incoming stream into all 9 slots. */
const settlingFan = (): Peg[] => [...OFFSET_X.map((x) => C(x, 688, 6)), ...SLOT_X.map((x) => C(x, 724, 6))]

/** Build a gate config from its distinctive fields (sane defaults for the rest). */
const gate = (o: Partial<Gate>): Gate => ({
  enabled: false,
  x: 360,
  y: 470,
  width: 120,
  height: 16,
  oscillate: false,
  oscillateRangePx: 130,
  oscillatePeriodSec: 4,
  ...o
})

// ---- 1. Neon Nexus — cyberpunk quincunx grid ---------------------------

const neonNexus = (): Peg[] => {
  const pegs: Peg[] = []
  for (let r = 0; r < 10; r++) {
    const y = 140 + 58 * r
    const xs = r % 2 === 0 ? SLOT_X : OFFSET_X
    for (const x of xs) pegs.push(C(x, y, 7))
  }
  return pegs
}

// ---- 2. Molten Hive — honeycomb triangle lattice -----------------------

const moltenHive = (): Peg[] => {
  const pegs: Peg[] = []
  const even = [66, 138, 210, 282, 354, 426, 498, 570, 642]
  const odd = [102, 174, 246, 318, 390, 462, 534, 606]
  let idx = 0
  for (let r = 0; r < 9; r++) {
    const y = 150 + 62 * r
    const xs = r % 2 === 0 ? even : odd
    const angle = r % 2 === 0 ? 0 : Math.PI
    for (const x of xs) {
      pegs.push(T(x, y, 8, idx % 3 === 0 ? 25 : 0, angle))
      idx++
    }
  }
  for (const x of SLOT_X) pegs.push(C(x, 700, 6)) // settling fan
  return pegs
}

// ---- 3. Pinwheel Storm — sparse counter-rotating spinners --------------

const pinwheelStorm = (): Peg[] => {
  const pegs: Peg[] = []
  const rows = [
    { y: 210, xs: [130, 283, 436, 589] },
    { y: 350, xs: [207, 360, 513] },
    { y: 490, xs: [130, 283, 436, 589] },
    { y: 630, xs: [207, 360, 513] }
  ]
  rows.forEach((row, r) =>
    row.xs.forEach((x, c) => pegs.push(S(x, row.y, 70, (r + c) % 2 === 0 ? 120 : -120)))
  )
  for (const x of [92, 245, 398, 551]) pegs.push(C(x, 280, 6))
  for (const x of [168, 321, 474, 627]) pegs.push(C(x, 420, 6))
  for (const x of [92, 245, 398, 551]) pegs.push(C(x, 560, 6))
  for (const x of SLOT_X) pegs.push(C(x, 700, 7))
  return pegs
}

// ---- 4. Emerald Cascade — funnel → zig-zag flats → fan -----------------

const emeraldCascade = (): Peg[] => {
  const pegs: Peg[] = []
  const funnel: [number, number][] = [
    [60, 160], [96, 205], [140, 250], [190, 290], [245, 320],
    [660, 160], [624, 205], [580, 250], [530, 290], [475, 320]
  ]
  for (const [x, y] of funnel) pegs.push(C(x, y, 7))
  const cascade = [
    { y: 380, a: 0.5, xs: [120, 320, 520] },
    { y: 440, a: -0.5, xs: [220, 420, 620] },
    { y: 500, a: 0.5, xs: [120, 320, 520] },
    { y: 560, a: -0.5, xs: [220, 420, 620] },
    { y: 620, a: 0.5, xs: [120, 320, 520] }
  ]
  for (const row of cascade) {
    for (const x of row.xs) {
      // center bar of rows B (y=440) & D (y=560) becomes a small accent spinner
      if (x === 420 && (row.y === 440 || row.y === 560)) pegs.push(S(x, row.y, 40, 60))
      else pegs.push(F(x, row.y, 60, row.a))
    }
  }
  for (const x of OFFSET_X) pegs.push(C(x, 670, 7))
  for (const x of SLOT_X) pegs.push(C(x, 708, 7))
  return pegs
}

// ---- 5. Molten Forge — funnel + spinner hammers + fan ------------------

const moltenForge = (): Peg[] => {
  const pegs: Peg[] = []
  const ys = [150, 197, 244, 290, 337, 383, 430]
  const left = [60, 100, 140, 180, 220, 260, 300]
  const right = [660, 620, 580, 540, 500, 460, 420]
  ys.forEach((y, i) => {
    pegs.push(C(left[i], y, 7))
    pegs.push(C(right[i], y, 7))
  })
  pegs.push(S(360, 300, 70, 140))
  pegs.push(S(360, 400, 60, -160))
  // fan-out rows
  const triX = [130, 283, 360, 436, 589]
  for (const x of SLOT_X) {
    if (triX.includes(x)) pegs.push(T(x, 490, 8, 90))
    else pegs.push(C(x, 490, 7))
  }
  for (const x of OFFSET_X) pegs.push(C(x, 550, 7))
  for (const x of SLOT_X) pegs.push(C(x, 610, 7))
  for (const x of OFFSET_X) pegs.push(C(x, 670, 7))
  return pegs
}

// ---- 6. Frostbite Glacier — minimalist slalom + scatter ----------------

const frostbite = (): Peg[] => {
  const pegs: Peg[] = []
  const slalom: [number, number, number][] = [
    [210, 210, 0.35], [510, 290, -0.35], [210, 370, 0.35],
    [510, 450, -0.35], [210, 530, 0.35], [510, 610, -0.35]
  ]
  for (const [x, y, a] of slalom) pegs.push(F(x, y, 150, a))
  const scatter: [number, number][] = [
    [360, 240], [120, 320], [600, 320], [360, 400], [90, 480],
    [630, 480], [360, 560], [200, 650], [520, 650], [360, 690]
  ]
  for (const [x, y] of scatter) pegs.push(C(x, y, 8))
  for (const x of SLOT_X) pegs.push(C(x, 712, 6))
  return pegs
}

// ---- 7. Void Starfield — sparse star scatter ---------------------------

const voidStarfield = (): Peg[] => {
  const pegs: Peg[] = []
  const rows = [
    [110, 290, 430, 610], // y=190
    [60, 200, 360, 520, 660], // y=300
    [150, 340, 500, 640], // y=410
    [90, 250, 410, 570, 680], // y=530
    [54, 207, 360, 513, 665] // y=640
  ]
  const ys = [190, 300, 410, 530, 640]
  rows.forEach((xs, i) => xs.forEach((x) => pegs.push(C(x, ys[i], 8))))
  pegs.push(S(283, 300, 50, 45))
  pegs.push(S(436, 530, 50, 45))
  pegs.push(T(360, 190, 8, 0))
  pegs.push(T(130, 410, 8, 0))
  pegs.push(T(589, 410, 8, 0))
  for (const x of SLOT_X) pegs.push(C(x, 710, 5))
  return pegs
}

// ---- 8. Pinwheel Party — candy arcade spinners -------------------------

const pinwheelParty = (): Peg[] => {
  const pegs: Peg[] = []
  pegs.push(S(180, 230, 80, 120), S(360, 230, 90, -140), S(540, 230, 80, 120))
  pegs.push(S(270, 380, 80, -130), S(450, 380, 80, 130))
  pegs.push(S(180, 530, 80, 150), S(540, 530, 80, -150))
  for (const x of [54, 141, 228, 315, 402, 489, 576, 665]) pegs.push(C(x, 160, 7))
  for (const x of SLOT_X) pegs.push(C(x, 624, 7))
  for (const x of OFFSET_X) pegs.push(C(x, 684, 7))
  for (const [x, y] of [[40, 300], [40, 470], [680, 300], [680, 470]] as [number, number][])
    pegs.push(C(x, y, 7))
  return pegs
}

// ---- 9. Zen Koi Pond — sparse stepping stones --------------------------

const zenKoi = (): Peg[] => {
  const pegs: Peg[] = []
  const odd = [90, 220, 350, 480, 610] // y=190,370,550
  const even = [155, 285, 415, 545, 670] // y=280,460,640
  const ys = [190, 280, 370, 460, 550, 640]
  ys.forEach((y, r) => {
    const xs = r % 2 === 0 ? odd : even
    for (const x of xs) {
      if (y === 370 && x === 350) pegs.push(S(350, 370, 55, 45))
      else if (y === 460 && x === 415) pegs.push(S(415, 460, 55, -40))
      else pegs.push(C(x, y, 8))
    }
  })
  pegs.push(T(360, 550, 9, 0))
  for (const x of SLOT_X) pegs.push(C(x, 705, 6))
  return pegs
}

// ---- 10. Vaporwave Sunset — zig-zag lattice + chrome flats -------------

const vaporwave = (): Peg[] => {
  const pegs: Peg[] = []
  const ys = [150, 210, 270, 330, 390, 450, 510, 570, 630]
  ys.forEach((y, r) => {
    const xs = r % 2 === 0 ? SLOT_X : OFFSET_X
    const chrome = y === 390 || y === 510
    xs.forEach((x, i) => {
      if (chrome) pegs.push(F(x, y, 40, i % 2 === 0 ? -0.28 : 0.28))
      else pegs.push(C(x, y, 7))
    })
  })
  for (const x of OFFSET_X) pegs.push(C(x, 690, 7)) // settling row
  return pegs
}

// ---- 11. DNA Twist — oscillating double helix --------------------------

const dnaTwist = (): Peg[] => {
  const pegs: Peg[] = []
  for (let y = 160; y <= 700; y += 40) {
    const off = 150 * Math.sin((y - 160) / 90)
    pegs.push(OC(cx(360 + off), y, 7, 30, 2.6))
    pegs.push(OC(cx(360 - off), y, 7, 30, 3.1))
  }
  for (let y = 200; y <= 680; y += 80) {
    const off = Math.abs(2 * 150 * Math.sin((y - 160) / 90))
    pegs.push(S(360, y, Math.max(34, Math.min(80, off)), 60))
  }
  for (const y of [220, 340, 460, 580, 660]) pegs.push(C(45, y, 7), C(680, y, 7))
  for (const y of [300, 500]) pegs.push(C(110, y, 7), C(610, y, 7))
  return [...pegs, ...settlingFan()]
}

// ---- 12. EKG Heartbeat — three offset waveform bands -------------------

const ekgHeartbeat = (): Peg[] => {
  const pegs: Peg[] = []
  const band = (y: number, spikeX: number, dir: number): void => {
    for (const x of [54, 110, 166, 230, 300, 430, 510, 576, 632]) if (Math.abs(x - spikeX) > 44) pegs.push(C(x, y, 7))
    pegs.push(F(spikeX - 45, y + 12, 30, 0.9))
    pegs.push(T(spikeX, y - 60, 8, 120 * dir))
    pegs.push(F(spikeX + 45, y + 12, 30, -0.9))
  }
  band(250, 315, 1)
  band(430, 405, -1)
  band(610, 225, 1)
  pegs.push(mk(360, 150, 'spinner', { length: 70, spin: 200, oscillate: true, oscillateRangePx: 250, oscillatePeriodSec: 2 }))
  return [...pegs, ...settlingFan()]
}

// ---- 13. Pinball Chaos — bumpers, slingshots, kickers ------------------

const pinballChaos = (): Peg[] => {
  const bumpers: [number, number, number][] = [
    [200, 230, 17], [360, 200, 18], [520, 230, 17], [140, 360, 16], [283, 340, 17],
    [437, 340, 17], [580, 360, 16], [230, 470, 17], [490, 470, 17], [360, 430, 18]
  ]
  const pegs = bumpers.map(([x, y, r]) => C(x, y, r))
  pegs.push(F(96, 300, 70, -0.6), F(624, 300, 70, 0.6))
  pegs.push(S(360, 560, 64, 220), S(180, 560, 52, -180), S(540, 560, 52, 180))
  pegs.push(F(250, 650, 90, 0.42), F(470, 650, 90, -0.42))
  for (const [x, y] of [[48, 470], [672, 470], [52, 600], [668, 600]] as [number, number][]) pegs.push(C(x, y, 7))
  return [...pegs, ...settlingFan()]
}

// ---- 14. TV Static — noisy scatter + sliding scanlines ----------------

const tvStatic = (): Peg[] => {
  const pegs: Peg[] = []
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 8; c++) {
      const jx = (((r * 13 + c * 7) % 3) - 1) * 18
      const jy = (((c * 5 + r * 3) % 3) - 1) * 8
      pegs.push(C(cx(60 + c * 88 + jx), 180 + r * 72 + jy, 6))
    }
  }
  for (const x of [90, 190, 290, 390, 490, 590]) pegs.push(OC(x, 300, 7, 60, 2.4))
  for (const x of [140, 240, 340, 440, 540]) pegs.push(OC(x, 470, 7, 60, 3))
  pegs.push(mk(360, 150, 'spinner', { length: 64, spin: 300, oscillate: true, oscillateRangePx: 250, oscillatePeriodSec: 1.6 }))
  return [...pegs, ...settlingFan()]
}

// ---- 15. Tesla Coil — crackling central bolt + coil rings -------------

const teslaCoil = (): Peg[] => {
  const pegs: Peg[] = []
  let left = true
  for (let y = 150; y <= 600; y += 34) {
    pegs.push(T(360 + (left ? -40 : 40), y, 8, 90))
    left = !left
  }
  for (const [ox] of [[150], [570]] as [number][]) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      pegs.push(C(ox + 40 * Math.cos(a), 360 + 40 * Math.sin(a), 6))
    }
  }
  for (const y of [260, 460, 600]) pegs.push(C(50, y, 7), C(670, y, 7))
  return [...pegs, ...settlingFan()]
}

// ---- 16. Lightning Bolt — forked zig-zag -------------------------------

const lightningBolt = (): Peg[] => {
  const pegs: Peg[] = []
  const bolt: [number, number][] = [[360, 150], [300, 220], [380, 290], [320, 360], [420, 430], [360, 500], [300, 560]]
  bolt.forEach(([x, y], i) => pegs.push(T(x, y, 9, i % 2 ? 70 : -70)))
  for (const [x, y] of [[420, 300], [470, 360], [520, 430]] as [number, number][]) pegs.push(T(x, y, 8, 70))
  for (const [x, y] of [[100, 240], [600, 240], [140, 420], [620, 420], [90, 560], [640, 560], [210, 560], [520, 560]] as [number, number][]) pegs.push(C(x, y, 7))
  return [...pegs, ...settlingFan()]
}

// ---- 17. Mushroom Rings — fairy-ring clusters -------------------------

const mushroomRings = (): Peg[] => {
  const pegs: Peg[] = []
  const ring = (ox: number, oy: number, rr: number, n: number): void => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      pegs.push(C(cx(ox + rr * Math.cos(a)), oy + rr * Math.sin(a), 6))
    }
  }
  ring(200, 280, 55, 8)
  ring(360, 400, 70, 10)
  ring(540, 280, 55, 8)
  ring(280, 560, 45, 7)
  ring(470, 560, 45, 7)
  pegs.push(OC(360, 200, 8, 60, 3.2))
  return [...pegs, ...settlingFan()]
}

// ---- 18. Piston Wave — columns of oscillating pegs (a rolling wave) ----

const pistonWave = (): Peg[] => {
  const pegs: Peg[] = []
  const cols = [110, 200, 290, 380, 470, 560, 650]
  cols.forEach((x, ci) => {
    for (let y = 200; y <= 620; y += 70) pegs.push(OC(x, y, 7, 34, 2.2 + ci * 0.25))
  })
  return [...pegs, ...settlingFan()]
}

// ---- 19. Spiral Vortex — an Archimedean spiral disc --------------------

const spiralVortex = (): Peg[] => {
  const pegs: Peg[] = []
  for (let i = 0; i < 78; i++) {
    const a = i * 0.5
    const r = 16 + i * 4.2
    const x = 360 + r * Math.cos(a)
    const y = 420 + r * Math.sin(a) * 0.62
    if (x > 34 && x < 686 && y > 150 && y < 700) pegs.push(C(x, y, 6))
  }
  return [...pegs, ...settlingFan()]
}

// ---- 20. Smiley — a big happy face made of pegs ------------------------

const smiley = (): Peg[] => {
  const pegs: Peg[] = []
  // TOP DOME only (a full circle would form a ball-trapping bowl at the bottom).
  for (let k = 0; k <= 18; k++) {
    const a = Math.PI + (k / 18) * Math.PI // left-middle → over the top → right-middle
    pegs.push(C(cx(360 + 300 * Math.cos(a)), 420 + 300 * Math.sin(a), 6))
  }
  // Eyes as single dots (clusters/rings would trap balls).
  pegs.push(C(255, 300, 8), C(465, 300, 8))
  // A shallow smile of widely-spaced pegs — balls fall THROUGH the gaps, so it deflects
  // without cupping. Spacing (~50px) exceeds a ball's diameter (18px) plus peg radii.
  for (let k = 0; k <= 5; k++) {
    const x = 236 + k * 49.6
    pegs.push(C(x, 446 - 0.0016 * (x - 360) * (x - 360), 6))
  }
  return [...pegs, ...settlingFan()]
}

// ---- preset table -------------------------------------------------------

export const BOARD_PRESETS: BoardPreset[] = [
  {
    id: 'neon-nexus-grid',
    name: 'Neon Nexus',
    emoji: '🟪',
    vibe: 'Clean cyberpunk quincunx grid glowing magenta & cyan — the reliable arcade staple.',
    palette: {
      backgroundColor: '#0a0118', backgroundOpacity: 0.55,
      circlePegColor: '#00e5ff', flatPegColor: '#ff2fd6', spinnerPegColor: '#a855ff', trianglePegColor: '#ff2fd6',
      pegGlowColor: '#00e5ff', frameColor: '#ff2fd6', ballColor: '#ffffff', trailColor: '#00e5ff', gateColor: '#ffe14d'
    },
    gate: gate({ enabled: true, x: 360, y: 472, width: 120, height: 16, oscillate: true, oscillateRangePx: 130, oscillatePeriodSec: 4 }),
    stuckBehavior: 'redrop',
    slotColors: ['#00e5ff', '#3fa0ff', '#5c6bff', '#7c4dff', '#ff2fd6', '#7c4dff', '#5c6bff', '#3fa0ff', '#00e5ff'],
    buildPegs: neonNexus
  },
  {
    id: 'molten-honeycomb',
    name: 'Molten Hive',
    emoji: '🍯',
    vibe: 'A glowing hexagonal foundry of amber triangle cells with a honey-drip super gate.',
    palette: {
      backgroundColor: '#1a0a02', backgroundOpacity: 0.6,
      circlePegColor: '#ffb300', flatPegColor: '#ff6a00', spinnerPegColor: '#ffd54a', trianglePegColor: '#ff3d00',
      pegGlowColor: '#ff8f00', frameColor: '#ff6a00', ballColor: '#fff3d6', trailColor: '#ffb300', gateColor: '#ffd54a'
    },
    gate: gate({ enabled: true, x: 360, y: 497, width: 220, height: 14, oscillate: false }),
    stuckBehavior: 'noclip',
    slotColors: ['#ff3d00', '#ff6a00', '#ff8f00', '#ffb300', '#ffd54a', '#ffb300', '#ff8f00', '#ff6a00', '#ff3d00'],
    buildPegs: moltenHive
  },
  {
    id: 'pinwheel-storm',
    name: 'Pinwheel Storm',
    emoji: '🌀',
    vibe: 'Sparse counter-rotating spinners on an icy field — a lucky, lightning-fast super.',
    palette: {
      backgroundColor: '#050d1a', backgroundOpacity: 0.6,
      circlePegColor: '#8fb8ff', flatPegColor: '#3d5a80', spinnerPegColor: '#00d9ff', trianglePegColor: '#7cf5ff',
      pegGlowColor: '#00d9ff', frameColor: '#4cc9f0', ballColor: '#eaf6ff', trailColor: '#4cc9f0', gateColor: '#7cf5ff'
    },
    gate: gate({ enabled: true, x: 360, y: 428, width: 80, height: 16, oscillate: true, oscillateRangePx: 170, oscillatePeriodSec: 2.6 }),
    stuckBehavior: 'redrop',
    slotColors: ['#3d5a80', '#4174a0', '#4cc9f0', '#5fddf5', '#7cf5ff', '#5fddf5', '#4cc9f0', '#4174a0', '#3d5a80'],
    buildPegs: pinwheelStorm
  },
  {
    id: 'emerald-funnel-cascade',
    name: 'Emerald Cascade',
    emoji: '💎',
    vibe: 'A jade funnel into a zig-zag waterfall of angled deflectors — high-roller elegance.',
    palette: {
      backgroundColor: '#04140f', backgroundOpacity: 0.6,
      circlePegColor: '#5eead4', flatPegColor: '#2dd4bf', spinnerPegColor: '#facc15', trianglePegColor: '#34d399',
      pegGlowColor: '#2dd4bf', frameColor: '#0f766e', ballColor: '#fdf6d0', trailColor: '#5eead4', gateColor: '#facc15'
    },
    gate: gate({ enabled: true, x: 360, y: 410, width: 120, height: 16, oscillate: false }),
    stuckBehavior: 'redrop',
    slotColors: ['#0f766e', '#149484', '#2dd4bf', '#5eead4', '#facc15', '#5eead4', '#2dd4bf', '#149484', '#0f766e'],
    buildPegs: emeraldCascade
  },
  {
    id: 'molten-forge-funnel',
    name: 'Molten Forge',
    emoji: '🔥',
    vibe: "A blacksmith's forge: spinning hammer-bars funnel white-hot balls then blast them across nine molds.",
    palette: {
      backgroundColor: '#120806', backgroundOpacity: 0.72,
      circlePegColor: '#ff7b00', flatPegColor: '#4d4d4d', spinnerPegColor: '#ff3b00', trianglePegColor: '#ffb300',
      pegGlowColor: '#ff5500', frameColor: '#2b2b2b', ballColor: '#fff3d6', trailColor: '#ff7b00', gateColor: '#ffd000'
    },
    gate: gate({ enabled: true, x: 360, y: 448, width: 80, height: 18, oscillate: false }),
    stuckBehavior: 'redrop',
    slotColors: ['#3a2418', '#5c3a1e', '#a34e12', '#ff7b00', '#fff3d6', '#ff7b00', '#a34e12', '#5c3a1e', '#3a2418'],
    buildPegs: moltenForge
  },
  {
    id: 'frostbite-glacier-zen',
    name: 'Frostbite Glacier',
    emoji: '❄️',
    vibe: 'A calm ice cavern: a gentle slalom of angled flats lets the ball glide down like a snowflake.',
    palette: {
      backgroundColor: '#04121f', backgroundOpacity: 0.5,
      circlePegColor: '#a8e0ff', flatPegColor: '#5eead4', spinnerPegColor: '#c4b5fd', trianglePegColor: '#e0f7ff',
      pegGlowColor: '#7dd3fc', frameColor: '#0b2a3d', ballColor: '#ffffff', trailColor: '#a8e0ff', gateColor: '#5eead4'
    },
    gate: gate({ enabled: false, x: 360, y: 470, width: 120, height: 16 }),
    stuckBehavior: 'redrop',
    slotColors: ['#0e7490', '#3596b8', '#7dd3fc', '#a8e0ff', '#e0f7ff', '#a8e0ff', '#7dd3fc', '#3596b8', '#0e7490'],
    buildPegs: frostbite
  },
  {
    id: 'void-starfield-drift',
    name: 'Void Starfield',
    emoji: '🌌',
    vibe: 'A minimalist deep-space board — glowing star-bumpers scattered across the void, a slow wormhole super.',
    palette: {
      backgroundColor: '#020208', backgroundOpacity: 0.7,
      circlePegColor: '#e8ecff', flatPegColor: '#6c5ce7', spinnerPegColor: '#a29bfe', trianglePegColor: '#ffd166',
      pegGlowColor: '#8ab4ff', frameColor: '#0a0a1a', ballColor: '#ffe08a', trailColor: '#8ab4ff', gateColor: '#ffd166'
    },
    gate: gate({ enabled: true, x: 360, y: 460, width: 76, height: 22, oscillate: true, oscillateRangePx: 210, oscillatePeriodSec: 6 }),
    stuckBehavior: 'redrop',
    slotColors: ['#1b1b3a', '#26264d', '#332f66', '#4a3f8a', '#ffd166', '#4a3f8a', '#332f66', '#26264d', '#1b1b3a'],
    buildPegs: voidStarfield
  },
  {
    id: 'arcade-pinwheel-party',
    name: 'Pinwheel Party',
    emoji: '🎡',
    vibe: 'A candy-bright arcade of whirling pinwheels on bubblegum blue — chaotic, joyful confetti slots.',
    palette: {
      backgroundColor: '#0e1b3a', backgroundOpacity: 0.62,
      circlePegColor: '#ffffff', flatPegColor: '#22d3ee', spinnerPegColor: '#f43f5e', trianglePegColor: '#a855f7',
      pegGlowColor: '#38bdf8', frameColor: '#1e3a8a', ballColor: '#fde047', trailColor: '#f43f5e', gateColor: '#a3e635'
    },
    gate: gate({ enabled: true, x: 360, y: 455, width: 100, height: 16, oscillate: true, oscillateRangePx: 140, oscillatePeriodSec: 3.5 }),
    stuckBehavior: 'redrop',
    slotColors: ['#f43f5e', '#fb923c', '#fde047', '#a3e635', '#22d3ee', '#38bdf8', '#6366f1', '#a855f7', '#ec4899'],
    buildPegs: pinwheelParty
  },
  {
    id: 'zen-koi-pond',
    name: 'Zen Koi Pond',
    emoji: '🪷',
    vibe: 'Minimalist Japanese calm: smooth stepping-stones and slow lily-pad spinners on an ink-wash pond.',
    palette: {
      backgroundColor: '#0b2b2b', backgroundOpacity: 0.6,
      circlePegColor: '#e8f3ec', flatPegColor: '#7fb8a6', spinnerPegColor: '#f6a5b8', trianglePegColor: '#d4af37',
      pegGlowColor: '#9fe6d4', frameColor: '#123b3b', ballColor: '#ff7a59', trailColor: '#f6a5b8', gateColor: '#d4af37'
    },
    gate: gate({ enabled: false, x: 360, y: 490, width: 70, height: 14 }),
    stuckBehavior: 'redrop',
    slotColors: ['#cfe6dd', '#7fb8a6', '#4f8f7d', '#2f6b5e', '#d4af37', '#2f6b5e', '#4f8f7d', '#7fb8a6', '#cfe6dd'],
    buildPegs: zenKoi
  },
  {
    id: 'vaporwave-sunset-cascade',
    name: 'Vaporwave Sunset',
    emoji: '🌇',
    vibe: "A retro-'80s synthwave sunset: offset diamond rows with chrome-slide flats melting into a purple horizon.",
    palette: {
      backgroundColor: '#1a0b2e', backgroundOpacity: 0.6,
      circlePegColor: '#ff5fd2', flatPegColor: '#00e5ff', spinnerPegColor: '#ffd166', trianglePegColor: '#ff8c42',
      pegGlowColor: '#ff2d95', frameColor: '#7b2ff7', ballColor: '#00e5ff', trailColor: '#ff5fd2', gateColor: '#ffd166'
    },
    gate: gate({ enabled: true, x: 360, y: 470, width: 120, height: 16, oscillate: true, oscillateRangePx: 100, oscillatePeriodSec: 4.5 }),
    stuckBehavior: 'redrop',
    slotColors: ['#3a1078', '#5a1fb0', '#7b2ff7', '#c026a8', '#ffd166', '#ff5fd2', '#ff8c42', '#ffb257', '#ffd166'],
    buildPegs: vaporwave
  },
  {
    id: 'dna-twist',
    name: 'DNA Twist',
    emoji: '🧬',
    vibe: 'Two oscillating sine-wave strands cross like a living helix, joined by slow turning base-pair rungs.',
    palette: {
      backgroundColor: '#041014', backgroundOpacity: 0.75,
      circlePegColor: '#26e6c3', flatPegColor: '#c6ff5e', spinnerPegColor: '#7cffcb', trianglePegColor: '#5eead4',
      pegGlowColor: '#39ffd0', frameColor: '#062b2b', ballColor: '#eafff5', trailColor: '#5eead4', gateColor: '#c6ff5e'
    },
    gate: gate({ enabled: true, x: 360, y: 460, width: 80, height: 24, oscillate: true, oscillateRangePx: 40, oscillatePeriodSec: 2.6 }),
    stuckBehavior: 'noclip',
    slotColors: ['#0f766e', '#14b8a6', '#2dd4bf', '#7cffcb', '#eafff5', '#c6ff5e', '#a3e635', '#65a30d', '#3f6212'],
    buildPegs: dnaTwist
  },
  {
    id: 'ekg-heartbeat',
    name: 'EKG Heartbeat',
    emoji: '💚',
    vibe: 'A cardiac monitor: three stacked waveform bands spike in different columns, with a racing pulse sweep up top.',
    palette: {
      backgroundColor: '#02140a', backgroundOpacity: 0.72,
      circlePegColor: '#39ff88', flatPegColor: '#39ff88', spinnerPegColor: '#b6ff00', trianglePegColor: '#eafffc',
      pegGlowColor: '#39ff88', frameColor: '#0c3a1e', ballColor: '#eaffea', trailColor: '#39ff88', gateColor: '#b6ff00'
    },
    gate: gate({ enabled: true, x: 405, y: 470, width: 70, height: 16, oscillate: false }),
    stuckBehavior: 'noclip',
    slotColors: ['#0c3a1e', '#146b2f', '#1f9e45', '#39ff88', '#b6ff00', '#39ff88', '#1f9e45', '#146b2f', '#0c3a1e'],
    buildPegs: ekgHeartbeat
  },
  {
    id: 'pinball-chaos',
    name: 'Pinball Chaos',
    emoji: '🕹️',
    vibe: 'A coin-op cabinet: fat pop-bumpers, slingshots and spinning kickers ricochet the ball into confetti slots.',
    palette: {
      backgroundColor: '#0a0224', backgroundOpacity: 0.6,
      circlePegColor: '#ff2e63', flatPegColor: '#00f0ff', spinnerPegColor: '#ffe600', trianglePegColor: '#ff8c00',
      pegGlowColor: '#ff2e63', frameColor: '#1b0b4d', ballColor: '#ffffff', trailColor: '#ffe600', gateColor: '#00f0ff'
    },
    gate: gate({ enabled: true, x: 360, y: 500, width: 96, height: 18, oscillate: true, oscillateRangePx: 110, oscillatePeriodSec: 3 }),
    stuckBehavior: 'redrop',
    slotColors: ['#ff2e63', '#ff5c3a', '#ff8c00', '#ffe600', '#00f0ff', '#ffe600', '#ff8c00', '#ff5c3a', '#ff2e63'],
    buildPegs: pinballChaos
  },
  {
    id: 'broken-tv-static',
    name: 'TV Static',
    emoji: '📺',
    vibe: 'A glitching dead channel: a snow field of noise pegs with two desynced sliding scanlines and a tearing top edge.',
    palette: {
      backgroundColor: '#050505', backgroundOpacity: 0.78,
      circlePegColor: '#f2f2f2', flatPegColor: '#ff0033', spinnerPegColor: '#00e0ff', trianglePegColor: '#39ff14',
      pegGlowColor: '#ff0033', frameColor: '#111111', ballColor: '#00e0ff', trailColor: '#ff0033', gateColor: '#39ff14'
    },
    gate: gate({ enabled: true, x: 360, y: 470, width: 80, height: 16, oscillate: true, oscillateRangePx: 180, oscillatePeriodSec: 2.2 }),
    stuckBehavior: 'noclip',
    slotColors: ['#ff0033', '#ff6a00', '#f2f2f2', '#00e0ff', '#39ff14', '#00e0ff', '#f2f2f2', '#ff6a00', '#ff0033'],
    buildPegs: tvStatic
  },
  {
    id: 'tesla-coil',
    name: 'Tesla Coil',
    emoji: '⚡',
    vibe: 'A crackling central bolt of spinning triangles between two humming coil rings — electric blue on deep night.',
    palette: {
      backgroundColor: '#0a0618', backgroundOpacity: 0.7,
      circlePegColor: '#4fc3ff', flatPegColor: '#b388ff', spinnerPegColor: '#e0f7ff', trianglePegColor: '#7c4dff',
      pegGlowColor: '#66e0ff', frameColor: '#1a1040', ballColor: '#fff59d', trailColor: '#82e9ff', gateColor: '#d500f9'
    },
    gate: gate({ enabled: true, x: 360, y: 470, width: 80, height: 16, oscillate: true, oscillateRangePx: 120, oscillatePeriodSec: 3 }),
    stuckBehavior: 'redrop',
    slotColors: ['#3949ab', '#5c6bc0', '#7c4dff', '#b388ff', '#e0f7ff', '#b388ff', '#7c4dff', '#5c6bc0', '#3949ab'],
    buildPegs: teslaCoil
  },
  {
    id: 'lightning-bolt',
    name: 'Lightning Bolt',
    emoji: '🌩️',
    vibe: 'A forked bolt of jagged triangles splitting down a stormy violet sky.',
    palette: {
      backgroundColor: '#0b0820', backgroundOpacity: 0.7,
      circlePegColor: '#b98cff', flatPegColor: '#ffe14d', spinnerPegColor: '#8fd8ff', trianglePegColor: '#fff27a',
      pegGlowColor: '#e6b3ff', frameColor: '#241a4d', ballColor: '#fffbe6', trailColor: '#ffe14d', gateColor: '#fff27a'
    },
    gate: gate({ enabled: true, x: 360, y: 470, width: 90, height: 16, oscillate: false }),
    stuckBehavior: 'redrop',
    slotColors: ['#3a2a7a', '#4d38a0', '#6a4fd0', '#8f6cff', '#fff27a', '#b98cff', '#9a6cf0', '#6f45c8', '#4a2ea0'],
    buildPegs: lightningBolt
  },
  {
    id: 'mushroom-rings',
    name: 'Mushroom Rings',
    emoji: '🍄',
    vibe: 'An enchanted forest of fairy rings — clustered toadstool circles glowing coral and gold on mossy green.',
    palette: {
      backgroundColor: '#0e2415', backgroundOpacity: 0.7,
      circlePegColor: '#ff6f61', flatPegColor: '#f4e4c1', spinnerPegColor: '#ffd166', trianglePegColor: '#b5179e',
      pegGlowColor: '#ffe08a', frameColor: '#1b3a24', ballColor: '#fff8e1', trailColor: '#ffd166', gateColor: '#b5179e'
    },
    gate: gate({ enabled: true, x: 360, y: 480, width: 90, height: 16, oscillate: true, oscillateRangePx: 100, oscillatePeriodSec: 3.5 }),
    stuckBehavior: 'redrop',
    slotColors: ['#2e5d34', '#4a7c3a', '#8ab04a', '#ffd166', '#fff8e1', '#ff9e6d', '#ff6f61', '#b5179e', '#6a1b9a'],
    buildPegs: mushroomRings
  },
  {
    id: 'piston-wave',
    name: 'Piston Wave',
    emoji: '🌊',
    vibe: 'Columns of oscillating pegs pulse out of phase, so the whole wall rolls like a mechanical ocean wave.',
    palette: {
      backgroundColor: '#0a0f12', backgroundOpacity: 0.7,
      circlePegColor: '#22d3ee', flatPegColor: '#ff7a1a', spinnerPegColor: '#ffd000', trianglePegColor: '#a0f0ff',
      pegGlowColor: '#5ff0ff', frameColor: '#1a2630', ballColor: '#fff4e6', trailColor: '#ff7a1a', gateColor: '#ffd000'
    },
    gate: gate({ enabled: true, x: 360, y: 470, width: 100, height: 16, oscillate: true, oscillateRangePx: 120, oscillatePeriodSec: 3 }),
    stuckBehavior: 'noclip',
    slotColors: ['#0c4a52', '#106470', '#147f8e', '#189aad', '#ffd000', '#ff9a3d', '#ff7a1a', '#e05c00', '#a83e00'],
    buildPegs: pistonWave
  },
  {
    id: 'spiral-vortex',
    name: 'Spiral Vortex',
    emoji: '🌀',
    vibe: 'A hypnotic galaxy spiral of pegs winding out from the center — balls swirl the arms down into the slots.',
    palette: {
      backgroundColor: '#0a0416', backgroundOpacity: 0.6,
      circlePegColor: '#c04cff', flatPegColor: '#7a3cff', spinnerPegColor: '#ff4cf0', trianglePegColor: '#ff4cf0',
      pegGlowColor: '#c04cff', frameColor: '#6a1fb0', ballColor: '#ffffff', trailColor: '#c04cff', gateColor: '#ffd166'
    },
    gate: gate({ enabled: true, x: 360, y: 470, width: 80, height: 16, oscillate: true, oscillateRangePx: 130, oscillatePeriodSec: 4 }),
    stuckBehavior: 'redrop',
    slotColors: ['#3a1078', '#5a1fb0', '#7c2fd6', '#a24cff', '#ff4cf0', '#a24cff', '#7c2fd6', '#5a1fb0', '#3a1078'],
    buildPegs: spiralVortex
  },
  {
    id: 'smiley-face',
    name: 'Smiley',
    emoji: '🙂',
    vibe: 'A big goofy grin drawn in pegs — two eyes and a smile that scatter the balls with pure serotonin.',
    palette: {
      backgroundColor: '#141000', backgroundOpacity: 0.5,
      circlePegColor: '#ffe14d', flatPegColor: '#ffd23f', spinnerPegColor: '#ffcf40', trianglePegColor: '#ff8c42',
      pegGlowColor: '#ffe14d', frameColor: '#ffb300', ballColor: '#ffffff', trailColor: '#ffe14d', gateColor: '#ff5db1'
    },
    gate: gate({ enabled: false, x: 360, y: 470, width: 80, height: 16 }),
    stuckBehavior: 'noclip',
    slotColors: ['#ff8c42', '#ffa93d', '#ffc24d', '#ffd76a', '#ff5db1', '#ffd76a', '#ffc24d', '#ffa93d', '#ff8c42'],
    buildPegs: smiley
  }
]

/** The stock board: the classic staggered grid + the default theme + default slot colors. */
export const DEFAULT_PRESET: BoardPreset = (() => {
  const t = defaultTheme()
  return {
    id: 'default',
    name: 'Default',
    emoji: '◻️',
    vibe: 'The classic staggered peg grid with the stock neon-pink theme — a clean starting point.',
    palette: {
      backgroundColor: t.backgroundColor,
      backgroundOpacity: t.backgroundOpacity,
      circlePegColor: t.circlePegColor,
      flatPegColor: t.flatPegColor,
      spinnerPegColor: t.spinnerPegColor,
      trianglePegColor: t.trianglePegColor,
      pegGlowColor: t.pegGlowColor,
      frameColor: t.frameColor,
      ballColor: t.ballColor,
      trailColor: t.trailColor,
      gateColor: t.gateColor
    },
    gate: gate({ enabled: false }),
    stuckBehavior: 'redrop',
    slotColors: defaultSlots().map((s) => s.color),
    buildPegs: generateDefaultPegs
  }
})()

/**
 * Apply a preset onto a profile IN PLACE: replaces board pegs/gate/stuck behavior and the
 * visual palette + per-slot colors, while preserving the streamer's slot outcomes/labels,
 * timer, conversion rules, prizes and super-slot behavior.
 */
export function applyPreset(profile: Profile, preset: BoardPreset): void {
  profile.board.pegs = preset.buildPegs()
  profile.board.gate = { ...preset.gate }
  profile.board.stuckBehavior = preset.stuckBehavior

  // The palette keys are exactly the Theme's color fields, so this only touches visuals and
  // leaves idleFade / showBallNames / useAvatarBalls / backgroundImage untouched.
  Object.assign(profile.theme, preset.palette)

  preset.slotColors.forEach((color, i) => {
    if (profile.slots[i]) profile.slots[i].color = color
  })
}
