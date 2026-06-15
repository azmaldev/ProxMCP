import type { ProxMCPPlugin, ProxMCPTool } from '@proxmcp/core'
import { sanitizeDescription } from './sanitize.js'

export interface ToolFilterOptions {
  /** Allowlist: only these tools are visible. Mutually exclusive with denylist. */
  allow?: string[]
  /** Denylist: these tools are hidden. Mutually exclusive with allowlist. */
  deny?: string[]
  /** Rename tools: { 'original_name': 'new_name' }. */
  rename?: Record<string, string>
  /** Override tool descriptions for the given tool names (original names). */
  descriptions?: Record<string, string>
  /** Strip common prompt injection patterns from descriptions. */
  sanitizeDescriptions?: boolean
}

export function toolFilterPlugin(options: ToolFilterOptions): ProxMCPPlugin {
  if (options.allow && options.deny) {
    throw new Error(
      'tool-filter: allow and deny are mutually exclusive'
    )
  }

  const allowSet = options.allow ? new Set(options.allow) : null
  const denySet = options.deny ? new Set(options.deny) : null

  return {
    name: 'proxmcp:tool-filter',

    filterTools(tools: ProxMCPTool[]): ProxMCPTool[] {
      let filtered = tools

      if (allowSet) {
        filtered = filtered.filter((t) => allowSet!.has(t.name))
      }

      if (denySet) {
        filtered = filtered.filter((t) => !denySet!.has(t.name))
      }

      filtered = filtered.map((tool) => {
        const t = { ...tool }

        if (options.descriptions?.[tool.name]) {
          t.description = options.descriptions[tool.name]
        }

        if (options.rename?.[tool.name]) {
          t.name = options.rename[tool.name]
        }

        if (options.sanitizeDescriptions && t.description) {
          t.description = sanitizeDescription(t.description)
        }

        return t
      })

      return filtered
    },
  }
}
