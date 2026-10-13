// P4: Web Push sender — digests, evening nudges, task and routine reminders, birthdays. Invoked by
// pg_cron (via pg_net) on a schedule, by capture-image when a page is read to the end (paper ready),
// and by a manual "send test" button in Settings.
//
// Tray & notifications (2026-10-04): every payload is a `Notice` from copy.ts — the drawn title,
// body and actions (Tray and Notifications.dc.html 12k) that app/public/sw-push.js shows as is —
// and each user's Settings → Notifications decide it (copy.ts `deliver`): a kind turned off or
// "Pause notifications for 1 hour" sends nothing, quiet hours send silently, and with "Show task
// names on the lock screen" off (the default) no task name is in the payload at all.
//
// FIX-0 / S1: two callers, two branches, and nothing is ever fanned out across users.
//  - pg_cron (service-role key from Vault): builds each user's payload from that user's rows only
//    and sends it to that user's devices only. capture-image (the runtime's service-role key) asks
//    for one capture's owner only: `{kind: 'paper_ready', capture_id}`.
//  - a signed-in user: may only send `test`, and only to their own devices.
//  Anyone else (no token, the public anon key) gets 401.
//
// SEC-2: whichever branch, a push is only ever POSTed to a known Web Push service
// (push-endpoint.ts); any other stored endpoint is skipped and counted, never contacted.
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isServiceRole, requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { endpointHost, isKnownPushEndpoint } from './push-endpoint.ts'
import { dayBounds, ritualDue, ritualOn, shutDownOn, type RitualSettings } from './ritual.ts'
import { routinesDueAt, type ReminderRoutine } from './routine.ts'
import { birthdayDue, birthdayGroups, type PersonFacts } from './birthday.ts'
import { dateKey, dayWindow, userZone } from '../_shared/zone.ts'
import { todaysTop3, type Top3Row } from '../_shared/today.ts'
import { birthdayNotice, deliver, digestNotice, kindOn, nudgeNotice, paperReadyNotice, reminderNotice, routineNotice, testNotice, type Notice, type NoticePrefs } from './copy.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_KEYS_JSON = Deno.env.get('VAPID_KEYS')!
const CONTACT_EMAIL = Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'mailto:example@example.com'

// 'overdue' is gone (2026-10-12): an hourly push nobody could turn off. Migration 0062 unschedules its
// cron job; the morning digest says "N overdue" instead.
type NotifyKind = 'morning_digest' | 'evening_nudge' | 'task_reminder' | 'routine' | 'birthday' | 'test'
const KINDS: readonly string[] = ['morning_digest', 'evening_nudge', 'task_reminder', 'routine', 'birthday', 'test']

/** One user's app_settings row as notify reads it (select('*'), so a function deployed before
 * migration 0048 still runs: the missing columns read as their defaults). */
type UserPrefs = RitualSettings & NoticePrefs & { user_id: string }

interface Subscription {
  id: string
  user_id: string
  endpoint: string
  keys: { p256dh: string; auth: string } // PushSubscription.toJSON().keys, as the client stores it
}

interface SendResult {
  attempted: number
  sent: number
  pruned: number
  /** SEC-2: this user's devices whose endpoint is not a known push service — never contacted. */
  skipped_endpoints: number
}

// Everything time-relative is computed once per invocation so every user in a cron run is judged
// against the same clock (as the old single-payload version was). "Today" and every wall-clock
// time are each user's own: their app_settings.timezone (user time zones, 2026-10-04).
interface RunClock {
  now: Date
  nowIso: string
  reminderWindowStart: string
}

function runClock(): RunClock {
  const now = Date.now()
  return {
    now: new Date(now),
    nowIso: new Date(now).toISOString(),
    reminderWindowStart: new Date(now - 10 * 60 * 1000).toISOString(),
  }
}

/** The in-app history (Activity) keeps what was sent, always with names (it's behind the lock).
 * `ref`: what its button opens (paper ready: capture_id; one birthday: person_id). */
async function logNotice(supabase: SupabaseClient, userId: string, n: Notice, ref: Record<string, string> = {}): Promise<void> {
  await supabase.from('activity_log').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    event_type: `notify.${n.kind}`,
    entity_type: 'notification',
    entity_id: crypto.randomUUID(),
    payload: { title: n.title, body: n.body, ...ref },
  })
}

const NAMES: NoticePrefs = { lock_screen_names: true }

