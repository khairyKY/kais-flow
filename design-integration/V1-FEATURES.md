# Kai's Flow v1.0 — Feature Contract (DRAFT for Kai's review)

> **What this is:** the list of features that should exist *and work* for v1.0 — public, deployable. Written from the **user's POV and best UX**, not from the design export; the export is an input, the drift audit (`DRIFT-AUDIT.md`) supplies the statuses. Kai reviews line by line: keep / cut / change.
>
> **Legend:** ✅ works today · 🟡 partial/broken · ❌ missing · 🔵 needs Kai's decision · ✂ recommended cut from v1.
> **Principle applied throughout:** *nothing dead on screen* — every visible control either works or doesn't render in v1. A half-app that's honest beats a full-app that lies.

---

## 1. Capture — "out of my head in under 3 seconds"

| Feature | Status | Notes |
|---|---|---|
| ⌘K command bar, NL parse (dates, `#project`, `!` priority, duration) | ✅ | |
| Unstructured text → lands in Inbox | ✅ | |
| Voice capture (mic FAB + sheet, Groq STT → AI filing) | ✅ | |
| Filing feedback — capture/file toast says **where it went** ("Filed to Tasks · Today — Undo") | ❌ | Kai's ask; cheap; core trust. |
| Android **share-target** (share a link/text → Inbox) | ❌ | Manifest + `/share` route. The mobile capture story depends on it. Recommend **v1**. |
| Capture API endpoint (POST from anywhere, token) | ❌ | 🔵 Recommend **v1.1** — no consumer exists yet; hide the settings card until real. |
| GitHub / email ingestion | ❌ | **v1.1** — integrations unwired; Connect buttons stay disabled `Soon`. |
| Note/event type in ⌘K (`//` note syntax etc.) | ❌ | 🔵 Recommend: keep v1 binary (task ↔ inbox). Notes belong to Library, events to the calendar quick-create. Remove `//` from the cheatsheet. |

## 2. Triage — "empty the inbox in one pass"

| Feature | Status | Notes |
|---|---|---|
| Inbox list, AI parse chip + confidence, edit-parse, confident/unsure branches | ✅ | |
| File as task / dismiss / snooze / restore; persistence | ✅ | P0 outbox fix verified. |
| Keyboard triage (keys shown = keys real) | 🟡 | Code binds e/d/s; cheatsheet says f/d/x. Pick one set, fix both. |
| Undo on every triage action | ❌ | Systemic — see §8. |
| Dismissed compost view + mobile swipe-restore | ✅ | |
| **30-day auto-compost actually runs** | ❌ | Copy promises it; no cron. One pg_cron job. **v1** — the copy must be true. |
| Inbox zero state | ✅ | Bloom celebration 🟡 nice-to-have. |
| Bulk triage | ✅ | Keep (app addition, earns its place). |

## 3. Plan — tasks & calendar

| Feature | Status | Notes |
|---|---|---|
| Views: Today / Overdue / Upcoming / Someday / Done + Repeating | ✅ | Overdue + reschedule-all = Kai's rulings. |
| Sort (Smart/Due/Priority/A-Z) | ✅ | |
| Filter (domain chips on mobile; anything richer?) | 🔵 | Kai killed the dead ⚟ button. Decide: domain/project filter chips on desktop too, or sort alone is enough for v1. |
| Top-3 + Goal of the day | ✅ | |
| Task detail editor (subtasks, notes, duration, priority, links) | ✅ | Route-based. Add **Enter opens detail** on any focused row. |
| **Labels** | 🔵 ✂ | Dead data (typed, written by importers, zero UI). Recommend **cut from v1** — no picker, no manager, no L key; data survives for later. |
| Recurring tasks + Perennials page (pause/skip/end) | ✅ | Edit-rule should open the real Repeat menu, not a native select. |
| **Recurring-import dedupe** ("76× shower+breakfast" → suggest merge into one recurring) | ❌ | Kai's ask. One-time assistant in Settings → Import. **v1** (his real data is polluted). |
| Snooze / Schedule / 1-2-3 keys on **every** task list (Today included) | 🟡 | Today's bindings array is empty; Tasks-only today. |
| Calendar: rolling week / N-day / day / month, h-scroll, resizable rail | ✅ | Kai-ruled additions; keep. |
| Drag-to-plant + move + resize, snap dialect (free ghost / stepped placeholder / 120ms flash) | ✅ | The strongest surface. |
| **Undo toast on drop/move/resize/delete** | ❌ | Core — misdrops are the #1 calendar error. |
| Invalid-drop "soft no" shake + 30-min minimum clamp + top-edge resize | ❌ | Feedback trio, cheap, recommend v1. |
| All-day ↔ timed drag conversion | ❌ | 🔵 Recommend v1 — the band exists, dragging into it silently does the wrong thing today. |
| Edge auto-scroll while dragging | ❌ | Recommend v1 (long days are unreachable mid-drag). |
| Quick-create popover (event/task/block flip, editable start time) | ✅ | Kai re-verify clipping today. Kill text-selection on the N-day cycler (`user-select:none`). |
| Event details popover | ✅ | Polish: anchor to block on desktop, sheet on mobile — v1.1 ok. |
| Planning board | ✂ | Parked by Kai until his redesign. Route stays hidden. |
| Unscheduled rail + capacity readout + quick-add | ✅ | Make rail quick-add a real inline input (type → Enter → unscheduled task). |

