import { useEffect, useState } from 'react'
import type { IntegrationStatusEntry } from '@shared/types/socket'
import type { DeviceCodeInfo, ObsStatusPayload } from '@shared/types/ipc'

const LABELS: Record<string, string> = {
  twitch: 'Twitch (subs / bits)',
  streamlabs: 'Streamlabs (donations)',
  streamelements: 'StreamElements (tips)',
  streamerbot: 'Streamer.bot (Crowd Control)'
}

export function Integrations({ integrations }: { integrations: IntegrationStatusEntry[] }) {
  const byId = (id: string): IntegrationStatusEntry | undefined => integrations.find((i) => i.id === id)

  return (
    <section className="panel accent-cyan">
      <div className="panel-title">Integrations</div>
      <div className="integrations">
        <TwitchRow entry={byId('twitch')} />
        <TokenRow
          id="streamlabs"
          entry={byId('streamlabs')}
          placeholder="Streamlabs socket token"
        />
        <TokenRow id="streamelements" entry={byId('streamelements')} placeholder="StreamElements JWT" />
        <StreamerbotRow entry={byId('streamerbot')} />
        <ObsRow />
      </div>
    </section>
  )
}

function StatusDot({ entry }: { entry?: IntegrationStatusEntry }) {
  const status = entry?.status ?? 'disconnected'
  return (
    <span className={`int-dot int-${status}`} title={entry?.detail ?? status}>
      ● <span className="muted">{status}</span>
      {entry?.detail ? <span className="muted"> · {entry.detail}</span> : null}
    </span>
  )
}

function EnableToggle({ entry }: { entry?: IntegrationStatusEntry }) {
  if (!entry) return null
  return (
    <button
      className={`btn small ${entry.enabled ? 'primary' : ''}`}
      onClick={() => window.plinko.setIntegrationEnabled(entry.id, !entry.enabled)}
    >
      {entry.enabled ? 'Enabled' : 'Disabled'}
    </button>
  )
}

function TwitchRow({ entry }: { entry?: IntegrationStatusEntry }) {
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null)
  const [showAdv, setShowAdv] = useState(false)
  const [useCustom, setUseCustom] = useState(false)
  const [clientId, setClientId] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.plinko
      .getProfile()
      .then((p) => {
        setUseCustom(p.integrations.twitch.useCustomClientId)
        setClientId(p.integrations.twitch.customClientId)
      })
      .catch(() => {})
  }, [])

  const login = (): void => {
    window.plinko.twitchStartLogin().then(setDevice).catch(() => setDevice(null))
  }
  const saveApp = (): void => {
    window.plinko.setTwitchClientId(useCustom, clientId).then(() => {
      setSaved(true)
      setDevice(null)
      setTimeout(() => setSaved(false), 1500)
    })
  }

  return (
    <div className="int-row">
      <div className="int-head">
        <strong>{LABELS.twitch}</strong>
        <StatusDot entry={entry} />
      </div>
      <div className="row wrap">
        <button className="btn small" onClick={login}>
          Log in
        </button>
        <button className="btn small" onClick={() => window.plinko.twitchLogout()}>
          Log out
        </button>
        <EnableToggle entry={entry} />
        <button className="link-btn" onClick={() => setShowAdv((v) => !v)}>
          {showAdv ? 'Hide advanced' : 'Advanced'}
        </button>
      </div>
      {device && (
        <p className="muted">
          Go to{' '}
          <a href={device.verificationUri} target="_blank" rel="noreferrer">
            {device.verificationUri}
          </a>{' '}
          and enter code <strong className="code-inline">{device.userCode}</strong>
        </p>
      )}
      {showAdv && (
        <div className="well" style={{ marginTop: 8 }}>
          <label className="mini">
            <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} /> Use my own
            Twitch app
          </label>
          <div className="row wrap" style={{ marginTop: 6 }}>
            <input
              className="input"
              placeholder="Your Twitch client ID"
              value={clientId}
              disabled={!useCustom}
              onChange={(e) => setClientId(e.target.value)}
            />
            <button className="btn small" onClick={saveApp}>
              {saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
          <p className="tiny-note" style={{ margin: '6px 0 0' }}>
            Default uses our built-in Twitch app — no setup. To use your own, register a{' '}
            <strong>public</strong> app at{' '}
            <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">
              dev.twitch.tv/console/apps
            </a>{' '}
            (no client secret needed). Saving switches apps and logs you out, so log in again after.
          </p>
        </div>
      )}
    </div>
  )
}

function TokenRow({
  id,
  entry,
  placeholder
}: {
  id: 'streamlabs' | 'streamelements'
  entry?: IntegrationStatusEntry
  placeholder: string
}) {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)
  const save = (): void => {
    if (!value.trim()) return
    window.plinko.setIntegrationSecret(id, value.trim()).then(() => {
      setSaved(true)
      setValue('')
      setTimeout(() => setSaved(false), 1500)
    })
  }
  return (
    <div className="int-row">
      <div className="int-head">
        <strong>{LABELS[id]}</strong>
        <StatusDot entry={entry} />
      </div>
      <div className="row wrap">
        <input
          className="input"
          type="password"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn small" onClick={save}>
          {saved ? 'Saved' : 'Save token'}
        </button>
        <EnableToggle entry={entry} />
      </div>
    </div>
  )
}

