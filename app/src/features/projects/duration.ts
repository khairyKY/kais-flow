/** "1h30m" / "2h" / "45m" / "45" → minutes, or null when there's no positive number in it. Shared
 * by the work-log form (which falls back to 60) and editing a logged entry (which keeps the old). */
export function parseDuration(d: string): number | null {
  const hours = d.match(/(\d+)\s*h/)
  const mins = d.match(/(\d+)\s*m/)
  let total = 0
  if (hours) total += parseInt(hours[1], 10) * 60
  if (mins) total += parseInt(mins[1], 10)
  if (!hours && !mins) {
    const plain = parseInt(d, 10)
    if (!isNaN(plain)) total = plain
  }
  return total > 0 ? total : null
}

/** Minutes → "1h30m" / "2h" / "45m", the form the log's duration field takes. */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h ? `${h}h` : ''}${m || !h ? `${m}m` : ''}`
}
