/**
 * Twitch OAuth Device Code Flow for a public client (no secret on device). Also handles
 * secretless token refresh (public clients can refresh with client_id only).
 */
const DEVICE_URL = 'https://id.twitch.tv/oauth2/device'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate'

export interface DeviceCodeStart {
  deviceCode: string
  userCode: string
  verificationUri: string
  interval: number
  expiresIn: number
}

export interface TwitchTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string[]
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function startDeviceCode(clientId: string, scopes: string[]): Promise<DeviceCodeStart> {
  const res = await fetch(DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scopes: scopes.join(' ') })
  })
  if (!res.ok) throw new Error(`device code start failed: HTTP ${res.status}`)
  const j = (await res.json()) as Record<string, unknown>
  return {
    deviceCode: String(j.device_code),
    userCode: String(j.user_code),
    verificationUri: String(j.verification_uri),
    interval: Number(j.interval ?? 5),
    expiresIn: Number(j.expires_in ?? 1800)
  }
}

export async function pollDeviceToken(
  clientId: string,
  scopes: string[],
  start: DeviceCodeStart,
  shouldCancel?: () => boolean
): Promise<TwitchTokens> {
  const deadline = Date.now() + start.expiresIn * 1000
  let interval = start.interval * 1000
  while (Date.now() < deadline) {
    if (shouldCancel?.()) throw new Error('cancelled')
    await sleep(interval)
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        scopes: scopes.join(' '),
        device_code: start.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })
    const j = (await res.json()) as Record<string, unknown>
    if (res.ok && j.access_token) {
      return {
        accessToken: String(j.access_token),
        refreshToken: String(j.refresh_token ?? ''),
        expiresAt: Date.now() + Number(j.expires_in ?? 14400) * 1000,
        scope: Array.isArray(j.scope) ? (j.scope as string[]) : scopes
      }
    }
    const message = String(j.message ?? '')
    if (message && message !== 'authorization_pending') {
      if (message === 'slow_down') {
        interval += 5000
        continue
      }
      throw new Error(message)
    }
  }
  throw new Error('device code expired before authorization')
}

export async function refreshTwitchToken(
  clientId: string,
  refreshToken: string
): Promise<TwitchTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  })
  const j = (await res.json()) as Record<string, unknown>
  if (!res.ok || !j.access_token) throw new Error(String(j.message ?? 'token refresh failed'))
  return {
    accessToken: String(j.access_token),
    refreshToken: String(j.refresh_token ?? refreshToken),
    expiresAt: Date.now() + Number(j.expires_in ?? 14400) * 1000,
    scope: Array.isArray(j.scope) ? (j.scope as string[]) : []
  }
}

export interface TwitchIdentity {
  userId: string
  login: string
}

/** Validate an access token and return the authenticated user's id + login. */
export async function validateToken(accessToken: string): Promise<TwitchIdentity> {
  const res = await fetch(VALIDATE_URL, { headers: { Authorization: `OAuth ${accessToken}` } })
  if (!res.ok) throw new Error(`token validation failed: HTTP ${res.status}`)
  const j = (await res.json()) as Record<string, unknown>
  return { userId: String(j.user_id), login: String(j.login) }
}

export const TWITCH_SCOPES = ['channel:read:subscriptions', 'bits:read']
