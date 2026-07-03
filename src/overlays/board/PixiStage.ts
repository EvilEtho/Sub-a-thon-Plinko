import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import type { BoardModel, PegModel } from '@shared/physics/boardModel'
import type { GateRect } from '@shared/physics/simulation'
import type { BoardSlotInfo } from '@shared/types/socket'
import { defaultTheme, pegColorFor, type Theme } from '@shared/schema/theme.schema'
import type { BallSnapshot } from './PhysicsRunner'

interface SlotVisual {
  flashG: Graphics // bright overlay that pulses on a hit (alpha driven by `flash`)
  flash: number
}
interface Particle {
  g: Graphics
  vx: number
  vy: number
  life: number
}
interface BallVisual {
  container: Container
  core: Graphics
  sprite: Sprite | null
  label: Text
  trailG: Graphics
  trail: { x: number; y: number }[]
  hasAvatar: boolean
}

const TRAIL_LEN = 8

function hexToNum(hex: string): number {
  if (typeof hex !== 'string') return 0xffffff
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return Number.isNaN(n) ? 0xffffff : n // NOTE: 0x000000 is valid black — don't use `|| fallback`
}

/**
 * Pixi rendering of the neon Plinko board with many concurrent balls (names + optional
 * Twitch-avatar balls), shaped/spinning pegs, the super gate, a background image, and an
 * optional idle-fade of the board.
 */
export class PixiStage {
  readonly app = new Application()
  private world = new Container()
  private boardGroup = new Container() // faded together when idle
  private bgLayer = new Container()
  private boardLayer = new Container()
  private pegLayer = new Container()
  private gateLayer = new Container()
  private ballLayer = new Container()
  private fxLayer = new Container()

  private model: BoardModel | null = null
  private theme: Theme = defaultTheme()
  private slotVisuals: SlotVisual[] = []
  private pegGfx: Graphics[] = []
  private gateGfx = new Graphics()
  private bgSprite: Sprite | null = null
  private particles: Particle[] = []
  private ballVisuals = new Map<string, BallVisual>()
  private avatarTextures = new Map<string, Texture>()
  private active = false

  async init(mount: HTMLElement): Promise<void> {
    await this.app.init({ backgroundAlpha: 0, antialias: true, resizeTo: window })
    mount.appendChild(this.app.canvas)
    this.boardGroup.addChild(this.bgLayer, this.boardLayer, this.pegLayer, this.gateLayer)
    this.world.addChild(this.boardGroup, this.fxLayer, this.ballLayer)
    this.app.stage.addChild(this.world)
    window.addEventListener('resize', () => this.layout())
    this.app.ticker.add(() => this.renderFx())
  }

  setBoard(model: BoardModel, slots: BoardSlotInfo[], theme?: Theme): void {
    this.model = model
    if (theme) this.theme = theme
    this.boardLayer.removeChildren()
    this.pegLayer.removeChildren()
    this.gateLayer.removeChildren()
    this.slotVisuals = []
    this.pegGfx = []

    const frameColor = hexToNum(this.theme.frameColor)
    const pegGlow = hexToNum(this.theme.pegGlowColor)

    this.applyBackground()

    this.boardLayer.addChild(
      new Graphics().roundRect(2, 2, model.width - 4, model.height - 4, 18).stroke({ width: 4, color: frameColor, alpha: 0.9 })
    )

    const labelStyle = new TextStyle({ fill: 0xffffff, fontSize: 20, fontFamily: 'Segoe UI, sans-serif', fontWeight: '700' })
    for (const info of slots) {
      const geo = model.slots[info.index]
      if (!geo) continue
      const color = hexToNum(info.color)
      const x = geo.xMin + 3
      const w = geo.xMax - geo.xMin - 6
      const y = model.slotAreaTop + 6
      const h = model.height - model.slotAreaTop - 12
      const baseAlpha = info.isSuper ? 0.35 : 0.18
      this.boardLayer.addChild(
        new Graphics()
          .roundRect(x, y, w, h, 8)
          .fill({ color, alpha: baseAlpha })
          .stroke({ width: info.isSuper ? 3 : 2, color, alpha: 0.9 })
      )
      // Separate bright overlay for the hit flash (kept invisible until a ball lands).
      const flashG = new Graphics().roundRect(x, y, w, h, 8).fill({ color, alpha: 1 })
      flashG.alpha = 0
      this.boardLayer.addChild(flashG)
      this.slotVisuals[info.index] = { flashG, flash: 0 }
      const label = new Text({ text: info.label || `${info.index + 1}`, style: labelStyle })
      label.anchor.set(0.5)
      label.x = geo.xCenter
      label.y = y + h / 2
      this.boardLayer.addChild(label)
    }

    for (const d of model.dividers) {
      this.boardLayer.addChild(
        new Graphics().roundRect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 3).fill({ color: frameColor, alpha: 0.6 })
      )
    }

