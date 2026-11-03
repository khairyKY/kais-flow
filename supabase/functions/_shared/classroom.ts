// Google Classroom deadlines (Kai 2026-11-03): a student's courses, coursework and "turned in" state as
// projects and tasks. The pure half of classroom-connect / classroom-sync — no Deno APIs, so the app's
// vitest runs it (app/src/features/settings/classroomSync.test.ts).
//
// integrations row, provider 'classroom' (its own row and consent — never the Calendar grant), `data` = {
//   refresh_token,                       server-side only, never selected by the client
//   login,                               the account, as Google's token endpoint last said (may be absent)
//   courses: [{id, name}],               the ACTIVE courses the account is in (non-secret)
//   chosen: [course id…],                the ones synced (non-secret)
//   status: 'ok'|'failing', synced_at,   like Google's: 'failing' after Google refused the refresh token
//   domain_id                            the "Classroom" domain the course projects sit in
// }
// Each chosen course is a project (external_ref {source:'classroom', id:<course id>, url}); each piece of
// coursework is a task (external_ref {source:'classroom', id:'<course id>/<work id>', url, course_id, due,
// title}) — `due` / `title` are what Classroom said LAST time, so a later sync overwrites the task only
// when Classroom itself changed, never a date or a name the person edited here.
import { GoogleError } from './google.ts'
import { wallToInstant } from './zone.ts'

export const CLASSROOM_API = 'https://classroom.googleapis.com/v1'
/** Read-only, and only the student's own: courses, own coursework, own submissions. Asked for on their
 * own consent page — the Calendar grant is never widened to carry these. */
export const CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
] as const
/** How many courses one account can sync. */
export const MAX_COURSES = 40
/** Newly imported work due longer ago than this (and not turned in) is left out: last term's missing work. */
export const STALE_DAYS = 30
/** The most tasks one course may add in a run. */
export const MAX_NEW_PER_COURSE = 300

export interface CourseRef {
  id: string
  name: string
}

export interface ClassroomData {
  refresh_token?: string
  login?: string
  courses?: CourseRef[]
  chosen?: string[]
  status?: 'ok' | 'failing'
  synced_at?: string | null
  domain_id?: string
}

/** Google's consent page for Classroom only. include_granted_scopes is left off on purpose: the token
 * carries these three scopes and nothing from a Calendar grant. offline + prompt=consent: a refresh
 * token every time. */
