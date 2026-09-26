---
date: 2026-09-26 08:34 UTC
session: bohr
type: test-run
related: release-1 (all merges), RELEASE GATE
supersedes: none
---

# release-1 release candidate — full gate run

**Candidate:** `claude/release-1` @ `6663c83`. Tested app code is `7b50920`.
- The app tree `dd6c950…` and supabase tree `313a1a4…` are **identical** at `6663c83`.
- The later merges carry docs only (conductor docs + Kai's README `fd54d42` from master).
- master `fd54d42` is an ancestor of the candidate.
- **Rollback point = `fd54d42`.**

**What's in it:**
- T-1, T-2, T-3
- J-11
- FIX-0, FIX-2, FIX-5, FIX-6
- P0 user_id, P0 activity entity_id, P0-B
- SEC-2, SEC-3
- Polish A, B, C, D, E, F1, F2a, F2b, G
- final-cleanup
- Migrations to ship: **0030–0037**.

**Gate results (all run by the conductor on the candidate code):**

| Check | Result |
|---|---|
| vitest UTC / Cairo / LA / Tokyo | 48 files · 659 tests each, all passed |
| lint | 2 errors = baseline (`ProjectsPage.tsx:23–24`, D2) |
| build | green; precache 204 entries; `version.json` = commit |
| `supabase/tests/fix0-auth.sh --harness` | 79/79 |
| `supabase/tests/sec2.sh` | 110/110 |
| `supabase/tests/notify-prune.sh` | 12/12 |
| `supabase/tests/fix5-search.sh` | 31/31 |
| Route sweep (prod build, local stack, 20 routes × desktop 1280 / phone 390 × day / night) | **80/80 clean**: no console/page errors, no dev error screen, no sideways scroll, document height = window. Aborted-navigation requests are excluded as noise. |
| Key flows on one fresh account, DB read back over REST | person saved; ritual step persisted; complete → "Undo" toast → task back to `todo`; journal typing → exactly 1 entry with full text; 0 dead letters; console clean |
| Security review (independent) | SHIP WITH FIXES → fixes shipped in SEC-2 / SEC-3 / P0-B. Deferred by decision: PKCE and the sign-up enumeration message. |

**Not verifiable from the cloud:** these go on Kai's live check list (runbook step 7 + TEST-LEDGER R-1…R-13).
- Real Groq (AI parse/chat/voice)
- Real push delivery
- Real gte-small embeddings
- The live Cloudflare site
- Hosted Supabase settings
- Safari / real phones

**Known, deferred to v1.1 (decided):**
- the goal card drops a finished Top-3;
- the calendar grid and event panel use device time outside Cairo;
- weather is Cairo for everyone;
- `seed_avatar` is shown nowhere;
- H2 pagination (1000-row cap);
- the JS bundle is over the 200KB budget;
- D2 `useIsMobile` dedupe (the 2 lint errors).
