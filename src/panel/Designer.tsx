import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Profile } from '@shared/schema/profile.schema'
import { defaultProfile } from '@shared/schema/profile.schema'
import {
  generateDefaultPegs,
  STUCK_BEHAVIORS,
  type Peg,
  type PegShape,
  type StuckBehavior
} from '@shared/schema/board.schema'
import type { SlotConfig, SlotOutcome } from '@shared/schema/slots.schema'
import type { TimerConfig } from '@shared/schema/timer.schema'
import type { CurrencyMode } from '@shared/schema/rules.schema'
import { OVERLAY_FONTS, GOAL_STAT_KEYS, type GoalStatKey } from '@shared/schema/overlay.schema'
import type { Layout } from '@shared/schema/layout.schema'
import { BOARD_PRESETS, DEFAULT_PRESET, applyPreset, type BoardPreset } from '@shared/board/presets'
import { THEME_PRESETS, applyThemePreset } from '@shared/board/themePresets'
import { buildBoardModel } from '@shared/physics/boardModel'
import { PHYSICS } from '@shared/physics/constants'
import { makeId } from '@shared/util/id'
import { formatDuration } from '@shared/util/time'

type PegMode = 'move' | 'add'
type Tab = 'gate' | 'slots' | 'rules' | 'theme' | 'overlays'
const FONT_LABELS: Record<string, string> = {
  [OVERLAY_FONTS[0]]: 'Segoe UI (default)',
  [OVERLAY_FONTS[1]]: 'Bahnschrift (techy)',
  [OVERLAY_FONTS[2]]: 'Cascadia Mono',
  [OVERLAY_FONTS[3]]: 'Impact (bold)',
  [OVERLAY_FONTS[4]]: 'Georgia (serif)',
  [OVERLAY_FONTS[5]]: 'Trebuchet MS'
}
const GOAL_STAT_LABELS: Record<GoalStatKey, string> = {
  timer: 'Timer', subs: 'Subs', bits: 'Bits', dollars: '$ Raised', ccCoins: 'CC coins',
  balls: 'Balls', timeAdded: 'Time +', timeRemoved: 'Time −'
}
const CANVAS_W = 440
const CANVAS_H = 550

interface Ghost {
  x: number
  y: number
  shape: PegShape
  radius: number
  length: number
  angle: number
}
interface DragState {
  kind: 'move' | 'place' | 'adjust'
  indices: number[]
  sx: number
  sy: number
  r0: number
  s0: number
  a0: number
  l0: number
}

const isBar = (shape: PegShape): boolean => shape === 'flat' || shape === 'spinner'
const pegColorFor = (t: Profile['theme'], shape: PegShape): string =>
  shape === 'flat'
    ? t.flatPegColor
    : shape === 'spinner'
      ? t.spinnerPegColor
      : shape === 'triangle'
        ? t.trianglePegColor
        : t.circlePegColor

