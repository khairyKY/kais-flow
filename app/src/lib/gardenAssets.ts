import { daisyClockStage, hydrangeaStage } from './growthStages'

// Bucket-by-count → botanical asset + caption, shared by every screen that reflects the
// inbox's pending count as a hydrangea (Today's terrarium banner, the Inbox page header).
// Thresholds live in growthStages (F2) — this file only adds the captions.
export function hydrangeaAsset(pending: number): { src: string; note: string } {
  const src = hydrangeaStage(pending)
  const note =
    src === 'zero'
      ? 'nothing waiting'
      : src === 'heavy'
        ? `${pending} letters piling up`
        : `${pending} letter${pending === 1 ? '' : 's'} waiting`
  return { src, note }
}

// Daisy reflects the clock (today's column / terrarium banner). Past/future are
// calendar COLUMN states — use daisyColumnStage from growthStages for day headers.
export function daisyAsset(hour: number): { src: string; note: string } {
  const src = daisyClockStage(hour)
  const note =
    src === 'morning'
      ? 'opening with the morning'
      : src === 'midday'
        ? 'wide awake at midday'
        : 'closing with the light'
  return { src, note }
}