export function classroomAuthUrl(authBase: string, clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: CLASSROOM_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${authBase}?${q}`
}

/** Whether a token response's `scope` holds all three (Google's granular consent lets a person untick one). */
export const hasAllScopes = (granted: string | undefined): boolean => {
  const have = (granted ?? '').split(' ')
  return CLASSROOM_SCOPES.every((s) => have.includes(s))
}

// ── courses ─────────────────────────────────────────────────────────────────────────────────────

export interface GCourse {
  id?: string
  name?: string
  section?: string
  courseState?: string
}

/** courses.list → our list: ACTIVE courses only (an archived or provisioned one isn't a live deadline). */
export function readCourses(items: readonly GCourse[]): CourseRef[] {
  return items
    .filter((c) => c.id && c.courseState === 'ACTIVE')
    .slice(0, MAX_COURSES)
    .map((c) => ({ id: c.id!, name: [c.name?.trim(), c.section?.trim()].filter(Boolean).join(' · ') || c.id! }))
}

/** A "choose" request's ids, kept only when every one is a course we listed. */
export function readChosenCourses(ids: unknown, courses: readonly CourseRef[]): string[] | null {
  if (!Array.isArray(ids) || ids.length > MAX_COURSES) return null
  const known = new Set(courses.map((c) => c.id))
  const out = [...new Set(ids)]
  return out.every((id) => typeof id === 'string' && known.has(id)) ? (out as string[]) : null
}

/** The course list after a re-read: the stored order, names refreshed, new courses appended. A new course is
 * NOT chosen for the person; `chosen` loses only the ones Classroom no longer lists. */
export function mergeCourses(fresh: readonly CourseRef[], chosen: readonly string[]): { courses: CourseRef[]; chosen: string[] } {
  const ids = new Set(fresh.map((c) => c.id))
  return { courses: [...fresh], chosen: chosen.filter((id) => ids.has(id)) }
}

// ── coursework ──────────────────────────────────────────────────────────────────────────────────

export interface GDate {
  year?: number
  month?: number
  day?: number
}
export interface GTime {
  hours?: number
  minutes?: number
  seconds?: number
}
export interface GWork {
  id?: string
  courseId?: string
  title?: string
  state?: string
  dueDate?: GDate
  dueTime?: GTime
  alternateLink?: string
}
export interface GSubmission {
  courseWorkId?: string
  state?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** When the work is due, as an instant (ISO), or null for undated work. Classroom gives the date and the
 * time in UTC: with a time, that instant exactly. A date alone is the whole day, so the end of it on the
 * student's own clock (23:59) — never 09:00, which would show "overdue" for the rest of the due day. */
export function dueOf(w: Pick<GWork, 'dueDate' | 'dueTime'>, zone: string): string | null {
  const d = w.dueDate
  if (!d?.year || !d.month || !d.day) return null
  if (w.dueTime) {
    return new Date(Date.UTC(d.year, d.month - 1, d.day, w.dueTime.hours ?? 0, w.dueTime.minutes ?? 0, w.dueTime.seconds ?? 0)).toISOString()
  }
  return wallToInstant(`${d.year}-${pad(d.month)}-${pad(d.day)}`, 23, 59, zone).toISOString()
}

/** TURNED_IN or RETURNED: the student has handed it in (NEW, CREATED and RECLAIMED_BY_STUDENT: not yet). */
export const isHandedIn = (state: string | undefined): boolean => state === 'TURNED_IN' || state === 'RETURNED'

export interface StoredTask {
  id: string
  title: string
  status: string
  due_at: string | null
  someday: boolean
  deleted_at: string | null
  external_ref: { source?: string; id?: string; url?: string; course_id?: string; due?: string | null; title?: string } | null
}

export interface TaskPatch {
  title?: string
  due_at?: string | null
  someday?: boolean
  external_ref: NonNullable<StoredTask['external_ref']>
}

export interface CoursePlan {
  insert: Record<string, unknown>[]
  update: { id: string; patch: TaskPatch }[]
  /** Open tasks whose submission is handed in. */
  done: { id: string; external_ref: NonNullable<StoredTask['external_ref']> }[]
  /** Open tasks whose work is gone from Classroom. */
  trash: string[]
}

export const taskKey = (courseId: string, workId: string) => `${courseId}/${workId}`

const iso = (s: string | null | undefined) => (s ? new Date(s).toISOString() : null)

/** One course's whole picture → what to write. `work` must be the COMPLETE published list (a partial read
 * would trash the rest — the caller returns early on any failed page). A student only ever sees PUBLISHED
 * work, so work that is missing here was deleted or unpublished. */
export function planCourse(a: {
  courseId: string
  projectId: string
  domainId: string
  work: readonly GWork[]
  submissions: ReadonlyMap<string, string>
  stored: readonly StoredTask[]
  zone: string
  now: Date
  newId: () => string
}): CoursePlan {
  const plan: CoursePlan = { insert: [], update: [], done: [], trash: [] }
  const known = new Map(a.stored.map((t) => [t.external_ref?.id ?? '', t]))
  const seen = new Set<string>()
  const staleBefore = a.now.getTime() - STALE_DAYS * 86_400_000

  for (const w of a.work) {
    if (!w.id || !w.title || (w.state && w.state !== 'PUBLISHED')) continue
    const key = taskKey(a.courseId, w.id)
    seen.add(key)
    const due = dueOf(w, a.zone)
    const handedIn = isHandedIn(a.submissions.get(w.id))
    const task = known.get(key)
    const ref = { source: 'classroom', id: key, url: w.alternateLink, course_id: a.courseId, due, title: w.title }

    if (!task) {
      // Nothing to do about work already handed in, and last term's missing work isn't a deadline.
      if (handedIn || (due && Date.parse(due) < staleBefore) || plan.insert.length >= MAX_NEW_PER_COURSE) continue
      plan.insert.push({ id: a.newId(), project_id: a.projectId, domain_id: a.domainId, title: w.title, status: 'todo', due_at: due, someday: !due, external_ref: ref })
      continue
    }
    if (task.deleted_at) continue // trashed by the person: never brought back

    const was = task.external_ref ?? {}
    if (task.status === 'todo' && handedIn) {
      plan.done.push({ id: task.id, external_ref: { ...ref } })
      continue
    }
    if (task.status !== 'todo') continue
    const patch: TaskPatch = { external_ref: { ...was, ...ref } }
    // Only what Classroom changed since the last look is written: a date or a name edited here stays.
    if (iso(was.due) !== due) {
      patch.due_at = due
      patch.someday = !due
    }
    if (was.title !== w.title) patch.title = w.title
    if (patch.title !== undefined || patch.due_at !== undefined || was.url !== w.alternateLink) plan.update.push({ id: task.id, patch })
  }

  for (const t of a.stored) {
    if (t.deleted_at || t.status !== 'todo') continue
    if (!seen.has(t.external_ref?.id ?? '')) plan.trash.push(t.id)
  }
  return plan
}

/** GET from the Classroom API. 401 = the grant is dead; 403 = Classroom refused (the school's admin blocked the app or the API). */
export async function classroomGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${CLASSROOM_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    await res.body?.cancel()
    throw new GoogleError(res.status)
  }
  return (await res.json()) as T
}

/** Every page of a list call (`key` is the array's field), or null when a page failed in a way that leaves
 * the course alone this run (anything but a dead grant or a refusal, which throw). 404 = the course is gone: null too. */
export async function classroomList<T>(path: string, key: string, accessToken: string, maxPages = 20): Promise<T[] | null> {
  const out: T[] = []
  let page = ''
  for (let i = 0; i < maxPages; i++) {
    const join = path.includes('?') ? '&' : '?'
    try {
      const res = await classroomGet<Record<string, unknown> & { nextPageToken?: string }>(`${path}${join}pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, accessToken)
      out.push(...((res[key] as T[] | undefined) ?? []))
      page = res.nextPageToken ?? ''
    } catch (e) {
      if (e instanceof GoogleError && (e.status === 401 || e.status === 403)) throw e
      console.error('classroom: a read failed', e instanceof Error ? e.message : 'error')
      return null
    }
    if (!page) return out
  }
  return null // more pages than we read: a partial list must never trash the rest
}
