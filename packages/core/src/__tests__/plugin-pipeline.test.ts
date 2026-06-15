import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { ProxMCPPlugin, ProxMCPContext, ProxMCPConfig } from '../types.js'
import { PluginPipeline } from '../plugin/pipeline.js'

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

describe('PluginPipeline', () => {
  it('onRequest short-circuits when a plugin returns a Response', async () => {
    const blocking = new Response('blocked', { status: 401 })
    let secondCalled = false

    const plugins: ProxMCPPlugin[] = [
      {
        name: 'blocker',
        onRequest() {
          return blocking
        },
      },
      {
        name: 'never-reached',
        onRequest() {
          secondCalled = true
        },
      },
    ]

    const pipeline = new PluginPipeline(plugins)
    const ctx = makeContext()
    const req = new Request('http://localhost/mcp', { method: 'POST' })
    const result = await pipeline.runRequest(ctx, req)

    assert.equal(result, blocking)
    assert.equal(result!.status, 401)
    assert.equal(secondCalled, false)
  })

  it('onRequest returns null when all plugins return void', async () => {
    const callOrder: string[] = []

    const plugins: ProxMCPPlugin[] = [
      {
        name: 'first',
        onRequest() {
          callOrder.push('first')
        },
      },
      {
        name: 'second',
        onRequest() {
          callOrder.push('second')
        },
      },
    ]

    const pipeline = new PluginPipeline(plugins)
    const ctx = makeContext()
    const req = new Request('http://localhost/mcp')
    const result = await pipeline.runRequest(ctx, req)

    assert.equal(result, null)
    assert.deepEqual(callOrder, ['first', 'second'])
  })

  it('onResponse errors do not propagate', async () => {
    const plugins: ProxMCPPlugin[] = [
      {
        name: 'failing',
        onResponse() {
          throw new Error('plugin failure')
        },
      },
    ]

    const pipeline = new PluginPipeline(plugins)
    const ctx = makeContext()
    const response = new Response('ok')

    await assert.doesNotReject(
      pipeline.runResponse(ctx, response, 10)
    )
  })

  it('onInit failure throws with context message', async () => {
    const plugins: ProxMCPPlugin[] = [
      {
        name: 'bad-plugin',
        onInit() {
          throw new Error('oops')
        },
      },
    ]

    const pipeline = new PluginPipeline(plugins)
    const config = { upstreams: [] } as unknown as ProxMCPConfig

    await assert.rejects(
      pipeline.init(config),
      (err: Error) => {
        assert.ok(err.message.includes("Plugin 'bad-plugin' failed to initialize:"))
        assert.ok(err.message.includes('oops'))
        return true
      }
    )
  })
})
