import type { ProxMCPPlugin, ProxMCPContext } from '@proxmcp/core'

export interface LoggerOptions {
  /** 'json' (default) or 'pretty' (human-readable with colors). */
  format?: 'json' | 'pretty'
  /** Which fields to include in log entries. */
  include?: {
    requestId?: boolean
    clientIp?: boolean
    apiKey?: boolean
    method?: boolean
    upstreamId?: boolean
    duration?: boolean
    statusCode?: boolean
  }
  /** Custom output function (default: console.log). */
  output?: (line: string) => void
}

const defaultInclude = {
  requestId: true,
  clientIp: true,
  apiKey: true,
  method: true,
  upstreamId: true,
  duration: true,
  statusCode: true,
}

function getStatusColor(code: number): string {
  if (code >= 500) return '\x1b[31m'
  if (code >= 400) return '\x1b[33m'
  if (code >= 300) return '\x1b[36m'
  return '\x1b[32m'
}

function prettyLog(
  symbol: string,
  symbolColor: string,
  ctx: ProxMCPContext,
  extra: Record<string, string | number | undefined>
): string {
  const id = ctx.requestId.slice(0, 8)
  const parts: string[] = []

  parts.push(`${symbolColor}${symbol}\x1b[0m`)
  parts.push(`\x1b[2m[${id}]\x1b[0m`)

  if (extra.method) {
    parts.push(`\x1b[1m${extra.method}\x1b[0m`)
  }

  if (extra.statusCode) {
    const sc = extra.statusCode as number
    parts.push(`${getStatusColor(sc)}${sc}\x1b[0m`)
  }

  if (extra.upstreamId) {
    parts.push(`${extra.upstreamId}`)
  }

  if (extra.durationMs !== undefined) {
    parts.push(`\x1b[2m${extra.durationMs}ms\x1b[0m`)
  }

  const detail: string[] = []
  if (extra.clientIp) detail.push(extra.clientIp as string)
  if (extra.apiKey) detail.push(`key: ${extra.apiKey}`)

  if (detail.length > 0) {
    parts.push(`\x1b[2m(${detail.join(', ')})\x1b[0m`)
  }

  return parts.join(' ')
}

export function loggerPlugin(options?: LoggerOptions): ProxMCPPlugin {
  const fmt = options?.format ?? 'json'
  const include = { ...defaultInclude, ...options?.include }
  const output = options?.output ?? console.log

  function jsonEntry(
    event: string,
    ctx: ProxMCPContext,
    extra: Record<string, unknown>
  ): string {
    const entry: Record<string, unknown> = { ts: new Date().toISOString(), event }

    if (include.requestId) entry.requestId = ctx.requestId
    if (include.clientIp) entry.clientIp = ctx.clientIp
    if (include.apiKey) entry.apiKey = ctx.apiKey
    if (include.method) entry.method = extra.method ?? ctx.metadata.method
    if (include.upstreamId) entry.upstreamId = ctx.upstreamId
    if (include.duration && extra.durationMs !== undefined)
      entry.durationMs = extra.durationMs
    if (include.statusCode && extra.statusCode !== undefined)
      entry.statusCode = extra.statusCode
    if (extra.error) entry.error = extra.error
    if (extra.code) entry.code = extra.code

    return JSON.stringify(entry)
  }

  return {
    name: 'proxmcp:logger',

    async onRequest(ctx: ProxMCPContext, request: Request): Promise<void> {
      let method = 'unknown'
      try {
        const cloned = request.clone()
        const body = await cloned.json()
        if (body && typeof body.method === 'string') {
          method = body.method
        }
      } catch {
        // ignore parse errors
      }
      ctx.metadata.method = method

      if (fmt === 'pretty') {
        const line = prettyLog('\u2192', '\x1b[32m', ctx, { method, clientIp: ctx.clientIp ?? undefined, apiKey: ctx.apiKey ?? undefined })
        output(line)
      } else {
        output(jsonEntry('request', ctx, { method }))
      }
    },

    async onResponse(
      ctx: ProxMCPContext,
      response: Response,
      durationMs: number
    ): Promise<void> {
      const statusCode = response.status

      if (fmt === 'pretty') {
        const line = prettyLog('\u2190', '\x1b[36m', ctx, {
          method: ctx.metadata.method as string | undefined,
          statusCode,
          upstreamId: ctx.upstreamId ?? undefined,
          durationMs,
          clientIp: ctx.clientIp ?? undefined,
          apiKey: ctx.apiKey ?? undefined,
        })
        output(line)
      } else {
        output(jsonEntry('response', ctx, { statusCode, durationMs }))
      }
    },

    async onError(ctx: ProxMCPContext, error: unknown): Promise<void> {
      const errObj = error as { code?: string; message?: string }
      const errMsg = errObj.message ?? String(error)
      const errCode = errObj.code

      if (fmt === 'pretty') {
        const fields: Record<string, string | number | undefined> = {
          method: ctx.metadata.method as string | undefined,
          upstreamId: ctx.upstreamId ?? undefined,
          error: errMsg,
          clientIp: ctx.clientIp ?? undefined,
          apiKey: ctx.apiKey ?? undefined,
        }
        const id = ctx.requestId.slice(0, 8)
        const detail: string[] = []
        if (fields.clientIp) detail.push(fields.clientIp as string)
        if (fields.apiKey) detail.push(`key: ${fields.apiKey}`)
        let line = `\x1b[31m\u2717\x1b[0m \x1b[2m[${id}]\x1b[0m`
        if (fields.method) line += ` \x1b[1m${fields.method}\x1b[0m`
        line += ` \x1b[31m${errMsg}\x1b[0m`
        if (errCode) line += ` \x1b[2m(${errCode})\x1b[0m`
        if (detail.length > 0) line += ` \x1b[2m(${detail.join(', ')})\x1b[0m`
        output(line)
      } else {
        output(jsonEntry('error', ctx, { error: errMsg, code: errCode }))
      }
    },
  }
}
