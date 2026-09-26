# Kai's Flow — full handoff for the next session (local, bypass mode)

> Written 2026-09-26 ~19:00 UTC by the cloud conductor session ("bohr", branch `claude/inspiring-bohr-e2vhqo`).
> Kai asked: "write a handoff with everything, don't skip a single detail… so that I can run another local session in bypass mode, include the progress, the loop, past prompts, my preferences, include everything."
>
> This file is the entry point. The details live in the append-only journal `docs/log/` (index: `docs/log/INDEX.md`); this file tells you what exists, where it is, what state production is in, and what to do next.
>
> **Release result:** see §3.1. It was filled in after the v1.0.0 run finished; if it says "in flight", read the newest `docs/log/*release*` entry.

---

## 0 · TL;DR

- **Goal:** Kai's Flow v1.0: "very strongly polished and publish-ready for myself and other users". Deadline: "asap".
- **What shipped today, in three layers** (details in §2):
  - **release-1:** security fixes, data-loss fixes, polish.
  - **release-2:** "the daily loop" (Day card, actionable Up next, nav in loop order, evening seeds → morning Top 3).
  - **M1:** the Android APK and Windows installer, built on GitHub Actions.
  - All three are merged into one release branch, **`claude/release-v1`**, shipped as **v1.0.0** through a new GitHub Actions pipeline (`.github/workflows/release.yml`).
- **Production incident today:**
  - The first v1.0.0 run applied migrations **0030–0033**, then stopped at **0034**.
  - Cause: production's copy of migration 0020 is older than the file in git; it never created `reload_retainers()`.
  - Fixed forward with a guarded 0034 (commit 312bb13) and re-run. See §3.
- **Kai's standing instructions:**
  - "keep looping";
  - "don't ask me questions, you make the decision, choose the best UX choice possible";
  - "I allow you to deploy";
  - the mobile version is in progress (M1).
- **First thing a new session does:** read §3 (production state) and §8 (next steps). Then run THE LOOP (§5) starting with SYNC.

---

## 1 · How to start the local session (Kai's Windows laptop)

### 1.1 Starting Claude Code in bypass mode
- **Local CLI:** `claude --dangerously-skip-permissions`, or `claude --permission-mode bypassPermissions`. Inside a session, **Shift+Tab** cycles the modes.
- **Cloud sessions (claude.ai/code)** don't offer "Bypass permissions". They only have *Accept edits*, *Plan* and *Auto*. That's why this cloud session couldn't deploy until Kai moved it off **Auto**: the Auto classifier kept refusing production actions even after Kai said "I allow you to deploy".
- Run it from the repo root: `cd D:\Coding\kais-flow`.

### 1.2 ⚠️ The laptop clone has uncommitted work. Park it first, delete nothing.
On 2026-09-26, `git checkout claude/release-1` on the laptop failed with:
- **Local modifications:** `docs/DATA_MODEL.md`, `docs/ROADMAP.md`, and the six function files `supabase/functions/{chat,embed,notify,parse-capture,search,transcribe}/index.ts`.
- **Untracked files:** `README.md`, `docs/images/readme/*.webp`, `supabase/functions/_shared/auth.ts`.

Those untracked files also exist on master and in the release branches. Someone copied them onto the laptop by hand. **Kai's rule: never auto-delete files.** Park them on a local branch:

```powershell
cd D:\Coding\kais-flow
git status -sb
git switch -c laptop-wip-2026-09-26
git add docs/DATA_MODEL.md docs/ROADMAP.md supabase/functions README.md docs/images/readme
git commit -m "laptop changes parked before v1.0.0"
git push -u origin laptop-wip-2026-09-26      # optional: lets a session diff it against release-v1
git fetch origin
git switch master
git pull                                       # after v1.0.0, master = the released tree
```

Then diff `laptop-wip-2026-09-26` against `origin/master`.
- If the laptop's function edits contain a real fix that isn't in the release, bring it forward as a new change.
- **Don't** redeploy functions from that branch. The released versions (FIX-0, SEC-2, SEC-3, FIX-5) are the reviewed ones.

### 1.3 What exists only locally
- `supabase/.env` holds `SUPABASE_ACCESS_TOKEN` (gitignored; see `AGENTS.md`).
  - Kai also created a new token and stored it as the GitHub repository secret **`SUPABASE_ACCESS_TOKEN`**. That's what the release pipeline uses.
- **Docker is NOT installed on the laptop.** `supabase db dump` and the local Supabase stack need it. The release pipeline does the dump on GitHub instead.
- Workspace rules: `D:\Coding\CLAUDE.md` and `D:\Coding\.claude\skills\SKILL.md` (the design conventions skill; it applies when styling work starts).
- Notes vault (Obsidian) and the auto-memory dir `~/.claude/projects/<kais-flow>/memory/` exist only locally. The CONDUCTOR's Phase 0 says to read them.
- Git-ignored folders: `akiflow-dump.json`, `akiflow-screenshots/`, "Kai's Audit Frame by frame/", the design-system zip, `graphify-out/`.
- Local dev server:
  - `cd app && npm run dev` runs on port **5195** (`.claude/launch.json`). It's Kai's dev server; agents use **5199** or `vite preview` on **4174**.
  - It needs `app/.env.local` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

