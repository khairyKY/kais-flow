// The tape behind redo. Every undo function already writes through writeRow; while one runs, writeRow
// notes what each row looked like just before, so the same undo can be played backwards (redo) — and
// forwards again — without any caller writing a second function. Leaf file: no app imports.

export interface Inverse {
  table: string
  row: { id: string }
  op: 'upsert' | 'delete'
}

let tape: Inverse[] | null = null
let writer: ((table: string, row: { id: string }, op: 'upsert' | 'delete') => void) | null = null

/** lib/outbox registers its writeRow here at load, so replaying never imports the outbox. */
export function registerWriter(w: typeof writer): void {
  writer = w
}

/** writeRow calls this before it touches the cache. `prior` is the row as cached then (undefined: none). */
export function noteWrite(table: string, row: { id: string }, op: 'upsert' | 'delete', prior: { id: string } | undefined): void {
  if (!tape) return
  if (prior) tape.push({ table, row: prior, op: 'upsert' })
  else if (op === 'upsert') tape.push({ table, row, op: 'delete' })
}

/** Runs `fn` (sync or async) and returns how to take back every write it made. Not re-entrant: a nested
 * call just runs `fn` and records into the outer tape. */
export async function recordWrites(fn: () => void | Promise<void>): Promise<Inverse[]> {
  if (tape) {
    await fn()
    return []
  }
  const mine: Inverse[] = (tape = [])
  try {
    await fn()
  } finally {
    tape = null
  }
  return mine
}

/** The plain function that plays `inverse` back, newest write first. */
export function replayer(inverse: Inverse[]): () => void {
  const steps = [...inverse].reverse()
  return () => steps.forEach((s) => writer?.(s.table, s.row, s.op))
}
