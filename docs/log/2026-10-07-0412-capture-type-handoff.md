---
date: 2026-10-07T04:12+03:00
session: builder CB (capture-type, Kai's capture bug 2026-10-07)
type: handoff
related: docs/log/assets/capture-type/ · design-export/Paper Capture.dc.html 11a · design-export/MK Capture.dc.html · DS-CHANGELOG §3 (Capture button, Bottom sheet, gesture parity)
---

# Capture: tap = type on the phone, one Capture button on desktop

Branch `claude/capture-type`, cut from `origin/claude/wave-s` (1110074, v1.0.21). Not merged, not deployed.

Kai (2026-10-07): "the capture button only takes voice for the phone, we need to fix that for both desktop and phone".

## Root cause (confirmed)

- **Phone.** A tap on the tab bar's centre button set `commandBarStore.open`, and AppLayout then lazy-mounted `<CommandBar/>` (`lazy(() => import(...))`). The field mounted and focused itself in an effect after the chunk arrived, which is after the tap's gesture had ended. Android WebView and iOS Safari only raise the keyboard for a `focus()` made while a tap is being handled, so no keyboard came up. The bar was also the desktop overlay (fixed, 96px from the top), not the capture sheet the kit draws. Only hold-to-talk visibly did anything.
- **Desktop.** The page-header CTA on Today, Tasks and Inbox was "Voice capture" with a mic glyph. It opened the voice sheet only. Typing existed only behind ⌘K.

## Fix

**`commandBarStore.openCapture()`** is the one way a tap or click opens capture:
- It calls `flushSync(setOpen(true))`, then focuses `#kf-capture-input`, before the click handler returns.
- Every tap/click opener uses it: the tab-bar button, the new header CTA, the sidebar's Capture ⌘K row, Today's empty states and birthday "Plan something", People's "Plan something", Paper's "Type them in", and the voice sheet's "Type it instead".
- Hotkeys (⌘K, `n`) and the tray keep `setOpen(true)`, because they have no on-screen keyboard to raise.

**AppLayout warms the bar.** On the first idle callback it mounts `CommandBar`, which renders nothing while closed and has its own Suspense boundary. After that, no lazy boundary sits on the tap path. A tap in the first idle-moment of a cold start still opens the bar, but it focuses a beat late (see Risks).

**Phone (≤767px): Paper Capture 11a's capture sheet.**
- Kit `BottomSheet` that rides the keyboard (visualViewport).
- The field, with kit parse chips from the same local parser: date, project/domain, duration, priority, `*labels`, "→ Inbox".
- Toolbar: [camera · mic] … [send].
- Enter or Send files it exactly as the bar always did (`createTask` with the parse, else `captureText`).
- The sheet's mic is hold-to-talk's tap twin (DS gesture parity: "hold-to-talk = tap capture → mic in the sheet"). The capture sheet steps aside and the existing `VoiceCaptureSheet` records, then files by AI.
- A dismissed draft is kept (kit Bottom sheet rule: dismissing never discards). The desktop bar still clears on close, as before.

**Desktop: one "Capture" CTA** (kit `Button` cta + kf `plus`) on Today, Tasks and Inbox, replacing "Voice capture".
- It opens the ⌘K bar with the cursor in the field.
- The mic that used to be a drawing in the bar is now a **dictation toggle**: click, talk, click again.
- The transcript joins what was typed (`appendDictation`) for review; Enter files it (⌘↵ still = AI capture).
- If transcription fails (offline, over quota, server), the take goes to the voice sheet's kept state (Try again · Save to Inbox untranscribed · Discard). Try again puts the words back in the field, via the new `VoiceCaptureSheet onText`. Nothing is AI-filed behind your back.
- There is no second mic button in the header. Today.dc.html 1a draws one CTA, so the mic lives in the bar.

**Kept as they were:** hold-to-talk, slide-up-to-lock and slide-to-cancel, the offline voice queue, the paper camera's place in the bar, and paste-a-photo.

**Pure logic (tested, `holdToTalk.ts`):**
- `clickIsTap`: tap vs the click that ends a hold.
- `micAction`: which surface the mic opens.
- `appendDictation`.

## Glyph decision

The centre button **keeps the kit's mic**, because MK Capture.dc.html and Paper Capture 11a both draw a mic on it and the kit has no combined "+ / mic" glyph. What it does is said in words instead:
- The aria-label is "Capture — tap to type, hold to talk".
- A first-run hint in the sheet reads "Tap to type · hold to talk". It shows on the first three opens per device (`localStorage kf.captureHint`).

The desktop CTA uses the kf `plus`, the same glyph as the sidebar's Capture row.

## Evidence: docs/log/assets/capture-type/

`verify.mjs` runs the real app against a mocked backend (task-sheet recipe, `--mode mock`, `localhost:5262`). The mic is Chrome's fake device, so `getUserMedia` and `MediaRecorder` are real. Phone gestures are real CDP touch at 390×844. Result: **70/70** (`verify-results.json`, `run.log`).

- **Tap → focus in the gesture.** At the end of the click's dispatch, `document.activeElement` is the field. Its first `focus()` ran inside the click's task with user activation. The stack was `CommandBar effect ← flushSync ← openCapture ← onClick (CaptureButton.tsx)`, so the focus is synchronous in the tap handler. This holds day and night, from Today's empty state, and on desktop.
- **Phone sheet.**
  - It sits at the bottom, and rides a simulated 300px keyboard.
  - Chips read `TOMORROW · 9:00 AM`, `WEBSITE`.
  - Enter writes the task "Email Priya the slides", due tomorrow at 09:00 Cairo, in Website.
  - Send is disabled while the field is empty. An unstructured line goes to the Inbox, and a dismissed draft survives.
  - The first-run hint shows on a first open and is gone after three.
- **Phone voice.**
  - The in-sheet mic opens the voice sheet listening; Stop & file → transcribed → AI-filed with an "Added …" toast.
  - Hold → recording pill → release → filed once; the click that ends a hold opens nothing.
  - Slide up → hands-free bar.
  - Offline → kept, "You're offline…", Save to Inbox untranscribed.
- **Desktop (day + night).**
  - "Capture" sits in the Today, Tasks and Inbox headers, with no "Voice capture" anywhere. It opens the bar focused.
  - Dictate → "Listening" → stop → "Call the bank tomorrow 3pm about the mortgage" lands in the field, not filed. Enter → a task due tomorrow at 15:00 Cairo.
  - A failed transcribe → the voice sheet keeps the take → Try again → the words come back to the field.
- `side-11a.png` shows the design 11a beside the build.
- **Paper capture re-run:** `paper-capture/verify.mjs` scored **122/122** against this build. The camera shares the sheet's toolbar, and the offline "pages waiting" chip, "Type them in" and paste-a-photo all still work. Results and three shots are in `capture-type/paper-capture/`.

**Gate:** `tsc -b` 0 · vitest 103 files / 1240 tests passed under each of Africa/Cairo, UTC, America/Los_Angeles, Asia/Kolkata (PowerShell `$env:TZ`) and Asia/Tokyo · oxlint 0 errors (21 warnings, none in touched files) · `npm run build` ok.

## Deviations

- **11a's calendar and folder toolbar buttons, and tappable parse chips, are not built.** These are the kit's "tap the chip, its picker has Remove". Typing `tomorrow 3pm #project` sets the same fields. They need pickers that write overrides back over free text, which is a bigger job. ROADMAP line suggested: "capture sheet: 11a date/project toolbar pickers + tappable parse chips".
- **On a phone the sheet's mic opens the voice sheet** (AI-filed, gesture parity with hold). **On desktop the mic dictates into the field.** The conductor asked for both behaviours, and `micAction` documents the rule.
- **The phone sheet drops the ⌘K jump row and the keycap hints.** They are keyboard features.
- **`VoiceCaptureSheet` now transcribes a handed-over take once.** React StrictMode's dev re-run of its open effect sent it twice, which filed two tasks per hold in dev. Production was unaffected; the fix just makes dev match it.

## Risks / what only a real phone can prove

- **The keyboard itself.** The harness proves the `focus()` happens synchronously inside the tap handler, with user activation. That is the condition WebKit and Chrome-Android require. Whether the Capacitor Android WebView and iOS Safari actually raise the IME needs a real device, as does the sheet riding the real keyboard (Android `adjustResize` vs the visualViewport inset).
- **Cold-start window.** The bar's chunk loads on the first idle callback after boot (≤2s; 500ms fallback without `requestIdleCallback`). A tap before that still opens the sheet but may not raise the keyboard. The PWA precaches the chunk, so this is a load, not a network wait.
- **CommandBar is now always mounted after idle.** The cost is its two queries (domains and projects, which the sidebar already caches) and a `prefill-command-bar` listener, which now actually works when the bar is closed.
- **BottomSheet footer padding.** The kit footer keeps its 28px bottom padding, so a band shows between the toolbar and the keyboard (11a draws the toolbar flush). This is cosmetic.

---

# Phase 2: every property extracted from typed captures (Akiflow-style)

These are new commits on the same branch, after `64e6db5`. Phase 1 shipped there as v1.0.22. The conductor merges phase 2 separately.

Kai (2026-10-07): "When they capture something, every property is extracted — date, time, priority, description — like Akiflow. I don't want my user to type !!! for priority or // for a description. Let the AI understand the intent and decide."

## What changed

**Server: `supabase/functions/parse-capture/`**
- The prompt moved to a pure `prompt.ts`, tested from the app suite in `capture/parsePrompt.test.ts`.
- `ParseResultSchema` gains `description`: notes beyond the title, null if none. The app's `parseSchema.ts` mirrors it.
- The prompt now infers these from the plain words:
  - **priority**, on the app's 1–3 scale (1 = most urgent, same as `!!!`/`!!`/`!`): critical/urgent/ASAP → 1, important/soon → 2, low/whenever/no rush → 3, otherwise null.
  - **duration**: "an hour" = 60, "quick 15 min call" = 15.
  - date/time, reminder, and project/domain as before.
- It keeps the words it turned into fields out of the title.
- **Needs a deploy:** `supabase functions deploy parse-capture`. Until then the old function answers without `description` and priority, so phase 2 just fills less. Nothing breaks, because the field is optional.

**App: typed capture (Enter in the bar or sheet).**
- The row is still written at once from the local chrono parse (the preview chips are unchanged). It never waits on the network.
- Then the AI read follows:
  - **With structure** (a task was created): `enrichTypedTask` → `aiFill` fills **only empty fields**: date, priority, duration, project/domain, reminder, notes.
    - An explicit token always wins, because it already set its field: `!`, `30m`, `#tag`, `*label`, and the date chip.
    - So does anything the person changed meanwhile.
    - The title is replaced only when the AI pulled something else out of the words and the title is still the typed one.
    - Toast: **"✦ Filled by AI: priority, notes · Undo"**. Undo restores only the fields the AI wrote, and only where they still hold its values.
  - **A plain line** (it went to the Inbox): `enrichTypedInboxItem`. The AI decides, like a voice capture.
    - A task it is sure of (≥ 0.75) is filed with everything it read. Toast: **"✦ Filed by AI: "…" · Undo"**, where Undo puts it back in the Inbox.
    - Anything else stays in the Inbox, carrying the AI read (`ai_parse`, `confidence`) for triage.
  - Offline, over quota, or on any failure, nothing happens: the local parse stands and nothing is lost.
- ⌘↵ AI capture is unchanged.

**Every AI-filed path now takes the AI's priority and description.**
- This covers voice, ⌘↵ and queued/endpoint captures, through one helper, `taskFromParse`.
- They used to drop `priority` and had no description. Typed `!`/`30m` overrides still win.
- The AI's project/domain ids are validated against this device's live projects and domains, and placement needs ≥ 0.75. A made-up id would otherwise park the write.
- `createTask` takes `notes`.

## Evidence
- **Unit tests:**
  - `capture/aiFill.test.ts`: explicit tokens beat the AI, run through the real `parseCommand`; the AI only fills empties; a rename is kept; made-up ids, off-scale priorities and nonsense dates are dropped; `taskFromParse`.
  - `capture/api.test.ts`: `enrichTypedTask` fill + toast + Undo; offline/429/failure write nothing; `enrichTypedInboxItem` files or annotates.
  - `capture/parsePrompt.test.ts`.
- **Gate:** `tsc -b` 0 · vitest 105 files / 1256 tests under each of Africa/Cairo, UTC, America/Los_Angeles, Asia/Kolkata · oxlint 0 errors (21 warnings, none in touched files) · build ok.
  - Deno isn't installed here, so `parse-capture/index.ts` itself wasn't `deno check`ed. Its change is an import, one optional schema field and the fallback's `description: null`. `prompt.ts` is type-checked through the app suite.
- **Harness:** `capture-type/verify.mjs` now scores **84/84** (the 70 phase-1 checks + the `ai-*` scenes). The mocked parse-capture answers 700ms late:
  - The task POST lands before the AI answers. The fill then writes priority 1 (from "asap"), notes "Bring the payslips" and the title "Call the bank", while the typed tomorrow-15:00 stands. The toast follows, and Undo restores what was typed.
  - With "! 30m" typed, the result is priority 3 and 30m: the AI only added notes.
  - On a phone, "renew the car licence, urgent" → Inbox at once → the AI files it as a task with priority 1 and marks the Inbox row filed, with the "✦ Filed by AI" toast.
  - Offline: no AI call and no toast; back online, the task syncs as typed.

## Risks
- **AI quota.** Every typed Enter now costs one parse call (one row per capture; the parse allowance is shared with voice/⌘↵). Over the allowance, enrichment just stops for the day: the 429 is silent and the local parse stands.
- **A plain typed line can now become a task by itself** when the AI is ≥ 0.75 sure it's a task. Before, it always waited in the Inbox. The toast's Undo puts it back. If Kai wants plain lines to stay in the Inbox (annotated only), drop the filing branch in `enrichTypedInboxItem`.
- **The desktop "→ Inbox (unfiled)" / phone "→ Inbox" chip** still describes the instant write, not the AI's later decision.