/** One user's notice (birthday: one per group), built only from that user's rows; `prefs` = their own settings. */
async function buildPayload(
  supabase: SupabaseClient,
  kind: NotifyKind,
  userId: string,
  clock: RunClock,
  prefs: UserPrefs | undefined,
): Promise<Notice | Notice[] | null> {
  if (kind === 'test') return testNotice()
  const zone = userZone(prefs?.timezone)

  if (kind === 'morning_digest') {
    // Today's Top 3 as Today draws it (_shared/today.ts): a pick moved to a later day isn't one, the
    // goal (top3_rank 1) first. Overdue: open, not someday, dated before the user's today.
    const todayStart = dayWindow(clock.now, zone).start.toISOString()
    const [picks, late] = await Promise.all([
      supabase
        .from('tasks')
        .select('title, status, someday, deleted_at, due_at, scheduled_start, top3, top3_rank, created_at')
        .eq('user_id', userId)
        .eq('top3', true)
        .eq('status', 'todo')
        .eq('someday', false)
        .is('deleted_at', null),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'todo')
        .eq('someday', false)
        .is('deleted_at', null)
        .or(`due_at.lt.${todayStart},and(due_at.is.null,scheduled_start.lt.${todayStart})`),
    ])
    if (picks.error || late.error) throw picks.error ?? late.error
    const top3 = todaysTop3((picks.data ?? []) as (Top3Row & { title: string })[], clock.now, zone).map((t) => t.title)
    const n = digestNotice(top3, prefs, late.count ?? 0)
    if (deliver(n, prefs, clock.now, zone)) await logNotice(supabase, userId, digestNotice(top3, NAMES, late.count ?? 0))
    return n
  }

  if (kind === 'evening_nudge') {
    // "4 done · 2 left": finished today, and still open for today (due today or before) — the user's today.
    const day = dayBounds(clock.now, zone)
    const [done, left, shut] = await Promise.all([
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'done').is('deleted_at', null).gte('completed_at', day.start).lt('completed_at', day.end),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'todo').eq('someday', false).is('deleted_at', null).lt('due_at', day.end),
      // A29: the app's `ritual.finished` rows (notify/ritual.ts shutDownOn). A loop day began at most 28
      // hours ago, so two days of rows cover it, on the (user_id, created_at) index.
      supabase
        .from('activity_log')
        .select('payload')
        .eq('user_id', userId)
        .eq('event_type', 'ritual.finished')
        .gte('created_at', new Date(clock.now.getTime() - 2 * 86_400_000).toISOString()),
    ])
    if (done.error || left.error || shut.error) throw done.error ?? left.error ?? shut.error
    if (shutDownOn(shut.data ?? [], clock.now, zone)) return null // Shut down is done: the day is closed
    if ((done.count ?? 0) + (left.count ?? 0) === 0) return null // an empty day has nothing to close
    const n = nudgeNotice(done.count ?? 0, left.count ?? 0)
    if (deliver(n, prefs, clock.now, zone)) await logNotice(supabase, userId, n)
    return n
  }

  if (kind === 'task_reminder') {
    const { data: due } = await supabase
      .from('tasks')
      .select('id, title, due_at, project:projects(name)')
      .eq('user_id', userId)
      .eq('status', 'todo')
      .is('deleted_at', null) // a task in Trash never reminds
      .eq('reminder_sent', false)
      .lte('reminder_at', clock.nowIso)
      .gte('reminder_at', clock.reminderWindowStart)
    if (!due || due.length === 0) return null
    const tasks = due.map((t) => {
      const project = t.project as { name?: string } | { name?: string }[] | null
      return { id: t.id as string, title: t.title as string, due_at: t.due_at as string | null, project: (Array.isArray(project) ? project[0] : project)?.name ?? null }
    })
    for (const task of tasks) {
      const said = reminderNotice([task], NAMES, clock.now, zone)
      await supabase.from('tasks').update({ reminder_sent: true }).eq('id', task.id).eq('user_id', userId)
      await supabase.from('activity_log').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        event_type: 'task.reminder_sent',
        entity_type: 'task',
        entity_id: task.id,
        payload: { title: task.title, notice: { title: said.title, body: said.body } },
      })
    }
    return reminderNotice(tasks, prefs, clock.now, zone)
  }

  if (kind === 'birthday') {
    // 08:00 on the user's clock (runForAllUsers picks the tick): whose birthday is today, and whose is a
    // week out (P7 7b), each with how long since you last spoke (their newest interaction up to today) —
    // notify/birthday.ts birthdayGroups, which the Windows/Android apps plan with too.
    const { data: people, error } = await supabase.from('people').select('id, name, facts').eq('user_id', userId)
    if (error) throw error
    const today = dateKey(clock.now, zone)
    const all = (people ?? []) as PersonFacts[]
    const ids = birthdayGroups(all, [], today, zone).flatMap((g) => g.people.map((b) => b.id))
    if (ids.length === 0) return null
    const { data: spoke, error: spokeError } = await supabase
      .from('interactions')
      .select('person_id, occurred_at')
      .eq('user_id', userId)
      .in('person_id', ids)
      .lt('occurred_at', dayWindow(clock.now, zone).end.toISOString())
    if (spokeError) throw spokeError
    const notices: Notice[] = []
    for (const g of birthdayGroups(all, spoke ?? [], today, zone)) {
      const n = birthdayNotice(g.people, prefs, g.inDays)
      if (deliver(n, prefs, clock.now, zone)) await logNotice(supabase, userId, birthdayNotice(g.people, NAMES, g.inDays), g.people.length === 1 ? { person_id: g.people[0].id } : {})
      notices.push(n)
    }
    return notices
  }

  // routine: the reminders whose time is on this tick, on the days their cadence has, not yet checked
  // off today (notify/routine.ts). Logged to the history like the digest — only when it goes out.
  const { data: routines, error } = await supabase
    .from('routines')
    .select('id, name, clock_time, cadence, active')
    .eq('user_id', userId)
    .eq('active', true)
    .not('clock_time', 'is', null)
  if (error) throw error
  // Most ticks nothing is due; only then are the check-offs read (yesterday's too: a 23:58 reminder
  // sent on the 00:00 tick belongs to yesterday).
  const onTick = routinesDueAt((routines ?? []) as ReminderRoutine[], [], clock.now, zone)
  if (onTick.length === 0) return null
  const { data: done, error: doneError } = await supabase
    .from('routine_completions')
    .select('routine_id, completed_on')
    .eq('user_id', userId)
    .in('routine_id', onTick.map((r) => r.id))
    .gte('completed_on', dateKey(new Date(clock.now.getTime() - 86_400_000), zone))
  if (doneError) throw doneError
  const due = routinesDueAt(onTick, done ?? [], clock.now, zone) as (ReminderRoutine & { clock_time: string })[]
  if (due.length === 0) return null
  const n = routineNotice(due, prefs)
  if (deliver(n, prefs, clock.now, zone)) await logNotice(supabase, userId, routineNotice(due, NAMES))
  return n
}

