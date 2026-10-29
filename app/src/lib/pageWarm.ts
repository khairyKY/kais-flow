// M1b / iOS PWA (2026-10-29): the pages worth having before the first tap — the tab bar's (App.tsx marks them) —
// fetched once, when the signed-in shell (AppLayout) is first idle. Not on /sign-in, and not every page: the rest
// load when they're opened (from the service worker's cache, once they have been).
const loaders: (() => Promise<unknown>)[] = []

export function warmLater(load: () => Promise<unknown>): void {
  loaders.push(load)
}

let warmed = false
export function warmPages(): void {
  if (warmed || typeof window === 'undefined') return
  warmed = true
  const run = () => loaders.forEach((load) => void load().catch(() => {})) // offline or a stale deploy: on demand later
  const idle = () => (window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 1000)) // older iOS has no idle callback
  // A breath after load, so the first page's own data and pictures have the connection to themselves.
  const later = () => window.setTimeout(idle, 2000)
  if (document.readyState === 'complete') later()
  else window.addEventListener('load', later, { once: true })
}
