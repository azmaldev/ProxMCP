import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { UpstreamConfig, ProxMCPTool } from '../types.js'
import { UpstreamError } from '../errors.js'

export class UpstreamClient {
  private _client: Client | null = null
  private _transport: Transport | null = null

  constructor(private config: UpstreamConfig) {}

  async connect(): Promise<void> {
    try {
      this._transport = this._createTransport()
      this._client = new Client(
        { name: 'proxmcp', version: '0.1.0' },
        { enforceStrictCapabilities: false }
      )
      await this._client.connect(this._transport, {
        timeout: this.config.timeout ?? 30000,
      })
    } catch (cause) {
      throw new UpstreamError(this.config.id, cause)
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this._client?.close()
    } catch (cause) {
      throw new UpstreamError(this.config.id, cause)
    } finally {
      this._client = null
      this._transport = null
    }
  }

  async listTools(): Promise<ProxMCPTool[]> {
    return this._withRetry(async () => {
      if (!this._client) {
        throw new Error('Client not connected')
      }
      const result = await this._client.listTools(undefined, {
        timeout: this.config.timeout ?? 30000,
      })
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        upstreamId: this.config.id,
      }))
    })
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    return this._withRetry(async () => {
      if (!this._client) {
        throw new Error('Client not connected')
      }
      const result = await this._client.callTool(
        { name, arguments: args as Record<string, unknown> | undefined },
        undefined,
        { timeout: this.config.timeout ?? 30000 }
      )
      return result
    })
  }

  getServerVersion(): { name: string; version: string } | undefined {
    return this._client?.getServerVersion()
  }

  getServerCapabilities(): Record<string, unknown> | undefined {
    const caps = this._client?.getServerCapabilities()
    return caps as Record<string, unknown> | undefined
  }

  async forwardRequest(method: string, params: unknown): Promise<unknown> {
    if (!this._client) {
      throw new Error('Client not connected')
    }
    const client = this._client as unknown as {
      request: (
        req: { method: string; params?: unknown },
        schema: typeof ResultSchema,
        opts?: { timeout?: number }
      ) => Promise<unknown>
    }
    const result = await client.request(
      { method, params },
      ResultSchema,
      { timeout: this.config.timeout ?? 30000 }
    )
    return result
  }

  private _createTransport(): Transport {
    switch (this.config.transport) {
      case 'streamable-http': {
        return new StreamableHTTPClientTransport(new URL(this.config.url), {
          requestInit: this.config.headers
            ? { headers: this.config.headers }
            : undefined,
        })
      }
      case 'sse': {
        return new SSEClientTransport(new URL(this.config.url), {
          requestInit: this.config.headers
            ? { headers: this.config.headers }
            : undefined,
        })
      }
      case 'stdio': {
        if (!this.config.command || this.config.command.length === 0) {
          throw new Error(
            `Upstream "${this.config.id}": command is required for stdio transport`
          )
        }
        return new StdioClientTransport({
          command: this.config.command[0],
          args: this.config.command.slice(1),
        })
      }
      default: {
        const _exhaustive: never = this.config.transport
        throw new Error(`Unknown transport: ${_exhaustive}`)
      }
    }
  }

  private async _withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const maxRetries = this.config.retries ?? 2
    let lastError: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err
        if (attempt < maxRetries) {
          const delay = 100 * Math.pow(2, attempt)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw new UpstreamError(this.config.id, lastError)
  }
}
