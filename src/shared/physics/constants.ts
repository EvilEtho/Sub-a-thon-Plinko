/**
 * Physics + board constants shared by the headless solver (main) and the live overlay
 * renderer. Both sides MUST use identical values and a fixed timestep so a given
 * (spawnX, seed) lands in the same slot everywhere (determinism / fairness).
 */
export const PHYSICS = {
  gravityY: 1,
  timeStepMs: 1000 / 60,
  ballRestitution: 0.35,
  pegRestitution: 0.5,
  wallRestitution: 0.3,
  friction: 0.02,
  frictionAir: 0.012,
  ballRadius: 9,
  pegRadius: 7,
  maxSteps: 1500
} as const

export const DEFAULT_BOARD = {
  width: 720,
  height: 900,
  wall: 16,
  slots: 9,
  pegRows: 9,
  pegTopY: 150,
  pegRowGap: 58,
  slotHeight: 150
} as const
