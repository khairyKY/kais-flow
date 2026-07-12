# P7 — Life-OS Completion (sub-milestones 7a–7e, each its own session)

**Parity rows:** 24–32 (library · CRM · content kanban · project power-ups · Kindle · WIP items · Capacitor · parity audit) · **Status:** see `../ROADMAP.md`

## Goal
Finish the "everything actually in one place" promise, then audit against Akiflow and cancel it.

## Prereqs
P5 done (chat/resurfacing extend to each new content type as it lands). Run sub-milestones in order; treat each as a phase: read → build → acceptance → update ROADMAP (`P7a done`, …).

---

## 7a — Library (parity row 24)
**Build:** `journal_entries` (markdown body, entry_date, mood?, voice→transcript via P2 pipeline, photos→Supabase Storage with client-side compression ≤500KB) · `notes` · `quotes` · `commentary` feed (add thoughts to old notes/quotes over time — Jerad's feed idea). Extend: capture parser may now file `kind:'note'`/journal; embedding triggers + chat retrieval + resurfacing cover all library tables; evening ritual gains an optional one-line journal prompt. *(2026-07-08 replan: this also closes the other half of #70 — the Inbox gains a **"File as note"** action once notes exist, so an AI "looks like a note · 80%" suggestion finally has a matching verb; decide the Needs-review category-chips question from `../DESIGN-RECONCILIATION-2026-07-08.md` here too.)*
**Guardrail:** Storage budget is 1GB — compress images, no video uploads (link them instead).
**Accept:** voice journal entry from phone lands with transcript + audio; a quote gains commentary a day later and shows a feed; chat answers from journal content; resurfacing surfaces a journal entry.

## 7b — Personal CRM (parity row 25)
**Build:** `people` (facts jsonb: birthday, family, interests) + `interactions` (person_id, summary, occurred_at). Capture pipeline extension: "met Omar, talked about tire shipment" → parser proposes an interaction linked to the fuzzy-matched person (low confidence → Inbox as always). Birthday reminders via `notify` (7-day + day-of). Person page: facts + interaction timeline + linked tasks.
**Accept:** voice-captured interaction links to the right person; birthday push arrives; person page timeline correct.

## 7c — Content pipeline (parity row 26)
**Build:** `content_items` kanban Idea→Outline→Editing→Published (`@dnd-kit` columns), channel/domain link, markdown outline editor inside the card (plain textarea + preview is fine pre-design). `logActivity('content.moved', …)` so Slipping covers stalled content.
**Accept:** drag between columns persists + syncs; a card idle >14 days appears in Slipping.

## 7d — Projects surface + power-ups + Kindle (parity rows 27–29)
**Build the pages first** *(2026-07-08 replan, issue #78 — the design-reconciliation's missing cluster; all four comps exist, build WITH the features below, adapted to our idioms, never cloned)*: **Projects & Areas page** (`/projects` route + sidebar nav entry — `design/Projects.dc.html` + PROMPTS.md § C2 + SCREENS-PART-TWO block: domain filter tabs, project cards with hours/milestones/target date, Retainers group, Areas group) · **Project Detail** (`design/Project Detail.dc.html`: milestones + % complete, logged hours, checklist, work-log/status tabs, accent color) · **New Project / New Area** form (`design/New Project.dc.html`: type, engagement model, domain, dates, quoted hours, accent palette — replaces the one-line input on Tasks) · **New Routine full form** (issue #80, `design/New Routine.dc.html` + § C3: description, per-routine reminder via `notify`, streak goal — `goal_days` migration; **do not touch** `RateSummary`/`streaks.ts` stats, Kai parked that re-plan).
**Then the mechanics:** milestones (jsonb on projects) with % complete computed from linked tasks · checklist templates (jsonb; instantiate → real tasks) · simple time tracking (start/stop → `time_entries`, per-project totals) · **retainer auto-reload**: pg_cron at month start — for `type='retainer'` projects, re-instantiate the monthly checklist + roll unfinished tasks forward (`logActivity('retainer.reloaded', …)`) · **Kindle import**: upload `My Clippings.txt` → client-side parse (book title/author/highlight/date) → `quotes` with book metadata, dedupe by content hash. The free path — no Amazon API.
**Accept:** the four pages exist, on-system, reachable from the nav; retainer reloads correctly on a simulated month start; template instantiates tasks under the right project; Kindle file imports with zero duplicates on re-upload; time totals correct; a routine created with the full form carries description/reminder/goal; issues #78 and #80 closed.

## 7e — Parity audit & stretch (parity rows 30–32 + north star)
**Do:** walk `PLAN.md` §3 matrix row by row **and** `../research/AKIFLOW-WIKI.md` §2–§3 feature-for-feature against `../research/AKIFLOW-GAP-ANALYSIS.md`'s verdicts *(2026-07-08 replan — the noun matrix alone provably misses interaction verbs)* → evidence per row → gap list → close gaps → **Kai cancels Akiflow** (the success criterion). Record the audit in this file's Notes.
**Stretch (only after the audit passes, each optional):** handwriting-photo journal parse (Groq vision model — check console for current free vision model) · home inventory module (photos + dates, insurance/declutter) · Capacitor native wrap (only if a real PWA limitation bit us — document which).

---

## Files
`app/src/features/{library,journal,people,content,projects,time-tracking,kindle-import}/` · migrations per sub-milestone (`../DATA_MODEL.md` §P7 has the columns) · no new edge functions expected (reuse `parse-capture`, `notify`, `embed`, `chat`)

## Pitfalls
- Each sub-milestone must extend the embed triggers + retrieval + resurfacing weights — grep for the P5 trigger pattern and mirror it, or chat silently goes stale on new content.
- `My Clippings.txt` is locale-quirky (separators, BOM, clock formats) — parse defensively, unit-test with a real sample from Kai's Kindle.
- People matching in capture: fuzzy match on first name + recency; below threshold → Inbox, never guess (same confidence discipline as P2).
- jsonb for milestones/checklists is deliberate (flexible, single-user) — don't normalize into tables unless it actually hurts.

## Notes / deviations
_(filled during execution — including the 7e audit results)_
