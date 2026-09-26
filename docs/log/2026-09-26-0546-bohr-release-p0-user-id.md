---
date: 2026-09-26 05:46 UTC
session: bohr
type: handoff
related: P0 (audit 2026-09-26 "Create person — silent data loss"), J-16, release-1
supersedes: none
---

# P0 fixed: empty `user_id` silently lost new people / interactions / time entries / library rows

- Found by the new-user audit Part 1 (`origin/claude/audit-newuser`, `docs/log/2026-09-26-0533-audit-newuser.md`).
- Fixed by the conductor on `claude/p0-empty-user-id` (`fdc978c`), merged into `claude/release-1` (`e04114a`).

**Root cause:** `people/api.ts` (people, interactions), `projects/api.ts:224` + `focus/api.ts:34` (time_entries) and `library/api.ts` (4 sites) sent `user_id: ''`. That overrides the DB default, so Postgres returns `22P02` and the outbox dead-letters the write. The journal had the same bug (R4) and was fixed only at its call site.

**Fix:**
- `writeRow` → `networkPayload()` drops an empty `user_id` for every caller.
- `rescueEmptyUserIdWrites()` runs on sign-in (same owner only). It requeues dead letters rejected for exactly this reason, skips rows the server already has, lets a newer queued write win, and shows one calm toast.
- **This should recover people / time entries / library rows Kai created on his devices that never saved.**
- J-16 is not closed: this is one confirmed cause among possibly several. K-b's dump would show the rest.

**Evidence:**
- 6 new unit tests fail on the old outbox and pass on the fix.
- 265/265 under UTC and Cairo; lint 2 (baseline); tsc green.
- End to end on the local stack, production builds, same origin + browser profile:
  - old build: person dead-lettered, server 0 rows;
  - fixed build: toast "Recovered one change that hadn't saved earlier.", server 1 row with the right `user_id`, dead letters empty;
  - fresh create on the fixed build: saved directly.
- Script: `docs/log/assets/p0/rescue.mjs`. Screenshot: `docs/log/assets/p0/recovered-people.png`.

**Correction (append-only):** my entries named `…-0535-…` and `…-0600-…` were written at about 05:28 and 05:36 UTC. From now on filenames use `date -u`.
