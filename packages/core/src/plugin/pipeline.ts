import type { ProxMCPPlugin, ProxMCPConfig, ProxMCPContext } from '../types.js'

export class PluginPipeline {
  constructor(private plugins: ProxMCPPlugin[]) {}

  async init(config: ProxMCPConfig): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onInit) {
        try {
          await plugin.onInit(config)
        } catch (error) {
          throw new Error(
            `Plugin '${plugin.name}' failed to initialize: ${error}`
          )
        }
      }
    }
  }

  async runRequest(
    ctx: ProxMCPContext,
    request: Request
  ): Promise<Response | null> {
    for (const plugin of this.plugins) {
      if (plugin.onRequest) {
        const result = await plugin.onRequest(ctx, request)
        if (result instanceof Response) {
          return result
        }
      }
    }
    return null
  }

  async runResponse(
    ctx: ProxMCPContext,
    response: Response,
    durationMs: number
  ): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onResponse) {
        try {
          await plugin.onResponse(ctx, response, durationMs)
        } catch (error) {
          console.error(
            `Plugin '${plugin.name}' onResponse error:`,
            error
          )
        }
      }
    }
  }

  async runError(ctx: ProxMCPContext, error: unknown): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onError) {
        try {
          await plugin.onError(ctx, error)
        } catch (pluginError) {
          console.error(
            `Plugin '${plugin.name}' onError error:`,
            pluginError
          )
        }
      }
    }
  }
}
