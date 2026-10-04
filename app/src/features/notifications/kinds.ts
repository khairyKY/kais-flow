import type { IconName } from '../../components/icons/kf'

// How each notification kind looks inside the app — Settings → Notifications (12i) and the history
// on Activity (12j) — so a missed one looks like the one that arrived. The words are notify/copy.ts.

export type KindId = 'task_reminder' | 'morning_digest' | 'evening_nudge' | 'focus_done'

export interface KindLook {
  label: string
  /** The Android channel it will use (12f) — a label until push reaches the APK. */
  channel: string
  /** Silent by default (12k): the digest. */
  silent: boolean
  icon: IconName
  tint: string
  ink: string
}

export const KIND_LOOK: Record<KindId, KindLook> = {
  task_reminder: { label: 'Task reminder', channel: 'Reminders', silent: false, icon: 'remind', tint: 'color-mix(in oklch, var(--acc-blossom) 30%, transparent)', ink: 'var(--acc-terra)' },
  morning_digest: { label: 'Morning digest', channel: 'Rituals', silent: true, icon: 'sprout', tint: 'color-mix(in oklch, var(--acc-sage) 30%, transparent)', ink: 'var(--acc-sage-text)' },
  evening_nudge: { label: 'Evening nudge', channel: 'Rituals', silent: false, icon: 'moon', tint: 'color-mix(in oklch, var(--acc-lavender) 30%, transparent)', ink: 'var(--acc-lavender-deep)' },
  focus_done: { label: 'Focus done', channel: 'Focus', silent: false, icon: 'focus-ring', tint: 'color-mix(in oklch, var(--acc-sage) 22%, transparent)', ink: 'var(--acc-sage-text)' },
}

export const KIND_IDS = Object.keys(KIND_LOOK) as KindId[]
