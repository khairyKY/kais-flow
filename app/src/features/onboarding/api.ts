import { useAppSettings, updateAppSetting } from '../../lib/settings'
import { logActivity } from '../../lib/activity'
import { createTask, toggleTop3 } from '../tasks/api'
import type { FirstThing } from './firstThings'

// Re-exported so the page doesn't reach into lib/settings.ts directly for its one read.
export { useAppSettings }

/** First-run gate: unset onboarded_at means the account has never finished onboarding. */
export function needsOnboarding(settings: { onboarded_at: string | null } | undefined): boolean {
  return !!settings && settings.onboarded_at === null
}

/** Start (9h), Skip or Import: the name if one was typed, and each line as a Top 3 task. */
export function completeOnboarding(name: string, things: readonly FirstThing[] = []): void {
  if (name.trim()) updateAppSetting('display_name', name.trim())
  for (const t of things) toggleTop3(createTask({ title: t.title, dueAt: t.dueAt, durationMin: t.durationMin, priority: t.priority, labels: t.labels }))
  updateAppSetting('onboarded_at', new Date().toISOString())
  logActivity('onboarding.completed', 'app_settings', crypto.randomUUID(), { name: name.trim() || null, things: things.length })
}
