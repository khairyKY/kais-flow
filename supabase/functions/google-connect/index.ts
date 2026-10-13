// Connect Google Calendar (parity audit B1, Kai 2026-10-13): the OAuth 2.0 web-server flow, scopes
// calendar.readonly + calendar.events.owned (Kai 2026-10-14: our plan out to Google as busy — least
// privilege, only calendars the user owns). Google's consent page is the only Google screen anyone
// sees; the calendar is ours.
//
// Signed-in user (POST, bearer token):
//   { action: 'start', origin }        → { url }       Google's consent page; `origin` = where to land after
//                                      → { missing }   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET aren't set yet
//                                                       (docs/GOOGLE-SETUP.md) — said plainly, never an error
//   { action: 'calendars' }            → { calendars, chosen }   re-read the account's calendar list
//   { action: 'choose', ids }          → { chosen }    which calendars show; an unticked one's events go
//   { action: 'mirror', on }           → { mirror }    "Show my plan in Google as busy"; off deletes ours there
//   { action: 'disconnect' }           → { ok }        delete ours in Google, revoke, drop every synced event and the row
//
// Google (GET, no session — the reason this function runs with verify_jwt = false, config.toml):
//   ?code=…&state=…  /  ?error=…&state=…   the redirect back. `state` is HMAC-signed with the client
//   secret (_shared/google.ts signState) and names the user, the return origin and a 10-minute expiry,
//   so a forged or replayed-late callback is refused. The code is exchanged for a refresh token, which
//   is stored in integrations.data with the service role and never leaves the server; then the
//   browser goes back to <origin>/settings?google=connected (or ?google=error&reason=<code>). <origin> is
//   the app that started it when the functions trust it (cors.ts: the web app, localhost dev), else the
//   public web app — a native shell's own origin can't be opened from a browser.
//
// The redirect URI registered on the Google OAuth client is exactly <SUPABASE_URL>/functions/v1/google-connect.
// Errors are stable codes: bad_request · not_connected · token_expired · google_unavailable · server_error;
// the redirect's reason: denied · bad_state · scope_missing · no_refresh_token · not_configured · google_unavailable.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, isAllowedOrigin, jsonResponse } from '../_shared/cors.ts'
import { authUrl, gGet, googleToken, GoogleError, GOOGLE_SCOPE, GOOGLE_WRITE_SCOPE, hasScope, listMirrored, planMirror, readCalendars, readChosen, readState, returnTo, signState, writeMirror, type GCalendarListEntry, type GoogleData } from '../_shared/google.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-connect`
const PUBLIC_APP = 'https://kais-flow.kaidagoat.workers.dev'
const STATE_TTL_MS = 10 * 60_000

type Row = { data: GoogleData; updated_at: string }

async function readRow(db: SupabaseClient, userId: string): Promise<Row | null> {
  const { data, error } = await db.from('integrations').select('data, updated_at')
    .eq('user_id', userId).eq('provider', 'google').maybeSingle()
  if (error) throw new Error(`db ${error.code ?? 'error'}`)
  return data as Row | null
}

/** The account's calendars, read with a fresh access token. */
async function listCalendars(accessToken: string) {
  const res = await gGet<{ items?: GCalendarListEntry[] }>('/users/me/calendarList?maxResults=250&fields=items(id,summary,summaryOverride,backgroundColor,primary,selected,deleted)', accessToken)
  return readCalendars(res.items ?? [])
}

const refresh = (token: string) => googleToken({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: token, grant_type: 'refresh_token' })

/** Deletes every event we wrote to the primary calendar (a plan that wants none) — and only those. */
async function clearMirror(refreshToken: string) {
  const { access_token } = await refresh(refreshToken)
  return writeMirror(planMirror(new Map(), await listMirrored(access_token)), access_token)
}

/** Read, merge, write only if the row hasn't changed since the read (a sync stamping synced_at
 * mid-save would otherwise be clobbered); one retry on a lost race. */
