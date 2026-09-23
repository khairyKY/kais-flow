# Security & Codebase Audit — 2026-08-01

> **What this is.** A full-repo security + health audit run before the v1.0 public ship. Same register shape as the `KAI-AUDIT-*` files: every finding has an ID, a file:line, a verdict, and a fix direction. **Nothing in this audit has been fixed** — this is PASS 1 (find and report) only. PASS 2 (fix) is gated on Kai's go-ahead per group.
>
> **Scope.** Whole repo, not a diff: 6 edge functions, 34 migrations, `app/src` (167 files / 32,152 lines), dependency tree, git history.
> **Method.** Manual read of the security surface + three parallel read-only sweeps (SQL/RLS, client secrets & data exposure, duplication/refactors). Every claim below that drives an action was re-verified by hand against the source before being written here.
> **Baseline at audit time.** `npm run build` ✅ · `tsc -b` ✅ · **202/202 tests pass** in 22 files (2.1s). Branch `feature/botanical-integration`, working tree clean, HEAD `34fed07`.

---

## 0. The one-paragraph verdict

The codebase is in **better shape than a typical pre-ship audit finds**. There are no hardcoded secrets anywhere (including git history), no XSS surface at all, no SQL injection, correct RLS on all 22 tables, a correct route guard, and genuinely good error handling around network/IO. **Every npm advisory is a devDependency that never reaches the browser.**

The real exposure is concentrated in one place: **the six edge functions do not authenticate their caller**, and two of them run on the service-role key. This was harmless while Kai was the only account. `V1-FEATURES.md:137` and `V1-PLAN.md:55` make v1.0 an explicitly **public, multi-user** release, and `SignInPage.tsx:76` already ships a live `supabase.auth.signUp` — so it stops being harmless at launch. Migration `0034` already says this in its own header comment; the fix it authored has **never been pushed**.

Plus one live crash regression (**B1**) and one timezone correctness bug (**B2**) found in the same pass.

### Priority board

| Rank | ID | What | Effort | Blocked on |
|---|---|---|---|---|
| 1 | **S2** | `supabase db push` — ships the already-written `0034` revoke | zero code | **[KAI]** login |
| 2 | **B1** | Conditional-hook crash on `/projects/:id` cold load | 1 line | — |
| 3 | **S1** | `notify` fans every user's data to every device, unauthenticated | ~15 lines | — |
| 4 | **S3** | `transcribe`/`parse-capture`/`chat` = free Groq proxy on Kai's key | ~12 lines | — |
| 5 | **S4** | `do_resurface()` selects across all tenants | new migration `0035` | Kai (logic) |
| 6 | — | `npm audit fix` + patch/minor bumps | mechanical | — |
| 7 | **D2/S7/H1** | Safe cleanups | mechanical | — |

---

## 1. Security

### The load-bearing mechanic — read this before any S-finding

`supabase/config.toml` has **no `[functions.*]` block**, so `verify_jwt` defaults to `true`. **That is not authentication.** `verify_jwt` only proves the caller presented a JWT signed by this project — and **the anon key is exactly such a JWT, and it is public**. Confirmed present in the deployed bundle at `app/dist/assets/supabase-49206bn9.js`.

So: anyone who opens https://kais-flow.kaidagoat.workers.dev can lift the anon key from the JS and call every edge function. **None of the six functions checks that a real *user* is behind the request.**

> ⚠️ **Not live-tested.** Verifying this against production means sending unauthenticated requests to the live project, which is an outward-facing action. The one-line confirm is in §1.9 for Kai to run.

---

### S1 · `notify` runs service-role with zero authz and fans all users' data to all devices — **HIGH** (conf. 0.95)

**Where:** `supabase/functions/notify/index.ts:99` (service client), `:33-34`, `:45-49`, `:60-66`, `:85-88`, `:114`

The handler takes an attacker-controlled `kind` from the body and builds a client with `SERVICE_ROLE_KEY` — **RLS fully bypassed**:

```ts
const { kind } = (await req.json()) as { kind: NotifyKind }        // :98  attacker-controlled
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)      // :99  bypasses all RLS
```

Every branch of `buildPayload` then queries **unscoped by user**:

| Branch | Line | Reads |
|---|---|---|
| `morning_digest` | `:33` | **all** users' `tasks` where `top3` |
| `morning_digest` | `:34` | **all** users' `slipping` (the view is `security_invoker`, but service-role bypasses it) |
| `evening_nudge` | `:45-49` | **all** users' `routines` + `routine_completions` |
| `task_reminder` | `:60-66` | **all** users' due reminders |
| `overdue` | `:85-88` | **all** users' overdue tasks |

Then the fan-out — one payload, every subscription in the table:

```ts
const { data: subs } = await supabase.from('push_subscriptions').select('*')   // :114  no user filter
for (const sub of subs ?? []) { ... await subscriber.pushTextMessage(JSON.stringify(payload), {}) }
```

