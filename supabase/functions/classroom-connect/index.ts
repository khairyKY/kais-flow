// Connect Google Classroom (Kai 2026-11-03): its own OAuth consent, scopes classroom.courses.readonly +
// classroom.coursework.me.readonly + classroom.student-submissions.me.readonly (_shared/classroom.ts) —
// read-only, the student's own. A separate consent from Google Calendar's: this function never touches the
// Calendar row, and the Calendar grant is never widened to carry these. Same client id / secret, its own
// redirect URI. The refresh token is stored in integrations.data (provider 'classroom') with the service
// role and never leaves the server.
//
// Signed-in user (POST, bearer token):
//   { action: 'start', origin }          → { url }      Google's consent page; `origin` = where to land after
//                                        → { missing }  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET aren't set yet
//   { action: 'courses' }                → { courses, chosen }   re-read the account's active courses
//   { action: 'choose', ids }            → { chosen }   which courses sync (unticking keeps what came in)
//   { action: 'disconnect', remove }     → { ok, removed }  revoke, drop the row; `remove: true` also moves the
//                                                       imported tasks (and course projects) to Trash,
//                                                       false keeps them (reconnecting finds them again)
//
// Google (GET, no session — why this function runs with verify_jwt = false, config.toml):
//   ?code=…&state=…  /  ?error=…&state=…   the redirect back. `state` is HMAC-signed (google.ts signState).
//   Back to <origin>/settings?classroom=connected, or ?classroom=error&reason=<code>.
//
// The redirect URI registered on the Google OAuth client is exactly <SUPABASE_URL>/functions/v1/classroom-connect.
// Errors are stable codes: bad_request · not_connected · token_expired · blocked · google_unavailable ·
// server_error; the redirect's reason: denied · admin_blocked · bad_state · scope_missing ·
// no_refresh_token · not_configured · google_unavailable.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, isAllowedOrigin, jsonResponse } from '../_shared/cors.ts'
import { GOOGLE_AUTH, googleToken, GoogleError, readState, returnTo, signState } from '../_shared/google.ts'
import { classroomAuthUrl, classroomList, hasAllScopes, mergeCourses, readChosenCourses, readCourses, type ClassroomData, type GCourse } from '../_shared/classroom.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/classroom-connect`
const PUBLIC_APP = 'https://kais-flow.kaidagoat.workers.dev'
const STATE_TTL_MS = 10 * 60_000

type Row = { data: ClassroomData; updated_at: string }

async function readRow(db: SupabaseClient, userId: string): Promise<Row | null> {
  const { data, error } = await db.from('integrations').select('data, updated_at')
    .eq('user_id', userId).eq('provider', 'classroom').maybeSingle()
  if (error) throw new Error(`db ${error.code ?? 'error'}`)
  return data as Row | null
}

/** The account's ACTIVE courses where it is a student, read with a fresh access token. */
async function listCourses(accessToken: string) {
  const items = await classroomList<GCourse>('/courses?studentId=me&courseStates=ACTIVE', 'courses', accessToken)
  if (!items) throw new GoogleError(502)
  return readCourses(items)
}

const refresh = (token: string) => googleToken({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: token, grant_type: 'refresh_token' })

/** Read, merge, write only if the row hasn't changed since the read; one retry on a lost race (google-connect's). */
async function patchRow(db: SupabaseClient, userId: string, patch: (d: ClassroomData) => ClassroomData): Promise<ClassroomData | 'not_connected' | 'busy'> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await readRow(db, userId)
    if (!row) return 'not_connected'
    const data = patch(row.data)
    const { data: saved, error } = await db.from('integrations').update({ data })
      .eq('user_id', userId).eq('provider', 'classroom').eq('updated_at', row.updated_at).select('id')
    if (error) throw new Error(`db ${error.code ?? 'error'}`)
    if (saved?.length) return data
  }
  return 'busy'
}

