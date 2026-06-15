import type { ProxMCPContext } from '../types.js'

export function createContext(request: Request): ProxMCPContext {
  const clientIp =
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For') ??
    request.headers.get('x-real-ip') ??
    null

  const authHeader = request.headers.get('Authorization')
  const apiKeyHeader = request.headers.get('x-api-key')

  let apiKey: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7)
  } else if (apiKeyHeader) {
    apiKey = apiKeyHeader
  }

  return {
    requestId: crypto.randomUUID(),
    clientIp,
    apiKey,
    upstreamId: null,
    startTime: Date.now(),
    metadata: {},
  }
}
