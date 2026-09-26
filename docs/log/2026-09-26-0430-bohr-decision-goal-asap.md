---
date: 2026-09-26 04:30 UTC
session: bohr
type: decision
related: CONDUCTOR.md Prime Directive 1
supersedes: none
---

# Goal date: ASAP (Kai, 2026-09-26)

Kai's answer to "what's the new target date for the v1.0 ship call?": **"asap"**.

What that means for the loop:
- No fixed date. Ship v1.0 as soon as FIX-0 (security) and the remaining FIX waves pass the release gate and Kai's re-judge.
- Parallel workers on non-overlapping files, small release batches, no gold-plating. FIX-7's design half stays elastic: if the picker mocks aren't ready, v1 ships with native pickers (FIX-PLAN's own fallback).
- The safety order is unchanged: nothing that makes the app nicer ships ahead of what makes it safe to be public.
- Still unanswered: whether `supabase db push` (0030–0034, K-c) ran after 09-24.

Environment unlock found while acting on it: this cloud container can run Docker, so a **local Supabase stack** (all migrations + auth + edge runtime) can back logged-in real runs and edge-function integration checks here, with no production data or credentials involved.
