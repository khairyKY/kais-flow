# Email: confirm-your-email and the other auth emails, for $0

Kai's call (2026-09-27): a new account confirms its email before first use. Supabase's built-in
mailer can't do that for real users, so the auth emails go out through **a Gmail account with an
App Password** (smtp.gmail.com, port 587). It costs nothing and needs no domain.

## Kai's steps (about 5 minutes)

1. **Pick the Gmail account that sends the emails.** A new one is tidiest (for example
   `kaisflow.app@gmail.com`), but your own works too. People will see this address as the sender.
2. **Turn on 2-Step Verification** for that account: https://myaccount.google.com/signinoptions/twosv
   (Google only gives App Passwords to accounts that have it).
3. **Create an App Password:** https://myaccount.google.com/apppasswords → name it `Kai's Flow` →
   Google shows 16 letters once. Copy them (the spaces don't matter).
4. **Add two GitHub secrets:** https://github.com/khairyKY/kais-flow/settings/secrets/actions →
   *New repository secret*:
   - `SMTP_USER` = the Gmail address
   - `SMTP_PASS` = the 16 letters

   Paste the password only there, never into a chat.
5. **Tell Claude "SMTP is in".** Claude takes it from there (below). You'll be asked to try
   "Forgot password?" once and say whether the email arrived.

## What happens after "SMTP is in" (for Claude)

1. Ship a release. Its **Auth email** step (`.github/workflows/release.yml`, after the live check)
   sees both secrets and sends the hosted project: Gmail SMTP, the branded templates
   (`supabase/templates/`), the email rate limit, and the Confirm email switch — all read from
   `supabase/config.toml`. Without the secrets it does nothing.
2. Ask Kai to tap "Forgot password?" on his own account. The branded email should arrive from the
   Gmail address. If it doesn't: GitHub → Actions → the release run → the step's summary line;
   check the Gmail account's Sent folder and its security alerts.
3. Set `enable_confirmations = true` in `supabase/config.toml` and ship a release. From then on a
   new account sees 9c "Check your email" after sign-up, and the link plays 9f and goes on to
   onboarding (`app/src/features/auth/`). The app needs no change: it switches by itself.

`supabase/config.toml` is the source of truth once the secrets exist: every release re-sends these
settings, so a "Confirm email" toggle flipped in the Supabase dashboard is put back at the next
release. Change it in the file.

## Why not `supabase config push`

Checked against the CLI the release uses (2.118.0, `pkg/config/updater.go` and `auth.go`):
`config push` sends the whole `[auth]` block — `site_url`, the redirect allow-list,
`minimum_password_length`, JWT expiry, providers, MFA, every rate limit — plus the API, database and
storage settings. Our `config.toml` holds local-dev values for those (`site_url =
"http://127.0.0.1:3000"`, a password minimum of 6), so one push would break the links in every
email and could loosen the live password rule (audit S10 asked for 8 there). The release step instead PATCHes only the
email fields to the same Management API endpoint (`/v1/projects/{ref}/config/auth`), which leaves
everything else alone.

## Limits and good to know

- **About 500 emails a day** (Gmail's limit for a normal account). `config.toml` caps Supabase at
  60 an hour, and Resend in the app waits a minute between sends.
- **The sender is the Gmail address**, shown with the name "Kai's Flow". Replies go to that inbox.
- **The Gmail Sent folder keeps a copy** of every email sent, links included. Links last an hour
  and work once, so old copies are harmless.
- **Some work email scanners open links before the person does**, which uses the one-time link up.
  The person then sees 9e "This link has expired" and can send a new one.
- **Later, with a domain:** a domain + Resend (or any SMTP service) replaces Gmail by changing
  `host` / `port` / `user` in `[auth.email.smtp]` and the two secrets. No app change.
- **Local `supabase start`** would also try Gmail now. Nobody runs it today; set
  `[auth.email.smtp] enabled = false` locally to get the Inbucket test inbox back.
