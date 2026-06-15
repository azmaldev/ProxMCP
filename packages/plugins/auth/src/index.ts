import type { ProxMCPPlugin, ProxMCPContext } from '@proxmcp/core'
import { AuthError } from '@proxmcp/core'

export interface ApiKeyOptions {
  mode: 'apikey'
  /** Single key or array of keys. Checked against 'x-api-key' header OR 'Authorization: Bearer {key}' header. */
  keys: string | string[]
  /** Optional: map key → label for logging (don't log the actual key). */
  labels?: Record<string, string>
}

export interface BearerPassthroughOptions {
  mode: 'bearer-passthrough'
  /** If true, require an Authorization: Bearer header to be present, but do not validate the token. */
  required: boolean
}

export type AuthOptions = ApiKeyOptions | BearerPassthroughOptions

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const aBuf = enc.encode(a)
  const bBuf = enc.encode(b)

  let result = aBuf.length ^ bBuf.length
  const min = Math.min(aBuf.length, bBuf.length)
  for (let i = 0; i < min; i++) {
    result |= aBuf[i] ^ bBuf[i]
  }
  return result === 0
}

export function authPlugin(options: AuthOptions): ProxMCPPlugin {
  const allowedKeys =
    options.mode === 'apikey'
      ? typeof options.keys === 'string'
        ? [options.keys]
        : options.keys
      : []

  return {
    name: 'proxmcp:auth',

    onRequest(ctx: ProxMCPContext, request: Request): Response | void {
      const apiKeyHeader = request.headers.get('x-api-key')
      const authHeader = request.headers.get('Authorization')
      const bearerToken =
        authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

      const extractedKey = apiKeyHeader ?? bearerToken

      switch (options.mode) {
        case 'apikey': {
          if (!extractedKey) {
            return new AuthError('Missing API key').toResponse()
          }

          const match = allowedKeys.find((k) => timingSafeEqual(k, extractedKey))
          if (!match) {
            return new AuthError('Invalid API key').toResponse()
          }

          ctx.apiKey =
            options.labels?.[match] ?? extractedKey.slice(0, 8) + '...'
          return
        }

        case 'bearer-passthrough': {
          if (options.required && !bearerToken) {
            return new AuthError('Missing Authorization header').toResponse()
          }

          if (bearerToken) {
            ctx.apiKey = 'bearer'
          }
          return
        }
      }
    },
  }
}
