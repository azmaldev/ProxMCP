import type { ProxMCPTool, ToolRegistry } from '../types.js'
import type { UpstreamClient } from './client.js'

export class ToolRegistryImpl implements ToolRegistry {
  private toolMap: Map<string, ProxMCPTool> = new Map()

  async refresh(clients: UpstreamClient[]): Promise<void> {
    const results = await Promise.allSettled(
      clients.map((client) => client.listTools())
    )

    for (let i = 0; i < results.length; i++) {
      const result = results[i]

      if (result.status === 'rejected') {
        console.warn(
          `Failed to list tools from upstream: ${result.reason}`
        )
        continue
      }

      const tools = result.value
      for (const tool of tools) {
        const existing = this.toolMap.get(tool.name)
        if (existing) {
          console.warn(
            `Tool name conflict: ${tool.name} from ${existing.upstreamId} overridden by ${tool.upstreamId}`
          )
        }
        this.toolMap.set(tool.name, tool)
      }
    }
  }

  resolve(toolName: string): ProxMCPTool | undefined {
    return this.toolMap.get(toolName)
  }

  get tools(): ProxMCPTool[] {
    return Array.from(this.toolMap.values())
  }
}
