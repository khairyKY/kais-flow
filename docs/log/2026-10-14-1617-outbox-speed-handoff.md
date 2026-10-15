---
date: 2026-10-14 16:17 UTC
session: outbox-speed
type: handoff
related: 2026-10-13-2205-slots-phone-handoff.md ("A slow outbox drain in the mock runs")
supersedes: none
---

# Outbox speed: handoff (2026-10-14 16:17 UTC)

Branch `claude/outbox-speed`, from `claude/kai-bugs-1012` at `7520ee92` (v1.1.7 + msix). The fix is in `e809f427`. Not merged, no PR. No migration.

## The report

slots-phone saw queued writes sit in the outbox "for seconds" in the mock harness (time-slots s5 failed 3/3 until `settle()` waited for the queue to drain) and suspected `supabase.auth.getSession()` in `lib/outbox` `drain`.

## Root cause (measured)

**It was not getSession, and it was real.** I added temporary timestamps (enqueue, drain start, session, send, response, removed, and each queue step's IndexedDB get/set), then drove three writes in the mock harness: completing a slot task, dropping a block into a slot (s5) and editing a title.

- `getSession()` resolved in **0 ms** in every trace. supabase-js 2.110 takes no lock here; it only reads localStorage.
- The request itself took **5–10 ms** (send → response).
- The time went into the queue's own steps on the calendar. Each step (an IndexedDB get + set, serialized through `withQueue`) took **80–200 ms** there, but 2–5 ms on the Tasks page.

Why: every queue step fires `kf-outbox-change`. `useOutboxMarks` (CalendarPage, PhoneCalendar, TodayPage, TaskSheet) answered each one with brand-new `Set`s, even when nothing it shows had changed. So the whole calendar re-rendered once per step, and the queue's next IndexedDB callback waited behind that render.

A drop queues 5 writes: the block, the task twice and two activity rows. That is 5 enqueues, 4 removes and the peeks in between, so about 9 calendar renders before the last write left. The first write could only go once all 5 enqueues were done, because the drain's first peek is queued behind them.

Experiments ran interleaved with runtime flags on the dev server, 7 runs each. Each cell is the median time until the last write left the queue:

| variant | complete (2 writes) | drop into slot (5 writes) |
|---|---|---|
| base | 617 ms | 1218 ms |
| marks keep their identity (H1) | 231 ms | 458 ms |
| peek doesn't write back (H6) | 561 ms | 1057 ms |
| both (shipped) | 169 ms | 394 ms |

## The fix (`app/src/lib/outbox.ts`)

- **`outboxMarks(prev, table, queue, dead)`** returns `prev` itself when this table's pending and failed ids didn't change, so React skips the render. `useOutboxMarks` uses it through `setMarks((prev) => …)`. Because the change is in the shared hook, all four callers get it.
- **`withQueue`**: a peek returns the same array, so it no longer writes it back. That saves one readwrite transaction per peek, and peeks run on every refetch (`reapplyPendingWrites`) and every topbar refresh (`unsyncedChanges`).

Ordering per row, retry and backoff, offline persistence, the account gate, dead-lettering and dedupe are untouched. The drain loop is unchanged.

## Timings, before → after

These are interleaved A/B runs in one build, with a flag that restores the old behaviour, 7 runs each. Each cell is the median time from the first `writeRow` to the first send / to the last write leaving.

| | production build (mock) | dev server (machine at 100% CPU) |
|---|---|---|
| drop into a slot | 687 / 1252 ms → **282 / 431 ms** (worst 1364 → 526) | 1153 / 1682 ms → **615 / 850 ms** (worst 2458 → 1282) |
| complete a slot task | 328 / 442 ms → **132 / 192 ms** | 561 / 763 ms → **266 / 318 ms** |
| edit a title (Tasks popover) | 50 / 110 ms → 44 / 94 ms (no calendar there, no change expected) | 107 / 209 ms → 93 / 171 ms |

What's left on the calendar (~250–600 ms to the first send) is the drop's own render plus one render that does belong there: the block's "saving ◌" mark coming and going.

## Proof

- **The red loop**: time-slots s5 run alone with the drain wait removed. On the base code it passed **1/5** (4 failures: `settle` saw no writes). With the fix it passed **5/5**.
- **Full time-slots without the drain wait**: 51/52, failing once on s1, the run's first check on a cold page. s1 alone passed 5/5. I kept the drain wait in the harness, because writes leave asynchronously by design. I corrected its comment, which blamed getSession.
- **Harnesses, as committed, on the fix** (dev server :5286, mock): time-slots **52/52** · fix-tasks **70/70** · fix-inbox **69/69** · capture-rules **42/42**.
- **Tests**: two new in `outbox.test.ts`, both red before the fix. One checks that marks keep their identity when the change is to another table (and change when this table's do). The other checks that reading the queue doesn't write it back.

## Gates

`npx vitest run`: **2187 passed** (159 files). `npm run lint`: **0 errors** (21 old warnings, none in outbox). `npm run build`: OK. `npm run ds:check -- --baseline scripts/ds-baseline.json`: **0 new**. No date logic was touched, so the 4-TZ run wasn't needed. The temporary `[DEBUG-obx]` instrumentation is gone (grep finds 0).

## Not done / notes

- **Real network, not measured.** There's no real backend in the harness. The drain still sends one row per request, oldest first. Against hosted Supabase (likely ~100–300 ms per round trip from Cairo), a 5-write drop takes about 5 × RTT to fully leave. Batching consecutive same-table upserts into one request would cut that. The catch: one rejected row would fail the batch, so a rejection would have to fall back to one row at a time to keep dead-lettering per row. Add it if "saving ◌" lingers on the phone.
- The base branch moved on after this worktree was made (mcp-full, v1.1.8: 19 commits). None of them touch the outbox or this harness. `docs/log/INDEX.md` may need a trivial merge.
