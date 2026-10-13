import type { IconName } from '../../components/icons/kf'

// How each notification kind looks inside the app — Settings → Notifications (12i) and the history
// on Activity (12j) — so a missed one looks like the one that arrived. The words are notify/copy.ts.

export type KindId = 'task_reminder' | 'event_reminder' | 'routine' | 'morning_digest' | 'evening_nudge' | 'focus_done' | 'paper_ready' | 'birthday' | 'sync_problem'

export interface KindLook {
  label: string
  /** The Android channel it will use (12f) — a label until push reaches the APK. */
  channel: string
  /** Silent by default (12k): the digest, captures, birthdays, sync. */
  silent: boolean
  icon: IconName
  tint: string
  ink: string
}

export const KIND_LOOK: Record<KindId, KindLook> = {
  task_reminder: { label: 'Task reminder', channel: 'Reminders', silent: false, icon: 'remind', tint: 'color-mix(in oklch, var(--acc-blossom) 30%, transparent)', ink: 'var(--acc-terra)' },
  // Event reminders (0077, A12): the event menu's Remind row, minutes before each start.
  event_reminder: { label: 'Event reminder', channel: 'Reminders', silent: false, icon: 'calendar', tint: 'color-mix(in oklch, var(--acc-blossom) 30%, transparent)', ink: 'var(--acc-blossom-text)' },
  // Routine reminders (0062): the New Routine form's Reminder, at its time on the routine's days.
  routine: { label: 'Routine reminder', channel: 'Reminders', silent: false, icon: 'routines', tint: 'color-mix(in oklch, var(--acc-clover) 30%, transparent)', ink: 'var(--acc-clover-text)' },
  morning_digest: { label: 'Morning digest', channel: 'Rituals', silent: true, icon: 'sprout', tint: 'color-mix(in oklch, var(--acc-sage) 30%, transparent)', ink: 'var(--acc-sage-text)' },
  evening_nudge: { label: 'Evening nudge', channel: 'Rituals', silent: false, icon: 'moon', tint: 'color-mix(in oklch, var(--acc-lavender) 30%, transparent)', ink: 'var(--acc-lavender-deep)' },
  focus_done: { label: 'Focus done', channel: 'Focus', silent: false, icon: 'focus-ring', tint: 'color-mix(in oklch, var(--acc-sage) 22%, transparent)', ink: 'var(--acc-sage-text)' },
  // The three 12k drew and nobody built until 2026-10-12 — glyph and disc as drawn (12i/12j/12k).
  paper_ready: { label: 'Paper capture ready', channel: 'Captures', silent: true, icon: 'camera', tint: 'var(--block-hydrangea)', ink: 'var(--acc-hydrangea-deep)' },
  birthday: { label: 'Birthday', channel: 'People', silent: true, icon: 'people', tint: 'var(--block-blossom)', ink: 'var(--acc-blossom-text)' },
  sync_problem: { label: 'Sync problem', channel: 'Sync', silent: true, icon: 'offline', tint: 'var(--block-hydrangea)', ink: 'var(--acc-hydrangea-deep)' },
}

export const KIND_IDS = Object.keys(KIND_LOOK) as KindId[]
