/**
 * Base error class for all ProxMCP errors.
 * Carries a machine-readable code and an HTTP status code.
 */
export class ProxMCPError extends Error {
  constructor(
    message: string,
    /** Machine-readable error code (e.g. 'UPSTREAM_ERROR', 'AUTH_ERROR'). */
    public code: string,
    /** HTTP status code suitable for the error response. Defaults to 500. */
    public statusCode: number = 500
  ) {
    super(message)
    this.name = 'ProxMCPError'
  }

  /** Returns a JSON Response suitable for short-circuiting the plugin pipeline. */
  toResponse(): Response {
    return new Response(
      JSON.stringify({ error: { code: this.code, message: this.message } }),
      {
        status: this.statusCode,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/** Error thrown when an upstream MCP server request fails. */
export class UpstreamError extends ProxMCPError {
  /** The underlying error that caused the upstream failure. */
  cause: unknown

  constructor(
    /** Identifier of the upstream that failed. */
    upstreamId: string,
    /** The original error or reason for failure. */
    cause: unknown
  ) {
    super(`Upstream "${upstreamId}" failed`, 'UPSTREAM_ERROR', 502)
    this.name = 'UpstreamError'
    this.cause = cause
  }
}

/** Error thrown when authentication fails. */
export class AuthError extends ProxMCPError {
  constructor(
    /** Human-readable reason for the auth failure. Defaults to 'Unauthorized'. */
    message = 'Unauthorized'
  ) {
    super(message, 'AUTH_ERROR', 401)
    this.name = 'AuthError'
  }
}

/** Error thrown when the client exceeds the rate limit. */
export class RateLimitError extends ProxMCPError {
  constructor(
    /** Number of milliseconds the client should wait before retrying. */
    public retryAfterMs: number
  ) {
    super('Rate limit exceeded', 'RATE_LIMIT', 429)
    this.name = 'RateLimitError'
  }

  toResponse(): Response {
    const retryAfterSec = Math.ceil(this.retryAfterMs / 1000)
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: this.message,
          data: { retryAfterMs: this.retryAfterMs },
        },
      }),
      {
        status: this.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSec),
        },
      }
    )
  }
}
