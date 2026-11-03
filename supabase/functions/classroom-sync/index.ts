// Google Classroom → projects and tasks, read-only (Kai 2026-11-03). Two callers, as google-sync:
//  - pg_cron every 3 hours (service-role key from Vault, migration 0091): every user whose Classroom
//    integration is connected and not failing.
//  - a signed-in user's "Sync now" (Settings › Integrations › Google Classroom): only that user.
// Anyone else gets 401.
//
//   { action: 'sync' } → { courses, fetched, new, updated, done, trashed }                  (user)
//                      → { users, failed, courses, fetched, new, updated, done, trashed }   (cron)
//
// Per user: the stored refresh token buys an access token; the account's course list is re-read (names
// refreshed, a new course listed but not chosen for the person); then each CHOSEN course, in turn:
//  - its project (external_ref {source:'classroom', id:<course id>}) inside the "Classroom" domain — Kai's
//    "area": projects hang off domains here, an area can't hold one — is found or made (a project the
//    person trashed is left alone, the course skipped);
//  - courseWork (published only — a student sees nothing else) and the student's own submissions are read
//    in full; planCourse (_shared/classroom.ts) turns that into inserts, updates, "handed in" ticks and
//    Trash moves. Dated work lands with its due date and time; undated work lands in Someday (not the
//    Inbox: the Inbox is for things that need sorting, and these already have a home).
//  - a course whose read failed is left exactly as it was: a partial read never trashes anything.
// A task ticked off here is the same write as ticking it in the app. Work deleted in Classroom moves its
// open task to Trash (a done one stays as history). Nothing in here touches an AI model — it is rules over
// Classroom's own fields — and the chat / MCP read paths skip these tasks (migration-free: external_ref).
//
// Errors are stable codes: not_connected · token_expired · blocked · google_unavailable · server_error. The
// refresh token is never logged or returned.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isServiceRole, requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { googleToken, GoogleError } from '../_shared/google.ts'
import { classroomList, mergeCourses, planCourse, readCourses, type ClassroomData, type CourseRef, type GCourse, type GSubmission, type GWork, type StoredTask } from '../_shared/classroom.ts'
import { userZone } from '../_shared/zone.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const CONCURRENCY = 4
const DOMAIN_NAME = 'Classroom'

interface IntegrationRow {
  user_id: string
  data: ClassroomData
  updated_at: string
}

interface Counts {
  courses: number
  fetched: number
  new: number
  updated: number
  done: number
  trashed: number
}

function must<T>(res: { data: T | null; error: { code?: string } | null }): T {
  if (res.error) throw new Error(`db ${res.error.code ?? 'error'}`)
  return res.data as T
}

/** The "Classroom" domain: the stored one if it still lives, else one by that name, else a new one. */
async function ensureDomain(db: SupabaseClient, userId: string, stored: string | undefined): Promise<string> {
  if (stored) {
    const row = must(await db.from('domains').select('id').eq('id', stored).eq('user_id', userId).is('deleted_at', null).maybeSingle()) as { id: string } | null
    if (row) return row.id
  }
  const named = must(await db.from('domains').select('id').eq('user_id', userId).ilike('name', DOMAIN_NAME).is('deleted_at', null).order('created_at').limit(1)) as { id: string }[]
  if (named[0]) return named[0].id
  const id = crypto.randomUUID()
  must(await db.from('domains').insert({ id, user_id: userId, name: DOMAIN_NAME }))
  return id
}

/** The course's project, or null when the person trashed it (that course is skipped). */
async function ensureProject(db: SupabaseClient, userId: string, course: CourseRef, domainId: string): Promise<string | null> {
  const find = async () => must(await db.from('projects').select('id, deleted_at').eq('user_id', userId).eq('external_ref->>source', 'classroom').eq('external_ref->>id', course.id).limit(1)) as { id: string; deleted_at: string | null }[]
  let found = (await find())[0]
  if (!found) {
    const id = crypto.randomUUID()
    const { error } = await db.from('projects').insert({ id, user_id: userId, domain_id: domainId, name: course.name, type: 'standard', status: 'active', external_ref: { source: 'classroom', id: course.id } })
    if (error && error.code !== '23505') throw new Error(`db ${error.code}`)
    if (!error) {
      must(await db.from('activity_log').insert({ user_id: userId, event_type: 'project.created', entity_type: 'project', entity_id: id, payload: { source: 'classroom' } }))
      return id
    }
    found = (await find())[0] // a concurrent run made it first
  }
  return found && !found.deleted_at ? found.id : null
}

