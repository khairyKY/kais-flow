---
date: 2026-10-13 06:13 UTC
session: journal-hygiene (builder)
type: handoff
related: 2026-10-12-1749-journal-media-handoff.md ("Known gaps" 1, 2, 4); v1.1.1 patch
supersedes: none
---

# Journal hygiene (v1.1.1): handoff

Branch `claude/journal-hygiene`, from `origin/claude/kai-bugs-1012` (e6b64c74, the v1.1.0 base). Pushed.
**Not merged, no PR.** Three of the journal-media handoff's known gaps, nothing else.

## What changed

| | Before | Now |
|---|---|---|
| 1 · Compost leaked journal photos | `compost_expired()` hard-deleted an entry 30 days after Trash (and Trash's "Delete forever" at once); its objects stayed in the `journal` bucket for good. | The hourly `capture-photo-sweep` (0049 → `capture-image` `{action:'sweep'}`) also sweeps the `journal` bucket, through the Storage API, after the captures step. Per `<uid>/` folder it lists the `<entry>/` folders, looks those ids up in `journal_entries` **for that uid, trashed rows included** (100 ids a query, far under PostgREST's 1000-row cap), and for an entry with **no row** removes that folder's files uploaded **more than 30 days ago**. |
| 2 · Photo-only entry not "written" | `isWritten` read `body` only: a day with just a photo was "empty" in This week, out of Kept and Day N, and the first-page line still showed. | `isWritten` = words **or** at least one photo. |
| 3 · The photo's × on a phone | Drawn 24px with `.kf-hit` (inset −12px), but the 72px thumbnail clips its overflow, so a finger reached only **39×39** (measured). | `.kf-hit.kf-hit-corner`: the `--touch-min` square is anchored at the glyph's own top-right corner and grows down and in, so it stays inside the photo: **49×49 hit** (measured), 24×24 drawn, coarse pointers only. |