---

## 2 · What was built (progress)

### 2.1 Timeline of today (2026-09-26, UTC)

| Time | What happened |
|---|---|
| 04:00 | Phase 0 audit |
| 04:30 | Goal = ASAP |
| 04:50 | Local Supabase stack usable in the cloud |
| 05:00–08:34 | release-1 assembled from about 25 worker branches. Candidate READY at 08:34. |
| 11:43 | shell-fit merged → candidate `acd52a7` |
| 13:13 | Kai's screenshot + "are we done looping? … step back and decide the user productivity journey" → **DAILY-CYCLE decision** (release-2) |
| 13:40 | Both release-2 workers (Loop A/B) stopped on an account usage limit. The conductor finished them. |
| 17:11 | release-2 candidate READY (742 tests ×4 TZ, sweep 80/80, shell-fit 40/40) |
| 17:22 | M1 (Android/Windows) started, on Kai's July ruling |
| 17:29 | First APK green |
| 18:06 | Status-bar fix green |
| 18:24 | mobile-1 web gate green |
| 18:39 | Release pipeline + v1.0.0 |
| 18:43 | First run: migrations 0030–0033 applied, **0034 failed** |
| 18:52–18:56 | Read-only production diagnostic → guarded 0034 → second run |

### 2.2 release-1 (`claude/release-1` @ `acd52a7`): fixes, security, polish
It merges these branches (each has a handoff on its branch and a line in `docs/log/INDEX.md`):

| Branch | What it fixes |
|---|---|
| `claude/t2-cairo-shortcuts` | T-2/B2: Cairo-day schedule shortcuts |
| `claude/t3-build-stamp` | T-3: `/version.json` + a `<meta name="kf-build">` build stamp |
| `claude/j11-password-reset` | J-11: password reset + the reset page |
| `claude/fix2-calendar` | J-13/J-15 calendar: Cairo headers, overlap layout |
| `claude/fix6-visual-batch` | J-12/17/19/21/22/27 |
| `claude/p0-empty-user-id` | Empty `user_id` data loss + lost-write rescue |
| `claude/p0-activity-entity-id` | Non-uuid activity keys go to `payload.entity_key` |
| `claude/fix0-edge-auth` | Edge-function auth `_shared/auth.ts`, CORS allowlist `_shared/cors.ts` (already includes the Tauri origins) |
| `claude/sec2-hardening` | Daily AI allowance: `ai_usage` table, env `AI_DAILY_LIMIT_CHAT=150`, `PARSE=300`, `STT=60` |
| `claude/sec3-error-hygiene` | Stable error codes from the functions |
| `claude/p0b-offline` | Outbox entries uid-tagged; flush gated on the session |
| `claude/fix5-search` | Migration 0037 search rebalance; notify prune |
| `claude/polish-a` … `polish-g`, `polish-f1`/`f2a`/`f2b` | Polish waves |
| `claude/final-cleanup` | Onboarding fits the window; phone Settings controls are real |
| `claude/shell-fit` | Sidebar footer pinned/compact; zoom-corrected `--kf-vh`/`--kf-vw` |

- **Migrations 0030–0037:** settings per user; search expand; 30-day compost cron; many journal entries per day; revoke cron function grants; security scoping; AI quota + slipping owner filter; search rebalance.
- **Evidence:**
  - 659 tests ×4 TZ;
  - backend harness suites `supabase/tests/fix0-auth.sh` 79/79, `sec2.sh` 110/110, `notify-prune.sh` 12/12, `fix5-search.sh` 31/31;
  - route sweep 80/80.

### 2.3 release-2 "the daily loop" (`claude/release-2` @ `d6ae8a0`)
- **Spec:** `docs/DAILY-CYCLE.md`.
  - The loop: Capture (anytime) → Plan (morning ~5 min) → Do → Shut down (evening ~3 min) → Review (weekly).