async function storedTasks(db: SupabaseClient, userId: string, courseId: string): Promise<StoredTask[]> {
  const out: StoredTask[] = []
  for (let from = 0; ; from += 1000) {
    const page = must(await db.from('tasks').select('id, title, status, due_at, someday, deleted_at, external_ref')
      .eq('user_id', userId).eq('external_ref->>source', 'classroom').eq('external_ref->>course_id', courseId)
      .order('id').range(from, from + 999)) as StoredTask[]
    out.push(...page)
    if (page.length < 1000) return out
  }
}

/** Inserts the batch; returns how many landed. A concurrent sync (cron + "Sync now") that got there first
 * trips 0027's unique index — then row by row, skipping the duplicates. */
async function insertNew(db: SupabaseClient, rows: { id: string; title: string }[]): Promise<{ id: string; title: string }[]> {
  if (rows.length === 0) return []
  const { error } = await db.from('tasks').insert(rows)
  if (!error) return rows
  if (error.code !== '23505') throw new Error(`db ${error.code}`)
  const out: typeof rows = []
  for (const row of rows) {
    const { error: e } = await db.from('tasks').insert(row)
    if (!e) out.push(row)
    else if (e.code !== '23505') throw new Error(`db ${e.code}`)
  }
  return out
}

async function syncCourse(db: SupabaseClient, userId: string, course: CourseRef, domainId: string, token: string, zone: string, startedAt: string, counts: Counts) {
  const projectId = await ensureProject(db, userId, course, domainId)
  if (!projectId) return
  const work = await classroomList<GWork>(`/courses/${encodeURIComponent(course.id)}/courseWork?courseWorkStates=PUBLISHED`, 'courseWork', token)
  const subs = work && await classroomList<GSubmission>(`/courses/${encodeURIComponent(course.id)}/courseWork/-/studentSubmissions?userId=me`, 'studentSubmissions', token)
  if (!work || !subs) return // unreadable this run: left exactly as it was
  counts.fetched += work.length
  const submissions = new Map(subs.flatMap((s) => (s.courseWorkId && s.state ? [[s.courseWorkId, s.state] as const] : [])))
  const plan = planCourse({ courseId: course.id, projectId, domainId, work, submissions, stored: await storedTasks(db, userId, course.id), zone, now: new Date(startedAt), newId: () => crypto.randomUUID() })

  const landed = await insertNew(db, plan.insert as { id: string; title: string }[])
  counts.new += landed.length
  if (landed.length) {
    must(await db.from('activity_log').insert(landed.map((r) => ({ user_id: userId, event_type: 'task.created', entity_type: 'task', entity_id: r.id, payload: { source: 'classroom' } }))))
  }
  for (const u of plan.update) {
    must(await db.from('tasks').update(u.patch).eq('id', u.id).eq('user_id', userId).eq('status', 'todo').is('deleted_at', null))
    counts.updated++
  }
  for (const d of plan.done) {
    // The same write as ticking it in the app (and github-sync's).
    const rows = must(await db.from('tasks').update({ status: 'done', completed_at: startedAt, top3: false, external_ref: d.external_ref })
      .eq('id', d.id).eq('user_id', userId).eq('status', 'todo').is('deleted_at', null).select('id')) as { id: string }[]
    if (rows.length === 0) continue
    counts.done++
    must(await db.from('activity_log').insert({ user_id: userId, event_type: 'task.completed', entity_type: 'task', entity_id: d.id, payload: { source: 'classroom', reason: 'handed in on Classroom' } }))
  }
  for (let i = 0; i < plan.trash.length; i += 200) {
    const ids = plan.trash.slice(i, i + 200)
    const rows = must(await db.from('tasks').update({ deleted_at: startedAt }).in('id', ids).eq('user_id', userId).eq('status', 'todo').is('deleted_at', null).select('id')) as { id: string }[]
    counts.trashed += rows.length
    if (rows.length) {
      must(await db.from('activity_log').insert(rows.map((r) => ({ user_id: userId, event_type: 'task.deleted', entity_type: 'task', entity_id: r.id, payload: { source: 'classroom', reason: 'removed from Classroom' } }))))
    }
  }
}