    for (const p of model.pegs) {
      const g = new Graphics()
      drawPeg(g, p, hexToNum(pegColorFor(this.theme, p.shape)), pegGlow)
      g.x = p.x
      g.y = p.y
      g.rotation = p.angle
      this.pegLayer.addChild(g)
      this.pegGfx.push(g)
    }

    if (model.gate) {
      this.gateGfx = new Graphics()
      this.drawGate({ x: model.gate.x, y: model.gate.y, w: model.gate.width, h: model.gate.height })
      this.gateLayer.addChild(this.gateGfx)
    }

    this.layout()
  }

  private drawGate(rect: GateRect): void {
    const color = hexToNum(this.theme.gateColor)
    this.gateGfx
      .clear()
      .roundRect(rect.x - rect.w / 2, rect.y - rect.h / 2, rect.w, rect.h, rect.h / 2)
      .fill({ color, alpha: 0.28 })
      .stroke({ width: 3, color, alpha: 0.95 })
  }

  private applyBackground(): void {
    this.bgSprite?.destroy()
    this.bgSprite = null
    this.bgLayer.removeChildren()
    const model = this.model
    if (!model) return
    // Solid color fill at the configured opacity.
    this.bgLayer.addChild(
      new Graphics()
        .rect(0, 0, model.width, model.height)
        .fill({ color: hexToNum(this.theme.backgroundColor), alpha: this.theme.backgroundOpacity })
    )
    // Optional image drawn over the color.
    const url = this.theme.backgroundImage
    if (!url) return
    const img = new Image()
    img.onload = () => {
      if (!this.model) return
      const sprite = new Sprite(Texture.from(img))
      sprite.width = this.model.width
      sprite.height = this.model.height
      sprite.alpha = this.theme.backgroundOpacity
      this.bgLayer.addChild(sprite)
      this.bgSprite = sprite
    }
    img.src = url
  }

  private layout(): void {
    if (!this.model) return
    const scale = Math.min(this.app.renderer.width / this.model.width, this.app.renderer.height / this.model.height)
    this.world.scale.set(scale)
    this.world.x = (this.app.renderer.width - this.model.width * scale) / 2
    this.world.y = (this.app.renderer.height - this.model.height * scale) / 2
  }

  updateDynamic(pegDynamics: { x: number; y: number; angle: number }[], gate: GateRect | null): void {
    for (let i = 0; i < this.pegGfx.length; i++) {
      const d = pegDynamics[i]
      if (!d) continue
      this.pegGfx[i].rotation = d.angle
      this.pegGfx[i].x = d.x
      this.pegGfx[i].y = d.y
    }
    if (gate && this.model?.gate) this.drawGate(gate)
  }

  setActive(active: boolean): void {
    this.active = active
  }

  /** Number of live ball visuals (for debugging/regression checks). */
  ballVisualCount(): number {
    return this.ballVisuals.size
  }

  /** Render the current set of concurrent balls (creating/removing visuals as needed). */
  renderBalls(snapshots: BallSnapshot[]): void {
    const seen = new Set<string>()
    for (const s of snapshots) {
      seen.add(s.id)
      let v = this.ballVisuals.get(s.id)
      if (!v) {
        v = this.createBallVisual(s)
        this.ballVisuals.set(s.id, v)
      }
      v.container.x = s.x
      v.container.y = s.y
      // trail
      v.trail.push({ x: s.x, y: s.y })
      if (v.trail.length > TRAIL_LEN) v.trail.shift()
      v.trailG.clear()
      for (let i = 0; i < v.trail.length; i++) {
        const p = v.trail[i]
        const t = i / v.trail.length
        v.trailG.circle(p.x - s.x, p.y - s.y, 2 + t * 5).fill({ color: hexToNum(this.theme.trailColor), alpha: t * 0.35 })
      }
      // upgrade to avatar if it became available
      if (!v.hasAvatar && this.theme.useAvatarBalls && s.avatarUrl) this.tryApplyAvatar(v, s.avatarUrl)
    }
    for (const [id, v] of this.ballVisuals) {
      if (!seen.has(id)) {
        v.container.destroy()
        this.ballVisuals.delete(id)
      }
    }
  }

  private createBallVisual(s: BallSnapshot): BallVisual {
    const container = new Container()
    const trailG = new Graphics()
    const core = new Graphics().circle(0, 0, 9).fill({ color: hexToNum(this.theme.ballColor), alpha: 1 })
    const label = new Text({
      text: s.name,
      style: new TextStyle({ fill: 0xffffff, fontSize: 13, fontFamily: 'Segoe UI, sans-serif', fontWeight: '600', stroke: { color: 0x000000, width: 3 } })
    })
    label.anchor.set(0.5, 0)
    label.y = 13
    label.visible = this.theme.showBallNames
    container.addChild(trailG, core, label)
    this.ballLayer.addChild(container)
    const v: BallVisual = { container, core, sprite: null, label, trailG, trail: [], hasAvatar: false }
    if (this.theme.useAvatarBalls && s.avatarUrl) this.tryApplyAvatar(v, s.avatarUrl)
    return v
  }

  private tryApplyAvatar(v: BallVisual, url: string): void {
    const apply = (tex: Texture): void => {
      const size = 24
      const sprite = new Sprite(tex)
      sprite.anchor.set(0.5)
      sprite.width = size
      sprite.height = size
      const mask = new Graphics().circle(0, 0, size / 2).fill({ color: 0xffffff })
      sprite.mask = mask
      const ring = new Graphics().circle(0, 0, size / 2 + 1).stroke({ width: 2, color: hexToNum(this.theme.pegGlowColor), alpha: 0.9 })
      v.core.visible = false
      v.container.addChildAt(mask, 1)
      v.container.addChildAt(sprite, 2)
      v.container.addChildAt(ring, 3)
      v.sprite = sprite
      v.hasAvatar = true
    }
    const cached = this.avatarTextures.get(url)
    if (cached) {
      apply(cached)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const tex = Texture.from(img)
      this.avatarTextures.set(url, tex)
      if (!v.hasAvatar) apply(tex)
    }
    img.src = url
  }

  flashSlot(index: number): void {
    const v = this.slotVisuals[index]
    if (v) v.flash = 1
  }
  gatePulse(rect: GateRect): void {
    this.burst(rect.x, rect.y, hexToNum(this.theme.gateColor), 18)
  }
  burst(x: number, y: number, color = 0xffffff, count = 14): void {
    for (let i = 0; i < count; i++) {
      const g = new Graphics().circle(0, 0, 2 + Math.random() * 2).fill({ color, alpha: 1 })
      g.x = x
      g.y = y
      const a = Math.random() * Math.PI * 2
      const sp = 1 + Math.random() * 4
      this.fxLayer.addChild(g)
      this.particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1 })
    }
  }
  jackpotFlash(): void {
    if (!this.model) return
    const flash = new Graphics().rect(0, 0, this.model.width, this.model.height).fill({ color: 0xffd54d, alpha: 0.45 })
    this.fxLayer.addChild(flash)
    let a = 0.45
    const fade = (): void => {
      a -= 0.03
      flash.alpha = Math.max(0, a)
      if (a <= 0) flash.destroy()
      else requestAnimationFrame(fade)
    }
    requestAnimationFrame(fade)
  }

  private renderFx(): void {
    // Idle fade of the board (balls stay full alpha).
    const targetAlpha = !this.theme.idleFade || this.active ? 1 : 0.12
    this.boardGroup.alpha += (targetAlpha - this.boardGroup.alpha) * 0.08
    for (const v of this.slotVisuals) {
      if (v && v.flash > 0) {
        v.flash = Math.max(0, v.flash - 0.05)
        v.flashG.alpha = v.flash
      }
    }
    for (const p of this.particles) {
      p.vy += 0.15
      p.g.x += p.vx
      p.g.y += p.vy
      p.life -= 0.02
      p.g.alpha = Math.max(0, p.life)
      if (p.life <= 0) p.g.destroy()
    }
    this.particles = this.particles.filter((p) => p.life > 0)
  }
}

function drawPeg(g: Graphics, peg: PegModel, color: number, glow: number): void {
  if (peg.shape === 'flat' || peg.shape === 'spinner') {
    const len = peg.length
    const th = Math.max(4, peg.radius)
    g.roundRect(-len / 2 - 3, -th / 2 - 3, len + 6, th + 6, (th + 6) / 2).fill({ color: glow, alpha: 0.18 })
    g.roundRect(-len / 2, -th / 2, len, th, th / 2).fill({ color, alpha: 0.95 })
  } else if (peg.shape === 'triangle') {
    const r = peg.radius * 1.6
    g.poly(trianglePoints(r).flatMap((p) => [p.x, p.y])).fill({ color: glow, alpha: 0.18 })
    g.poly(trianglePoints(r * 0.82).flatMap((p) => [p.x, p.y])).fill({ color, alpha: 0.95 })
  } else {
    g.circle(0, 0, peg.radius + 5).fill({ color: glow, alpha: 0.18 })
    g.circle(0, 0, peg.radius).fill({ color, alpha: 0.95 })
  }
}

function trianglePoints(r: number): { x: number; y: number }[] {
  return [0, 1, 2].map((k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })
}
