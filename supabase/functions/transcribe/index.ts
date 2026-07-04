// P2 AI capture: audio blob -> text (Groq Whisper).
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const GROQ_STT_MODEL = Deno.env.get('GROQ_STT_MODEL') ?? 'whisper-large-v3-turbo'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BYTES = 20 * 1024 * 1024 // 20MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

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