### 1 · The sweep's safety rules (pure, `supabase/functions/capture-image/journal.ts`)
- Only a photo whose entry row is **gone**. A row in Trash is still a row: its photos stay whatever `deleted_at` says, including a row past 30 days that compost hasn't reached yet.
- Only `<uid>/<entry>/<file>` where both folders are lowercase ids (Postgres returns ids lowercase, so an uppercase folder could never match its row; it's skipped, not "gone"). Only plain files, never sub-folders. A row counts only for its own user.
- Only files uploaded more than 30 days ago. A composted entry's photos are always older (uploaded before the entry went to Trash, 30+ days before compost), so this never delays compost; it shields a photo whose brand-new entry row is still in a device's outbox. "Delete forever" photos wait out the 30 days from upload.
- Any error (a listing, a query, a remove) throws out of the journal step before another delete; it's logged and the captures step's answer still returns (`{captures, photos, journal_photos}`).
- Not collected (by design: the row still exists): a photo removed from a live entry while offline, where the path left `media_paths` but the object stayed (JournalPage's `removePhoto` ponytail note).
- No migration: no new cron, function or column.

### 2 · Every caller checked
- `isWritten` callers that mean "written": `dayOrdinal` (Day N), `daysWrittenThisMonth` (Kept), JournalPage `firstPage`, This week's "kept"/"empty". All now count a photo.
- Callers that quote **words** now read `body` themselves, so they don't show an empty line: JournalPage "On this day" (`"{body}"`) and `WidgetBridge`'s home-screen journal line (its `isWritten` import is gone). Same behaviour as before for both.
- Focus's fern note said "unwritten journal" for a photo-only day; it now says "1 photo tonight" / "N photos tonight" (the "N words tonight" pattern; not in the export, which only has "480 words tonight").
- Server: no edge function computes a written day (grep of `supabase/functions`), and the SQL (search_hybrid, compost) never does either.

## Files written
- `supabase/functions/capture-image/journal.ts` (new): the sweep's selection rules, pure.
- `supabase/functions/capture-image/index.ts`: `sweepJournal()` + `listJournal()`, called from `sweep()`.
- `app/src/features/journal/journalSweep.test.ts` (new): 5 tests, including "entry in Trash < 30 days → photo kept".
- `app/src/features/journal/journalDay.ts`, `journalDay.test.ts` (+2 tests).
- `app/src/features/journal/JournalPage.tsx`: On this day reads words; the × gets `kf-hit-corner`.
- `app/src/features/widgets/WidgetBridge.tsx`, `app/src/features/focus/FocusPage.tsx`.
- `app/src/components/AppLayout.tsx`: the `.kf-hit.kf-hit-corner::after` rule beside `.kf-hit` (X4).
- `docs/DATA_MODEL.md`: the 0060 bullet's "No sweep / Known gap" struck with a pointer; a new "Journal photo sweep" bullet; the `capture-photo-sweep` cron row notes the journal step.
- `docs/log/assets/journal-media/verify.mjs`: new checks (below); `open()` takes seeded `entries`.
- `docs/log/assets/journal-hygiene/`: `results.json` (96/96) and `phone-{360,390,430}-3-photo-x.png`.
- This file, plus one line in `docs/log/INDEX.md`.
- Untracked, not committed: `app/.env.mock.local` (copied from the main checkout for the mock server).

## Deploy order
1. **No `db push`** for this patch. It needs v1.1.0's migrations already pushed: 0060 (the `journal` bucket) and 0070 (`capture-image` selects `captures.drawings`). Without 0060 the journal step just logs a Storage error; the captures step is unaffected.
2. `supabase functions deploy capture-image`: the only function. The next `:23` run sweeps. Its answer (`journal_photos: N`) is in `net._http_response`; errors are in the function log as `capture-image sweep: journal`.
3. The app (Cloudflare Pages): items 2 and 3 are client-only and can ship on either side of step 2.

## Evidence
- `npx vitest run`, PowerShell `$env:TZ` = Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo: **150 files, 1987 tests passed** in each (the v1.1.0 baseline was 1980, plus 7 new).
- `npm run lint` (oxlint): exit 0, **0 errors** (21 warnings, all pre-existing, none in touched files). `npm run build`: green. `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new** (2 fixed since).
- Edge-function types: there's no deno here, so `capture-image/index.ts` (with `journal.ts`, `read.ts` and `_shared/*`) was type-checked with `tsc --strict` against the app's `@supabase/supabase-js` + `zod` types (the `npm:` specifiers mapped through `paths`, a two-line `Deno` shim): exit 0. Rehearsal's `deno check` is the real gate.
- Browser, mock backend (dev server from this worktree, `--mode mock`, port 5266, routes warmed first): `node docs/log/assets/journal-media/verify.mjs <out> http://localhost:5266` → **96/96 PASS** (the 75 existing checks still green, plus 21 new):
  - phone 360 / 390 / 430: the photo-only yesterday makes it "Journal · Day 2"; the × still draws 24×24; its hit area (elementFromPoint over the photo and 20px around it) is 49×49 with 0 px outside its own photo; the next photo (8px away), the words just above it and the photo's own link keep their taps; no console errors.
  - desktop 1280: This week shows "Sunday, Oct 11 · kept" for the photo-only day, and Kept reads "2 days".
  - The new checks fail on the pre-fix code (run against e6b64c74's `journalDay.ts` + `JournalPage.tsx`, then restored byte-for-byte): Day 1, hit 39×39, "EMPTY", no "2 days" → 88/96.
- Screenshot: `phone-390-3-photo-x.png`. The × looks the same as before.

## Not verified
- The sweep against real Supabase Storage. Not run on a local stack (no Docker here), and not against production. The folder listing (`list(prefix)` returning folders with `id: null` and files with `id` + `created_at`) is what the selection relies on. If a listing comes back in another shape, the result is that nothing is deleted. The selection logic is unit-tested; the Storage IO is not.
- Real devices (the × on an Android/iOS finger).

## Notes
- Item 3's brief said "the phone 📷 button is 24px". The only 24px photo control is the remove ×, which is what journal-media's gap names ("The phone × button is 24px"), so that's the one fixed. The card footer's text buttons on a phone (＋ New entry, 🎤 Talk, ＋ Photo) measure about 18px tall (＋ Photo is 61×18). They're also under 44 and weren't touched (no extras). Giving them a vertical-only pseudo-element would avoid overlapping each other, since they're 12px apart.
