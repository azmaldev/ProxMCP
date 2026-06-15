import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { ProxMCPContext } from '@proxmcp/core'
import { rateLimitPlugin } from '../index.js'

function makeContext(): ProxMCPContext {
  return {
    requestId: crypto.randomUUID(),
    clientIp: '127.0.0.1',
    apiKey: null,
    upstreamId: null,
    startTime: Date.now(),
    metadata: {},
  }
}

describe('rateLimitPlugin', () => {
  it('requests under the limit pass through', () => {
    const plugin = rateLimitPlugin({ limit: 5, windowMs: 60_000 })
    const ctx = makeContext()
    const req = new Request('http://localhost/mcp')

    for (let i = 0; i < 3; i++) {
      const result = plugin.onRequest!(ctx, req)
      assert.equal(result, undefined, `request ${i} should pass`)
    }
  })

  it('request at the limit passes', () => {
    const plugin = rateLimitPlugin({ limit: 3, windowMs: 60_000 })
    const ctx = makeContext()
    const req = new Request('http://localhost/mcp')

    for (let i = 0; i < 3; i++) {
      const result = plugin.onRequest!(ctx, req)
      assert.equal(result, undefined, `request ${i} should pass`)
    }
  })

  it('request over the limit returns 429 with Retry-After', () => {
    mock.timers.enable({ apis: ['Date'] })

    try {
      const plugin = rateLimitPlugin({ limit: 2, windowMs: 60_000 })
      const ctx = makeContext()
      const req = new Request('http://localhost/mcp')

      plugin.onRequest!(ctx, req)
      plugin.onRequest!(ctx, req)

      const result = plugin.onRequest!(ctx, req) as Response
      assert.ok(result instanceof Response)
      assert.equal(result.status, 429)

      const retryAfter = result.headers.get('Retry-After')
      assert.ok(retryAfter)
      assert.ok(Number(retryAfter) > 0)
    } finally {
      mock.timers.reset()
    }
  })

  it('after the window expires, the counter resets', () => {
    mock.timers.enable({ apis: ['Date'] })

    try {
      const plugin = rateLimitPlugin({ limit: 1, windowMs: 1000 })
      const ctx = makeContext()
      const req = new Request('http://localhost/mcp')

      plugin.onRequest!(ctx, req)

      const result = plugin.onRequest!(ctx, req) as Response
      assert.equal(result.status, 429)

      mock.timers.tick(1500)

      const result2 = plugin.onRequest!(ctx, req)
      assert.equal(result2, undefined)
    } finally {
      mock.timers.reset()
    }
  })
})
