import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, RouterProvider, useMatches, type RouteObject } from 'react-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, idbPersister } from './lib/queryClient'
import { AuthProvider, useAuth } from './features/auth/AuthProvider'
import { RequireAuth } from './features/auth/RequireAuth'
import { SignInPage } from './features/auth/SignInPage'
import { AppLayout } from './components/AppLayout'
import { KitReference } from './components/KitReference'
import { NotFoundPage, RouteErrorPage } from './components/RouteErrorPage'
import { isCapacitorShell } from './lib/platform'

// Route-level code splitting — each page is its own chunk, loaded on demand.
// Keeps the heavy pages (FullCalendar, rrule, chrono) out of the initial bundle.
// AppLayout + SignInPage stay eager: the shell and entry are needed immediately.
// M1b: every page chunk is then fetched in the background once the first screen is up (below), so
// switching tabs never shows the blank fallback while a chunk downloads and parses.
const pageLoaders: (() => Promise<unknown>)[] = []
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  pageLoaders.push(load)
  return lazy(() => load().then((m) => ({ default: m[name] })))
}
const TodayPage = page(() => import('./features/today/TodayPage'), 'TodayPage')
const InboxPage = page(() => import('./features/inbox/InboxPage'), 'InboxPage')
const TasksPage = page(() => import('./features/tasks/TasksPage'), 'TasksPage')
const CalendarPage = page(() => import('./features/calendar/CalendarPage'), 'CalendarPage')
const PlanningBoard = page(() => import('./features/calendar/PlanningBoard'), 'PlanningBoard')
const TaskEditorPage = page(() => import('./features/calendar/TaskEditorPage'), 'TaskEditorPage')
const RoutinesPage = page(() => import('./features/routines/RoutinesPage'), 'RoutinesPage')
const WeeklyReviewPage = page(() => import('./features/rituals/WeeklyReviewPage'), 'WeeklyReviewPage')
const SettingsPage = page(() => import('./features/settings/SettingsPage'), 'SettingsPage')
// [K-26] punch 65: the Notifications feed is cut from v1 — Activity is the ledger. Route removed.
const SearchPage = page(() => import('./features/search/SearchPage'), 'SearchPage')
const SharePage = page(() => import('./features/capture/SharePage'), 'SharePage')
const ProjectsPage = page(() => import('./features/projects/ProjectsPage'), 'ProjectsPage')
const ProjectDetailPage = page(() => import('./features/projects/ProjectDetailPage'), 'ProjectDetailPage')
const PerennialsPage = page(() => import('./features/projects/PerennialsPage'), 'PerennialsPage')
const JournalPage = page(() => import('./features/journal/JournalPage'), 'JournalPage')
const LibraryPage = page(() => import('./features/library/LibraryPage'), 'LibraryPage')
const FocusPage = page(() => import('./features/focus/FocusPage'), 'FocusPage')
const ActivityPage = page(() => import('./features/activity/ActivityPage'), 'ActivityPage')
const HerbariumPage = page(() => import('./features/herbarium/HerbariumPage'), 'HerbariumPage')
const TrashPage = page(() => import('./features/trash/TrashPage'), 'TrashPage')
const PeoplePage = page(() => import('./features/people/PeoplePage'), 'PeoplePage')
const PersonDetailPage = page(() => import('./features/people/PersonDetailPage'), 'PersonDetailPage')
const OnboardingPage = page(() => import('./features/onboarding/OnboardingPage'), 'OnboardingPage')
const OnboardingGate = page(() => import('./features/onboarding/OnboardingGate'), 'OnboardingGate')
const ImportPage = page(() => import('./features/import/ImportPage'), 'ImportPage')
// J-11: public, outside RequireAuth/OnboardingGate so a recovery session isn't bounced to /today.
const ResetPage = page(() => import('./features/auth/ResetPage'), 'ResetPage')
// Not a page: the phone task sheet AppLayout lazy-loads. Warmed with the pages so the first tap opens it at once.
pageLoaders.push(() => import('./features/tasks/TaskSheet'))

