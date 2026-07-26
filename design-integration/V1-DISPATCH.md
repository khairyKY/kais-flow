# V1 Dispatch Config — Scenario 2 (Claude writes, free tier reads)

> **Decided 2026-07-26.** Execution has NOT started — this file makes it startable on Kai's "go" with zero further prep.
> **Mode: automatic dispatch.** The orchestrator session launches every worker itself via the Agent tool — Kai pastes nothing. Kai's only jobs are the [KAI] critical path in `V1-PLAN.md` and judging.

## Roster & routing

| Tier | Who | Agent type | May write code? | Gets |
|---|---|---|---|---|
| Orchestrator | Claude (this session / successor) | — | yes (Foundation F1–F4, F6 inline) | Reviews, merges, freeze list, foundation patches, punch-list bookkeeping |
| Feature workers | Claude | `general-purpose`, `isolation: worktree`, background | yes | One workstream each: WA-1…WA-11, WB-1…WB-4, F7 |
| Mechanical workers | OpenCode | `bulk-coder` | **only pre-specified diffs** | F5 sub-tasks where the prompt contains the exact target strings/files; anything judgment-shaped bounces back to Claude |
| Readers | Antigravity (Gemini, 1M ctx) | `heavy-reader` | **never** | Pixel-contract extraction from `.dc.html` (e.g. Projects 1a list for WA-8, Overlays §05 for WA-2's popover), review-prep comparisons, big-file summaries |

**Trust rule (why Scenario 2 is safe):** untrusted tools either cannot write (reader) or write only diffs the orchestrator already specified and re-reads line-by-line before merge (mechanic). Every branch — Claude's included — passes the orchestrator review gate against its punch items' Judge lines.

## Dispatch protocol

1. **Pacing:** ≤4 concurrent workers (account-wide quota + review bandwidth). Long poles first: WA-2 Calendar, WA-9 Rituals/Review, WA-3 Tasks.
2. **Isolation:** every worker runs with `isolation: worktree`; never the main checkout. Merged branches get deleted at merge time (keep the branch list clean — done for the old W/N waves 2026-07-26).
3. **Order:** F1–F4 orchestrator-inline (shared files) → F5 bulk-coder batch + F6 time-box + F7 worker in parallel → **freeze** → Wave A dispatch → Wave B after A merges → hardening.
4. **Review gate (every branch):** punch items' Judge lines pass · build green · no frozen file touched · no other wave's folder touched · undo wired via `lib/undo.ts` where items demand it · day+night · copy verbatim or [K-26]-ruled. Reject = one bounce with the findings; second failure = orchestrator takes the workstream over.
5. **Foundation patches:** any needed change to a frozen file routes through the orchestrator, lands on the integration branch, active worktrees rebase.
6. **Readers run ahead:** heavy-reader extraction jobs for WA-2/WA-8 dispatch alongside Foundation so the pixel contracts are waiting when the workers start.

## Prompt skeletons (orchestrator fills the slots at dispatch)

**Feature worker (Claude):**
```
V1 punch-fix workstream <ID>. Read, in order:
design-integration/briefs/_SHARED.md (V1 punch-fix mode section first),
design-integration/V1-PUNCHLIST.md items <n,n,n>,
design-integration/DRIFT-AUDIT.md sections for <surface>,
<pixel-contract file(s) if visual work>.
You own app/src/features/<folder>/ (+ <listed extras>). Frozen files per _SHARED.md.
Foundation provides: lib/undo.ts, lib/growthStages.ts, motion classes, kit.
For each item, finish by running its Judge: line yourself (dev server
http://localhost:5195 if reachable; else build + computed-style checks).
Deliver: branch in your worktree, fidelity note listing each item → what you did
→ Judge result. Do not merge.
```

**Mechanical worker (bulk-coder / OpenCode):**
```
Exact-diff task, no judgment. In <file:line>, replace <literal old> with
<literal new>. [× N edits, all enumerated.] Do not touch anything not listed.
Run: cd app && npm run build — must stay green. Report each edit applied.
```

**Reader (heavy-reader / Antigravity):**
```
Read-only. Extract from <design-export file> option <id>: the full element tree
with every inline style value, copy string, and asset path, as a build contract
for <workstream>. Output markdown. Write nothing outside your report.
```

## Preflight — verified 2026-07-26 (re-verify only if time passes before "go")

- [x] Branch `feature/botanical-integration` @ `2ec965c`+, working tree clean
- [x] `npm run build` green (5.4s, PWA 188 entries) — baseline
- [x] Old `ws/*` branches (13) deleted — all were merged; stale detached worktree removed (`claude/wizardly-moore-6f3ee5` branch intentionally kept: unmerged July-7 history, harmless)
- [x] `design-export/` present, read-only truth intact
- [x] Docs committed: DRIFT-AUDIT, V1-FEATURES, V1-PUNCHLIST (all decisions closed), V1-PLAN, this file, `_SHARED.md` V1 addendum
- [x] Agent roster available in this environment: `general-purpose`, `bulk-coder`, `heavy-reader`, `Explore`
- [ ] **[KAI] before/at "go":** dev server up + logged in at `localhost:5195` (workers fall back to build-checks if not)
- [ ] **[KAI] by Aug 1:** `supabase login` (gates MIG-1/2/3 — see V1-PLAN)

## On "go"

First dispatch batch (no further questions needed): orchestrator starts **F1 undo system** inline; launches **heavy-reader** contract extractions for WA-2/WA-8; queues **F5** bulk-coder tasks. Everything after follows V1-PLAN's timeline.
