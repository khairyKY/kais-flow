// motion-cal (2026-10-28): what the desktop grid and the phone grid both need to know to move a block right.

/** CAL10: a block that arrives just after a calendar write made here is the person's own (a create, a copy, a
 * restore, an occurrence moved on its own) — it wears the just-landed ring. One that arrives any other way
 * (Google sync, another device, a cold load) lands quietly. ./api's writeEvent notes every write. */
let lastWrite = 0
export const noteLocalWrite = (): void => {
  lastWrite = Date.now()
}
// ponytail: a time window, not a list of ids — an occurrence restored comes back under an id no write named.
export const ownArrival = (): boolean => Date.now() - lastWrite < 1500

/** CAL4: a block's box ticked here plays its tick once, when the done state paints — never a box that
 * arrives ticked (a sync, a re-render, a day paged in). Kept a while: a repeating task's round asks first. */
const ticked = new Map<string, number>()
export function markTicked(taskId: string): void {
  ticked.set(taskId, Date.now() + 8000)
}
export function takeTicked(taskId: string): boolean {
  const until = ticked.get(taskId)
  if (until === undefined) return false
  ticked.delete(taskId)
  return until > Date.now()
}

/** The app's --ease-out for the Web Animations calls (they can't read a custom property). */
export const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
