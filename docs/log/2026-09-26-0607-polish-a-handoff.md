---
date: 2026-09-26 06:07 UTC
session: polish-a-worker
type: handoff
related: audit-newuser, punch 65
---

# Polish A: no developer error screens, design galleries out of production, sign-up lands on onboarding

**Branch:** `claude/polish-a`, branched off `origin/claude/release-1` at `e04114a` (includes J-11). Nothing is merged and no PR is open.
**Commits:** `4151db5` (item 1: not-found and crash pages), `d6a5f63` (item 2: galleries dev-only, punch 65), `a6afa9a` (item 3: sign-in/sign-up goes through the onboarding gate), then this evidence commit.
**Files changed:** `app/src/App.tsx` (CRLF kept), `app/src/features/auth/SignInPage.tsx` (one line plus a comment), and one new file, `app/src/components/RouteErrorPage.tsx`. I didn't touch any file on the other worker's list.

> 🎨 **Needs a design pass (Phase C).** The export has no screen for "not found" or "crashed". These pages are built only from parts that already exist. Inside the app they use Stub's centred column: seedling, display title, a Caveat hand line, kit `Button`s. With no shell around them they use J-11's doorway card (`AuthLayout`), the same way `/reset`'s expired-link state does. All sizes and colours come from tokens (`--fs-display-m`, `--fs-hand-l`, `--sp-3`, `--ink-*`). Nothing here is a design decision.

## What changed

### 1. No developer error screens (audit: "any unknown path")
- **`components/RouteErrorPage.tsx`** exports two components:
  - `NotFoundPage` for an unknown address.
  - `RouteErrorPage` for a route's `errorElement`. A 404 route response gets the not-found copy. Anything else gets the crash copy.
  - Both have two looks. `bare` means no shell around the page: the doorway card. The default is inside the shell: Stub's column.
  - No stack trace, no text from the thrown error, and never the word "error". The error details still reach the console, because React and React Router log every caught crash there.
- **`App.tsx` routes:**
  - Every top-level route has `errorElement: <RouteErrorPage bare />`: `/sign-in`, `/reset`, `/`, `/onboarding`, and `/design-system` in dev. A crash at that level takes the shell down with it, so the bare look is used.
  - Inside `/` there is one new **pathless route** with `errorElement: <RouteErrorPage />`. A page that crashes shows the crash state *inside* the shell, so the sidebar still works. This was checked: after a crash, clicking Inbox in the sidebar renders Inbox normally.
  - A **`*` catch-all** (`id: 'not-found'`) sits inside the authenticated shell, so a signed-in user sees not-found inside the app.
  - **Signed out:** the `/` element is now a small `Shell` wrapper. If the matched route is the catch-all and there is no session, it renders the bare not-found card instead of bouncing to the sign-in form. Every *known* page still redirects to `/sign-in` exactly as before (checked: `/today` signed out goes to `/sign-in`). `RequireAuth` itself is unchanged.
- **Buttons:**
  - **Not found:** one CTA, **Back to Today**. A signed-out visitor sees **Back to sign in** instead.
  - **Crash:** **Reload** (CTA, `window.location.reload()`) plus **Back to Today** (secondary). "Back" is hidden when you are already on that page, e.g. a crash on `/today` itself, because it would only repeat the crash.

### 2. Design galleries out of production (punch 65)
- The routes `/capture` (W8 quick-capture gallery: fake lock screen, keyboard, share-sheet simulation) and `/seasons` (season sheet with "Good morning, Kai" on sample dates) are built inside `designGalleryRoutes()`. That function is only called when `import.meta.env.DEV` is true.
- In a production build the function is never called, so the routes, their `lazy()` imports and their chunks are all dropped. Those URLs then hit the not-found page.
- **`/design-system` (`KitReference`): I decided to gate it too.** It is unauthenticated on purpose so builders can open it without signing in. Its own comment says it's there so "wave agents diff their compositions against these atoms", and `design-integration/briefs/_SHARED.md` points *builders* at it. It isn't a product surface, and a public v1.0 shouldn't show strangers a "Component kit" page. It still works on `npm run dev`, which is where builders use it. It was also statically imported, so gating it takes it out of the eager bundle. Reverting is a one-line change if Kai wants it on live.
- **Links to these pages:** nothing in production links to them. I grepped navigation (`AppLayout`, `MobileTabBar`), the command bar, Settings and the PWA manifest (`vite.config.ts`) for `/capture`, `/seasons` and `/design-system`, and the only hits were the route table. The sidebar and tab-bar "Capture" entries open the command bar and the voice sheet, not `/capture`. So I removed or redirected no links.
- **`/share`** (the real Android share target) is untouched and was checked working.
- **Also looked at:** `/planning` and `/library` are URL-only real features, not galleries. Punch 65 says those may stay URL-only, so I left them alone.

