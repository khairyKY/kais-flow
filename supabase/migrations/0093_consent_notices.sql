-- Informational policy updates (consent-fix 2026-11-06): a policy text can change without asking anyone to
-- agree again (legal.ts LEGAL_NOTES). The app shows a one-line "Privacy policy updated" notice once per
-- account; dismissing it is one insert-only `consents` row, so it syncs to every device like an agreement
-- does: document `<doc>_notice`, version = the note's day. It is an acknowledgement, never an agreement:
-- terms_notice_targets and the app's "outdated" check only look at 'terms' / 'privacy'.

alter table consents drop constraint if exists consents_document_check;
alter table consents add constraint consents_document_check
  check (document in ('terms', 'privacy', 'terms_notice', 'privacy_notice'));
