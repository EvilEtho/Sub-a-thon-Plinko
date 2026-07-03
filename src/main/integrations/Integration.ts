import { EventEmitter } from 'node:events'
import type { NormalizedEvent } from '../../shared/types/events'
import type { IntegrationConnStatus, IntegrationId } from '../../shared/types/socket'

export type { IntegrationId }
export type IntegrationStatus = IntegrationConnStatus

export interface StatusInfo {
  id: IntegrationId
  status: IntegrationStatus
  detail?: string
}

/**
 * Base class for a platform integration. Adapters normalize their platform's payloads
 * into NormalizedEvent and emit 'event'; connection lifecycle changes emit 'status'.
 */
export abstract class Integration extends EventEmitter {
  abstract readonly id: IntegrationId
  protected currentStatus: IntegrationStatus = 'disconnected'
  protected currentDetail: string | undefined

  get status(): IntegrationStatus {
    return this.currentStatus
  }

  get detail(): string | undefined {
    return this.currentDetail
  }

  protected setStatus(status: IntegrationStatus, detail?: string): void {
    this.currentStatus = status
    this.currentDetail = detail
    this.emit('status', { id: this.id, status, detail } satisfies StatusInfo)
  }

  protected emitEvent(evt: NormalizedEvent): void {
    this.emit('event', evt)
  }

  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
}
