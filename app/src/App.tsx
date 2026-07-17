import { lazy } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, idbPersister } from './lib/queryClient'
import { AuthProvider } from './features/auth/AuthProvider'
import { RequireAuth } from './features/auth/RequireAuth'
import { SignInPage } from './features/auth/SignInPage'
import { AppLayout } from './components/AppLayout'
import { Stub } from './components/Stub'
import { KitReference } from './components/KitReference'

// Route-level code splitting — each page is its own chunk, loaded on demand.
// Keeps the heavy pages (FullCalendar, rrule, chrono) out of the initial bundle.
// AppLayout + SignInPage stay eager: the shell and entry are needed immediately.
const TodayPage = lazy(() => import('./features/today/TodayPage').then((m) => ({ default: m.TodayPage })))
const InboxPage = lazy(() => import('./features/inbox/InboxPage').then((m) => ({ default: m.InboxPage })))
const TasksPage = lazy(() => import('./features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })))
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const PlanningBoard = lazy(() => import('./features/calendar/PlanningBoard').then((m) => ({ default: m.PlanningBoard })))
const TaskEditorPage = lazy(() => import('./features/calendar/TaskEditorPage').then((m) => ({ default: m.TaskEditorPage })))
const RoutinesPage = lazy(() => import('./features/routines/RoutinesPage').then((m) => ({ default: m.RoutinesPage })))
const WeeklyReviewPage = lazy(() => import('./features/rituals/WeeklyReviewPage').then((m) => ({ default: m.WeeklyReviewPage })))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const NotificationsPage = lazy(() => import('./components/Stub').then((m) => ({ default: () => <m.Stub name="Notifications" /> })))
const SearchPage = lazy(() => import('./features/search/SearchPage').then((m) => ({ default: m.SearchPage })))
const QuickCapturePage = lazy(() => import('./features/capture/QuickCapturePage').then((m) => ({ default: m.QuickCapturePage })))
const ProjectsPage = lazy(() => import('./features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const ProjectDetailPage = lazy(() => import('./features/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })))
const PerennialsPage = lazy(() => import('./features/projects/PerennialsPage').then((m) => ({ default: m.PerennialsPage })))
const JournalPage = lazy(() => import('./features/journal/JournalPage').then((m) => ({ default: m.JournalPage })))
const LibraryPage = lazy(() => import('./features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })))


const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/design-system', element: <KitReference /> }, // §04 kit reference (no auth)
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
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
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'capture', element: <QuickCapturePage /> },
      // New surfaces (Wave 2) — stubbed so the shell nav resolves; each wave swaps its element.
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'journal', element: <JournalPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'people', element: <Stub name="People" /> },
      { path: 'people/:id', element: <Stub name="Person" /> },
      { path: 'activity', element: <Stub name="Activity" /> },
      { path: 'herbarium', element: <Stub name="Herbarium" /> },
      { path: 'focus', element: <Stub name="Focus" /> },
      { path: 'seasons', element: <Stub name="Seasons" /> },
      { path: 'trash', element: <Stub name="Trash" /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'perennials', element: <PerennialsPage /> },
    ],
  },
  { path: '/onboarding', element: <Stub name="Onboarding" /> },
])

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
