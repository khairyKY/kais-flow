// P2 AI capture: audio blob -> text (Groq Whisper).
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { dailyLimitResponse, takeAiAllowance } from '../_shared/quota.ts'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const GROQ_STT_MODEL = Deno.env.get('GROQ_STT_MODEL') ?? 'whisper-large-v3-turbo'

const MAX_BYTES = 20 * 1024 * 1024 // 20MB

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // FIX-0 / S3: a signed-in user, not merely the public anon key, before anything reaches Groq.
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  // SEC-2: today's AI allowance, before up to 20MB of audio is read or Groq is called.
  // Fails CLOSED: if the allowance can't be checked, no Whisper call. Speech-to-text has the
  // tightest free-tier budget (audio-seconds per day) and each call can be the largest, so it is
  // the last path to leave unmetered; the voice sheet tells the user to try again.
  const allowance = await takeAiAllowance(auth.user.id, 'stt')
  if (allowance === 'over') return dailyLimitResponse(req)
  if (allowance === 'unavailable') return jsonResponse(req, { error: 'allowance unavailable' }, 503)

  try {
    const incoming = await req.formData()
    const file = incoming.get('audio')
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'missing audio file' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'file too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const groqForm = new FormData()
    groqForm.append('file', file, file.name || 'audio.webm')
    groqForm.append('model', GROQ_STT_MODEL)

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: groqForm,
    })
    if (!res.ok) {
      // Upstream detail stays in the function log; the caller only needs to know it failed.
      console.error('transcribe: groq', res.status, await res.text())
      return new Response(JSON.stringify({ error: 'upstream_failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const data = await res.json()
    return new Response(JSON.stringify({ text: data.text ?? '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    // Details stay in the function log; callers get a stable code, never upstream or stack text.
    console.error('transcribe:', e)
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
