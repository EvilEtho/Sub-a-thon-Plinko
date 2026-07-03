import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  ClientEvents,
  ServerEvents,
  type AlertPayload,
  type ControlStatePayload,
  type IntegrationStatusEntry,
  type IntegrationStatusPayload,
  type PrizeWinnerInfo,
  type PrizeWinnersPayload,
  type QueueUpdatePayload,
  type TestEventInput,
  type TimerState
} from '@shared/types/socket'
import type { Totals } from '@shared/schema/runtime.schema'
import type { LogEntry } from '@shared/types/log'
import { formatDuration } from '@shared/util/time'
import type { ServerInfo, UpdateStatus } from '@shared/types/ipc'
import { Integrations } from './Integrations'
import { Designer } from './Designer'
import { DevConsole } from './DevConsole'

type Deck = 'live' | 'design' | 'connect' | 'dev'

const emptyTotals: Totals = {
  subs: 0,
  bits: 0,
  dollars: 0,
  ccCoins: 0,
  timeAddedSeconds: 0,
  timeRemovedSeconds: 0,
  ballsDropped: 0
}

const PRESETS: { label: string; input: TestEventInput }[] = [
  { label: 'Tier 1 sub', input: { kind: 'sub', tier: 1 } },
  { label: 'Tier 2 sub', input: { kind: 'sub', tier: 2 } },
  { label: 'Tier 3 sub', input: { kind: 'sub', tier: 3 } },
  { label: '5× gift T1', input: { kind: 'giftsub', tier: 1, giftCount: 5 } },
  { label: '500 bits', input: { kind: 'bits', bits: 500 } },
  { label: '$5 donation', input: { kind: 'donation', amount: 5, currency: '$' } },
  { label: '500 CC coins', input: { kind: 'cc_coins', coins: 500 } }
]

const INT_LABELS: Record<string, string> = {
  twitch: 'Twitch',
  streamlabs: 'Streamlabs',
  streamelements: 'StreamElements',
  streamerbot: 'Streamer.bot'
}

