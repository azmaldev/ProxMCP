export type {
  TransportKind,
  UpstreamConfig,
  ProxMCPContext,
  ProxMCPPlugin,
  ProxMCPConfig,
  ProxMCPTool,
  ToolRegistry,
} from './types.js'

export {
  ProxMCPError,
  UpstreamError,
  AuthError,
  RateLimitError,
} from './errors.js'

export { ProxMCP } from './proxy.js'
export { defineConfig } from './config.js'
