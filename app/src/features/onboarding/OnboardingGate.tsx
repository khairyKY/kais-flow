import { Navigate } from 'react-router'
import { useAppSettings, needsOnboarding } from './api'

// Reported for the orchestrator — App.tsx's frozen index route currently reads
// `{ index: true, element: <Navigate to="/today" replace /> }`. Swap that element for
// `<OnboardingGate />` (import from './features/onboarding/OnboardingGate') so a first-run
// account lands on /onboarding once, and every later sign-in skips straight to /today.
export function OnboardingGate() {
  const { data: settings } = useAppSettings()
  if (!settings) return null
  return <Navigate to={needsOnboarding(settings) ? '/onboarding' : '/today'} replace />
}
