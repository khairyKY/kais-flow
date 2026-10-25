// The chat's system prompt, kept pure so the app's vitest suite can test it (no Deno APIs here).
// 2026-10-04 (a friend's feedback): chat answered "That's not in your data" to almost everything —
// it only saw a text search of the question, so "what's on today?", "how do I…?" and a new account's
// questions all fell through. Now it also gets a live snapshot of today and a short guide to the app,
// may reason over the user's data (never invent it), and replies in the user's language.
// 2026-10-25 (queue item 5, "the AI chat sucks and doesn't work"): it acts — through `propose`, which
// the user confirms (./plan.ts) — knows how the app is built (Top 3, blocks vs events, slots, rituals),
// reads days from a table instead of counting them, writes the user's own clock, and keeps it short.

import { addDays as plusDays, dateKey, DEFAULT_ZONE, wallToInstant } from '../_shared/zone.ts'
import { dayTable } from './when.ts'
import type { Refs } from './plan.ts'

/** `top3`: one of today's picks by the Top 3 rule (chat/index.ts decides it with _shared/today.ts). */
export interface SnapshotTask { id?: string; title: string; due_at: string | null; scheduled_start: string | null; top3: boolean }
export interface SnapshotEvent { id?: string; seriesId?: string; title: string; starts_at: string; ends_at: string | null; all_day?: boolean | null }
export interface SnapshotInbox { id: string; raw_text: string }
export interface Hit { entity_type: string; title: string; snippet?: string | null }
export interface Slip { entity_name: string; days_since: number }

/** The instant `tz`'s calendar day containing `now` (+ `addDays`) starts — _shared/zone.ts's day math,
 * so a DST-change day is 23 or 25 hours. chat passes the user's own zone (app_settings.timezone). */
export function dayStart(now: Date, tz = DEFAULT_ZONE, addDays = 0): Date {
  return wallToInstant(plusDays(dateKey(now, tz), addDays), 0, 0, tz)
}

/** A time on the user's clock: "13:00", or "1:00 PM" on the 12-hour clock (the app's lib/clock rule). */
const clock = (iso: string, tz: string, h24: boolean) => {
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  if (h24) return hm
  const h = Number(hm.slice(0, 2))
  return `${h % 12 || 12}:${hm.slice(3)} ${h < 12 ? 'AM' : 'PM'}`
}

export interface SnapshotOptions {
  /** The 24-hour clock (default) or the 12-hour one — the device's own setting, sent by the app. */
  h24?: boolean
  /** The oldest few Inbox captures, to file by ref. */
  inbox?: readonly SnapshotInbox[]
  /** Filled with the short refs the lines carry ([t1], [e1], [i1]) → ids, when given. */
  refs?: Refs
}

/** "Today" for the model: timed items first, then overdue, Top 3 marked; each with a ref when asked. */
export function snapshotText(now: Date, tasks: SnapshotTask[], events: SnapshotEvent[], inboxPending: number, tz = DEFAULT_ZONE, o: SnapshotOptions = {}): string {
  const h24 = o.h24 ?? true
  const today = dayStart(now, tz).getTime()
  const tomorrow = dayStart(now, tz, 1).getTime()
  const dayAfter = dayStart(now, tz, 2).getTime()
  const counts = { t: 0, e: 0, i: 0 }
  const ref = (kind: 't' | 'e' | 'i', id: string | undefined, type: Refs[string]['type']) => {
    if (!o.refs || !id) return ''
    const key = `${kind}${++counts[kind]}`
    o.refs[key] = { id, type }
    return ` [${key}]`
  }
  const at = (t: SnapshotTask) => t.scheduled_start ?? t.due_at
  const inDay = (iso: string | null, from: number, to: number) => !!iso && Date.parse(iso) >= from && Date.parse(iso) < to
  const line = (t: SnapshotTask) => `- ${t.top3 ? '★ ' : ''}${t.title}${at(t) ? ` (${clock(at(t)!, tz, h24)})` : ''}${ref('t', t.id, 'task')}`
  const todays = tasks.filter((t) => inDay(at(t), today, tomorrow))
  const overdue = tasks.filter((t) => t.due_at && Date.parse(t.due_at) < today)
  const tomorrows = tasks.filter((t) => inDay(at(t), tomorrow, dayAfter))
  const ev = (from: number, to: number) =>
    events
      .filter((e) => inDay(e.starts_at, from, to))
      .map((e) => `- ${e.all_day ? 'all day' : `${clock(e.starts_at, tz, h24)}${e.ends_at ? `–${clock(e.ends_at, tz, h24)}` : ''}`} ${e.title}${ref('e', e.seriesId ?? e.id, 'calendar_event')}`)
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  const inbox = (o.inbox ?? []).map((i) => `- ${i.raw_text.replace(/\s+/g, ' ').slice(0, 80)}${ref('i', i.id, 'inbox_item')}`)
  return [
    `Now: ${date}, ${clock(now.toISOString(), tz, h24)} (${tz}).`,
    `Today's tasks:\n${todays.map(line).join('\n') || '(none)'}`,
    `Overdue:\n${overdue.map(line).join('\n') || '(none)'}`,
    `Today's calendar:\n${ev(today, tomorrow).join('\n') || '(nothing)'}`,
    `Tomorrow:\n${[...tomorrows.map(line), ...ev(tomorrow, dayAfter)].join('\n') || '(nothing yet)'}`,
    `Inbox: ${inboxPending} waiting to be sorted.${inbox.length ? `\n${inbox.join('\n')}` : ''}`,
  ].join('\n\n')
}

