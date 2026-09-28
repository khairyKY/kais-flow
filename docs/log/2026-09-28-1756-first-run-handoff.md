---
date: 2026-09-28T17:56+03:00
session: Wave N builder I (first run)
type: handoff
related: design-export/SCREENS-2026-09-28-sheets.md §First Run.dc.html (brief 09) + "Decisions the briefs didn't cover → First run" · design-export/First Run.dc.html 9a–9m · Onboarding.dc.html (desktop) · DS-CHANGELOG §3
---

# First run: sign up, sign in, reset, and one onboarding screen

Branch `claude/first-run`, cut from `origin/claude/wave-m` (0e7bad1). Not merged, not deployed. App.tsx is untouched. Files changed are in `features/auth/`, `features/onboarding/`, plus two small additions to shared files:
- `components/States.tsx`: `ErrorCard` takes `retryLabel`; `OfflineChip` takes its text as children.
- `components/RouteErrorPage.tsx`: its bare page moved to the new frame, because the old card was deleted.

**Email confirmation is parked** (Kai, 2026-09-28: Resend needs a domain). It stays off, so sign-up returns a session and goes straight to onboarding.

## What changed

- **One frame for every first-run screen.** `features/auth/AuthLayout.tsx` + `firstRun.css`:
  - Phone: a 56px wordmark bar, then one column with 16px gutters and grain.
  - Desktop (9m): wordmark at 36/18, the fern watermark, and a centred column (400 for auth, 460 for onboarding).
  - Pieces: `Hero`, `Plant`, `SealedEnvelope`, `Field`, `PasswordField`, `LinkButton`, `Cta` (the kit Button, full width, 48), `ProblemCard` (the kit ErrorCard), `ResetSent` (9k-1).
  - It mounts its own `ToastHost`, since these pages sit outside the shell.
  - The old TapeCard sign-in card (`AuthShell`, `HandLine`, `CardMessage`, `Fields`, `Notice`, `CardCta`, `BackLink`, `TextLink`) is deleted.
- **Pure logic, tested** (`auth/authLogic.ts`, `onboarding/firstThings.ts`):
  - `passwordRule`: empty / short ("Use 8 or more characters — 3 to go") / ok ("8+ characters"). It replaces `newPasswordProblem`, because the confirm field is gone.
  - `authProblem`: GoTrue error → `offline` (status 0: the fetch never reached the server), `in-use` (`user_already_exists` / `email_exists` / "already registered"), or one calm line (the existing `calmAuthLine`).
  - `inboxUrl`: the webmail inbox for "Open email app". It covers Gmail, Outlook/Hotmail/Live, Yahoo, iCloud and Proton, and returns null otherwise.
  - `readFirstThing`: one onboarding line through the command bar's own `parseCommand` (chrono, `zone: 'cairo'`). Date words leave the title and become `dueAt`; `30m` and `!!` carry over the same way. An empty line gives null.
  - `whenChip`: "Tomorrow · 15:00", Cairo day word + 24h clock (`dayWord` + `cairoTimeKey`, both reused).
- **Sign up (9a):**
  - Email, then Password with Show/Hide as a word and the live 8+ line (faint → terra → sage).
  - One CTA, "Create account". "Already have an account? Sign in".
  - A too-short password sends nothing and puts focus back on the field.
  - Success → session → "/" → OnboardingGate → `/onboarding`.
  - If Confirm email is ever switched on (no session back), it falls back to sign in with a one-line "Confirm your email with the link we sent, then sign in."
- **9b-1 email in use.** A DS Error card under the email field: "{email} already has an account." with **Sign in instead**, which switches to 9j keeping the email and password. This covers both GoTrue shapes: the 422 when confirmation is off, and the obfuscated `identities: []` when it is on.
- **9b-2 weak password.** The live terra line; the CTA stays enabled but sends nothing.
- **9b-3 offline.**
  - An `OfflineChip` reads "Offline — connect to sign up" (sign in / send the link / save it on the other forms) from the shared `useOnline`.
  - Tapping anyway gives the card "No connection. Your details are kept — try again when you're online." with Retry. Retry re-submits the form; the fields are never cleared.
- **Sign in (9j):**
  - Clover resting, "Welcome back", no rule line, and "Forgot password?" right-aligned under the field (48 tall). "New here? Create an account".
  - Wrong password → the calm line in an Error card.
