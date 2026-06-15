#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, isAbsolute } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import type { ProxMCPConfig, ProxMCPPlugin } from '@proxmcp/core'
import { ProxMCP, defineConfig } from '@proxmcp/core'
import { authPlugin } from '@proxmcp/plugin-auth'
import { rateLimitPlugin } from '@proxmcp/plugin-rate-limit'
import { loggerPlugin } from '@proxmcp/plugin-logger'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as { version: string }
const version = packageJson.version

function printBanner(
  host: string,
  port: number,
  basePath: string,
  upstreams: { id: string; url: string }[],
  authEnabled: boolean,
  toolCount: number
) {
  const banner = [
    '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557',
    '\u2551  ProxMCP v' + version + ' '.repeat(18 - version.length) + '\u2551',
    '\u2551  MCP Proxy by proxmcp.dev    \u2551',
    '\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d',
    '',
    '\u2192 Listening on http://' + host + ':' + port + basePath,
  ]

  for (const u of upstreams) {
    banner.push('\u2192 Upstream: ' + u.id + ' (' + u.url + ')')
  }

  banner.push(authEnabled ? '\u2192 Auth: API key enabled' : '\u2192 Auth: disabled')
  banner.push('\u2192 Tools: ' + toolCount + ' available')

  console.log(banner.join('\n'))
}

function printHelp() {
  const help = [
    'ProxMCP v' + version + ' - MCP Proxy',
    '',
    'Usage:',
    '  proxmcp [options]',
    '',
    'Zero-config mode:',
    '  proxmcp --upstream <url> [options]',
    '',
    'Config file mode:',
    '  proxmcp [--config ./proxmcp.config.ts]',
    '',
    'Options:',
    '  --upstream <url>       Upstream MCP server URL (repeatable)',
    '  --port <number>        Port to listen on (default: 3000)',
    '  --host <string>        Host to bind to (default: 0.0.0.0)',
    '  --base-path <path>     MCP endpoint path (default: /mcp)',
    '  --api-key <key>        Enable API key auth with this key',
    '  --rate-limit <number>  Max requests per minute (default: none)',
    '  --config <path>        Path to proxmcp.config.ts',
    '  --log-level <level>    silent|error|warn|info|debug (default: info)',
    '  --log-format <format>  json|pretty (default: pretty)',
    '  --version              Print version and exit',
    '  --help                 Print help and exit',
    '',
    'Examples:',
    '  proxmcp --upstream http://localhost:3001/mcp',
    '  proxmcp --upstream http://localhost:3001/mcp --port 3000 --api-key mykey',
    '  proxmcp --config ./proxmcp.config.ts',
  ]
  console.log(help.join('\n'))
}

async function loadConfig(configPath: string): Promise<ProxMCPConfig> {
  register('tsx/esm', { parentURL: import.meta.url })
  const url = pathToFileURL(resolve(configPath)).href
  const mod = await import(url)
  return (mod.default ?? mod) as ProxMCPConfig
}

async function startAndListen(
  proxmcp: ProxMCP,
  config: ProxMCPConfig
): Promise<void> {
  try {
    await proxmcp.start()
  } catch (err) {
    console.error('Failed to start ProxMCP:', err)
    process.exit(1)
  }

  const proxmcpAny = proxmcp as unknown as { getToolCount: () => number }
  const toolCount = typeof proxmcpAny.getToolCount === 'function' ? proxmcpAny.getToolCount() : 0

  printBanner(
    config.host ?? '0.0.0.0',
    config.port ?? 3000,
    config.basePath ?? '/mcp',
    config.upstreams.map((u) => ({ id: u.id, url: u.url })),
    config.plugins?.some((p: ProxMCPPlugin) => p.name === 'proxmcp:auth') ?? false,
    toolCount
  )

  process.on('SIGTERM', async () => {
    await proxmcp.stop()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    await proxmcp.stop()
    process.exit(0)
  })
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      upstream: { type: 'string', multiple: true },
      port: { type: 'string' },
      host: { type: 'string' },
      'base-path': { type: 'string' },
      'api-key': { type: 'string' },
      'rate-limit': { type: 'string' },
      config: { type: 'string' },
      'log-level': { type: 'string' },
      'log-format': { type: 'string' },
      version: { type: 'boolean' },
      help: { type: 'boolean' },
    },
    strict: false,
    allowPositionals: true,
  })

  if (values.version) {
    console.log('v' + version)
    process.exit(0)
  }

  if (values.help) {
    printHelp()
    process.exit(0)
  }

  const upstreamUrls = (values.upstream as string[] | undefined) ?? []
  const configPath = values.config as string | undefined
  const port = values.port ? parseInt(values.port as string, 10) : undefined
  const host = (values.host as string) ?? undefined
  const basePath = (values['base-path'] as string) ?? undefined
  const apiKey = (values['api-key'] as string) ?? undefined
  const rateLimitVal = values['rate-limit']
    ? parseInt(values['rate-limit'] as string, 10)
    : undefined
  const logLevel = (values['log-level'] as string) ?? undefined
  const logFormat = (values['log-format'] as string) ?? 'pretty'

  function handleConfig(config: ProxMCPConfig): void {
    const proxmcp = new ProxMCP(config)
    startAndListen(proxmcp, config)
  }

  if (configPath) {
    const resolvedPath = isAbsolute(configPath)
      ? configPath
      : resolve(process.cwd(), configPath)
    if (!existsSync(resolvedPath)) {
      console.error('Config file not found: ' + resolvedPath)
      process.exit(1)
    }
    loadConfig(resolvedPath).then(handleConfig).catch((err: unknown) => {
      console.error('Failed to load config:', err)
      process.exit(1)
    })
    return
  }

  const configFile = resolve(process.cwd(), 'proxmcp.config.ts')
  if (existsSync(configFile)) {
    loadConfig(configFile).then(handleConfig).catch((err: unknown) => {
      console.error('Failed to load config:', err)
      process.exit(1)
    })
    return
  }

  if (!upstreamUrls || upstreamUrls.length === 0) {
    console.error(
      'Error: No upstream configured. Use --upstream <url> or --config <path>.'
    )
    console.error('')
    printHelp()
    process.exit(1)
  }

  const plugins: ProxMCPPlugin[] = []
  if (apiKey) {
    plugins.push(authPlugin({ mode: 'apikey', keys: apiKey }))
  }
  if (rateLimitVal) {
    plugins.push(rateLimitPlugin({ limit: rateLimitVal, windowMs: 60_000 }))
  }
  plugins.push(loggerPlugin({ format: logFormat as 'json' | 'pretty' }))

  const config = defineConfig({
    port: port ?? 3000,
    host: host ?? '0.0.0.0',
    basePath: basePath ?? '/mcp',
    logLevel: (logLevel ?? 'info') as 'silent' | 'error' | 'warn' | 'info' | 'debug',
    upstreams: upstreamUrls.map((url, i) => ({
      id: 'upstream-' + i,
      url,
      transport: 'streamable-http' as const,
    })),
    plugins,
  })

  handleConfig(config)
}

main()