### 3. Sign-up lands on onboarding (audit: "Sign-up → onboarding")
- `SignInPage` now redirects a session to `/` instead of `/today`, the same thing J-11's `/reset` already does after saving a password.
- The index `OnboardingGate` waits for `app_settings`. It then sends an account with no `onboarded_at` to `/onboarding` once, and sends everyone else to `/today`. Because it renders nothing while the settings load, an onboarded user never sees onboarding flash.
- J-11's `/reset` flow is untouched.

## Copy I wrote (for Kai to judge)

| Where | Title | Hand line (Caveat) | Buttons |
|---|---|---|---|
| Not found, in the app | This page isn't here | the link may be old, or the address mistyped | **Back to Today** |
| Not found, signed out (card) | This page isn't here. | the link may be old, or the address mistyped | **Back to sign in** |
| Crash, in the app | Something went wrong on this page | a reload usually sets it right | **Reload** · Back to Today |
| Crash, no shell (card) | Something went wrong on this page. | a reload usually sets it right | **Reload** · ← Back to Today *(or ← Back to sign in when signed out)* |

## Evidence (all run in this session)

**Automated, from `app/`:**
- `TZ=UTC npx vitest run`: 25 files, **265/265** passed. `TZ=Africa/Cairo npx vitest run`: **265/265** passed.
- `npm run lint`: **2 errors**, the same baseline pair at `features/projects/ProjectsPage.tsx:23–24`. Warnings are 30 before and 30 after. My files add none.
- `npm run build` (`tsc -b` + vite + PWA): green.

**Bundle and dist:**

| | before (`release-1` App.tsx) | after (`a6afa9a`) |
|---|---|---|
| `index-*.js` | 323.38 kB / **98.24 kB gzip** | 320.36 kB / **97.58 kB gzip** |
| PWA precache entries | 209 | 204 |
| `QuickCapturePage-*.js`, `SeasonsPage-*.js` chunks | present | **gone** |

- `grep` of the production `dist/` for "Good morning, Kai", "Component kit", "Friday, July 10" and "Hey developer" finds nothing.
- The new copy is in the index chunk.

**Real run: production build + local Supabase stack**
- Setup: `vite build && vite preview --port 5230 --strictPort`, served commit `a6afa9a` (checked via `/version.json`). Chromium 1194 via Playwright.
- Script: `assets/polish-a/polish-a-e2e.mjs`, a copy of the conductor's `smoke.mjs` that I extended. Logs: `assets/polish-a/e2e-main.log`.
- The account was brand new, created through the app's own sign-up form: `polish-a-2739612@example.com`. Local auth has email confirmation off, so sign-up returns a session immediately.
- Result: **49/49 checks passed.**
  - **Signed out:**
    - `/nope`, `/tasks/nope/deeper`, `/capture`, `/seasons` and `/design-system` all show the not-found card and keep their URL.
    - No developer screen and no "error" anywhere on those pages.
    - "Back to sign in" goes to `/sign-in`.
    - `/today` still redirects to `/sign-in`.
  - **Sign up through the form:** URL path `/sign-in → / → /onboarding`, never `/today`. Onboarding step 1 renders. Clicking through all 7 steps and "Enter your garden ✿" lands on `/today`. `app_settings.onboarded_at` is on the server (read back over REST: `2026-09-26T06:05:51Z`).
  - **Signed in:**
    - The same five URLs show not-found *inside* the shell (`<aside>` present).
    - No gallery content ("Good morning, Kai", "Friday, July 10", "Component kit").
    - "Back to Today" goes to `/today`.
  - **`/share?text=hi from polish-a …`** lands on `/inbox`, and the shared text is in the Inbox.
  - **Sign out (sidebar), then sign in again as the same account:** path `/sign-in → / → /today`, and **never `/onboarding`**.
  - **Phone 390×844:** the signed-out and signed-in not-found pages both render with no horizontal overflow (0 px).
  - **Night theme:** both not-found looks render.
  - Console, apart from the open-meteo `ERR_TUNNEL_CONNECTION_FAILED` noted in the brief (26 lines, ignored):
    - one `favicon.svg ERR_ABORTED`, where the script navigated away mid-load;
    - one `auth/v1/logout ERR_ABORTED`, which the J-11 handoff already diagnosed as GoTrue answering 204 while Chromium flags the unread body. Sign-out worked.
