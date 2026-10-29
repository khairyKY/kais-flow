import { describe, expect, it } from 'vitest'
import { errorKind, groqFailure } from '../../../../supabase/functions/_shared/groqLog.ts'

// Legal review C7: a failed Groq call logs its status and Groq's error code, never the body.
describe('groqLog', () => {
  it('keeps the status and the code, drops the message and any echoed generation', async () => {
    const body = { error: { message: 'my journal: I felt awful today', type: 'invalid_request_error', code: 'json_validate_failed', failed_generation: 'I felt awful today' } }
    const line = await groqFailure(new Response(JSON.stringify(body), { status: 400 }))
    expect(line).toBe('400 json_validate_failed')
  })

  it('falls back to the type, and never logs a code that looks like content', async () => {
    expect(await groqFailure(new Response(JSON.stringify({ error: { type: 'rate_limit_exceeded' } }), { status: 429 }))).toBe('429 rate_limit_exceeded')
    expect(await groqFailure(new Response(JSON.stringify({ error: { code: 'Call Sara about the biopsy' } }), { status: 400 }))).toBe('400 unknown')
    expect(await groqFailure(new Response('<html>bad gateway</html>', { status: 502 }))).toBe('502 unreadable')
  })

  it('an error is its class and database code, never its message', () => {
    let parseError: unknown
    try {
      JSON.parse('my private note')
    } catch (e) {
      parseError = e
    }
    expect(errorKind(parseError)).toBe('SyntaxError')
    expect(errorKind({ code: '23503', message: 'Key (id)=(secret) is not present' })).toBe('object 23503')
  })
})