**Exploit path.** Anyone with the public anon key `POST`s `{"kind":"morning_digest"}` → user A's Top-3 task titles are pushed to user B's phone. Cross-tenant content disclosure, unauthenticated.

**Also a write primitive.** `task_reminder` (`:69`) does `update({reminder_sent: true})` across all users and inserts `activity_log` rows. Anyone can silently kill every user's reminders and inject log entries.

**Fix.** Require a real user JWT, resolve `user.id` from it, scope every query and the `push_subscriptions` fetch with `.eq('user_id', user.id)`. Keep a separate branch for the pg_cron caller, which authenticates with the service-role key it already pulls from Vault (`0006_notify_cron.sql:17`).

**Behaviour change:** unauthenticated calls start returning 401. The only client call site (`features/notifications/api.ts:90`, `{kind:'test'}`) sends a real user token, so no legitimate path breaks. **The cron path needs care** — it must keep working.

---

### S2 · Migrations 0030–0034 are written but never pushed — **HIGH** (conf. 0.9)

**Where:** `supabase/migrations/0034_revoke_cron_function_grants.sql:18-19`; blocked item recorded at `design-integration/FIX-PLAN.md:15` (K-c)

Postgres grants `EXECUTE` to `PUBLIC` on new functions by default, and PostgREST exposes every executable function as an RPC. `0034` fixes this:

```sql
revoke execute on function do_resurface() from public, anon, authenticated;
revoke execute on function reload_retainers() from public, anon, authenticated;
alter function reload_retainers() set search_path = public;
```

**It has not been applied.** Until it is, **any signed-in account can `POST /rest/v1/rpc/do_resurface`** and run a `SECURITY DEFINER` function that loops over every user's rows — cross-tenant writes with one HTTP call. `0034`'s own comment describes exactly this.

`reload_retainers()` also shipped **without a pinned `search_path`** (`0020_projects_perennials.sql:72` is a bare `$$ language plpgsql security definer;`). `0034` retro-fixes it — also unapplied.

**Fix.** `supabase login && supabase db push`. **[KAI] only** — needs his credentials. Highest value action in the audit and the code is already written.

> ⚠️ **Migration-ordering hazard for later:** `0020:40` is `create or replace`, which resets function attributes. If `0020` is ever re-run after `0034`, the `search_path` pin is silently lost.

---

### S3 · `transcribe`, `parse-capture`, `chat` are an open Groq proxy on Kai's key — **HIGH** (conf. 0.9)

**Where:** `transcribe/index.ts:19`, `parse-capture/index.ts:113`, `chat/index.ts:38`

None of the three checks the caller. Each forwards to `api.groq.com` with `GROQ_API_KEY`:

- `transcribe` — takes any `audio` file ≤20MB → Whisper. Free speech-to-text.
- `parse-capture` — takes `raw_text` ≤4000 chars → Llama-70B. Free LLM.
- `chat` — takes a **fully attacker-controlled `messages` array** (`:38`, spread into the Groq call at `:58`, including arbitrary `role` values). Free streaming LLM.

`chat` builds its Supabase client from the forwarded `Authorization` header, so *retrieval* is correctly RLS-scoped and leaks no data — but the **Groq call happens regardless of whether that header identifies a real user**.

**Impact.** Under the project's hard `$0` constraint, an exhausted Groq free-tier quota means capture, voice, and chat are dead for Kai. `V1-FEATURES.md:137` already lists "Groq edge functions rate-limited" as an unbuilt safety task.

**Fix.** Reject any request whose JWT carries no `sub` claim (i.e. require an authenticated user, not merely a valid project key). ~4 lines at the top of each handler.

---

### S4 · `do_resurface()` selects candidates across all tenants — **MEDIUM** (conf. 0.9)

**Where:** `supabase/migrations/0008_search.sql:168`, `:191-192`, `:195-197`, `:200-201`

```sql
select id into v_user_id from auth.users order by created_at limit 1;   -- :168  hardcodes the OLDEST user
...
select 'task'::text as entity_type, id as entity_id, created_at from tasks where created_at < now() - interval '3 days'
union all
select 'inbox_item', id, created_at from inbox_items where created_at < now() - interval '3 days'
```

The candidate pool has **no `user_id` predicate** and runs `SECURITY DEFINER`, so RLS does not apply. The two `resurfaced_log` de-dup checks (`:191-192`, `:200-201`) are likewise unscoped. The pick is then inserted under `v_user_id` (`:208-209`).

**Two real effects:**
1. The nightly cron can land **another user's `entity_id`** in your `resurfaced_log`.
2. **Every user except the oldest account never gets a resurface at all** — `limit 1` on `auth.users` means the feature is silently dead for everyone else.

