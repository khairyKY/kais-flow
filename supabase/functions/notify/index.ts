// P4: Web Push sender — digests, missed-routine nudges, overdue alerts. Invoked by pg_cron
// (via pg_net) on a schedule, and by a manual "send test" button in Settings.
import * as webpush from 'jsr:@negrel/webpush'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_KEYS_JSON = Deno.env.get('VAPID_KEYS')!
const CONTACT_EMAIL = Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'mailto:example@example.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type NotifyKind = 'morning_digest' | 'evening_nudge' | 'overdue' | 'task_reminder' | 'test'

interface PushPayload {
  title: string
  body: string
}

async function buildPayload(
  supabase: ReturnType<typeof createClient>,
  kind: NotifyKind,
): Promise<PushPayload | null> {
  if (kind === 'test') {
    return { title: "Kai's Flow", body: 'Test notification — push is wired up correctly.' }
  }

  if (kind === 'morning_digest') {
    const { data: tasks } = await supabase.from('tasks').select('title').eq('top3', true).eq('status', 'todo')
    const { data: slipping } = await supabase.from('slipping').select('days_since')
    const slippingCount = (slipping ?? []).filter((r) => (r.days_since as number) > 7).length
    const top3 = (tasks ?? []).map((t) => t.title as string)
    return {
      title: 'Morning digest',
      body: `Top-3: ${top3.length ? top3.join(', ') : 'none set'}. ${slippingCount} area(s) slipping.`,
    }
  }

  if (kind === 'evening_nudge') {
    const today = new Date().toISOString().slice(0, 10)
    const { data: routines } = await supabase.from('routines').select('id, name').eq('active', true)
    const { data: completions } = await supabase
      .from('routine_completions')
      .select('routine_id')
      .eq('completed_on', today)
    const doneIds = new Set((completions ?? []).map((c) => c.routine_id as string))
    const missed = (routines ?? []).filter((r) => !doneIds.has(r.id as string))
    return missed.length === 0
      ? null // nothing missed — don't send a nudge
      : { title: 'Evening check-in', body: `Missed today: ${missed.map((r) => r.name as string).join(', ')}` }
  }

  if (kind === 'task_reminder') {
    const now = new Date().toISOString()
    const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: due } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('status', 'todo')
      .eq('reminder_sent', false)
      .lte('reminder_at', now)
      .gte('reminder_at', windowStart)
    if (!due || due.length === 0) return null
    for (const task of due) {
      await supabase.from('tasks').update({ reminder_sent: true }).eq('id', task.id)
      await supabase.from('activity_log').insert({
        id: crypto.randomUUID(),
        user_id: (await supabase.from('tasks').select('user_id').eq('id', task.id).single()).data?.user_id,
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
    .eq('status', 'todo')
    .lt('due_at', new Date().toISOString())
  if (!overdue || overdue.length === 0) return null
  return { title: 'Overdue', body: `${overdue.length} task(s) overdue` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { kind } = (await req.json()) as { kind: NotifyKind }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const payload = await buildPayload(supabase, kind)
    if (!payload) {
      return new Response(JSON.stringify({ sent: 0, pruned: 0, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS_JSON), { extractable: false })
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: CONTACT_EMAIL,
      vapidKeys,
    })

    const { data: subs } = await supabase.from('push_subscriptions').select('*')

    let sent = 0
    let pruned = 0
    for (const sub of subs ?? []) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint as string,
          keys: sub.keys as Record<string, string>,
        })
        await subscriber.pushTextMessage(JSON.stringify(payload), {})
        sent++
      } catch (e) {
        const status = (e as { status?: number })?.status
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id as string)
          pruned++
        }
      }
    }

    return new Response(JSON.stringify({ sent, pruned }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
