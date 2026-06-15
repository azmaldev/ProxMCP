import type { ProxMCPPlugin, ProxMCPContext } from '@proxmcp/core'
import { RateLimitError } from '@proxmcp/core'

export interface RateLimitOptions {
  /** Max requests per window. */
  limit: number
  /** Window size in milliseconds. */
  windowMs: number
  /** What to key on. Default: 'ip'. */
  keyBy?: 'ip' | 'apikey' | 'global'
  /** Custom error message. */
  message?: string
}

export function rateLimitPlugin(options: RateLimitOptions): ProxMCPPlugin {
  const limit = options.limit
  const windowMs = options.windowMs
  const keyBy = options.keyBy ?? 'ip'
  const errorMessage = options.message ?? 'Rate limit exceeded'

  // For distributed deployments, replace Map with a shared store
  // (Redis, Cloudflare KV, etc.)
  const store = new Map<string, number[]>()
  let sweepTimer: ReturnType<typeof setInterval> | null = null

  return {
    name: 'proxmcp:rate-limit',

    onInit() {
      sweepTimer = setInterval(() => {
        for (const [key, timestamps] of store) {
          if (timestamps.length === 0) {
            store.delete(key)
          }
        }
      }, 60000)
      // TODO: sweepTimer is never cleared on shutdown (no plugin shutdown hook).
      // Minor leak is acceptable for now.
    },

    onRequest(ctx: ProxMCPContext, _request: Request): Response | void {
      try {
        let rateKey: string
        switch (keyBy) {
          case 'ip':
            rateKey = ctx.clientIp ?? 'unknown'
            break
          case 'apikey':
            rateKey = ctx.apiKey ?? ctx.clientIp ?? 'unknown'
            break
          case 'global':
            rateKey = '__global__'
            break
          default:
            rateKey = ctx.clientIp ?? 'unknown'
            break
        }

        const now = Date.now()
        let timestamps = store.get(rateKey)
        if (!timestamps) {
          timestamps = []
          store.set(rateKey, timestamps)
        }

        const cutoff = now - windowMs
        let writeIdx = 0
        for (let i = 0; i < timestamps.length; i++) {
          if (timestamps[i] > cutoff) {
            timestamps[writeIdx++] = timestamps[i]
          }
        }
        timestamps.length = writeIdx

        if (timestamps.length >= limit) {
          const retryAfterMs = windowMs - (now - timestamps[0])
          return new RateLimitError(retryAfterMs).toResponse()
        }

        timestamps.push(now)
      } catch (error) {
        console.error('Rate limit plugin error:', error)
      }
    },
  }
}
