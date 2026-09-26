// P4: Web Push sender — digests, missed-routine nudges, overdue alerts. Invoked by pg_cron
// (via pg_net) on a schedule, and by a manual "send test" button in Settings.
//
// FIX-0 / S1: two callers, two branches, and nothing is ever fanned out across users.
//  - pg_cron (service-role key from Vault): builds each user's payload from that user's rows only
//    and sends it to that user's devices only.
//  - a signed-in user: may only send `test`, and only to their own devices.
//  Anyone else (no token, the public anon key) gets 401.
import * as webpush from 'jsr:@negrel/webpush'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isServiceRole, requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_KEYS_JSON = Deno.env.get('VAPID_KEYS')!
const CONTACT_EMAIL = Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'mailto:example@example.com'

type NotifyKind = 'morning_digest' | 'evening_nudge' | 'overdue' | 'task_reminder' | 'test'
const KINDS: readonly string[] = ['morning_digest', 'evening_nudge', 'overdue', 'task_reminder', 'test']

interface PushPayload {
  title: string
  body: string
}

interface Subscription {
  id: string
  user_id: string
  endpoint: string
  keys: Record<string, string>
}

interface SendResult {
  attempted: number
  sent: number
  pruned: number
}

// Everything time-relative is computed once per invocation so every user in a cron run is judged
// against the same clock (as the old single-payload version was).
interface RunClock {
  nowIso: string
  today: string
  reminderWindowStart: string
}

function runClock(): RunClock {
  const now = Date.now()
  return {
    nowIso: new Date(now).toISOString(),
    today: new Date(now).toISOString().slice(0, 10),
    reminderWindowStart: new Date(now - 10 * 60 * 1000).toISOString(),
  }
}

// `slipping` is a security_invoker view with no user_id column. The service role bypasses RLS, so
// the view returns every user's rows; they are fetched once per run and each user only counts the
// rows for domains/projects/areas they own.
type SlippingRow = { entity_type: string; entity_id: string; days_since: number }

async function slippingCountFor(
  supabase: SupabaseClient,
  userId: string,
  allSlipping: () => Promise<SlippingRow[]>,
): Promise<number> {
  const [domains, projects, areas] = await Promise.all([
    supabase.from('domains').select('id').eq('user_id', userId),
    supabase.from('projects').select('id').eq('user_id', userId),
    supabase.from('areas').select('id').eq('user_id', userId),
  ])
  const owned = new Set([
    ...(domains.data ?? []).map((r) => `domain:${r.id}`),
    ...(projects.data ?? []).map((r) => `project:${r.id}`),
    ...(areas.data ?? []).map((r) => `area:${r.id}`),
  ])
  return (await allSlipping()).filter(
    (r) => owned.has(`${r.entity_type}:${r.entity_id}`) && (r.days_since as number) > 7,
  ).length
}

/** One user's payload, built only from that user's rows. Wording is unchanged from pre-FIX-0. */
async function buildPayload(
  supabase: SupabaseClient,
  kind: NotifyKind,
  userId: string,
  clock: RunClock,
  allSlipping: () => Promise<SlippingRow[]>,
): Promise<PushPayload | null> {
  if (kind === 'test') {
    return { title: "Kai's Flow", body: 'Test notification — push is wired up correctly.' }
  }

  if (kind === 'morning_digest') {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('title')
      .eq('user_id', userId)
      .eq('top3', true)
      .eq('status', 'todo')
    const slippingCount = await slippingCountFor(supabase, userId, allSlipping)
    const top3 = (tasks ?? []).map((t) => t.title as string)
    return {
      title: 'Morning digest',
      body: `Top-3: ${top3.length ? top3.join(', ') : 'none set'}. ${slippingCount} area(s) slipping.`,
    }
  }

  if (kind === 'evening_nudge') {
    const { data: routines } = await supabase
      .from('routines')
      .select('id, name')
      .eq('user_id', userId)
      .eq('active', true)
    const { data: completions } = await supabase
      .from('routine_completions')
      .select('routine_id')
      .eq('user_id', userId)
      .eq('completed_on', clock.today)
    const doneIds = new Set((completions ?? []).map((c) => c.routine_id as string))
    const missed = (routines ?? []).filter((r) => !doneIds.has(r.id as string))
    return missed.length === 0
      ? null // nothing missed — don't send a nudge
      : { title: 'Evening check-in', body: `Missed today: ${missed.map((r) => r.name as string).join(', ')}` }
  }

  if (kind === 'task_reminder') {
    const { data: due } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('user_id', userId)
      .eq('status', 'todo')
      .eq('reminder_sent', false)
      .lte('reminder_at', clock.nowIso)
      .gte('reminder_at', clock.reminderWindowStart)
    if (!due || due.length === 0) return null
    for (const task of due) {
      await supabase.from('tasks').update({ reminder_sent: true }).eq('id', task.id).eq('user_id', userId)
      await supabase.from('activity_log').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        event_type: 'task.reminder_sent',
        entity_type: 'task',
        entity_id: task.id,
        payload: { title: task.title },
      })
    }
    return { title: 'Task reminder', body: `${due.length} reminder(s): ${due.map((t) => t.title as string).join(', ')}` }
  }

  // overdue
  const { data: overdue } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'todo')
    .lt('due_at', clock.nowIso)
  if (!overdue || overdue.length === 0) return null
  return { title: 'Overdue', body: `${overdue.length} task(s) overdue` }
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

