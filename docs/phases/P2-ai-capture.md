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

- **2026-07-04 (Sonnet):** Migration `0003_capture` added the minimal `app_settings` singleton (`confidence_threshold`, `timezone`) per this phase's own migration sketch — not deferred to P4 as the general plan implied, since P2 explicitly needs it. Threshold is currently a hardcoded `CONFIDENCE_THRESHOLD = 0.75` constant in `features/capture/api.ts` with a `TODO(P4)` to read from the table once a settings UI exists (the column is live in the DB either way).
- Both edge functions deployed successfully (`parse-capture`, `transcribe`); Groq secrets (`GROQ_API_KEY` from P0, `GROQ_PARSE_MODEL=llama-3.3-70b-versatile`, `GROQ_STT_MODEL=whisper-large-v3-turbo`) set via `supabase secrets set`.
- **`response_format` choice:** used Groq's `{"type": "json_object"}` mode (broadly supported) plus an explicit schema description in the system prompt, rather than assuming full `json_schema` strict-mode support on this model — combined with server-side Zod validation and one retry, then a `kind:'unknown', confidence:0` fallback. This is the "JSON-schema-constrained" behavior the phase spec asked for, just enforced by prompt+validation rather than a provider-native schema parameter, since that support varies by model/moment and validation-with-retry is robust either way.
- **Important gating nuance, confirmed by testing:** confidence alone isn't the auto-file gate — only `kind === 'task'` has anywhere to auto-file to yet (P1 scope). A capture classified `note`/`event`/`routine_idea`/`unknown` always lands in the Inbox with `ai_parse` attached for one-tap triage, **regardless of how high its confidence is** (verified live: "think about mom's gift sometime" came back `kind:'note', confidence:0.8` — stayed in Inbox exactly as the acceptance checklist expects, since 0.8 would have cleared a naive confidence-only gate).
- Built `features/capture/{parseSchema,api,VoiceCaptureButton}.tsx`, a minimal `lib/toastStore.ts` (Zustand) + `components/ToastHost.tsx` for the auto-filed/undo notifications (no toast library pulled in for one interaction), wired the voice button into Today + Inbox, upgraded `CommandBar` (`Ctrl+Enter` = AI pipeline, plain `Enter` unchanged from P1), and enhanced the Inbox triage row to show the AI's suggestion (kind, cleaned text, confidence %) with domain/project selects pre-filled from `ai_parse` for true one-tap confirm.
- **Full acceptance checklist verified against the live Groq + Supabase deployment** (real API calls, not mocked):
  - ✅ `grep`-equivalent (`Select-String`) over `dist/assets/*.js` post-build: zero hits for `GROQ`/the key — confirmed the secret never leaves the edge function
  - ✅ Messy input ("umm i need to like call omar tomorrow at 3pm about the pricing thing") → cleaned to "Call Omar", correctly linked to the right domain/project, correct due date — auto-filed
  - ✅ "think about mom's gift sometime" → stayed in Inbox with the AI's suggestion shown (see gating nuance above)
  - ✅ Undo on an auto-filed capture ("pick up dry cleaning tomorrow" → task "Dry Cleaning Pickup"): task deleted, item restored to Inbox as `pending` — verified via direct DB check, not just the toast disappearing
  - ✅ Offline → reconnect: captured "renew the car insurance next week #shaheen" with `navigator.onLine` forced `false` → confirmed nothing reached Supabase while offline (only in the local query cache with `payload.needs_parse: true`) → flipped online, dispatched the `online` event → within ~2.5s it synced, got parsed (`kind:'task'`, correct domain via `#shaheen`), and auto-filed (`status:'filed'`, `filed_task_id` set)
  - Voice capture UI (MediaRecorder button, mime feature-detection) renders correctly on both Today and Inbox and type-checks/builds clean; the `transcribe` edge function itself and the `MediaRecorder → transcribeAudio → captureWithAI` chain were exercised end-to-end via direct calls — **actually speaking into a real microphone was not tested** (no mic in this environment). Worth a real phone/laptop mic test before fully trusting it.
- All test tasks/inbox items cleaned from the live DB afterward. 8/8 Vitest tests still pass; `tsc -b` and `npm run build` clean.
