# classroom — Google Classroom deadlines as tasks (Kai 2026-11-03)

Branch `claude/classroom` (off `claude/kai-bugs-1012`, merged back in before finishing). Not merged, not released.

## What it does

Settings → Integrations → **Google Classroom** (own page, own consent, own `integrations` row; the Calendar connection is never widened).

- **Connect** → Google's consent page, three read-only scopes only, no `include_granted_scopes`, so the token carries nothing from Calendar. **Courses**: one switch each (all active ones on at first connect; a class joined later shows up *off* after "Look for new courses"). **Sync now**. **Disconnect** first asks: *Keep them* / *Move them to Trash* / *Cancel*.
- Every **3 hours** `classroom-sync` runs from pg_cron (`11 */3 * * *`, migration 0091) for every connected, non-failing user.
- Each chosen course → a **project** in a **Classroom domain**; each published assignment → a **task** in it: due date and time exactly as Classroom says, a link back (`external_ref.url`), no AI anywhere.
- **Handed in** (`TURNED_IN` / `RETURNED`) → the task is ticked done (same write as the app: `completed_at`, `top3 false`, `task.completed` in the log). Due date changed on Classroom → the task's date follows. Work deleted/unpublished on Classroom → the open task goes to **Trash** (a done one stays as history).
- No duplicates: `external_ref {source:'classroom', id:'<course>/<work>'}`, 0027's unique indexes as the backstop. **No new column** — only 0091 (provider check admits `'classroom'`, plus the cron).

## Choices I made (the brief said "choose and say")

| Question | Choice | Why |
|---|---|---|
| Undated work: Someday or Inbox? | **Someday** (`someday = true`, project set) | The Inbox is for things that still need sorting; these already have a home. They sit out of Today until a date appears, and take it the day Classroom gives one. |
| "Classroom **area**" | A **domain** named Classroom (an existing one by that name is reused) | Areas can't hold projects in this data model; `projects.domain_id` is the only grouping. Say if you want a real area created too. |
| A date with no time | **23:59 on the student's clock** (not the app's 09:00 convention) | Classroom's "due Nov 10" means all of the 10th; 09:00 would show it overdue all afternoon. |
| Already handed in / drafts / due > 30 days ago | **Not imported** on first sight | No flood of last term. A later hand-in of a task we already have still ticks it. |
| Course unticked | Stops syncing, **keeps** what came in | Tasks are the person's. |
| Someone edits a date or title here | Kept until Classroom itself changes it | `external_ref.due/.title` hold what Classroom said last time; we only write when that moves. |
| A task/project the person trashed | Never brought back | Row stays, sync skips it. |
| A read that fails (a course, a page, a 500) | That course is left exactly as it was | A partial list must never trash the rest. |
| Disconnect → remove | Tasks and course projects to **Trash** (30 days), not a hard delete | Reversible. Disconnect → keep: the row goes, tasks stay; **reconnecting finds them again, no duplicates** (tested). |

## Research (sources checked 2026-11-03)