async function patchRow(db: SupabaseClient, userId: string, patch: (d: GoogleData) => GoogleData): Promise<GoogleData | 'not_connected' | 'busy'> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await readRow(db, userId)
    if (!row) return 'not_connected'
    const data = patch(row.data)
    const { data: saved, error } = await db.from('integrations').update({ data })
      .eq('user_id', userId).eq('provider', 'google').eq('updated_at', row.updated_at).select('id')
    if (error) throw new Error(`db ${error.code ?? 'error'}`)
    if (saved?.length) return data
  }
  return 'busy'
}

/** Google's redirect back: exchange the code, store the refresh token, send the browser home. */
async function callback(req: Request, db: SupabaseClient): Promise<Response> {
  const url = new URL(req.url)
  const state = await readState(url.searchParams.get('state'), CLIENT_SECRET)
  // ?google=connected, or ?google=error&reason=<code> (conductor 2026-10-13).
  const back = (code: string) => Response.redirect(`${state?.r ?? PUBLIC_APP}/settings?google=${code === 'connected' ? code : `error&reason=${code}`}`, 302)
  if (!state) return back('bad_state')
  if (url.searchParams.get('error')) return back('denied')
  const code = url.searchParams.get('code') ?? ''
  if (!code) return back('bad_state')
  try {
    const tok = await googleToken({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' })
    // Google's consent page lets a person untick a box (granular consent): reading is required; writing
    // isn't — without it the row offers Reconnect for it, and reading carries on.
    if (!hasScope(tok.scope, GOOGLE_SCOPE)) return back('scope_missing')
    const prior = (await readRow(db, state.u))?.data ?? {}
    // prompt=consent should always bring one; a reconnect without one keeps the stored token.
    const refreshToken = tok.refresh_token ?? prior.refresh_token
    if (!refreshToken) return back('no_refresh_token')
    const { calendars, login, selected } = await listCalendars(tok.access_token)
    // Keep what the person already chose (a reconnect); a first connect shows what Google Calendar shows.
    const ids = new Set(calendars.map((c) => c.id))
    const chosen = prior.chosen ? prior.chosen.filter((id) => ids.has(id)) : selected
    // No synced_at: the app runs the first sync as it lands back on Settings.
    const data: GoogleData = { refresh_token: refreshToken, login: login ?? undefined, calendars, chosen, status: 'ok', synced_at: prior.synced_at ?? null, can_write: hasScope(tok.scope, GOOGLE_WRITE_SCOPE), mirror: prior.mirror }
    const { error } = await db.from('integrations').upsert({ user_id: state.u, provider: 'google', data }, { onConflict: 'user_id,provider' })
    if (error) throw new Error(`db ${error.code ?? 'error'}`)
    return back('connected')
  } catch (e) {
    console.error('google-connect: callback failed', e instanceof Error ? e.message : 'error')
    return back('google_unavailable')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  if (req.method === 'GET') return CLIENT_ID && CLIENT_SECRET ? callback(req, db) : Response.redirect(`${PUBLIC_APP}/settings?google=error&reason=not_configured`, 302)

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const userId = auth.user.id
  const body = (await req.json().catch(() => null)) as { action?: unknown; origin?: unknown; ids?: unknown; on?: unknown } | null

  if (!CLIENT_ID || !CLIENT_SECRET) {
    const missing = [!CLIENT_ID && 'GOOGLE_CLIENT_ID', !CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET'].filter(Boolean)
    // Disconnect still works without them (revoking needs no client): the row and its events go.
    if (body?.action !== 'disconnect') return jsonResponse(req, { missing })
  }

  try {
    if (body?.action === 'start') {
      const r = returnTo(body.origin, isAllowedOrigin, PUBLIC_APP)
      const state = await signState({ u: userId, r, e: Date.now() + STATE_TTL_MS }, CLIENT_SECRET)
      return jsonResponse(req, { url: authUrl(CLIENT_ID, REDIRECT_URI, state) })
    }

    if (body?.action === 'calendars') {
      const row = await readRow(db, userId)
      if (!row?.data.refresh_token) return jsonResponse(req, { error: 'not_connected' }, 404)
      const { calendars, login } = await listCalendars((await refresh(row.data.refresh_token)).access_token)
      const ids = new Set(calendars.map((c) => c.id))
      const saved = await patchRow(db, userId, (d) => ({ ...d, calendars, login: login ?? d.login, chosen: (d.chosen ?? []).filter((id) => ids.has(id)) }))
      if (typeof saved === 'string') return jsonResponse(req, { error: saved }, saved === 'busy' ? 409 : 404)
      return jsonResponse(req, { calendars, chosen: saved.chosen })
    }

    if (body?.action === 'choose') {
      const row = await readRow(db, userId)
      if (!row) return jsonResponse(req, { error: 'not_connected' }, 404)
      const chosen = readChosen(body.ids, row.data.calendars ?? [])
      if (!chosen) return jsonResponse(req, { error: 'bad_request' }, 400)
      const dropped = (row.data.chosen ?? []).filter((id) => !chosen.includes(id))
      const saved = await patchRow(db, userId, (d) => ({ ...d, chosen }))
      if (typeof saved === 'string') return jsonResponse(req, { error: saved }, saved === 'busy' ? 409 : 404)
      // An unticked calendar's events leave the grid now, history included (they're mirrors).
      for (const id of dropped) {
        const { error } = await db.from('calendar_events').delete().eq('user_id', userId).eq('source', 'gcal').eq('external_ref->>calendar_id', id)
        if (error) throw new Error(`db ${error.code ?? 'error'}`)
      }
      return jsonResponse(req, { chosen })
    }

    if (body?.action === 'mirror') {
      if (typeof body.on !== 'boolean') return jsonResponse(req, { error: 'bad_request' }, 400)
      const on = body.on
      const saved = await patchRow(db, userId, (d) => ({ ...d, mirror: on }))
      if (typeof saved === 'string') return jsonResponse(req, { error: saved }, saved === 'busy' ? 409 : 404)
      // Off: ours leave Google now; whatever this misses, the next sync (which wants none) deletes.
      // On: the app runs a sync next, which writes them.
      if (!on && saved.can_write && saved.refresh_token) await clearMirror(saved.refresh_token)
      return jsonResponse(req, { mirror: on })
    }

    if (body?.action === 'disconnect') {
      const row = await readRow(db, userId)
      const token = row?.data.refresh_token
      // Best effort, before the revoke (after it, nothing could delete them): ours leave Google.
      if (token && row?.data.can_write && CLIENT_ID && CLIENT_SECRET) {
        await clearMirror(token).catch((e) => console.error('google-connect: clearing ours in Google failed', e instanceof Error ? e.message : 'error'))
      }
      if (token) {
        // Best effort: the grant goes at Google too, so nothing keeps a token Kai's Flow has forgotten.
        await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) })
          .then((r) => r.body?.cancel()).catch(() => undefined)
      }
      const ev = await db.from('calendar_events').delete().eq('user_id', userId).eq('source', 'gcal')
      if (ev.error) throw new Error(`db ${ev.error.code ?? 'error'}`)
      const del = await db.from('integrations').delete().eq('user_id', userId).eq('provider', 'google')
      if (del.error) throw new Error(`db ${del.error.code ?? 'error'}`)
      return jsonResponse(req, { ok: true })
    }

    return jsonResponse(req, { error: 'bad_request' }, 400)
  } catch (e) {
    if (e instanceof GoogleError) {
      if (e.status === 401) {
        await patchRow(db, userId, (d) => ({ ...d, status: 'failing' })).catch(() => undefined)
        return jsonResponse(req, { error: 'token_expired' }, 409)
      }
      console.error('google-connect:', e.message)
      return jsonResponse(req, { error: 'google_unavailable' }, 502)
    }
    console.error('google-connect:', e instanceof Error ? e.message : 'error')
    return jsonResponse(req, { error: 'server_error' }, 500)
  }
})
