// The ticks made on the home screen, as the Android shell queues them (widgets/Snap.java tick):
// pure, so the order and the rules are tested without the app's stores (./bridge applies them).

export interface WidgetOp {
  t: 'task' | 'routine' | 'focus-stop' | 'focus-done'
  id: string
  at: number
}

export function parseQueue(raw: string | null | undefined): WidgetOp[] {
  try {
    const ops = JSON.parse(raw ?? '[]') as unknown
    return Array.isArray(ops) ? ops.filter((o): o is WidgetOp => !!o && typeof o === 'object' && typeof (o as WidgetOp).t === 'string') : []
  } catch {
    return []
  }
}

export interface OpWrites {
  completeTasks(ids: string[]): void
  checkRoutine(id: string, at: Date): void
  stopFocus(): void
}

/** Applies the queued ticks in order: tasks done, routines checked (never unchecked — a tick on the
 * home screen only ever checks), the focus round stopped or finished. */
export function applyOps(ops: readonly WidgetOp[], w: OpWrites): void {
  for (const op of ops) {
    if (op.t === 'task' && op.id) w.completeTasks([op.id])
    else if (op.t === 'routine' && op.id) w.checkRoutine(op.id, new Date(op.at || Date.now()))
    else if (op.t === 'focus-stop') w.stopFocus()
    else if (op.t === 'focus-done') {
      w.stopFocus()
      if (op.id && op.id !== 'round') w.completeTasks([op.id])
    }
  }
}

