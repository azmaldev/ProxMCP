import type { ProxMCPConfig } from './types.js'

export function defineConfig(config: ProxMCPConfig): ProxMCPConfig {
  return {
    port: 3000,
    host: '0.0.0.0',
    basePath: '/mcp',
    healthCheck: true,
    logLevel: 'info',
    ...config,
    upstreams: config.upstreams.map((u) => ({
      ...u,
      transport: u.transport ?? 'streamable-http',
      timeout: u.timeout ?? 30000,
      retries: u.retries ?? 2,
    })),
  }
}
