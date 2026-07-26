// Foundation F2 (punch item 10): THE growth-stage thresholds. House rule: never
// show a plant stage that contradicts the data — which requires every surface to
// bucket identically. Wave agents: import from here; inline threshold copies in
// feature folders are defects to delete on touch.

// Hydrangea (Inbox) — pending count. SPEC: zero · light 1–4 · medium 5–19 · heavy 20+
export function hydrangeaStage(pending: number): 'zero' | 'light' | 'medium' | 'heavy' {
  if (pending === 0) return 'zero'
  if (pending <= 4) return 'light'
  if (pending <= 19) return 'medium'
  return 'heavy'
}

// Vine (Routines/streaks) — streak days. SPEC: bare 0 · sprouting 1–6 · flowering 7–29 · lush 30+
export function vineStage(streakDays: number): 'bare' | 'sprouting' | 'flowering' | 'lush' {
  if (streakDays <= 0) return 'bare'
  if (streakDays <= 6) return 'sprouting'
  if (streakDays <= 29) return 'flowering'
  return 'lush'
}

// Cherry (Tasks/Today) — completion state.
export function cherryStage(open: number, doneToday: number): 'bud' | 'opening' | 'bloom' | 'fallen' {
  if (open === 0 && doneToday === 0) return 'bud'
  if (open === 0) return 'fallen'
  if (doneToday === 0) return 'opening'
  return 'bloom'
}

// Daisy clock stage (today's column / terrarium). CALENDAR.md: morning <11 · midday 11–16 · evening >16
export function daisyClockStage(hour: number): 'morning' | 'midday' | 'evening' {
  if (hour < 11) return 'morning'
  if (hour < 16) return 'midday'
  return 'evening'
}

// Daisy column stage (calendar day headers): past/future are COLUMN states, not clock states.
export function daisyColumnStage(dayDelta: number, hour: number): 'past' | 'future' | 'morning' | 'midday' | 'evening' {
  if (dayDelta < 0) return 'past'
  if (dayDelta > 0) return 'future'
  return daisyClockStage(hour)
}

// Fern (Journal) — entry length in characters.
export function fernByLength(chars: number): 'coil' | 'unfurl1' | 'unfurl2' | 'full' {
  if (chars < 50) return 'coil'
  if (chars < 150) return 'unfurl1'
  if (chars < 300) return 'unfurl2'
  return 'full'
}

// Fern (Library/Review) — progress fraction 0..1.
export function fernByFraction(fraction: number): 'coil' | 'unfurl1' | 'unfurl2' | 'full' {
  if (fraction < 0.25) return 'coil'
  if (fraction < 0.5) return 'unfurl1'
  if (fraction < 0.75) return 'unfurl2'
  return 'full'
}

// Wisteria (Projects) — weighted milestone %.
export function wisteriaStage(pct: number): 'p0' | 'p20' | 'p40' | 'p60' | 'p80' | 'p100' {
  if (pct <= 0) return 'p0'
  if (pct <= 20) return 'p20'
  if (pct <= 40) return 'p40'
  if (pct <= 60) return 'p60'
  if (pct <= 80) return 'p80'
  return 'p100'
}
