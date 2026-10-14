// AI assistants over MCP (supabase/functions/mcp, migration 0051, docs/MCP.md): the personal AI
// access key and copy-ready client configs. Same rules as the capture key (./captureKey): made here,
// shown once, only its SHA-256 saved — with an awaited write, not the outbox, so a key is never shown
// before it's stored.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { newCaptureKey, sha256Hex } from './captureKey'

export type McpScope = 'read' | 'read_write'
/** The personal areas a key reaches only when switched on for it (mcp_keys.scopes, 0080). */
export type McpPersonal = 'journal' | 'people'

export interface McpKeyRow {
  id: string
  scope: McpScope
  /** Switched on for this key: none by default, and a new key starts with none. */
  scopes: McpPersonal[]
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export const MCP_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/mcp`
const NAME = 'kais-flow'
const PLACEHOLDER = '<your key>'

export function useMcpKey() {
  return useQuery({
    queryKey: ['mcp_keys'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mcp_keys').select('id, scope, scopes, created_at, updated_at, last_used_at').maybeSingle()
      if (error) throw error
      return data as McpKeyRow | null
    },
  })
}

/** `kf_ai_` + 43 base64url characters — the function's KEY_PATTERN. */
export const newMcpKey = (): string => newCaptureKey('kf_ai_')

/** Makes (or replaces) this user's key; resolves to the key, which is never readable again. A new key
 * reaches neither the journal nor people until they're switched on for it. */
export async function createMcpKey(scope: McpScope): Promise<string> {
  const key = newMcpKey()
  const { error } = await supabase.from('mcp_keys').upsert({ key_hash: await sha256Hex(key), scope, scopes: [] }, { onConflict: 'user_id' })
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: ['mcp_keys'] })
  return key
}

/** `scopes` with `area` switched on or off, in a fixed order. */
export const withPersonal = (scopes: readonly McpPersonal[], area: McpPersonal, on: boolean): McpPersonal[] =>
  (['journal', 'people'] as const).filter((s) => (s === area ? on : scopes.includes(s)))

/** Switches the journal or people on or off for the key — awaited like the key itself, so the card
 * never shows a switch the server doesn't hold. The next call from the assistant sees it. */
export async function setMcpPersonal(row: McpKeyRow, area: McpPersonal, on: boolean): Promise<void> {
  const { error } = await supabase.from('mcp_keys').update({ scopes: withPersonal(row.scopes ?? [], area, on) }).eq('id', row.id)
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: ['mcp_keys'] })
}

export async function deleteMcpKey(id: string): Promise<void> {
  const { error } = await supabase.from('mcp_keys').delete().eq('id', id)
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: ['mcp_keys'] })
}

/** Claude Code: one command (remote HTTP server, key in a header). */
export function claudeCodeCommand(key = PLACEHOLDER): string {
  return `claude mcp add --transport http ${NAME} ${MCP_URL} --header "Authorization: Bearer ${key}"`
}

/** Claude Desktop's claude_desktop_config.json. Desktop's own custom connectors only do OAuth, so a
 * key goes through the mcp-remote bridge. The space of "Bearer …" lives in env, not args: Desktop on
 * Windows doesn't quote args with spaces (mcp-remote's README). */
export function claudeDesktopConfig(key = PLACEHOLDER): string {
  const server = { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL, '--header', 'Authorization:${KF_AUTH}'], env: { KF_AUTH: `Bearer ${key}` } }
  return JSON.stringify({ mcpServers: { [NAME]: server } }, null, 2)
}

/** Any other client that speaks remote MCP (.mcp.json / Cursor style): the address and the header. */
export function genericConfig(key = PLACEHOLDER): string {
  return JSON.stringify({ mcpServers: { [NAME]: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)
}
