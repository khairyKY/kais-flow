# v1.0 Fix Plan — everything the judging sessions found

> **Input:** every finding from the three judging registers — `JUDGING-2026-07-28.md` (J-1…J-4), `JUDGING-SESSION-2.md` (J-5…J-15), `JUDGING-SESSION-3.md` (J-16…J-28) — plus the punch items Kai explicitly failed or commented. Unjudged punch items are NOT here; they stay in the judging walkthrough.
> **Execution model:** Scenario 2 (`V1-DISPATCH.md`) still applies — the orchestrator can auto-dispatch every wave. But each wave below also carries a **ready-to-run prompt header** and a **skills line** so Kai can run any wave himself in a fresh session (PROMPT-BANK style). Either path lands on `feature/botanical-integration` → push to master → re-judge on live.
> **Rule unchanged:** fix waves work top-down; nothing merges without tsc + tests + build green; every fix cites its J-number in the commit.

---

## Phase 0 — decisions & inputs only Kai has (blocks everything marked ⛓)

| # | What | Why it blocks |
|---|---|---|
| K-a | **J-5 fix path: A (drop root `zoom`, rem scale) or B (portal the fixed layer)** — decision table is in `JUDGING-SESSION-2.md`. Recommendation: **B now, A in v2** | ⛓ FIX-1 |
| K-b | **Run the dead-letter dump** (console snippet in J-16). Paste the output | ⛓ FIX-3's shape: if inbox writes dead-letter, the fix is outbox hardening, not inbox code |
| K-c | **`supabase login` + `supabase db push`** (migrations 0030–0034) | ⛓ FIX-4, unblocks punch 1/3/4/25/47/49 |
| K-d | **J-3 ruling:** keep right-click-selects-row, or menu only? | ⛓ part of FIX-1 |
| K-e | **J-14 + J-23 + J-24 pointers:** which calendar button has the wrong icon; one screenshot of a blurry board title; confirm the board flower against the export | ⛓ small parts of FIX-2/FIX-5 |

---

## FIX-1 · The floating & pointer cluster — J-5, J-6, J-2, J-1, J-9, J-4a
**The biggest win: six findings, two root causes.**

