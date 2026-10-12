---
date: 2026-10-12 20:11 UTC
session: tray-notices (builder, branch claude/tray-notices off claude/kai-bugs-1012 @ dcdf2f26)
type: handoff
related: design-export/Tray and Notifications.dc.html 12h–12k · 2026-10-12-1839-local-decision-unbuilt-designs.md (design-coverage review: three notice kinds never built) · 2026-10-04-0415-tray-notify-handoff.md · 2026-10-08-2005-notify-fix-handoff.md · 2026-10-12-1842-fix-backend-handoff.md
---

# tray-notices: the three notice kinds 12k drew and nobody built

Branch `claude/tray-notices` (pushed, not merged, no PR). Migration **0065** (`0065_notice_kinds.sql`).
Edge functions changed: **notify, capture-image** (deploy both after `db push`).

All three go through the existing notification language: the words in `notify/copy.ts`, the look in
`features/notifications/kinds.ts` (so Settings → Notifications and the Activity history pick them up with no
SettingsPage edit), `deliver` for the kind switch, pause, quiet hours and lock-screen privacy, and
`plan.ts` / `showLocal` for Windows and Android.

| Kind | As drawn (12k) | When | Where |
|---|---|---|---|
| **Paper capture ready** | "Your page is read — 7 things" / "From “OS lecture 3”. 2 need a quick look." · **Review** · Captures · silent · private "A page is ready" | a capture's read reaches `done` | **Server:** `capture-image` asks `notify` `{kind:'paper_ready', capture_id}` (runtime service-role key, waitUntil) when the page it just read flips the capture to `done`. notify sends Web Push to that owner only and logs `notify.paper_ready` (`capture_id` in the payload). The service worker drops this one push while a window of the app is focused, because the results are already on screen. **App:** `features/paper/api.ts` readFrom → `tellPaperRead(row)` (one line). It sends a Windows toast, an Android notification, or an SW notification on the web, only when nobody is looking. On the web it shares the push's tag, so it shows once. The in-app toast is unchanged |
| **Birthday** | "Omar’s birthday is today" / "Last spoke 12 days ago." · **Open Omar** · People · silent · private "A birthday" (button "Open", never the name) · several on one day: "2 birthdays today" / names · Open → People | 08:00 on the user's clock (12j's time) | **Server:** pg_cron `birthday-notice` (`*/15`, `{kind:'birthday', scheduled:true}`), push users with Birthday on, whose 08:00 falls on the tick. Logs `notify.birthday` (`person_id` for one). **Windows/Android:** `plan.ts` at 08:00. TrayBridge loads people + interactions only when Birthday is on (Windows/Android) |
| **Sync problem** | "2 changes are waiting to sync" / "They’re safe on this device. We’ll keep trying." · **Open** · Sync · silent (no names, nothing to hide) | the shared sync status is troubled (offline with changes waiting, a slow write, or set-aside writes) for **5 min** while nobody is looking; **once per incident** | Client only (`features/notifications/syncIncident.ts`, fed by TrayBridge's `useSyncStatus` every minute). It shows as a Windows toast / Android notification / SW notification, and goes into the history as `notify.sync_problem` through the outbox, with `created_at` set to when it was shown. The tray K's "Changes waiting" state (12a) was already built |

**Defaults per 12i:** paper ready **on**, birthday **off**, sync problem **on**:

- 0065 column defaults;
- `copy.ts kindOn` reads an unset Birthday as off;
- `lib/settings.ts DEFAULT_SETTINGS.birthday_on = false`, so an account with no settings row also shows it off.

The test button's "what's in the way" list doesn't name Birthday when it is merely at its default.

**Rules (pure, tested):**

- **`notify/birthday.ts`**:
  - The person's Birthday fact: `date` "MM-DD" (a leading year is ignored), else `value` words ("July 17", "17 July", "Jul 17th, 1990", "17th of July"). It is parsed by hand, because `new Date('someday in spring 2000')` reads as 1 January.
  - 29 Feb falls on 1 Mar in other years, matching what the People page counts down to.
  - "Last spoke" = days from their newest interaction on or before that day, both on the user's clock.
  - `birthdayDue` gives one tick per user-day, including in :30 zones.
- **`copy.ts`**:
  - `paperReadyNotice` counts "need a quick look" with `CHECK_BELOW` 0.7, the results sheet's own threshold. A test pins it equal to `paperMath.CHECK_BELOW`.
  - Set-aside writes (outbox dead letters, "N not saved ⚠") get "N changes couldn’t be saved" / "Set aside so the rest sync on.", which is the outbox toast's own wording. The drawn "We’ll keep trying" would be false for them, since nothing retries a dead letter. This variant is the only copy not taken from the export.

**Buttons:**

- **Review** is a new action. It goes to `/inbox`, then opens that capture's results if it is still unreviewed. That is a server check, so a reviewed page is never offered twice.
- **Open Omar** and **Open** use the existing `open` action with the url.

Both work from a toast, an Android notification, a push (with or without a window: `?kfAction=review&kfTasks=<capture>`) and an Activity history row.

**Tray flyout:** 12b/12c draw no notices in the flyout, so nothing was added there. It was re-verified unchanged, day and night.

## Commits

- `80dd85c8` feat(notifications): paper ready, birthday and sync problem, as 12h–12k draw them
- (this handoff + evidence) docs(log): tray-notices handoff, harness + evidence

## Files outside features/notifications · features/tray · notify (each minimal)

- `app/src/features/paper/api.ts` — one import + one line in `readFrom` (`if (row?.status === 'done') tellPaperRead(row)`). Nothing else in features/paper.
- `supabase/functions/capture-image/index.ts` — after the page's save: when `patch.status === 'done'` and the row wasn't, fire-and-forget POST to notify.
- `app/src/features/activity/describe.ts` — `notify.paper_ready` / `notify.birthday` / `notify.sync_problem` rows (+ tests).
- `app/public/sw-push.js` — the push handler became `kfShow(n)`; `paper_ready` is dropped while a window is focused (+ tests).
- `app/src/lib/types.ts` (3 optional `AppSettings` fields), `app/src/lib/settings.ts` (`birthday_on: false` in `DEFAULT_SETTINGS`).
- `docs/DATA_MODEL.md` — `app_settings` columns, history event types, the 0065 note, `birthday-notice` in the pg_cron list, the notify row.
- `supabase/tests/fix0-auth.sh` — `birthday paper_ready` added to "a user may not send this kind".
- Not touched: `people/`, `today/`, `settings/`, `components/syncQueue.ts` (its exported `useSyncStatus` / `SyncView` were enough).

## Verification

- **vitest** (PowerShell `$env:TZ`, ×4: Africa/Cairo, UTC, America/Los_Angeles, Asia/Tokyo):
  - **1592 passed** each (was 1558).
  - `rituals/reviewWeek.test.ts` fails to *load* in a fresh worktree without `VITE_SUPABASE_*`. That was true before this branch.
  - With stand-in env vars: **130 files / 1595 passed ×4**.
- **New tests:**
  - `notifications/birthday.test.ts`: fact parsing, Feb 29 in leap / non-leap / 2100 / 2000, "today"/"last spoke" in Cairo vs LA vs Tokyo, the 08:00 tick incl. Kolkata.
  - `syncIncident.test.ts`: once per incident, persists 5 min, never while looking, reset on calm, parked wording.
  - `copy.test.ts` (+9): drawn copy, singular/plural, private mode for each, the button never names the person, defaults, `CHECK_BELOW` parity.
  - `plan.test.ts` (+5): birthday at 08:00, off by default, multi-day, Tokyo/LA day, private; blockers.
  - `sw.test.ts` (+2), `actions.test.ts` (+2, Review), `describe.test.ts` (+3).
- `npm run lint`: exit 0, **0 errors**, no warnings in touched files. `npx tsc -b`: clean. `npm run build`: green (`dist/sw.js` imports `sw-push.js`).
- **Edge functions:**
  - **Deno is not installed** on this machine, so `deno check` was not run.
  - Instead, `notify/index.ts` and `capture-image/index.ts` were type-checked strict with tsc and a Deno shim against the real supabase-js types: `app/node_modules/.bin/tsc -p docs/log/assets/tray-notices/deno-shim` → exit 0.
  - Their pure halves (copy, birthday) also run under the app's vitest.
- **Browser** (`docs/log/assets/tray-notices/verify.mjs`):
  - **59/59** against the mock backend: dev server from this worktree, `--mode mock`, http://localhost:5254, Saturday 3 Oct 2026 Cairo. Results are in `verify-results.json`.
  - 12j history desktop day + phone night: the six drawn rows with glyph discs as drawn (camera/hydrangea, people/blossom, cloud-off/hydrangea). Review → Inbox + results open. Open Omar → his page.
  - 12i settings desktop day + phone night: three rows, "Captures · silent / People · silent / Sync · silent", **on · off · on**, each switch writes its column, and a no-row account shows Birthday off.
  - Windows (stub `__TAURI_INTERNALS__`):
    - Birthday toast at 08:00 once, Open Omar → `/people/<id>`, private "A birthday" with no name, nothing when off.
    - Paper read finishing in the tray → toast "Your page is read — 7 things" / Review → results open. Private "A page is ready". No toast while looking (the in-app toast says it).
    - Offline + 1 change + window in the tray: nothing at 2 min, the K shows "changes waiting", toast at 5 min, once in 20 min. Back online → the change and the `notify.sync_problem` history row go up, stamped when said. Never while looking.
  - Flyout 12b day + night unchanged.
  - **Side-by-sides vs the drawing:** `side-12j.png`, `side-12i.png`, `side-12b.png`, `side-12k.png` (12k's copy table beside the toasts' checks). Design frames are rendered by `design-frames.mjs`.
- **Regression re-runs on this branch:** `tray-notify/verify.mjs` **57/57**, `notify-fix/verify.mjs` **26/26**.

**Not verified:**

- No live run: nothing deployed, no real Web Push sent, no real Windows toast (the IPC contract only), no Android device. The capture-image → notify call (service-role bearer through the gateway) is the same pattern the cron uses, but has only been type-checked.
- `supabase/tests/*.sh` need Docker and were not run (incl. the edited `fix0-auth.sh`).
- 0065 was not applied anywhere. It is plain `add column if not exists` + `cron.schedule` (idempotent), with no PGlite run.

## For the conductor / Kai — release order

1. **`db push` (0065) before the frontend.** Settings writes the whole `app_settings` row, and PostgREST rejects `paper_ready_on` / `birthday_on` / `sync_problem_on` until the columns exist. 0065 numbers after 0064, and 0066 is already on the base.
2. **Deploy `notify` before `capture-image`.** `capture-image` calls notify's new `paper_ready` kind; an old notify answers 400 and the read itself is unaffected.
3. Frontend last.
4. `birthday-notice` adds one function call every 15 min (≈2.9k/month). It returns at once for users with Birthday off, which is everyone until they turn it on.

**Merge watch:**

- `docs/DATA_MODEL.md` conflicts with the base's newer 0063/0064 edits on the same `app_settings` line. Take theirs and re-add `paper_ready_on bool default true`, `birthday_on bool default false`, `sync_problem_on bool default true` (migration 0065 …); keep both notes.
- `features/paper/api.ts` and `lib/types.ts` merge cleanly (trial `git merge-tree`).

**Risks and deviations:**

- **History rows only where the server sent:**
  - Like the digest/nudge/routine, a server birthday or paper-ready row is logged only for accounts with a Web Push device. Birthday sends only to those users.
  - A Windows/Android-only account sees the toast but gets no birthday history row.
  - Paper ready is always logged by the server when the read completes, unless the kind is off or paused.
- **Sync problem threshold:** 5 minutes is a `ponytail:` calibration knob in `syncIncident.ts`.
- **Android background:**
  - The incident check runs in the app's JS. On Android it fires only while Android keeps the backgrounded WebView alive.
  - Android paper ready likewise needs the app alive (server push to the APK is still FCM, still later).
- **Sync history timing:** the `notify.sync_problem` history row reaches the server only when the outbox drains, carrying its own `created_at`.
- **Paper ready, two notices when nobody is looking:** an app that is itself reading when a page completes, with nobody looking, shows its local notice and may also get the push. On the web they collapse by tag. A Windows app plus a subscribed browser on the same PC would show two, the same as every other kind.

**Files edited outside this worktree: none.**

- Every write went to `D:\Coding\kais-flow\.claude\worktrees\tray-notices` or to the session scratchpad (`D:\temp\claude\…`, for edit scripts and the first shim run).
- The conductor flagged edits to `lib/settings.ts` / `lib/types.ts` landing in `worktrees/kai-bugs`. Those did not come from this session: when checked read-only, kai-bugs showed no diff, and the same edits are in this branch's commit.
- `git worktree add` (as instructed) is the only thing that touched the main repo's `.git`.
- `app/.env.mock.local` was copied into this worktree (gitignored).
