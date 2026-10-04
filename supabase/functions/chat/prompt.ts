// The chat's system prompt, kept pure so the app's vitest suite can test it (no Deno APIs here).
// 2026-10-04 (a friend's feedback): chat answered "That's not in your data" to almost everything —
// it only saw a text search of the question, so "what's on today?", "how do I…?" and a new account's
// questions all fell through. Now it also gets a live snapshot of today and a short guide to the app,
// may reason over the user's data (never invent it), and replies in the user's language.

export interface SnapshotTask { title: string; due_at: string | null; scheduled_start: string | null; top3: boolean }
export interface SnapshotEvent { title: string; starts_at: string; ends_at: string | null; all_day?: boolean | null }
export interface Hit { entity_type: string; title: string; snippet?: string | null }
export interface Slip { entity_name: string; days_since: number }

/** Wall-clock parts of `d` in `tz`. */
function parts(d: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute }
}

/** The instant `tz`'s calendar day containing `now` (+ `addDays`) starts. One place to swap the zone
 * when per-user time zones land. */
export function dayStart(now: Date, tz = 'Africa/Cairo', addDays = 0): Date {
  const { y, m, d } = parts(now, tz)
  const guess = Date.UTC(y, m - 1, d + addDays)
  const w = parts(new Date(guess), tz)
  const offset = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) - guess // the zone's offset at that instant
  return new Date(guess - offset)
}

const clock = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

/** "Today" for the model: timed items first, then overdue, Top 3 marked. */
export function snapshotText(now: Date, tasks: SnapshotTask[], events: SnapshotEvent[], inboxPending: number, tz = 'Africa/Cairo'): string {
  const today = dayStart(now, tz).getTime()
  const tomorrow = dayStart(now, tz, 1).getTime()
  const at = (t: SnapshotTask) => t.scheduled_start ?? t.due_at
  const inDay = (iso: string | null, from: number, to: number) => !!iso && Date.parse(iso) >= from && Date.parse(iso) < to
  const line = (t: SnapshotTask) => `- ${t.top3 ? '★ ' : ''}${t.title}${at(t) ? ` (${clock(at(t)!, tz)})` : ''}`
  const todays = tasks.filter((t) => inDay(at(t), today, tomorrow))
  const overdue = tasks.filter((t) => t.due_at && Date.parse(t.due_at) < today)
  const tomorrows = tasks.filter((t) => inDay(at(t), tomorrow, tomorrow + 86_400_000))
  const ev = (from: number, to: number) =>
    events.filter((e) => inDay(e.starts_at, from, to)).map((e) => `- ${e.all_day ? 'all day' : clock(e.starts_at, tz)} ${e.title}`)
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  return [
    `Now: ${date} (${tz}).`,
    `Today's tasks:\n${todays.map(line).join('\n') || '(none)'}`,
    `Overdue:\n${overdue.map(line).join('\n') || '(none)'}`,
    `Today's calendar:\n${ev(today, tomorrow).join('\n') || '(nothing)'}`,
    `Tomorrow:\n${[...tomorrows.map(line), ...ev(tomorrow, tomorrow + 86_400_000)].join('\n') || '(nothing yet)'}`,
    `Inbox: ${inboxPending} waiting to be sorted.`,
  ].join('\n\n')
}

export const APP_GUIDE = `How Kai's Flow works (answer "how do I…" questions from this; keep it short):
- Capture: tap the centre button (phone) or ⌘/Ctrl+K (desktop) to type; hold the centre button to talk. Things land in the Inbox, or straight in Tasks when they have a date. Share from any app (Android share sheet), or send with a capture link (Settings → Capture: iOS Shortcuts, Tasker, a bookmarklet).
- Today: the date, your Top 3 (★ — the first is the goal of the day), Up next from your calendar, routines for this part of the day, and a "More for today" fold.
- Plan my day (morning): carry over yesterday, pick your 3 (search any task), accept suggested times, Start the day puts them on the calendar. Shut down (evening): sweep what's left, roll to tomorrow, pick tomorrow's 3, one line for the journal.
- Task rows: tap opens, the circle completes (Undo), swipe right = Tomorrow 09:00, swipe left = Trash (Undo), hold = select several, ⋯ = every action.
- Calendar: your own calendar (Google Calendar sync is coming). Tap a gap to create, hold a block to move it, drag its handles to resize (15-minute steps); tap a task block to open the task.
- Routines: repeat on chosen days, streaks and streak goals. Projects and areas, People (birthdays), Journal, the Herbarium (finished projects are pressed there), Focus timer.
- Settings: theme and interface size, default calendar view, reminders (morning digest, evening nudge), integrations (GitHub issues → Inbox), import (Akiflow, Todoist, TickTick, Notion, Obsidian, Kindle, Goodreads), Check for updates.`

/** The whole system prompt. */
export function systemPrompt(o: { now: Date; hits: Hit[]; top3: { title: string }[]; slipping: Slip[]; snapshot: string }): string {
  const items = o.hits.map((h) => `- [${h.entity_type}] ${h.title}${h.snippet ? `: ${h.snippet}` : ''}`.slice(0, 260)).join('\n')
  const slipping = o.slipping.slice(0, 5).map((s) => `${s.entity_name} (${Math.floor(s.days_since)}d)`).join(', ') || 'none'
  return `You are the assistant inside Kai's Flow, a calm personal planner. Help the user with their own tasks, plans, notes and calendar, and with using the app.
Rules:
- Use the user's data below. Cite the titles of items you rely on.
- You may reason and suggest from that data (e.g. how to order today, what to drop, what's at risk).
- Never invent tasks, events, dates, people or facts that aren't in the data. If something specific isn't there, say so in one line and suggest how to add it.
- For questions about how to use the app, answer from the App guide.
- Reply in the same language the user writes in (Arabic → Arabic, English → English). Keep it short and warm.

${o.snapshot}

Top 3 today: ${o.top3.map((t) => t.title).join(', ') || 'none'}
Slipping (untouched for a while): ${slipping}

Items matching the question:
${items || '(none found)'}

${APP_GUIDE}`
}
