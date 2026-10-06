// The MCP endpoint's protocol half: Streamable HTTP, JSON-RPC over POST, stateless. Pure (web
// Request/Response only), so the app's vitest drives it end to end against a fake Store
// (app/src/features/settings/mcp.test.ts); index.ts only wires in the database.
//
// Dual-era, per the 2026-07-28 spec's versioning page:
//   - legacy clients (2025-03-26 … 2025-11-25) open with `initialize`, then send the
//     MCP-Protocol-Version header. Served without a session: no Mcp-Session-Id is minted, GET/DELETE
//     answer 405 (allowed by those revisions).
//   - modern clients (2026-07-28) carry protocolVersion + clientCapabilities in every request's
//     `_meta` and mirror method/name/version into Mcp-Method / Mcp-Name / MCP-Protocol-Version
//     headers, which must match the body (400 HeaderMismatch). Results carry resultType + serverInfo.
// Tools only — no resources/prompts/subscriptions, no SSE: every reply is one application/json body.
// No JSON-RPC batches (removed in 2025-06-18).
//
// Auth is the user's AI access key (`Authorization: Bearer kf_ai_…`, migration 0050), checked on
// every request; see docs/MCP.md for why a key and not OAuth.
import { TOOLS, runTool, userZone, type Store, type ToolDef } from './tools.ts'

export const MODERN_VERSIONS = ['2026-07-28'] as const
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const
export const SUPPORTED_VERSIONS: readonly string[] = [...MODERN_VERSIONS, ...LEGACY_VERSIONS]

export const SERVER_INFO = { name: 'kais-flow', title: "Kai's Flow", version: '1.0.0' }

export const INSTRUCTIONS =
  "Kai's Flow is the user's personal planner: tasks, a daily Top 3, an Inbox, projects and a calendar. " +
  "Dates and times are on the user's own clock — the `timezone` every result names. " +
  'Read freely. Write only when the user asks: add_task, complete_task, move_to_tomorrow and add_to_inbox change their real lists. ' +
  'When it is unclear whether something is a task, use add_to_inbox. Journal entries and people are not available here.'

/** `kf_ai_` + 32 random bytes as base64url (43 characters) — features/settings/mcpKey.ts makes them. */
export const KEY_PATTERN = /^kf_ai_[A-Za-z0-9_-]{43}$/

export type KeyScope = 'read' | 'read_write'

export interface Session {
  scope: KeyScope
  store: Store
}

export type SessionResult<T> = { ok: true; value: T } | { ok: false; reason: 'invalid' | 'limit' }

export interface Deps {
  /** Looks the key up and runs `fn` as its owner — one transaction, RLS as that user. `count`: this
   * request counts against the key's daily limit (tool calls only). */
  withSession<T>(key: string, count: boolean, fn: (s: Session) => Promise<T>): Promise<SessionResult<T>>
  originAllowed(origin: string): boolean
  nextOccurrence(rule: string, from: Date): Date | null
  now(): Date
  dailyLimit: number
}

type Json = Record<string, unknown>
type Id = string | number | null
interface RpcError {
  code: number
  message: string
  data?: unknown
}
type Outcome = { result: Json } | { error: RpcError }

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
const rpcError = (id: Id, error: RpcError) => ({ jsonrpc: '2.0', id, error })

function unauthorized(error: 'mcp_key_required' | 'mcp_key_invalid'): Response {
  return json(
    401,
    { error, hint: "Make a key in Kai's Flow → Settings → Integrations → AI assistants, and send it as `Authorization: Bearer kf_ai_…`." },
    { 'WWW-Authenticate': `Bearer realm="kais-flow", error="invalid_token"` },
  )
}

/** Mcp-Name / Mcp-Param values may come as `=?base64?…?=` (UTF-8). */
export function decodeHeaderValue(v: string | null): string | null {
  const m = v === null ? null : /^=\?base64\?(.*)\?=$/.exec(v)
  if (!m) return v
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/** The tools a key may see: a read-only key gets no writers. */
export function toolsFor(scope: KeyScope): readonly ToolDef[] {
  return scope === 'read_write' ? TOOLS : TOOLS.filter((t) => !t.write)
}

export function toolListing(t: ToolDef): Json {
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: t.write
      ? { title: t.title, readOnlyHint: false, destructiveHint: false, openWorldHint: false }
      : { title: t.title, readOnlyHint: true, openWorldHint: false },
  }
}

