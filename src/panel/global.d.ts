import type { PlinkoApi } from '@shared/types/ipc'

declare global {
  interface Window {
    plinko: PlinkoApi
  }
}

export {}
