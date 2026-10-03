---
date: 2026-10-03T13:35+03:00
session: builder Y (capture from anywhere: Android share sheet, phone capture keys, recipes, ?file=1)
type: handoff
related: docs/CAPTURE.md · supabase/functions/capture · migration 0041 (capture_keys) · docs/log/assets/capture-anywhere/
---

# Capture from anywhere: the Android app takes shares, the phone makes capture keys

Branch `claude/capture-anywhere`, cut from `origin/master` (a3a7413, v1.0.16). It was also pushed as
`claude/mobile-capture` for the Android CI. Nothing is merged or deployed, and nothing is needed from Kai.

In `SettingsPage.tsx` I touched only:
- `CaptureKeyCard`
- the phone's "Capture API" row (one line, plus the `useCaptureKey` hook beside the other hooks)
- the card's place on the phone (after the GitHub block)
- the desktop share-target card's copy and its grid's `alignItems`
- the dead `CaptureApiCard` placeholder, now deleted

## What changed

1. **The APK is in the share sheet** for `text/*`.
   - CI adds an `ACTION_SEND` intent filter to the generated manifest. It uses `sed`, the same way it adds RECORD_AUDIO (`.github/workflows/android.yml`), and the build fails if the filter is missing.
   - `MainActivity.onNewIntent` reads `EXTRA_TEXT` / `EXTRA_SUBJECT` and builds `/share?text&title`, the same route the PWA's `share_target` uses. BridgeActivity also calls `onNewIntent` from `onCreate`, so one path covers both cases:
     - **App already open:** `window.kaisFlowOpen(path)` (set in `App.tsx`, Capacitor only) runs `router.navigate`. The page keeps its state.
     - **Page not up yet** (the hook isn't there): the WebView loads `https://localhost/share?…`. Capacitor's local server serves index.html for it.
   - A restored activity, or a launch from Recents after the process died, drops the replayed intent's text, so a share is never captured twice.
   - `KaisFlowShell.setChrome` is unchanged. No plugins were added.
   - Images are left out: Paper capture will take them.
2. **Share normalisation** moved to `features/capture/shareText.ts` (`sharedText`, 4 tests).
   - It trims, drops empty parts, and keeps one copy of a repeated part.
   - New: it drops a part that another part already contains. Many apps put the subject inside the text.
3. **Capture keys on the phone.**
   - The phone's Capture API row now shows the real state (`On` / `Not set up`).
   - The phone gets the same `CaptureKeyCard` as the desktop: Create key, New key, Turn off, Copy key, Copy bookmarklet.
   - Copies confirm with a toast. If the clipboard can't be reached, the card says so.
   - The card has a **How to send things here** `<details>`:
     - the request shape, with **Copy address**
     - Android share sheet
     - iPhone Shortcuts
     - HTTP Shortcuts / Tasker
     - bookmarklet and curl (`curlRecipe()`, tested; the key goes in the header only)
     - `?file=1`
   - The desktop share-target card no longer promises screenshots.
4. **`docs/CAPTURE.md`**: setups you can copy and paste.
   - Covers iOS Shortcuts (step by step), HTTP Shortcuts, Tasker, the bookmarklet, curl and PowerShell.
   - Lists every response code, the 200-per-day cap and the key rules (shown once, hash only, header only).
5. **`?file=1` on the endpoint: opt-in AI filing.** It was small because it reuses the offline queue.
   - `POST …/capture?file=1` stores the Inbox item with `payload.needs_parse`.
   - The app's `processQueuedCaptures` parses it with the user's own session and AI allowance, then auto-files a confident task with its date. Anything else stays in the Inbox with the AI's read attached.
   - The default is unchanged: a plain Inbox item, no AI.
   - Supporting changes:
     - **Trigger:** `AppLayout` now runs the queue whenever queued items are present. Before, it ran only on the `online` event, which a fresh start never sees. This also rescues offline captures stranded when the app closed before reconnecting.
     - **Claim:** endpoint captures are claimed first with a conditional server update (`payload->>needs_parse = true` → returns the row). Two open devices therefore can't both file one.
     - **Dates:** the parse reads dates as of `created_at`, the moment of capture, not the moment it is parsed.
     - **Payload:** after the parse the rest of the payload is kept (`source` / `url`, typed overrides) instead of set to null. The overrides now survive for a manual file-to-task, as the old comment said they should.
   - The function ships with the next release (release.yml deploys functions).

## Gate

- `npx tsc -b`: 0.
- `npm run lint` (oxlint): **0 errors**, 19 warnings, all in files I didn't touch.
- `npm run build`: ok.
- vitest, from PowerShell, with no `app/.env.local` in this worktree: **83 files / 1062 tests passed** in each of UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo.
  - New tests: `shareText.test.ts` (4), `captureKey.test.ts` (+1 for curl), `capture/api.test.ts` (+2: claim → parse as of `created_at` → filed with the payload kept; and another device holding the claim).
- Mocked-backend browser check, `docs/log/assets/capture-anywhere/verify.mjs` against `npm run dev -- --port 5251 --strictPort --mode mock` (untracked `app/.env.mock.local`): **30/30**.
  - Phone row and card: no key → Create → only the SHA-256 is saved → the key appears in no request address → Copy key → how-to → Copy address → Turn off → back to Not set up. No horizontal scroll at 390px.
  - Night.
  - Desktop Integrations.
  - `/share` with a subject the text already contains → one Inbox row, then the Inbox.
  - `?file=1`: claim, parse at `created_at`, Dentist task with its date, Inbox row filed with the payload kept.
  - The dev server is stopped.
- **Android CI** (`claude/mobile-capture`):
  - Run 37116313049: APK built, emulator smoke green.
    - The SEND filter lists `com.kaisflow.garden/.MainActivity`.
    - The cold share logs `load /share?text=hello` and shows the sign-in page (the emulator is signed out).
    - The warm share logs `page /share?text=hello%20again&title=a%20page` from the same process.
  - Run 37116749969: green through the relaunch path (see Risks).
  - The final run's result is in the conductor report.

## Risks and deviations

- **Signed-out shares are dropped.** `/share` sits under RequireAuth, which redirects to sign-in. The PWA always behaved this way. CAPTURE.md says so.
- **`?file=1` files on the next open device, not on the server.** The app does it so automations can't spend the shared Groq key, and so the parse sees your projects and domains. Until a device opens, the item sits in the Inbox, visible and triageable.
- **The claim only covers endpoint captures** (`source: 'capture'`). Offline-queued items keep the old, rare two-device race. A claim there would race the outbox flush of the item itself.
- **Emulator kills the app between the two shares** (2 of 3 runs). This is the emulator, not the share code.
  - The logcat in run 37116749969 shows Play services' persistent process dying about a second after the cold share. ActivityManager then kills the app with it: "depends on provider com.google.android.gms/.fonts.provider.FontsProvider in dying proc com.google.android.gms.persistent". The WebView uses that provider for fonts.
  - The smoke now relaunches the app with a `WARN` line before the warm share and keeps `shots/share-logcat.txt`.
  - Real phones keep Play services up, so this shouldn't happen there. If a device kills the app the same way, the share is lost, since it was never written.
- **GitHub Actions didn't trigger** on the first push of `claude/mobile-capture`, a new branch pointing at an already-pushed commit. The next push did.
- **HTTP Shortcuts JSON-encode option:** I couldn't check the app, so CAPTURE.md gives the always-safe `"{{note}}"` body and notes that a `"` in the note breaks it.
- **Merge overlap with builder X** in `SettingsPage.tsx`: the phone rows array (the Capture API line sits next to Notifications and Trash) and the area after the phone's GitHub block.
