import { useAppSettings, updateAppSetting } from '../../lib/settings'
import { logActivity } from '../../lib/activity'

// Re-exported so the page doesn't reach into lib/settings.ts directly for its one read.
export { useAppSettings }

export interface OnboardingAnswers {
  name: string
  workspaceName: string
  seedAvatar: string
}

/** First-run gate: unset onboarded_at means the account has never finished onboarding. */
export function needsOnboarding(settings: { onboarded_at: string | null } | undefined): boolean {
  return !!settings && settings.onboarded_at === null
}

export function completeOnboarding(answers: OnboardingAnswers): void {
  updateAppSetting('display_name', answers.name.trim() || null)
  updateAppSetting('workspace_name', answers.workspaceName.trim() || 'Personal')
  updateAppSetting('seed_avatar', answers.seedAvatar)
  updateAppSetting('onboarded_at', new Date().toISOString())
  logActivity('onboarding.completed', 'app_settings', crypto.randomUUID(), { ...answers })
}
