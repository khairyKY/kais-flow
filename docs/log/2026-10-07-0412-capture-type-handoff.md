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
