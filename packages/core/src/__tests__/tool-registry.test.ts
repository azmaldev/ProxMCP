import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ProxMCPTool } from '../types.js'
import { ToolRegistryImpl } from '../upstream/registry.js'

function makeClient(id: string, tools: ProxMCPTool[]) {
  return {
    listTools: () => Promise.resolve(tools),
  }
}

describe('ToolRegistryImpl', () => {
  it('refresh() with two clients merges their tools', async () => {
    const registry = new ToolRegistryImpl()
    const clientA = makeClient('a', [
      { name: 'read', description: 'read file', inputSchema: {}, upstreamId: 'a' },
    ])
    const clientB = makeClient('b', [
      { name: 'write', description: 'write file', inputSchema: {}, upstreamId: 'b' },
    ])

    await registry.refresh([clientA as never, clientB as never])

    assert.equal(registry.tools.length, 2)
    assert.ok(registry.resolve('read'))
    assert.ok(registry.resolve('write'))
  })

  it('refresh() logs a warning on name conflict and last wins', async () => {
    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (msg: unknown) => warnings.push(String(msg))

    const registry = new ToolRegistryImpl()
    const clientA = makeClient('a', [
      { name: 'dup', description: 'from a', inputSchema: {}, upstreamId: 'a' },
    ])
    const clientB = makeClient('b', [
      { name: 'dup', description: 'from b', inputSchema: {}, upstreamId: 'b' },
    ])

    await registry.refresh([clientA as never, clientB as never])

    console.warn = origWarn

    assert.ok(warnings.some((w) => w.includes('Tool name conflict')))
    assert.ok(warnings.some((w) => w.includes('dup')))
    assert.equal(registry.resolve('dup')?.description, 'from b')
  })

  it('refresh() with one failing client still returns the other tools', async () => {
    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (msg: unknown) => warnings.push(String(msg))

    const registry = new ToolRegistryImpl()
    const good = makeClient('good', [
      { name: 'ok', description: 'works', inputSchema: {}, upstreamId: 'good' },
    ])
    const bad = {
      listTools: () => Promise.reject(new Error('connection failed')),
    }

    await registry.refresh([good as never, bad as never])

    console.warn = origWarn

    assert.equal(registry.tools.length, 1)
    assert.ok(registry.resolve('ok'))
    assert.ok(warnings.some((w) => w.includes('Failed to list tools')))
  })

  it('resolve() returns the correct tool by name', async () => {
    const registry = new ToolRegistryImpl()
    await registry.refresh([
      makeClient('x', [
        { name: 'alpha', description: 'first', inputSchema: {}, upstreamId: 'x' },
        { name: 'beta', description: 'second', inputSchema: {}, upstreamId: 'x' },
      ]) as never,
    ])

    const found = registry.resolve('beta')
    assert.ok(found)
    assert.equal(found!.name, 'beta')
    assert.equal(found!.description, 'second')
    assert.equal(found!.upstreamId, 'x')

    const missing = registry.resolve('gamma')
    assert.equal(missing, undefined)
  })
})