async function syncUser(db: SupabaseClient, { user_id: userId, data, updated_at }: IntegrationRow): Promise<Counts> {
  const startedAt = new Date().toISOString()
  // Only if the row is unchanged since we read it — a reconnect or a "choose" mid-run wins.
  const saveData = (patch: Partial<ClassroomData>) =>
    db.from('integrations').update({ data: { ...data, ...patch } })
      .eq('user_id', userId).eq('provider', 'classroom').eq('updated_at', updated_at)

  try {
    const tok = await googleToken({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: data.refresh_token ?? '', grant_type: 'refresh_token' })
    const settings = must(await db.from('app_settings').select('timezone').eq('user_id', userId).maybeSingle()) as { timezone?: string | null } | null
    const zone = userZone(settings?.timezone)

    // The course list again: names stay right, a new class shows up (unchosen), a finished one drops off.
    const listed = await classroomList<GCourse>('/courses?studentId=me&courseStates=ACTIVE', 'courses', tok.access_token)
    const merged = listed ? mergeCourses(readCourses(listed), data.chosen ?? []) : { courses: data.courses ?? [], chosen: data.chosen ?? [] }
    const domainId = await ensureDomain(db, userId, data.domain_id)
    const counts: Counts = { courses: 0, fetched: 0, new: 0, updated: 0, done: 0, trashed: 0 }
    for (const course of merged.courses.filter((c) => merged.chosen.includes(c.id))) {
      await syncCourse(db, userId, course, domainId, tok.access_token, zone, startedAt, counts)
      counts.courses++
    }
    must(await saveData({ ...merged, domain_id: domainId, status: 'ok', synced_at: startedAt }))
    return counts
  } catch (e) {
    if (e instanceof GoogleError && e.status === 401) await saveData({ status: 'failing' })
    throw e
  }
}

const describe = (e: unknown) => (e instanceof Error ? e.message : 'error')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── pg_cron: every connected, non-failing user ──
  if (await isServiceRole(req)) {
    if (!CLIENT_ID || !CLIENT_SECRET) return jsonResponse(req, { users: 0, skipped: 'not_configured' })
    const { data: rows, error } = await db.from('integrations').select('user_id, data, updated_at')
      .eq('provider', 'classroom').eq('data->>status', 'ok')
    if (error) {
      console.error('classroom-sync: listing integrations failed', error.code)
      return jsonResponse(req, { error: 'server_error' }, 500)
    }
    const totals = { users: 0, failed: 0, courses: 0, fetched: 0, new: 0, updated: 0, done: 0, trashed: 0 }
    const queue = [...(rows as IntegrationRow[])]
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        totals.users++
        try {
          const c = await syncUser(db, row)
          totals.courses += c.courses
          totals.fetched += c.fetched
          totals.new += c.new
          totals.updated += c.updated
          totals.done += c.done
          totals.trashed += c.trashed
        } catch (e) {
          totals.failed++
          console.error('classroom-sync: user sync failed', describe(e))
        }
      }
    }))
    return jsonResponse(req, totals)
  }

  // ── A signed-in user's "Sync now" ──
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const { data: row, error } = await db.from('integrations').select('user_id, data, updated_at')
    .eq('user_id', auth.user.id).eq('provider', 'classroom').maybeSingle()
  if (error) return jsonResponse(req, { error: 'server_error' }, 500)
  if (!row || !CLIENT_ID || !CLIENT_SECRET) return jsonResponse(req, { error: 'not_connected' }, 404)
  try {
    return jsonResponse(req, await syncUser(db, row as IntegrationRow))
  } catch (e) {
    console.error('classroom-sync: sync failed', describe(e))
    if (e instanceof GoogleError) {
      if (e.status === 401) return jsonResponse(req, { error: 'token_expired' }, 409)
      return e.status === 403 ? jsonResponse(req, { error: 'blocked' }, 403) : jsonResponse(req, { error: 'google_unavailable' }, 502)
    }
    return jsonResponse(req, { error: 'server_error' }, 500)
  }
})