export function Designer() {
  const [draft, setDraft] = useState<Profile | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('plinko.designerTab') as Tab) || 'gate')
  const [applied, setApplied] = useState<string | null>(null)
  const [pegMode, setPegMode] = useState<PegMode>('move')
  const [mirror, setMirror] = useState(false)
  const [pegShape, setPegShape] = useState<PegShape>('circle')
  const [pegSpin, setPegSpin] = useState(120)
  const [pegSize, setPegSize] = useState(7)
  const [pegLength, setPegLength] = useState(46)
  const [pegAngle, setPegAngle] = useState(0)
  const [pegOsc, setPegOsc] = useState(false)
  const [pegOscRange, setPegOscRange] = useState(40)
  const [pegOscPeriod, setPegOscPeriod] = useState(3)
  const [snapGrid, setSnapGrid] = useState(false)
  const [gridSize, setGridSize] = useState(30)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [layoutName, setLayoutName] = useState('')
  const [userLayouts, setUserLayouts] = useState<Record<string, Layout>>({})
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const bgImgRef = useRef<HTMLImageElement | null>(null)

  const snap = (v: number): number => (snapGrid ? Math.round(v / gridSize) * gridSize : v)
  const newPeg = (x: number, y: number): Peg => ({
    id: makeId('peg'),
    x: snap(x),
    y: snap(y),
    radius: pegSize,
    shape: pegShape,
    angle: (pegAngle * Math.PI) / 180,
    spin: pegSpin,
    length: pegLength,
    oscillate: pegOsc,
    oscillateRangePx: pegOscRange,
    oscillatePeriodSec: pegOscPeriod
  })

  const refreshLayouts = useCallback((): void => {
    window.plinko?.getLayouts?.().then(setUserLayouts).catch(() => {})
  }, [])

  const load = useCallback((): void => {
    window.plinko?.getProfile().then((p) => {
      setDraft(p)
      setDirty(false)
      setApplied(null)
    })
    refreshLayouts()
  }, [refreshLayouts])
  useEffect(() => load(), [load])

  useEffect(() => {
    const url = draft?.theme.backgroundImage
    if (!url) {
      bgImgRef.current = null
      return
    }
    const img = new Image()
    img.onload = () => {
      bgImgRef.current = img // the animation loop picks it up on the next frame
    }
    img.src = url
  }, [draft?.theme.backgroundImage])

  const mutate = (fn: (p: Profile) => void): void => {
    setDraft((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      fn(next)
      return next
    })
    setDirty(true)
  }

  const chooseTab = (t: Tab): void => {
    setTab(t)
    localStorage.setItem('plinko.designerTab', t)
  }

  const choosePreset = (preset: BoardPreset): void => {
    mutate((p) => applyPreset(p, preset))
    setApplied(preset.id)
  }
  const chooseUserDesign = (name: string, layout: Layout): void => {
    mutate((p) => Object.assign(p, structuredClone(layout)))
    setApplied('user:' + name)
  }
  const deleteUserDesign = (name: string): void => {
    window.plinko?.deleteLayout?.(name).then(refreshLayouts).catch(() => {})
  }

  const save = (): void => {
    if (!draft) return
    window.plinko?.updateProfile(draft).then((p) => {
      setDraft(p)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    })
  }

  // Latest render inputs the animation loop reads (avoids stale closures without re-subscribing).
  const sceneRef = useRef<{
    draft: Profile | null
    grid: number
    cursor: { x: number; y: number } | null
    pegMode: PegMode
    mirror: boolean
    pegShape: PegShape
    pegSize: number
    pegLength: number
    pegAngle: number
  }>({ draft, grid: 0, cursor, pegMode, mirror, pegShape, pegSize, pegLength, pegAngle })
  sceneRef.current = { draft, grid: snapGrid ? gridSize : 0, cursor, pegMode, mirror, pegShape, pegSize, pegLength, pegAngle }

  // Animate the editor canvas so spinning pegs rotate and oscillating pegs slide (with ghost
  // trails) — the streamer sees exactly what the live board will do.
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const s = sceneRef.current
      if (s.draft) {
        const ghosts: Ghost[] =
          s.pegMode === 'add' && s.cursor && !dragRef.current
            ? ghostsFor(s.cursor.x, s.cursor.y, s, s.mirror, s.draft.board.width)
            : []
        drawBoard(canvasRef.current, s.draft, bgImgRef.current, s.grid, CANVAS_W, CANVAS_H, ghosts, performance.now())
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const toBoard = (e: React.PointerEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!canvas || !draft) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * draft.board.width,
      y: ((e.clientY - rect.top) / rect.height) * draft.board.height
    }
  }
  const pegAt = (pegs: Peg[], x: number, y: number): number =>
    pegs.findIndex((p) => {
      if (p.shape === 'flat' || p.shape === 'spinner') {
        // Hit-test the rotated bar along its whole length, not just a circle at its center.
        const dx = x - p.x
        const dy = y - p.y
        const c = Math.cos(-p.angle)
        const s = Math.sin(-p.angle)
        const lx = dx * c - dy * s
        const ly = dx * s + dy * c
        return Math.abs(lx) < p.length / 2 + 10 && Math.abs(ly) < Math.max(4, p.radius) + 10
      }
      return Math.hypot(p.x - x, p.y - y) < p.radius + 12
    })
  const mirrorPartner = (pegs: Peg[], i: number, width: number): number => {
    const p = pegs[i]
    const mx = width - p.x
    if (Math.abs(mx - p.x) < 6) return -1 // near the centerline: it's its own mirror
    let best = -1
    let bestD = 18
    pegs.forEach((q, j) => {
      if (j === i) return
      const d = Math.hypot(q.x - mx, q.y - p.y)
      if (d < bestD) {
        bestD = d
        best = j
      }
    })
    return best
  }

  // Mouse-wheel over the canvas changes THICKNESS/size — the hovered peg (+ its mirror), else the
  // new-peg default. Native non-passive listener so we can preventDefault the page scroll.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent): void => {
      const s = sceneRef.current
      if (!s.draft) return
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * s.draft.board.width
      const y = ((e.clientY - rect.top) / rect.height) * s.draft.board.height
      const step = e.deltaY < 0 ? 1 : -1
      const i = pegAt(s.draft.board.pegs, x, y)
      if (i >= 0) {
        const nr = Math.max(2, Math.min(40, s.draft.board.pegs[i].radius + step))
        const W = s.draft.board.width
        mutate((p) => {
          if (p.board.pegs[i]) p.board.pegs[i].radius = nr
          if (s.mirror) {
            const partner = mirrorPartner(p.board.pegs, i, W)
            if (partner >= 0 && p.board.pegs[partner]) p.board.pegs[partner].radius = nr
          }
        })
        setPegSize(nr)
      } else {
        setPegSize((v) => Math.max(2, Math.min(40, v + step)))
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
    // Re-run once the profile loads and the canvas actually exists to attach to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft != null])

  const onPointerDown = (e: React.PointerEvent): void => {
    const pt = toBoard(e)
    if (!pt || !draft) return
    const W = draft.board.width
    canvasRef.current?.setPointerCapture(e.pointerId)

    // Right-click removes the peg under the cursor (+ its mirror when mirror mode is on).
    if (e.button === 2) {
      mutate((p) => {
        const i = pegAt(p.board.pegs, pt.x, pt.y)
        if (i < 0) return
        const partner = mirror ? mirrorPartner(p.board.pegs, i, W) : -1
        const toRemove = new Set([i, partner].filter((k) => k >= 0))
        p.board.pegs = p.board.pegs.filter((_, k) => !toRemove.has(k))
      })
      return
    }
    if (e.button !== 0) return

    if (pegMode === 'add') {
      const base = draft.board.pegs.length
      const indices = [base]
      const doMirror = mirror && Math.abs(W - snap(pt.x) - snap(pt.x)) > 12
      if (doMirror) indices.push(base + 1)
      mutate((p) => {
        const peg = newPeg(pt.x, pt.y)
        p.board.pegs.push(peg)
        // Mirror gets reflected tilt + counter-spin so the pair looks symmetric.
        if (doMirror) p.board.pegs.push({ ...peg, id: makeId('peg'), x: snap(W - peg.x), angle: -peg.angle, spin: -peg.spin })
      })
      dragRef.current = { kind: 'place', indices, sx: e.clientX, sy: e.clientY, r0: pegSize, s0: pegSpin, a0: (pegAngle * Math.PI) / 180, l0: pegLength }
      return
    }

    // move mode
    const i = pegAt(draft.board.pegs, pt.x, pt.y)
    if (i < 0) return
    const partner = mirror ? mirrorPartner(draft.board.pegs, i, W) : -1
    const indices = [i, partner].filter((k) => k >= 0)
    if (e.shiftKey) {
      const g = draft.board.pegs[i]
      dragRef.current = { kind: 'adjust', indices, sx: e.clientX, sy: e.clientY, r0: g.radius, s0: g.spin, a0: g.angle, l0: g.length }
    } else {
      dragRef.current = { kind: 'move', indices, sx: e.clientX, sy: e.clientY, r0: 0, s0: 0, a0: 0, l0: 0 }
    }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const pt = toBoard(e)
    const drag = dragRef.current
    if (!drag) {
      if (pegMode === 'add' && pt) setCursor(pt)
      return
    }
    if (!draft || !pt) return
    const W = draft.board.width

    if (drag.kind === 'move') {
      const [i, partner] = drag.indices
      mutate((p) => {
        if (p.board.pegs[i]) {
          p.board.pegs[i].x = snap(pt.x)
          p.board.pegs[i].y = snap(pt.y)
        }
        if (partner !== undefined && p.board.pegs[partner]) {
          p.board.pegs[partner].x = snap(W - snap(pt.x))
          p.board.pegs[partner].y = snap(pt.y)
        }
      })
      return
    }
    // place / adjust: horizontal = LENGTH (bars) or SIZE (circle/triangle);
    // vertical = TILT (flat) or SPIN (spinner/triangle). Thickness is the mouse wheel.
    const dx = e.clientX - drag.sx
    const dyUp = drag.sy - e.clientY
    const length = Math.max(8, Math.min(400, Math.round(drag.l0 + dx * 0.4)))
    const radius = Math.max(2, Math.min(60, Math.round(drag.r0 + dx * 0.15)))
    mutate((p) => {
      const shape = p.board.pegs[drag.indices[0]]?.shape
      const bar = shape === 'flat' || shape === 'spinner'
      const angle = drag.a0 + dyUp * 0.01 // radians
      const spin = Math.round(drag.s0 + dyUp * 2)
      for (const k of drag.indices) {
        const peg = p.board.pegs[k]
        if (!peg) continue
        const sign = k === drag.indices[0] ? 1 : -1 // mirror partner reflects tilt / counter-spins
        if (bar) peg.length = length
        else peg.radius = radius
        if (shape === 'flat') peg.angle = sign * angle
        else if (shape === 'spinner' || shape === 'triangle') peg.spin = sign * spin
      }
    })
  }

  const endDrag = (e: React.PointerEvent): void => {
    const drag = dragRef.current
    if (drag && (drag.kind === 'place' || drag.kind === 'adjust') && draft) {
      const peg = draft.board.pegs[drag.indices[0]]
      if (peg) {
        // Remember length/size + tilt/spin so the next peg you place matches.
        if (peg.shape === 'flat' || peg.shape === 'spinner') setPegLength(peg.length)
        else setPegSize(peg.radius)
        if (peg.shape === 'flat') setPegAngle(Math.round((peg.angle * 180) / Math.PI))
        else if (peg.shape === 'spinner' || peg.shape === 'triangle') setPegSpin(peg.spin)
      }
    }
    dragRef.current = null
    canvasRef.current?.releasePointerCapture?.(e.pointerId)
  }

  const onBgFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => mutate((p) => (p.theme.backgroundImage = String(rd.result)))
    rd.readAsDataURL(f)
  }

  const doSaveLayout = (): void => {
    if (!layoutName.trim()) return
    window.plinko?.saveLayout?.(layoutName.trim()).then(() => {
      setLayoutName('')
      refreshLayouts()
    })
  }

  const applyDefaults = (): void =>
    mutate((p) =>
      p.board.pegs.forEach((peg) => {
        peg.shape = pegShape
        peg.spin = pegSpin
        peg.radius = pegSize
        peg.length = pegLength
        peg.angle = (pegAngle * Math.PI) / 180
        peg.oscillate = pegOsc
        peg.oscillateRangePx = pegOscRange
        peg.oscillatePeriodSec = pegOscPeriod
      })
    )

  if (!draft) return <div className="deck">Loading profile…</div>

  const userNames = Object.keys(userLayouts).sort()

  return (
    <div className="designer">
      <div className="designer-bar">
        <button className="btn primary" onClick={save} disabled={!dirty}>
          {saved ? 'Saved ✓' : dirty ? 'Save changes' : 'Saved'}
        </button>
        <button className="btn" onClick={load}>
          Revert
        </button>
        {dirty && <span className="dirty-dot" title="unsaved changes" />}
        <span className="muted">Edits apply to your overlays live after saving.</span>
      </div>

      <div className="designer-2pane">
        {/* LEFT: builder + gallery + backup */}
        <div className="designer-left">
          <section className="panel">
            <div className="panel-title">
              Board <span className="hint">{draft.board.pegs.length} pegs</span>
            </div>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="board-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={(e) => {
                setCursor(null)
                if (dragRef.current) endDrag(e)
              }}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="row wrap" style={{ marginTop: 10 }}>
              <div className="seg">
                {(['move', 'add'] as PegMode[]).map((m) => (
                  <button key={m} className={pegMode === m ? 'on' : ''} onClick={() => setPegMode(m)}>
                    {m}
                  </button>
                ))}
              </div>
              <button className={`btn small ${mirror ? 'primary' : ''}`} onClick={() => setMirror((v) => !v)} title="Mirror actions across the center">
                ⇋ Mirror
              </button>
              <label className="mini">
                <input type="checkbox" checked={snapGrid} onChange={(e) => setSnapGrid(e.target.checked)} /> grid
              </label>
              {snapGrid && (
                <label className="mini">
                  size
                  <input className="input tiny" type="number" value={gridSize} onChange={(e) => setGridSize(Math.max(5, Number(e.target.value)))} />
                </label>
              )}
            </div>
            <p className="tiny-note">
              {pegMode === 'add'
                ? `Click to drop, then drag: ← → ${isBar(pegShape) ? 'length' : 'size'}, ↑ ↓ ${pegShape === 'flat' ? 'tilt' : 'spin'}. Scroll = thickness. Right-click removes.`
                : 'Drag to move. Shift + drag: ← → length/size, ↑ ↓ tilt (flats) / spin (spinners). Scroll over a peg = thickness. Right-click removes.'}
            </p>
            <div className="row wrap">
              <span className="muted">New peg</span>
              <select className="input" value={pegShape} onChange={(e) => setPegShape(e.target.value as PegShape)}>
                <option value="circle">circle</option>
                <option value="flat">flat (angled bar)</option>
                <option value="spinner">spinner (rotating bar)</option>
                <option value="triangle">triangle</option>
              </select>
              <label className="mini" title={isBar(pegShape) ? 'Bar thickness (or scroll the mouse wheel over a peg)' : 'Peg size / radius (or scroll the mouse wheel over a peg)'}>
                {isBar(pegShape) ? 'thickness' : 'size'}
                <input className="input tiny" type="number" value={pegSize} onChange={(e) => setPegSize(Math.max(2, Number(e.target.value)))} />
              </label>
              {isBar(pegShape) && (
                <label className="mini" title="How long the bar is (drag ← → on the board)">length<input className="input tiny" type="number" value={pegLength} onChange={(e) => setPegLength(Math.max(8, Number(e.target.value)))} /></label>
              )}
              {(pegShape === 'spinner' || pegShape === 'triangle') && (
                <label className="mini" title="Rotation speed in degrees per second (negative spins the other way)">spin°/s<input className="input tiny" type="number" value={pegSpin} onChange={(e) => setPegSpin(Number(e.target.value))} /></label>
              )}
              {pegShape === 'flat' && (
                <label className="mini" title="Tilt of the bar in degrees">tilt°<input className="input tiny" type="number" value={pegAngle} onChange={(e) => setPegAngle(Number(e.target.value))} /></label>
              )}
            </div>
            <div className="row wrap">
              <label className="mini">
                <input type="checkbox" checked={pegOsc} onChange={(e) => setPegOsc(e.target.checked)} /> oscillate ⇆
              </label>
              {pegOsc && (
                <>
                  <label className="mini">range<input className="input tiny" type="number" value={pegOscRange} onChange={(e) => setPegOscRange(Math.max(0, Number(e.target.value)))} /></label>
                  <label className="mini">period s<input className="input tiny" type="number" step="0.5" value={pegOscPeriod} onChange={(e) => setPegOscPeriod(Math.max(0.5, Number(e.target.value)))} /></label>
                </>
              )}
            </div>
            <div className="row wrap">
              <button className="btn small" onClick={applyDefaults}>Apply to all</button>
              <button className="btn small" onClick={() => mutate((p) => (p.board.pegs = generateDefaultPegs()))}>Reset pegs</button>
              <button className="btn small" onClick={() => mutate((p) => (p.board.pegs = []))}>Clear pegs</button>
            </div>
          </section>

          <section className="panel accent">
            <div className="panel-title">Premade Designs</div>
            <div className="preset-gallery">
              <PresetTile preset={DEFAULT_PRESET} active={applied === DEFAULT_PRESET.id} onClick={() => choosePreset(DEFAULT_PRESET)} />
              {BOARD_PRESETS.map((preset) => (
                <PresetTile key={preset.id} preset={preset} active={applied === preset.id} onClick={() => choosePreset(preset)} />
              ))}
            </div>
            <p className="tiny-note">
              One click loads a board layout + colors. Keeps your slot rewards, timer & rules. Applies on
              <strong> Save</strong>.
            </p>

            {userNames.length > 0 && (
              <>
                <div className="subhead" style={{ marginTop: 12 }}>Your Designs</div>
                <div className="preset-gallery">
                  {userNames.map((name) => (
                    <UserTile
                      key={name}
                      name={name}
                      layout={userLayouts[name]}
                      active={applied === 'user:' + name}
                      onClick={() => chooseUserDesign(name, userLayouts[name])}
                      onDelete={() => deleteUserDesign(name)}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-title">Layouts & Backup</div>
            <div className="row wrap">
              <input className="input" placeholder="save current as…" value={layoutName} onChange={(e) => setLayoutName(e.target.value)} />
              <button className="btn small" onClick={doSaveLayout}>Save design</button>
            </div>
            <p className="tiny-note">Saved designs appear as tiles under “Your Designs” above.</p>
            <div className="row wrap">
              <button className="btn small" onClick={() => window.plinko?.exportLayout?.().catch(() => {})}>Export layout</button>
              <button className="btn small" onClick={() => window.plinko?.importLayout?.().then((p) => p && (setDraft(p), setDirty(false), setApplied(null)))}>Import layout</button>
            </div>
            <div className="row wrap">
              <button className="btn small" onClick={() => window.plinko?.exportSettings?.().catch(() => {})}>Export all settings</button>
              <button className="btn small" onClick={() => window.plinko?.importSettings?.().then((p) => p && (setDraft(p), setDirty(false), setApplied(null)))}>Import all settings</button>
            </div>
            <p className="tiny-note">Layouts save the board design; settings export your whole setup (tokens excluded).</p>
          </section>
        </div>

        {/* RIGHT: tabbed inspector */}
        <div className="designer-right">
          <div className="subtabs">
            <button className={`subtab ${tab === 'gate' ? 'on' : ''}`} onClick={() => chooseTab('gate')}>Gate & Super</button>
            <button className={`subtab ${tab === 'slots' ? 'on' : ''}`} onClick={() => chooseTab('slots')}>Slots & Prizes</button>
            <button className={`subtab ${tab === 'rules' ? 'on' : ''}`} onClick={() => chooseTab('rules')}>Timer & Rules</button>
            <button className={`subtab ${tab === 'theme' ? 'on' : ''}`} onClick={() => chooseTab('theme')}>Theme & Display</button>
            <button className={`subtab ${tab === 'overlays' ? 'on' : ''}`} onClick={() => chooseTab('overlays')}>Overlays</button>
          </div>

          <div className="subtab-body">
            {tab === 'gate' && (
              <section className="panel">
                <div className="panel-title">Super Gate</div>
                <div className="form">
                  <Field label="Enabled">
                    <input type="checkbox" checked={draft.board.gate.enabled} onChange={(e) => mutate((p) => (p.board.gate.enabled = e.target.checked))} />
                  </Field>
                  <NumField label="X" value={draft.board.gate.x} onChange={(v) => mutate((p) => (p.board.gate.x = v))} />
                  <NumField label="Y" value={draft.board.gate.y} onChange={(v) => mutate((p) => (p.board.gate.y = v))} />
                  <NumField label="Width" value={draft.board.gate.width} onChange={(v) => mutate((p) => (p.board.gate.width = Math.max(10, v)))} />
                  <NumField label="Height" value={draft.board.gate.height} onChange={(v) => mutate((p) => (p.board.gate.height = Math.max(6, v)))} />
                  <Field label="Oscillate side-to-side">
                    <input type="checkbox" checked={draft.board.gate.oscillate} onChange={(e) => mutate((p) => (p.board.gate.oscillate = e.target.checked))} />
                  </Field>
                  <NumField label="Oscillate range (px)" value={draft.board.gate.oscillateRangePx} onChange={(v) => mutate((p) => (p.board.gate.oscillateRangePx = v))} />
                  <NumField label="Oscillate period (s)" value={draft.board.gate.oscillatePeriodSec} onChange={(v) => mutate((p) => (p.board.gate.oscillatePeriodSec = Math.max(0.5, v)))} />
                  <div className="subhead">Effect when a ball passes the gate</div>
                  <Field label="Behavior">
                    <select className="input" value={draft.superSlot.behavior} onChange={(e) => mutate((p) => (p.superSlot.behavior = e.target.value as Profile['superSlot']['behavior']))}>
                      <option value="redropDoubledEscalating">Re-drop 2x, escalating</option>
                      <option value="redropDoubledOnce">Re-drop 2x once</option>
                      <option value="instantJackpot">Instant jackpot</option>
                    </select>
                  </Field>
                  <NumField label="Escalation factor" value={draft.superSlot.escalationFactor} onChange={(v) => mutate((p) => (p.superSlot.escalationFactor = v))} />
                  <NumField label="Jackpot seconds" value={draft.superSlot.jackpotSeconds} onChange={(v) => mutate((p) => (p.superSlot.jackpotSeconds = v))} />
                  <NumField label="Max re-drops" value={draft.superSlot.maxRedrops} onChange={(v) => mutate((p) => (p.superSlot.maxRedrops = Math.max(1, Math.round(v))))} />
                </div>
              </section>
            )}

            {tab === 'slots' && (
              <>
                <section className="panel">
                  <div className="panel-title">Slots</div>
                  <div className="slots-editor">
                    {draft.slots.map((slot, i) => (
                      <SlotRow key={i} slot={slot} onChange={(patch) => mutate((p) => Object.assign(p.slots[i], patch))} onOutcome={(o) => mutate((p) => (p.slots[i].outcome = o))} />
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-title">Prizes</div>
                  <p className="muted">Reference a prize by its id in a slot's "prize" outcome.</p>
                  <div className="slots-editor">
                    {draft.prizes.map((pz, i) => (
                      <div className="slot-row" key={i}>
                        <input className="input slot-label" placeholder="id" value={pz.id} onChange={(e) => mutate((p) => (p.prizes[i].id = e.target.value))} />
                        <input className="input" placeholder="name" value={pz.name} onChange={(e) => mutate((p) => (p.prizes[i].name = e.target.value))} />
                        <input className="input slot-val" type="number" step="0.05" min="0" max="1" title="win chance" value={pz.winChance} onChange={(e) => mutate((p) => (p.prizes[i].winChance = Number(e.target.value)))} />
                        <button className="btn small" onClick={() => mutate((p) => p.prizes.splice(i, 1))}>✕</button>
                      </div>
                    ))}
                    {draft.prizes.length === 0 && <p className="muted">No prizes yet.</p>}
                  </div>
                  <button className="btn small" style={{ marginTop: 8 }} onClick={() => mutate((p) => p.prizes.push({ id: makeId('prize'), name: 'New prize', winChance: 1 }))}>Add prize</button>
                </section>
              </>
            )}

            {tab === 'rules' && (
              <>
                <section className="panel">
                  <div className="panel-title">Timer</div>
                  <div className="form">
                    <Field label="Mode">
                      <select className="input" value={draft.timer.mode} onChange={(e) => mutate((p) => (p.timer.mode = e.target.value as TimerConfig['mode']))}>
                        <option value="countdown">Countdown</option>
                        <option value="reverse">Reverse (balls remove time)</option>
                        <option value="mixed">Mixed</option>
                      </select>
                    </Field>
                    <HmsField label="Start time" value={draft.timer.startSeconds} onChange={(v) => mutate((p) => (p.timer.startSeconds = v))} />
                    <HmsField label="Max cap (0 = none)" value={draft.timer.maxCapSeconds ?? 0} onChange={(v) => mutate((p) => (p.timer.maxCapSeconds = v > 0 ? v : undefined))} />
                    <HmsField label="Min floor" value={draft.timer.minFloorSeconds} onChange={(v) => mutate((p) => (p.timer.minFloorSeconds = v))} />
                    <NumField label="Seconds per 1x multiplier" value={draft.timer.baseSecondsPerBall} onChange={(v) => mutate((p) => (p.timer.baseSecondsPerBall = v))} />
                    <Field label="Allow negative">
                      <input type="checkbox" checked={draft.timer.allowNegative} onChange={(e) => mutate((p) => (p.timer.allowNegative = e.target.checked))} />
                    </Field>
                    <Field label="Tick down in real time">
                      <input type="checkbox" checked={draft.timer.realtimeTick} onChange={(e) => mutate((p) => (p.timer.realtimeTick = e.target.checked))} />
                    </Field>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-title">Conversion Rules</div>
                  <div className="form">
                    <NumField label="$ per ball" value={draft.rules.dollarsPerBall} onChange={(v) => mutate((p) => (p.rules.dollarsPerBall = v))} />
                    <NumField label="Bits per ball" value={draft.rules.bitsPerBall} onChange={(v) => mutate((p) => (p.rules.bitsPerBall = Math.round(v)))} />
                    <NumField label="Tier 1 balls" value={draft.rules.subTier1Balls} onChange={(v) => mutate((p) => (p.rules.subTier1Balls = Math.round(v)))} />
                    <NumField label="Tier 2 balls" value={draft.rules.subTier2Balls} onChange={(v) => mutate((p) => (p.rules.subTier2Balls = Math.round(v)))} />
                    <NumField label="Tier 3 balls" value={draft.rules.subTier3Balls} onChange={(v) => mutate((p) => (p.rules.subTier3Balls = Math.round(v)))} />
                    <NumField label="CC coins per ball" value={draft.rules.ccCoinsPerBall} onChange={(v) => mutate((p) => (p.rules.ccCoinsPerBall = Math.round(v)))} />
                    <Field label="Gift subs count per tier">
                      <input type="checkbox" checked={draft.rules.giftSubCountsPerSub} onChange={(e) => mutate((p) => (p.rules.giftSubCountsPerSub = e.target.checked))} />
                    </Field>
                    <Field label="Bank leftover per viewer">
                      <input type="checkbox" checked={draft.rules.carryRemainder} onChange={(e) => mutate((p) => (p.rules.carryRemainder = e.target.checked))} />
                    </Field>
                    <p className="tiny-note" style={{ margin: 0 }}>
                      On: leftover bits/$/coins carry to a viewer's next event (700 bits @ 500 = 1 ball + 200 saved). Off: each event floors on its own and the remainder is dropped.
                    </p>
                    <Field label="Currency mode">
                      <select className="input" value={draft.rules.currencyMode} onChange={(e) => mutate((p) => (p.rules.currencyMode = e.target.value as CurrencyMode))}>
                        <option value="faceValue">Face value (count all)</option>
                        <option value="primaryOnly">Primary only</option>
                        <option value="convert">Convert by rate</option>
                      </select>
                    </Field>
                    <Field label="Primary currency">
                      <input className="input" value={draft.rules.primaryCurrency} onChange={(e) => mutate((p) => (p.rules.primaryCurrency = e.target.value.toUpperCase()))} />
                    </Field>
                    {draft.rules.currencyMode === 'convert' && (
                      <Field label="Rates (EUR=1.08,GBP=1.27)">
                        <input
                          key={ratesText(draft.rules.currencyRates)}
                          className="input"
                          defaultValue={ratesText(draft.rules.currencyRates)}
                          onBlur={(e) => mutate((p) => (p.rules.currencyRates = parseRates(e.target.value)))}
                        />
                      </Field>
                    )}
                  </div>
                </section>
              </>
            )}

            {tab === 'theme' && (
              <>
                <section className="panel accent-cyan">
                  <div className="panel-title">Theme Presets</div>
                  <div className="theme-swatches">
                    {THEME_PRESETS.map((tp) => (
                      <button key={tp.id} className="theme-swatch" title={tp.vibe} onClick={() => mutate((p) => applyThemePreset(p, tp.palette))}>
                        <span className="swatch-dots">
                          {[tp.palette.backgroundColor, tp.palette.circlePegColor, tp.palette.spinnerPegColor, tp.palette.ballColor, tp.palette.gateColor].map((c, i) => (
                            <span key={i} className="swatch-dot" style={{ background: c }} />
                          ))}
                        </span>
                        <span className="swatch-name">{tp.emoji} {tp.name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="tiny-note">Recolors the board + overlays only. Keeps your peg layout & slots. Applies on Save.</p>
                </section>
                <section className="panel">
                  <div className="panel-title">Gameplay</div>
                  <div className="form">
                    <Field label="Drop mode">
                      <select className="input" value={draft.dropMode} onChange={(e) => mutate((p) => (p.dropMode = e.target.value as Profile['dropMode']))}>
                        <option value="auto">Auto (drop as they arrive)</option>
                        <option value="manual">Manual</option>
                      </select>
                    </Field>
                    <NumField label="Auto drop gap (ms)" value={draft.autoDropGapMs} onChange={(v) => mutate((p) => (p.autoDropGapMs = Math.max(100, Math.round(v))))} />
                    <Field label="If a ball gets stuck">
                      <select className="input" value={draft.board.stuckBehavior} onChange={(e) => mutate((p) => (p.board.stuckBehavior = e.target.value as StuckBehavior))}>
                        {STUCK_BEHAVIORS.map((b) => (
                          <option key={b} value={b}>{b === 'redrop' ? 'Send back to top' : b === 'remove' ? 'Remove it' : 'No-clip through pegs'}</option>
                        ))}
                      </select>
                    </Field>
                    <NumField label="Stuck check window (s)" value={draft.board.stuckAfterSeconds} onChange={(v) => mutate((p) => (p.board.stuckAfterSeconds = Math.max(0.2, v)))} />
                    <NumField label="Min movement in window (px)" value={draft.board.stuckMovePx} onChange={(v) => mutate((p) => (p.board.stuckMovePx = Math.max(1, v)))} />
                    <NumField label="Max airtime (s)" value={draft.board.maxBallSeconds} onChange={(v) => mutate((p) => (p.board.maxBallSeconds = Math.max(2, v)))} />
                  </div>
                  <p className="tiny-note" style={{ margin: 0 }}>
                    A ball counts as stuck only if it moves less than the min distance within the window
                    (so balls threading a hard board aren't falsely flagged). Max airtime force-lands any
                    ball that's still bouncing after that long.
                  </p>
                </section>
                <section className="panel">
                  <div className="panel-title">Colors</div>
                  <div className="form two">
                    <ColorField label="Circle pegs" value={draft.theme.circlePegColor} onChange={(v) => mutate((p) => (p.theme.circlePegColor = v))} />
                    <ColorField label="Flat pegs" value={draft.theme.flatPegColor} onChange={(v) => mutate((p) => (p.theme.flatPegColor = v))} />
                    <ColorField label="Spinner pegs" value={draft.theme.spinnerPegColor} onChange={(v) => mutate((p) => (p.theme.spinnerPegColor = v))} />
                    <ColorField label="Triangle pegs" value={draft.theme.trianglePegColor} onChange={(v) => mutate((p) => (p.theme.trianglePegColor = v))} />
                    <ColorField label="Peg glow" value={draft.theme.pegGlowColor} onChange={(v) => mutate((p) => (p.theme.pegGlowColor = v))} />
                    <ColorField label="Frame" value={draft.theme.frameColor} onChange={(v) => mutate((p) => (p.theme.frameColor = v))} />
                    <ColorField label="Ball" value={draft.theme.ballColor} onChange={(v) => mutate((p) => (p.theme.ballColor = v))} />
                    <ColorField label="Trail" value={draft.theme.trailColor} onChange={(v) => mutate((p) => (p.theme.trailColor = v))} />
                    <ColorField label="Gate" value={draft.theme.gateColor} onChange={(v) => mutate((p) => (p.theme.gateColor = v))} />
                    <ColorField label="Background" value={draft.theme.backgroundColor} onChange={(v) => mutate((p) => (p.theme.backgroundColor = v))} />
                  </div>
                  <Field label={`Background opacity (${Math.round(draft.theme.backgroundOpacity * 100)}%)`}>
                    <input type="range" min="0" max="1" step="0.05" value={draft.theme.backgroundOpacity} onChange={(e) => mutate((p) => (p.theme.backgroundOpacity = Number(e.target.value)))} />
                  </Field>
                  <Field label="Background image (optional)">
                    <input type="file" accept="image/*" onChange={onBgFile} />
                  </Field>
                  {draft.theme.backgroundImage && (
                    <button className="btn small" onClick={() => mutate((p) => (p.theme.backgroundImage = undefined))}>Remove background image</button>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-title">Display</div>
                  <div className="form">
                    <Field label="Fade board when idle">
                      <input type="checkbox" checked={draft.theme.idleFade} onChange={(e) => mutate((p) => (p.theme.idleFade = e.target.checked))} />
                    </Field>
                    <Field label="Show ball names">
                      <input type="checkbox" checked={draft.theme.showBallNames} onChange={(e) => mutate((p) => (p.theme.showBallNames = e.target.checked))} />
                    </Field>
                    <Field label="Use Twitch avatar as ball">
                      <input type="checkbox" checked={draft.theme.useAvatarBalls} onChange={(e) => mutate((p) => (p.theme.useAvatarBalls = e.target.checked))} />
                    </Field>
                  </div>
                </section>
              </>
            )}

            {tab === 'overlays' && (
              <>
                <section className="panel accent-cyan">
                  <div className="panel-title">Overlay Style <span className="hint">timer · feed · goals</span></div>
                  <p className="muted">Style the Subathon Timer, Recent Events feed, and Goals bar overlays. Theme presets also set these.</p>
                  <div className="form">
                    <Field label="Font">
                      <select className="input" value={draft.overlayTheme.fontFamily} onChange={(e) => mutate((p) => (p.overlayTheme.fontFamily = e.target.value))}>
                        {OVERLAY_FONTS.map((f) => (
                          <option key={f} value={f}>{FONT_LABELS[f] ?? f}</option>
                        ))}
                      </select>
                    </Field>
                    <NumField label="Corner radius (px)" value={draft.overlayTheme.cornerRadius} onChange={(v) => mutate((p) => (p.overlayTheme.cornerRadius = Math.max(0, v)))} />
                    <ColorField label="Panel background" value={draft.overlayTheme.panelColor} onChange={(v) => mutate((p) => (p.overlayTheme.panelColor = v))} />
                    <Field label={`Panel opacity (${Math.round(draft.overlayTheme.panelOpacity * 100)}%)`}>
                      <input type="range" min="0" max="1" step="0.05" value={draft.overlayTheme.panelOpacity} onChange={(e) => mutate((p) => (p.overlayTheme.panelOpacity = Number(e.target.value)))} />
                    </Field>
                    <ColorField label="Accent / border" value={draft.overlayTheme.accentColor} onChange={(v) => mutate((p) => (p.overlayTheme.accentColor = v))} />
                    <ColorField label="Text" value={draft.overlayTheme.textColor} onChange={(v) => mutate((p) => (p.overlayTheme.textColor = v))} />
                    <ColorField label="Muted text" value={draft.overlayTheme.mutedColor} onChange={(v) => mutate((p) => (p.overlayTheme.mutedColor = v))} />
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-title">Timer Overlay</div>
                  <div className="form">
                    <ColorField label="Digits color" value={draft.overlayTheme.timerColor} onChange={(v) => mutate((p) => (p.overlayTheme.timerColor = v))} />
                    <ColorField label="Glow color" value={draft.overlayTheme.timerGlowColor} onChange={(v) => mutate((p) => (p.overlayTheme.timerGlowColor = v))} />
                    <NumField label="Size (vmin)" value={draft.overlayTheme.timerSizeVmin} onChange={(v) => mutate((p) => (p.overlayTheme.timerSizeVmin = Math.max(4, Math.min(30, v))))} />
                    <Field label="Show mode label">
                      <input type="checkbox" checked={draft.overlayTheme.timerShowMode} onChange={(e) => mutate((p) => (p.overlayTheme.timerShowMode = e.target.checked))} />
                    </Field>
                    <Field label="Panel behind digits">
                      <input type="checkbox" checked={draft.overlayTheme.timerPanel} onChange={(e) => mutate((p) => (p.overlayTheme.timerPanel = e.target.checked))} />
                    </Field>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-title">Recent Events Feed</div>
                  <div className="form">
                    <NumField label="Font size (px)" value={draft.overlayTheme.feedFontSize} onChange={(v) => mutate((p) => (p.overlayTheme.feedFontSize = Math.max(8, v)))} />
                    <NumField label="Max items" value={draft.overlayTheme.feedMaxItems} onChange={(v) => mutate((p) => (p.overlayTheme.feedMaxItems = Math.max(1, Math.round(v))))} />
                    <NumField label="Show for (seconds)" value={draft.overlayTheme.feedLifetimeSec} onChange={(v) => mutate((p) => (p.overlayTheme.feedLifetimeSec = Math.max(1, v)))} />
                  </div>
                  <div className="subhead">Event accent colors</div>
                  <div className="form two">
                    <ColorField label="Subs" value={draft.overlayTheme.feedSubColor} onChange={(v) => mutate((p) => (p.overlayTheme.feedSubColor = v))} />
                    <ColorField label="Bits" value={draft.overlayTheme.feedBitsColor} onChange={(v) => mutate((p) => (p.overlayTheme.feedBitsColor = v))} />
                    <ColorField label="Donations" value={draft.overlayTheme.feedDonationColor} onChange={(v) => mutate((p) => (p.overlayTheme.feedDonationColor = v))} />
                    <ColorField label="CC coins" value={draft.overlayTheme.feedCcColor} onChange={(v) => mutate((p) => (p.overlayTheme.feedCcColor = v))} />
                    <ColorField label="Jackpot" value={draft.overlayTheme.feedJackpotColor} onChange={(v) => mutate((p) => (p.overlayTheme.feedJackpotColor = v))} />
                    <ColorField label="Prize" value={draft.overlayTheme.feedPrizeColor} onChange={(v) => mutate((p) => (p.overlayTheme.feedPrizeColor = v))} />
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-title">Goals Bar</div>
                  <div className="form">
                    <ColorField label="Value color" value={draft.overlayTheme.goalValueColor} onChange={(v) => mutate((p) => (p.overlayTheme.goalValueColor = v))} />
                    <ColorField label="Timer value color" value={draft.overlayTheme.goalTimerColor} onChange={(v) => mutate((p) => (p.overlayTheme.goalTimerColor = v))} />
                    <NumField label="Value size (px)" value={draft.overlayTheme.goalValueSizePx} onChange={(v) => mutate((p) => (p.overlayTheme.goalValueSizePx = Math.max(10, v)))} />
                  </div>
                  <div className="subhead">Stats to show</div>
                  <div className="row wrap">
                    {GOAL_STAT_KEYS.map((k) => (
                      <label key={k} className="mini">
                        <input
                          type="checkbox"
                          checked={draft.overlayTheme.goalStats.includes(k)}
                          onChange={() =>
                            mutate((p) => {
                              const has = p.overlayTheme.goalStats.includes(k)
                              const set = new Set(p.overlayTheme.goalStats)
                              if (has) set.delete(k)
                              else set.add(k)
                              p.overlayTheme.goalStats = GOAL_STAT_KEYS.filter((x) => set.has(x))
                            })
                          }
                        />{' '}
                        {GOAL_STAT_LABELS[k]}
                      </label>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ghostsFor(
  x: number,
  y: number,
  d: { pegShape: PegShape; pegSize: number; pegLength: number; pegAngle: number },
  mirror: boolean,
  width: number
): Ghost[] {
  const g: Ghost = { x, y, shape: d.pegShape, radius: d.pegSize, length: d.pegLength, angle: (d.pegAngle * Math.PI) / 180 }
  const out = [g]
  if (mirror && Math.abs(width - x - x) > 12) out.push({ ...g, x: width - x })
  return out
}

function PresetTile({ preset, active, onClick }: { preset: BoardPreset; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const preview = useMemo(() => {
    const base = defaultProfile()
    applyPreset(base, preset)
    return base
  }, [preset])
  useEffect(() => {
    drawBoard(ref.current, preview, null, 0, 132, 165)
  }, [preview])
  return (
    <button className={`preset-tile ${active ? 'active' : ''}`} onClick={onClick} title={preset.vibe}>
      <canvas ref={ref} width={132} height={165} />
      <div className="preset-name"><span>{preset.emoji}</span>{preset.name}</div>
    </button>
  )
}

function UserTile({
  name,
  layout,
  active,
  onClick,
  onDelete
}: {
  name: string
  layout: Layout
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const preview = useMemo(() => ({ ...defaultProfile(), ...layout }) as Profile, [layout])
  useEffect(() => {
    drawBoard(ref.current, preview, null, 0, 132, 165)
  }, [preview])
  return (
    <div className={`preset-tile ${active ? 'active' : ''}`} title={name}>
      <button className="preset-hit" onClick={onClick}>
        <canvas ref={ref} width={132} height={165} />
        <div className="preset-name"><span>💾</span>{name}</div>
      </button>
      <button
        className="preset-del"
        title="Delete this design"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        ✕
      </button>
    </div>
  )
}

function ratesText(rates: Record<string, number>): string {
  return Object.entries(rates)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
}

function parseRates(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const part of text.split(',')) {
    const [k, v] = part.split('=')
    if (k && v && !Number.isNaN(Number(v))) out[k.trim().toUpperCase()] = Number(v)
  }
  return out
}

function drawBoard(
  canvas: HTMLCanvasElement | null,
  draft: Profile,
  bg: HTMLImageElement | null,
  grid: number,
  w = CANVAS_W,
  h = CANVAS_H,
  ghosts: Ghost[] = [],
  time?: number
): void {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const model = buildBoardModel(draft.board, draft.slots.findIndex((s) => s.isSuper))
  const s = w / model.width
  const labels = w >= 240
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#141018'
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = draft.theme.backgroundOpacity
  ctx.fillStyle = draft.theme.backgroundColor
  ctx.fillRect(0, 0, w, h)
  if (bg) ctx.drawImage(bg, 0, 0, w, h)
  ctx.globalAlpha = 1

  if (grid > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let gx = 0; gx <= model.width; gx += grid) {
      ctx.beginPath()
      ctx.moveTo(gx * s, 0)
      ctx.lineTo(gx * s, h)
      ctx.stroke()
    }
    for (let gy = 0; gy <= model.height; gy += grid) {
      ctx.beginPath()
      ctx.moveTo(0, gy * s)
      ctx.lineTo(w, gy * s)
      ctx.stroke()
    }
  }

  ctx.strokeStyle = draft.theme.frameColor
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, w - 2, h - 2)
  for (const slot of model.slots) {
    const cfg = draft.slots[slot.index]
    ctx.fillStyle = (cfg?.color ?? '#333') + '55'
    ctx.fillRect(slot.xMin * s, model.slotAreaTop * s, (slot.xMax - slot.xMin) * s, (model.height - model.slotAreaTop) * s)
    if (labels) {
      ctx.fillStyle = '#fff'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(cfg?.label || String(slot.index + 1), slot.xCenter * s, (model.slotAreaTop + 40) * s)
    }
  }
  const tsec = (time ?? 0) / 1000
  for (const p of model.pegs) {
    const color = pegColorFor(draft.theme, p.shape)
    let ex = p.x
    let eang = p.angle
    if (time !== undefined) {
      if (p.spin && (p.shape === 'spinner' || p.shape === 'triangle')) {
        eang = p.angle + ((p.spin * Math.PI) / 180) * tsec
      }
      if (p.oscillate && p.oscillateRangePx > 0 && p.oscillatePeriodSec > 0) {
        // Same amplitude cap as the live board, with faint ghosts at the travel extremes.
        const cap = (p.oscillatePeriodSec * 60 * (PHYSICS.ballRadius - 1)) / (2 * Math.PI)
        const range = Math.min(p.oscillateRangePx, cap)
        drawPegShape(ctx, { ...p, x: p.x - range }, s, color, 0.16)
        drawPegShape(ctx, { ...p, x: p.x + range }, s, color, 0.16)
        ex = p.x + range * Math.sin((2 * Math.PI * tsec) / p.oscillatePeriodSec)
      }
    }
    drawPegShape(ctx, { ...p, x: ex, angle: eang }, s, color, 1)
  }
  for (const g of ghosts) drawPegShape(ctx, g, s, '#ffffff', 0.5, true)

  if (draft.board.gate.enabled) {
    const g = draft.board.gate
    ctx.strokeStyle = draft.theme.gateColor
    ctx.lineWidth = 2
    ctx.strokeRect((g.x - g.width / 2) * s, (g.y - g.height / 2) * s, g.width * s, g.height * s)
  }
}

function drawPegShape(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number; shape: PegShape; radius: number; length: number; angle: number },
  s: number,
  color: string,
  alpha: number,
  ring = false
): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(p.x * s, p.y * s)
  ctx.rotate(p.angle)
  if (p.shape === 'spinner' || p.shape === 'flat') {
    ctx.fillStyle = color
    const len = p.length * s
    const th = Math.max(2, p.radius) * s
    ctx.fillRect(-len / 2, -th / 2, len, th)
    if (p.shape === 'spinner') {
      ctx.strokeStyle = color + '66'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(0, 0, (p.length / 2) * s, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else if (p.shape === 'triangle') {
    ctx.fillStyle = color
    const r = p.radius * 1.6 * s
    ctx.beginPath()
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3
      const x = r * Math.cos(a)
      const y = r * Math.sin(a)
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(0, 0, Math.max(2, p.radius * s), 0, Math.PI * 2)
    ctx.fill()
  }
  if (ring) {
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, Math.max(3, p.radius * s + 3), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function SlotRow({
  slot,
  onChange,
  onOutcome
}: {
  slot: SlotConfig
  onChange: (patch: Partial<SlotConfig>) => void
  onOutcome: (o: SlotOutcome) => void
}) {
  return (
    <div className="slot-row">
      <span className={`slot-idx ${slot.isSuper ? 'super' : ''}`}>{slot.isSuper ? '★' : slot.index + 1}</span>
      <input className="input slot-label" value={slot.label} onChange={(e) => onChange({ label: e.target.value })} />
      <input type="color" value={slot.color} onChange={(e) => onChange({ color: e.target.value })} />
      <select className="input" value={slot.outcome.kind} onChange={(e) => onOutcome(defaultOutcome(e.target.value))}>
        <option value="addTime">+time</option>
        <option value="removeTime">−time</option>
        <option value="multiplier">multiplier</option>
        <option value="prize">prize</option>
      </select>
      <OutcomeValue outcome={slot.outcome} onOutcome={onOutcome} />
    </div>
  )
}

function OutcomeValue({ outcome, onOutcome }: { outcome: SlotOutcome; onOutcome: (o: SlotOutcome) => void }) {
  if (outcome.kind === 'addTime' || outcome.kind === 'removeTime') {
    return <input className="input slot-val" type="number" value={outcome.seconds} onChange={(e) => onOutcome({ kind: outcome.kind, seconds: Number(e.target.value) })} />
  }
  if (outcome.kind === 'multiplier') {
    return <input className="input slot-val" type="number" step="0.25" value={outcome.factor} onChange={(e) => onOutcome({ kind: 'multiplier', factor: Number(e.target.value) })} />
  }
  return <input className="input slot-val" placeholder="prizeId" value={outcome.prizeId} onChange={(e) => onOutcome({ kind: 'prize', prizeId: e.target.value, winChance: outcome.winChance })} />
}

function defaultOutcome(kind: string): SlotOutcome {
  switch (kind) {
    case 'removeTime':
      return { kind: 'removeTime', seconds: 30 }
    case 'multiplier':
      return { kind: 'multiplier', factor: 2 }
    case 'prize':
      return { kind: 'prize', prizeId: '', winChance: 1 }
    default:
      return { kind: 'addTime', seconds: 30 }
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input className="input" type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  )
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/** Hours / minutes / seconds input that stores a total number of seconds. */
function HmsField({ label, value, onChange }: { label: string; value: number; onChange: (seconds: number) => void }) {
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = value % 60
  const set = (hh: number, mm: number, ss: number): void => onChange(Math.max(0, hh * 3600 + mm * 60 + ss))
  return (
    <Field label={`${label} (${formatDuration(value)})`}>
      <span className="hms">
        <input className="input tiny" type="number" min="0" value={h} onChange={(e) => set(Number(e.target.value) || 0, m, s)} />h
        <input className="input tiny" type="number" min="0" value={m} onChange={(e) => set(h, Number(e.target.value) || 0, s)} />m
        <input className="input tiny" type="number" min="0" value={s} onChange={(e) => set(h, m, Number(e.target.value) || 0)} />s
      </span>
    </Field>
  )
}
