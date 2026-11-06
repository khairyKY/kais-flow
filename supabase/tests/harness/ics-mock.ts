// A stand-in for the internet's calendar feeds (tests only): ics.sh runs ics-sync on a local stack against this. The
// harness runner (runner.ts, HARNESS_ICS_MOCK) sends every request to a host under feeds.test here, path and query
// unchanged — and answers those names' DNS (rebind.feeds.test resolves to a private address, nxdomain.feeds.test to nothing).
//
//   deno run --allow-net=127.0.0.1 --allow-env --allow-read ics-mock.ts <port>
//
// Routes:
//   /prayer.ics     the REAL prayer-times feed (fixtures/prayer-times.ics), its dates moved so that 2026-11-06 is today
//   /feed.ics       whatever the test last POSTed to /__feed (text/calendar), or 500 after POST /__feed {"down":true}
//   /html           an HTML page (not a calendar)             /404   not found
//   /huge           a calendar-looking body of 3 MB (the function runs with ICS_MAX_BYTES=2000000)
//   /slow           never answers within the function's timeout (ICS_TIMEOUT_MS=3000)
//   /redirect-ok    302 → /prayer.ics (relative)              /redirect-private  302 → http://169.254.169.254/…
//   /redirect-loop  302 → itself
// Control:  POST /__feed  {text} | {down:true}      GET /__log  one "METHOD path" per line.

const fixture = (n: string) => Deno.readTextFileSync(new URL(`../fixtures/${n}`, import.meta.url))
const DAY = 86_400_000
let feed = ''
let down = false
const log: string[] = []

/** The fixture's dates (20261101T044200 …) moved by whole days so 2026-11-06 lands on today (UTC): wall-clock times stay as they are. */
function shifted(text: string): string {
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  const days = Math.round((today - Date.UTC(2026, 10, 6)) / DAY)
  return text.replace(/\b(DTSTART|DTEND)([^:\r\n]*):(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?/g, (_m, k: string, p: string, y: string, mo: string, d: string, t: string | undefined) => {
    const n = new Date(Date.UTC(+y, +mo - 1, +d) + days * DAY)
    const f = `${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, '0')}${String(n.getUTCDate()).padStart(2, '0')}`
    return `${k}${p}:${f}${t ?? ''}`
  })
}

const ics = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } })

Deno.serve({ port: Number(Deno.args[0]), hostname: '127.0.0.1', onListen() {} }, async (req) => {
  const url = new URL(req.url)
  if (url.pathname === '/__log') return new Response(log.join('\n') + '\n')
  if (url.pathname === '/__feed') {
    const b = (await req.json()) as { text?: string; down?: boolean }
    down = !!b.down
    if (b.text !== undefined) feed = b.text
    return new Response('ok')
  }
  log.push(`${req.method} ${url.pathname}${url.search}`)
  switch (url.pathname) {
    case '/prayer.ics': return ics(shifted(fixture('prayer-times.ics')))
    case '/feed.ics': return down ? new Response('down', { status: 500 }) : ics(feed)
    case '/html': return new Response('<!doctype html><html><body>Not a calendar</body></html>', { headers: { 'Content-Type': 'text/html' } })
    case '/huge': return ics('BEGIN:VCALENDAR\r\n' + 'X-FILLER:' + 'x'.repeat(3_000_000) + '\r\nEND:VCALENDAR\r\n')
    case '/slow': await new Promise((r) => setTimeout(r, 20_000)); return ics('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')
    case '/redirect-ok': return new Response(null, { status: 302, headers: { Location: '/prayer.ics' } })
    case '/redirect-private': return new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data/' } })
    case '/redirect-loop': return new Response(null, { status: 302, headers: { Location: '/redirect-loop' } })
    default: return new Response('not found', { status: 404 })
  }
})