## 4. Do — Today & Focus

| Feature | Status | Notes |
|---|---|---|
| Today: terrarium (live stages), Top-3 + goal, up next, all open, slipping, routines rail, resurfaced card | ✅ | Structure verbatim. |
| Row meta on "All open" (overdue/due/↻) | 🟡 | Tasks' own row has it; Today's local row doesn't. Reuse one row. |
| Slipping: all cards (not just first), **real** wisteria stage, dismiss with undo | 🟡 | p20 hardcoded today. |
| Resurfacing: **priority-based cooldowns** (high ~2d / med ~5d / low ~10–14d) + user-tunable in Settings | ❌ | Kai's spec. R4-6 migration blocked on `supabase login` [KAI]. |
| Day-complete celebration (once, one implementation) | 🟡 | Two copies with two localStorage keys — merge. |
| Focus: pomodoro + stopwatch + break + settings + garden view | 🟡 | Works; **kill the hardcoded literals** (block time, "session 2 of 3", subtask line) — show real data or nothing. Gear icon, chime asset (or cut chime). |
| Focus reachable from a task ("Focus on this") | ✅ | MiniFocus + task-page entry exist. |
| Undo on task check ("Done — Undo") | ❌ | See §8. |

## 5. Cultivate — routines, rituals, projects, review

