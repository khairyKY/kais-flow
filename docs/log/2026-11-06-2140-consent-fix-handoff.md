# consent-fix handoff (2026-11-06)

Kai accepted the Terms 3 times on the web, same account, after accepting on the desktop. Branch `claude/consent-fix` (from kai-bugs-1012). Not merged, not released.

## Root cause
The "We've updated our terms" card was driven by a saved copy of the `consents` answer. `['consents']` was written to the IndexedDB read cache, so a device that last loaded before the desktop agreed restored "not agreed" at start and opened the blocking card from it until the fresh answer landed (and a slow or failed fetch kept it). Each tap on I agree then wrote another row (random ids). Reproduced on the mock with two fresh devices on one fake server (harness B2 failed before the fix).
Ruled out by reading + harness: the outbox insert-and-ignore (rows land, one per document), the two-box split (both documents are written), version strings, RLS on select, auth timing (the consents query only runs under RequireAuth).

## Fix
- `consents` is never persisted (`UNPERSISTED_QUERY_ROOTS`; old snapshots are filtered on restore too) and is `staleTime: 0`, so it is asked on mount and on focus; the card waits for this session's answer.
- `agreeToCurrent` writes only what the cache still says is owed.

## Informational notice (general mechanism)
- `supabase/functions/_shared/legal.ts`: `LEGAL_NOTES` (day, document, one line), `unseenNotes`, `noticeDoc`. Versions (`TERMS_VERSION` / `PRIVACY_VERSION`) stay the material ones and still require agreeing; notes only notify. Added the Google Calendar editing note (2026-11-03).
- `LegalNoteHost` (LegalDialogs.tsx, mounted beside TermsNoticeHost): "Privacy policy updated. <line> Read it | Got it". Only for accounts made before the note, never while an agreement is owed.
- Got it = one insert-only `consents` row (`privacy_notice`, version = note day), so it syncs to every device. Migration `0093_consent_notices.sql` widens the document check. docs/DATA_MODEL.md and docs/LEGAL.md updated.

## Checks
- Gate green (vitest x4 zones 2841/2841, lint, build, ds:check 0 new). birthday_on 1/1.
- New: `legal.test.ts` (notes), `api.test.ts` (agreeToCurrent guard, dismissNote), `queryClient.test.ts` roots.
- Harness `docs/log/assets/consent-fix/verify.mjs` (11/11): A one acceptance per account on every device, B stale saved copy, C one card at a time, N notice once per account and synced. Existing `assets/legal/verify.mjs` 167/167.
- Rehearsal run 42279609754 green (0093 applied). `deno check` notify clean.

## Left over / notes
- Deploy order: 0093 must be live before the client that writes `privacy_notice` (release does migrations first); an early client would park that one write with a toast.
- The site's "Privacy policy - updated" line and the Settings "Updated" date still read PRIVACY_VERSION (29 Oct); informational notes do not move them.
- The notice is not pushed outside the app (notify only sweeps material versions).
