import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ProxMCPContext } from '@proxmcp/core'
import { authPlugin } from '../index.js'

function makeContext(): ProxMCPContext {
  return {
    requestId: crypto.randomUUID(),
    clientIp: null,
    apiKey: null,
    upstreamId: null,
    startTime: Date.now(),
    metadata: {},
  }
}

describe('authPlugin (apikey mode)', () => {
  it('valid key in x-api-key header passes through', () => {
    const plugin = authPlugin({ mode: 'apikey', keys: 'my-secret-key' })
    const ctx = makeContext()
    const req = new Request('http://localhost/mcp', {
      headers: { 'x-api-key': 'my-secret-key' },
    })

    const result = plugin.onRequest!(ctx, req)
    assert.equal(result, undefined)
    assert.equal(ctx.apiKey, 'my-secre...')
  })

  it('valid key in Authorization: Bearer header passes through', () => {
    const plugin = authPlugin({ mode: 'apikey', keys: 'bearer-key' })
    const ctx = makeContext()
    const req = new Request('http://localhost/mcp', {
      headers: { Authorization: 'Bearer bearer-key' },
    })

    const result = plugin.onRequest!(ctx, req)
    assert.equal(result, undefined)
    assert.equal(ctx.apiKey, 'bearer-k...')
  })

  it('invalid key returns 401 Response', () => {
    const plugin = authPlugin({ mode: 'apikey', keys: 'correct-key' })
    const ctx = makeContext()
    const req = new Request('http://localhost/mcp', {
      headers: { 'x-api-key': 'wrong-key' },
    })

    const result = plugin.onRequest!(ctx, req) as Response
    assert.ok(result instanceof Response)
    assert.equal(result.status, 401)
  })

  it('missing key header returns 401 Response', () => {
    const plugin = authPlugin({ mode: 'apikey', keys: 'any-key' })
    const ctx = makeContext()
    const req = new Request('http://localhost/mcp')

    const result = plugin.onRequest!(ctx, req) as Response
    assert.ok(result instanceof Response)
    assert.equal(result.status, 401)
  })

  it('timing-safe comparison handles mismatched length keys without throwing', () => {
    const plugin = authPlugin({ mode: 'apikey', keys: 'short' })
    const ctx = makeContext()
    const req = new Request('http://localhost/mcp', {
      headers: { 'x-api-key': 'a-much-longer-key' },
    })

    assert.doesNotThrow(() => {
      const result = plugin.onRequest!(ctx, req)
      assert.ok(result instanceof Response)
      assert.equal(result.status, 401)
    })
  })
})
