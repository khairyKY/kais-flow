import { useAppSettings, updateAppSetting } from '../../lib/settings'
import { logActivity } from '../../lib/activity'
import { createTask, toggleTop3 } from '../tasks/api'
import { isTop3Today } from '../tasks/top3Rule'
import type { FirstThing } from './firstThings'

// Re-exported so the page doesn't reach into lib/settings.ts directly for its one read.
export { useAppSettings }

/** First-run gate: unset onboarded_at means the account has never finished onboarding. */
export function needsOnboarding(settings: { onboarded_at: string | null } | undefined): boolean {
  return !!settings && settings.onboarded_at === null
}

/** Start (9h), Skip or Import: the name if one was typed, and each of today's lines as a Top 3 task.
 * A line for another day keeps the day it says ("…tomorrow 3pm" stays tomorrow 15:00, as its chip
 * showed): Top 3 is today's, and starring a later task would pull it to today (tasks/top3Rule). */
export function completeOnboarding(name: string, things: readonly FirstThing[] = [], now: Date = new Date()): void {
  if (name.trim()) updateAppSetting('display_name', name.trim())
  for (const t of things) {
    const task = createTask(t)
    if (isTop3Today({ ...task, top3: true }, now)) toggleTop3(task)
  }
  updateAppSetting('onboarded_at', new Date().toISOString())
  logActivity('onboarding.completed', 'app_settings', crypto.randomUUID(), { name: name.trim() || null, things: things.length })
}
