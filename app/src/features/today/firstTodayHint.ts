// First Run 9i (design-export/First Run.dc.html): on a brand-new account's first Today, one Caveat
// line under the next-move card — "↑ this card always shows your next move" — gone after the first
// tap anywhere. Finishing onboarding (Start, Skip or Import, not a Replant) leaves the flag for that
// account on this device; Today shows the line while it's there and clears it on that first tap.

export const FIRST_TODAY_HINT = '↑ this card always shows your next move'

const key = (uid: string) => `kf-first-today-hint:${uid}`

export function markFirstTodayHint(uid: string | undefined): void {
  if (!uid) return
  try {
    localStorage.setItem(key(uid), '1')
  } catch {
    // Storage blocked (private window): no hint, nothing else depends on it.
  }
}

export function firstTodayHintPending(uid: string | undefined): boolean {
  if (!uid) return false
  try {
    return localStorage.getItem(key(uid)) === '1'
  } catch {
    return false
  }
}

export function clearFirstTodayHint(uid: string | undefined): void {
  if (!uid) return
  try {
    localStorage.removeItem(key(uid))
  } catch {
    // Storage blocked: it was never shown either.
  }
}