| Feature | Status | Notes |
|---|---|---|
| Routines + groups + garden + trellis + new-routine form | ✅ | **Unify streak math** — one algorithm, one vine threshold (30d = lush) everywhere; today's checkmark should draw today's leaf. |
| Morning ritual (4 steps, seeded from last night) | ✅ | `skip` shouldn't count the step as done. |
| Evening ritual | 🔵 | Built = 4-beat Closing Ritual (garden/one-line/seeds/goodnight). Designed also = 2-step sweep (roll-forward + tomorrow at a glance). **Recommend:** keep the 4-beat, fold "sweep today" in as beat 1 (it's the productivity half the current flow lacks). Kai decides. |
| "One line" actually lands in the Journal | ❌ | Copy promises it. Wire or reword. |
| Post-sunset "Close the garden" entry on Today | 🔵 | Designed, atmospheric, cheap. Keep or cut. |
| Projects: list / board / detail / areas / archive / new-form / retainers | ✅ | Fix: milestone "edit" chip **deletes** (P0), month-window stats are all-time, retainer numbers hardcoded, dropped-state missing. |
| Weekly review sweep | 🟡 | **Persist sweep state** (it resets on reload) + build the per-project sweep rows (still moving / park it / needs a look) — that's the actual review; today it's just "mark swept". |
| Season-so-far stats | ✅ | Minor: use 3c's bars, fix inverted consistency colors (broke ≠ neutral grey). |
| Herbarium + 3-beat pressing ceremony | ✅ | Fix escapes bug; press *then* archive. |
| Streak widget in sidebar | ✅ | |

## 6. Remember — journal, people, library, activity, search, chat

| Feature | Status | Notes |
|---|---|---|
| **Journal model** | 🔵 | Blocked on Kai. Recommendation to react to: **one dated daily page** (the diary spine) holding unlimited timestamped entries + mood + three-small-things; **titled standalone notes live in Library**, not Journal; **delete → Trash** like everything else. Then un-park the nav row. |
| People: circles, nudges, birthdays, moments, detail log | ✅ | Wire the `later` nudge chip; vary call/text action. |
| Birthday card on Today | ✅ | Kai-sanctioned keep. |
| Library: shelves, books (fern progress), quotes, notes, append-only commentary | ✅ | Wire resurface chips; add delete confirm; drop the hardcoded "resurfaced twice". |
| Activity ledger + filters | ✅ | Fix escapes bug; **make rows navigate to their source**; add Projects chip. |
| Search page + ⌘/ overlay | 🟡 | Index only covers tasks+inbox. **v1: add people, events, projects, journal** (they're the things you actually lose); overlay scroll; chips either filter or go. |
| Chat over your data (⌘J) | ✅ | Add Esc-close. |
| Trash: 30-day compost, restore, empty-confirm | ✅ | **Give it entry points** (Settings row + sidebar ghost link); compost cron; feed it from journal/library deletes too. |
| Seasons ambience on Today header | 🔵 ✂ | The live layer was never wired; `/seasons` is a reference page. Recommend **v1.1** — atmosphere, not function. |

## 7. System — shell, sync, settings, mobile

| Feature | Status | Notes |
|---|---|---|
| Auth + onboarding (once per account, editable later in Settings) | ✅ | Kai re-verify the gate; seed art for flowers 3 & 5 [KAI art]. |
| Offline outbox + optimistic writes + reapply-over-fetch | ✅ | The invisible crown jewel. |
| Sync topbar states + queue popover | 🟡 | Fix duplicate `◌`, date format, calm-copy the failure toast (no "error"). "Needs a look" conflict UI → **v1.1** ✂. |
| Night theme | 🟡 | Tokens ✅. v1: fix the grain (vanishes at night), sweep the ~12 hard-coded light-only colors. Frost/silhouette polish → v1.1. |
| Settings — **every row functional or hidden** | 🟡 | Working: theme, size, timezone, push, effects. Inert today: paper-texture slider, accent picker, sound toggles/previews, capture API, Connect buttons. 🔵 per row: make real or hide. Recommend: paper-texture = make real (one CSS var), accent = cut, sounds = see below, capture API = hide. |
| **Sounds** | 🔵 | Catalog UI exists, zero audio runtime, chime.mp3 missing. Recommend: ship a *minimal* real layer (paper rustle on complete + round-end chime, preview buttons, quiet hours) **or cut the section entirely**. No fake toggles. |
| Keyboard truth: `?` overlay lists **only** working keys | ❌ | Today it advertises ~12 dead keys. Either implement (g/t/i/u, calendar d/w/m/←→) or delete the rows. |
| Go-to (G) | 🔵 | Recommend: fold into ⌘K (type a view name → jump) instead of a separate overlay; drop the G key. |
| Undo system — **every destructive/completing action toasts with working Undo** | ❌ | The single biggest UX debt (1 of ~11 sites today). v1 core. |
| Native `window.confirm` → in-app ConfirmCard everywhere | 🟡 | Component exists; 7 call sites still native. |
| Motion & effects per Kai's ruling ("apply everything except 1a") | 🟡 | 8 motions + 8 effects unwired; timings drifted (checkPop 260 vs 180 etc.). 🔵 pending P5 #11: does the 1a ban cover the 160ms route cut (2a)? |
| Mobile: tab bar + More sheet + swipe rows | ✅ | |
| Mobile sheets: snooze/schedule + task detail as bottom sheets | ❌ | Desktop popovers render on phones today. Recommend **v1** — this is where public users live. |
| Long-press create, pull-to-refresh | ❌ | **v1.1** ✂. |
| Notifications: push subscribe/test | ✅ | In-app feed is a stub → ✂ **cut the route; point the bell at Activity.** |
| PWA install + offline boot | ✅ | Verified in hardening. |
| iOS-style emoji | ✅ | Kai re-verify after dev-server restart. |

## 8. Cross-cutting v1 gates (not features — release criteria)

1. **Undo everywhere** (complete, file, dismiss, delete, drop, snooze, reviewed, resurface) — one helper, every call site.
2. **Nothing dead on screen** — every audit-flagged dead control (Connect, filter chips, `later`, keep/dismiss, Timeline tab) works or is gone.
3. **No design-sample literals in live UI** (Focus strip, Library "resurfaced twice", sun-dial dots, retainer numbers).
4. **Growth stages never contradict data** — one shared threshold module (hydrangea, vine, wisteria, cherry, fern, daisy).
5. **The escapes bug** (`·` painting literally) fixed on Activity/Herbarium/Trash.
6. **The word "error" never appears** — calm-copy pass over outbox/settings toasts.
7. **Public-use safety pass:** RLS re-verified per table, Groq edge functions rate-limited, fresh-account first-run experience tested (empty states everywhere, no Kai-specific data), sign-up flow polished.
8. Lighthouse ≥ 90 on the deployed build; initial JS ≤ 200KB gz (currently ~232).

## Explicitly OUT of v1 (parked/cut register)

Garden Postcard export · Labels (picker/manager/L) · Board & Calendar view-options popovers · Seasonal-drift ambient layer · Time-of-day paper / idle life / parasol header · "Needs a look" conflict UI · Notifications feed · Planning board (Kai redesign) · Focus "Year in the Garden" (parked) · Weekly Letter (dropped) · GitHub/Google/email integrations + Capture API (v1.1) · Quick-Capture mockup gallery route (dev-only) · Effects 2g focus-dim (Kai parked) · Motion 1a (banned).

---

*Next step after Kai's line-by-line review of this file + his fresh manual review: the v1.0 remediation plan (waves, owners, sequencing) gets written against the surviving lines.*