export function App() {
  const [conn, setConn] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [timer, setTimer] = useState<TimerState>({ seconds: 0, mode: 'countdown', running: false })
  const [totals, setTotals] = useState<Totals>(emptyTotals)
  const [control, setControl] = useState<ControlStatePayload>({
    subathonActive: false,
    running: false,
    dropMode: 'auto',
    queueCount: 0
  })
  const [queue, setQueue] = useState<QueueUpdatePayload>({ count: 0, items: [] })
  const [feed, setFeed] = useState<AlertPayload[]>([])
  const [testName, setTestName] = useState('Tester')
  const [integrations, setIntegrations] = useState<IntegrationStatusEntry[]>([])
  const [winners, setWinners] = useState<PrizeWinnerInfo[]>([])
  const [devLogs, setDevLogs] = useState<LogEntry[]>([])
  const [deck, setDeck] = useState<Deck>('live')
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' })
  const [updateOpen, setUpdateOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const autoShownRef = useRef<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    let socket: Socket | null = null
    window.plinko
      ?.getServerInfo()
      .then((si) => {
        if (!si) return setConn('disconnected')
        setInfo(si)
        socket = io(si.urls.base, { transports: ['websocket', 'polling'] })
        socketRef.current = socket
        socket.on('connect', () => {
          setConn('connected')
          socket?.emit(ClientEvents.hello, { role: 'panel' })
        })
        socket.on('disconnect', () => setConn('disconnected'))
        socket.on(ServerEvents.timerUpdate, (p) => setTimer(p.timer))
        socket.on(ServerEvents.goalUpdate, (p) => setTotals(p.totals))
        socket.on(ServerEvents.controlState, (p) => setControl(p))
        socket.on(ServerEvents.queueUpdate, (p) => setQueue(p))
        socket.on(ServerEvents.alert, (a: AlertPayload) =>
          setFeed((prev) => [a, ...prev].slice(0, 14))
        )
        socket.on(ServerEvents.integrationStatus, (p: IntegrationStatusPayload) =>
          setIntegrations(p.integrations)
        )
        socket.on(ServerEvents.prizeWinners, (p: PrizeWinnersPayload) => setWinners(p.winners))
        socket.on(ServerEvents.devLog, (e: LogEntry) =>
          setDevLogs((prev) => {
            const next = prev.length > 500 ? prev.slice(prev.length - 500) : prev.slice()
            next.push(e)
            return next
          })
        )
      })
      .catch(() => setConn('disconnected'))

    window.plinko
      ?.getIntegrationStatus()
      .then((p) => setIntegrations(p.integrations))
      .catch(() => {})
    return () => {
      socket?.close()
    }
  }, [])

  // Update wiring: read the cached status on load, then live updates from the main process.
  useEffect(() => {
    window.plinko?.getVersion().then(setAppVersion).catch(() => {})
    window.plinko?.getUpdateStatus?.().then(setUpdate).catch(() => {})
    window.plinko?.onUpdateStatus?.(setUpdate)
  }, [])

  // Auto-open the update dialog when an un-skipped update appears (once per version).
  useEffect(() => {
    if (update.state === 'available' && !update.skipped && autoShownRef.current !== update.version) {
      autoShownRef.current = update.version ?? null
      setUpdateOpen(true)
    }
  }, [update])

  const emit = (event: string, payload?: unknown): void => {
    socketRef.current?.emit(event, payload)
  }
  const inject = (input: TestEventInput): void =>
    emit(ClientEvents.testEvent, { ...input, displayName: testName })

  const updateDot = update.state === 'available' && !update.skipped
  const openUpdate = (): void => {
    setUpdateOpen(true)
    if (update.state === 'idle' || update.state === 'none' || update.state === 'error') {
      window.plinko?.checkForUpdates?.()
    }
  }
  const updateTip =
    update.state === 'available'
      ? `Update available — v${update.version}`
      : update.state === 'downloading'
        ? `Downloading… ${update.percent ?? 0}%`
        : update.state === 'checking'
          ? 'Checking for updates…'
          : update.state === 'none'
            ? 'Up to date'
            : 'Check for updates'

  return (
    <div className="app-shell">
      <nav className="rail">
        <img className="rail-logo" src="/icon.png" alt="Subathon Plinko" />
        <RailItem label="Live" active={deck === 'live'} onClick={() => setDeck('live')} icon={<IconLive />} />
        <RailItem label="Design" active={deck === 'design'} onClick={() => setDeck('design')} icon={<IconDesign />} />
        <RailItem label="Connect" active={deck === 'connect'} onClick={() => setDeck('connect')} icon={<IconConnect />} />
        <RailItem
          label="Dev"
          active={deck === 'dev'}
          onClick={() => setDeck('dev')}
          icon={<IconDev />}
          badge={devLogs.length || undefined}
        />
        <div className="rail-spacer" />
        <button className={`rail-update ${updateDot ? 'has-update' : ''}`} onClick={openUpdate} aria-label="Updates">
          <IconUpdate />
          {updateDot && <span className="rail-dot" />}
          <span className="rail-tip">{updateTip}</span>
        </button>
        <div className="rail-led">
          <span className={`led-dot ${conn === 'connected' ? 'on' : conn === 'connecting' ? 'wait' : 'off'}`} />
          {conn === 'connected' ? 'Online' : conn === 'connecting' ? '…' : 'Off'}
        </div>
      </nav>

      {updateOpen && (
        <UpdateModal update={update} version={appVersion} onClose={() => setUpdateOpen(false)} />
      )}

      <div className="workspace">
        <header className="status-strip">
          <div className="strip-brand">
            <span className="brand-dot" />
            Subathon Plinko
          </div>
          <span className={`pill ${control.subathonActive ? 'live' : ''}`}>
            {control.subathonActive ? 'Live' : 'Idle'}
          </span>
          <span className="chip">
            Queue <strong>{queue.count}</strong>
          </span>
          <div className="strip-clock">
            <span className="strip-cap">{timer.mode}</span>
            <span className={`hero-clock ${control.running ? 'running' : ''}`}>
              {formatDuration(timer.seconds)}
            </span>
          </div>
        </header>

        {deck === 'design' ? (
          <div className="deck flush">
            <Designer />
          </div>
        ) : deck === 'dev' ? (
          <div className="deck">
            <DevConsole logs={devLogs} onClear={() => setDevLogs([])} />
          </div>
        ) : deck === 'connect' ? (
          <div className="deck">
            <ConnectDeck integrations={integrations} info={info} />
          </div>
        ) : (
          <div className="deck">
            <LiveDeck
              emit={emit}
              control={control}
              totals={totals}
              queue={queue}
              feed={feed}
              winners={winners}
              integrations={integrations}
              testName={testName}
              setTestName={setTestName}
              inject={inject}
              gotoConnect={() => setDeck('connect')}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Live deck -----------------------------------------------------------

function LiveDeck({
  emit,
  control,
  totals,
  queue,
  feed,
  winners,
  integrations,
  testName,
  setTestName,
  inject,
  gotoConnect
}: {
  emit: (e: string, p?: unknown) => void
  control: ControlStatePayload
  totals: Totals
  queue: QueueUpdatePayload
  feed: AlertPayload[]
  winners: PrizeWinnerInfo[]
  integrations: IntegrationStatusEntry[]
  testName: string
  setTestName: (v: string) => void
  inject: (i: TestEventInput) => void
  gotoConnect: () => void
}) {
  return (
    <div className="live-grid">
      <div className="col">
        <section className="panel accent">
          <div className="panel-title">Control</div>
          <div className="transport">
            {control.running ? (
              <button className="btn warn" onClick={() => emit(ClientEvents.stop)}>
                ⏸ Pause
              </button>
            ) : (
              <button className="btn go" onClick={() => emit(ClientEvents.start)}>
                ▶ Start
              </button>
            )}
            <button className="btn danger" onClick={() => emit(ClientEvents.reset)}>
              ⟲ Reset
            </button>
          </div>
          <p className="tiny-note">
            {control.subathonActive ? 'Subathon active' : 'Idle'} ·{' '}
            {control.running ? 'timer running' : 'timer paused'}
          </p>
        </section>

        <section className="panel">
          <div className="panel-title">Drop Control</div>
          <div className="row">
            <div className="seg">
              <button
                className={control.dropMode === 'auto' ? 'on' : ''}
                onClick={() => emit(ClientEvents.setDropMode, { mode: 'auto' })}
              >
                Auto
              </button>
              <button
                className={control.dropMode === 'manual' ? 'on' : ''}
                onClick={() => emit(ClientEvents.setDropMode, { mode: 'manual' })}
              >
                Manual
              </button>
            </div>
            <button className="btn primary" onClick={() => emit(ClientEvents.dropNext)}>
              Drop next
            </button>
          </div>
          <p className="tiny-note">
            Queued: <span className="drop-count">{queue.count}</span>
          </p>
          <ul className="list">
            {queue.items.map((q) => (
              <li key={q.id}>
                <span className="q-name">{q.displayName}</span>
                <span className="muted">{q.reason}</span>
              </li>
            ))}
            {queue.items.length === 0 && <li className="empty">queue empty</li>}
          </ul>
        </section>
      </div>

      <div className="col">
        <section className="panel">
          <div className="panel-title">Totals</div>
          <div className="totals">
            <Stat label="Subs" value={totals.subs} />
            <Stat label="Bits" value={totals.bits} />
            <Stat label="$ Raised" value={totals.dollars} />
            <Stat label="CC Coins" value={totals.ccCoins} />
            <Stat label="Balls" value={totals.ballsDropped} />
            <Stat label="Time +" value={formatDuration(totals.timeAddedSeconds)} tone="pos" />
            <Stat label="Time −" value={formatDuration(totals.timeRemovedSeconds)} tone="neg" />
          </div>
        </section>

        <section className="panel accent-cyan">
          <div className="panel-title">Live Feed</div>
          <ul className="list feed">
            {feed.map((a) => (
              <li key={a.id} className={`feed-${a.kind}`}>
                <span className="q-name">{a.title}</span>
                <span className="muted">{a.detail}</span>
              </li>
            ))}
            {feed.length === 0 && <li className="empty">no events yet</li>}
          </ul>
        </section>
      </div>

      <div className="col">
        <section className="panel">
          <div className="panel-title">
            Sources
            <button className="link-btn" onClick={gotoConnect}>
              Manage →
            </button>
          </div>
          <div className="mini-status">
            {['twitch', 'streamlabs', 'streamelements', 'streamerbot'].map((id) => {
              const e = integrations.find((i) => i.id === id)
              const status = e?.enabled ? e.status : 'disconnected'
              return (
                <span className="mini-int" key={id} title={e?.detail ?? status}>
                  <span className={`dot ${status}`} />
                  {INT_LABELS[id]}
                </span>
              )
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">Prize Winners</div>
          <ul className="list">
            {winners
              .slice()
              .reverse()
              .map((w, i) => (
                <li key={i} className="feed-prize">
                  <span className="q-name">{w.displayName}</span>
                  <span className="muted">{w.prizeName}</span>
                </li>
              ))}
            {winners.length === 0 && <li className="empty">no winners yet</li>}
          </ul>
        </section>

        <section className="panel">
          <div className="panel-title">Test Events</div>
          <div className="row">
            <label className="muted">User</label>
            <input className="input" value={testName} onChange={(e) => setTestName(e.target.value)} />
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {PRESETS.map((p) => (
              <button key={p.label} className="btn small" onClick={() => inject(p.input)}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="tiny-note">Injects a real event through the full pipeline.</p>
        </section>
      </div>
    </div>
  )
}

// ---- Connect deck --------------------------------------------------------

function ConnectDeck({
  integrations,
  info
}: {
  integrations: IntegrationStatusEntry[]
  info: ServerInfo | null
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      <Integrations integrations={integrations} />
      <section className="panel">
        <div className="panel-title">OBS Browser Sources</div>
        <p className="muted">
          In OBS: <strong>+ → Browser Source</strong>, paste a URL, set the size. Backgrounds are
          transparent.
        </p>
        {info ? (
          <ul className="url-list">
            <UrlRow label="Plinko board (1080×1350)" url={info.urls.board} />
            <UrlRow label="Subathon timer (600×200)" url={info.urls.timer} />
            <UrlRow label="Recent events feed (460×520)" url={info.urls.feed} />
            <UrlRow label="Goals bar (900×160)" url={info.urls.goals} />
            <UrlRow label="Control panel (OBS dock)" url={info.urls.panel} />
          </ul>
        ) : (
          <p className="muted">Server info unavailable.</p>
        )}
        <p className="tiny-note">
          For sound effects, enable <strong>Control audio via OBS</strong> on the board source. Avoid
          hiding/showing the board source mid-stream (it reloads the page).
        </p>
      </section>
    </div>
  )
}

function UpdateModal({
  update,
  version,
  onClose
}: {
  update: UpdateStatus
  version: string
  onClose: () => void
}) {
  const updateNow = (): void => void window.plinko?.downloadUpdate?.()
  const skip = (): void => {
    if (update.version) window.plinko?.skipUpdate?.(update.version)
    onClose()
  }
  const retry = (): void => void window.plinko?.checkForUpdates?.()

  let title = 'Updates'
  let body: React.ReactNode = null
  let actions: React.ReactNode = (
    <button className="btn" onClick={onClose}>
      Close
    </button>
  )

  switch (update.state) {
    case 'available':
      title = `Update available — v${update.version}`
      body = (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            You're on v{version || '—'}. Here's what's new:
          </p>
          <div className="changelog">{update.notes?.trim() || 'No release notes provided.'}</div>
        </>
      )
      actions = (
        <>
          <button className="btn go" onClick={updateNow}>
            Update now
          </button>
          <button className="btn" onClick={skip}>
            Skip this update
          </button>
          <button className="btn" onClick={onClose}>
            Update later
          </button>
        </>
      )
      break
    case 'downloading':
      title = 'Downloading update…'
      body = (
        <>
          <div className="progress">
            <span style={{ width: `${update.percent ?? 0}%` }} />
          </div>
          <p className="muted">{update.percent ?? 0}% — the app will relaunch to finish. Don't close it.</p>
        </>
      )
      actions = null
      break
    case 'downloaded':
      title = 'Update ready'
      body = <p className="muted">Relaunching to apply v{update.version}…</p>
      actions = null
      break
    case 'checking':
    case 'idle':
      title = 'Checking for updates…'
      body = <p className="muted">Contacting the update server…</p>
      break
    case 'none':
      title = "You're up to date"
      body = <p className="muted">{update.message || `v${version || '—'} is the latest version.`}</p>
      break
    case 'error':
      title = 'Update check failed'
      body = <p className="muted">{update.message || 'Could not reach the update server.'}</p>
      actions = (
        <>
          <button className="btn" onClick={retry}>
            Retry
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      )
      break
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-body">{body}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  )
}

// ---- small pieces --------------------------------------------------------

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'pos' | 'neg' }) {
  const [flash, setFlash] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 500)
    return () => clearTimeout(t)
  }, [value])
  return (
    <div className={`stat ${tone ?? ''} ${flash ? 'flash' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function UrlRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }
  return (
    <li className="url-row">
      <span className="url-label">{label}</span>
      <code className="url-code">{url}</code>
      <button className="btn small" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </li>
  )
}

// ---- rail icons ----------------------------------------------------------

function RailItem({
  label,
  active,
  onClick,
  icon,
  badge
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  badge?: number
}) {
  return (
    <button className={`rail-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      {label}
      {badge ? <span className="rail-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  )
}

function IconLive() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 6.5a8 8 0 000 11M17.5 6.5a8 8 0 010 11" strokeLinecap="round" />
    </svg>
  )
}
function IconDesign() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 7h9M4 12h16M4 17h6" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
    </svg>
  )
}
function IconConnect() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M9 3v4M15 3v4" strokeLinecap="round" />
      <path d="M7 7h10v3a5 5 0 01-10 0z" strokeLinejoin="round" />
      <path d="M12 15v6" strokeLinecap="round" />
    </svg>
  )
}
function IconDev() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7.5 9.5l3 2.5-3 2.5M13 15h3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconUpdate() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 3v11m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" strokeLinecap="round" />
    </svg>
  )
}
