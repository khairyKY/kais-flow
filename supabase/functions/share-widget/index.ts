// Her-day widget (Rainmeter skin; v1.6.6 partner sharing P2, migration 0104 `share_widget_links`): one connected person's day,
// at the level you both allow. Authenticated like `widget` (0090): a token in the URL, made in Settings and shown once, only its
// SHA-256 stored, verify_jwt = false (config.toml) - the token IS the auth. But it is its own kind of key (`kf_p_`, its own
// table): the Widget link cannot open this and this cannot open the Widget link, and it never reads the holder's own day.
//
//   GET /functions/v1/share-widget?t=<token>   JSON, Cache-Control no-store (the skin asks every 5 minutes)
//
// 401 {"error":"unauthorized"}        no such key
// 410 {"error":"gone","reason":...}   revoked (Stop, or a disconnect) or the connection is gone: the skin clears and says so
// 429 {"error":"rate_limited"}        past 60 calls an hour
// 200 {"status":"paused",...}         she paused sharing: her name and when it ends, no blocks
// 200 {"status":"ok",...}             ./feed.ts
//
// One call = one database function, share_widget_read() (migration 0104): it counts the call, checks the key, reads the
// connection live (lower of both levels, the pause) and returns only share_day_data's masked answer for the person the key names.
// This file never selects a table. No service role anywhere: the same database connection `share-view` and `calendar-feed` use.
import { ruleBetween, sql } from '../mcp/store.ts'
import { herFeed, swatchName, type ReadOk } from './feed.ts'

const TOKEN = /^kf_p_[A-Za-z0-9_-]{43}$/

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ error: 'method' }, 405)
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!TOKEN.test(token)) return json({ error: 'unauthorized' }, 401)
  const now = new Date()
  try {
    const [row] = await sql`select share_widget_read(${await sha256Hex(token)}::text) as r`
    const r = row.r as { status: string; name?: string; paused_until?: string; color?: string }
    switch (r.status) {
      case 'unauthorized': return json({ error: 'unauthorized' }, 401)
      case 'revoked': return json({ error: 'gone', reason: 'revoked' }, 410)
      case 'gone': return json({ error: 'gone', reason: 'disconnected' }, 410)
      case 'rate_limited': return json({ error: 'rate_limited' }, 429)
      case 'paused': return json({ v: 1, status: 'paused', updated_at: now.toISOString(), name: r.name, color: swatchName(r.color), paused_until: r.paused_until ? Math.floor(Date.parse(r.paused_until) / 1000) : null })
      case 'ok': return json(herFeed(r as unknown as ReadOk, now, ruleBetween))
      default: return json({ error: 'server' }, 500)
    }
  } catch (e) {
    console.error('share-widget:', e)
    return json({ error: 'server' }, 500)
  }
})