**Blast radius — checked, and smaller than it first appears.** I traced the render path (`features/resurfacing/api.ts:69` reads `resurfaced_log` under the caller's RLS, then resolves the entity from the already-RLS-scoped `tasks`/`inbox_items` cache). A foreign `entity_id` **does not resolve**, so foreign *content* never reaches the UI — the card just shows nothing. So this is a **correctness/availability bug with a minor info edge** (a foreign UUID in your log table), **not a content breach.**

**Fix.** Add `where user_id = v_user_id` to both `raw` subselects and the two existence checks; loop over users rather than `limit 1`. New migration `0035`.

> ⚠️ **The `0034` revoke does NOT fix this.** The revoke closes the RPC path; this leak is in the **cron path** (`0009_search_cron.sql:19`, `30 3 * * *`), which runs regardless.

**This touches resurfacing selection logic — business logic. Do not apply without Kai's ruling.**

---

### S5 · `embed` is unauthenticated and service-role — **MEDIUM** (conf. 0.85)

**Where:** `supabase/functions/embed/index.ts:30`

`{"backfill": true}` triggers `enqueueMissing()` over **all** users' `tasks` and `inbox_items` (`:13`, `select('*').is('embedding', null)`, no user filter) and re-embeds. Returns no user data, so it is not a read breach — but it is an unauthenticated trigger for an expensive cross-tenant write job.

**Fix.** It is only ever called by pg_cron (`0009_search_cron.sql:4`). Require the service-role key explicitly, or drop the public HTTP handler.

---

### S6 · `search_hybrid` is safe only because it is `SECURITY INVOKER` — **LOW / defence-in-depth** (conf. 0.85)

**Where:** `0031_search_expand.sql:24` (also `0008_search.sql:85`, `0026_search_threshold.sql:8`)

All three definitions are `security invoker`, and the body has **no `user_id` predicate anywhere** — its only `where` clauses are FTS/vector match plus `deleted_at is null`. Isolation is 100% inherited from RLS on the six underlying tables, and both callers (`search/index.ts:15-17`, `chat/index.ts:33-35`) correctly forward the user's JWT via an anon-key client.

**Correct today.** The risk is future: the RRF CTEs are the obvious slow path, and someone "optimising" this to `SECURITY DEFINER` turns it into a six-table cross-tenant dump in a single RPC — silently, with no other code change.

**Fix.** Add a redundant `and user_id = auth.uid()` per branch. It is already the RLS predicate, so the planner folds it — zero query cost, and the function becomes safe under either security mode.

---

### S7 · Sign-out clears the query cache but not the outbox — **MEDIUM** (conf. 0.9)

**Where:** `features/auth/AuthProvider.tsx:30-33` vs `lib/outbox.ts:7,10`

```ts
if (event === 'SIGNED_OUT') {
  queryClient.clear()
  void del('kais-flow-query-cache')     // ← only this key
}
```

`kf-outbox` (`outbox.ts:7`) and `kf-outbox-dead` (`outbox.ts:10`) survive sign-out. Dead-lettered rows are retained **by design** (`outbox.ts:114`), so on a shared device the previous account's full pending and permanently-rejected row payloads stay readable in IndexedDB.

The main leak here was already found and fixed (the comment at `:26-29` shows the reasoning) — **this is the same bug's missed sibling.**

**Fix.** Add `void del('kf-outbox'); void del('kf-outbox-dead')` to the existing handler. `outbox.test.ts` covers this module.

Related, same handler: `kf.lastEmail` (`SignInPage.tsx:56`) also survives sign-out and is displayed on the Settings profile card (`SettingsPage.tsx:576`).

---

### S8 · Whole query cache persisted to IndexedDB unfiltered — **LOW–MED** (conf. 0.85) · **NEEDS KAI'S RULING**

**Where:** `lib/queryClient.ts:16-23`, `gcTime` 24h at `:9`

The persister has **no `dehydrateOptions` filter**, so every query key is written to disk — including `journal_entries`, `people`, `interactions`, `notes`, `quotes`, `commentary`, and the full `activity_log`. Journal and relationship content sits unencrypted at rest in the browser for 24 hours.

`push_subscriptions` is persisted too, carrying the push `keys` object and a `device_label` set from `navigator.userAgent.slice(0,60)` (`features/notifications/api.ts:68-74`).

**This is a deliberate offline-first trade-off, not a bug.** But CLAUDE.md's privacy rule makes it worth an explicit decision rather than a default.

**Options.** (a) Add `dehydrateOptions` excluding the personal-content keys — costs offline access to journal/people. (b) Accept it and record the decision here. **Kai's call. Not to be changed unilaterally.**

---

### S9 · `Access-Control-Allow-Origin: '*'` on all six functions — **LOW** (conf. 0.8)

**Where:** `_shared/retrieval.ts:7`, plus inline copies in `transcribe/index.ts:6`, `parse-capture/index.ts:7`, `notify/index.ts:11`

Not CSRF — Supabase authenticates with the `Authorization` header, not cookies, so a cross-origin request carries no ambient credential. It does mean any website can drive these functions from a visitor's browser using the public anon key. **Secondary to S1/S3**; once those are auth-gated this is mostly moot. Tighten to the Pages origin as cleanup.

---

### S10 · Auth policy is permissive **in `config.toml`** — **INFO** (conf. 0.5) · **NEEDS KAI TO VERIFY**

**Where:** `supabase/config.toml:176-226`

```toml
enable_signup = true            # :176
minimum_password_length = 6     # :182
password_requirements = ""      # :185
enable_confirmations = false    # :226  (email confirmation off)
```

No password reset flow exists anywhere (already tracked as J-11, `FIX-PLAN.md:58`).

> ⚠️ **`config.toml` is the LOCAL dev config.** Hosted auth settings live in the Supabase dashboard and only sync via `supabase config push`. **I could not verify production from here — this is flagged, not asserted.**

**Action.** Before public launch, check the dashboard: password length ≥8, email confirmation ON.

---

## 1.9 · The one confirm Kai should run

Verifies S1/S3 in ~30 seconds. Replace `<ANON_KEY>` with the value from `app/.env`. **A 200 response with a JSON body confirms the finding; 401 means the platform is blocking it and S1/S3 drop in severity.**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"kind":"test"}'
```

If this returns `200`, an unauthenticated caller just made your phone buzz.

---

## 2. Bugs found in the same pass

### B1 · Conditional hook → React crash on cold-loading a project page — **HIGH** · verified

**Where:** `features/projects/ProjectDetailPage.tsx:273` (early return) vs `:336` (the hook)

```ts
if (!project && !area) {                       // :273
  return (<div …>Entity not found.</div>)
}
…
const [milestoneBloom, setMilestoneBloom] = useState(0)   // :336  ← after the early return
```

**Verified reachable.** `useProjects()` defaults to `[]` while loading (`:86`) and there is **no `isLoading` guard anywhere** in the component. So on a cold load:

1. First render — `projects` is `[]` → `project`/`area` undefined → early return → hooks after `:273` never run.
2. Query resolves → re-render → project found → `useState` at `:336` now runs.
3. React: **"Rendered more hooks than during the previous render."** Crash.

Triggered by hard-refreshing `/projects/:id` or deep-linking from search.

**oxlint errors on it:** `react-hooks(rules-of-hooks): React Hook "useState" is called conditionally`.

> ⚠️ **This is a REGRESSION.** `ROADMAP.md`'s 2026-07-19 entry lists "ProjectDetail conditional-hooks crash fix" as shipped in wave 1, and the file's own comment at `:184` says *"Hoisted above the project/area early returns (E7 — hooks must not sit inside a branch)"*. A second instance was introduced after that fix.

**Fix.** Move `:336` up to join the other hoisted `useState` calls at ~`:186`. One line.

---

### B2 · Day-bucketing runs in browser-local time while everything beside it renders in Cairo — **MEDIUM** · verified

**Where:** `features/inbox/inboxDisplay.ts:14` — with the **correct helper sitting 20 lines below it at `:34`**

```ts
// file header, :2 — "TZ Africa/Cairo per house convention (store UTC, render Cairo)."
const TZ = 'Africa/Cairo'                                              // :4

