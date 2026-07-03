import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogEntry } from '@shared/types/log'

/**
 * Live dev console showing every server + client (overlay/panel) log entry in real time.
 * Useful for watching exactly what happens while reproducing a bug.
 */
export function DevConsole({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [levels, setLevels] = useState<{ info: boolean; warn: boolean; error: boolean }>({
    info: true,
    warn: true,
    error: true
  })
  const endRef = useRef<HTMLDivElement | null>(null)

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return logs.filter(
      (e) =>
        levels[e.level] &&
        (!f || e.scope.toLowerCase().includes(f) || e.message.toLowerCase().includes(f))
    )
  }, [logs, filter, levels])

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ block: 'end' })
  }, [shown, autoScroll])

  const copyAll = (): void => {
    const text = shown
      .map((e) => `${fmtTime(e.tsEpochMs)} ${e.level.toUpperCase()} [${e.scope}] ${e.message}${e.data !== undefined ? ' ' + fmtData(e.data) : ''}`)
      .join('\n')
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  return (
    <div className="dev">
      <div className="dev-toolbar">
        <input className="input" placeholder="filter (scope or text)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {(['info', 'warn', 'error'] as const).map((l) => (
          <label key={l} className="mini">
            <input type="checkbox" checked={levels[l]} onChange={(e) => setLevels((p) => ({ ...p, [l]: e.target.checked }))} /> {l}
          </label>
        ))}
        <label className="mini">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> autoscroll
        </label>
        <button className="btn small" onClick={copyAll}>Copy</button>
        <button className="btn small" onClick={onClear}>Clear</button>
        <span className="muted">{shown.length} / {logs.length}</span>
      </div>
      <div className="dev-log">
        {shown.map((e, i) => (
          <div key={i} className={`dev-line dev-${e.level}`}>
            <span className="dev-time">{fmtTime(e.tsEpochMs)}</span>
            <span className="dev-scope">[{e.scope}]</span>
            <span className="dev-msg">{e.message}</span>
            {e.data !== undefined && <span className="dev-data">{fmtData(e.data)}</span>}
          </div>
        ))}
        {shown.length === 0 && <div className="muted">No log entries yet — interact with the app to see events here.</div>}
        <div ref={endRef} />
      </div>
    </div>
  )
}

function fmtTime(ms: number): string {
  return new Date(ms).toISOString().slice(11, 23)
}
function fmtData(d: unknown): string {
  try {
    return typeof d === 'string' ? d : JSON.stringify(d)
  } catch {
    return String(d)
  }
}
