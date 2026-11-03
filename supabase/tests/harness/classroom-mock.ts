// A stand-in for Google (tests only): the OAuth token endpoint and the Classroom API, so classroom.sh can
// run classroom-connect / classroom-sync on a local stack without the internet. The harness runner
// (runner.ts, HARNESS_CLASSROOM_MOCK) sends every request to oauth2.googleapis.com and
// classroom.googleapis.com here, path and query unchanged.
//
//   deno run --allow-net=127.0.0.1 --allow-env classroom-mock.ts <port>
//
// Control (the test's side):  POST /__state  with JSON, merged into the state below;  GET /__log  the
// requests seen, one "METHOD path" per line.
//
//   state = {
//     courses: [{id, name, section?, courseState}],
//     work:    {<courseId>: [coursework…]},          returned as is (the function filters)
//     subs:    {<courseId>: [{courseWorkId, state}…]},
//     scope:   the space-separated scopes a code exchange grants,
//     deadToken: refresh answers invalid_grant,
//     blockApi:  every Classroom call answers 403,
//     failWork:  [courseId…] whose courseWork answers 500,
//   }
// Lists are cut into pages of MOCK_PAGE (default 2) so a function that reads only page one is caught.

const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
].join(' ')

const state: {
  courses: Record<string, unknown>[]
  work: Record<string, Record<string, unknown>[]>
  subs: Record<string, Record<string, unknown>[]>
  scope: string
  deadToken: boolean
  blockApi: boolean
  failWork: string[]
} = { courses: [], work: {}, subs: {}, scope: SCOPES, deadToken: false, blockApi: false, failWork: [] }
const log: string[] = []
const PAGE = Number(Deno.env.get('MOCK_PAGE') ?? 2)

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function page(items: Record<string, unknown>[], key: string, url: URL): Response {
  const size = Math.min(Number(url.searchParams.get('pageSize') ?? PAGE), PAGE)
  const from = Number(url.searchParams.get('pageToken') ?? 0)
  const next = from + size < items.length ? { nextPageToken: String(from + size) } : {}
  return json({ [key]: items.slice(from, from + size), ...next })
}

Deno.serve({ port: Number(Deno.args[0]), hostname: '127.0.0.1', onListen() {} }, async (req) => {
  const url = new URL(req.url)
  if (url.pathname === '/__state' && req.method === 'POST') {
    Object.assign(state, await req.json())
    return json({ ok: true })
  }
  if (url.pathname === '/__log') return new Response(log.join('\n'))
  log.push(`${req.method} ${url.pathname}`)

  if (url.pathname === '/token' && req.method === 'POST') {
    const form = new URLSearchParams(await req.text())
    if (form.get('grant_type') === 'refresh_token') {
      if (state.deadToken || form.get('refresh_token') === 'dead') return json({ error: 'invalid_grant' }, 400)
      return json({ access_token: 'mock-access', scope: SCOPES })
    }
    if (form.get('code') === 'good') return json({ access_token: 'mock-access', refresh_token: 'mock-refresh', scope: state.scope })
    return json({ error: 'invalid_grant' }, 400)
  }
  if (url.pathname === '/revoke') return json({})

  if (url.pathname.startsWith('/v1/')) {
    if (req.headers.get('Authorization') !== 'Bearer mock-access') return json({ error: { code: 401 } }, 401)
    if (state.blockApi) return json({ error: { code: 403, status: 'PERMISSION_DENIED' } }, 403)
    if (url.pathname === '/v1/courses') {
      const states = url.searchParams.getAll('courseStates')
      return page(state.courses.filter((c) => !states.length || states.includes(String(c.courseState))), 'courses', url)
    }
    const m = /^\/v1\/courses\/([^/]+)\/courseWork(\/-\/studentSubmissions)?$/.exec(url.pathname)
    if (m) {
      const course = decodeURIComponent(m[1])
      if (m[2]) return url.searchParams.get('userId') === 'me' ? page(state.subs[course] ?? [], 'studentSubmissions', url) : json({ error: { code: 400 } }, 400)
      if (state.failWork.includes(course)) return json({ error: { code: 500 } }, 500)
      return page(state.work[course] ?? [], 'courseWork', url)
    }
  }
  return json({ error: 'not found' }, 404)
})
