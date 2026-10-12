---
date: 2026-10-12 21:51 UTC
session: github-rules
type: handoff
related: Kai 2026-10-12 "build the unbuilt designs" · design-export/Settings.dc.html 2a ("Rules · how GitHub lands") · docs/phases/P6-integrations.md · docs/log/2026-09-27-0711-p6-github-handoff.md · docs/log/2026-10-12-1919-ds-check-audit.md
---

# github-rules: the GitHub rules panel, and github-sync honouring it

Branch `claude/github-rules`, cut from `origin/claude/kai-bugs-1012` @ `c6d3bd18`. Not merged, not deployed. **No migration, no new secret, no new dependency.** Two edge functions change (`github-connect`, `github-sync`, plus their shared `_shared/github.ts`).

## What Kai gets

Settings → Integrations → GitHub (desktop) and Settings → Connections (phone) now carry 2a's panel under the card:

- **Watching** — the watched repos as chips (`✕` stops watching), **+ add repo** opens the repos the token can see. The list is fetched server-side by `github-connect` `{action:'repos'}`; the token never reaches the client. Max 10 (the old limit). Adding a repo starts a sync, so its open issues arrive now.
- **New issues land in** — Inbox | Straight to Tasks.
- **Priority in inbox ordering** — High | Normal | Low.
- **Pause this source** — the status reads "Paused", nothing syncs, Sync now says "GitHub is paused — turn Pause off to sync again."

Each control saves at once (`github-connect` `{action:'rules'}`), shows the change straight away, and puts back what the server has if the save fails (with the reason).

## How the rules work (server)

