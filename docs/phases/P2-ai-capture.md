# P2 — AI Capture

**Parity rows:** 6–8 (text→AI cleanup→auto-file w/ confidence · voice→Whisper→parse · verified cross-device capture) · **Status:** see `../ROADMAP.md`

## Goal
Jerad's magic: speak or type anywhere; it cleans itself up and files itself. Uncertainty stays in the Inbox instead of guessing (his Substack lesson).

## Prereqs
P1 done. `[KAI]` Groq key exists (P0) → `supabase secrets set GROQ_API_KEY=...`.

## Scope
**In:** `parse-capture` + `transcribe` edge functions, capture UI (text + voice), confidence-gated auto-filing, command-bar AI mode, offline capture queueing.
**Out (do NOT build):** chat/RAG (P5), embeddings (P5), GitHub/email sources (P6), routine/journal filing targets beyond tasks+inbox (the parser may *classify* them, but they file to Inbox until those modules exist).

## Steps
1. Edge function **`parse-capture`** (Deno, `supabase/functions/parse-capture/`):
   - In: `{ raw_text: string, context: { domains: {id,name}[], projects: {id,name,domain_id}[], today: string, timezone: string } }`
   - Calls Groq chat completions, model `Deno.env.get('GROQ_PARSE_MODEL') ?? 'llama-3.3-70b-versatile'`, `response_format` JSON-schema-constrained.
   - Out: `{ kind: 'task'|'event'|'routine_idea'|'note'|'unknown', cleaned_text, title, domain_id?, project_id?, due_at?, duration_min?, priority?, confidence: number }`
   - System prompt requirements: include today's date + timezone + the domain/project list with ids; strip filler words; rewrite tersely; **prefer null over guessing**; confidence must be honest (instruct: "if unsure of placement, lower confidence — the user prefers triaging an inbox item over finding a misfiled task").
   - Validate output with Zod; on parse failure retry once, then return `kind:'unknown', confidence:0`.
2. Edge function **`transcribe`**: multipart audio (webm/opus) → Groq audio transcriptions (`GROQ_STT_MODEL` ?? `whisper-large-v3-turbo`) → `{ text }`. Reject > 20MB.
3. Client capture pipeline (`features/capture/`): text (or transcript) → `parse-capture` → if `confidence ≥ app_settings.confidence_threshold` (default 0.75): create entity + `logActivity('capture.autofiled', …)` + toast with **Undo** (undo → moves to inbox pending). Below threshold: `inbox_items.pending` with `ai_parse` prefilled → Inbox shows the suggestion for one-tap confirm/adjust.
4. Voice button (MediaRecorder) on Today and Inbox — hold-or-tap to record, stop → transcribe → same pipeline. Must work in the installed phone PWA.
5. Command bar upgrade: plain `Enter` = local chrono-parse create (P1 behavior); `Ctrl+Enter` = send through AI pipeline.
6. Offline: if offline at capture time, store raw text/audio-transcript-pending as `inbox_items.pending` with a `needs_parse` marker (in `payload`); a reconnect hook parses queued items.

## Files
`supabase/functions/{parse-capture,transcribe}/index.ts` · `app/src/features/capture/` (recorder, pipeline hook, toasts) · shared Zod schema `app/src/features/capture/parseSchema.ts` (mirrored in the edge function)

## Migration sketch
None required (uses P1 tables). Add `app_settings` here if not created yet (`confidence_threshold real default 0.75`, `timezone text default 'Africa/Cairo'`).

## Edge-function contracts
As in steps 1–2 (they ARE the contract — keep request/response shapes stable; the client and tests import the same Zod schema).

## Acceptance checklist
- [ ] Phone PWA voice capture → correctly-filed task appears on the laptop within seconds
- [ ] "think about mom's gift sometime" → stays in Inbox with a sensible suggestion (low confidence)
- [ ] `grep -r GROQ app/dist/` after build → no hits (key never in client bundle)
- [ ] Airplane-mode capture → queued → parses automatically on reconnect
- [ ] Undo on an auto-filed capture moves it back to Inbox

## Verification
`supabase functions serve` locally with `.env` for iteration · build + grep check above · manual phone↔laptop test · `select kind, status, confidence from inbox_items order by created_at desc limit 10;`.

## Pitfalls
- iOS Safari MediaRecorder: feature-detect mimeType, fall back to `audio/mp4` (AAC); test in the *installed* PWA (permissions differ from tab).
- CORS: edge functions need explicit `Access-Control-Allow-Origin` for the Pages domain + `OPTIONS` handler.
- Groq JSON mode: always Zod-validate anyway; one retry max, then inbox — never block capture on AI failure.
- Rate limits: batch context (don't send hundreds of projects); truncate transcripts > ~2k chars for parsing.

## Notes / deviations
_(filled during execution)_