export const APP_GUIDE = `How Kai's Flow works (answer "how do I…" questions from this; keep it short):
- Capture: tap the centre button (phone) or ⌘/Ctrl+K (desktop) to type; hold the centre button to talk. Things land in the Inbox, or straight in Tasks when they have a date. Share from any app (Android share sheet), or send with a capture link (Settings → Advanced: iOS Shortcuts, Tasker, a bookmarklet).
- Today: the date, your Top 3 (★ — the first is the goal of the day), Up next from your calendar, routines for this part of the day, and a "More for today" fold.
- Plan my day (morning): carry over yesterday, pick your 3 (search any task), accept suggested times, Start the day puts them on the calendar. Shut down (evening): sweep what's left, roll to tomorrow, pick tomorrow's 3, one line for the journal.
- Task rows: tap opens, the circle completes (Undo), swipe right = Tomorrow 09:00, swipe left = Trash (Undo), hold = select several, ⋯ = every action.
- Calendar: your own calendar (Google Calendar can sync quietly in the background). Tap a gap to create, hold a block to move it, drag its handles to resize (15-minute steps); tap a task block to open the task.
- Routines: repeat on chosen days, streaks and streak goals. Projects and areas, People (birthdays), Journal, the Herbarium (finished projects are pressed there), Focus timer.
- Settings: theme and interface size, default calendar view, reminders (morning digest, evening nudge), capture and AI (file captures for you, pick a project for new things), integrations (GitHub issues → Inbox), import (Akiflow, Todoist, TickTick, Notion, Obsidian, Kindle, Goodreads), Check for updates.`

/** The whole system prompt. `action`: the message asks for a change — no search hits or app guide (fewer
 * tokens; Groq's free plan allows 8K a minute). */
export function systemPrompt(o: { now: Date; hits: Hit[]; top3: { title: string }[]; slipping: Slip[]; snapshot: string; tz?: string; h24?: boolean; action?: boolean }): string {
  const tz = o.tz ?? DEFAULT_ZONE
  const items = o.hits.map((h) => `- [${h.entity_type}] ${h.title}${h.snippet ? `: ${h.snippet}` : ''}`.slice(0, 160)).join('\n')
  const slipping = o.slipping.slice(0, 5).map((s) => `${s.entity_name} (${Math.floor(s.days_since)}d)`).join(', ') || 'none'
  const timeStyle = o.h24 === false ? '7:00 AM, 5:45 PM (12-hour)' : '07:00, 17:45 (24-hour)'
  return `You are the assistant inside Kai's Flow, a calm personal planner. You help its owner with their own tasks, calendar and day, and you can change them for them.

How the app is built:
- Top 3: today's three picks (★); the first is the goal of the day.
- A task has a due day, maybe a time. A task with a time also gets a block on the calendar for that time.
- Events (a meeting, the gym, an appointment) live on the calendar and aren't tasks. Today shows them under Up next.
- Time blocks are time set aside for a kind of work; tasks can be dropped into one (a slot).
- Rituals: Plan my day in the morning, Shut down in the evening. The Inbox holds captures to sort.

Acting:
- To change anything, call propose with every step for the request in ONE call. Nothing changes until the user taps Confirm on the card the app shows, and the app reports what really happened — so never say you did it.
- In "when", copy the user's own words for each item's day and time ("Mon 7:00–8:15", "Wed 5:45–7:00 PM"). Keep each item's day, time and details exactly as written; never swap or merge items.
- Existing items: use the refs in the lists below ([t2], [e1], [i3]); otherwise find them first with search, calendar or list_tasks.
- If something is unclear (which task? what time?), ask one short question instead of guessing.

Answering:
- Short, warm, specific: one to three sentences, or a short list. Plain text or a simple list — no tables, no headings.
- Use the data below. Never invent tasks, events, dates, people or facts; if something isn't there, say so in a line and offer to add it.
- Write times as ${timeStyle}. Reply in the user's language (Arabic → Arabic).

Days: ${dayTable(o.now, tz)}

${o.snapshot}

Top 3 today (the first is the goal of the day): ${o.top3.map((t) => t.title).join(', ') || 'none'}
Slipping (untouched for a while): ${slipping}${o.action ? '' : `

Items matching the question:
${items || '(none found)'}

${APP_GUIDE}`}`
}
