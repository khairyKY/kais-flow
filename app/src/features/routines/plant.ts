import { vineStage } from '../../lib/growthStages'
import type { Routine, RoutinePlant } from '../../lib/types'

// A routine's plant (0067, Routines.dc.html 2a "Its plant — starts bare, grows with the streak").
// Every species buckets the streak with the vine's thresholds (lib/growthStages vineStage: bare 0 ·
// sprouting 1–6 · flowering 7–29 · lush 30+), so a 12-day cherry and a 12-day vine are at the same
// stage; only the drawing differs. Each species' four drawings are its own growth art, in order —
// no species has a "spent" drawing here (cherry's fallen, daisy's evening/past are other screens').

const A = '/ds/assets'

export const PLANTS: Record<RoutinePlant, { label: string; stages: readonly [string, string, string, string]; preview: string }> = {
  vine: { label: 'Vine', stages: ['bare', 'sprouting', 'flowering', 'lush'], preview: 'flowering' },
  cherry: { label: 'Cherry', stages: ['bud', 'opening', 'bloom', 'bloom'], preview: 'opening' },
  fern: { label: 'Fern', stages: ['coil', 'unfurl1', 'unfurl2', 'full'], preview: 'unfurl1' },
  clover: { label: 'Clover', stages: ['seedling', 'resting', 'awake', 'four_leaf'], preview: 'awake' },
  daisy: { label: 'Daisy', stages: ['future', 'morning', 'midday', 'midday'], preview: 'morning' },
}

/** 2a's picker order. */
export const PLANT_ORDER = Object.keys(PLANTS) as RoutinePlant[]

const STAGE_INDEX = { bare: 0, sprouting: 1, flowering: 2, lush: 3 } as const

/** The routine's species; a row cached before 0067 (or an unknown value) grew the vine. */
export function plantOf(r: Pick<Routine, 'plant'>): RoutinePlant {
  return r.plant && r.plant in PLANTS ? r.plant : 'vine'
}

/** The drawing of `plant` at a `streak`-day streak. */
export function plantSrc(plant: RoutinePlant, streak: number): string {
  return `${A}/${plant}/${PLANTS[plant].stages[STAGE_INDEX[vineStage(streak)]]}.png`
}

/** The picker's swatch (2a draws each species mid-growth). */
export function plantPreviewSrc(plant: RoutinePlant): string {
  return `${A}/${plant}/${PLANTS[plant].preview}.png`
}