- **J-5 (CONFIRMED):** implement the chosen path (K-a). If **B**: render `BulkBar`, `InboxBulkBar`, `ToastHost`, `ContextMenu` (+ submenus), and the sync popover through a portal target *outside* the zoomed subtree; delete the now-wrong `/z` compensation where the portal makes it obsolete. If **A**: replace root `zoom` with rem scaling per F6's spec, then delete `uiZoom()` everywhere and re-judge the world.
- **J-6:** with J-5 fixed, re-derive the ContextMenu clamp from real viewport space; drop the hardcoded `itemHeight` estimate (measure the menu after first paint).
- **J-2:** lift both bulk bars clear of the phone tab bar (ToastHost's ≤767px pattern).
- **J-1 + J-9:** `useRowSwipe` — no-op unless `e.pointerType === 'touch'`; filter `e.button !== 0`; bail `onPointerMove` when `(e.buttons & 1) === 0`; settle on `lostpointercapture`/`onPointerLeave`; release capture if the row re-keys (J-9's wrong-target).
- **J-4a:** `startRailDrag` gets the same `e.button === 0` filter.
- **J-3:** apply Kai's K-d ruling.

**Files:** `BulkBar.tsx`, `InboxBulkBar.tsx`, `ToastHost.tsx`, `ContextMenu.tsx`, `TaskRow.tsx`, `CalendarPage.tsx`, `AppLayout.tsx` (portal root), `index.html`/`uiScale.ts` only if path A.
**Verify:** scroll with bulk bar visible (stays put) · right-click a row near the viewport bottom (full menu, no row shift) · desktop drag a row (nothing swipes) · phone width: bars sit above the tab bar.
**Skills when run manually:** `/ponytail` only. This is surgical plumbing — no design skill, no supabase.
**Prompt header:** *"FIX-1 from `design-integration/FIX-PLAN.md`. Read the J-5/J-6/J-2/J-1/J-9 entries in the three JUDGING files first. Kai's K-a ruling: ⟨A|B⟩. Kai's K-d ruling: ⟨keep|menu-only⟩. Worktree off feature/botanical-integration; tsc+tests+build green; commit per J-number."*

## FIX-2 · Calendar cluster — J-13, J-15, J-14, struck-38 leftovers
- **J-13 (worst visual):** implement CALENDAR.md §6 overlap layout — 2 events shoulder side-by-side (`calc(50% − 2px)`, 4px gutter), 3+ shingle at 56% with `+N more`. FullCalendar: `slotEventOverlap: false` + `eventMaxStack` + custom `+more` rendering, or a small `eventDidMount` layout pass — smallest diff that matches the spec wins.
- **J-15:** rolling window must start **today** (re-check `dateAlignment`/`duration` interplay after the view-options change), and landing on the calendar scrolls to now-line minus ~2h (set scroll position directly, never `scrollIntoView`).
- **J-14:** swap the icon Kai points at (K-e).
- Fold in struck-38's real content where it's cheap: gutter width pinned, header alignment, block insets.

**Files:** `features/calendar/CalendarGrid.tsx/.css`, `ViewOptionsPopover.tsx`.
**Skills:** `/ponytail`. If the `+N more` popover needs visual judgment: `frontend-design`.
**Prompt header:** *"FIX-2 from FIX-PLAN.md — calendar. Read J-13/J-15 in JUDGING-SESSION-2.md and CALENDAR.md §6. The Akiflow benchmark is struck (Kai: 'we are our own app') — judge the grid on its own terms."*

## FIX-3 · Trust & persistence — J-16, J-10, J-8, J-18
- **J-16:** *shape depends on K-b's dump.* If dead-letters exist: fix the rejected write's cause (prime suspect: round-tripping `embedding` on inbox upserts — strip it like `search_tsv`), then make dead-letters LOUD (a "Needs a look" surface, punch 4's sibling) instead of silent. If the dump is empty, escalate — do not guess.
- **J-10:** Today's empty gate waits for `isLoading === false` (same class as the OnboardingGate fix). Also profile the slow first paint (he felt it) — likely the eager query fan-out; cheap wins only, no perf project.
- **J-8:** task title click (and row double-click) opens the editor — mouse parity with Enter.
- **J-18:** surface the dedupe assistant from Tasks when clusters exist ("N repeating duplicates — tidy them →" linking to `/settings/import`).

**Files:** `lib/outbox.ts`, `features/inbox/api.ts`, `TodayPage.tsx`, `TaskRow.tsx`, `TasksPage.tsx`.
**Skills:** `/ponytail` + **`supabase`** (outbox/PostgREST semantics for J-16).
**Prompt header:** *"FIX-3 from FIX-PLAN.md. Kai's dead-letter dump says: ⟨paste⟩. Read J-16's ruled-out list first — do not re-investigate those three."*

## FIX-4 · Supabase gate + auth — J-11, blocked punch items (after K-c)
- Apply migrations (K-c does this). Then verify on live: journal multi-entry, search coverage, settings per-user PK, compost cron schedule, revokes.
- **J-11:** password reset — `supabase.auth.resetPasswordForEmail` + `/reset` route + "Forgot password?" link; restyle the sign-up affordance as a conventional underlined **Create an account** (keep the garden voice in the button, not the doorway).

**Files:** `features/auth/SignInPage.tsx`, new `ResetPage`, `App.tsx` route.
**Skills:** **`supabase`** (auth flow + verifying the pushed migrations) + `/ponytail`.
**Prompt header:** *"FIX-4 from FIX-PLAN.md. Migrations 0030–0034 are now applied (Kai ran db push). Verify each on live, then build J-11 password reset."*

## FIX-5 · Search rebalance — J-7
New migration `0035_search_rebalance.sql`: vector threshold 0.6 → ~0.35, vector arm capped (~12, not 40), FTS weighted above vector in the RRF merge, and an `ilike` lexical guarantee for short queries. Client unchanged. **Needs K-c first** (and a second `db push`, or fold into the same session as FIX-4).
**Skills:** **`supabase`** + **`supabase-postgres-best-practices`** + `/ponytail`.
**Prompt header:** *"FIX-5 from FIX-PLAN.md — read J-7's mechanism in JUDGING-SESSION-2.md and 0008_search.sql's search_hybrid before writing 0035."*

## FIX-6 · Visual & UX batch — J-17, J-12, J-19, J-21, J-22, J-27, J-28, item-30/22 leftovers
- **J-17:** promote `KeyChip` into `components/kit.tsx`; use it in the Inbox strip, sidebar footer, ContextMenu hint column, QuickCreate footer — every shortcut display in the app.
- **J-12:** sort cycler → a small themed popover listing Smart/Due/Priority/A-Z (reuse `Select`/menu pattern). Filtering beyond chips = **v2 parking lot** unless Kai pulls it in.
- **J-19:** slipping chip on *projects* in list view (the area branch already does it — `isSlippingProject` exists, use it).
- **J-21:** move the Board/Finished/domain controls out from under the h1 (right-aligned on the section label row is the obvious home; `frontend-design` judgment).
- **J-22:** de-sync board leaves — delay/duration offset per card (index or id-hash based).
- **J-27:** swept domain rows expand on click to re-open/edit the sweep.
- **J-28:** bind the trellis vine image to the real stage (screenshot in vault: `Pasted image 20260729100034.png`).
- Item 30 leftover: Organize rail "a little bit up"; item 22 leftovers if unjudged bits remain.

**Skills:** `/ponytail` + **`frontend-design`** (J-21 placement, J-17 keycap styling in context). Finish with **`/code-review`** over the whole batch.
**Prompt header:** *"FIX-6 from FIX-PLAN.md — the visual batch. Each bullet cites its J-number; keep diffs surgical; the export stays the pixel contract except where a J-entry says otherwise."*

## FIX-7 · Picker redesign — J-25 (design first, build second)
Kai's explicit flow: **design them in Claude Design before any code.**
1. **Design session (Kai runs, skill: `claude-design`):** one date-picker + one time-picker in the app's botanical language, day+night. Inventory to design against is in J-25's table (7 date sites, 3 time sites, 6 stray `<select>`s).
2. **Build session (after Kai approves the mocks, skills: `/ponytail` + `frontend-design`):** one `DatePicker`/`TimePicker` pair in `components/`, swapped into all sites; the 6 stray `<select>`s adopt the existing themed `Select`.

**Note:** this is the only wave where scope is genuinely elastic — if the mocks aren't approved by ~Aug 8, ship v1 with native pickers and move J-25 to v2. The pickers are ugly, not broken.

## FIX-8 · Re-judge
Deploy after each wave (push to master). Kai re-runs the failed Judge lines + continues the unjudged remainder (43, 45, 46, 48, 50, 51, 53, 54, 54b, 56, 58, 62, 63, 64 + blocked items freed by K-c). New findings → `JUDGING-SESSION-4.md`, and loop.

---

## Which skills with which prompt — the answer to "what do I load when I run these"

| You're running | Load these skills first | Why |
|---|---|---|
| FIX-1 floating/pointer | `/ponytail` | Plumbing; the ladder keeps the diff surgical |
| FIX-2 calendar | `/ponytail` (+ `frontend-design` if the `+N more` UI needs taste) | Layout algorithm + spec fidelity |
| FIX-3 trust/persistence | `/ponytail` + `supabase` | Outbox ↔ PostgREST semantics is exactly what the supabase skill knows |
| FIX-4 auth + migration verify | `supabase` + `/ponytail` | Auth flows, reset emails, RLS checks |
| FIX-5 search | `supabase` + `supabase-postgres-best-practices` + `/ponytail` | It's a Postgres query-tuning problem wearing an app bug's clothes |
| FIX-6 visual batch | `/ponytail` + `frontend-design`, then `/code-review` | Taste calls + a review gate over many small diffs |
| FIX-7 pickers — design half | `claude-design` | You asked for the mocks there explicitly |
| FIX-7 pickers — build half | `/ponytail` + `frontend-design` | Implement the approved mock, nothing more |
| Any wave's post-merge check | `/code-review` (and `/simplify` if a diff sprawled) | The review gate, unchanged from the build phase |

**If I dispatch instead of you:** same mapping, minus the slash-invocations — my workers get the skill content folded into their briefs, and `/code-review` stays my merge gate either way.

## Suggested order (with Aug 15 unchanged)

1. **Today:** K-a…K-e (five minutes of rulings + one console paste) → FIX-1 dispatch.
2. K-c same day if possible → FIX-4 + FIX-5 become unblocked.
3. FIX-2 + FIX-3 in parallel with FIX-1's review.
4. FIX-6 after, FIX-7 design in parallel any time (it's Kai-driven).
5. Rolling deploys; judging session 4 on whatever's landed.
