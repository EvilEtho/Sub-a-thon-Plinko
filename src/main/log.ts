import type { LogEntry, LogLevel } from '../shared/types/log'

type Sink = (e: LogEntry) => void
let sink: Sink | null = null

/** Set a sink that receives every log entry (used to broadcast to the dev console). */
export function setLogSink(fn: Sink | null): void {
  sink = fn
}

function safe(data: unknown): string {
  try {
    return typeof data === 'string' ? data : JSON.stringify(data)
  } catch {
    return String(data)
  }
}

function emit(level: LogLevel, scope: string, message: string, data?: unknown): void {
  const entry: LogEntry = { tsEpochMs: Date.now(), level, scope, message, data }
  const time = new Date(entry.tsEpochMs).toISOString().slice(11, 23)
  const line = `[${time}] ${level.toUpperCase()} [${scope}] ${message}${data !== undefined ? ' ' + safe(data) : ''}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
  try {
    sink?.(entry)
  } catch {
    /* never let logging throw */
  }
}

/** Structured logger: prints to stdout (visible in the terminal) and to the dev console. */
export const log = {
  info: (scope: string, message: string, data?: unknown) => emit('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => emit('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) => emit('error', scope, message, data)
}
