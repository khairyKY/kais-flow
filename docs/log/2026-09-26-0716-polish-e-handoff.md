---
date: 2026-09-26T07:16Z
session: polish-e-worker
type: handoff
related: conductor-decides (2026-09-26-0642-bohr-decision-conductor-decides.md), S8, K-g, T-4, SEC-2, P0-B
---

# Polish E handoff: voice keeps the recording, honest onboarding, S8 persister, Cairo date chip, short sign-out label

Branch `claude/polish-e`, cut from `origin/claude/release-1` at `0fc3216`. Pushed; no PR opened, nothing merged. Since then `release-1` has gained FIX-5 (`2b74f70`), which touches no file under `app/`, so this branch merges without conflicts there.

| Commit | Item |
|---|---|
| `605aee2` | 1. Never lose a voice recording |
| `52f591b` | 2. Onboarding step 4 no longer promises Google Calendar sync |
| `31adc99` | 3. S8: the IndexedDB persister leaves personal content out |
| `2a6f69f` | 4. Command bar date chip in Cairo time; "10am" means 10:00 Cairo (T-4) |
| `6bc1603` | 5. Sign-out prompt: "Discard & sign out" |

The Today-badge item that the decision entry lists under Polish E isn't in this worker's brief. It lives in `features/today/**` and `AppLayout.tsx`, which other workers own, so it was not touched.

## 1. Never lose a voice recording (`features/capture/**`)

**Storage check (asked for).** No migration (0001–0036) creates a storage bucket, and `supabase/config.toml` has only the commented-out example `[storage.buckets.images]`. No client or edge-function code calls `supabase.storage`. `journal_entries.media_paths` exists as a column, but it has no bucket behind it. So **no audio is uploaded**. The sheet says the audio stays only until it closes, and "Save to Inbox" writes a text reminder.

**What changed**
- `VoiceCaptureSheet.tsx` now has four phases (`recording → transcribing → kept`, plus `resting`), exposed as `data-voice-phase`:
  - `kept`: transcription failed for any reason (`daily_limit` 429, offline, 4xx/5xx, a malformed reply). The recording stays in memory. Tapping outside and Esc do nothing; only its own buttons end it:
    - **Try again**: re-sends the same blob.
    - **Save to Inbox untranscribed**
    - **Discard**
  - On a daily-limit reply, Save takes the filled button style, because Try again is a long shot today.
  - `resting`: after a `daily_limit` reply, remembered for the rest of that Cairo day on this device. The next tap says so up front and doesn't open the mic. It offers **Type it instead**, which closes the sheet and opens the command bar, and **Close**.
- `api.ts` `saveUntranscribedVoiceNote()` builds the row with the existing `newInboxItem`, then `writeRow('inbox_items')` and `logActivity('inbox.captured', …)`:
  - Fields: `kind: 'voice'`, `raw_text: "Voice note (not transcribed yet)"`, `transcript: null`, `ai_parse: null`, `status: 'pending'`, `payload: { untranscribed: true }`. `payload` is the existing jsonb column; no new columns.
  - No `needs_parse`: there is no text for the reconnect parser to read.
- `aiAllowance.ts` gains `VOICE_ALLOWANCE_USED_UP` and `rememberVoiceLimitReached(uid)` / `voiceLimitReachedToday(uid)`:
  - Stored in localStorage `kf-voice-limit-day` as `{ day: <Cairo YYYY-MM-DD via cairoDateKey>, uid }`.
  - Tagged with the account, so another account on the same browser isn't told its allowance is gone.
  - Blocked or corrupt storage means "not remembered"; it never throws.
- `voiceCopy.ts` holds all the new copy, and a unit test enforces the house rule on it.
- **Also fixed:** Cancel during a recording used to send the half-recording to be transcribed on its way out. `cleanupRecording` stopped the recorder with its `onstop` handler still attached. The real run below measured it on the base build: 1 transcribe call after Cancel. Handlers are now detached first: 0 calls. A generation counter also stops a late `getUserMedia` from reviving a sheet that has already closed.
- The console now gets `console.warn` instead of `console.error` on a failed transcription. Nothing from the error reaches the UI.

**Copy written**
| Where | Text |
|---|---|
| kept · status (mono) | `Not transcribed yet · 0:07` |
| kept · hand line | `your recording is still here` |
| kept · reason, daily limit | `Today's voice allowance is used up — it refills tomorrow.` |
| kept · reason, offline | `You’re offline, so it couldn’t be transcribed.` |
| kept · reason, anything else | `It couldn’t be transcribed just now.` |
| kept · note | `The audio stays only until you close this sheet. Saving to the Inbox keeps a reminder, not the audio.` |
| kept · buttons | `Discard` · `Try again` · `Save to Inbox untranscribed` |
| Inbox row | `Voice note (not transcribed yet)` |
| toast after saving | `Saved to Inbox — not transcribed yet.` |
| resting · status / hand / line | `Voice is used up for today` / `type it instead?` / `Today's voice allowance is used up — it refills tomorrow.` |
| resting · buttons | `Close` · `Type it instead` |

