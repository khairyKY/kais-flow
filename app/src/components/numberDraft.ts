// The rules of NumberField (./NumberField.tsx), pure so they're tested (numberDraft.test.ts).

export interface NumberBounds {
  min: number
  max: number
}

/** What a keystroke leaves in the field: digits only, and empty is allowed while typing. */
export function cleanDraft(typed: string): string {
  return typed.replace(/\D/g, '').slice(0, 6)
}

/** A draft that already is a valid value (sent live, so a button pressed next sees it), else null. */
export function liveValue(draft: string, b: NumberBounds): number | null {
  if (draft === '') return null
  const n = Number(draft)
  return n >= b.min && n <= b.max ? n : null
}

/** On blur / Enter: the draft as a number inside the bounds; empty keeps the last good value. */
export function commitDraft(draft: string, b: NumberBounds, last: number): number {
  if (draft === '') return last
  return clamp(Number(draft), b)
}

/** The −/+ steppers. */
export function stepValue(value: number, by: number, b: NumberBounds): number {
  return clamp(value + by, b)
}

function clamp(n: number, b: NumberBounds): number {
  return Math.min(b.max, Math.max(b.min, Math.round(n)))
}
