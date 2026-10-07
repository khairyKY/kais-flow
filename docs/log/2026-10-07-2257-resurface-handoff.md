---
date: 2026-10-07T22:57+03:00
session: builder (resurfacing settles)
type: handoff
related: app/src/features/resurfacing/ · supabase/migrations/0059_resurface_settles.sql · docs/log/assets/resurface/
---

# "From a while ago": every press settles something

Branch `claude/resurface`, cut from `origin/claude/wave-v` (v1.0.23 + the MCP fix). Not merged, not released, not deployed. Migration 0059 is **not pushed**; the client works before and after.

Kai (2026-10-07): "The 'From a while ago' section isn't really interactive. I don't really understand what I can do with it; if I press Later… it's just a loop of snoozing something."

## What changed

**The card says what it is and why** (`ResurfaceCard.tsx`).
- Under the quote, one meta line:
  - "Task · Shaheen website · added 3 weeks ago, untouched" (or "· last touched 9 days ago")
  - "Inbox note · captured 5 weeks ago" (a filed note adds "· filed as a task")
- A small "?" beside it opens: "Something you saved a while ago. Keep it, plan it, or let it go."

**Tap the quote to open it.**
- A task: the task sheet on the phone, the task editor on desktop (the shared `useOpenTask`).
- A note: `/inbox?focus=<id>`.

**Clear actions** (`rules.ts` decides which; `api.ts` writes them).

| Thing | Buttons |
|---|---|
| Task | **Plan…** · Done · Let it go · Not now · back in N days |
| Waiting note | **Make it a task** · Let it go · Not now · back in N days |
| Filed note | Let it go · Not now · back in N days |

- **Plan…** opens the shared Plan list (`tasks/PlanMenu`): Today, Next free slot, Tomorrow, This weekend, Next week, Pick date & time…, Someday. The writes go through `rescheduleDue` / `setSomeday`, the same as everywhere else.
- **Done** completes the task (a repeat spawns its next one, as everywhere).
- **Let it go**
  - a task → Trash (`deleteTask`)
  - a waiting note → dismissed
  - a filed note → only the pick is closed
- **Not now** snoozes by priority (2 / 5 / 10 days, Settings → Resurfacing). The label says the real length.
- Every action:
  - leaves through the existing exit motion
  - shows **one** toast whose Undo takes the thing's own writes back and re-pends the pick
  - marks the `resurfaced_log` row (`converted` / `done` / `dismissed` / `review_later`)
  - logs `resurfaced.planned | converted | kept | done | dismissed | review_later` via `logActivity`
  - The Activity page has copy for the three new events.

**Breaking the loop.**
- **Put off twice:** once an entity has two `review_later` rows in `resurfaced_log`, the card asks "You've put this off twice — keep it or let it go?". It offers **Keep · Plan…** (a note: Keep · Make it a task; a filed note: Keep) and **Let it go**, with no snooze.
  - The count comes from the synced log, so the phone and the PC agree.
- **Migration 0059** (`supabase/migrations/0059_resurface_settles.sql`):
  - `resurfaced_log.snoozed_until timestamptz`: the snooze is now on the server (the planned "MIG-1").
  - `action` gains `'done'`.
  - `do_resurface()`:
    - **no +20 weight for 'review_later'**
    - never picks something still snoozed
    - never picks something that was let go
    - never picks a done or trashed task
    - never picks a dismissed or trashed note
  - Everything else is as in 0035.
- **Before 0059 is pushed** (the 0058 pattern: the client checks whether the fetched row has `snoozed_until`):
  - Done writes `converted`.
  - The snooze lives only in this device's `kf.resurfaceSnoozes` ledger. It is still written and read either way.
- **Nothing to show** → the section hides, as before.
  - New: a pick whose task is done, trashed or gone, or whose note is dismissed, now also hides the heading. Today and the card share `useResurfacePick`.

Also:
- Settings → Resurfacing copy says "Not now" instead of "Later".
- `useLatestResurfaced`, `reviewLaterResurfaced`, `dismissResurfaced` and `isResurfaceSnoozed` are gone. Their replacements are in `api.ts`.

## Evidence

- **Unit tests:**
  - `resurfacing/rules.test.ts`: task vs note vs filed note, the twice-put-off question, the snooze label, the meta line, put-off counting, snooze across devices, done vs converted.
  - `resurfacing/api.test.ts`: each action's writes, and that its single Undo restores them.
  - Full suite in PowerShell, ×4 TZ (Africa/Cairo, UTC, America/Los_Angeles, Asia/Kolkata): **118 files / 1449 tests** green in each.
- **Lint and build:** `npm run lint` exits 0 (warnings only, none new). `npm run build` passes.
- **0059 on PGlite:** `docs/log/assets/resurface/0059-pglite-check.mjs` checks that the migration applies twice cleanly and that `'done'` is accepted while unknown actions are still rejected. Over 400 picks, it never chose a done, trashed, let-go, snoozed or too-new entity, and it did choose the eligible task and the filed note. It also confirms the +20 boost is gone and execute is still revoked from `authenticated`.
- **Browser harness:** `docs/log/assets/resurface/verify.mjs`, mocked backend, phone 390 (touch) and desktop 1280, day and night: **320/320**.
  - It covers the meta line, "?", tap-to-open (task sheet / editor / Inbox focus), and each action's writes plus Undo.
  - It runs both before 0059 (no `snoozed_until` sent, the device ledger is used, Done writes `converted`) and after (`snoozed_until` ≈ now + 5 days, Done writes `done`).
  - It also checks Plan… → Tomorrow, the twice-put-off question, the note's convert and let-go, the hidden section when nothing resurfaced, no horizontal scroll, and no page or console errors. The realtime socket to the mock's port 9 is filtered out as harness noise.
  - Screenshots are beside it.
- **Re-run harnesses:** today-phone **158/158**, small-gaps **154/154**, plan-replan **103/103**.

## For Kai

1. **Push 0059** (`supabase db push`) with the next backend release. Until then:
   - the snooze stays per device
   - Done is recorded as `converted`
   - the server can still re-pick a let-go *filed* note after 14 days (the old picker doesn't know "let go")
2. **Look:** the card keeps the existing chip styles. The first button is terracotta and the rest are outlined. There is a small round "?". The "Not now · back in 5 days" chip wraps to a second row at 390. It's yours to restyle.
3. **Decision:** after the twice-put-off question, **Keep · Plan…** plans the task and closes the pick. If he plans it and still never does it, the picker can bring it back after 14 days. Each time, the count of two `review_later` rows still makes the card ask, never snooze. If he wants "Keep" to also stop it coming back, that's a one-line rule in 0059.
