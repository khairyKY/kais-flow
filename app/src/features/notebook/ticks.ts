// "Bring back your ticks" (Paper Capture.dc.html 11l): a photo of a finished Notebook page, read by
// capture-image (each line's `checked`: a ticked box, an empty one, or none), matched back to the tasks
// that page listed. The pure half — a forgiving title match (handwriting abbreviates and misspells), one
// line per task, and which lines are new scribbles rather than the page's own print. ticks.test.ts.

export interface TickLine {
  /** The capture line's key, `${page}:${index}` (paper/paperMath toEditLine). */
  key: string
  text: string
  /** true = a ticked/crossed box, false = an empty box, null = no box (or not reported). */
  checked: boolean | null
}

export interface TickMatch<T> {
  line: TickLine
  task: T
  score: number
}

export interface TickResult<T> {
  /** Ticked on paper, matched to a page task: offered as "mark done". */
  ticked: TickMatch<T>[]
  /** Matched, but left unticked on paper. */
  open: TickMatch<T>[]
  /** Neither a task nor the page's own print: new scribbles, proposed like any capture. */
  fresh: TickLine[]
}

/** The words of a title or a handwritten line: lower case, no box or star glyphs, no punctuation,
 * possessives folded ("lecture 2’s" → "lecture 2"). */
export function words(s: string): string[] {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

/** 0–1: the words two lines share, over the longer of the two. */
export function wordScore(a: string, b: string): number {
  const wa = new Set(words(a))
  const wb = new Set(words(b))
  if (!wa.size || !wb.size) return 0
  return [...wa].filter((w) => wb.has(w)).length / Math.max(wa.size, wb.size)
}

/** 0–1: the letter pairs two lines share (Dice), spaces ignored — forgives a misspelt word, and a
 * line that is a shortened title. */
function letterScore(a: string, b: string): number {
  const ga = bigrams(words(a).join(''))
  const gb = bigrams(words(b).join(''))
  let common = 0
  let total = 0
  for (const [g, c] of ga) common += Math.min(c, gb.get(g) ?? 0)
  for (const c of ga.values()) total += c
  for (const c of gb.values()) total += c
  return total ? (2 * common) / total : 0
}

/** How alike a handwritten line and a task title are, 0–1: the better of the two scores. */
export function similarity(a: string, b: string): number {
  return Math.max(wordScore(a, b), letterScore(a, b))
}

export const MATCH_AT = 0.6

/** Each page task gets at most one line and each line at most one task, best pairs first. `printed`
 * is the rest of the page's own text (headings, habits, the plan, the night lines): a line with the
 * same words isn't new. Words only there — "+ what happened: met Omar" is something written, not print. */
export function matchTicks<T extends { id: string; title: string }>(lines: readonly TickLine[], tasks: readonly T[], printed: readonly string[] = [], min = MATCH_AT): TickResult<T> {
  const pairs: TickMatch<T>[] = []
  for (const line of lines) for (const task of tasks) {
    const score = similarity(line.text, task.title)
    if (score >= min) pairs.push({ line, task, score })
  }
  pairs.sort((x, y) => y.score - x.score)
  const usedLines = new Set<string>()
  const usedTasks = new Set<string>()
  const matched: TickMatch<T>[] = []
  for (const p of pairs) {
    if (usedLines.has(p.line.key) || usedTasks.has(p.task.id)) continue
    usedLines.add(p.line.key)
    usedTasks.add(p.task.id)
    matched.push(p)
  }
  const inOrder = (ms: TickMatch<T>[]) => ms.sort((x, y) => lines.indexOf(x.line) - lines.indexOf(y.line))
  return {
    ticked: inOrder(matched.filter((m) => m.line.checked === true)),
    open: inOrder(matched.filter((m) => m.line.checked !== true)),
    fresh: lines.filter((l) => !usedLines.has(l.key) && !printed.some((p) => wordScore(l.text, p) >= min)),
  }
}
