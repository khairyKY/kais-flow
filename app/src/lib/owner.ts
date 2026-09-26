// Who the app belongs to, as the shell says it. Onboarding promises "type it, and the whole app
// takes your name" (Onboarding.dc.html 1b) and a workspace that "shows up quietly at the top of
// every page" (1c); these two helpers are that promise, shared by onboarding's live preview and
// the shell so they can never disagree.
//
// Unset answers fall back to the look every screen had before (Kai's own account has none): the
// product name "Kai's Flow" and the workspace "Personal" (the app_settings column default).

export const DEFAULT_FLOW_NAME = "Kai's Flow"
export const DEFAULT_WORKSPACE = 'Personal'

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/** "Mira" → "Mira's Flow"; unset or blank → "Kai's Flow". */
export function flowName(displayName: string | null | undefined): string {
  const name = clean(displayName)
  return name ? `${name}'s Flow` : DEFAULT_FLOW_NAME
}

/** The workspace line's name; unset or blank → "Personal". */
export function workspaceName(value: string | null | undefined): string {
  return clean(value) || DEFAULT_WORKSPACE
}
