---
date: 2026-09-26 06:06 UTC
session: bohr
type: decision
related: audit-newuser (origin/claude/audit-newuser @ 43daaac, docs/log/2026-09-26-0533-audit-newuser.md), Phase A, Phase B
supersedes: none
---

# New-user audit triage: every top-10 item has an owner

| # | Finding | Sev | Status |
|---|---|---|---|
| 1 | `user_id: ''` → people / interactions / time entries / library never save | P0 | **fixed** in release-1 (`fdc978c`) + rescue of lost writes |
| 2 | Offline journal typing → one row per keystroke | P0 | **in progress**: P0-B worker (`claude/p0b-offline`) |
| 3 | Offline sign-out deletes unsent changes and stays signed in | P0 | **in progress**: P0-B worker |
| 4 | Calendar day headers one day behind east of UTC | P1 | **fixed** in release-1 (FIX-2 / J-15) |
| 5 | Phone: Tasks / Projects / Activity / Trash unreachable | P1 | **in progress**: Polish C |
| 6 | Sign-up skips onboarding | P1 | **in progress**: Polish A |
| 7 | No error page (developer screen on bad URL / crash) | P1 | **in progress**: Polish A |
| 8 | Onboarding answers unused; Kai-specific strings for every user; `/seasons` "Good morning, Kai" | P2 | **in progress**: Polish C (strings) + Polish A (gallery gating) |
| 9 | Routines: weekdays ignored in the day's list, new routine "streak lost", sample-filled form | P2 | **in progress**: Polish B |
| 10 | 1280px layouts: Journal crushed, calendar week shows 2 of 7 days, Tasks rail covers tabs | P2 | **queued**: Polish D, after P0-B (Journal overlap) |
| — | Also found by the conductor while fixing #1: activity events with non-uuid keys dead-lettered daily | P0 | **fixed** in release-1 (`a294f52`) |

**Queued runners-up (P2):**
- Search failure looks like "no results" + double input → Polish C.
- Activity mislabels → Polish C.
- "Up next" calls a 10:00 event "Now" at 08:38 → Polish D.
- Offline sync popover shows raw table names and double counts → Polish D.
- Task editor / command-bar times are device-local (T-4) → after Polish D.
- Single-task complete has no Undo (punch 6) → Polish D.

**Could not check (environment):**
- Edge functions don't boot in the local runtime (proxy certificate).
- No Groq key.
- No push service.
- No microphone.
- The live site is blocked.

These go on Kai's hands-on list for the live re-judge.