- **Which screen `/sign-in` opens on.** A device that has signed in before (`kf.lastEmail`) opens on sign in, pre-filled. A fresh device opens on sign up, which is 9a's happy path.
- **Forgot password (9j → 9k-1):**
  - If the email is already typed and valid, one tap sends the link.
  - If the field is empty, a "Reset your password" form asks for the email first (not drawn).
  - The send lives in `recovery.ts` `requestReset`, which reuses `resetRequestLooksSent`, so a 429 still reads as sent.
- **9k-1 reset link sent:**
  - Envelope + intact seal. "We sent a password link to **email**. Open it on this phone…" ("device" on desktop).
  - The "Waiting for the link…" spinner line and "Not there? Check Spam or Promotions."
  - "Open email app" is the CTA when `inboxUrl` knows the inbox. Otherwise Resend becomes the one CTA.
  - Resend sends again and toasts "Sent again — check your inbox." "Back to sign in" returns to 9j.
  - **"Waiting" is true.** supabase-js broadcasts `PASSWORD_RECOVERY` to other tabs. When the link opens in another tab, this tab records recovery, and `SignInPage` now sends a session to `/reset` instead of "/" while recovering. The waiting tab moves on to 9k-2.
- **9k-2 set a new password:**
  - A ← replaces the wordmark. Then the fern unfurling, "Set a new password", "For email. You'll stay signed in on this phone."
  - One field with Show and the live rule; the confirm field is gone. "Save password".
  - Save calls `updateUser` → the existing "New password saved — welcome back." toast → "/" → Today.
  - ← signs the recovery session out (`signOut`) and returns to sign in. It does this so "/" can't walk into the app without a new password.
  - A session that lapses mid-form still becomes 9k-3, as before.
- **9k-3 link expired:**
  - Envelope back. "Reset links last an hour and work once. We'll send a new one to email."
  - The email comes from `kf.lastEmail`, which a reset request now also writes.
  - **Send a new link** sends in one tap and shows 9k-1. With no known address, it opens `/sign-in?forgot`. **Use a different email** → `/sign-in?forgot`.
  - `/reset` opened with no link gets the same layout: "Reset links open here".
- **Onboarding (9g / 9h), one screen replacing the 7-step tour:**
  - Wordmark + Skip (ghost). Clover awake + "let's plant something ✿" (Caveat).
  - "What should we call you? optional".
  - "What are 3 things on your mind today?" with three 48px lines, each with a Top 3 star. Line 1 is focused, with the example placeholder.
  - A line with a date shows the kit date parse chip under it (`Chip tone="date"`, "TOMORROW · 15:00").
  - Enter moves to the next line.
  - **Start** is disabled until a line has text and is pinned to the bottom on phone.
  - **Skip** and **Import from Akiflow / CSV instead** (→ `/settings/import`) also mark the account onboarded, keep the name if one was typed, and create no tasks.
- **Start → 9i.** `completeOnboarding(name, things)`:
  - `createTask` per line, then `toggleTop3` on each, so each is `top3 = true` and logs `task.starred`, as Today's Top 3 reads.
  - It saves `display_name` if one was typed and sets `onboarded_at`.
  - Then `/today`, which lists the three. `?replant` from Settings still reopens it.
- **Assets.** `ds/assets/envelope/front.png`, `envelope/back.png` and `seal/intact.png` were copied verbatim from `design-export/ds/assets`, the existing DS art. All other art was already in the app.

## Evidence

- **Gate** (no `app/.env.local` in this worktree):
  - `npx tsc -b`: 0 errors.
  - `npx vitest run`: 66 files / 887 tests pass under TZ=UTC, Africa/Cairo, America/Los_Angeles and Asia/Tokyo.
    - New file `firstThings.test.ts` (7 tests).
    - `authLogic.test.ts`: `newPasswordProblem`'s 4 tests replaced by `passwordRule` 3, `authProblem` 3 and `inboxUrl` 2.
  - `npm run lint`: 0 errors, 25 warnings (none in touched files).
  - `npm run build`: ok.