- **Loop A** (`claude/loop-a`; handoff `docs/log/2026-09-26-1705-loop-a-handoff.md`):
  - **Up next rows act like tasks.** This is Kai's "I can't right click what is in the Up next section". Click opens, right-click gives a menu (task-backed: Start focus · Complete · Open details · Move to tomorrow · Unschedule; plain event: Open in calendar · Delete), ▶ focus, check with Undo.
  - **The Day card** (`features/today/DayCard.tsx`, pure `dayPhase.ts` + tests). It replaces the two ritual cards: **Plan your day · ~5 min** → **Now** → **Shut down the day · ~3 min** → **Day closed ✿** (with tomorrow's seeds).
  - **Now's item:** an event running or starting within 30 min; otherwise the first open Top 3 (with "then <time> · <event>"); otherwise the next event.
  - **Top 3 keeps finished picks,** struck through (`top3Today.ts`, read from the star log).
  - **Section order:** Day card → Top 3 → Up next → Routines. A quiet **"More for today"** fold (collapsed by default; localStorage `kf.today.more-open`) holds All open, and on the phone also Slipping and From a while ago.
  - Ritual links show ✓ once a ritual is finished.
- **Loop B** (`claude/loop-b`; handoff `docs/log/2026-09-26-1649-loop-b-handoff.md`):
  - **Sidebar Tend group** in loop order: Today · Inbox · Calendar · Tasks · Projects.
  - **Evening seeds → next morning's Top 3.** `ritual.seeded` / `ritual.unseeded` activity rows carry `for_date` = the next Cairo loop day, with a **04:00 rollover**. The morning Top-3 step pre-selects them; "Keep & continue" confirms.
  - **`ritual.finished` trace.** Payload `{ ritual, date, steps, entity_key }`. Readers: `useRitualsFinishedToday()`, `ritualFinishedToday(rows, ritual, now)`.
  - Pure logic lives in `features/rituals/loopDay.ts`.
- **No new tables.**
- **Evidence** (`docs/log/2026-09-26-1711-bohr-test-run-release2-candidate.md`):
  - 742 tests ×4 TZ;
  - sweep 80/80;
  - shell-fit 40/40;
  - a whole-day walkthrough (`docs/log/assets/loop-a/r2.mjs`) through Plan → morning ritual → Now → Done + Undo (read back over REST) → fold → Shut down → seeds → Day closed → still closed at 00:30. Console clean.

### 2.4 M1 — the mobile version (`claude/mobile-1` @ `82d568c`)
- **Why Tauri:** Kai's ruling of 2026-07-12 (`design-integration/PLAN.md`, *Platform target* + SHIP P2): real packages, not a browser tab. Start with web + Android APK, then Windows/macOS, then iOS later (needs a Mac + $99/yr).
- **Phase file:** `docs/phases/M1-android.md` (Notes has every step).
- **Decision log:** `docs/log/2026-09-26-1722-bohr-decision-m1-android.md`.

**The shell:** `app/src-tauri/`, Tauri **2.12**.
- `tauri.conf.json`:
  - identifier **`com.kaisflow.garden`** (never change it; Android ties updates to it);
  - `useHttpsScheme: true`, so the origin is **`https://tauri.localhost`** (already on the functions' CORS allowlist).
- Windows override `tauri.windows.conf.json`: productName `Kai’s Flow`, with a curly apostrophe. NSIS treats `'` as a quote.
- Other files: `Cargo.toml` + `Cargo.lock`, `src/lib.rs` (mobile entry point), `src/main.rs`, `capabilities/default.json` (`core:default` only), icons.
- **`src-tauri/android/MainActivity.kt`**, copied over Tauri's generated one in CI:
  - It pads the content by system bars + display cutout + IME. Tauri's template calls `enableEdgeToEdge()`, which made the WebView draw under the status bar.
  - It exposes a JS bridge `KaisFlowShell.setChrome(color, light)` so the bar strips match Day/Night.

**Web side:** `app/src/lib/platform.ts`, tested.
- `isNativeShell()`: no service worker in the shell (`main.tsx`).
- `syncShellChrome(theme)`, called from `lib/theme.ts` `apply()` and on load.
- `authLinkOrigin()`: emailed auth links from inside the app go to the public web app (`VITE_PUBLIC_APP_URL`). Otherwise reset links pointed at `https://tauri.localhost/reset`.

**Icon:** interim **four-leaf clover on paper** (`public/icon-192.png`, `icon-512.png`, also declared maskable; Tauri icons generated from a 1024 px version).
- It replaces the **blank navy placeholder** the web app shipped with.
- The plan named it: "interim clover four_leaf" until Kai's art.

**D2 lint fix:** `ProjectsPage` now uses the shared `useIsMobile`. **Lint errors: 2 → 0.** CI now enforces lint.

**CI builds:**
- **`.github/workflows/android.yml`:**
  - builds a universal arm64+x86_64 APK;
  - signs it with zipalign + apksigner, using a one-off key unless the secrets `ANDROID_KEYSTORE_B64` + `ANDROID_KEYSTORE_PASSWORD` exist;
  - patches the manifest to add `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`;
  - escapes the apostrophe in `strings.xml`;
  - runs an **emulator smoke test** (API 34): install, launch, screenshots, UI tree, logcat, and a **fail if the WebView starts at y=0**.
- **`.github/workflows/desktop.yml`:** NSIS installer on `windows-latest`.
- **`.github/scripts/supabase-public-config.py`:** resolves the public Supabase URL + anon key.
  - It uses repo variables if set, otherwise reads them from the live bundle (browser user agent needed: Cloudflare 403s urllib). The key is never printed.
  - It also writes `VITE_PUBLIC_APP_URL`.
- **`.github/scripts/android-smoke.sh`:** the emulator script.

**Status:**

| Check | Result |
|---|---|
| Android build + emulator smoke | green through `b637b3c` (WebView top edge 24 px, no console errors) |
| Windows installer | green |
| Web gate on `mobile-1` | 752 tests ×4 TZ, lint 0 errors, build, sweep 80/80, shell-fit 40/40 |

**Install instructions:** `docs/INSTALL.md`.

**Not done yet:**
- Kai installs on his phone ([KAI]);
- a persistent signing key (needs Kai to add 2 secrets);
- Android **share-to-app** (was being designed: an `ACTION_SEND` intent + a `KaisFlowShell.takeShare()` bridge → `/share?text=…`, which captures to the Inbox);
- Android **back button closes overlays first** (idea: `window.__kfBack()` using `lib/overlayStack.ts`);
- push notifications inside the app (FCM, later — SHIP P4);
- macOS / iOS.

### 2.5 The release pipeline (`claude/release-v1`)
**`.github/workflows/release.yml`.** Trigger: push a **`claude/ship-v*` branch** (this sandbox's git proxy refuses tag pushes), a `v*` tag, a published Release, or dispatch once the file is on master.

| # | Step | What it does |
|---|---|---|
| 1 | gate | `ci.yml`: tests ×4 TZ, lint, build |
| 2 | merge-tree check | prepares the merge into master first; fails if master has commits the release lacks |
| 3 | cron key | Vault `service_role_key` must start with `eyJ`, via the Management API `/database/query` |
| 4 | backup | `supabase db dump` schema + data → tar.gz → a **private Storage bucket `backups`** in the same project |
| 5 | database | `supabase db push --linked --include-all --skip-vault --yes` |
| 6 | functions | `supabase functions deploy <6 fns> --use-api` |
| 7 | app | `git push origin master` (Cloudflare builds it) |
| 8 | live check | polls `/version.json` until it shows the merge commit |

- It runs only for `github.actor == repository_owner`.
- The repo is **public**, so nothing prints data or keys.
- **Backup note:** Storage answers **400** (not 404) for a missing bucket. The step does GET, then create. Restore: Dashboard → Storage → `backups` → download the `.tar.gz` (it holds `schema.sql` + `data.sql`).
- The **`diag.yml`** workflow on branch `claude/diag-0034` is a read-only production schema diagnostic (it runs on push to `claude/diag-*`). It prints schema facts only.
- **Runbook:** `docs/DEPLOY-RUNBOOK-v1.md`, including a dated "Hands-free release" section.

---

## 3 · Production state (as of this writing)

### 3.1 v1.0.0 release result
<!-- RESULT: filled in after run 36264266175 finished; see the final chat message and the release log entry. -->
In flight when this was written. Run: https://github.com/khairyKY/kais-flow/actions/runs/36264266175. The final status is in the release log entry written right after this file.

### 3.2 Database
- **Before today:** migrations 0001–0029 were applied (recorded).
- **Run 1 (18:43)** applied **0030, 0031, 0032, 0033**, then failed at 0034.
  - Postgres rolled 0034 back, so nothing of 0034 was applied.
  - 0032 = the 30-day **compost** cron (`compost-expired`, 03:30 UTC daily). It **permanently deletes** trash older than 30 days and dismissed captures untouched for 30 days.
  - The backup was taken **before** anything ran.
- **Run 2** carries the guarded 0034 (`312bb13`), plus 0035–0037.
- **Drift found** by fingerprinting production's `supabase_migrations.schema_migrations.statements` against a clean local apply:

| Migration | What differs in production | Consequence |
|---|---|---|
| **0014** | Line endings only (CRLF) | Harmless |
| **0020** | An earlier copy: 12 statements (project columns + `time_entries`). **No `reload_retainers()` function and no `retainer-reload-monthly` cron job.** | The monthly retainer checklist reset **has never worked in production.** Follow-up: a new migration that creates the function + cron job (then 0034's lockdown applies via its guard), or decide it's unwanted. |
| **0022** | An earlier copy: **no indexes** on `people`/`interactions` (`people_domain_id_idx`, `interactions_person_id_idx`, `interactions_occurred_at_idx`), and a **demo-seed block** that inserted demo people into **every account that existed then**: Omar, Salma, Mom, Nour, Tarek, Laila, plus 9 demo interactions, with fixed ids `20000000-…-0001..6` / `30000000-…-0001..9`. It also seeded "Work"/"Family" domains if missing. | Kai's production account probably contains these **demo people**. Kai decides whether they go; a delete needs his OK and runs as a reviewed migration or command. The missing indexes are performance only; add them in a follow-up migration. |

- **Other checks:**
  - The `slipping` view columns match (`entity_type`, `entity_id`, `entity_name`, `last_touch`, `days_since`).
  - `push_subscriptions` has `id`, `user_id`, `endpoint`, `keys`, `device_label`, `created_at`. 0036's endpoint check is `NOT VALID`, so existing rows can't fail it.
  - `ai_usage` didn't exist before 0036 (expected).
- **Cron jobs in production:**

| Job | Schedule (UTC) |
|---|---|
| `compost-expired` | 30 3 * * * |
| `daily-resurface` | 30 3 * * * |
| `embed-drain` | every 5 min |
| `evening-nudge` | 0 18 * * * |
| `keep-alive` | 0 3 * * * |
| `morning-digest` | 0 5 * * * |
| `overdue-sweep` | hourly |
| `task-reminder-sweep` | every 5 min |

- The Vault `service_role_key` **is** the legacy JWT (it starts with `eyJ`; checked by the pipeline).

### 3.3 Edge functions
- **Before run 2:** the old versions (pre FIX-0).
- **After a green run 2:** notify, embed, transcribe, parse-capture, chat and search from the release, all `verify_jwt = true` (`supabase/config.toml`).

### 3.4 Frontend
- **Before:** `master` = `fd54d42` (README commit). The live site served old code: Kai's screenshot showed the UTC calendar header bug and no overlap layout, both fixed in release-1.
- **After a green run 2:** `master` = the merge of `312bb13`. `https://kais-flow.kaidagoat.workers.dev/version.json` shows that commit.
- **Rollback point:** `fd54d42`.
- **Rollback command:** `git revert -m 1 <merge>` + push, or Cloudflare → Deployments → roll back. Migrations have no down scripts; fix forward.

### 3.5 Still manual for Kai (runbook)
- **Step 5 — email for real users.** Create a Gmail account for the app with an app password → Supabase Auth SMTP (`smtp.gmail.com:465`).
  - **Site URL** = `https://kais-flow.kaidagoat.workers.dev`.
  - **Redirect URL** exactly `https://kais-flow.kaidagoat.workers.dev/reset`. Never a wildcard.
  - Minimum password length 8.
  - Turn **Confirm email ON** only after SMTP works.
- **Step 7 — live checks** (11 of them). The next morning after 03:30 UTC, check `net._http_response` for 200s (no 401s).
- **Optional:** add repository variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` so the app builds don't read them from the live bundle.
- **Optional:** add the Android keystore secrets for in-place APK updates.

---

## 4 · Kai's preferences and rules (binding)

### 4.1 From Kai's personal CLAUDE.md (user preferences)
- **Identity and tone:**
  - Address him as **Kai**. Direct but gentle. Balanced length, **no fluff**.
  - Short, structured, scannable docs.
  - Only use information he gave. No hallucinations.
- **Language:** English for solo work; Arabic when the Shaheen family/team is involved. Brand name always "Shaheen".
- **How he works:**
  - He's a frontend "vibe coder": explain plainly and give working code. He likes React + Tailwind.
  - Surgical edits over rewrites. Derive visuals from the codebase; never invent placeholder designs.
  - **Execution approval (his rule):** start servers and commands, but pause for his manual testing and explicit OK ("looks good, push it") before any git commit or PR to master.
    - Today he explicitly said "I allow you to deploy" and asked for hands-free deploys. Treat deploys through the gated pipeline as authorized, and still report every release.
  - **Never auto-delete files.** Give a review window first.
  - After major changes, update the project's `AI_MEMORY.md` if it exists; ask before creating one (none exists).
- **Machine:** protective of `C:\`. Installs, temp files and caches go to `D:\` (esp. `D:\Coding`).
- **About Kai:** 21, E-JUST CSE student (Tanta / Borg El Arab), Egyptian, Muslim. Type 1 diabetic (Freestyle Libre 2). Family business Shaheen (tires and batteries); he does hands-on management and technical systems there. His best focus is 06:00–09:00; don't release during his 06:00–09:00 Cairo focus block.

### 4.2 From the project `CLAUDE.md` (hard rules)
- **$0 only.** No paid services or credit-card tiers. Play Store $25 / Apple $99 are Kai decisions for later.
- **Light:** no Electron, no local models, no background processes on the laptop. Background work = pg_cron + edge functions. Tauri is allowed; it isn't Electron.
- **Secrets stay server-side:** Groq key, Google tokens, GitHub PAT live only in function secrets or the `integrations` table. Never in client code or `VITE_` vars. The anon key is public by design.
- **Never embed Google UI.**
- **Phase discipline:** out-of-scope ideas get one ROADMAP changelog line.
- **Visual design belongs to Kai.** His eyes > `design-export/` (pixel contract, read-only) > code. Deviations carry `deviation(<date>)` markers.
- **Privacy:** personal content goes through Groq only (no-training, ZDR).
- **Conventions:**
  - vertical slices `app/src/features/<feature>/`;
  - every client write through the outbox (`lib/outbox.ts` `writeRow`);
  - domain events via `logActivity()` into `activity_log`; `entity_id` must be a uuid, other keys go in `payload.entity_key`;
  - store UTC, render **Africa/Cairo**;
  - one Zod schema per entity.
- **Line endings:** keep each file's. Several files are **CRLF**: `TodayPage.tsx`, `AppLayout.tsx`, `EveningRitual.tsx`, `MobileTabBar.tsx`, `SettingsPage.tsx`, `ProjectsPage.tsx`, `app/package.json`, `app/package-lock.json`. Check with `git ls-files --eol`.
- **Commits:**
  - no model names in commits or PRs;
  - end commit messages with the co-author/session trailers the harness gives;
  - no PR unless Kai asks.

### 4.3 Decisions Kai delegated or made today (don't re-ask)
- "asap": the goal date.
- "keep looping, I want to have a very strongly polished and publish ready for my self and other users".
- "dont ask me questions, you make the decision, choose the best ux choice possible". 22 open questions were decided in `docs/log/2026-09-26-0642-bohr-decision-conductor-decides.md`.
- **The daily cycle is the product's spine** (`docs/DAILY-CYCLE.md`).
- **The mobile version = Tauri APK first**, per his July ruling.
- "I allow you to deploy". He added the GitHub secret and moved the session off Auto.

---

## 5 · THE LOOP (how to keep going)

**The full prompt:** `docs/CONDUCTOR.md`. Read it; it's binding:
- prime directives, append-only documentation rules;
- Phase 0 discovery, the skill router, sources of truth, the identity guard;
- the loop, phases A–D, the test standard, the release gate, style.

**Each iteration:**
1. **SYNC:** fetch; newest `status` entry in `docs/log/`; check in-flight work; is live = master (`/version.json`)?
2. **INTAKE:** new asks from Kai become tracker entries first.
3. **PICK**, in this order: (a) broken live product / money / security / data loss; (b) goal items; (c) next phase step.
4. **DO** it yourself on a branch, or brief a worker on its own branch. Workers never merge; the conductor does.
5. **VERIFY:**
   - `cd app && npx vitest run` under `TZ=UTC`, `Africa/Cairo`, `America/Los_Angeles` and `Asia/Tokyo`;
   - `npm run lint` must show **0 errors** (the new baseline);
   - `npm run build`;
   - for anything visible, a real run: desktop 1280 at the 125% default zoom and phone 390 at 100%, day + night;
   - backend changes: the harness suites in `supabase/tests/*.sh` against the local stack.
6. **RECORD**, append-only:
   - one new file `docs/log/YYYY-MM-DD-HHMM-<slug>-<topic>.md` (UTC; use `date -u`);
   - one line at the end of `docs/log/INDEX.md`;
   - `docs/TEST-LEDGER.md` rows;
   - phase Notes;
   - a ROADMAP changelog line.
7. **PING** Kai: a short plain-language summary.
8. **Schedule the next wake-up.** Stop only on Kai's word.

**Release path now:**
- Put the gated tree on a `claude/release-*` branch; CI runs.
- Then push a `claude/ship-vX.Y.Z` branch at that commit, or (once `release.yml` is on master) Actions → Release → **Run workflow**.
- The pipeline enforces the order backup → DB → functions → app.

**Test tools** (all committed):

| Tool | What it checks |
|---|---|
| `docs/log/assets/release-2/sweep.mjs` | 20 routes × desktop/phone × day/night. `node sweep.mjs <base> <email> <password> [shotDir]` |
| `docs/log/assets/shell-fit/shellfit.mjs` | 5 zoom scales × 2 viewports × 4 routes; the document must fit the window |
| `docs/log/assets/loop-a/r2.mjs` | Whole-day Day-card walkthrough with Playwright's clock (the seed script was in the cloud scratchpad; recreate it) |
| `supabase/tests/{fix0-auth,sec2,notify-prune,fix5-search}.sh` | Backend harness suites |

- Playwright needs `executablePath` set to a Chromium path. Locally, use the installed Chromium or `npx playwright install`.

**Local Supabase stack** (for signed-in runs; needs Docker, so it's cloud-only unless Docker gets installed locally):
- `npx supabase start -x studio,imgproxy,logflare,vector,supavisor`;
- recipe: `docs/log/2026-09-26-0450-bohr-decision-local-stack.md`;
- recovery after a container restart: `docs/log/2026-09-26-0510-bohr-correction-restart.md`.

---

## 6 · Every prompt Kai sent, in order (this conductor session)

1. The **CONDUCTOR template** message:
   - fill every placeholder from the real project, doing PHASE 0 first;
   - keep the structure, append-only rules, release gate and loop mechanics;
   - ask the owner only for the deadline, deploy/rollback/backup commands, freeze windows and which decisions stay his.
2. "asap"
3. *(a stop hook: "untracked files … commit and push")*
4. "no I didnt, continue looping"
5. "tell me very briefly what are the goals that we have"
6. "keep looping, I want to have a very strongly polished and publish ready for my self and other users"
7. "dont ask me questions, you make the desicion, choose the best ux choice possible"
8. A task: **the repeat-reminder bug**.
   - Fix the `reminder_at` shift / `reminder_sent` false in `planCompletion`.
   - Tests and checks, commit on its own branch, write a handoff.
   - Don't merge; don't change notify.
   - Done as F2a `e73e627`.
9. A task: **the shell height under the root zoom** (`100dvh` × 1.25).
   - All scales 100–175% at 1280×800 and 390×844 on /today, /calendar, /journal and /settings.
   - The sidebar footer visible; the tab bar not covering the last card.
   - Before/after screenshots day + night. `AppLayout.tsx` is CRLF.
   - Done as `claude/shell-fit`.
10. (with a live calendar screenshot) "are we done looping? the app is still buggy / I cant right click what is in the up next section / I want you to take a step back and decide the user productivity journy, what will be the cycle daily and make the app a little more focused on that" → DAILY-CYCLE + release-2.
11. "continue"
12. "run the backups and deploy"
13. (PowerShell output: checkout blocked by laptop edits; `db dump` failed, "docker: command not found")
14. "no figure out smth else that you will do with me hands-free" → the GitHub Actions release pipeline.
15. "after you are done continue looping to enhance the experience and fix bugs, if that is ready start building the mobile version" → M1.
16. "keep looping, I allow you to deploy, and bypass all permissions"
17. "check local data as well" → scanned the sandbox and the full git history. No Supabase token anywhere; none was ever committed.
18. "Tell me how to change the permissions to bypass permissions for a cloud session, which is this session." → Cloud has no Bypass mode; use the mode dropdown → Accept edits.
19. "I did add the token to the repository on GitHub." → v1.0.0 shipped through the pipeline.
20. "once you are done with what you are doing I want you to write a handoff with everything…" → this file.

---

## 7 · Branches (remote) — what each is

| Branch | State |
|---|---|
| `master` | Live frontend. `fd54d42` before v1.0.0; the merge of `312bb13` after. |
| `claude/release-v1` | **v1.0.0** = mobile-1 + pipeline + guarded 0034 (`312bb13`) |
| `claude/ship-v1.0.0` | The trigger branch for the v1.0.0 pipeline (= `312bb13`) |
| `claude/mobile-1` | M1 (release-2 + Tauri/CI/icon/D2/platform glue), `82d568c` |
| `claude/release-2` | release-2 candidate `d6ae8a0` (= `claude/loop-a` head) |
| `claude/release-1` | release-1 candidate `acd52a7` |
| `claude/loop-a`, `claude/loop-b` | release-2 work |
| `claude/diag-0034` | The read-only production diagnostic workflow |
| `claude/inspiring-bohr-e2vhqo` | This conductor's docs branch: `docs/CONDUCTOR.md`, `docs/DAILY-CYCLE.md`, this handoff |
| `claude/{t2-cairo-shortcuts, t3-build-stamp, j11-password-reset, fix0-edge-auth, fix2-calendar, fix5-search, fix6-visual-batch, p0-empty-user-id, p0-activity-entity-id, p0b-offline, sec2-hardening, sec3-error-hygiene, polish-a…g, polish-f1/f2a/f2b, final-cleanup, shell-fit, audit-newuser}` | Worker branches, all merged into release-1. Safe to archive after v1.0.0 is live. Each holds its own handoff. |
| `feature/botanical-integration` | The old main line (= master before `fd54d42`) |
| `feature/context-menu-49`, `feature/day-count-views-50`, `feature/event-types-modal-47`, `fix/calendar-bugs-48` | July branches, stale |

- **Uncommitted cloud-only leftovers** (they vanish with the container; nothing important is lost):
  - `/home/user/kf-rel` had the first draft of `release.yml` and `ci.yml` plus a runbook section. All of it is now committed on `claude/release-v1`.
  - `/home/user/kf-r2` had a copy of the same.

---

## 8 · Next steps (prioritized)

1. **Confirm v1.0.0 is fully live** (§3.1).
   - If run 2 failed, read its log: `mcp` / `gh run view`.
     - Before `db push`, a failure leaves production untouched.
     - After it, functions and app must follow promptly.
   - Then Kai does the runbook step 7 live checks and step 5 SMTP.
2. **Data follow-ups from the drift** (§3.2). Each is a new migration, gated like any release:
   - (a) create `reload_retainers()` + the `retainer-reload-monthly` cron job, or decide it's unwanted;
   - (b) add the missing `people`/`interactions` indexes;
   - (c) **ask Kai** about the demo people (Omar/Salma/Mom/Nour/Tarek/Laila + 9 interactions) in his production account. Deleting data needs his OK.
   - Also add a **rehearsal step** to `release.yml`: dump the production schema → apply pending migrations to a throwaway DB → only then push. That would have caught 0034 before anything touched production.
3. **M1 on a real phone [KAI]:**
   - install the APK (`docs/INSTALL.md`);
   - check sign-in, Today, the status-bar strip in Night, voice capture (mic prompt), offline launch, and that there's no browser chrome.
   - Then: a persistent keystore; **share-to-app** (the capture step of the daily cycle); **back button closes overlays first**; Windows installer QA.
4. **The v1.1 list** (decided earlier):
   - calendar device time outside Cairo;
   - weather Cairo for all users (per-user location later);
   - H2 PostgREST 1000-row pagination;
   - bundle budget (~232 KB gzip vs 200 KB);
   - PKCE;
   - voice note lost when the AI allowance is used up (needs Kai's call).
5. **Archive the merged worker branches** (listed in §7) once v1.0.0 is verified live.
6. **Keep the loop:** Phase A/B audits for multi-user readiness (`docs/log/*audit-newuser*`), then Phase C design prompts (Kai runs Claude Design) and Phase D UI-ready code.

---

## 9 · Traps learned today (read before touching things)

**Cloud-sandbox limits** (don't apply locally):
- The git proxy refuses **tag** pushes and sometimes drops pushes; retry.
- Blob-storage **artifacts are unreachable (403)**, so the smoke job prints base64 screens into its log.
- `dl.google.com` is blocked.
- `api.open-meteo.com` is blocked (one console error per load; ignore it).
- Container restarts kill Docker. Recovery: `rm -f /run/containerd/containerd.sock*; nohup containerd &; nohup dockerd --containerd=/run/containerd/containerd.sock &; docker start supabase_db_kais-flow` (or `supabase start …`).
- Never `pkill -f` a pattern that's also in your own command line.

**Auto permission mode** blocks production actions even with the user's chat approval. Use Accept edits (cloud) or bypass (local).

**Migrations:**
- Production's history drifted from the files for **0014/0020/0022**. Never assume production = files.
- The fingerprint query is `select version, md5(array_to_string(statements, chr(10))) from supabase_migrations.schema_migrations`. Compare it with a clean local apply.

**Code-level traps:**
- **Outbox:** `networkPayload()` strips `search_tsv`, `embedding` and an empty `user_id`. Generated columns break spread-and-upsert writes unless they're stripped.
- **`activity_log` has no user delete policy.** A test reseed must clear ritual rows with the **local** service key.
- **Tests:**
  - they're pure-function only; RLS, SQL and edge functions need the harness suites;
  - check both the "Test Files" and "Tests" lines, since a file can fail with "no tests";
  - run all 4 TZs.
- **Context menus close on scroll.** A test that right-clicks a row below the fold must scroll it into view and wait first.
- **Cloudflare 403s default Python and curl user agents.** Send a browser user agent.

**Android / Windows:**
- A bare apostrophe breaks Android `strings.xml` and NSIS macros ("Kai's Flow").
- Tauri's Android template draws edge to edge. Our `MainActivity.kt` handles the insets.
- `onWebViewCreate(webView)` is the hook (wry `WryActivity`). wry already requests `RECORD_AUDIO` when the page asks for the mic.

---

## 10 · Where everything is (quick index)

| What | Where |
|---|---|
| Rules / conductor | `CLAUDE.md`, `AGENTS.md`, `docs/CONDUCTOR.md` |
| Product spine | `docs/DAILY-CYCLE.md` |
| Plans | `PLAN.md`, `design-integration/PLAN.md` (platform + SHIP), `design-integration/FIX-PLAN.md` |
| Build state | `docs/ROADMAP.md` (changelog at the top), `docs/phases/*` (incl. `M1-android.md`) |
| Journal | `docs/log/` + `docs/log/INDEX.md` (every decision, test run, handoff) |
| Deploy | `docs/DEPLOY-RUNBOOK-v1.md`, `.github/workflows/release.yml`, `diag.yml` |
| Apps | `app/src-tauri/`, `.github/workflows/android.yml`, `desktop.yml`, `docs/INSTALL.md` |
| Tests | `docs/TEST-LEDGER.md`, `supabase/tests/`, `docs/log/assets/*/*.mjs` |
| Schema | `docs/DATA_MODEL.md`, `supabase/migrations/0001…0037` |
| Design | `design-export/` (pixel contract), `app/src/styles/tokens/` |
