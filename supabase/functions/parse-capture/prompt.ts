// The parse-capture system prompt, kept pure (no Deno APIs) so the app's vitest suite can test it
// (app/src/features/capture/parsePrompt.test.ts).
// Kai 2026-10-07: "When they capture something, every property is extracted — date, time, priority,
// description — like Akiflow. I don't want my user to type !!! for priority or // for a description.
// Let the AI understand the intent and decide." The app still reads !, 30m, #tag and *label itself
// as power-user overrides; this prompt reads the plain words.
import { userZone, wallClock } from '../_shared/zone.ts'

export interface PromptContext {
  domains: { id: string; name: string }[]
  projects: { id: string; name: string; domain_id: string | null }[]
  /** When the words were said (an ISO instant; a queued capture parses later). */
  today: string
  /** The user's app_settings.timezone, sent by the app. */
  timezone: string
}

/** The user's "now" on their own clock, so "tomorrow 3pm" is their tomorrow at 15:00 there. */
export function nowLine(ctx: PromptContext): string {
  const said = new Date(ctx.today)
  const at = Number.isNaN(said.getTime()) ? new Date() : said
  return `Now, on the user's clock: ${wallClock(at, ctx.timezone)}. Read every date and time in the capture on that clock (in ${userZone(ctx.timezone)}), then give due_at in UTC.`
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const domainList = ctx.domains.map((d) => `- ${d.id}: ${d.name}`).join('\n') || '(none yet)'
  const projectList =
    ctx.projects
      .map((p) => `- ${p.id}: ${p.name} (domain: ${p.domain_id ?? 'none'})`)
      .join('\n') || '(none yet)'

  return `You parse a short capture (voice or text) from a personal task/life-management app into structured JSON. Extract every property the words carry; the user never types symbols for them.

${nowLine(ctx)}

Known domains:
${domainList}

Known projects:
${projectList}

Rules:
- Strip filler words ("um", "uh", "like"), rewrite the text tersely and cleanly into "cleaned_text".
- title: a short, clean, actionable title — what to do. Leave out the words you turn into the fields below (dates, times, urgency, durations, reminders, #tags) and any detail that belongs in description.
- description: details beyond the title — context, who/why, links, sub-points — as plain text. null when the capture is only the title. Never repeat the title or the other fields.
- kind is one of: task, event, routine_idea, note, unknown.
- priority: 1, 2, 3 or null, inferred from the wording (1 = most urgent). 1 = critical, urgent, ASAP, emergency, "must do today". 2 = important, high priority, "soon". 3 = low priority, whenever, no rush, "if I get time". null when nothing in the wording says how much it matters. A literal "!!!" means 1, "!!" means 2, "!" means 3.
- duration_min: how long it takes, in minutes, when said or clearly implied ("an hour" = 60, "half an hour" = 30, "quick 15 min call" = 15, "30m" = 30), else null.
- due_at: an ISO 8601 datetime in UTC if a date/time is mentioned, else null.
- has_time: true when a clock time was said or clearly meant ("4am", "15:00", "noon", "at 3", "in 2 hours"); false for a date alone ("tomorrow", "friday", "next week"); null when there is no due_at. A timed task goes on the user's calendar, so never invent a time.
- reminder_offset_min: if the user says something like "remind me 10 min before", output the number of minutes (e.g. 10). Prefer null over guessing — only set this if the user explicitly mentions a reminder time offset. Leave null if no reminder is mentioned.
- domain_id/project_id: ONLY set these to an id from the lists above if you are genuinely confident it belongs there ("#name" in the text names one). Prefer null over guessing.
- confidence (0 to 1): your honest confidence that kind + domain_id/project_id are correct. If unsure of placement, LOWER your confidence — the user strongly prefers triaging an item in their inbox over finding something misfiled later. Do not inflate confidence to seem helpful.
- Respond with ONLY a JSON object with exactly these keys: kind, cleaned_text, title, description, domain_id, project_id, due_at, has_time, duration_min, priority, reminder_offset_min, confidence. Use null for unknown/inapplicable optional fields.`
}