- **Browser** (Playwright + system Chrome, real CDP touch on phone, `docs/log/assets/first-run/verify.mjs`): **293/293**.
  - Setup: the dev server points at a dead backend (`127.0.0.1:9`), and Playwright answers `/auth/v1/signup`, `/token`, `/recover`, `/user` and every REST call, and records the writes.
  - Only made-up `@example.test` addresses and made-up passwords were used. No real account was touched.
  - Browser clock: Sun 27 Sep 07:40 Cairo.
  - Every state runs at 390×844 day, 390×844 night and 1200×760 desktop:
    - 9a → sign-up lands on onboarding
    - 9b-1 → Sign in instead
    - 9b-2
    - 9b-3 → back online, Retry signs up
    - 9g / 9h / 9i: three Top 3 rows written; "Call the tyre supplier" due `2026-09-28T12:00Z`; the others undated; name saved; Today lists all three
    - Skip
    - 9j, then wrong password, then right password → Today
    - 9k-1 → Resend toast → Back
    - Forgot with an empty field
    - 9k-2: a short password isn't sent; Save → Today + toast
    - 9k-3 → Send a new link → 9k-1
    - Use a different email
  - Also checked: the webmail 9k-1 (Open email app is the CTA, Resend secondary), and the waiting tab moving to 9k-2 when the link opens in a second tab.
  - Every screen also checks: no horizontal scroll, no text under 12px on phone, one CTA, the right theme, no page errors.
  - Desktop, in CSS px at the app's 125% UI scale: fern shown, wordmark bar at 36/18, and a centred 400 (auth) or 460 (onboarding) column.
- **Screenshots:** `<frame>-{day,night,desktop}.png` for every state; `9j-*-wrong`; `9k-1-webmail-*`; `forgot-empty-*`.
- **Side-by-sides** (`side-<frame>.png`, design | build): 9a, 9b-1, 9b-2, 9b-3, 9g, 9h, 9i, 9j, 9k-1, 9k-2, 9k-3, 9l-a, 9l-g, 9m-a, 9m-g.

## Deviations

- **Not built — build when a domain + SMTP exist:**
  - 9c check your email
  - 9d resend cooling down
  - 9e confirm link expired
  - 9f email confirmed ✿
- **9i's first-visit hint is skipped.** The Caveat line under the NOW slip is not built (features/today/ is off limits).
  - Also, Today renders the first Top 3 pick as its Goal card ("GOAL OF THE DAY", no date meta). The drawing shows three plain star rows with "TOMORROW 15:00". That is Today's own rule and Kai's or the conductor's call.
- **The onboarding tour is gone.** Workspace name, seed avatar, the pillars and the push-enable step are not in first run, because the drawing has one screen.
  - New accounts keep the defaults (workspace "Personal", no seed).
  - Nothing in Settings edits workspace name or seed. Push stays in Settings.
- **Tapping the date chip** (9h says it should open the date picker) isn't wired. The chip is display-only; to change the date, edit the words.
- **"Forgot password?" with an empty field** opens a small "Reset your password" form (clover resting) that isn't drawn.
- **"this phone" becomes "this device" on desktop** in 9k-1 and 9k-2.
- **Desktop renders at the app's 125% UI scale**, so a 1200×760 window scrolls slightly where the 1× drawing fits. Media queries are unaffected; it is the same zoom as every desktop page.
- **Toasts on first-run pages** sit 88px up on phone (the kit's tab-bar offset), though there is no tab bar here.
- **RouteErrorPage's bare state** now uses the first-run frame (seedling, title, sub-line, one CTA, a text link) instead of the deleted card.

## Risks / not done

- **About 1.4 MB of PNG added to the PWA precache** (envelope front/back + seal, copied verbatim; precache now ≈10 MB). They could be downscaled to 2× their drawn size (≈350px wide) if install size matters.
- **The broadcast "waiting" handoff depends on supabase-js's BroadcastChannel.** It does not cross browsers or apps. A link opened in the Gmail app's in-app browser lands on 9k-2 there, and the original tab keeps waiting.
- **`useOnline` is TanStack's `onlineManager`**, which starts online until an `offline` event arrives. A page loaded while already offline shows no chip until the first failed tap. The card still covers that case.
- **"Open email app" is a web link** to the provider's inbox. It isn't an Android intent, so in the Capacitor shell it opens the browser, or the Gmail app via app links.
- **Not checked on hardware:** Android autofill and password-manager behaviour with the Show toggle, and the keyboard over the pinned Start button.
- No `docs/log/INDEX.md` line and no ROADMAP edit (parallel builders; the conductor adds them).
