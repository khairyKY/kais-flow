// Paper capture v1: one photographed page → proposed lines (Groq vision, structured JSON).
//
//   POST { capture_id, paths: ['<uid>/<capture_id>/0.jpg', …], page: 0, projects?: ['OS', …] }
//     200 { status, pages_read, title, items }          the row after this page
//     429 { error: 'daily_limit' }                       15 pages today (AI_DAILY_LIMIT_VISION); photo kept
//     503 { error: 'rate_limited' }                      Groq busy after retries; the app reads it later
//   POST { action: 'sweep' } (service role, pg_cron hourly — migration 0048): delete expired photos.
//
// The app uploads the resized pages to the private `captures` bucket first, then asks for each page in
// turn (its reading screen ticks them off). The image goes to Groq as a short-lived signed URL, so this
// function only orchestrates. Photos of notes are personal: Groq only (no training, zero retention).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@^4'
import { isServiceRole, requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { dailyLimitResponse, takeAiAllowance } from '../_shared/quota.ts'
import { afterPage, buildPrompt, MAX_PAGES, normaliseRead, ownsPath, retryDelayMs, type PageLine } from './read.ts'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
// Groq's image-input model (console.groq.com/docs/vision, checked 2026-10-04): reads English and
// Arabic handwriting, up to 3 images and 2,048 tokens per image. No second vision model is on the
// free plan today, so the fallback is opt-in (a secret).
const VISION_MODEL = Deno.env.get('GROQ_VISION_MODEL') ?? 'qwen/qwen3.8-27b'
const VISION_FALLBACK = Deno.env.get('GROQ_VISION_MODEL_FALLBACK') ?? ''

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const BUCKET = 'captures'

const ReadBody = z.object({
  capture_id: z.string().uuid(),
  paths: z.array(z.string().max(200)).min(1).max(MAX_PAGES),
  page: z.number().int().min(0).max(MAX_PAGES - 1),
  projects: z.array(z.string().max(80)).max(60).optional(),
})

class RateLimited extends Error {}

async function callGroq(model: string, imageUrl: string, projects: string[]): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildPrompt(projects) },
          { role: 'user', content: [{ type: 'text', text: 'Read this page.' }, { type: 'image_url', image_url: { url: imageUrl } }] },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_completion_tokens: 2048,
        // Reasoning tokens spend the same daily budget as the answer.
        ...(model.startsWith('qwen/') ? { reasoning_effort: 'low', reasoning_format: 'hidden' } : {}),
      }),
    })
    if (res.ok) {
      const content = (await res.json()).choices?.[0]?.message?.content
      if (!content) throw new Error('empty answer')
      return JSON.parse(content)
    }
    const detail = await res.text()
    if (res.status !== 429 && res.status < 500) throw new Error(`groq ${res.status}: ${detail.slice(0, 200)}`)
    const wait = retryDelayMs(attempt, res.headers.get('retry-after'))
    if (wait === null) {
      if (res.status === 429) throw new RateLimited()
      throw new Error(`groq ${res.status}`)
    }
    await new Promise((r) => setTimeout(r, wait))
  }
}

async function readPage(imageUrl: string, projects: string[]): Promise<unknown> {
  try {
    return await callGroq(VISION_MODEL, imageUrl, projects)
  } catch (e) {
    if (!VISION_FALLBACK) throw e
    console.warn('capture-image: falling back', e instanceof Error ? e.message : e)
    return await callGroq(VISION_FALLBACK, imageUrl, projects)
  }
}

interface CaptureRow {
  id: string
  user_id: string
  pages: number
  pages_read: number
  status: string
  title: string | null
  items: PageLine[]
}

