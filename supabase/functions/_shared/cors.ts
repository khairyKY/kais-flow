// FIX-0 / S9: CORS for every edge function. Replaces four inline `Access-Control-Allow-Origin: '*'`
// copies. The request's Origin is reflected back only when it is on the allowlist; any other
// origin gets no ACAO header, so a browser on that origin can't read the response (and its
// preflight fails). Not an auth boundary — auth is the bearer token (see auth.ts) — this just
// stops arbitrary websites from driving the functions from a visitor's browser.
//
// Allowed:
//   - the production web app
//   - http://localhost / http://127.0.0.1 on any port (Vite dev + preview)
//   - Tauri v2 shells: `tauri://localhost` (macOS/iOS/Linux), `http(s)://tauri.localhost`
//     (Windows/Android)
//   - anything in the optional `ALLOWED_ORIGINS` secret (comma-separated, exact match) — e.g. a
//     Capacitor shell (`https://localhost`, `capacitor://localhost`) or a preview domain, without a
//     code change.

const STATIC_ORIGINS = new Set([
  'https://kais-flow.kaidagoat.workers.dev',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
])

const LOCAL_DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/

const EXTRA_ORIGINS = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
)

export function isAllowedOrigin(origin: string): boolean {
  return STATIC_ORIGINS.has(origin) || LOCAL_DEV_ORIGIN.test(origin) || EXTRA_ORIGINS.has(origin)
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // The ACAO value depends on the request's Origin, so caches must key on it.
    Vary: 'Origin',
  }
  const origin = req.headers.get('Origin')
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

/** JSON response carrying the request-specific CORS headers. */
export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  })
}
