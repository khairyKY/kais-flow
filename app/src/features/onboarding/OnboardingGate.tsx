import { Navigate } from 'react-router'
import { useAppSettings, needsOnboarding } from './api'

// Reported for the orchestrator — App.tsx's frozen index route currently reads
// `{ index: true, element: <Navigate to="/today" replace /> }`. Swap that element for
// `<OnboardingGate />` (import from './features/onboarding/OnboardingGate') so a first-run
// account lands on /onboarding once, and every later sign-in skips straight to /today.
export function OnboardingGate() {
  const { data: settings, isLoading } = useAppSettings()
  // Punch 2: `!settings` alone also matched the ERROR case (the query rethrows), so a flaky
  // first sign-in left "/" permanently blank with no message and no way forward. Only wait
  // while genuinely loading; otherwise fall through to Today, which handles empty data fine.
  if (isLoading) return null
  return <Navigate to={settings && needsOnboarding(settings) ? '/onboarding' : '/today'} replace />
}
