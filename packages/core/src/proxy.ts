import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import type { ProxMCPConfig, ProxMCPContext, ProxMCPTool, ProxMCPPlugin } from './types.js'
import type { ProxMCPError } from './errors.js'
import { UpstreamClient } from './upstream/client.js'
import { ToolRegistryImpl } from './upstream/registry.js'
import { PluginPipeline } from './plugin/pipeline.js'
import { createContext } from './plugin/context.js'

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

export class ProxMCP {
  private app: Hono
  private config: ProxMCPConfig
  private clients: Map<string, UpstreamClient> = new Map()
  private registry: ToolRegistryImpl = new ToolRegistryImpl()
  private pipeline: PluginPipeline
  private server: ServerType | null = null

  constructor(config: ProxMCPConfig) {
    this.config = config
    this.pipeline = new PluginPipeline(config.plugins ?? [])
    this.app = new Hono()
    this.setupRoutes()
  }

  private setupRoutes(): void {
    if (this.config.cors) {
      const origin =
        this.config.cors.origins === '*'
          ? '*'
          : this.config.cors.origins
      this.app.use(
        '*',
        cors({
          origin,
          credentials: this.config.cors.credentials,
          allowMethods: ['GET', 'POST', 'OPTIONS'],
          allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
          exposeHeaders: ['Content-Type'],
        })
      )
    }

    if (this.config.healthCheck !== false) {
      this.app.get('/health', (c) => {
        return c.json({
          status: 'ok',
          upstreams: this.config.upstreams.map((uc) => ({
            id: uc.id,
            connected: this.clients.has(uc.id),
          })),
          tools: this.registry.tools.length,
        })
      })
    }

    const basePath = this.config.basePath ?? '/mcp'

    this.app.get('/sse', async (c) => {
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')

      const body = new ReadableStream({
        start(controller) {
          const endpoint = basePath
          controller.enqueue(
            new TextEncoder().encode(`event: endpoint\ndata: ${endpoint}\n\n`)
          )

          const keepAlive = setInterval(() => {
            try {
              controller.enqueue(new TextEncoder().encode(': keepalive\n\n'))
            } catch {
              clearInterval(keepAlive)
            }
          }, 15000)

          c.req.raw.signal.addEventListener('abort', () => {
            clearInterval(keepAlive)
            controller.close()
          })
        },
      })

      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    })

    this.app.post(basePath, async (c) => {
      const ctx = createContext(c.req.raw)

      const pluginResponse = await this.pipeline.runRequest(ctx, c.req.raw)
      if (pluginResponse) {
        return pluginResponse
      }

      let body: Record<string, unknown> | undefined
      try {
        body = await c.req.json()
      } catch {
        return c.json(jsonRpcError(null, -32700, 'Parse error'), 400)
      }

      if (!body || body.jsonrpc !== '2.0') {
        return c.json(jsonRpcError(null, -32600, 'Invalid Request'), 400)
      }

      const reqId = body.id ?? null
      const method = body.method as string | undefined
      const params = body.params

      if (!method) {
        return c.json(jsonRpcError(reqId, -32600, 'Invalid Request'), 400)
      }

      try {
        let result: unknown

        switch (method) {
          case 'initialize': {
            const upstreamResults = await Promise.allSettled(
              Array.from(this.clients.entries()).map(async ([id, client]) => {
                const info = client.getServerVersion()
                const caps = client.getServerCapabilities()
                return { id, info, caps }
              })
            )

            const mergedCapabilities: Record<string, unknown> = {}
            for (const r of upstreamResults) {
              if (r.status === 'fulfilled' && r.value.caps) {
                Object.assign(mergedCapabilities, r.value.caps)
              }
            }

            result = {
              protocolVersion: '2025-11-25',
              capabilities: mergedCapabilities,
              serverInfo: { name: 'proxmcp', version: '0.1.0' },
            }
            break
          }

          case 'ping': {
            result = {}
            break
          }

          case 'tools/list': {
            let filtered = this.registry.tools as ProxMCPTool[]
            for (const plugin of this.config.plugins ?? []) {
              if (typeof (plugin as ProxMCPPlugin & { filterTools: Function }).filterTools === 'function') {
                filtered = (plugin as ProxMCPPlugin & { filterTools: (t: ProxMCPTool[]) => ProxMCPTool[] }).filterTools(filtered)
              }
            }
            const tools = filtered.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            }))
            result = { tools }
            break
          }

          case 'tools/call': {
            const p = params as { name?: string; arguments?: unknown } | undefined
            const toolName = p?.name
            const args = p?.arguments

            if (!toolName) {
              return c.json(jsonRpcError(reqId, -32602, 'Missing tool name'), 400)
            }

            const tool = this.registry.resolve(toolName)
            if (!tool) {
              return c.json(
                jsonRpcError(reqId, -32602, `Unknown tool: ${toolName}`),
                404
              )
            }

            ctx.upstreamId = tool.upstreamId
            const client = this.clients.get(tool.upstreamId)
            if (!client) {
              return c.json(
                jsonRpcError(
                  reqId,
                  -32000,
                  `Upstream ${tool.upstreamId} not available`
                ),
                502
              )
            }

            result = await client.callTool(toolName, args)
            break
          }

          default: {
            let forwarded = false
            const clientEntries = Array.from(this.clients.entries())
            for (const [id, client] of clientEntries) {
              try {
                ctx.upstreamId = id
                result = await client.forwardRequest(method, params)
                forwarded = true
                break
              } catch {
                continue
              }
            }

            if (!forwarded) {
              return c.json(
                jsonRpcError(reqId, -32601, `Method not found: ${method}`),
                404
              )
            }
            break
          }
        }

        const response = c.json({
          jsonrpc: '2.0',
          id: reqId,
          result,
        })

        const durationMs = Date.now() - ctx.startTime
        this.pipeline.runResponse(ctx, response, durationMs).catch(console.error)

        return response
      } catch (error) {
        this.pipeline.runError(ctx, error).catch(console.error)

        const err = error as { statusCode?: number; message?: string }
        const statusCode =
          typeof err.statusCode === 'number' ? err.statusCode : 500
        const message = err.message ?? 'Internal error'

        return c.json(
          jsonRpcError(reqId, -32000, message),
          statusCode as 500 | 502 | 401 | 429
        )
      }
    })
  }

  async start(): Promise<void> {
    if (!this.config.upstreams || this.config.upstreams.length === 0) {
      throw new Error('At least one upstream is required')
    }

    for (const uc of this.config.upstreams) {
      this.clients.set(uc.id, new UpstreamClient(uc))
    }

    const connectResults = await Promise.allSettled(
      Array.from(this.clients.values()).map((client) => client.connect())
    )

    for (const result of connectResults) {
      if (result.status === 'rejected') {
        console.warn('Upstream connection failed:', result.reason)
      }
    }

    await this.registry.refresh(Array.from(this.clients.values()))

    await this.pipeline.init(this.config)

    const port = this.config.port ?? 3000
    const host = this.config.host ?? '0.0.0.0'

    this.server = serve({
      fetch: this.app.fetch,
      port,
      hostname: host,
    })

    console.log(
      `ProxMCP started on http://${host}:${port}${this.config.basePath ?? '/mcp'}`
    )
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close()
      this.server = null
    }

    const results = await Promise.allSettled(
      Array.from(this.clients.values()).map((client) => client.disconnect())
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn('Upstream disconnect failed:', result.reason)
      }
    }

    this.clients.clear()
  }

  getToolCount(): number {
    return this.registry.tools.length
  }

  getUpstreamCount(): number {
    return this.clients.size
  }

  getApp(): Hono {
    return this.app
  }
}
