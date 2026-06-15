/** Supported transport protocols for upstream MCP servers. */
export type TransportKind = 'streamable-http' | 'sse' | 'stdio'

/** Configuration for a single upstream MCP server. */
export interface UpstreamConfig {
  /** Unique identifier used in logs and routing. */
  id: string
  /** HTTP/HTTPS URL for streamable-http or SSE upstreams. */
  url: string
  /** Transport protocol. Defaults to 'streamable-http'. */
  transport: TransportKind
  /** For stdio transports: the command and arguments to spawn (e.g. ['node', 'server.js']). */
  command?: string[]
  /** Extra headers to forward to the upstream server. */
  headers?: Record<string, string>
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number
  /** Number of retry attempts on failure. Defaults to 2. */
  retries?: number
}

/** Per-request context passed through the plugin pipeline. */
export interface ProxMCPContext {
  /** Unique request identifier (UUID). */
  requestId: string
  /** Originating client IP address, if available. */
  clientIp: string | null
  /** API key extracted from the request, if any. Populated by the auth plugin. */
  apiKey: string | null
  /** Upstream identifier after routing is resolved. */
  upstreamId: string | null
  /** Timestamp when the request was received (Date.now()). */
  startTime: number
  /** Arbitrary metadata store for plugins to pass data between hooks. */
  metadata: Record<string, unknown>
}

/** A plugin that hooks into the ProxMCP request lifecycle. */
export interface ProxMCPPlugin {
  /** Human-readable plugin name for logging and debugging. */
  name: string
  /** Called once when ProxMCP starts. Use for setup (e.g. loading API keys). */
  onInit?: (config: ProxMCPConfig) => Promise<void> | void
  /**
   * Called for every incoming request BEFORE routing.
   * Return a Response to short-circuit the pipeline (e.g. 401 Unauthorized).
   * Return void to allow the request to proceed.
   */
  onRequest?: (
    ctx: ProxMCPContext,
    request: Request
  ) => Promise<Response | void> | Response | void
  /**
   * Called after the upstream responds (or after an error).
   * Cannot short-circuit — runs as a side-effect.
   */
  onResponse?: (
    ctx: ProxMCPContext,
    response: Response,
    durationMs: number
  ) => Promise<void> | void
  /** Called on unhandled errors during request processing. */
  onError?: (
    ctx: ProxMCPContext,
    error: unknown
  ) => Promise<void> | void
  /** Optional tool filter hook. Called during tools/list to filter, rename, or sanitize tools. */
  filterTools?: (tools: ProxMCPTool[]) => ProxMCPTool[]
}

/** Root configuration for a ProxMCP instance. */
export interface ProxMCPConfig {
  /** Port to listen on. Defaults to 3000. */
  port?: number
  /** Host address to bind to. Defaults to '0.0.0.0'. */
  host?: string
  /** Base URL path for MCP endpoints. Defaults to '/mcp'. */
  basePath?: string
  /** One or more upstream MCP servers to proxy to. */
  upstreams: UpstreamConfig[]
  /** Plugin pipeline executed on every request. */
  plugins?: ProxMCPPlugin[]
  /** Cross-Origin Resource Sharing settings. */
  cors?: {
    /** Allowed origins or wildcard ('*'). */
    origins: string[] | '*'
    /** Whether to include credentials (cookies, auth headers). */
    credentials?: boolean
  }
  /** Expose a /health endpoint when true. Defaults to true. */
  healthCheck?: boolean
  /** Logging verbosity. Defaults to 'info'. */
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug'
}

/** A tool exposed by an upstream MCP server. */
export interface ProxMCPTool {
  /** Tool name (e.g. 'filesystem_read'). */
  name: string
  /** Human-readable description of what the tool does. */
  description?: string
  /** JSON Schema describing the tool's input parameters. */
  inputSchema: Record<string, unknown>
  /** Identifier of the upstream server that owns this tool. */
  upstreamId: string
}

/** Registry that aggregates tools from all upstreams. */
export interface ToolRegistry {
  /** All registered tools across every upstream. */
  tools: ProxMCPTool[]
  /** Resolve a tool name to its definition. Returns undefined if not found. */
  resolve(toolName: string): ProxMCPTool | undefined
}
