// kaisflow:// links (src-tauri/src/capture.rs hands the web app the link it was sent): the five the
// Rainmeter widgets and other tools use. `capture` never reaches here (the popup opens in Rust).
//   kaisflow://today · calendar · focus · task/<id>

const ID = /^[A-Za-z0-9_-]{1,64}$/

/** The in-app route for a link, or null when it is not one of ours (the app just opens). */
export function deepLinkRoute(url: string): string | null {
  const m = /^kaisflow:(?:\/\/)?([^/?#]+)\/?([^?#]*)/i.exec(url.trim())
  if (!m) return null
  const host = m[1]!.toLowerCase()
  const rest = m[2]!.replace(/\/+$/, '')
  if (!rest && (host === 'today' || host === 'calendar' || host === 'focus')) return `/${host}`
  if (host === 'task' && ID.test(rest)) return `/tasks/${rest}`
  return null
}