- **Stored** in the existing `integrations` row: `data.rules = {land, priority, paused}` next to `data.repos`. The client reads `repos:data->repos, rules:data->rules` as JSON paths, never `data`. Absent until the panel is first touched.
- **No rules saved = today's behaviour**: issues assigned to you anywhere plus every open issue in the watched repos, into the Inbox, syncing every 30 min. Every current user stays exactly there until they change something.
- **Rules saved**: the picked repos are the whole scope; none picked = issues assigned to you. The Watching row's help line says which in every state ("Every open issue in these repos, and nothing else" / "None picked: every open issue assigned to you" / legacy: "…plus any assigned to you").
- **Straight to Tasks**: a new issue becomes a task with no project/area/domain/date (the Unfiled place) and `external_ref = {source:'github', id: node_id, url, repo, number, synced: true}`, so the task editor and sheet show "View issue ↗" as for a filed issue. Dedupe by node_id spans **both** tables: an issue that already has a letter (any status) or a task never lands again, whichever way the switch points. When a synced task's issue closes or disappears, the sync ticks it off (`done`, `completed_at`, off Top 3, activity `task.completed {source:'github', reason}`); still open but out of scope → only `checked_at` is stamped (rotation, ≤20 GETs a sync, like the inbox). **A task filed by hand from the Inbox is never touched** (no `synced`).
- **Pause**: the cron filters paused users out; "Sync now" answers 409 `paused`.
- **Priority** is the Inbox's: High = the GitHub letters above your own captures; Normal = below them (as before); Low = below them, folded to the heading ("Show 2"); a deep link to a letter unfolds it.
- **Saving** is read-merge-write guarded by `updated_at` with one retry (a sync stamping `synced_at` mid-save isn't clobbered; twice in a row → `busy`). Adding a repo clears `synced_at` so the next sync is a full one — otherwise a newly watched repo's older issues sit behind the watermark forever. (Side effect, same as after any reconnect: an issue you dismissed more than 30 days ago that's still open could come back once.)
- **Reconnect** keeps the watched repos and rules. The connect form lost its "Watched repos" text field (the chips replace it); an installed older app that still posts `repos` with the token is honoured.

## Files written

- `supabase/functions/_shared/github.ts` — `searchQueries(…, onlyRepos)`, `GithubRules` / `DEFAULT_RULES` / `readRules`, `landing()` (issue → table + row), `SyncedTaskRef`, `staleFirst()` (planSync's recheck order, shared with tasks)
- `supabase/functions/github-connect/index.ts` — `{action:'repos'}`, `{action:'rules'}`, reconnect keeps repos/rules, `repo_not_found` path gone (no repo typing any more)
- `supabase/functions/github-sync/index.ts` — pause (cron + user), only-repos scope, landing into inbox or tasks, known ids across both tables, synced-task recheck, `completed` count
- `app/src/features/settings/api.ts` — selects `repos`/`rules`; `githubRulesOf`, `watchingHelp`, `githubState` says Paused; `useGithubRepos`, `saveGithubRules`; `connectGithub(token)`; new error sentences (`paused`, `busy`)
- `app/src/features/settings/SettingsPage.tsx` — `GithubProvider` (desc/link follow the landing, status dot by tone, no repos field) + new `GithubRulesPanel`; summary row's help follows the landing; **plus** a `// ds-ok:` reason on the two key-off `ConfirmCard`s (capture key, MCP key — a key can't be restored, so they ask first). Those two lines were ds-check's only NEW hits in this file.
- `app/src/features/settings/settings.css` — `.st-gh-rules` (bone, dashed top rule, out to the card edges; phone margins), `.st-gh-rules-label`, `.st-chip-x`
- `app/src/features/inbox/InboxPage.tsx` + `Inbox.css` — the priority: GitHub section above/below captures, Low folded (`.ib-gh-fold`)
- `app/src/features/settings/githubPlan.test.ts`, `api.test.ts` — tests below
- `docs/DATA_MODEL.md` (a GitHub-rules bullet after 0042; the two function rows extended), `docs/phases/P6-integrations.md` (2026-10-13 Notes)
- `docs/log/assets/github-rules/` — `functions-check.ts` + `.txt`, `verify.mjs` + `verify-output.txt` + `verify-results.json`, screenshots
- this file, one line in `docs/log/INDEX.md`

## Evidence

- **Functions, run for real under Deno** (`deno 2.9.6`, `npx deno@2`): `npx deno@2 check github-sync/index.ts github-connect/index.ts` clean. `docs/log/assets/github-rules/functions-check.ts` loads both handlers with every fetch answered in memory (a small PostgREST over integrations/inbox_items/tasks/activity_log with 0027's unique keys, the auth server, GitHub) → **40/40** (`functions-check.txt`): legacy row = assignee + repo queries into the Inbox; repo list without the token, malformed names dropped; rules saved and merged (token/login/status kept), unknown keys dropped, malformed repos refused, not_connected; watermark cleared on a repo add; the `updated_at` race retried once, then `busy`; only-repos scope (no assignee query); Straight to Tasks lands unfiled tasks with the link, not again for an issue that's already a letter/hand-filed task; closed → done + `task.completed` "closed on GitHub", deleted → "gone from GitHub"; hand-filed task untouched; out-of-scope open → `checked_at`; Pause: Sync now 409, cron users 1 of 2, nothing landed, no stamp; unpause syncs; reconnect keeps repos/rules and answers only `{login}`; an old client's repos honoured; bad token 400; no user 401; the token never in any row.
- **App gate** (worktree): `npx tsc -b` clean · `npx vitest run` **143 files / 1859 tests passed** (one zone, Git Bash; CI runs the ×4 TZ matrix) · `npm run lint` exit 0, 0 errors (21 warnings, none in touched files) · `npm run build` ok, no `github_pat_…` token pattern in `dist`.
- New tests: `githubPlan.test.ts` (scope with/without saved rules, `readRules` defaults + junk, `landing` inbox/tasks/priority-and-pause-don't-change-rows/non-github link, `staleFirst`), `api.test.ts` (Paused state + failing still wins, `githubRulesOf`, `watchingHelp` in all states).
- **ds-check**: `npm run ds:check -- --baseline scripts/ds-baseline.json` → **0 NEW** in `features/settings/*` and `features/inbox/*` (SettingsPage.tsx had 2 NEW before — the key-off confirms — now marked `ds-ok` with the reason). The run still exits 1 on 118 NEW hits in other folders that were already on the base branch (calendar, tasks, today, trash…), not touched here.
- **Browser** (real app, dev server from this worktree, `--mode mock` on :5260, `app/.env.mock.local` copied from the main checkout, repo list + rules save + sync mocked): `node docs/log/assets/github-rules/verify.mjs <out> http://localhost:5260` → **53/53** (`verify-output.txt`): the four rows as drawn; chips + ✕; + add repo lists the server's repos minus the watched; add/remove/landing/priority/pause each save the whole state through `github-connect` and never write `integrations` directly; adding a repo starts a sync; Tasks changes the help, desc and the link ("See your tasks →"); Pause → "@kai · Paused" + Sync now says paused; legacy help; failing token → no panel; failed save → message + switch back; summary row "Issues land straight in Tasks" + "Paused"; phone (390×844) day + night: panel present, no sideways scroll, segments 48 tall, ✕ has the kit hit area; Inbox desktop + phone: Normal below, High above, Low folded → "Show 2" unfolds; no page errors anywhere.
- **Side by side with 2a**, 1280×800 + 390×844, day + night: `side-2a-desktop-{day,night}.png`, `side-2a-phone-{day,night}.png` (2a draws desktop only; the phone shows the same panel). Also `desktop-add-repo-open.png`, `desktop-github-card-{tasks,paused}.png`, `{desktop,phone}-inbox-{normal,high,low-folded}.png`.

## Not verified

- Against a real Supabase/GitHub: no `db push` needed, but the functions weren't deployed or called against GitHub itself (the Deno run stubs it). Worth one real Sync now with Kai's token after deploy.
- Docker suites (`supabase/tests`) not run — nothing schema-side changed.

## Judgement calls for Kai

1. **Low priority = folded.** The Inbox only has "above" and "below" for the GitHub letters, so Low folds them under their heading. Say if Low should mean something else.
2. **Scope once rules are saved.** 2a says "issues … from watched repos", so after the first save the picked repos are the whole scope; before it, nothing changes. Someone with watched repos who touches any control stops getting assigned issues from *other* repos (pending ones stay). The Watching help line says so.
3. **The Watching row has a help line** the design doesn't draw — it makes the chips drop under the label at desktop width. It's there because the scope rule is new; drop it if the chips on one line matter more.
4. Segments and the switch are the kit's (UI pass), not 2a's raised-parchment segmented look. The card's "Connected · synced …" status sits under the title as before, not top-right as drawn.
5. Priority applies to Inbox letters only; tasks that land Straight to Tasks get no priority.

## Release order

1. Deploy `github-connect` **and** `github-sync` together (they share `_shared/github.ts`; the release workflow already lists both). No `db push`, no secrets.
2. Then the app. An app without the panel against the new functions behaves as today; the new app against old functions would fail the rules save (`{action:'rules'}` unknown → it would be read as a connect with no token → `bad_request`), so **functions first**.
3. Kai: open Settings → Integrations → GitHub once and check the chips match the repos he means to watch.