Voice has its own allowance (60/day), separate from chat and typed capture. That's why the sheet says "voice allowance" rather than SEC-2's general "AI allowance".

**UX calls I made (within the decision)**
- An empty transcript (silence) keeps the old behaviour: the toast "Didn't catch that — try again", and the sheet closes. That is a successful reply with nothing in it, not a failure.
- The resting state offers no "record anyway". Audio can't be stored, and today it can't be transcribed either.

## 2. Onboarding truthfulness (`features/onboarding/OnboardingPage.tsx`)

Step 4 ("Make each day a good one" → Calendar time-blocking):
- Was: "…Syncs both ways with Google Calendar."
- Now: **"Drag a task onto the calendar to reserve real time for it. Google Calendar sync arrives in a later release."**

The wording is step 6's own ("integrations arrive in a later release"). Title, icon, layout and tone are unchanged. A `deviation(2026-09-26 conductor-decides, Polish E)` comment records why it differs from `Onboarding.dc.html`.

## 3. S8: persister excludes personal content (`lib/queryClient.ts`)

**Excluded query roots.** Every key in the app has the table name as `queryKey[0]`; I found them with grep over all `queryKey:` uses:

| Key | Why |
|---|---|
| `journal_entries` | K-g: journal |
| `people` | K-g: people (names and facts) |
| `interactions` | K-g |
| `notes` | K-g: library notes, your own writing |
| `push_subscriptions` | K-g: this device's push endpoint and keys |
| `commentary` (`['commentary', type, id]`) | your own writing on notes and quotes |
| `quotes` | passages you kept. The Library is parked, so nothing is lost offline |
| `deleted_items` | Trash carries whole trashed journal rows (body, mood, gratitude) in `rawRow` |

**Kept:** `books` (title/author/pages only), `inbox_items`, and everything else. Chat and search don't use the query cache.

**How it works**
- **The filter.** `shouldPersistQuery = defaultShouldDehydrateQuery && !isUnpersistedQueryKey`. It is set as the QueryClient's `defaultOptions.dehydrate.shouldDehydrateQuery`.
- **Why not `dehydrateOptions`.** `App.tsx` (off-limits to me) passes no `dehydrateOptions`. `persistQueryClientSave` then calls `dehydrate(client, undefined)`, which falls back to the client default. I read this in query-core's `hydration.js`, and a unit test proves it.
- **Defence in depth.** `idbPersister` is wrapped so the filter also applies on save, so a future caller's own `dehydrateOptions` can't bypass it. It also applies on restore, so a snapshot written before S8 never re-hydrates journal or people rows; the next save overwrites it without them.
- **Writes are unchanged.** The outbox has its own IndexedDB key, `kf-outbox`. A journal write still updates the session cache and still queues and syncs. The unit test and the real run below both show this.
- **Unit tests** in `lib/queryClient.test.ts` (11): the predicate; that `dehydrate()` uses it by default; what actually reaches the faked IndexedDB; a caller override can't bypass it; a legacy snapshot is filtered on restore; a journal `writeRow` still queues but stays out of the persisted cache.

**Found, not fixed:** `features/rituals/EveningRitual.tsx:106` logs `journal.line_added` with `{ text }`, the evening one-liner, into `activity_log`. `activity_log` is persisted, and it has to be, because Focus, Activity and notifications read it offline. So that one line of journal text still reaches IndexedDB through another table. `features/rituals/**` belongs to another worker. Suggested fix there: drop `text` from that payload, or keep it only in `journal_entries`.

## 4. Command bar date chip, and T-4 (`features/command-bar/**`, `lib/dateShortcuts.ts`)

**Chip.** `formatDueChip(iso)` gives "Tomorrow · 10:00 AM" or "Wed, Oct 7 · 3:00 PM":
- The day word is the Inbox's `dayWord` (Today / Tomorrow / a real date), so a date weeks out is never read as this week.
- The clock is `formatDue`'s: Cairo, hour and minutes, no seconds.
- The chip CSS uppercases it: `TOMORROW · 10:00 AM`.

