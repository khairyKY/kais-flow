---
date: 2026-10-04T04:57+03:00
session: builder P (Paper capture v1 — a photo of handwritten notes becomes tasks)
type: handoff
related: design-export/Paper Capture.dc.html (11a–11o) · Vault "Claude Design Prompts/11 — Paper capture.md" · Vault "Kai's Flow — Brainstorm — Notebook page & Paper capture.md" §B · docs/DATA_MODEL.md (0048) · docs/log/assets/paper-capture/
---

# Paper capture v1: a photo of your notes becomes tasks

Branch `claude/paper-capture`, cut from `origin/claude/wave-q` (2a23071). Not merged, not deployed.

In `SettingsPage.tsx` I touched only the capture card area: one import, and `<PaperSettingsCard />` placed under the desktop "Capture from anywhere" grid and under the phone's capture key card.

| # | Commit | What |
|---|---|---|
| 1 | 1b82b6c | Backend: migration 0048, `capture-image`, the `vision` allowance, the photo sweep, `capture-image` in release.yml FUNCTIONS |
| 2 | 9bcf362 | Quick look, reading, the results sheet, the states, the offline queue |
| 3 | 1a1974a | Capture surfaces: camera in the capture sheet, Inbox → Scan paper, drop overlay, paste |
| 4 | 3b2a8d8 | Settings → Capture → photos |
| 5 | 0037554 | Fixes found by the harness and review (see below) |
| 6 | this one | Evidence and this note |

## The flow, as built

