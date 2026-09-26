---
date: 2026-09-26 05:20 UTC
session: bohr
type: decision
related: K-c, S2, FIX-0, FIX-4, FIX-5, J-16, punch 25
supersedes: none
---

# K-c: `db push` has NOT run — 0030–0034 ride in the first backend release

Kai, 2026-09-26: "no I didn't, continue looping".

**Consequence:** production is on 0029. Code on `master` already expects 0030–0034, so on live today (from reading the migrations, not verified live):
- a second account can't save settings (0030 — singleton pk) → onboarding re-runs; writes dead-letter;
- a second journal entry on the same day violates the old unique index (0033) → dead-letters silently — **a plausible contributor to J-16**;
- search misses people/events/projects/journal (0031); compost never runs (0032); `do_resurface()` is RPC-callable by any account (0034).

**Plan:** the first backend release pushes **0030–0035** together (0035 = FIX-0's scoping migration), then FIX-0's functions, then the frontend. FIX-5's search rebalance becomes 0036, built on top of FIX-0's `search_hybrid`, and can ship in the same or the next release.

**Data-risk read of 0030–0034 against existing data** (conductor, by reading the SQL + a clean apply on the local stack):
- 0030: safe — `app_settings` is a singleton with `user_id not null`, so the new pk can't collide.
- 0031: safe — function replacement only, no new generated columns (so the outbox strip list needs no change).
- 0033, 0034: safe — index swap; revokes + `search_path` pin.
- **0032: destructive by design.** Schedules `compost_expired()` at 03:30 UTC daily: hard-deletes Trash rows (tasks, calendar_events, journal_entries, inbox_items with `deleted_at` > 30 days) and dismissed inbox captures untouched for 30 days, for every user. **The first run after the push permanently deletes everything that qualifies from July/August.** → Requires: a backup immediately before the push, and Kai's explicit OK on this effect (rule: ask first for irreversible data changes).