let appServerPromise: Promise<webpush.ApplicationServer> | null = null
function appServer(): Promise<webpush.ApplicationServer> {
  appServerPromise ??= (async () => {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS_JSON), { extractable: false })
    return await webpush.ApplicationServer.new({ contactInformation: CONTACT_EMAIL, vapidKeys })
  })().catch((e) => {
    appServerPromise = null // don't pin a failed VAPID import for the life of the worker
    throw e
  })
  return appServerPromise
}

/** Sends one user's payload to that user's own subscriptions on known push services; prunes the
 * ones the push service says are gone. Endpoints anywhere else are skipped, not contacted. */
async function sendToSubscriptions(
  supabase: SupabaseClient,
  userId: string,
  subs: Subscription[],
  payload: Notice,
): Promise<SendResult> {
  const server = await appServer()
  const own = subs.filter((sub) => sub.user_id === userId) // defence in depth: never deliver across users
  // SEC-2: the endpoint is user-supplied; POST only to real push services (no SSRF via `test`).
  const deliverable = own.filter((sub) => isKnownPushEndpoint(sub.endpoint))
  const skippedEndpoints = own.length - deliverable.length
  if (skippedEndpoints > 0) {
    const hosts = own.filter((sub) => !isKnownPushEndpoint(sub.endpoint)).map((sub) => endpointHost(sub.endpoint))
    console.warn(`notify: user ${userId}: skipped ${skippedEndpoints} endpoint(s) not on a known push service: ${hosts.join(', ')}`)
  }
  let sent = 0
  let pruned = 0
  for (const sub of deliverable) {
    try {
      const subscriber = server.subscribe({ endpoint: sub.endpoint, keys: sub.keys })
      await subscriber.pushTextMessage(JSON.stringify(payload), {})
      sent++
    } catch (e) {
      // @negrel/webpush (0.5.0, subscriber.ts) throws PushMessageError for any non-2xx reply, with
      // the push service's Response on `.response`; the error has no `.status` of its own.
      // 404/410 = this subscription is gone for good, so drop that one row: by id, and only if it
      // belongs to the user this send is for (FIX-0: one user's run never touches another's rows).
      const status = e instanceof webpush.PushMessageError ? e.response.status : undefined
      if (status === 404 || status === 410) {
        const { error } = await supabase.from('push_subscriptions').delete().eq('id', sub.id).eq('user_id', userId)
        if (error) {
          console.error(`notify: user ${userId}: could not prune a gone subscription on ${endpointHost(sub.endpoint)}`, error)
        } else {
          pruned++
        }
      }
    }
  }
  return { attempted: deliverable.length, sent, pruned, skipped_endpoints: skippedEndpoints }
}