/** Sends one user's payload to that user's own subscriptions; prunes the ones the push service says are gone. */
async function sendToSubscriptions(
  supabase: SupabaseClient,
  userId: string,
  subs: Subscription[],
  payload: PushPayload,
): Promise<SendResult> {
  const server = await appServer()
  const own = subs.filter((sub) => sub.user_id === userId) // defence in depth: never deliver across users
  let sent = 0
  let pruned = 0
  for (const sub of own) {
    try {
      const subscriber = server.subscribe({ endpoint: sub.endpoint, keys: sub.keys })
      await subscriber.pushTextMessage(JSON.stringify(payload), {})
      sent++
    } catch (e) {
      const status = (e as { status?: number })?.status
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id).eq('user_id', userId)
        pruned++
      }
    }
  }
  return { attempted: own.length, sent, pruned }
}

type UserResult = { user_id: string; skipped: boolean; failed?: true } & SendResult

/** pg_cron path: every user with a push device gets their own payload on their own devices. */
async function runForAllUsers(req: Request, kind: NotifyKind): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const clock = runClock()

  let slippingCache: Promise<SlippingRow[]> | null = null
  const allSlipping = () =>
    (slippingCache ??= (async () => {
      const { data } = await supabase.from('slipping').select('entity_type, entity_id, days_since')
      return (data ?? []) as SlippingRow[]
    })())

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
      .eq('reminder_sent', false)
      .lte('reminder_at', clock.nowIso)
      .gte('reminder_at', clock.reminderWindowStart)
    for (const row of dueOwners ?? []) userIds.add(row.user_id as string)
  }

  let sent = 0
  let pruned = 0
  const users: UserResult[] = []
  for (const userId of userIds) {
    // One user's bad row or failed query must not cost every other user their notification.
    try {
      const payload = await buildPayload(supabase, kind, userId, clock, allSlipping)
      const subs = subsByUser.get(userId) ?? []
      if (!payload || subs.length === 0) {
        users.push({ user_id: userId, skipped: true, attempted: 0, sent: 0, pruned: 0 })
        continue
      }
      const result = await sendToSubscriptions(supabase, userId, subs, payload)
      sent += result.sent
      pruned += result.pruned
      users.push({ user_id: userId, skipped: false, ...result })
    } catch (e) {
      console.error(`notify ${kind}: user ${userId} failed`, e)
      users.push({ user_id: userId, skipped: false, failed: true, attempted: 0, sent: 0, pruned: 0 })
    }
  }

  // Counts only — never payload content — so the pg_net response log holds no personal data.
  return jsonResponse(req, { sent, pruned, skipped: users.every((u) => u.skipped), users })
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
  const payload = (await buildPayload(supabase, 'test', userId, runClock(), async () => []))!
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
    const { kind } = (await req.json()) as { kind: NotifyKind }

    if (!serviceRole) {
      // Digests, nudges, reminders and sweeps are cron-only; a user may only test their own devices.
      if (kind !== 'test') return jsonResponse(req, { error: 'forbidden' }, 403)
      return await runTestForUser(req, userId!, token)
    }

    if (!KINDS.includes(kind)) return jsonResponse(req, { error: 'unknown kind' }, 400)
    return await runForAllUsers(req, kind)
  } catch (e) {
    return jsonResponse(req, { error: String(e) }, 400)
  }
})