**T-4.** `parseCommand(input, domains, projects, { now, zone })`:
- The command bar passes `zone: 'cairo'`. chrono reads the text against Cairo's clock (`reference.timezone = cairoOffsetMinutes(now)`).
- The resulting wall-clock parts become an instant through the new `cairoWallTimeToIso` in `lib/dateShortcuts.ts`. It is exported next to T-2's helpers and shares their two-pass tz-database offset math (refactored, not duplicated), so a date after the October DST switch gets UTC+2.
- An explicit zone ("3pm UTC") or a relative time ("in 2 hours") keeps chrono's exact instant.
- **Default stays `device`** for the calendar's `QuickCreate`, whose date/time fields and grid are device-local (`localDateKey`/`localToIso`). Switching it there would put a Cairo instant into a device-local form. `features/calendar/**` is off-limits here; flag for the calendar owner if the calendar ever moves to Cairo.
- Tests pin `now` and assert exact UTC ISO strings. The date and DST cases include "past 10am rolls to tomorrow", "tomorrow after Cairo midnight while LA is still on yesterday", "Nov 5 10am → 08:00Z" and "in 2 hours".

## 5. Sign-out labels (`features/auth/signOutCopy.ts`)

- `cancelLabel` is still "Stay signed in".
- `confirmLabel` was "Sign out anyway (discard it/them)" and is now **"Discard & sign out"** for any count. The body still says what gets discarded ("…would discard it/them.").
- Tests updated, including a check that the body keeps that sentence.
- `ConfirmCard` itself was not touched.

## Evidence

### Unit tests, lint, build (run in `app/`)
- `TZ=UTC npx vitest run`: **Test Files 37 passed (37) · Tests 391 passed (391)**
- `TZ=Africa/Cairo npx vitest run`: **Test Files 37 passed (37) · Tests 391 passed (391)**
- `TZ=America/Los_Angeles npx vitest run`: **Test Files 37 passed (37) · Tests 391 passed (391)**
- Baseline on `0fc3216` (UTC): 34 files, 350 tests.
- New test files: `capture/voiceCopy.test.ts`, `lib/queryClient.test.ts`, `command-bar/dueChip.test.ts`.
- Extended test files: `aiAllowance.test.ts`, `api.test.ts`, `parseCommand.test.ts`, `dateShortcuts.test.ts`, `signOut.test.ts`.
- `npm run lint`: exactly the **2 baseline errors** (`projects/ProjectsPage.tsx:23`, `:24`). Warnings went from 30 to 28, both in `VoiceCaptureSheet.tsx`:
  - The unused `catch (e)` is gone.
  - The open/close effect's exhaustive-deps warning now carries a commented `eslint-disable-line`, the repo's existing convention. Re-running on every render would restart the mic.
- `npm run build` (tsc -b + vite build): passes.
- Line endings are preserved. `capture/api.ts` and `command-bar/CommandBar.tsx` stay CRLF (checked with `git diff | cat -A`); the rest are LF.

### Real run
**Setup**
- Production builds (`vite build` + `vite preview`) against the shared local stack `http://127.0.0.1:54321`. Account `polish-e@example.com`, created via `/auth/v1/signup`.
- Chromium with `--use-fake-device-for-media-stream`: a real `MediaRecorder` on a fake microphone, with no stubbing.
- **Port deviation:** 5235 was taken by the Polish D worker's "before" preview. The new build ran on **5247**, and the base `0fc3216` "before" build on **5248**. Both servers are stopped.
- The scripts and raw JSON results are committed in `docs/log/assets/polish-e/` (`lib.mjs`, `voice.mjs`, `items345.mjs`, `onboarding.mjs`, `run-*.json`).
- The local `transcribe` function really runs. It fails by itself with **HTTP 400**, because it can't reach Groq; its body carries raw TLS error text. The UI showed none of that text.

**Item 1** (`run-voice-after.json`)
| Step | Result |
|---|---|
| record 2s → Stop & file (natural 400) | phase `kept`: "NOT TRANSCRIBED YET · 0:02 / your recording is still here / It couldn’t be transcribed just now. / The audio stays only until you close this sheet…" |
| tap outside, then Esc | still `kept` |
| Try again | 2nd transcribe call (400), still `kept` |
| Save to Inbox untranscribed | sheet closes, toast "Saved to Inbox — not transcribed yet."; server rows with that text went from **1 to 2** (exactly one new row; the 1 is from the first run): `kind voice, transcript null, status pending, ai_parse null, payload {untranscribed:true}`; the row appears in the Inbox |
| Cancel mid-recording | **0** transcribe calls, no inbox row (base build: **1** call, see below) |
| `page.route` → 429 `{"error":"daily_limit"}` | `kept` with "Today's voice allowance is used up — it refills tomorrow."; localStorage `{"day":"2026-09-26","uid":…}` |
| next tap on voice | phase `resting` up front: **0** getUserMedia calls, **0** transcribe calls |
| Type it instead | command bar open, input focused |
| after reload, tap voice | still `resting` |
| phone 390 night | `kept` and `resting` both shown |