type UserResult = { user_id: string; skipped: boolean; failed?: true } & SendResult

/** pg_cron path: every user with a push device gets their own payload on their own devices.
 * `scheduled` (the 15-minute digest/nudge jobs, 0045): only users whose own reminder time is due on
 * this tick. Without it (a manual service-role call) the time is ignored; an off reminder stays off. */
async function runForAllUsers(req: Request, kind: NotifyKind, scheduled: boolean): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const clock = runClock()

  const { data: subRows, error: subError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, keys')
  if (subError) throw subError
  const subsByUser = new Map<string, Subscription[]>()
  for (const sub of (subRows ?? []) as Subscription[]) {
    const list = subsByUser.get(sub.user_id) ?? []
    list.push(sub)
    subsByUser.set(sub.user_id, list)
  }

  // task_reminder also has side effects (reminder_sent + a `task.reminder_sent` activity row the
  // in-app Activity feed shows). Before FIX-0 those applied to every due reminder, device or not —
  // so owners of due reminders are included even when they have no push device.
  const userIds = new Set(subsByUser.keys())
  if (kind === 'task_reminder') {
    const { data: dueOwners } = await supabase
      .from('tasks')
      .select('user_id')
      .eq('status', 'todo')
      .is('deleted_at', null) // a task in Trash never reminds
      .eq('reminder_sent', false)
      .lte('reminder_at', clock.nowIso)
      .gte('reminder_at', clock.reminderWindowStart)
    for (const row of dueOwners ?? []) userIds.add(row.user_id as string)
  }
  // routine: only the push users who have a routine with a reminder time at all.
  if (kind === 'routine') {
    // ponytail: one read of every reminding routine's owner (PostgREST caps it at 1000 rows); a
    // per-tick window query needs each user's zone in SQL — add it past a few hundred such users.
    const { data: owners, error } = await supabase.from('routines').select('user_id').eq('active', true).not('clock_time', 'is', null)
    if (error) throw error
    const reminding = new Set((owners ?? []).map((r) => r.user_id as string))
    for (const id of userIds) if (!reminding.has(id)) userIds.delete(id)
  }

  // Settings › Notifications (app_settings, 0045 + 0048). A failed read sends nothing: better one
  // missed digest than every user getting one on every tick (a reminder retries on the next sweep).
  const prefsByUser = new Map<string, UserPrefs>()
  if (userIds.size > 0) {
    const { data: rows, error } = await supabase
      .from('app_settings')
      .select('*')
      // ponytail: one IN list in the URL (~37 chars a user); chunk it past a few hundred push users.
      .in('user_id', [...userIds])
    if (error) throw error
    for (const r of (rows ?? []) as UserPrefs[]) prefsByUser.set(r.user_id, r)
  }
  if (kind === 'morning_digest' || kind === 'evening_nudge') {
    for (const id of userIds) {
      const s = prefsByUser.get(id)
      if (!(scheduled ? ritualDue(kind, s, clock.now, userZone(s?.timezone)) : ritualOn(kind, s))) userIds.delete(id)
    }
  }
  // birthday: off until the user turns it on (12i), then on the tick that is 08:00 on their clock.
  if (kind === 'birthday') {
    for (const id of userIds) {
      const s = prefsByUser.get(id)
      if (!kindOn('birthday', s) || (scheduled && !birthdayDue(clock.now, userZone(s?.timezone)))) userIds.delete(id)
    }
  }

  let sent = 0
  let pruned = 0
  let skippedEndpoints = 0
  const users: UserResult[] = []
  for (const userId of userIds) {
    // One user's bad row or failed query must not cost every other user their notification.
    try {
      const prefs = prefsByUser.get(userId)
      const built = await buildPayload(supabase, kind, userId, clock, prefs)
      const payloads = [built ?? []].flat().flatMap((n) => deliver(n, prefs, clock.now, userZone(prefs?.timezone)) ?? [])
      const subs = subsByUser.get(userId) ?? []
      if (payloads.length === 0 || subs.length === 0) {
        users.push({ user_id: userId, skipped: true, attempted: 0, sent: 0, pruned: 0, skipped_endpoints: 0 })
        continue
      }
      const result: SendResult = { attempted: 0, sent: 0, pruned: 0, skipped_endpoints: 0 }
      for (const payload of payloads) {
        const r = await sendToSubscriptions(supabase, userId, subs, payload)
        result.attempted += r.attempted
        result.sent += r.sent
        result.pruned += r.pruned
        result.skipped_endpoints = r.skipped_endpoints // the same devices each time
      }
      sent += result.sent
      pruned += result.pruned
      skippedEndpoints += result.skipped_endpoints
      users.push({ user_id: userId, skipped: false, ...result })
    } catch (e) {
      console.error(`notify ${kind}: user ${userId} failed`, e)
      users.push({ user_id: userId, skipped: false, failed: true, attempted: 0, sent: 0, pruned: 0, skipped_endpoints: 0 })
    }
  }

  // Counts only — never payload content — so the pg_net response log holds no personal data.
  return jsonResponse(req, {
    sent,
    pruned,
    skipped: users.every((u) => u.skipped),
    skipped_endpoints: skippedEndpoints,
    users,
  })
}