// Punch 65: design galleries are for building, not for using — the W8 quick-capture phone mock
// (/capture: a fake lock screen and keyboard), the season-state sheet (/seasons: "Good morning,
// Kai" on sample dates) and the §04 kit reference (/design-system, no auth). Only the dev server
// registers them. A production build never calls this, so the routes and their code are dropped
// and those addresses reach the not-found page. (/share, the real share target, is not a gallery.)
function designGalleryRoutes(): { public: RouteObject[]; shell: RouteObject[] } {
  const QuickCapturePage = lazy(() => import('./features/capture/QuickCapturePage').then((m) => ({ default: m.QuickCapturePage })))
  const SeasonsPage = lazy(() => import('./features/seasons/SeasonsPage').then((m) => ({ default: m.SeasonsPage })))
  return {
    public: [{ path: '/design-system', element: <KitReference />, errorElement: <RouteErrorPage bare /> }],
    shell: [
      { path: 'capture', element: <QuickCapturePage /> },
      { path: 'seasons', element: <SeasonsPage /> },
    ],
  }
}
const galleries = import.meta.env.DEV ? designGalleryRoutes() : { public: [], shell: [] }

// The `*` catch-all's route id — Shell looks for it to tell an unknown address apart.
const NOT_FOUND = 'not-found'

// The signed-in app shell. Signed out, every known page still goes to sign-in (RequireAuth),
// but an unknown address says so plainly instead of bouncing to the sign-in form.
function Shell() {
  const { session, loading } = useAuth()
  const unknownAddress = useMatches().some((m) => m.id === NOT_FOUND)
  if (unknownAddress && !loading && !session) return <NotFoundPage bare />
  return (
    <RequireAuth>
      <AppLayout />
    </RequireAuth>
  )
}

// errorElement (Polish A): no route may fall through to React Router's developer screen.
// The top-level routes get the bare page (a crash there takes the shell with it); inside the
// shell, the pathless route below catches a crashing page so the sidebar stays usable.
const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage />, errorElement: <RouteErrorPage bare /> },
  { path: '/reset', element: <ResetPage />, errorElement: <RouteErrorPage bare /> },
  ...galleries.public,
  {
    path: '/',
    element: <Shell />,
    errorElement: <RouteErrorPage bare />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <OnboardingGate /> },
          // Built surfaces (reskin waves W1–W8)
          { path: 'today', element: <TodayPage /> },
          { path: 'inbox', element: <InboxPage /> },
          { path: 'tasks', element: <TasksPage /> },
          { path: 'tasks/:id', element: <TaskEditorPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'planning', element: <PlanningBoard /> },
          { path: 'routines', element: <RoutinesPage /> },
          { path: 'weekly-review', element: <WeeklyReviewPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'settings/import', element: <ImportPage /> },
          // PWA share-target lands here (manifest share_target -> /share)
          { path: 'share', element: <SharePage /> },
          // New surfaces (Wave 2) — stubbed so the shell nav resolves; each wave swaps its element.
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/:id', element: <ProjectDetailPage /> },
          { path: 'journal', element: <JournalPage /> },
          { path: 'library', element: <LibraryPage /> },
          { path: 'people', element: <PeoplePage /> },
          { path: 'people/:id', element: <PersonDetailPage /> },
          { path: 'activity', element: <ActivityPage /> },
          { path: 'herbarium', element: <HerbariumPage /> },
          { path: 'focus', element: <FocusPage /> },
          { path: 'trash', element: <TrashPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'perennials', element: <PerennialsPage /> },
          ...galleries.shell,
          { id: NOT_FOUND, path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  {
    path: '/onboarding',
    element: (
      <RequireAuth>
        <OnboardingPage />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage bare />,
  },
])

if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1000))
  const preload = () => idle(() => pageLoaders.forEach((load) => void load().catch(() => {}))) // offline or a stale deploy: the page loads on demand later
  if (document.readyState === 'complete') preload()
  else window.addEventListener('load', preload, { once: true })
}

// M1b: Android Back (lib/androidBack.ts) — only the Capacitor shell has one.
if (isCapacitorShell()) void import('./lib/androidBack').then((m) => m.installAndroidBack(() => void router.navigate('/today', { replace: true })))
// The Android share sheet: MainActivity.onNewIntent hands an open page `/share?text&title` here, so a
// share navigates in place instead of reloading the app. `true` tells the shell it was handled.
if (isCapacitorShell()) Object.assign(window, { kaisFlowOpen: (path: string) => (void router.navigate(path), true) })

function App() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: idbPersister }}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}

export default App
