---
date: 2026-09-26 06:42 UTC
session: bohr
type: decision
related: K-j, SEC-2, FIX-2, FIX-6, J-11, Polish A/B/C/D, audit-newuser, S8/K-g, security review #6 #7
supersedes: every "open question for Kai" in this session's log entries and handoffs
---

# Kai: "don't ask me questions, you make the decision, choose the best UX choice possible" (2026-09-26)

From now on, the conductor decides product/UX questions and records the reasoning here, in one entry per round.

Unchanged, because it's Kai's own durable rule and not a UX question: nothing lands on `master` without his "looks good, push it". Backend deploys (`db push`, `functions deploy`) run on his machine: they are **steps he performs, not questions he answers**.

## Decisions (best UX, with the reason)

| Topic | Decision | Why |
|---|---|---|
| K-j public email | **A dedicated free Gmail account (e.g. a new "Kai's Flow" address) + a Google app password as Supabase custom SMTP** (`smtp.gmail.com`, port 465). Then turn email confirmation ON. Steps go in the deploy runbook. | /bin/bash, no credit card, no custom domain needed (Resend/Brevo need domain or sender verification for good deliverability; `workers.dev` can't be domain-verified). Gmail's daily sending cap is far above beta needs. A dedicated account keeps Kai's personal inbox out of it. |
| AI daily limits | **Keep 150 chats / 300 AI captures / 60 voice notes per account per Cairo day.** | Generous for real use; strangers can't drain the shared quota. Tunable by env without code. |
| Voice note after the allowance runs out | **Never lose a recording.** If transcription fails for any reason, keep the recording in the sheet with "Try again", and save the capture to the Inbox as "Voice note (not transcribed yet)" rather than discarding it. After a daily-limit reply, the next tap on voice says so up front and offers typing. | A capture app must never eat what you said. |
| Reset links: PKCE vs implicit | **Keep implicit for v1.** | PKCE breaks "request a reset on the laptop, open it on the phone" — a very common path. The login-CSRF risk is low, and `/reset` already shows which account the link is for. |
| Sign-up says "already planted — sign in instead" | **Keep.** | Clear guidance beats obscurity for a personal app; enumeration risk here is low (security review rated it INFO). |
| `/design-system` | **Dev-only.** | Builder's page, not a user feature. |
| Error-page copy (Polish A) | **Accept as written.** | Calm, plain, gives a way back. |
| New-routine wording | **"no streak yet".** | It's the design system's own caption for the bare vine; "just planted" is cuter but less clear. |
| Phone routine rows hide the zero-streak label | **Accept.** | Matches the export's iPhone row; the label overprinted the name. |
| "1 rain held" caption on a 0-day streak | **Hide the rain caption when the streak is 0.** | It reads as a contradiction. |
| Calendar `+N more` replacing the top title | **Keep (export 3e).** | The title stays in the tooltip and is the popover's first row. |
| A dropped block vanishing into `+N more` | **The block you just dropped always stays visible** (it takes the top lane until the next interaction). | You must see where your drag landed. |
| Phone calendar: grid ~211px under the rail, now-line behind the tab bar | **Collapse the Unscheduled rail by default on phone (tap to open), and use a 1-hour lead instead of 2.** | The grid is the point of the calendar screen. |
| Calendar tab left open past midnight | **Roll "today" over at Cairo midnight automatically.** | Stale "today" is a bug, not a feature. |
| FIX-6: small keycaps in dense rows | **Keep.** | Row height stays even. |
| FIX-6: sort control without a caret | **Add a subtle ▾.** | A control that opens a menu should look like it. |
| FIX-6: `Select` popover off-screen on phone, 39px rows | **Fix: clamp to the viewport and use 44px rows on touch.** | Accessibility floor. |
| Remaining hand-rolled shortcut hints | **Convert them all to `KeyChip`.** | One visual language (J-17's intent). |
| Onboarding step 4 promises Google Calendar sync | **Remove the promise; say it's coming later.** | Truthfulness rule: never claim what isn't built. |
| Sidebar Today badge vs the Today page (known drift) | **The badge counts exactly what Today shows.** | A badge that disagrees with its page erodes trust. |
| S8 persister (K-g was ruled "exclude") | **Implement it:** journal, people, interactions, notes and push_subscriptions stay out of the IndexedDB persister. | Kai's own earlier ruling; privacy. |
| Command bar date chip "9/27/2026, 10:00:00 AM" | **Format as the app formats dates elsewhere (Cairo, no seconds).** | Consistency. |
| 0032 compost first run | **Ship as designed. The deploy runbook makes a backup mandatory right before `db push` and states exactly what the first run deletes.** | The UI already promises the 30-day compost; the backup makes it recoverable. |
| Kai's onboarding reappearing once if `onboarded_at` is null | **Accept.** | Pre-filled; one-time. |

## Work these decisions create (queued, owners assigned in the next status entry)

- **Polish E:** capture/voice keep-recording; onboarding truthfulness; S8 persister; command-bar date chip; Today badge.
- **Polish F:** calendar follow-ups (dropped block visible, phone rail collapsed, midnight rollover); `Select` phone fixes; sort caret; remaining keycaps; rain-caption fix. Runs after Polish D releases the calendar and Tasks files.
- **Deploy runbook:** includes the Gmail SMTP steps and the mandatory backup.