- **Forced render crash: scratch build, never committed.**
  - I temporarily added this line as the first line of `TodayPage`, `FocusPage` and `SignInPage`:
    `if (new URLSearchParams(window.location.search).has('crash')) throw new Error('forced crash for polish-a check')`
  - I built that with `vite build --outDir <scratchpad>` and restored the three files straight away (`git checkout --`, then `git status` was clean and `grep "forced crash" app/src` found nothing).
  - Served with `vite preview --port 5247`. Log: `assets/polish-a/e2e-crash.log`. **17/17 checks passed.**
    - `/sign-in?crash`: the bare crash card. "Reload" really reloads (one `load` event, card back again). There is no "back" link, because the page is already sign-in.
    - `/focus?crash` (signed in): the crash page inside the shell, with Reload (reload verified) and Back to Today. Back to Today goes to `/today`, which renders normally.
    - `/today?crash`: crash page with Reload only.
    - Sidebar → Inbox after a crash renders Inbox normally.
    - Phone 390: the bare crash card renders.
    - None of these pages show the thrown message, a stack, or the word "error".
    - Console shows the thrown error and React Router's "caught the following error during render", as expected. That's the console, not the UI.
- **Dev server still has the galleries** (`vite --port 5248`, log `assets/polish-a/dev-galleries.log`):
  - `/design-system` renders the kit signed out.
  - `/capture` and `/seasons` render their galleries signed in.
  - `/nope` shows not-found.
- All servers I started are stopped (5230, 5247, 5248).

**Screenshots** (`docs/log/assets/polish-a/`; desktop shots scaled to 800 px wide and palette-encoded):
- **Not found:**
  - `desktop-signedout-nope.png`, `desktop-signedin-nope.png`, `desktop-signedin-capture.png`
  - night: `desktop-night-signedout-nope.png`, `desktop-night-signedin-nope.png`
  - phone: `phone-signedout-nope.png`, `phone-signedin-capture.png`
  - The in-app `/capture`, `/seasons` and `/tasks/nope/deeper` shots were byte-identical to `/nope`, so only `/capture` is kept. The same goes for signed-out `/capture`.
- **Onboarding:** `desktop-signup-onboarding.png` → `desktop-onboarded-today.png` → `desktop-signin-again-today.png`.
- **Share:** `desktop-share-inbox.png`.
- **Crash:** `desktop-crash-bare-signin.png`, `desktop-crash-inshell-focus.png`, `desktop-crash-inshell-today.png`, `phone-crash-bare-signin.png`.

## Not verified
- The live site.
- A real phone.
- Kai's real account.
- The production sign-up path with email confirmation ON. That path already lands on `/` via the confirmation link, and this change doesn't touch it.
- There are no automated tests for routing; the suite is pure-function only.

## Open questions for Kai
1. **Copy:** are you happy with the table above? The hand lines in particular.
2. **`/design-system` gated too.** Keep it dev-only, or do you want the kit page on live?
3. **Existing accounts with no `onboarded_at`.** Sign-in now goes through the gate. Any account whose `app_settings.onboarded_at` is still null will see onboarding once on its next form sign-in. It already would have when opening the PWA, since its `start_url` is `/`. If Kai's own row is null he'll see it once; it prefills his name and workspace.
4. **A brief blank content area** (one `app_settings` round trip) right after sign-in, before Today or onboarding appears. The shell shows; onboarding never flashes. Moving the gate outside `AppLayout` would remove it. That's out of scope here.

## For the test ledger (suggested rows, 🆕)
- **Unknown URL.** Steps: open `/anything` signed in and signed out. Expected: the calm not-found page, "Back to Today" / "Back to sign in". Covered by: manual (`polish-a-e2e.mjs`).
- **Galleries dev-only.** Steps: open `/capture`, `/seasons`, `/design-system` on live. Expected: not-found page. Covered by: manual.
- **New account onboarding.** Steps: sign up through the form. Expected: onboarding, then Today. Then sign out and sign in again. Expected: Today directly, with no onboarding. Covered by: manual.
