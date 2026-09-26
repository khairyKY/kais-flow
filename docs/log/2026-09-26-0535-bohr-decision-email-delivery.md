---
date: 2026-09-26 05:35 UTC
session: bohr
type: decision
related: J-11, S10, K-i, FIX-4
supersedes: none
---

# J-11 reviewed + merged into release-1; public email delivery is a new blocker (K-j)

**J-11 review (conductor):**
- Recovery link read at boot, before the router: `recovery.ts` is imported eagerly by `AuthProvider`.
- `/reset` sits outside `RequireAuth`/`OnboardingGate`.
- Links that land on the wrong path get re-pointed to `/reset`.
- A 429 on the reset request reads as "sent" (enumeration guard).
- Account switch via an email link now clears the query cache (a real cross-account cache leak, tested both ways by the worker).
- Client password floor raised 6 → 8 (S10).

Verdict: OK. Merged into `claude/release-1`. Batch: 244/244 under UTC, Cairo and LA; lint 2 (baseline); build green. Worker evidence: 38/38 end-to-end checks on the local stack (`docs/log/assets/j11/e2e-run.log`).

**New blocker K-j — public email delivery.** The hosted project almost certainly still uses Supabase's built-in email sender, which Supabase documents as for testing only: low hourly rate limit, and delivery restricted to the project team's own addresses. Verify in the dashboard. If so:
- No public user receives a password-reset email.
- **Turning email confirmation ON (S10/K-i) without custom SMTP would block every new sign-up.** So S10's "confirmation ON" must wait for K-j.

$0 fix: a free SMTP provider plugged into Auth → SMTP settings. Kai picks the provider and creates the account ([KAI]; the hard rule is no credit card). Nothing to code.