1. **Taking the photo.** All entry points open the same quick look:
   - the capture sheet (the centre button's tap) has a camera button;
   - Inbox → **Scan paper** (in the tabs row, both tabs, phone and desktop);
   - desktop: drop an image anywhere (the paper veil, "Drop a page to read it"), or paste one into the capture bar.

   The camera is a plain `<input type="file" accept="image/*" multiple capture="environment">`, made on the fly. It sets the `capture` attribute, not the property: desktop Chrome has no `.capture` property, so the property would set nothing. The gallery is the same input without `capture`.
2. **A quick look (11b/11c).** You get rotate, a page strip (up to 5 pages) and + Add page / Retake. **Read** prepares each page:
   - decoded with `createImageBitmap` (EXIF orientation applied);
   - turned by the chosen rotation;
   - drawn on a canvas at ≤1600px long edge;
   - JPEG quality stepped 0.82 → 0.5 until it is ≤250 KB.
   The pages go up to the private `captures` bucket at `<uid>/<capture>/<n>.jpg`.
3. **Reading (11d).** The app calls `capture-image` once per page, so the page thumbnails tick off one at a time. **Leave it reading** hides the flow and the read goes on. When it finishes, a toast says "Your page is read · 7 things · Review", and the Inbox shows a "Ready to review" row. The function also registers `EdgeRuntime.waitUntil`, so a page that has started keeps going if the phone leaves.
4. **Results (11e–11h, 11m).** On a phone it's a kit BottomSheet; on desktop it's a centred panel with the page beside the lines, and hovering a line outlines where it came from. Each line is a kit SwipeRow:
   - a type chip (Task / Event / Note / Journal) with a menu;
   - the text, editable on tap;
   - a date chip and a project chip.

   A line under 0.7 confidence shows its **handwriting crop** with "✎ Check this" on a buttercream tint. The crop is a CSS crop of the photo. It uses this device's own copy when it has one, otherwise a 1-hour signed URL. Nothing extra is stored.

   - Swipe left drops a line, with Undo; ⊞ → "Drop this line" does the same on desktop.
   - **Add all N** writes through the usual helpers:

     | Line | Becomes |
     |---|---|
     | task | `createTask`, with `external_ref = {source:'photo', id:'<capture>:<page>:<line>'}` |
     | event | `createEvent`: one hour if timed, all-day if not. With no date it goes to the Inbox instead |
     | note | an Inbox item with its read in `ai_parse` and `payload = {source:'photo', source_ref, page, box, title}` |
     | journal lines | all joined into one entry for today |

   - One toast reports what was added ("Added 4 tasks · 1 event · 2 notes · a journal entry") and its Undo takes everything back.
   - **Inbox only** sends every line to the Inbox as a note, each keeping its read.
   - Inbox rows from a photo show 📷 + the page title, and tapping it reopens the photo. The task sheet gets a "From a photo of your page" link.
5. **States:**
   - couldn't read (11i): Retake / Pick another photo, and the useless photo goes at the next sweep;
   - daily limit (11j): "That's 15 pages today", Type them in / Read it tomorrow. The photo is kept and read the next Cairo day;
   - camera off (11k): Pick from gallery instead;
   - Groq busy: "We'll read your page in a bit", retried after 90 s;
   - failed: Try again;
   - offline (the 11a variant): pages wait in IndexedDB. The capture sheet shows a "2 pages waiting · read when online" chip and a dot on the centre button, and they upload and read on reconnect;
   - night theme throughout (11n).
6. **Privacy + storage:**
   - photos are kept 7 days;
   - the hourly pg_cron `capture-photo-sweep` deletes expired ones through the Storage API;
   - Settings → Capture → photos offers **Keep for 7 days / Delete after reading**. "After reading" means the photo goes within the hour after you review it: the crops need the photo during the review;
   - Settings also shows "Scans today N of 15" and the device's queue;
   - capture reads stay out of the persisted query cache, like journal entries;
   - photos go to Groq only, as a 5-minute signed URL that Groq fetches.

**11l (the ticks loop) is skipped:** it needs the Notebook page, which isn't designed yet.

## The vision model

The default is `GROQ_VISION_MODEL` = **`qwen/qwen3.8-27b`**. Groq's vision docs, checked 2026-10-04, list it as the one image-input model:
- **Limits:** up to 3 images per request, 2,048 tokens per image, 20 MB.
- **Output:** JSON mode works with images.
- **Language:** it reads Arabic as well as English.
- **Settings I send:** `reasoning_effort: 'low'` and `reasoning_format: 'hidden'`, because reasoning tokens spend the same budget.
- **Status:** it is a **Preview** model.
- **Free plan:** 30 RPM, 1K RPD, 8K TPM, 200K TPD.
- **Per page:** about 4–5K tokens, so roughly 2 pages a minute and about 40 a day for everyone. So `AI_GLOBAL_LIMIT_VISION` defaults to 40 and `AI_DAILY_LIMIT_VISION` to 15.

`GROQ_VISION_MODEL_FALLBACK` is opt-in, empty by default: no second vision model is on the free plan today. The gpt-oss models and llama-3.x are text-only, and llama-4 has left the list.

**What Kai must set:** nothing, because `GROQ_API_KEY` is already a secret.
- Set `GROQ_VISION_MODEL` only if Groq retires or renames the Preview model.
- Optional: `GROQ_VISION_MODEL_FALLBACK`, `AI_DAILY_LIMIT_VISION`, `AI_GLOBAL_LIMIT_VISION`.

The release pipeline pushes 0048 and deploys `capture-image`. The sweep cron uses the existing Vault `service_role_key`.

## Gate

| Check | Result |
|---|---|
| `npx tsc -b` | 0 |
| `npm run lint` (oxlint) | **0 errors**; 19 warnings, all in files I didn't touch |
| `npm run build` | ok |
| vitest, from PowerShell, no `app/.env.local` in this worktree | **89 files / 1115 tests passed** in each of UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo |

New and changed tests:
- `features/paper/paperMath.test.ts` (17): resize and rotate maths, box → crop (incl. max width and edges), confidence bucket, scans left, which captures to resume (including a daily-limit page waiting for the next Cairo day), clock detection, project matching, dates from the photo's time on the Cairo clock, results → writes for Add all and Inbox only, the toast text.
- `features/paper/read.test.ts` (12) runs the edge function's pure half: the prompt (Arabic, "never translate", 0–1000 boxes), box normalising, answer → lines, 429 backoff, the row after a page, and storage path ownership.
- `lib/queryClient.test.ts`: the personal roots list now includes `captures`, `capture` and `capture_urls`.

Deno isn't on this machine, so `supabase/functions/capture-image/index.ts` is not type-checked. `read.ts` is checked through the app's tsc and vitest.

### Mocked-backend browser checks: **122/122**

The harness is `docs/log/assets/paper-capture/verify.mjs`. It runs against `npm run dev -- --port 5254 --strictPort --mode mock` (untracked `app/.env.mock.local`) at http://localhost:5254, on a 390 phone with touch and a 1280 desktop, day and night. The page photos are drawn by the harness (lined paper, Caveat; one is 1800×2400, so the resize is real). Storage uploads are kept and served back on their signed URLs, and `capture-image` answers per scenario; Groq is never called.

What it covers:
- **Surfaces:** the camera in the capture sheet (48 target) and the offline chip + dot; Scan paper opens `capture="environment"`.
- **Quick look:** 1 page, then 3 with the strip; rotate.
- **Reading:** "you can leave"; three uploads to `<uid>/<capture>/<n>.jpg` as JPEG, ≤1600 px and ≤250 KB; one call per page, in order, with projects and `taken_at`.
- **Results:** "9 things", 2 unsure lines with real crops, the chips, no horizontal scroll, no text under 12 px; type → Event, edit the text, swipe-drop with Undo.
- **Add all:** the recorded writes (4 tasks with photo links, the Quiz as an all-day event on Sun 11 Oct, 2 Inbox notes with `source_ref`, 1 journal entry, the capture marked reviewed), the toast, the 📷 rows reopening the photo, and Undo deleting all of it.
- **Arabic page:** RTL lines, "٥" → Today 17:00 as an Event with a crop. Then Inbox only: 3 notes, with the event's read kept.
- **States:** couldn't read and Retake; the daily limit and "Type them in"; camera off → the gallery; Groq busy.
- **Connection drops:** dropped between upload and first read → waits on the device, read on reconnect without a second upload. Fully offline → "Saved — 1 page waiting" → online → uploaded, read, Review.
- **Leave it reading:** toast + Inbox "Ready to review".
- **Desktop:** drop overlay → quick look → centred panel that fits the viewport, with hover-to-locate; paste into the capture bar.
- **Settings card:** phone and desktop; "Delete after reading" writes `capture_keep_photos = false`.

Screenshots and side-by-sides (`side-11a … side-11o`, design | build) are in `docs/log/assets/paper-capture/`. The design frames were rendered from `Paper Capture.dc.html` with `support.js`. The dev server is stopped.

## Deviations

- **Camera button placement.** The capture sheet has no toolbar today, so the camera sits at the right of its input row. The mic glyph stays on the left, and tap / hold on the centre button are unchanged.
- **Lock-screen notification (11d).** Not built. A push belongs to `notify` (builder N's area); here the toast and the Inbox row carry it.
- **No new inbox column or kind.**
  - Inbox notes use `payload.source = 'photo'` + `payload.source_ref`, the convention endpoint captures already use.
  - Tasks use `external_ref`.
  - Events and journal entries don't link back: their helpers have no slot for it.
- **The daily cap is counted by the server** in `ai_usage` (kind `vision`, one per page) rather than by counting capture rows. A user can't reset it by deleting a capture, and it also gives the all-users cap. A page that hits Groq's 429 still counts.
- **Dates.** The model returns date words in English with ASCII digits. The app's own capture parser turns them into dates (`parseCommand`, Cairo clock, from when the photo was taken). `parse-capture` is itself a Groq call, and a second call per line would double the budget.
- **Not built:**
  - long-press multi-select on result lines;
  - editing the date or project chips (do it after adding, in the task sheet);
  - page reorder ("hold to reorder");
  - the desktop ⌫ / T keys;
  - the 11k "Open system settings" link (a web page can't open it);
  - HEIC / PDF (the browser can't decode them; the overlay says JPG · PNG · WEBP);
  - the phone share target for images (brainstorm phase 4).
- **Android.** No manifest change. Capacitor's file chooser opens the camera app by intent, and that needs no permission while the app doesn't declare CAMERA. Declaring CAMERA would make Capacitor demand it. The camera-blocked check is skipped in the shell for the same reason.

## Risks

- **The model is in Preview.** If Groq renames it, reads fail as "upstream" (Try again) until `GROQ_VISION_MODEL` is set.
- **Untested against the real API.** `reasoning_format: 'hidden'` with `json_object` on qwen, and Groq fetching a signed Supabase URL, were never tried against the real API from here.
- **Box format.** Box quality depends on the model. It is asked for Qwen's native `[x1,y1,x2,y2]` on a 0–1000 grid, normalised server-side; a missing or bad box just means no crop.
- **Free-plan throughput** is about 2 pages a minute for everyone (8K TPM). The function retries 429s for up to about 20 s × 2, then queues the page, and the app tries again 90 s later.
- **Storage policies.** 0048 creates the `storage.objects` policies and the bucket from a migration. If `db push` refuses on the hosted project, create the four owner-folder policies in the dashboard (they are in the migration).
- **Local stacks.** On `supabase start`, `SUPABASE_URL` is internal, so Groq can't fetch the signed URL. This only matters locally.
- **Not cross-checked with S2 / N.** Shared files touched:
  - `AppLayout.tsx`: one import + `<PaperHost />`;
  - `CommandBar.tsx`;
  - `CaptureButton.tsx`;
  - `InboxPage.tsx`;
  - `TaskSheet.tsx`;
  - `SwipeRow.tsx`: right swipe optional, `deleteLabel`;
  - `icons/kf`: camera, rotate, image;
  - `queryClient.ts`;
  - `types.ts`;
  - `_shared/quota.ts`: the `vision` kind;
  - `config.toml`;
  - `release.yml`.
