import { defineConfig } from '@proxmcp/core'
import { authPlugin } from '@proxmcp/plugin-auth'
import { rateLimitPlugin } from '@proxmcp/plugin-rate-limit'
import { loggerPlugin } from '@proxmcp/plugin-logger'
import { toolFilterPlugin } from '@proxmcp/plugin-tool-filter'

export default defineConfig({
  port: 3000,
  upstreams: [
    {
      id: 'filesystem',
      url: 'http://localhost:3001/mcp',
      transport: 'streamable-http',
    },
    {
      id: 'github',
      url: 'http://localhost:3002/mcp',
      transport: 'streamable-http',
    },
  ],
  plugins: [
    authPlugin({
      mode: 'apikey',
      keys: process.env.PROXMCP_API_KEY ?? 'dev-key',
    }),
    rateLimitPlugin({
      limit: 200,
      windowMs: 60_000,
      keyBy: 'apikey',
    }),
    loggerPlugin({
      format: 'json',
    }),
    toolFilterPlugin({
      rename: { read_file: 'get_file' },
      deny: ['delete_file', 'delete_repository'],
      sanitizeDescriptions: true,
    }),
  ],
})