- Console: 0 unexpected errors. The only console lines were the expected "Failed to load resource" for the 400s and the 429, plus open-meteo (5 requestfailed = 5 tunnel console lines).
- Base build `0fc3216`, for comparison: Stop & file with the same 400 closed the sheet with the toast "Voice capture failed", and the recording was lost. `console.error` printed the raw `Error: transcribe failed: 400`.

**Item 2** (`run-onboarding-after.json`)
- The first run was the account's first real sign-in, and it landed on `/onboarding` (printed in the terminal, not saved). The committed JSON is a re-run, which opened step 4 via `/onboarding?replant`.
- Step 4 contains the new line and no "Syncs both ways". Step 6 still shows Google Calendar "Soon".
- Finishing → `/today`. Phone night via `?replant` shows the same text.
- 0 unexpected console errors.

**Item 3** (`run-items345-*.json`). Steps: typed a journal entry on `/journal`, opened `/people`, then `/today`, reloaded, and read IndexedDB `keyval-store` → `kais-flow-query-cache`.
- **After:** roots `activity_log, app_settings, calendar_events, domains, inbox_items, projects, resurfaced_log, routine_completions, routines, slipping, tasks`. No `journal_entries` or `people`, and the journal text is **not** in the blob. The journal text **is** on the server (the outbox delivered it), and `kf-outbox` is empty afterwards.
- **Before:** the same steps persisted `journal_entries, people, interactions, notes, quotes`, and the blob **contained the journal text**.

**Item 4**
| Device | Chip (before → after) | Stored `due_at` for "…10am" (before → after) |
|---|---|---|
| Cairo, 10:13 Sat | `9/27/2026, 10:00:00 AM` → `TOMORROW · 10:00 AM` | `2026-09-27T07:00Z` → `2026-09-27T07:00Z` |
| Los Angeles, 00:13 Sat | `9/26/2026, 10:00:00 AM` → `TOMORROW · 10:00 AM` | `2026-09-26T17:00Z` (10:00 LA) → `2026-09-27T07:00Z` (10:00 Cairo) |

**Item 5** (prompt shown offline with 1 queued capture; "Stay signed in", then reconnect; the capture synced both times; still signed in)
| | Stay signed in | destructive |
|---|---|---|
| before, desktop and phone | 2 lines, 55px | "Sign out anyway (discard it)", 2 lines, 55px |
| after, desktop day and phone night | **1 line**, 36px | "Discard & sign out", **1 line**, 36px (106 + 128 + 10 gap fits the card's 260px inner width) |

**Screenshots** (`docs/log/assets/polish-e/`)
- Voice: `voice-kept-desktop-day`, `voice-kept-phone-night`, `voice-saved-toast-desktop-day`, `voice-note-in-inbox-desktop-day`, `voice-limit-kept-desktop-day`, `voice-limit-kept-phone-night`, `voice-resting-desktop-day`, `voice-resting-phone-night`, `voice-type-instead-desktop-day`, `voice-failure-before`
- Onboarding: `onboarding-step4-desktop-day`, `onboarding-step4-phone-night`, `onboarding-step6-desktop-day`
- Chip: `chip-{cairo,la}-{before,after}`
- Sign-out: `signout-prompt-{desktop-day,phone-night}-{before,after}`

**Console across all "after" runs:** 0 unexpected errors. The open-meteo trap was ignored; its requestfailed count matched its tunnel console-line count in every context. The offline phases logged expected `ERR_INTERNET_DISCONNECTED` for images.

**Harness notes**
- A first sign-out run failed because the service worker was blocked and the lazy command-bar chunk couldn't load offline. The script now loads it once while online.
- A capture titled "…phone-night…" was parsed as due "night" and filed as a task. That is chrono working as designed, not a bug; the title no longer contains date words.
- The test account's single journal entry for today holds concatenated text from several runs (test data only).

## For the conductor
1. Follow-up for the rituals owner: `journal.line_added` puts journal text into `activity_log`, which is persisted (see item 3).
2. Follow-up for the calendar owner: `QuickCreate` still parses on device time (see item 4). That is consistent with the calendar's device-local grid, but it's the one place "10am" still isn't Cairo.
3. Observation, not mine: on phone, the Inbox card's text column is very narrow ("Offline / capture / desktop / after" wraps word by word; see `signout-prompt-phone-night-after.png`).
4. Observation: the local stack's `transcribe` answered `400` with raw upstream error text in its JSON body, even for a bare anon-key Bearer. The local functions come from whichever checkout started the stack, so this says nothing about release-1's SEC-2 code; worth a glance at the deployed function's error bodies.
