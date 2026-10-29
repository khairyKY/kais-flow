# Legal review — Terms of Use + Privacy Policy (2026-10-29)

> **Not legal advice.** This is a careful privacy-professional-style review, done by an AI against the
> code and the published texts of the laws and policies cited below. It reduces risk; it does not replace
> a lawyer. "What still needs a lawyer" at the bottom is short on purpose.

Branch `claude/legal-review` (from `claude/kai-bugs-1012` @ c4a2c027). Not merged, not released, site not
deployed.

## What changed

| File | Change |
|---|---|
| `site/src/pages/info.mjs` | Privacy policy rewritten (6 → 12 sections); Terms rewritten (5 → 12 points). Same voice, same page design. |
| `supabase/functions/_shared/legal.ts` | `TERMS_VERSION` + `PRIVACY_VERSION` → `2026-10-29`; new 4-line `LEGAL_SUMMARY`. Every account sees the "We've updated our terms" card once, and the hourly sweep pushes once. |
| `app/src/features/auth/SignInPage.tsx` | Sign-up box: "…and the Privacy Policy, including my data being kept in the EU and partly handled in the US. I’m 16 or older." (starts with the old words, so the harness regexes still match). |
| `app/src/features/settings/SettingsPage.tsx` | "What we keep, and where": the AI is "Groq, in the US". |
| `app/public/privacy.html` | Regenerated (`site/tools/app-privacy.mjs`); the legal test checks the date. |
| `docs/LEGAL.md` | "For Kai to review" points to this file. |

Verification: web gate (below), `cd site && node build.mjs && node tools/check-links.mjs` → 32 pages, 1335
links, all resolve.

## Findings: requirement → status → fix → source

Status: **Fixed** (text now matches code and the requirement) · **Kai** (only Kai can do it) · **Code** (a
code change, see next section) · **N/A**.