/** capture-image's call when a page is read to the end: that capture's owner only. The read may
 * finish after the phone left (capture-image keeps it going), so the push is how a closed app hears
 * it; the service worker drops it while a window of the app is focused (the results are on screen). */
async function runPaperReady(req: Request, captureId: string): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const clock = runClock()
  const { data: c, error } = await supabase.from('captures').select('id, user_id, status, title, items').eq('id', captureId).maybeSingle()
  if (error) throw error
  if (!c || c.status !== 'done') return jsonResponse(req, { sent: 0, skipped: true })
  const userId = c.user_id as string
  const [settings, subs] = await Promise.all([
    supabase.from('app_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('push_subscriptions').select('id, user_id, endpoint, keys').eq('user_id', userId),
  ])
  if (settings.error || subs.error) throw settings.error ?? subs.error
  const prefs = (settings.data ?? undefined) as UserPrefs | undefined
  const capture = { id: c.id as string, title: c.title as string | null, items: (c.items ?? []) as { confidence: number }[] }
  const payload = deliver(paperReadyNotice(capture, prefs), prefs, clock.now, userZone(prefs?.timezone))
  if (!payload) return jsonResponse(req, { sent: 0, skipped: true })
  await logNotice(supabase, userId, paperReadyNotice(capture, NAMES), { capture_id: capture.id })
  const result = await sendToSubscriptions(supabase, userId, (subs.data ?? []) as Subscription[], payload)
  return jsonResponse(req, { ...result, skipped: false })
}

/** Signed-in user path: a test push to the caller's own devices, nothing else. */
async function runTestForUser(req: Request, userId: string, token: string): Promise<Response> {
  // Runs as the user (RLS applies) — the service-role key is not needed for this path at all.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, keys')
    .eq('user_id', userId)
  if (error) throw error
  const payload = testNotice()
  const result = await sendToSubscriptions(supabase, userId, (subs ?? []) as Subscription[], payload)
  // `sent`/`pruned` at the top level are what Settings' "send test" reads (notifications/api.ts).
  return jsonResponse(req, { ...result, users: [{ user_id: userId, skipped: false, ...result }] })
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Resolve the caller before reading the body or touching the DB.
  const serviceRole = await isServiceRole(req)
  let userId: string | null = null
  let token = ''
  if (!serviceRole) {
    const auth = await requireUser(req)
    if (auth instanceof Response) return auth
    userId = auth.user.id
    token = auth.token
  }

  try {
    const { kind, scheduled, capture_id } = (await req.json()) as { kind: NotifyKind | 'paper_ready'; scheduled?: boolean; capture_id?: unknown }

    if (!serviceRole) {
      // Digests, nudges, reminders and sweeps are cron-only; a user may only test their own devices.
      if (kind !== 'test') return jsonResponse(req, { error: 'forbidden' }, 403)
      return await runTestForUser(req, userId!, token)
    }

    if (kind === 'paper_ready') {
      if (typeof capture_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(capture_id)) return jsonResponse(req, { error: 'bad_request' }, 400)
      return await runPaperReady(req, capture_id)
    }
    if (!KINDS.includes(kind)) return jsonResponse(req, { error: 'unknown kind' }, 400)
    return await runForAllUsers(req, kind as NotifyKind, scheduled === true)
  } catch (e) {
    // Details stay in the function log; callers get a stable code, never upstream or stack text.
    console.error('notify:', e)
    return jsonResponse(req, { error: 'bad_request' }, 400)
  }
})
