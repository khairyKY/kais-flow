// Paper capture: the pure half of `capture-image` — the prompt, the answer → proposed lines, the
// retry schedule, and what a capture's status becomes after a page. No Deno APIs, so
// app/src/features/paper/read.test.ts runs it under the app's vitest (the notify/ritual.ts pattern).

export const LINE_TYPES = ['task', 'event', 'note', 'journal'] as const
export type LineType = (typeof LINE_TYPES)[number]

/** One proposed item, as stored in `captures.items` and read by the app's results sheet. */
export interface PageLine {
  text: string
  type: LineType
  /** The date/time words in English with ASCII digits ("Thu 11:59pm", "today 17:00"), or null.
   * The app turns them into a date with its own capture parser (command-bar/parseCommand). */
  when: string | null
  /** The project or course the line seems to belong to, as written ("OS"), or null. */
  project: string | null
  confidence: number
  /** Where the handwriting sits: [x, y, w, h], 0–1 of the stored image. Null if the model gave none. */
  box: [number, number, number, number] | null
  page: number
}

export interface PageRead {
  readable: boolean
  title: string | null
  lines: PageLine[]
}

export const MAX_PAGES = 5
const MAX_LINES = 40

/** The system prompt for one page. `projects` are the user's project names, so a guess can match one. */
export function buildPrompt(projects: readonly string[]): string {
  const known = projects.length ? projects.slice(0, 60).map((p) => `- ${p}`).join('\n') : '(none)'
  return `You read a photo of one handwritten page (lecture or meeting notes, a to-do list, a journal page) for a personal task app. Turn every meaningful line into a proposed item.

The user's projects:
${known}

Rules:
- One item per line or bullet. Join a line that wraps onto the next. Skip doodles, diagrams, arrows between boxes, page numbers and crossed-out text.
- Pages can be in English, Arabic, or both. Keep each item's text in the language and script it was written in. Never translate. Fix obvious spelling only.
- type: "task" (something to do), "event" (something at a date/time: a meeting, quiz, exam, appointment), "journal" (a feeling or reflection about the day), else "note" (an idea, a heading, a fact).
- when: the date/time words for that item rewritten in English with ASCII digits ("Thu 11:59pm", "next Sunday", "today 17:00"), or null. Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) are ordinary digits. A bare hour for a meeting is in the afternoon if that is more likely ("الساعة ٥" → "today 17:00").
- project: the course, project or person-group the item belongs to — prefer a name from the list above when one fits, else what the page calls it, else null.
- confidence: 0 to 1, how sure you are that you read the handwriting right. Be honest: messy or half-guessed words get 0.6 or less.
- box: where the item's handwriting is, as [x1, y1, x2, y2] on a 0–1000 grid of the image (top-left to bottom-right).
- title: the page's heading if it has one (e.g. "OS lecture 3 — 4 Oct"), else null.
- readable: false if the photo is blank, too blurry, or not handwriting at all.

Answer with ONLY a JSON object: {"readable": true, "title": string|null, "lines": [{"text": string, "type": string, "when": string|null, "project": string|null, "confidence": number, "box": [number, number, number, number]}]}`
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** The model's box → [x, y, w, h] in 0–1. Asked for [x1, y1, x2, y2] on a 0–1000 grid; values that
 * are all ≤ 1 are taken as already normalised. Anything malformed or empty is null (no crop). */
export function normaliseBox(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const scale = raw.some((n) => n > 1.5) ? 1000 : 1
  const [x1, y1, x2, y2] = (raw as number[]).map((n) => clamp01(n / scale))
  if (x2 - x1 < 0.005 || y2 - y1 < 0.003) return null
  const r = (n: number) => Math.round(n * 10000) / 10000
  return [r(x1), r(y1), r(x2 - x1), r(y2 - y1)]
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

/** Whatever JSON the model sent → a page read we can store. Never throws. */
export function normaliseRead(raw: unknown, page: number): PageRead {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(o.lines) ? o.lines : Array.isArray(o.items) ? o.items : []
  const lines: PageLine[] = []
  for (const item of list.slice(0, MAX_LINES)) {
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    const text = str(it.text, 500)
    if (!text) continue
    const type = LINE_TYPES.includes(it.type as LineType) ? (it.type as LineType) : 'note'
    const confidence = typeof it.confidence === 'number' && Number.isFinite(it.confidence) ? clamp01(it.confidence) : 0.5
    lines.push({ text, type, when: str(it.when, 80), project: str(it.project, 80), confidence, box: normaliseBox(it.box), page })
  }
  return { readable: o.readable !== false && lines.length > 0, title: str(o.title, 120), lines }
}

/** How long to wait before retry `attempt` (1-based) after a 429: Groq's retry-after when it gives
 * one, else 2s, 4s…; never more than 20s (the function has a wall clock). Null = stop retrying. */
export function retryDelayMs(attempt: number, retryAfter: string | null, maxAttempts = 3): number | null {
  if (attempt >= maxAttempts) return null
  const s = retryAfter !== null && /^\d+(\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) : 2 ** attempt
  return Math.min(20_000, Math.max(500, Math.round(s * 1000)))
}

export type CaptureStatus = 'queued' | 'reading' | 'done' | 'failed'

/** The row after page `page` was read: its items replace that page's old ones (a re-read is
 * idempotent), and once every page is in, an empty batch is "couldn't read". */
export function afterPage(
  row: { pages: number; pages_read: number; items: PageLine[] },
  page: number,
  read: PageRead,
): { items: PageLine[]; pages_read: number; status: CaptureStatus; error: 'unreadable' | null } {
  const items = [...row.items.filter((i) => i.page !== page), ...read.lines].sort((a, b) => a.page - b.page)
  const pages_read = Math.max(row.pages_read, page + 1)
  if (pages_read < row.pages) return { items, pages_read, status: 'reading', error: null }
  return items.length ? { items, pages_read, status: 'done', error: null } : { items, pages_read, status: 'failed', error: 'unreadable' }
}

/** A storage path the caller may hand us: its own folder, this capture, page n, an image. */
export function ownsPath(path: string, userId: string, captureId: string): boolean {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${esc(userId)}/${esc(captureId)}/\\d\\.(jpg|webp|png)$`).test(path)
}