function StreamerbotRow({ entry }: { entry?: IntegrationStatusEntry }) {
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('8080')
  const [exclude, setExclude] = useState('Twitch-Bits')
  const save = (): void => {
    window.plinko.setStreamerbotConfig({
      host: host.trim() || '127.0.0.1',
      port: parseInt(port, 10) || 8080,
      excludeSources: exclude
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    })
  }
  return (
    <div className="int-row">
      <div className="int-head">
        <strong>{LABELS.streamerbot}</strong>
        <StatusDot entry={entry} />
      </div>
      <div className="row wrap">
        <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="host" />
        <input className="input port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="port" />
        <button className="btn small" onClick={save}>
          Save
        </button>
        <EnableToggle entry={entry} />
      </div>
      <div className="row wrap">
        <input
          className="input"
          value={exclude}
          onChange={(e) => setExclude(e.target.value)}
          placeholder="exclude coin sources (comma-separated)"
        />
      </div>
      <p className="muted">
        In Streamer.bot, add an action on the Crowd Control coin-exchange trigger that does a
        WebSocket Broadcast (Custom) with{' '}
        <code>{'{ "plinko":"ccCoins", "user":"...", "coins":500, "source":"..." }'}</code>.
      </p>
    </div>
  )
}

function ObsRow() {
  const [enabled, setEnabled] = useState(false)
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('4455')
  const [password, setPassword] = useState('')
  const [fadeScenes, setFadeScenes] = useState<string[]>([])
  const [autoEnd, setAutoEnd] = useState(false)
  const [autoEndDelay, setAutoEndDelay] = useState('30')
  const [status, setStatus] = useState<ObsStatusPayload>({ status: 'disconnected', scenes: [] })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.plinko
      .getProfile()
      .then((p) => {
        const o = p.integrations.obs
        setEnabled(o.enabled)
        setHost(o.host)
        setPort(String(o.port))
        setFadeScenes(o.fadeScenes)
        setAutoEnd(o.autoEndStream)
        setAutoEndDelay(String(o.autoEndDelaySec))
      })
      .catch(() => {})
    window.plinko.onObsStatus((s) => setStatus(s))
    window.plinko.obsGetScenes().then((sc) => setStatus((prev) => ({ ...prev, scenes: sc }))).catch(() => {})
  }, [])

  const scenes = status.scenes
  const toggleScene = (name: string): void =>
    setFadeScenes((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]))
  const save = (): void => {
    if (password) window.plinko.setObsPassword(password)
    window.plinko
      .setObsConfig({
        enabled,
        host: host.trim() || '127.0.0.1',
        port: parseInt(port, 10) || 4455,
        fadeScenes,
        autoEndStream: autoEnd,
        autoEndDelaySec: parseInt(autoEndDelay, 10) || 0
      })
      .then(() => {
        setPassword('')
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      })
  }

  return (
    <div className="int-row">
      <div className="int-head">
        <strong>OBS (scene fade + danger zone)</strong>
        <span className={`int-dot int-${status.status}`} title={status.detail ?? status.status}>
          ● <span className="muted">{status.status}</span>
          {status.detail ? <span className="muted"> · {status.detail}</span> : null}
        </span>
      </div>
      <div className="row wrap">
        <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="host" />
        <input className="input port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="port" />
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="OBS WS password"
        />
      </div>
      <div className="row wrap">
        <label className="mini">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
        <button className="btn small" onClick={save}>
          {saved ? 'Saved ✓' : 'Save & connect'}
        </button>
        <button className="btn small" onClick={() => window.plinko.obsConnect()}>
          Reconnect
        </button>
        <button className="btn small" onClick={() => window.plinko.obsDisconnect()}>
          Disconnect
        </button>
      </div>
      <div className="well" style={{ marginTop: 8 }}>
        <div className="mini" style={{ marginBottom: 4 }}>
          Scenes that <strong>fade the board when idle</strong> (every other scene keeps it always shown):
        </div>
        {scenes.length === 0 ? (
          <p className="tiny-note" style={{ margin: 0 }}>Connect to load your OBS scenes.</p>
        ) : (
          <div className="row wrap">
            {scenes.map((sc) => (
              <label key={sc} className="mini">
                <input type="checkbox" checked={fadeScenes.includes(sc)} onChange={() => toggleScene(sc)} /> {sc}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="well" style={{ marginTop: 8 }}>
        <label className="mini">
          <input type="checkbox" checked={autoEnd} onChange={(e) => setAutoEnd(e.target.checked)} /> ⚠️ Danger zone: auto-end
          the stream when the timer hits 0
        </label>
        {autoEnd && (
          <div className="row wrap" style={{ marginTop: 6, alignItems: 'center', gap: 6 }}>
            <span className="mini">Wait</span>
            <input className="input port" value={autoEndDelay} onChange={(e) => setAutoEndDelay(e.target.value)} />
            <span className="mini">seconds, then StopStream.</span>
          </div>
        )}
      </div>
      <p className="tiny-note" style={{ margin: '6px 0 0' }}>
        Enable OBS's server first: <strong>Tools → WebSocket Server Settings → Enable</strong> (default port 4455), set a
        password, then Save &amp; connect.
      </p>
    </div>
  )
}
