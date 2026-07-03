import net from 'node:net'

/** Resolve whether a TCP port is free to bind on 127.0.0.1. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const tester = net
      .createServer()
      .once('error', () => resolvePromise(false))
      .once('listening', () => {
        tester.close(() => resolvePromise(true))
      })
      .listen(port, '127.0.0.1')
  })
}

/**
 * Find a free port, preferring `preferred` and scanning upward. Returns 0 if none of
 * the scanned ports are free, letting the caller bind to an OS-assigned port.
 */
export async function findFreePort(preferred: number, maxTries = 25): Promise<number> {
  for (let i = 0; i < maxTries; i++) {
    const candidate = preferred + i
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(candidate)) return candidate
  }
  return 0
}

export const DEFAULT_PORT = 3737
