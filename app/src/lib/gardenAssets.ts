// Bucket-by-count → botanical asset + caption, shared by every screen that reflects the
// inbox's pending count as a hydrangea (Today's terrarium banner, the Inbox page header).
export function hydrangeaAsset(pending: number): { src: string; note: string } {
  if (pending === 0) return { src: 'zero', note: 'nothing waiting' }
  if (pending <= 3) return { src: 'light', note: `${pending} letter${pending === 1 ? '' : 's'} waiting` }
  if (pending <= 7) return { src: 'medium', note: `${pending} letters waiting` }
  return { src: 'heavy', note: `${pending} letters piling up` }
}

// Daisy/calendar reflects time of day — shared by the Terrarium banner and the Calendar header.
export function daisyAsset(hour: number): { src: string; note: string } {
  if (hour < 7) return { src: 'past', note: 'still asleep' }
  if (hour < 12) return { src: 'morning', note: 'opening with the morning' }
  if (hour < 17) return { src: 'midday', note: 'wide awake at midday' }
  if (hour < 21) return { src: 'evening', note: 'closing with the light' }
  return { src: 'past', note: 'the day is folded away' }
}
