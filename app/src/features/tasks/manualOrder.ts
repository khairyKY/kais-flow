// Manual order (p7e parity audit A22, Akiflow's "Move task up/down"): ⌘/Ctrl+↑/↓ moves a task, or
// the selection, one place within its group on Tasks, Today and a project or area page. The place is
// tasks.sort_order (0076), on the same scale as the date the lists already sorted by, so a row nobody
// moved (null) keeps its date order and a move writes only the moved row: the midpoint between its
// new neighbours. Rows tied on one date have no room between them; the first move among them gives
// the tied run its own keys (the shorter side, up to a distinct key or the group's edge).

interface OrderRow {
  id: string
  sort_order?: number | null
  due_at: string | null
  scheduled_start: string | null
}

/** An undated row's date key — groupTasks' old "no date sorts last". */
const UNDATED = 8.64e15
/** The gap a key opens next to one bound: a minute, in the date keys' unit (ms). */
const STEP = 60_000

/** A row's place: its manual order, else its date (due, else its block), else last. */
export function orderKey(t: OrderRow): number {
  if (t.sort_order != null && Number.isFinite(t.sort_order)) return t.sort_order
  const iso = t.due_at ?? t.scheduled_start
  const ms = iso ? new Date(iso).getTime() : NaN
  return Number.isFinite(ms) ? ms : UNDATED
}

/** `rows` in list order — stable, so rows on one key keep the order they came in. */
export function sortByOrder<T extends OrderRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => orderKey(a) - orderKey(b))
}

/** `m` keys strictly between `lo` and `hi` (either may be infinite), or null when there's no room. */
function spread(lo: number, hi: number, m: number): number[] | null {
  const at = (i: number) =>
    lo === -Infinity ? (hi === Infinity ? i * STEP : hi - (m - i) * STEP) : hi === Infinity ? lo + (i + 1) * STEP : lo + ((hi - lo) * (i + 1)) / (m + 1)
  const keys = Array.from({ length: m }, (_, i) => at(i))
  return [lo, ...keys, hi].every((k, i, all) => i === 0 || all[i - 1] < k) ? keys : null
}

/** ⌘↑ (`dir` -1) / ⌘↓ (+1): the rows in `ids` one place up or down in `group` (its rows as drawn,
 * in orderKey order). A block of selected rows moves together; one at the edge stays, and so does
 * the block behind it. Returns the keys to write (only rows whose key changes), or null when
 * nothing can move. */
export function planListMove<R extends OrderRow>(group: readonly R[], ids: ReadonlySet<string>, dir: -1 | 1): { row: R; sort_order: number }[] | null {
  const next = [...group]
  const idx = [...next.keys()]
  for (const i of dir < 0 ? idx : idx.reverse()) {
    const j = i + dir
    if (j < 0 || j >= next.length || !ids.has(next[i].id) || ids.has(next[j].id)) continue
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  if (next.every((r, i) => r === group[i])) return null
  const key = next.map(orderKey)
  const n = next.length
  const moved = next.map((r, i) => ids.has(r.id) && r !== group[i])
  const out = new Map<number, number>()
  const fits = (a: number, b: number) => spread(a > 0 ? key[a - 1] : -Infinity, b < n - 1 ? key[b + 1] : Infinity, b - a + 1)
  for (let i = 0; i < n; i++) {
    if (!moved[i]) continue
    let b = i
    while (b + 1 < n && moved[b + 1]) b++
    // Widen the run until its new keys fit, toward whichever side frees up first.
    let a = i
    let keys = fits(a, b)
    for (let s = 1; !keys && s <= n; s++) {
      if (a - s >= 0 && (keys = fits(a - s, b))) a -= s
      else if (b + s < n && (keys = fits(a, b + s))) b += s
    }
    if (!keys) [a, b, keys] = [0, n - 1, spread(-Infinity, Infinity, n)!] // backstop: the whole group
    keys.forEach((k, o) => {
      key[a + o] = k
      out.set(a + o, k)
    })
    i = b
  }
  return [...out].flatMap(([i, k]) => (next[i].sort_order === k ? [] : [{ row: next[i], sort_order: k }]))
}
