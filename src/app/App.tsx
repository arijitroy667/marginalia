import { useSyncExternalStore } from 'react';
import { createBrowserRouter, matchPath, RouterProvider } from 'react-router';
import { initAuth } from '../core/auth';
import { AuthGate } from '../features/auth/AuthGate';
import { AuthConfirmPage, LoginPage } from '../features/auth/LoginPage';
import { LibraryPage } from '../features/library/LibraryPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SyncIssuesPage } from '../features/sync/SyncIssuesPage';
import { useTheme } from '../features/theme/useTheme';
import { Toaster } from '../shared/ui/toast';
import { ErrorScreen } from './ErrorScreen';
import { Shell } from './Shell';
import { UpdatePrompt } from './UpdatePrompt';

initAuth(); // restore the session and follow sign-in/out (no-op in local-only mode)

const router = createBrowserRouter([
  {
    errorElement: <ErrorScreen />,
    children: [
      {
        element: <AuthGate />, // needs a session when a Supabase project is configured (T-103)
        children: [
          {
            element: <Shell />,
            children: [
              { path: '/', element: <LibraryPage /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '/sync-issues', element: <SyncIssuesPage /> },
            ],
          },
          // reader + PDF.js load on demand (NFR-PERF-08)
          {
            path: '/read/:documentId',
            lazy: async () => ({ Component: (await import('../features/reader/ReaderPage')).ReaderPage }),
          },
        ],
      },
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/confirm', element: <AuthConfirmPage /> },
    ],
  },
]);

const subscribe = (onChange: () => void) => router.subscribe(onChange);
const pathname = () => router.state.location.pathname;

export function App() {
  // the open book's own theme in the reader (FR-THM-06); out here, so error screens are themed too
  useTheme(matchPath('/read/:documentId', useSyncExternalStore(subscribe, pathname))?.params.documentId);
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
      <UpdatePrompt />
    </>
  );
}