- **API.** `courses.list` (`studentId=me&courseStates=ACTIVE`, scopes `classroom.courses[.readonly]`) — https://developers.google.com/workspace/classroom/reference/rest/v1/courses/list . `courses.courseWork.list`: published only for students ("Course students may only view `PUBLISHED` course work"), scopes include `classroom.coursework.me.readonly` — https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork/list . `CourseWork.dueDate` / `dueTime` are **UTC**, `dueTime` optional, `alternateLink` only when PUBLISHED — https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork . `studentSubmissions.list` with `courseWorkId = -` and `userId=me` returns every submission of the course in one call; states `NEW, CREATED, TURNED_IN, RETURNED, RECLAIMED_BY_STUDENT` — https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork.studentSubmissions/list . Announcements: out of scope.
- **Scopes** — https://developers.google.com/workspace/classroom/guides/auth and https://developers.google.com/identity/protocols/oauth2/scopes : `classroom.courses.readonly` ("View your Google Classroom classes"), `classroom.coursework.me.readonly`, `classroom.student-submissions.me.readonly` ("View your course work and grades"). **Honest gap:** Google's public tables carry no sensitive/restricted column — the flag appears only in the Cloud Console's scope picker (https://developers.google.com/identity/protocols/oauth2/scopes says so in its intro). These are read-only student scopes, so *restricted* (security-assessment tier) is not expected; treat them as possibly *sensitive*. **Check the Console flag when adding them.** In **Testing** mode (≤100 test users) no verification is needed — but refresh tokens expire after **7 days** (https://www.unipile.com/google-oauth-refresh-token/ and the existing note in `google.ts`), so Settings will say "Access expired — reconnect" about weekly until the app is published.
- **School / university accounts.** Workspace admins control third-party apps under Admin console → Security → Access and data control → **API controls** (Trusted / Limited / Specific scopes / **Blocked**): "If you block access to a third-party app, users can't sign in to the app using their managed Google account" — https://knowledge.workspace.google.com/admin/apps/review-and-manage-third-party-app-access-requests . For Education the pages say the new request-review feature is not available to Workspace for Education and that unconfigured apps are blocked for under-18 users; the user then sees **"Access blocked: Your institution's administrator needs to review [app]"** on Google's page and can ask the admin — https://developers.google.com/classroom/best-practices/access-control-enhancements . In the OAuth response the error is `admin_policy_enforced` ("unable to authorize one or more scopes … due to the policies of their Google Workspace administrator") — https://developers.google.com/identity/protocols/oauth2/web-server . **What Kai's Flow does:** that return → "Your school's Google administrator has blocked outside apps from Classroom. Ask them to allow Kai's Flow, or use a personal Google account."; Google's own block page never returns to us (the person just sees Google's page); a later 403 from the Classroom API → "Google Classroom refused access…" without marking the grant failing. Granular consent (a box unticked on the consent page) → "leave all three Classroom boxes ticked".

## Privacy ("no AI processing")

- `site/src/pages/info.mjs` §5 (heading now "Google Calendar, Google Classroom and GitHub") has a new paragraph: what is read, every 3 hours, none of it goes to the AI, Limited Use applies, a blocked school account reads nothing, disconnect keeps-or-trashes. `app/public/privacy.html` regenerated (`site/tools/app-privacy.mjs`); legal tests green.
- **Made true, not just stated:** chat (`chat/index.ts`: search hits, Top 3 picks, today/tomorrow snapshot) and every MCP read (`mcp/store.ts`: `dayTasks`, `doneTasks`, `listTasks`, `getTask`, `slotTasks`, week stats, `projects`, `search`) skip tasks and course projects with `external_ref.source = 'classroom'` — the Google-Calendar-events promise, extended. The sync itself calls no model, and its activity-log rows carry no titles. MCP/chat suites in the Rehearsal stayed green (mcp-week 163, mcp-full 367).
- **I did NOT bump `PRIVACY_VERSION`** (that puts the "we've updated our terms" card on every account). The text is changed; **Kai/conductor: decide whether to bump before release** (`docs/LEGAL.md` has the recipe; the feature is inert until Classroom is connected, which needs the steps below).

## `[KAI]` steps before it works (docs/GOOGLE-SETUP.md §9)

1. Google Cloud, same project: **enable the Google Classroom API**.
2. OAuth client → add the redirect URI `https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/classroom-connect`.
3. Consent screen → add the three Classroom scopes; add the university account as a test user (Testing mode is fine for one person; reconnect weekly).
4. Release deploys `classroom-connect` + `classroom-sync` (added to `FUNCTIONS` in release.yml) and applies **0091** (migration number: the next free after 0090 *at the time I looked* — if another builder took 0091, renumber mine; it is self-contained).
5. A **university** Workspace account may be blocked by its admin — see above; a personal Google account in the same Classroom courses is the workaround.

## Checks

