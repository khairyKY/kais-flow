// AI assistants over MCP (docs/MCP.md): Claude Desktop, Claude Code or any MCP client reads and adds
// to one user's Kai's Flow over Streamable HTTP. The protocol and the tools are ./server.ts and
// ./tools.ts — pure, tested from the app's vitest (app/src/features/settings/mcp.test.ts). This file
// is the database half: the key, its daily count and the user switch (the Store is ./store.ts).
//
// Auth: `Authorization: Bearer kf_ai_…`, the user's AI access key (mcp_keys, migration 0051; only its
// SHA-256 is stored). Deployed with verify_jwt = false (config.toml): the key is not a JWT, the key IS
// the auth.
//
// Every query for user data runs AS THAT USER. Each request is one transaction on the database
// connection (SUPABASE_DB_URL): it looks the key up — and counts a tool call — as the table owner,
// then sets role `authenticated` and request.jwt.claims {sub: <user>} for the rest of the
// transaction, which is what PostgREST does for a signed-in request. RLS and auth.uid() then scope
// every row; nothing runs as the service role. (A user JWT can't be minted here: functions get no
// signing secret, and the key holder has no Supabase session.)
//
//   curl -X POST <project>/functions/v1/mcp -H "Authorization: Bearer kf_ai_…" \
//        -H "Content-Type: application/json" -H "MCP-Protocol-Version: 2025-11-25" \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"today","arguments":{}}}'
import { isAllowedOrigin } from '../_shared/cors.ts'
import { handleMcp, type KeyScope, type Session, type SessionResult } from './server.ts'
import { asUser, nextOccurrence, ruleBetween, sql, store } from './store.ts'
import type { Scope } from './tools.ts'

// Tool calls per key per UTC day. A runaway agent loop stops here; reads of the tool list don't count.
const DAILY_LIMIT = 500

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function withSession<T>(key: string, count: boolean, fn: (s: Session) => Promise<T>): Promise<SessionResult<T>> {
  const hash = await sha256Hex(key)
  return (await sql.begin(async (tx) => {
    // As the table owner, before the switch: the key (and, for a tool call, its count for today).
    const [k] = count
      ? await tx`
          update mcp_keys set calls = case when calls_day = current_date then calls + 1 else 1 end,
            calls_day = current_date, last_used_at = now()
          where key_hash = ${hash}::text
          returning user_id, scope, calls, coalesce(to_jsonb(mcp_keys)->'scopes', '[]'::jsonb) as scopes`
      : await tx`select user_id, scope, 0 as calls, coalesce(to_jsonb(k)->'scopes', '[]'::jsonb) as scopes from mcp_keys k where key_hash = ${hash}::text`
    if (!k) return { ok: false, reason: 'invalid' }
    if ((k.calls as number) > DAILY_LIMIT) return { ok: false, reason: 'limit' } // the count still commits

    // Belt and braces inside: never run a tool unless the switch took — as the owner, RLS wouldn't apply.
    await asUser(tx, k.user_id as string)
    // scopes (0080) read through to_jsonb, so a database without the column yet reads as none.
    const scopes = (Array.isArray(k.scopes) ? k.scopes : []) as Scope[]
    return { ok: true, value: await fn({ scope: k.scope as KeyScope, scopes, store: store(tx, new Set(scopes)) }) }
  })) as SessionResult<T>
}

Deno.serve((req) =>
  handleMcp(req, { withSession, originAllowed: isAllowedOrigin, nextOccurrence, ruleBetween, now: () => new Date(), dailyLimit: DAILY_LIMIT }),
)