| # | Requirement | Status | Fix | Source |
|---|---|---|---|---|
| 1 | Name the controller and a contact (GDPR Art 13(1)(a); Egypt PDPL notice; MS Store 10.5.1) | Fixed | §1 "Who looks after it": Khairy Islam Shaheen, an individual in Egypt, email | [GDPR Art 13](https://gdpr-info.eu/art-13-gdpr/) |
| 2 | Purposes + lawful basis (GDPR Art 6, 13(1)(c)) | Fixed | §3: contract for the app, switch-on for optional parts, legitimate interest for backups/abuse limits, explicit consent at sign-up for sensitive content + transfers | [GDPR Art 6](https://gdpr-info.eu/art-6-gdpr/), [Art 9(2)(a)](https://gdpr-info.eu/art-9-gdpr/) |
| 3 | Every recipient/processor named (GDPR 13(1)(e); MS Store 10.5.1 "types of parties") | Fixed | §6 list: Supabase, Groq, Cloudflare, push services, GitHub, Google Fonts, **Gmail (was undisclosed)**, connected services | code inventory; `supabase/config.toml` `[auth.email.smtp]` |
| 4 | International transfers disclosed + Egypt explicit consent to transfer | Fixed (text + sign-up box) / **Kai** (PDPC transfer licence) | §6 last paragraph; box wording; summary line 2 | [S&H Partners on the Executive Regulations](https://www.shandpartners.com/insights/briefings/telecoms-media-technology/the-issuance-of-the-executive-regulations-of-the-data-protection-law-and-the-establishment-of-the-data-protection-centre/) |
| 5 | What the AI sees must be true | Fixed / Code (C1) | Old text said "nothing else in your account goes to Groq"; chat search hits carry journal snippets + people facts (`chat/index.ts:188`, `0064`). §4 now says so, plus project names to parse, journal "Talk it out" audio, recordings not stored | code |
| 6 | Groq: no training, ZDR | Fixed (claim conditional) / **Kai** | §4: "with zero data retention switched on for our account". Groq's default is up to 30 days of logs for troubleshooting/abuse unless ZDR is on in Data Controls | [Groq: Your data](https://console.groq.com/docs/your-data) |
| 7 | AI can be wrong, can act on data | Fixed | Privacy §4 para 2; Terms 5 (not professional advice; chat acts only after confirm; Undo) | — |
| 8 | MCP / assistant keys | Fixed | §4: adds permanent deletes (`delete_person`, `delete_library_item`), maker's own policy; Terms 2 (key = password) | `mcp/tools.ts`, `0051`, `0080` |
| 9 | Google Limited Use statement + "use and transfer" wording | Fixed | §5 links the policy, adds "use and transfer", no ads, no sale, no human reading except listed cases, **no generalized AI/ML training** (Workspace API rule) | [API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), [Workspace API policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy) |
| 10 | Google: say exactly what is read, written, stored | Fixed / Code (C4) | §5: both scopes in plain words; mirror is on by default and sends titles marked private (visible to people who can edit your calendar); stored = names + times, no descriptions/places/guests | `_shared/google.ts:23,27,386-394`, `google-sync:94` |
| 11 | Google OAuth verification (sensitive scopes `calendar.readonly`, `calendar.events.owned`; no restricted scopes → no CASA) | **Kai** | Either stay in Testing (≤100 test users, 7-day refresh tokens, warning screen) or submit for verification: homepage + privacy policy on a verified domain, linked on the consent screen, scope justification + demo video | [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) |
| 12 | Retention periods (GDPR 13(2)(a); "Deletion must be real") | Fixed / Code (C3, C6) | §8 list. Corrected: paper page **text** stays until the page is deleted; activity log for the life of the account; error logs briefly; backups 14 releases | `0049:33,166`, `0053`, release.yml:104-138 |
| 13 | Data subject rights + complaint route (GDPR 15–22, 77; PDPL) | Fixed | §9: access, correct, delete, copy, object/limit, withdraw; 30 days; free; PDPC / EU-UK regulator | [GDPR Art 12(3)](https://gdpr-info.eu/art-12-gdpr/) |
| 14 | Export / portability | Fixed (honest) / Code | Export has no photo files — text now says so and offers them by email | `features/export/api.ts:15-19` |
| 15 | Deletion | Fixed | Account delete cascades every table + both photo buckets (verified: no `references auth.users` without cascade); backups catch up after 14 releases (disclosed) | `delete-account/index.ts` |
| 16 | Security description (MS Store 10.5.1 "stored and secured") | Fixed / Code (C5) | §10: HTTPS, at-rest encryption, RLS, server-side secrets | — |
| 17 | Breach notification (PDPL: PDPC 72 h, subjects 3 working days; GDPR 33/34) | Fixed (promise) / **Kai** (process) | §10 promises users 3 working days; Kai needs a one-page "if breached" note (who to email, PDPC form) | S&H Partners (above) |
| 18 | Device storage + lock screen | Fixed | §7: offline copy + outbox, chat's last 100 messages on device (`kf.chat.<uid>`), Android widgets, names off by default (`0048:15`) | code |
| 19 | Children / minimum age | Fixed | 16+ in both texts and the sign-up box; under the age of majority (21 in Egypt, Civil Code Art 44) a guardian agrees. No age check in code beyond the attestation (C13) | GDPR Art 8; PDPL ER children's consent |
| 20 | Sensitive data (journal may hold health, faith, mood) | Fixed (text + consent) / **Kai** (PDPC) | §2 para 3, §3 explicit consent; PDPL treats health/religion as sensitive: licence question for the PDPC | PDPL Art 1 definitions |
| 21 | No analytics / cookies claims | Fixed (verified true) | No tracker in app, site, or functions; site only Google Fonts + GitHub API | code inventory Q7 |
| 22 | Terms: licence grant / proprietary | Fixed | Terms 3: personal, non-transferable licence; source on GitHub is reference-only (matches `LICENSE`) | `LICENSE` |
| 23 | Terms: acceptable use, termination, service end | Fixed | Terms 6, 11 (30 days' notice + Export if Kai stops) | — |
| 24 | Terms: no warranty + limitation of liability | Fixed | Terms 8, 9: as-is; no indirect loss; cap EGP 100 "under this agreement"; carve-outs for fraud, gross fault, tort, personal harm and PDPL (Art 217(2)–(3)); consumer rights preserved; severability added | Egyptian Civil Code Art 217 ([Mondaq: liability under Egyptian law](https://www.mondaq.com/contracts-and-commercial-law/980060/liability-under-egyptian-law): tort liability cannot be capped in advance) |
| 25 | Terms: governing law, changes with re-consent | Fixed | Terms 10, 12: Egyptian law and courts, mandatory local law preserved; versioned consent unchanged | `0083_consents.sql` |
| 26 | Microsoft Store 10.5.1 privacy policy | Fixed (content) | The Store build is paused; `docs/MICROSOFT-STORE.md` points at the app's `/privacy`, regenerated here | [Store policy 10.5.1](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies) |
| 27 | Apple / Google Play | N/A | No Play listing (direct APK); iOS is a PWA, no App Store review | — |
| 28 | CCPA/CPRA | N/A | Thresholds: >$26.625M revenue, 100k+ California consumers, or 50% revenue from selling data. None met. | [CPPA thresholds](https://www.cppa.ca.gov/regulations/cpi_adjustment.html) |
| 29 | GDPR applicability + Art 27 EU representative | **Kai/lawyer** | GDPR reaches a non-EU controller offering a service to people in the EU (Art 3(2)); with a handful of friends it is arguable either way. Art 27(2) exempts occasional, low-risk processing without large-scale special data. The texts are written to GDPR standard anyway | [Art 3](https://gdpr-info.eu/art-3-gdpr/), [Art 27](https://gdpr-info.eu/art-27-gdpr/) |
| 30 | Egypt PDPL controller licence | **Kai** — deadline **1 Nov 2026** | See "What Kai must do" | S&H Partners (above) |

## Code findings (things no policy can honestly fix)

Ranked. "Disclosed" means the texts now say it honestly; the code change is still the better answer.

| # | Severity | Finding | Where | Recommended change |
|---|---|---|---|---|
| C1 | High | **Chat sends journal snippets (200 chars) and people facts to Groq by default.** Search hits feeding the chat aren't filtered; only the chat's *tools* lack journal/people. The old policy said "nothing else goes to Groq". Disclosed now. | `chat/index.ts:188`, `migrations/0064` | Drop `journal_entry` + `person` hits unless a new "Chat may read my journal / people" switch is on (default off, like the MCP switches); then shorten §4. |
| C2 | High | **Consent is bundled.** One box covers Terms + Privacy + sensitive content + transfer. GDPR Art 7(2)/9(2)(a) and the PDPL want explicit, specific consent for sensitive data and transfers; the wording now names both, but it's still one box. | `SignInPage.tsx:248`, `LegalDialogs.tsx`, `0083` | A second required, unticked box (and its own button in the update notice), recorded as its own `consents.document` (`'sensitive_transfer'`; widen the check constraint). |
| C3 | High | **Release backups hold live secrets.** `supabase db dump --data-only` includes `integrations.data` (Google refresh tokens, GitHub PATs) in a plaintext tar, for 14 releases; Disconnect and Delete account don't reach them. Disclosed. | `release.yml:104-138` | Encrypt the dump with a public key whose private half stays offline (age/gpg), or exclude `integrations` from the data dump. Add an age cap too (delete backups > 60 days on a cron), since "14 releases" is unbounded if releases stop. |
| C4 | Medium | **Google mirror is on by default** and both scopes are requested on connect, so task/block titles ("Therapy", "Jumu'ah") reach Google without a separate choice. Disclosed. Against privacy-by-default (GDPR Art 25), and Google's reviewer will ask why `events.owned` is requested up front. | `_shared/google.ts:12,68` | Treat a missing `mirror` as off; request `calendar.events.owned` only when the person turns the mirror on (incremental auth). |
| C5 | Medium | **Integration secrets readable by the user's session.** `integrations` RLS is `for all` with no column protection, so an XSS or stolen session can pull the Google refresh token and GitHub PAT over REST. Contradicts "live only on the server" in spirit. | `0004_calendar.sql:35`, `google-connect:102`, `github-connect:114` | Move tokens to a table only the service role can read (or Vault), keep `login`/calendar list where the client reads them. |
| C6 | Medium | **Names outlive deletion.** `activity_log` keeps item names (incl. `notify.*` rows with titles and people's names) after the item is purged from Trash; `embed_queue` error rows keep the text forever. Disclosed. | `notify/index.ts:97-111`, `0040:62`, `0053` | On Trash purge, scrub names from that item's log payloads and delete its `embed_queue` rows; expire error rows after 7 days. |
| C7 | Medium | **Function logs may hold user content.** Groq error bodies (which can echo `failed_generation`) are logged in full. Disclosed as "error logs… briefly". | `chat/index.ts:156`, `parse-capture/index.ts:65`, `transcribe/index.ts:56`, `capture-image/index.ts:68,140` | Log the status and Groq's error `code` only. |
| C8 | Low | **Consent records are editable by the user** (`consents_update_own`), and the checkbox wording isn't archived per version, so Kai can't later prove what was agreed to (GDPR Art 7(1)). | `0083_consents.sql` | Drop the update policy (insert with `on conflict do nothing`); keep each version's text and box label in git (it is, via `info.mjs` history) and note the commit in `legal.ts`. |
| C9 | Low | **Delete account swallows a failed Google disconnect**, so busy events and the Google grant can survive. | `features/legal/api.ts:52-57` | Tell the person and link myaccount.google.com/permissions. |
| C10 | Low | **Export has no photo files**, only their paths. Disclosed ("write to us and we'll send them"). | `features/export/api.ts:15-19` | Add the photos to the .json export as a zip, or a "Download photos" button. |
| C11 | Low | **Auth emails go through Kai's personal Gmail** (not a processor; copies sit in Sent). Disclosed. | `supabase/config.toml` `[auth.email.smtp]` | Clear Sent on a schedule and keep 2FA on; later a transactional sender with a DPA. |
| C12 | Low | VAPID contact falls back to `mailto:example@example.com`. | `notify/index.ts:45-46` | Set `VAPID_CONTACT_EMAIL`. |
| C14 | Medium (verify) | **Sign-in audit log may survive account deletion.** Supabase Auth writes `auth.audit_log_entries` (email, IP in the payload) with no FK to `auth.users`; §8 now says sign-in records last "while your account exists". | Supabase Auth | Kai: `select count(*) from auth.audit_log_entries;` If rows exist, turn off the database audit log in Auth settings, or purge by `actor_id` in `delete-account`. |
| C13 | Info | No age check beyond the sign-up attestation (now in the box). Fine for the risk level. | `SignInPage.tsx` | — |

Verified clean: no analytics/trackers anywhere; no AI provider but Groq (embeddings are Supabase's in-house gte-small); audio never stored; Google data kept out of every AI path, MCP and notifications; every user table cascades on account deletion; lock-screen names off by default; the offline cache excludes journal/people/Trash.

## Second reviewer (santa-method, agentic-council:Skeptic, 2 rounds)

Round 1 raised 17 items. Applied to the text: narrowed §3 consent and an honest withdrawal clause, the chat's
daily summary + journal/people lines disclosed, the summary shown to existing users names them, Groq wording
made conditional on the account setting, log names and Gmail copies disclosed, sign-in data + search index
in §2, the cap scoped to "this agreement" with tort/personal-harm/PDPL carve-outs, age of majority 21,
courts + severability clauses, "no sharing beyond the list". Code items became C1–C12.
Round 2: everything applied held; five wordings still over-claimed (§5 aside, "commit" → "say in their
terms", "only on the server" → "never sent to the app", should/must, "where you ask") — all fixed — and C14.
On the single sign-up box the reviewer's verdict: **acceptable as an interim** because it now names both
sensitive content and the EU/US handling (defensible under the PDPL as an affirmative written act, Law
15/2004 e-signature); **weak under GDPR Art 7(2)** — C2's two-box split is the fix (~10 lines; the first-run
and legal harnesses then tick both).

## What still needs a lawyer (short)

1. **Egypt PDPL, applied to a natural person running a free app**: does Kai need a controller licence, a
   cross-border transfer licence/permit, and a sensitive-data licence, and is a checkbox "explicit written
   consent" under the Executive Regulations? One hour with an Egyptian data-protection lawyer settles it.
2. **The EGP 100 cap and the waivers** against Egyptian consumer protection law (Law 181 of 2018), Civil Code
   Art 217(3) (tort liability can't be capped in advance) and Art 44/111 (users 16–20 are minors in Egypt, so
   their acceptance is voidable). The text carves these out; a lawyer should confirm it holds.
3. Whether the texts need an **Arabic** version for Egyptian users.

## What Kai must do himself

1. **Egypt PDPC — before 1 Nov 2026 (three days).** The Executive Regulations (PM Decree 816/2025) gave
   existing controllers until 1 Nov 2026. Processors of ≤100,000 records are exempt from the fee, not the
   licence. Ask the PDPC (or a lawyer) whether a natural person distributing a free app needs the controller
   licence and the cross-border permit, and apply if so.
2. **Groq Data Controls → Zero Data Retention: ON**, and keep a dated screenshot (add its date to
   `docs/LEGAL.md`). Check it covers the Whisper and vision models too. The policy's claim is true only while
   it is on (console.groq.com/settings/data-controls).
2b. **Accept the processor terms**: Supabase DPA (dashboard → Legal) and confirm Groq's Customer DPA covers
   your self-serve account. Only then may §6 name the EU Standard Contractual Clauses as the safeguard.
2c. **Gmail**: 2FA on the sending account; clear its Sent folder of auth emails on a schedule (§6 says so).
3. **Google OAuth**: stay in Testing with named testers, or verify (homepage + this privacy URL on a
   domain you've verified in Search Console, consent screen links, scope justifications, demo video).
   `workers.dev` is on the Public Suffix List, so `kaidagoat.workers.dev` can be an authorized domain (verify it
   with an HTML-file or meta-tag property). Reviewers often reject a sign-in screen as the "homepage": the
   app's /privacy is fine, but the explainer site is on a different account's subdomain, so a custom domain
   for both is the clean fix.
4. **Set `VAPID_CONTACT_EMAIL`** in the function secrets if it isn't (code falls back to example@example.com).
5. **Next release**: add a line to `site/src/releases.json` ("Privacy and Terms rewritten…"); the texts
   promise Field notes says what moved. Then redeploy the site (`cd site && npx wrangler deploy`).
6. A one-page **breach plan** in `_claude-cloud` (who to tell, PDPC within 72 h, users within 3 working days).

## Gate

Web gate (`gate.ps1`) after the last edit: vitest 190 files / 2680 tests green in Africa/Cairo, UTC,
America/Los_Angeles, Asia/Tokyo · lint exit 0 · build exit 0 · ds-check 0 new. Site: `node build.mjs` 32 pages,
`check-links` all resolve, `app-privacy.mjs` regenerated (the legal test checks its date). Harness note: the
first-run and legal verify scripts match the box by its opening words, which are unchanged. Not deployed.
