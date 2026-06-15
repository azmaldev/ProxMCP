import { defineConfig } from '@proxmcp/core'
import { authPlugin } from '@proxmcp/plugin-auth'
import { rateLimitPlugin } from '@proxmcp/plugin-rate-limit'
import { loggerPlugin } from '@proxmcp/plugin-logger'

export default defineConfig({
  port: 3000,
  upstreams: [
    {
      id: 'my-server',
      url: 'http://localhost:3001/mcp',
      transport: 'streamable-http',
    },
  ],
  plugins: [
    authPlugin({
      mode: 'apikey',
      keys: process.env.PROXMCP_API_KEY ?? 'dev-key',
    }),
    rateLimitPlugin({
      limit: 60,
      windowMs: 60_000,
      keyBy: 'ip',
    }),
    loggerPlugin({
      format: 'pretty',
    }),
  ],
})