/** Google's redirect back: exchange the code, store the refresh token, send the browser home. */
async function callback(req: Request, db: SupabaseClient): Promise<Response> {
  const url = new URL(req.url)
  const state = await readState(url.searchParams.get('state'), CLIENT_SECRET)
  const back = (code: string) => Response.redirect(`${state?.r ?? PUBLIC_APP}/settings?classroom=${code === 'connected' ? code : `error&reason=${code}`}`, 302)
  if (!state) return back('bad_state')
  // The school's Workspace admin can refuse the app for its students (API controls): Google says so here.
  const refused = url.searchParams.get('error')
  if (refused) return back(refused === 'admin_policy_enforced' ? 'admin_blocked' : 'denied')
  const code = url.searchParams.get('code') ?? ''
  if (!code) return back('bad_state')
  try {
    const tok = await googleToken({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' })
    // Granular consent: a person can untick a box on Google's page. All three are needed.
    if (!hasAllScopes(tok.scope)) return back('scope_missing')
    const prior = (await readRow(db, state.u))?.data ?? {}
    const refreshToken = tok.refresh_token ?? prior.refresh_token
    if (!refreshToken) return back('no_refresh_token')
    const courses = await listCourses(tok.access_token)
    // A first connect syncs every active course (untick any in Settings); a reconnect keeps the picks.
    const merged = mergeCourses(courses, prior.chosen ?? courses.map((c) => c.id))
    // No synced_at: the app runs the first sync as it lands back on Settings.
    const data: ClassroomData = { refresh_token: refreshToken, courses: merged.courses, chosen: merged.chosen, status: 'ok', synced_at: prior.synced_at ?? null, domain_id: prior.domain_id }
    const { error } = await db.from('integrations').upsert({ user_id: state.u, provider: 'classroom', data }, { onConflict: 'user_id,provider' })
    if (error) throw new Error(`db ${error.code ?? 'error'}`)
    return back('connected')
  } catch (e) {
    console.error('classroom-connect: callback failed', e instanceof Error ? e.message : 'error')
    return back('google_unavailable')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  if (req.method === 'GET') return CLIENT_ID && CLIENT_SECRET ? callback(req, db) : Response.redirect(`${PUBLIC_APP}/settings?classroom=error&reason=not_configured`, 302)

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const userId = auth.user.id
  const body = (await req.json().catch(() => null)) as { action?: unknown; origin?: unknown; ids?: unknown; remove?: unknown } | null

  if (!CLIENT_ID || !CLIENT_SECRET) {
    const missing = [!CLIENT_ID && 'GOOGLE_CLIENT_ID', !CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET'].filter(Boolean)
    // Disconnect still works without them (revoking needs no client).
    if (body?.action !== 'disconnect') return jsonResponse(req, { missing })
  }

  try {
    if (body?.action === 'start') {
      const r = returnTo(body.origin, isAllowedOrigin, PUBLIC_APP)
      const state = await signState({ u: userId, r, e: Date.now() + STATE_TTL_MS }, CLIENT_SECRET)
      return jsonResponse(req, { url: classroomAuthUrl(GOOGLE_AUTH, CLIENT_ID, REDIRECT_URI, state) })
    }

    if (body?.action === 'courses') {
      const row = await readRow(db, userId)
      if (!row?.data.refresh_token) return jsonResponse(req, { error: 'not_connected' }, 404)
      const courses = await listCourses((await refresh(row.data.refresh_token)).access_token)
      const saved = await patchRow(db, userId, (d) => ({ ...d, ...mergeCourses(courses, d.chosen ?? []) }))
      if (typeof saved === 'string') return jsonResponse(req, { error: saved }, saved === 'busy' ? 409 : 404)
      return jsonResponse(req, { courses: saved.courses, chosen: saved.chosen })
    }

    if (body?.action === 'choose') {
      const row = await readRow(db, userId)
      if (!row) return jsonResponse(req, { error: 'not_connected' }, 404)
      const chosen = readChosenCourses(body.ids, row.data.courses ?? [])
      if (!chosen) return jsonResponse(req, { error: 'bad_request' }, 400)
      const saved = await patchRow(db, userId, (d) => ({ ...d, chosen }))
      if (typeof saved === 'string') return jsonResponse(req, { error: saved }, saved === 'busy' ? 409 : 404)
      return jsonResponse(req, { chosen })
    }

    if (body?.action === 'disconnect') {
      if (typeof body.remove !== 'boolean') return jsonResponse(req, { error: 'bad_request' }, 400)
      const row = await readRow(db, userId)
      const token = row?.data.refresh_token
      if (token) {
        // Best effort: the grant goes at Google too, so nothing keeps a token Kai's Flow has forgotten.
        await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) })
          .then((r) => r.body?.cancel()).catch(() => undefined)
      }
      let removed = 0
      if (body.remove) {
        // To Trash (30 days, restorable), not gone for good: the tasks that came in, done or not, and the course projects.
        const at = new Date().toISOString()
        const tasks = await db.from('tasks').update({ deleted_at: at }).eq('user_id', userId).eq('external_ref->>source', 'classroom').is('deleted_at', null).select('id')
        if (tasks.error) throw new Error(`db ${tasks.error.code ?? 'error'}`)
        removed = tasks.data?.length ?? 0
        const projects = await db.from('projects').update({ deleted_at: at }).eq('user_id', userId).eq('external_ref->>source', 'classroom').is('deleted_at', null)
        if (projects.error) throw new Error(`db ${projects.error.code ?? 'error'}`)
      }
      const del = await db.from('integrations').delete().eq('user_id', userId).eq('provider', 'classroom')
      if (del.error) throw new Error(`db ${del.error.code ?? 'error'}`)
      return jsonResponse(req, { ok: true, removed })
    }

    return jsonResponse(req, { error: 'bad_request' }, 400)
  } catch (e) {
    if (e instanceof GoogleError) {
      if (e.status === 401) {
        await patchRow(db, userId, (d) => ({ ...d, status: 'failing' })).catch(() => undefined)
        return jsonResponse(req, { error: 'token_expired' }, 409)
      }
      console.error('classroom-connect:', e.message)
      return jsonResponse(req, { error: e.status === 403 ? 'blocked' : 'google_unavailable' }, e.status === 403 ? 403 : 502)
    }
    console.error('classroom-connect:', e instanceof Error ? e.message : 'error')
    return jsonResponse(req, { error: 'server_error' }, 500)
  }
})
