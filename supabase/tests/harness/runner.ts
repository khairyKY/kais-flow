// Test harness (supabase/tests/*.sh --harness): serves edge functions under plain Deno. Each
// module's Deno.serve(handler) is captured and routed by the first path segment, like the edge
// runtime's main service (minus its verify_jwt check).
//
//   deno run ... runner.ts <functions dir> <port> <name>...
//
// Outbound fetches are shimmed (tests only — nothing here ships):
//   - requests to SUPABASE_URL pass straight through;
//   - every other request is appended to HARNESS_FETCH_LOG (one JSON line: method + url), so a
//     test can prove what a function did or did not try to contact;
//   - https requests to a real Web Push host go to the mock push service at HARNESS_PUSH_MOCK
//     (`<mock>/<last path segment>`) instead. Since migration 0036 push_subscriptions only admits
//     those hosts, so this is how seeded test devices get their pushes delivered and decrypted;
//   - with HARNESS_GROQ_STUB=1, api.groq.com answers with a fixed canned reply (parse JSON, a
//     one-chunk chat stream, a transcript) so the paths after the Groq call can be exercised.
//     Without it, Groq is simply unreachable (--allow-net doesn't include it).
// Anything else goes to the real fetch, i.e. only succeeds for hosts --allow-net permits.

const handlers = new Map<string, (req: Request) => Response | Promise<Response>>()
let current = ''
const realServe = Deno.serve
// deno-lint-ignore no-explicit-any
;(Deno as any).serve = (h: any) => {
  handlers.set(current, typeof h === 'function' ? h : h.handler)
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }
}

// Supabase.ai exists only inside the edge runtime. Test stub: a fixed unit vector, so search/chat
// reach search_hybrid (the vector branch then matches nothing; the FTS branch does the work).
// deno-lint-ignore no-explicit-any
;(globalThis as any).Supabase = { ai: { Session: class {
  run() { const v = new Array(384).fill(0); v[0] = 1; return Promise.resolve(v) }
} } }

const SUPABASE_HOST = new URL(Deno.env.get('SUPABASE_URL')!).host
const PUSH_MOCK = Deno.env.get('HARNESS_PUSH_MOCK') ?? ''
const FETCH_LOG = Deno.env.get('HARNESS_FETCH_LOG') ?? ''
const GROQ_STUB = Deno.env.get('HARNESS_GROQ_STUB') === '1'
// The harness's own idea of a push host — deliberately not imported from notify, so a bug in
// notify's allowlist can't be hidden by the harness agreeing with it.
const PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/

const realFetch = globalThis.fetch.bind(globalThis)

function groqStub(url: URL, init?: RequestInit): Response {
  if (url.pathname.endsWith('/audio/transcriptions')) return Response.json({ text: 'harness transcript' })
  if (url.pathname.endsWith('/chat/completions')) {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { stream?: boolean }
    if (body.stream) {
      return new Response('data: {"choices":[{"delta":{"content":"harness answer"}}]}\n\ndata: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    const parse = {
      kind: 'note', cleaned_text: 'harness parse', title: 'harness parse', domain_id: null, project_id: null,
      due_at: null, duration_min: null, priority: null, reminder_offset_min: null, confidence: 0.5,
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(parse) } }] })
  }
  return new Response('not stubbed', { status: 404 })
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const href = input instanceof Request ? input.url : String(input)
  const url = new URL(href)
  if (url.host === SUPABASE_HOST) return realFetch(input, init)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (FETCH_LOG) await Deno.writeTextFile(FETCH_LOG, JSON.stringify({ method, url: url.href }) + '\n', { append: true })
  if (PUSH_MOCK && url.protocol === 'https:' && PUSH_HOST.test(url.hostname)) {
    return realFetch(`${PUSH_MOCK}/${url.pathname.split('/').pop()}`, init)
  }
  if (GROQ_STUB && url.hostname === 'api.groq.com') return groqStub(url, init)
  return realFetch(input, init)
}

const [root, port, ...names] = Deno.args
for (const name of names) {
  current = name
  await import(`file://${root}/${name}/index.ts`)
}
realServe({ port: Number(port), hostname: '127.0.0.1', onListen() {} }, (req) => {
  const handler = handlers.get(new URL(req.url).pathname.split('/')[1])
  return handler ? handler(req) : new Response('Function not found', { status: 404 })
})
