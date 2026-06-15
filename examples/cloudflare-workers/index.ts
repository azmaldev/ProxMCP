import { ProxMCP } from '@proxmcp/core'
import { authPlugin } from '@proxmcp/plugin-auth'
import { rateLimitPlugin } from '@proxmcp/plugin-rate-limit'
import { loggerPlugin } from '@proxmcp/plugin-logger'

const proxy = new ProxMCP({
  upstreams: [
    {
      id: 'api',
      url: 'https://my-mcp-server.example.com/mcp',
      transport: 'streamable-http',
    },
  ],
  plugins: [
    authPlugin({
      mode: 'apikey',
      keys: [MY_API_KEY],
    }),
    rateLimitPlugin({
      limit: 100,
      windowMs: 60_000,
      keyBy: 'ip',
    }),
    loggerPlugin({
      format: 'json',
    }),
  ],
})

export default { fetch: proxy.getApp().fetch }
