---
date: 2026-10-12 17:49 UTC
session: journal-media (builder)
type: handoff
related: Kai report 2026-10-12 (Journal "Talk it out" / "+ Photo" do nothing); P7a (docs/phases/P7-life-os.md)
supersedes: none
---

# Journal media: handoff

Kai: in the Journal there's "Talk it out" and "+ Photo", but neither does anything. Both were plain
`<span>`s with no handlers, copied from `design-export/Journal.dc.html`. Branch `claude/journal-media`
(from `origin/master` v1.0.28, 366ac69c). **Not merged, no PR.**

## What changed

| | Before | Now |
|---|---|---|
| 🎤 Talk it out (desktop) / 🎤 Talk (phone) | hairline-grey span, no handler | a button in ＋ New entry's style (mono caps, terra). It opens the existing `VoiceCaptureSheet` with `onText`. The transcript goes through the existing `transcribe` function (Groq Whisper, no new provider). The words are added to the day's **latest entry** as a new paragraph and accumulate in `journal_entries.transcript`. On a blank day it starts the first entry. A body save still waiting on its debounce is cancelled first, so it can't write the old text back. |
| ＋ Photo | hairline-grey span | a button that opens a real file input (`accept="image/*"`, several files at once). In the **Android shell** it opens an ActionSheet first: "Take a photo" (`capture="environment"`) or "Choose from your photos". Capacitor's WebView only offers the camera when `capture` is set; see `BridgeWebChromeClient.onShowFileChooser`. Browsers put the camera in their own picker. Each file is compressed with Paper's `preparePage` (≤1600px, JPEG stepped down to about 250 KB), uploaded to `journal/<uid>/<entry>/<uuid>.jpg`, then the path is added to `media_paths` through the outbox. |
| Photos on an entry | never shown | 72px thumbnails under the entry's text, from 1-hour signed URLs (Paper's pattern). Tap one to open it full size in a new tab. × asks to confirm with `ConfirmCard`, deletes the Storage object, then drops the path. |
| Offline / a failed upload | — | The words are untouched: they're already in the outbox and typing never waits. A toast explains what happened: "Photos need a connection — your words are saved. Add it again once you're online." (offline) or "The photo didn't upload — your words are saved. Try it again in a bit." (other failures). A file the browser can't decode gets "Couldn't open that photo — try a JPG or PNG." Remove while offline changes nothing and says so. |

Files:
- `app/src/features/journal/JournalPage.tsx`: the handlers, `EntryPhotos`, footer buttons, and shared overlays.
- `app/src/features/journal/media.ts` (new): the picker, compress + upload, delete, and signed URLs.
- `app/src/features/journal/journalDay.ts` (+ tests): pure `journalPhotoPath`, `addMedia`, `removeMedia` and `appendTranscript`.
- `supabase/migrations/0060_journal_media.sql` (new): private bucket `journal`, 1 MB, jpeg/webp/png. Four `storage.objects` policies with the same shape as 0049's `captures` ones (`(storage.foldername(name))[1] = auth.uid()::text`). No sweep.
- `docs/DATA_MODEL.md` (0060 bullet), `docs/phases/P7-life-os.md` (Notes: deviation).

## Evidence

- `cd app && npx vitest run`: **121 files, 1489 tests passed** (baseline 1484, plus 5 new in `journalDay.test.ts`).
- `npm run lint` (oxlint): exit 0, **0 errors**, no journal warnings. `npm run build`: green (`tsc -b` + vite + PWA).
- Browser harness `docs/log/assets/journal-media/verify.mjs`: the real `/journal` page in mock mode (dead backend, Playwright answers REST, Storage and `transcribe`), with Chrome's fake mic. Phone 390 and desktop 1280, day and night. **75/75 PASS** (`results.json`):
  - Both affordances are buttons in terra.
  - Talk it out: transcript saved, body gains a paragraph, the textarea shows it, nothing goes to the Inbox.
  - Photo: uploaded under `<uid>/<entry>/…jpg`; a PNG is re-encoded as JPEG; a 27 MB 12 MP photo uploads at 62 KB; `media_paths` updated; body kept; thumbnail renders.
  - Remove: the object is deleted, the path dropped, the thumbnail gone.
  - Failed and offline uploads: clear toast, typing and body kept, no path written.
  - No horizontal scroll, no console errors.
  - Screenshots: `desk-day-2-photo.png`, `phone-night-2-photo.png`, `phone-day-1-footer.png`, `desk-offline-toast.png`.
- Migration: **no Docker on this laptop, so not run against a real Supabase DB.** `0060-pglite-check.mjs` runs the SQL twice (idempotent) on PGlite against a stand-in `storage` schema (Supabase's `storage.foldername` definition, RLS on `storage.objects`). **12/12 PASS** (`0060-pglite-check.txt`):
  - bucket private, 1 MB, images only; four policies;
  - A writes `A/…` but not `B/…` or the root;
  - the journal policies don't open `captures`;
  - A sees and deletes only A's objects.
  - Not checked: the size and mime limits, which the Storage server enforces.

## For Kai / the conductor

- **[KAI] `db push`** for 0060 before this ships. Until it's pushed, + Photo fails with the "didn't upload" toast and nothing is lost. Talk it out needs no migration.
- Not verified: a real device (the Android shell camera sheet, iOS Safari's picker) and a real upload against Supabase Storage.
- Known gaps, not in scope:
  - **Compost leaks photos.** `compost_expired()` hard-deletes an entry 30 days after Trash, but its Storage objects stay. They can only be removed through the Storage API, so it needs a small edge-function step, like the capture sweep.
  - A photo-only entry doesn't count as "written" for the streak or the "kept" markers (`isWritten` reads `body`).
  - The voice audio isn't stored. P7a's accept line says "transcript + audio"; that's noted as a deviation in the P7 Notes.
  - The phone × button is 24px, below the 44px target. That's a design call for Kai.
  - Each upload is sequential and the status line says "Adding photo…" with no per-photo placeholder.