| Check | Result |
|---|---|
| Gate (`gate.ps1`: vitest ×4 zones, lint, build, ds:check) | green before the merge back: 197 files / 2751 tests in each of Cairo, UTC, Los Angeles, Tokyo; lint 0; build 0; ds 0 new. Re-run after the merge: green (200 / 2773). |
| `grep -c birthday_on types.ts settings.ts` | 1 / 1 |
| `deno check` | `classroom-connect`, `classroom-sync`, `chat`, `mcp`, `classroom-mock.ts`, `runner.ts` clean; the Rehearsal type-checks every function |
| Unit | `app/src/features/settings/classroomSync.test.ts` — 20 tests on the pure plan (`_shared/classroom.ts`): due math (UTC time; date-only = 23:59 local, Cairo and New York), hand-in states, insert/update/done/trash, edits kept, no duplicates, scopes, consent URL |
| Server suite `supabase/tests/classroom.sh` (Rehearsal, Google mocked by `supabase/tests/harness/classroom-mock.ts` via `HARNESS_CLASSROOM_MOCK` in `runner.ts`) | 75 checks. First full run on the Rehearsal: 73 pass, 2 were my psql `t`/`f` expectations (fixed). It found a real bug — imported tasks lacked `user_id` (service role has no `auth.uid()`), fixed. Final run on the merged head: **75/75**. |
| Harness `docs/log/assets/classroom/verify.mjs` (Settings UI on the mock, 10 scenes, day + night + phone) | 45/45 |
| Existing harness `docs/log/assets/google-sync/verify.mjs` (Integrations) | 101/101 |
| Existing harness `docs/log/assets/github-rules/verify.mjs` | 52/53 before my one-line fix to its "reads JSON paths, never `data`" check, which my second integrations query (also JSON paths) tripped; fixed to accept the Classroom select. Not a failure on base. |

Not covered by an automated test: the live Google consent page (needs Kai's Cloud setup), and a real university account. The MCP/chat exclusion is exercised only through the unchanged mcp-week/mcp-full suites staying green plus `deno check`; a dedicated "classroom task is invisible to list_tasks" assertion is a good next test.

## Files

New: `supabase/migrations/0091_classroom.sql` · `supabase/functions/_shared/classroom.ts` · `supabase/functions/classroom-connect/index.ts` · `supabase/functions/classroom-sync/index.ts` · `supabase/tests/classroom.sh` · `supabase/tests/harness/classroom-mock.ts` · `app/src/features/settings/classroomApi.ts` · `app/src/features/settings/classroomSync.test.ts` · `docs/log/assets/classroom/*`.
Touched: `SettingsPage.tsx` (the Classroom row, the `ClassroomProvider` / `ClassroomCourses` block placed before the Notifications section, the `?classroom=` redirect — all away from the Google blocks gcal-events edits), `categories.ts` (`classroom` provider), `chat/index.ts`, `mcp/store.ts` (CRLF kept), `supabase/config.toml`, `release.yml` (`FUNCTIONS`), `rehearsal.yml`, `tests/harness/runner.ts` (additive mock hook), `site/src/pages/info.mjs`, `app/public/privacy.html`, `docs/DATA_MODEL.md`, `docs/GOOGLE-SETUP.md`, `github-rules/verify.mjs`. **I did not touch `google-connect` or `google-sync`** (gcal-events); `settings/api.ts` is untouched too — Classroom has its own `classroomApi.ts` and its own query (`['integrations','classroom']`).

## Left over / for the conductor

- Decide the `PRIVACY_VERSION` bump (above).
- Renumber 0091 if gcal-events (or anyone) also used it.
- Optional: real *area* alongside the domain; re-listing courses is also done inside every sync (new ones arrive *unticked*).
- Weekly reconnect while the Google app is in Testing mode.

## After the merge

Merged `origin/claude/kai-bugs-1012` (13ca1308) cleanly, no conflicts. Gate re-run on the merge: green (200 files / 2773 tests in each of the four zones, lint 0, build 0, ds 0 new). Rehearsal on the merged branch (run 41674080685): **success — `classroom.sh` 75 passed, 0 failed**, with fix0-auth 85, sec2 110, notify-prune 12, mcp-week 163, mcp-full 367, widget 52 all green and every migration 0001→0091 applied from scratch.
