---
date: 2026-09-26 04:05 UTC
session: bohr
type: correction
related: CLAUDE.md, docs/ROADMAP.md, GitHub issues, FIX-PLAN
supersedes: none (names the entries it corrects; they stay as written)
---

# Where the docs disagree with the code (code wins; originals left untouched)

1. **`CLAUDE.md` → "Deploy = push to `main` (Cloudflare Pages auto-builds)".** The branch is `master` (no `main` exists) and the host is Cloudflare Workers static assets (`app/wrangler.jsonc`, `*.workers.dev`). Read it as "push to `master`".
2. **`docs/ROADMAP.md` phase table** marks both "Botanical Integration" and "UX Retrofit" as *in progress (current)*. The current-phase note and all 2026-07-19→09-24 changelog entries show Botanical Integration → v1.0 fix waves is the only live thread; UX Retrofit's row is stale.
3. **GitHub issues** (65 open, none touched since 2026-07-08) include shipped work, e.g. #57 event-modal UTC shift (fixed session 20), #56 calendar right-click stubs (session 21), #75 `type="button"` (session 20), #74 self-hosted fonts (Hardening 2026-07-20), #43 Someday, #41 Subtasks (Wave 2 `3273dae`), #22 share target (punch 24). Not closed here — closing is Kai's call. Still genuinely open, for example: #73 — `63df737` stopped *writing* `embedding`, but `features/tasks/api.ts:17` and `features/trash/api.ts:22` still `select('*')`, so every task read still ships the vector + tsvector to the client.
4. **FIX-PLAN / audit test count** "203 tests" → 204 on `d14962f`, and "green" only holds on a Cairo-time machine (see the Phase 0 audit, T-1).
