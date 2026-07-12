/** HH:MM in local time, for <input type="time">. */
export function localTimeKey(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Local wall-clock date ("YYYY-MM-DD") + time ("HH:MM") -> the UTC instant to store. */
export function localToIso(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString()
}
