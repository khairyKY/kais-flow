import type { Notice } from '../../../../supabase/functions/notify/copy.ts'
import { queryClient } from '../../lib/queryClient'
import type { AppSettings } from '../../lib/types'

// Notification sound packs (Kai 2026-10-26: "include all of them and keep them separated, each in its
// pack"). Three packs, each with a sound for all ten kinds: WAV files made by
// design-export/notification-sounds/make.mjs into public/notification-sounds/<pack>/<sound>.wav.
//
// Chosen apart from the app's own sounds (lib/sounds.ts, Settings → Sound): those are synthesised per
// device (kalimba / felt / glass, with this device's volume); these are files, and the pick is synced
// on the settings row (app_settings.notification_sound_pack, 0088) because the Android app needs it
// when it plans a week of alarms, and a notification should sound the same on every device.
//
// Where they play: Android — each pack × sound is its own channel with the WAV from res/raw
// (android.ts). Windows — the toast goes out silent and the app plays the WAV (local.ts). Web — the
// app plays it when a window is open (local.ts; sw-push.js asks an open window first); otherwise the
// browser's own sound.

export const NOTIFY_SOUNDS = ['task_reminder', 'event_reminder', 'snoozed_again', 'focus_end', 'break_end', 'morning_digest', 'evening_nudge', 'paper_ready', 'terms', 'sync_problem'] as const
export type NotifySound = (typeof NOTIFY_SOUNDS)[number]
export const NOTIFY_PACKS = ['felt', 'glass', 'mixed'] as const
export type NotifyPack = (typeof NOTIFY_PACKS)[number]
export const DEFAULT_NOTIFY_PACK: NotifyPack = 'felt' // the app's own sounds are Felt too (Kai 2026-10-07)

export const NOTIFY_PACK_LOOK: Record<NotifyPack, { label: string; blurb: string }> = {
  felt: { label: 'Felt', blurb: 'muted felt piano, warm and low' },
  glass: { label: 'Glass', blurb: 'soft glass bells, airy' },
  mixed: { label: 'Mixed', blurb: 'felt and glass together, more chords' },
}

export const NOTIFY_SOUND_LABEL: Record<NotifySound, string> = {
  task_reminder: 'Task reminder',
  event_reminder: 'Event starting',
  snoozed_again: 'Snoozed reminder, again',
  focus_end: 'Focus round end',
  break_end: 'Break end',
  morning_digest: 'Morning digest',
  evening_nudge: 'Evening nudge',
  paper_ready: 'Page read',
  terms: 'Terms changed',
  sync_problem: 'Sync problem',
}

/** Which of the pack's sounds a notice gets. Routines ring like a task reminder, a birthday like an
 * event, the test like a reminder. ponytail: break_end has no notice of its own yet — the sound is in
 * every pack for when the focus timer sends one. */
export function soundOf(n: Pick<Notice, 'kind' | 'again'>): NotifySound {
  switch (n.kind) {
    case 'task_reminder':
      return n.again ? 'snoozed_again' : 'task_reminder'
    case 'event_reminder':
    case 'birthday':
      return 'event_reminder'
    case 'focus_done':
      return 'focus_end'
    case 'morning_digest':
    case 'evening_nudge':
    case 'paper_ready':
    case 'terms':
    case 'sync_problem':
      return n.kind
    default: // routine, test
      return 'task_reminder'
  }
}

export function parseNotifyPack(raw: unknown): NotifyPack {
  return (NOTIFY_PACKS as readonly unknown[]).includes(raw) ? (raw as NotifyPack) : DEFAULT_NOTIFY_PACK
}

/** The synced pick, as this device last read it. */
export function notifyPack(): NotifyPack {
  return parseNotifyPack(queryClient.getQueryData<AppSettings>(['app_settings'])?.notification_sound_pack)
}

/** The res/raw name (no extension) the Android build copies each WAV to — and its channel id. */
export const soundName = (pack: NotifyPack, sound: NotifySound) => `kf_${pack}_${sound}`
export const soundUrl = (pack: NotifyPack, sound: NotifySound) => `/notification-sounds/${pack}/${sound}.wav`

/** The one thing that plays a notification sound. An object so the browser harness can swap `play`
 * and record what played (docs/log/assets/notif-sounds/verify.mjs). Resolves true once it's playing;
 * false when it can't (no gesture yet in this window, no audio) — the caller lets the system's sound
 * play instead. */
export const notifyPlayer = {
  play(url: string): Promise<boolean> {
    try {
      return new Audio(url).play().then(
        () => true,
        () => false,
      )
    } catch {
      return Promise.resolve(false)
    }
  },
}

let lastAt = 0
/** The pack's sound for `n`, played by the app. Silent notices (quiet hours, the digest…) play nothing.
 * ponytail: one per second — several notices due together are one sound, not a chord. */
export async function playNotice(n: Pick<Notice, 'kind' | 'again' | 'silent'>): Promise<boolean> {
  if (n.silent) return false
  const now = Date.now()
  if (now - lastAt < 1000) return true // the one just played covers it
  lastAt = now
  const ok = await notifyPlayer.play(soundUrl(notifyPack(), soundOf(n)))
  if (!ok) lastAt = 0
  return ok
}

/** Settings' ▶ — any pack, any sound, whatever the switches say. */
export function previewNotifySound(pack: NotifyPack, sound: NotifySound): void {
  void notifyPlayer.play(soundUrl(pack, sound))
}
