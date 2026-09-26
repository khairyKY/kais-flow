---
date: 2026-09-26 06:08 UTC
session: bohr
type: audit
related: release-1, FIX-0, J-11, S1 S3 S4 S5 S6 S9 S10, SEC-2, P0-B
supersedes: none
---

# Security review of `claude/release-1` vs master (independent reviewer, read-only)

**Verdict: SHIP WITH FIXES.**
- No HIGH finding.
- S1, S3, S4, S5, S6 and S9 verified fixed in code.
- No secrets anywhere in the diff or the 41 branch commits.
- `supabase/functions/.env` is untracked.

| # | Sev | Finding | Owner |
|---|---|---|---|
| 1 | MEDIUM | Open signup + no per-user cap: throwaway accounts can exhaust the shared /bin/bash Groq quota | **SEC-2**: per-user daily AI allowance (0036) + reject anonymous users. Email confirmation ON waits for **K-j** (SMTP) |
| 2 | LOW | Outbox entries not tagged with their account; the load-time flush isn't owner-gated; an expired session flushes with the anon key and dead-letters | **P0-B**, added to scope: uid-tag entries, session-gated flush |
| 3 | LOW | `slipping` view joins without owner match (can't leak into pushes, but can skew counts) | **SEC-2** (0036 view rebuild) |
| 4 | LOW | Sign-out doesn't unsubscribe the device's push | **P0-B**, added to scope |
| 5 | LOW | `notify` will POST to any user-supplied endpoint host (blind SSRF) | **SEC-2**: push-host allowlist |
| 6 | LOW | Implicit flow allows login CSRF via an attacker's own recovery link | **Deferred to Kai**: PKCE trade-off (a reset link then only works on the device that requested it) |
| 7 | INFO | Sign-up reveals whether an account exists | **Deferred**: accept, or neutral copy later |

**Deploy note for Kai:** keep the hosted redirect allow-list EXACT (`https://kais-flow.kaidagoat.workers.dev/reset`). Never add a wildcard like `https://*.workers.dev/**`: with the implicit flow, recovery tokens go to any allow-listed URL the requester names.

**Clean, don't re-audit:**
- `requireUser`
- the service-role gate
- the constant-time compare
- the CORS allowlist
- notify per-user scoping
- 0035
- the password-reset redirect/replaceState/enumeration guard
- the account-switch cache clear, which covers the IndexedDB persister
