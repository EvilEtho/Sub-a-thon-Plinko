export type LogLevel = 'info' | 'warn' | 'error'

/** A single dev-console log entry, shared between server and clients. */
export interface LogEntry {
  tsEpochMs: number
  level: LogLevel
  scope: string
  message: string
  data?: unknown
}

/** What a client (overlay/panel) sends to the server to be logged. */
export interface ClientLogInput {
  level: LogLevel
  scope: string
  message: string
  data?: unknown
}
