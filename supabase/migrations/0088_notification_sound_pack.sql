-- Migration: 0088_notification_sound_pack.sql
-- Notification sound packs (Kai 2026-10-26: "include all of them and keep them separated, each in its
-- pack"). Which pack's sounds the notifications play — Felt (the default), Glass or Mixed — on the
-- settings row like the other notification settings, so every device rings the same and the Android app
-- has it when it plans the week's alarms (each pack × kind is its own channel there). Read through
-- app/src/features/notifications/sounds.ts notifyPack; an absent or unknown value reads as Felt.
-- Additive and idempotent — every step can re-run.
alter table app_settings add column if not exists notification_sound_pack text not null default 'felt';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_settings_notification_sound_pack_known') then
    alter table app_settings add constraint app_settings_notification_sound_pack_known check (notification_sound_pack in ('felt', 'glass', 'mixed'));
  end if;
end $$;
