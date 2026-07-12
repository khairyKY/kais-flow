import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, idbPersister } from './lib/queryClient'
import { AuthProvider } from './features/auth/AuthProvider'
import { RequireAuth } from './features/auth/RequireAuth'
import { SignInPage } from './features/auth/SignInPage'
import { AppLayout } from './components/AppLayout'
import { TodayPage } from './features/today/TodayPage'
import { InboxPage } from './features/inbox/InboxPage'
import { TasksPage } from './features/tasks/TasksPage'
import { CalendarPage } from './features/calendar/CalendarPage'
import { PlanningBoard } from './features/calendar/PlanningBoard'
import { RoutinesPage } from './features/routines/RoutinesPage'
import { WeeklyReviewPage } from './features/rituals/WeeklyReviewPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { NotificationsPage } from './features/notifications/NotificationsPage'

const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: <TodayPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'planning', element: <PlanningBoard /> },
      { path: 'routines', element: <RoutinesPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'weekly-review', element: <WeeklyReviewPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
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