export function isToday(iso: string): boolean {                        // :14  ← browser-local!
  return new Date(iso).toDateString() === new Date().toDateString()
}

export function formatCaptured(iso: string) { … timeZone: TZ }         // :18  ← correct
function cairoDay(d: Date): string {                                   // :34  ← correct, and unused by isToday
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
```

`toDateString()` is **device-local**, not Cairo. The same broken body is copied to `TodayPage.tsx:70` and `TasksPage.tsx:38`. `localDateKey` (`features/routines/streaks.ts:4`) has the same flaw — and that is what `grouping.ts` buckets **every smart list** on.

**Effect.** Display strings render in Cairo; day bucketing runs in device-local. On a laptop set to any non-Cairo timezone, "Today" and "Overdue" are off by a day near midnight while the timestamps beside them disagree. Also: `lib/settings.ts:12` stores a user `timezone` that none of this code reads.

**Fix.** Export the existing `cairoDay()` and have the three `isToday` copies + `localDateKey` call it.

> **Business logic — needs Kai's go-ahead.** Correcting this changes *which tasks appear* in Today and Overdue.

---

## 3. Dependencies

`npm audit`: **7 high, 0 critical.** The count is misleading — **every advisory is in a devDependency and none reaches the browser bundle.** Each path verified with `npm ls`:

| Package | Dependency path | Ships? | Real risk |
|---|---|---|---|
| `sharp` <0.35.0 (libvips CVEs) | `wrangler → miniflare → sharp` | ❌ dev | none — build tooling |
| `postcss` ≤8.5.17 | `vite → postcss` | ❌ dev | none — build-time |
| `fast-uri` 3.0.0–3.1.3 | `vite-plugin-pwa → workbox-build → ajv` | ❌ dev | none |
| `brace-expansion` | `vite-plugin-pwa → workbox-build → …` | ❌ dev | DoS class, build-time |
| `react-router` 7.12.0–8.2.0 | **direct dependency** | ✅ ships | Advisory is **RSC-mode CSRF**; this is a SPA with no RSC → **not exploitable here**. Fix is a free minor bump. |

`npm audit fix` clears all seven with no major bump.

**Safe patch/minor bumps:** `@supabase/supabase-js` 2.110.0→2.111.0 · `react`/`react-dom` 19.2.7→19.2.8 · `react-router` 8.1.0→**8.3.0** (clears the advisory) · `vite` 8.1.3→8.2.0 · `chrono-node` 2.9.1→2.10.1 · `tailwindcss` + `@tailwindcss/vite` 4.3.2→4.3.3 · all four `@tanstack/*` 5.101.2→5.101.4 · `idb-keyval` 6.2.6→6.3.0 · `vitest` 4.1.9→4.1.10 · `wrangler` 4.107.0→4.118.0 · `oxlint` 1.72→1.76 · `@vitejs/plugin-react` 6.0.3→6.0.5 · `@types/*`.

**Major upgrades — FLAGGED, NOT APPLIED:**

| Package | Jump | Migration note |
|---|---|---|
| `@fullcalendar/*` | 6.1.21 → **7.0.2** | v7 changed plugin registration; touches `CalendarGrid`. Calendar is the most bug-prone surface — **not before v1.0.** |
| `typescript` | 6.0.3 → **7.0.2** | New compiler; needs a full `tsc -b` + lint pass. Separate session. |
| `@types/node` | 24 → **26** | Should track the Node version actually used to build. Low value. |

**Remove:** `date-fns@^4.4.0` (`package.json:29`) — **zero imports anywhere in `app/src`.** Verified dead.

---

## 4. Duplicated logic

> **A hypothesis this audit killed:** the `features/*/api.ts` boilerplate is **not** a maintenance problem. Those files don't use `useMutation` — mutations are plain functions over `writeRow` + `logActivity`, and the cross-cutting error toast already lives in exactly one place (`lib/outbox.ts:123`) covering all **137** `writeRow` call sites. Adding another cross-cutting concern costs 1 file, 1 line. **Leave it alone.** The 33 `useQuery` blocks each differ in table, `.order()` and filter; wrapping them buys ~150 lines and costs a layer of indirection over TanStack Query.

### D1 · Bulk-select + bulk-actions block, copy-pasted 4× — **and already drifted**

| File | Lines |
|---|---|
| `features/tasks/TasksPage.tsx:474-535` | ~62 |
| `features/today/TodayPage.tsx:180-240` | ~60 |
| `features/projects/ProjectDetailPage.tsx:186-245` | ~60 |
| `features/calendar/PlanningBoard.tsx:226-280` | ~55 |

Each declares the same five state vars (`selected`, `bulkSnoozePos`, `bulkSchedulePos`, `bulkProjectPos`, `confirm`), the same `toggleSelected`/`clearSelection`, and the same six handlers.

> 🔴 **The drift is dangerous.** `ProjectDetailPage` wraps bulk actions in `toastUndo`; the other three use a fire-and-forget toast. **Bulk delete has no undo on 3 of your 4 surfaces.**

**Fix.** One hook beside `components/useListKeys.ts` returning `{selected, toggleSelected, clearSelection, bulkActions, overlays}`. Take `ProjectDetailPage`'s undo version as the winner. ~240 lines → ~70.
**Behaviour change:** bulk delete gains undo on three surfaces. **Needs Kai's OK.**

### D2 · `useIsMobile` — 14 definitions of an 11-line hook

Verified: **14 definitions**, **49 occurrences of the `767` breakpoint**.

```
components/BottomSheet.tsx:15          (exported — the canonical one)
features/rituals/RitualChrome.tsx:9    (also exported)
features/activity/ActivityPage.tsx:12      features/people/PeoplePage.tsx:11
features/herbarium/HerbariumPage.tsx:14    features/projects/ProjectsPage.tsx:22 ← localUseIsMobile
features/inbox/InboxPage.tsx:49            features/routines/RoutinesPage.tsx:24
features/journal/JournalPage.tsx:14        features/settings/SettingsPage.tsx:22
features/library/LibraryPage.tsx:22        features/today/TodayPage.tsx:82
features/onboarding/OnboardingPage.tsx:157 features/trash/TrashPage.tsx:11
```

It is **already exported** from `BottomSheet.tsx:15` and already imported by `ScheduleMenu`/`SnoozeMenu`. Twelve files re-typed a hook sitting one import away. Changing the mobile breakpoint is a 14-file edit.

**Fix.** Delete 13 copies, add 13 imports. Zero new concepts. **Highest lines-deleted-to-risk ratio in the codebase.** Also silences 2 of the 3 oxlint errors for free (they're name-based false alarms on `localUseIsMobile`).

### D3 · Weighted-milestone % implemented 3×

`features/today/TodayPage.tsx:58-69` · `features/projects/ProjectsPage.tsx:100-119` · `features/projects/ProjectDetailPage.tsx:497-513`

Same rule everywhere: a milestone counts complete if flagged, or if it has linked tasks and all are done; then `round(completedWeight / totalWeight * 100)`. **This number drives the wisteria growth stage on three surfaces** — change the rule once and two surfaces show a different plant for the same project. The `TodayPage` copy's own comment says it must *"show the project's REAL stage"* — the author knew and copied anyway.

**Fix.** Move `TodayPage`'s 12-line version to `features/projects/api.ts`, call from all three. `ProjectDetailPage` also needs per-milestone `resolvedCompleted`, so return `{pct, milestones}`.

### D4 · Growth-stage thresholds — the file says these are defects

`lib/growthStages.ts:1-4` states: *"Wave agents: import from here; inline threshold copies in feature folders are defects to delete on touch."* There are three:

- **`cherryStage`** (`growthStages.ts:23`) — exported, **unit-tested**, **imported by nothing**. Re-implemented at `TodayPage.tsx:75` and `TasksPage.tsx:47`. So the tests guard a dead function while both live copies are untested.
- **`fernByFraction`** (`growthStages.ts:53`) — zero references. `LibraryPage.tsx:34` re-implements the same 25/50/75 buckets as `getFernImage`.

**Fix.** Delete the three local copies, import the canonical ones. `LibraryPage` needs `fernByFraction(pct / 100)`.

### D5 · `ParseResultSchema` duplicated across the trust boundary — **leave it**

`features/capture/parseSchema.ts:4-15` ↔ `supabase/functions/parse-capture/index.ts:25-36`, 12 identical lines with a *"keep in sync"* comment. If the edge function gains a field, the client silently rejects every parse (it's `z.object`, not passthrough) and capture dies with no server-side signal.

**Recommendation: leave the copy**, add one test importing both. It's 12 lines; machinery costs more than it saves.

---

## 5. Refactors & dead code

### Dead code — verified unreferenced

| What | Where | Lines |
|---|---|---|
| `renameDomain`, `recolorDomain`, `reorderDomains`, `mergeDomain` | `features/domains/api.ts:38-69` | ~32 |
| `renameArea`, `recolorArea`, `reorderAreas`, `mergeArea` | `features/areas/api.ts:40-66` | ~27 |
| `updateNote` / `updateQuote` | `features/library/api.ts:85`, `:131` | small |
| `dismissResurfaced` | `features/resurfacing/api.ts:105` | small |
| `cherryStage` / `fernByFraction` | `lib/growthStages.ts:23`, `:53` | see D4 |
| `Stub.tsx` — the only module in `src/` nobody imports | `components/Stub.tsx` | whole file |
| **`date-fns`** dependency | `package.json:29` | a whole package |

The domains/areas case is notable: a **full management surface** (rename/recolor/reorder/merge) was built for both entities and **no UI ever called any of it**.

### oxlint — 3 errors, 29 warnings

- **3 errors**, all `rules-of-hooks`. `ProjectDetailPage.tsx:336` is **B1**, a real bug. The other two (`ProjectsPage.tsx:23,24`) are false alarms caused purely by the name `localUseIsMobile` — **fixed for free by D2**.
- 8 `no-unused-expressions` — 3 are the ternary set-toggle (`TasksPage:479`, `InboxPage:157`, `PlanningBoard:231`), which disappears with D1. The 5 in `TaskRow.tsx`/`TaskEditorPage.tsx` are `cond ? a() : b()` as a statement — works, just noisy.
- 14 `only-export-components` + 6 `exhaustive-deps` — noise. **One worth a glance:** `ActivityPage.tsx:286` omits `resolveEntryInfo` from a `useMemo` dep list while listing three deps it doesn't use.

### Longest functions — only two worth acting on

| File | Lines | Verdict |
|---|---|---|
| `features/focus/FocusPage.tsx:66` | 1223 | **Leave.** One page, one job (a timer), lots of chrome. |
| `features/library/LibraryPage.tsx:41` | 1110 | **Split** — three separate apps (quotes/notes/books), 3 near-identical filter memos (`:109-131`), 4 create-form state clusters (`:60-99`). Mechanical cut into three tab components. |
| `features/projects/ProjectDetailPage.tsx:72` | 1001 | **Split** — the `project` and `area` branches share almost nothing but the task list. **That seam is where B1 came from.** |
| `features/capture/QuickCapturePage.tsx:8` | 885 | Leave for now |
| `features/journal/JournalPage.tsx:42` | 823 | Leave for now |

### Confusing names

Exactly one qualifies: **`isToday`** (see B2) — in a file whose header declares Cairo convention, which defines `TZ` on `:4` and a correct `cairoDay()` on `:34`, and uses neither. Everything else (`breatheOut`, `animateRowRemoval`, `filterByScope`, `claimDayComplete`) reads honestly. `localUseIsMobile` is ugly but not misleading, and it dies with D2.

### Reusable pieces worth extracting

Only **D2** and **D1** — and both *reuse something that already exists* rather than inventing an abstraction. Nothing else: `components/kit.tsx`, `lib/outbox.ts` and `features/tasks/grouping.ts` are already the shared layer.

---

## 6. Health checks

| ID | Finding | Where | Note |
|---|---|---|---|
| **H1** | **`select('*')` drags the `embedding vector(384)` column to the client** — 384 floats/row as JSON, on every fetch, for 655 imported tasks. The client `Task` type doesn't even declare it. | `features/tasks/api.ts:17`, `features/inbox/api.ts:12`; column at `0008_search.sql:9,15` | Bloats every fetch and is re-persisted into IndexedDB. **⭐ Also a live lead on the open P0:** `outbox.ts:186` strips `search_tsv` before writes but **not `embedding`**, so the read-modify-write pattern round-trips the vector back to Postgres on every task edit — **exactly the J-16 hypothesis at `FIX-PLAN.md:14`.** Fix: explicit `.select()` column list + add `embedding` to the outbox strip. |
| **H2** | **No pagination anywhere** — ~25 list queries use `.select('*')` with no `.limit()`/`.range()`. Only `activity_log` (`activity/api.ts:13`) and notifications (`notifications/api.ts:17`) cap. | `features/*/api.ts` | PostgREST's `max_rows = 1000` (`config.toml:18`) makes these **silently truncate** rather than error. At 655 tasks you're under it — but it fails quietly when you cross it. **Deliberate ruling needed, not a blind fix.** Recommendation: leave for v1.0. |
| **H3** | N+1 in `notify`'s reminder loop — a separate `select user_id` per task, inside a loop that already has the row. | `notify/index.ts:72` | Disappears naturally when S1 is fixed (`user_id` will come from the JWT). |
| **H4** | 343MB stray agent worktree. | `.claude/worktrees/` (excluded via `.git/info/exclude:18`) | Not tracked, not a leak — just disk. Delete when idle. |

**Error handling around network/IO is good** and was checked deliberately: the outbox serialises IndexedDB access through a promise chain to prevent a documented race (`outbox.ts:28-46`), dead-letters permanently-rejected writes instead of silently dropping them (`:114`), capture falls through to the Inbox when the AI call fails (`capture/api.ts:107`), and the weather fetch fails soft by design (`lib/seasons.ts:70`).

---

## 7. Verified clean — do not re-audit these

Recorded so a future session doesn't spend a pass re-deriving them.

| Area | Verdict |
|---|---|
| **Hardcoded secrets** | ✅ **None** — not in `app/src`, `vite.config.ts`, `wrangler.jsonc`, `index.html`, or any of the 34 migrations. Full **git-history** scan for `gsk_*` / `sk-*` / service-role JWTs: **zero hits**. `app/.env` + `supabase/.env` untracked and gitignored. The only client-side `eyJ` is the anon key (correct) and a `sha512` integrity hash in the lockfile. |
| **Secrets in SQL** | ✅ All seven `net.http_post` cron calls pull the service-role key from **Supabase Vault** at execution time (`0006_notify_cron.sql:17` et al.), never embedded. Zero `eyJ` in any `.sql`. |
| **XSS** | ✅ **Zero** occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `eval(`, `new Function(`, or string-arg `setTimeout` in the entire client. Both classic traps are done right: streamed LLM output renders as a JSX text node (`ChatPanel.tsx:124`); search highlighting splits into JSX children rather than string-replacing HTML (`SearchPage.tsx:18-30`). |
| **SQL injection** | ✅ All writes go through PostgREST/`writeRow`. No dynamic SQL. |
| **RLS** | ✅ All **22** tables have RLS enabled + a `user_id = auth.uid()` policy. No `using (true)`, no missing policy, **no `GRANT` statements at all** in any migration. |
| **Views** | ✅ `slipping` sets `with (security_invoker = true)` in **both** definitions (`0005_routines.sql:49`, `0013_slipping_areas.sql:3`) — the Postgres 15+ default-definer footgun is correctly avoided. |
| **Route guarding** | ✅ `RequireAuth` returns `null` while loading and wraps all 25 authenticated routes (`App.tsx:47-53`, `:86-93`). No page renders before the session resolves. |
| **Logging** | ✅ Three `console.error` calls total, all on caught exception objects. No tokens, sessions, or PII logged. No secrets in URLs. |
| **Sign-out cache clear** | ✅ Correct for the query cache (`AuthProvider.tsx:30-33`) — see **S7** for the missed outbox sibling. |
| **Dead feature folders** | ✅ None. Every `features/` folder is reachable; `PlanningBoard` is nav-less but routed deliberately (`App.tsx:188-190`). |

**Minor SQL notes, non-exploitable:** `areas` policy (`0010_areas.sql:18`) omits `with check` — Postgres defaults it to the `using` expression, so writes are still guarded; align for consistency so nobody later "fixes" the `using` clause unaware it's also the write check. Definer functions pin `search_path = public` rather than `= ''`; stock Supabase denies `CREATE` on `public` to `authenticated`/`anon`, so exploitability is low. No policy carries a `TO` clause (Supabase's linter flags this as `rls_policy_applies_to_public_role`) — safe, since `auth.uid()` is `NULL` for `anon`.

---

## 8. Needs Kai's decision — nothing below gets touched without a ruling

| # | Question | Recommendation |
|---|---|---|
| K-1 | **S2** — run `supabase login && supabase db push`? | **Yes, first.** Highest value, code already written. |
| K-2 | **S8** — filter journal/people out of the IndexedDB persister, or accept it for offline access? | Genuine trade-off. Your privacy rule vs. offline journal. |
| K-3 | **S10** — check the hosted dashboard's auth settings (password length, email confirmation)? | Before public launch. I can't see production. |
| K-4 | **B2** — correct day-bucketing to Cairo? Changes *which tasks appear* in Today/Overdue. | Yes, but it's business logic — your call. |
| K-5 | **S4** — `do_resurface()` user-scoping. Changes resurfacing selection. | Yes; I'll show SQL before applying. |
| K-6 | **D1** — consolidating bulk actions gives bulk delete undo on three surfaces. | Yes — the current asymmetry is the bug. |
| K-7 | **H2** — pagination now, or after v1.0? | **After.** `max_rows` covers you at current scale. |
| K-8 | **The Today badge drift** (below) | Product decision. |

### The Today badge counts a different set than the Today page renders

- `components/AppLayout.tsx:119` → `filterByList(tasks, 'today').length` = *top-3 OR scheduled today OR due ≤ today* (`grouping.ts:57`)
- `features/today/TodayPage.tsx:157` → every open non-someday task, capped at 50 (`ALL_OPEN_CAP`, `:53`)

`grouping.ts:39` documents the intended invariant in its own comment: *"a task counted here is a task the list will render, no drift."* **The drift is on the one page called Today.** Either Today renders `filterByList(tasks, 'today')`, or the badge stops claiming to count what Today shows. **Not a refactor — a product decision.**

---

## 9. Proposed fix waves (PASS 2)

Nothing here is started. Ordering is by value, not by audit section.

### Group A — security + the crash
1. **S2** — `supabase db push`. **[KAI] only.**
2. **B1** — move `useState` above the early return. One line; no behaviour change except "stops crashing".
3. **S1 + S3 + S5** — auth-gate the five edge functions. *Deliberate behaviour change: unauthenticated calls start returning 401.* Every client call site already sends a real user token. **No tests cover this — write one integration check first.** The cron→`notify` path must keep working.
4. **S4** — `0035` user-scoping for `do_resurface()`. **Show SQL, wait for K-5.**

### Group B — dependencies
5. `npm audit fix` + the patch/minor list. Drop `date-fns`. **Build + 202 tests after.** Majors stay flagged only.

### Group C — safe cleanups (no behaviour change; before/after for each)
6. **D2** (13 deletions), **S7** (outbox keys on sign-out), **H1** (`embedding` in the outbox strip + explicit `.select()` — also the J-16 lead), dead-code deletions, **D4** (growth-stage imports).
7. **D1** + **D3** — consolidate onto one implementation. **Requires picking a winner → K-6.**

**Recommended path to a safe v1.0: A then B. Hold C until after the next live re-judge.**

> ⚠️ **Standing caveat on all of PASS 2.** The 202 tests are **pure-function unit tests only** — date helpers, recurrence, grouping, streaks, swipe math, import adapters, the outbox helper. **Zero tests touch RLS, SQL, edge functions, auth, or component integration.** No fix in Group A can be called "functionally equivalent" on the strength of a green test run. Group C is genuinely low-risk; Group A is not, and should be verified live.

---

## Related

- `docs/ROADMAP.md` — build state; changelog entry added 2026-08-01 pointing here.
- `design-integration/FIX-PLAN.md` — the 28 judging findings + 7 fix waves. **K-c there is the same blocker as S2 here.** H1 is a lead on its J-16.
- `docs/KAI-AUDIT-2026-07-18.md`, `KAI-AUDIT-2026-07-20.md` — the earlier audit registers this one follows in shape.
- Vault log: `AI-Memory/2026-08-01-kais-flow-security-audit.md`.