async function read(req: Request, userId: string): Promise<Response> {
  const parsed = ReadBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse(req, { error: 'bad_request' }, 400)
  const { capture_id, paths, page, projects = [] } = parsed.data
  if (page >= paths.length || !paths.every((p) => ownsPath(p, userId, capture_id))) return jsonResponse(req, { error: 'bad_request' }, 400)

  // First page creates the row; a retry or the next page finds it.
  const { error: insertError } = await service
    .from('captures')
    .upsert({ id: capture_id, user_id: userId, storage_paths: paths, pages: paths.length, status: 'reading' }, { onConflict: 'id', ignoreDuplicates: true })
  if (insertError) throw insertError
  const { data: row, error } = await service.from('captures').select('id, user_id, pages, pages_read, status, title, items').eq('id', capture_id).single<CaptureRow>()
  if (error) throw error
  if (row.user_id !== userId) return jsonResponse(req, { error: 'not_found' }, 404)
  const answer = (r: CaptureRow) => jsonResponse(req, { status: r.status, pages_read: r.pages_read, title: r.title, items: r.items })
  if (page < row.pages_read) return answer(row) // read already — the same answer again, no Groq call

  const update = (patch: Record<string, unknown>) => service.from('captures').update(patch).eq('id', capture_id)

  // One count per page, before Groq: past 15 today the photo waits for tomorrow.
  const allowance = await takeAiAllowance(userId, 'vision')
  if (allowance === 'over') {
    await update({ status: 'queued', error: 'daily_limit' })
    return dailyLimitResponse(req)
  }
  // Fails closed, like speech-to-text: an image is the costliest call, and the page simply waits.
  if (allowance === 'unavailable') return jsonResponse(req, { error: 'rate_limited' }, 503)

  const { data: signed, error: signError } = await service.storage.from(BUCKET).createSignedUrl(paths[page], 300)
  if (signError || !signed) throw signError ?? new Error('no signed url')

  let raw: unknown
  try {
    raw = await readPage(signed.signedUrl, projects)
  } catch (e) {
    const limited = e instanceof RateLimited
    console.error('capture-image: read failed', limited ? 'rate limited' : e)
    // Rate-limited: queued, the app tries again in a while. Anything else: failed, with Try again.
    await update({ status: limited ? 'queued' : 'failed', error: limited ? 'rate_limited' : 'upstream' })
    return jsonResponse(req, { error: limited ? 'rate_limited' : 'upstream_failed' }, limited ? 503 : 502)
  }

  const pageRead = normaliseRead(raw, page)
  const next = afterPage(row, page, pageRead)
  const patch = { ...next, ...(page === 0 && pageRead.title ? { title: pageRead.title } : {}) }
  const { error: saveError } = await update(patch)
  if (saveError) throw saveError
  return answer({ ...row, ...patch })
}

/** pg_cron, hourly: photos past `expires_at` leave Storage; the row (and its read) stays. */
async function sweep(req: Request): Promise<Response> {
  const { data, error } = await service
    .from('captures')
    .select('id, storage_paths')
    .lt('expires_at', new Date().toISOString())
    .is('photos_deleted_at', null)
    .order('expires_at')
    .limit(200)
  if (error) throw error
  let photos = 0
  for (const row of data ?? []) {
    if (row.storage_paths.length) {
      const { error: removeError } = await service.storage.from(BUCKET).remove(row.storage_paths)
      if (removeError) {
        console.error('capture-image sweep: remove', row.id, removeError)
        continue
      }
      photos += row.storage_paths.length
    }
    await service.from('captures').update({ photos_deleted_at: new Date().toISOString(), storage_paths: [] }).eq('id', row.id)
  }
  return jsonResponse(req, { captures: data?.length ?? 0, photos })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })
  try {
    if (await isServiceRole(req)) {
      const body = await req.clone().json().catch(() => null)
      if (body?.action === 'sweep') return await sweep(req)
      return jsonResponse(req, { error: 'bad_request' }, 400)
    }
    const auth = await requireUser(req)
    if (auth instanceof Response) return auth
    const work = read(req, auth.user.id)
    // Keeps the read going if the phone leaves mid-page (you can leave — the row says when it's done).
    ;(globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(work.catch(() => {}))
    return await work
  } catch (e) {
    // Details stay in the function log; callers get a stable code, never upstream or stack text.
    console.error('capture-image:', e)
    return jsonResponse(req, { error: 'server_error' }, 500)
  }
})
