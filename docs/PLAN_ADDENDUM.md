# Kai's Flow — Plan Addendum: Video Validation & Gap-Fill

> **What this file is:** the result of validating `PLAN.md` + `docs/phases/P0–P7` word-for-word against Jared Hill's full walkthrough transcript, then interviewing Kai on every gap found. It's a **diff**, not a replacement — read it alongside `PLAN.md` (north star, parity matrix, architecture), `docs/DATA_MODEL.md` (schema), and `docs/ROADMAP.md` (build status).
>
> **How to use it:** when a session next touches a phase referenced below, apply that phase's amendments from this file *in addition to* the phase file's existing scope, then fold the change into `PLAN.md`'s parity matrix / `DATA_MODEL.md` / the phase file itself so this addendum can eventually be retired. Until then, this file is the source of truth for the items below — the phase files have not been edited yet.

---

## 1. Summary — every gap, decision, and where it lands

| # | Gap found vs. the video | Decision (Kai, July 2026) | Lands in |
|---|---|---|---|
| 1 | P5 ships chat/resurfacing before P7a's library data exists — thin at first | **Accepted as-is.** Ship P5 on schedule; document that it's intentionally thin until P7a lands. | No phase change — expectation-setting only (§2) |
| 2 | No "Area" entity — video splits ongoing Area Projects from time-boxed Projects/Retainers | **Add a real `areas` entity.** | P1 retrofit (§3) |
| 3 | No per-task reminder mechanism (video sets "alert 5 min before" per task) | **Full custom reminders** — offset/absolute field + notify sweep. | P1 (schema) + P4 (notify) retrofit (§4) |
| 4 | Routines schema too narrow (no "any time", no exact clock time, no per-routine notification toggle) | **Add all three**, fully configurable per routine. | P4 retrofit (§5) |
| 5 | No phase owns a real Settings UI (health checks, last-synced, force sync, timezone) | **Bundle into P6.** | P6 addition (§6) |
| 6 | Kindle/Books reduced to bare quotes with metadata — video treats books as a full entity | **Full `books` entity**, generic CSV import as the primary path (Kai has no Kindle); Kindle `My Clippings.txt` import kept as an optional secondary path for whenever real Kindle data exists. | P7d amendment (§7) |
| 7 | "Resurfacing" (random inspiration) and "needs review" (AI-flagged follow-ups in notes) were conflated into one P5 feature | **Build as two separate modules.** | P7a amendment (§8) |
| 8 | No persistent in-app notification/capture history (only ephemeral toasts + external push) | **Add a log UI** — reuses `activity_log`, no new table. | P4 retrofit (§9) |
| 9 | No external capture endpoint outside the browser (video's Apple Watch Shortcut) | **Build an Android equivalent** (authenticated webhook for Tasker/widget/share-sheet automations), not iOS. | P6 addition (§10) |
| 10 | No dedicated keyword Search UI — FTS/embeddings (P5) only power the chat function | **Add a Search UI**, extended incrementally as new content types land (same pattern as chat/resurfacing). | P5 amendment (§11) |
| 11 | Checklist design diverges from the video either way (separate list vs. real tasks) | **Make it configurable per item/template** — Kai chooses whether an instantiated checklist item becomes a real task or stays a lightweight checkbox. | P7d amendment (§12) |
| 12 | Content Pipeline (P7c) doesn't match Kai's life (he doesn't create content) | **Mark dormant** — same pattern as P6's optional email-capture. Spec stays; no build. | P7c status change (§13) |
| 13 | Task ↔ content-item link (video connects tasks to videos/articles) | **Dormant along with #12** — only needed if content pipeline is ever reactivated. | Noted in §13 |

---

## 2. §1 — P5/P7a sequencing (no schema change, expectation only)

**Decision:** keep the roadmap order (P5 before P7a) exactly as planned.

When P5 ships and its acceptance checklist passes, **the chat and resurfacing features will only have `tasks` and `inbox_items` to draw from** — the video's actual showcase moment ("chat with hundreds of notes/quotes/journal entries", "one quote/journal entry rotates daily") doesn't land until P7a's `journal_entries`/`notes`/`quotes` tables exist and their embed triggers are wired in (P7's own pitfall note already requires this extension work). This is intentional, not a bug — just don't judge P5's real-world usefulness until P7a is also done.

No phase-file change needed here beyond this documented expectation.

---

## 3. New entity: `areas` (P1 retrofit)

The video's hierarchy has three container types below a Domain, not two:
- **Project** — time-boxed, has milestones/an end date.
- **Retainer** — recurring monthly engagement.
- **Area Project** — ongoing, no end date, no milestones (e.g. "Home", general "Hill Media Group" upkeep). This is what the video calls an Area.

Kai's Flow's `projects.type` only encodes `standard | retainer` — there's no equivalent of the third bucket beyond bare tasks hanging off a `domain_id` with no container at all.

**Schema addition** (new table, `DATA_MODEL.md` §P1):

| Table | Columns (beyond universal) |
|---|---|
| `areas` | `domain_id uuid FK`, `name text`, `description text?`, `color text?`, `sort_order int` |

- `tasks.area_id uuid?` added alongside the existing `project_id`/`domain_id` — a task can belong to a project, an area, or neither (bare domain-level), matching the flexibility the video shows.
- Areas get their own simple CRUD page (`features/areas/`), same rename/merge affordance as domains (cheap restructuring is Jerad's lesson #1 — apply it here too).

**Slipping consequence — decided 2026-07-04:** the video explicitly lists Areas alongside Projects as things that can go stale ("it's not just projects, it's also tasks and other areas as well"). Kai's earlier answer to the Slipping-scope question ("no, projects/domains only") was given *before* Areas existed as an option in this conversation — it was answering whether **tasks** should be included, which stays "no." Kai has since confirmed: **extend `slipping` to include `areas`**, using the same last-`activity_log`-touch logic already applied to projects/domains. Built as part of the areas retrofit — see `docs/phases/P1-P4-retrofit.md` §Steps 3.

**Where this lands:** P1 is marked done, so this is retrofit debt — a small follow-up migration + UI slice, best done as prep work whenever a session picks up P6 (the next not-yet-started phase) or earlier if convenient. Not blocking any other phase.

---

## 4. Per-task reminders (P1 schema + P4 `notify` retrofit)

The video sets reminders independent of due date ("set an alert for five minutes [before]"). Nothing in the current schema or `notify` function supports this — only `morning_digest`/`evening_nudge`/`overdue`/`test`.

**Schema addition** (`tasks`, `DATA_MODEL.md` §P1):
- `reminder_at timestamptz?` — nullable; if the capture doesn't specify one, it stays null (no forced default noted in the video beyond Jerad musing about wanting one — not committed to as a decision here, so don't build silent auto-reminders).
- Voice/text capture (P2's `parse-capture`) gets a new optional output field: `reminder_offset_min?` (e.g. "5 minutes before") — the client resolves this to an absolute `reminder_at` from `due_at`/`scheduled_start` at write time.

**`notify` retrofit** (P4):
- New `notify` kind: `task_reminder`.
- New pg_cron sweep (e.g. every 5 min): find tasks where `reminder_at` has just passed and no reminder sent yet (`reminder_sent bool default false` column, or a `logActivity('task.reminder_sent', …)` check against `activity_log` to avoid a new flag column — either is fine, pick whichever is less schema).

**Where this lands:** P1 (schema) and P4 (`notify` + cron) are both marked done — this is retrofit debt on two shipped phases, small in scope (one column, one notify kind, one cron job).

---

## 5. Routines schema expansion (P4 retrofit)

Kai wants all three gaps closed, fully configurable per routine:

**Schema changes** (`routines`, `DATA_MODEL.md` §P4):
- `time_of_day text check in ('morning','afternoon','evening','any_time')` — widen the constraint to add `any_time`.
- `scheduled_time time?` — nullable exact clock time (e.g. `07:15`); when set, the routine also has (or overrides) its time-of-day bucket for sorting purposes.
- `notify bool default true` — per-routine toggle; `notify`'s digest/nudge logic must check this before including a routine in a push.

**UI:** the routine create/edit form gains a time-of-day selector including "Any time", an optional exact-time picker, and a notification on/off switch — matching the video's form fields exactly.

**Where this lands:** P4 is marked done — this is retrofit debt (three columns + one form + one `notify` condition check), independent of the reminders retrofit in §4 but touches the same files.

---

## 6. Settings UI (P6 addition)

The video's Settings page: per-integration health checkmark, "last synced" timestamp, a force-sync button, and a timezone control. No phase currently owns building this beyond P0's placeholder route.

**Decision:** bundle into P6, since that's when GitHub (the first real integration) ships — extend to cover Google Calendar (P3b, if ever connected) using the same pattern.

**Build (added to P6's scope):**
- `features/settings/` — real page (replacing the P0 placeholder).
- Per integration row (`github`, `google` if connected): status pill (connected/error/not connected), `integrations.data->>'last_synced_at'` timestamp, a "Sync now" button that calls the relevant edge function directly (`github-sync { action: 'sync' }`, `gcal-sync { action: 'full' }`).
- Timezone field bound to `app_settings.timezone` (already exists in the schema since P2/P4 — just needs a UI).
- `integrations.data` gains a `last_synced_at timestamptz?` + `last_error text?` pair (small addition, both `github-sync` and `gcal-sync` write it on every run) so the checkmark/timestamp has something real to read.

---

## 7. Books entity (P7d amendment)

Kai doesn't own a Kindle. He wants a book database he can build up himself (CSV import) now, with a path to authentic Kindle-sourced data later.

**Schema addition** (new table, `DATA_MODEL.md` §P7):

| Table | Columns |
|---|---|
| `books` | `title text`, `author text?`, `cover_url text?`, `status text check in ('want_to_read','reading','finished','abandoned')`, `format text?`, `started_at date?`, `finished_at date?`, `rating int?`, `isbn text?`, `summary text?` |

- `quotes.book_id uuid?` FK added — a quote becomes a book highlight when linked; unlinked quotes (article/podcast/conversation source) work exactly as already planned.

**Import strategy — two paths, both in P7d:**
1. **Primary: generic CSV import.** Kai defines/exports a simple CSV (`title, author, status, rating, isbn, started_at, finished_at, summary`) and uploads it — client-side parse, upsert into `books`, dedupe by `title+author`. This is the one that matters given no Kindle exists yet.
2. **Secondary/optional: Kindle `My Clippings.txt` import**, kept exactly as P7d already specified (highlights → `quotes`, dedupe by content hash) — now additionally linking each parsed highlight's book metadata (title/author parsed from the clippings file) to a `books` row instead of leaving it as loose text on the quote. Build this path only once Kai actually has Kindle data to test against (per P7d's own pitfall: "parse defensively, unit-test with a real sample").

**Accept:** a CSV of 10+ books imports with correct status/rating/dates and zero duplicates on re-upload; a quote linked to a book shows the book's cover/title on the quote card.

---

## 8. Review queue, separate from Resurfacing (P7a amendment)

Two distinct video features, now built as two distinct modules:

- **Resurfacing** (already scoped in P5, extended by P7a's data): random old quote/journal entry/note surfaces daily for inspiration. No change from the existing P5 spec beyond what §2 already notes.
- **Review queue** (new, P7a): when AI processes a note or journal entry (at capture time, reusing the `parse-capture` pattern), it may flag an embedded actionable follow-up — e.g. "revisit this in a month," "look into X later." Flagged items surface on Today under a "Needs review" section **until explicitly dismissed or converted to a task** — unlike Resurfacing, this doesn't rotate away on its own.

**Schema addition** (`notes`, `journal_entries`; `DATA_MODEL.md` §P7):
- `flagged_for_review bool default false`
- `review_note text?` — the AI's short reason/extracted follow-up (e.g. "mentioned wanting to revisit the paint color decision")
- `reviewed_at timestamptz?` — set when dismissed or converted; null = still pending.

**Build:** capture/edit pipeline for notes/journal entries gets an extra (cheap, single small prompt or reuse of `parse-capture`'s classification step) AI pass that sets these three fields; Today reads `where flagged_for_review and reviewed_at is null`; each row gets "convert to task" / "dismiss" actions (mirrors Slipping's "reviewed" action pattern already built in P4).

---

## 9. In-app notification/capture history (P4 retrofit)

The video's notification bell shows a persistent, browsable feed — separate from the ephemeral P2 toast and the external P4 push.

**Decision:** no new table. `activity_log` already records every domain event (`task.created`, `capture.autofiled`, `routine.checked`, `entity.reviewed`, and the new `notify.sent`/`task.reminder_sent` from §4) — the spine already carries everything this feature needs to display, matching the plan's own architectural principle ("no module ever depends on another module's code, they all just read `activity_log`").

**Build (P4 retrofit):**
- `features/notifications/` — a simple page/panel reading `activity_log` filtered to a curated allow-list of user-facing `event_type`s (not every internal event — e.g. show `capture.autofiled`, `task.reminder_sent`, `notify.sent`, `routine.checked` misses; hide noisy internal ones).
- Bell icon badge = count of events since last-viewed (`app_settings.notifications_last_seen_at timestamptz?` — one new column, or a per-device localStorage timestamp if simpler).

---

## 10. External Android capture endpoint (P6 addition)

The video's Apple Watch Shortcut hits the dashboard directly, outside any browser UI. Kai is on Android — the equivalent is an automation app (Tasker, a home-screen widget, or Android's share sheet) posting to an endpoint.

**Build (added to P6's scope, reusing the P2 pipeline):**
- A thin edge function `capture-external` (or extend `parse-capture`'s entry point): accepts `{ text?: string, audio?: base64 }` + a long-lived personal access token (generated once in Settings, stored like the GitHub PAT — server-side check only, never a session cookie) → runs the exact same `transcribe` (if audio) → `parse-capture` → confidence-gated filing pipeline as in-app capture.
- Settings UI (§6) gets a "Capture API" section: shows the token (regenerate button) and a copy-pasteable example Tasker/HTTP-request recipe.
- No new UI beyond that — this is an API surface, not a screen.

**Accept:** a manually-fired HTTP request (curl, or a real Tasker task) with the token creates a correctly-filed task/inbox item, indistinguishable from in-app capture in `activity_log`.

---

## 11. Dedicated Search UI (P5 amendment) — ✅ built 2026-07-04, folded into `PLAN.md` row 41 and `DATA_MODEL.md`

The video's global search is a plain keyword lookup across notes/quotes/library — separate from conversational AI chat. P5 already builds the FTS + embeddings infrastructure (`search_hybrid` SQL function) but only wires it into `chat`.

**Build (added to P5's scope):**
- `features/search/` — a simple search overlay/page: calls `search_hybrid` directly (no LLM round-trip), renders ranked results grouped by entity type, each linking to its entity. Much cheaper and faster than chat for "find the thing I know exists."
- Same extension rule as chat/resurfacing: P7a's tables get added to the searchable set as they land (mirror the embed-trigger pattern already required by P7's pitfalls).

**Accept:** searching "daughter" (the video's own example) returns matching tasks/inbox items immediately at P5; after P7a, also returns matching notes/quotes/journal entries.

---

## 12. Configurable checklist items (P7d amendment)

Kai's reasoning: some "checklist steps" are trivial (check a box), others are substantial enough to deserve their own task (visible in Today, schedulable, snoozable). Rather than picking one model, make it a per-item choice.

**Schema addition** (checklist templates/instances, `DATA_MODEL.md` §P7, wherever P7d's checklist jsonb lands on `projects`):
- Each checklist item (in the template jsonb and the instantiated-per-project copy) gets a `mode: 'checkbox' | 'task'` field, defaulting to `'checkbox'`.
- Instantiating a project's checklist: items with `mode: 'task'` create a real row in `tasks` (linked `project_id`, checklist-origin marker in a small payload field for traceability); items with `mode: 'checkbox'` stay inline on the project page only, never touching the `tasks` table.
- The checklist template editor lets Kai toggle each item's mode when defining the template (and override per-instantiation if he wants a one-off exception).

**Accept:** instantiating a template with mixed-mode items produces exactly the expected split — task-mode items appear in Today/Tasks, checkbox-mode items appear only inline on the project page.

---

## 13. Content Pipeline → dormant (P7c status change)

Kai doesn't create content (no YouTube/articles), so the video's content kanban doesn't map to his life. Per the same "dormant, spec'd but unbuilt" pattern already used for P6's optional email-forward capture:

- **Parity matrix row 26** ("Content pipeline kanban") status changes from `P7c` to **`DORMANT — build only if/when needed`**.
- `content_items` table, its `type`/`url`/`publish_date` fields (identified as missing in the validation pass), and the task↔content-item link (item #13 in the summary table) are **not built now** — this whole addendum's schema notes for content are captured here for later, not actioned:
  - `content_items.type text check in ('video','article','podcast','newsletter')`
  - `content_items.url text?`
  - `content_items.publish_date date?`
  - `tasks.content_item_id uuid?`
- If Kai ever does start creating content, P7c gets un-dormant-ed with these four fields included from the start (no need to re-derive them — they're already spec'd above).

---

## 14. Net effect on the Feature Parity Matrix (`PLAN.md` §3)

New rows to add when `PLAN.md` is next edited:

| # | Feature | Source | Phase |
|---|---|---|---|
| 33 | Areas (ongoing containers, sibling of Projects/Retainers) | Jerad + gap-fill | **P1 retrofit** |
| 34 | Per-task custom reminders (offset/absolute, independent of due date) | Jerad + gap-fill | **P1 (schema) + P4 (notify) retrofit** |
| 35 | Routines: any-time bucket, exact clock time, per-routine notification toggle | Jerad + gap-fill | **P4 retrofit** |
| 36 | Settings UI (integration health, last-synced, force sync, timezone) | Jerad + gap-fill | **P6** |
| 37 | Books entity + CSV import (Kindle `My Clippings.txt` optional/secondary) | Jerad + gap-fill | **P7d** |
| 38 | Review queue (AI-flagged follow-ups from notes, persists until resolved) | Jerad + gap-fill | **P7a** |
| 39 | In-app notification/capture history log (reads `activity_log`) | Jerad + gap-fill | **P4 retrofit** |
| 40 | External capture endpoint (Android automation, e.g. Tasker) | Kai (Android equivalent of Jerad's Watch flow) | **P6** |
| 41 | Dedicated keyword Search UI (non-AI, over `search_hybrid`) | Jerad + gap-fill | **P5** |
| 42 | Configurable checklist items (per-item task vs. checkbox) | Kai's refinement | **P7d** |

Row amendment:

| # | Feature | Source | Phase (was → now) |
|---|---|---|---|
| 26 | Content pipeline kanban (Idea → Published) | Jerad | P7c → **DORMANT** (Kai doesn't create content; spec kept in `docs/phases/P7-life-os.md` §7c, build only if reactivated) |

---

## 15. Retrofit debt at a glance (phases already marked "done" that need follow-up)

| Phase | New work from this addendum | Status |
|---|---|---|
| **P1** | `areas` table + CRUD + `tasks.area_id`; `tasks.reminder_at` + `reminder_offset_min` in `parse-capture` output | **Scheduled — actioned 2026-07-04.** See `docs/phases/P1-P4-retrofit.md`. |
| **P4** | `notify` gains `task_reminder` kind + cron sweep; new notification-history page reading `activity_log` | **Scheduled — actioned 2026-07-04**, bundled into the same retrofit batch as the P1 row above. See `docs/phases/P1-P4-retrofit.md`. |
| **P4** | Routines gain `any_time`/`scheduled_time`/`notify` columns + form UI (§5) | **Still parked** — not selected for the 2026-07-04 retrofit batch; remains open debt for a future session. |

Areas + reminders + notification history are no longer "should be scheduled deliberately" — they are scheduled, as the retrofit phase immediately ahead of P6 (`docs/ROADMAP.md`'s phase table and 2026-07-04 changelog entry). The routines-schema-expansion row (§5) was deliberately left out of that batch and is still open debt.