async function dispatch(method: string, params: Json, s: Session, deps: Deps): Promise<Outcome> {
  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion
      const protocolVersion = (LEGACY_VERSIONS as readonly unknown[]).includes(asked) ? asked : LEGACY_VERSIONS[0]
      return { result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS } }
    }
    case 'server/discover':
      return { result: { supportedVersions: SUPPORTED_VERSIONS, capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS } }
    case 'ping':
      return { result: {} }
    case 'tools/list':
      return { result: { tools: toolsFor(s.scope).map(toolListing) } }
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name)
      if (!tool) return { error: { code: -32602, message: `Unknown tool: ${String(params.name)}` } }
      if (tool.write && s.scope !== 'read_write') {
        return { result: { content: [{ type: 'text', text: "This key is read-only, so it can't change anything. The user can make a read & write key in Kai's Flow → Settings → Integrations → AI assistants." }], isError: true } }
      }
      const zone = userZone(await s.store.timezone())
      const result = await runTool(tool, params.arguments, { store: s.store, zone, now: deps.now(), nextOccurrence: deps.nextOccurrence })
      return { result: { ...result } }
    }
    default:
      return { error: { code: -32601, message: `Method not found: ${method}` } }
  }
}

/** One POST to the MCP endpoint → its response. */
export async function handleMcp(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get('Origin')
  if (origin && !deps.originAllowed(origin)) return json(403, rpcError(null, { code: -32600, message: 'Origin not allowed' }))
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })

  const auth = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('Authorization') ?? '')
  if (!auth) return unauthorized('mcp_key_required')
  const key = auth[1]
  if (!KEY_PATTERN.test(key)) return unauthorized('mcp_key_invalid')

  let msg: unknown
  try {
    msg = JSON.parse(await req.text())
  } catch {
    return json(400, rpcError(null, { code: -32700, message: 'Parse error' }))
  }
  if (Array.isArray(msg)) return json(400, rpcError(null, { code: -32600, message: 'Batches are not supported: send one JSON-RPC message per POST.' }))
  const rawId = isObj(msg) ? msg.id : undefined
  const id: Id = typeof rawId === 'string' || typeof rawId === 'number' ? rawId : null
  if (!isObj(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return json(400, rpcError(id, { code: -32600, message: 'Invalid Request' }))
  const method = msg.method
  // A notification (notifications/initialized, notifications/cancelled, …): nothing to answer.
  if (msg.id === undefined) return new Response(null, { status: 202 })
  if (id === null) return json(400, rpcError(null, { code: -32600, message: 'Invalid Request: id must be a string or number' }))

  const params = isObj(msg.params) ? msg.params : {}
  const meta = isObj(params._meta) ? params._meta : {}
  const metaVersion = meta['io.modelcontextprotocol/protocolVersion']
  const headerVersion = req.headers.get('MCP-Protocol-Version')
  const modern = method !== 'initialize' && (metaVersion !== undefined || (MODERN_VERSIONS as readonly unknown[]).includes(headerVersion))

  if (modern) {
    if (metaVersion === undefined) return json(400, rpcError(id, { code: -32602, message: 'Missing _meta "io.modelcontextprotocol/protocolVersion"' }))
    if (!(MODERN_VERSIONS as readonly unknown[]).includes(metaVersion)) {
      return json(400, rpcError(id, { code: -32022, message: 'Unsupported protocol version', data: { supported: SUPPORTED_VERSIONS, requested: metaVersion } }))
    }
    const mismatch = (what: string) => json(400, rpcError(id, { code: -32020, message: `Header mismatch: ${what}` }))
    if (headerVersion !== metaVersion) return mismatch('MCP-Protocol-Version must match _meta protocolVersion')
    if (req.headers.get('Mcp-Method') !== method) return mismatch('Mcp-Method must match the method')
    if (method === 'tools/call' && decodeHeaderValue(req.headers.get('Mcp-Name')) !== params.name) return mismatch('Mcp-Name must match params.name')
    if (!isObj(meta['io.modelcontextprotocol/clientCapabilities'])) {
      return json(400, rpcError(id, { code: -32602, message: 'Missing _meta "io.modelcontextprotocol/clientCapabilities"' }))
    }
  } else if (method !== 'initialize' && headerVersion !== null && !(LEGACY_VERSIONS as readonly string[]).includes(headerVersion)) {
    return json(400, rpcError(id, { code: -32600, message: `Unsupported MCP-Protocol-Version: ${headerVersion}. Supported: ${SUPPORTED_VERSIONS.join(', ')}` }))
  }

  let outcome: SessionResult<Outcome>
  try {
    outcome = await deps.withSession(key, method === 'tools/call', (s) => dispatch(method, params, s, deps))
  } catch (e) {
    console.error('mcp:', e)
    return json(500, rpcError(id, { code: -32603, message: 'Internal error' }))
  }
  if (!outcome.ok && outcome.reason === 'invalid') return unauthorized('mcp_key_invalid')
  const done: Outcome = outcome.ok
    ? outcome.value
    : { result: { content: [{ type: 'text', text: `This key has used its ${deps.dailyLimit} tool calls for today; it resets at 00:00 UTC.` }], isError: true } }

  if ('error' in done) {
    // Modern: an unknown method is a 404 with the JSON-RPC body (so it isn't mistaken for a missing endpoint).
    return json(modern && done.error.code === -32601 ? 404 : 200, rpcError(id, done.error))
  }
  const result = modern ? { resultType: 'complete', ...done.result, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO } } : done.result
  return json(200, { jsonrpc: '2.0', id, result })
}
