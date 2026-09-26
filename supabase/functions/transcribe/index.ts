// P2 AI capture: audio blob -> text (Groq Whisper).
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor } from '../_shared/cors.ts'

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
      return new Response(
        JSON.stringify({ error: `Groq error ${res.status}: ${await res.text()}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const data = await res.json()
    return new Response(JSON.stringify({ text: data.text ?? '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
