import { createBrowserRouter, RouterProvider } from 'react-router';
import { LibraryPage } from '../features/library/LibraryPage';
import { useTheme } from '../features/theme/useTheme';
import { en } from '../shared/i18n/en';
import { Toaster } from '../shared/ui/toast';
import { ErrorScreen } from './ErrorScreen';
import { Shell } from './Shell';
import { UpdatePrompt } from './UpdatePrompt';

const Page = ({ title }: { title: string }) => <h1 className="p-6 text-2xl font-semibold">{title}</h1>;

const router = createBrowserRouter([
  {
    errorElement: <ErrorScreen />,
    children: [
      {
        element: <Shell />,
        children: [
          { path: '/', element: <LibraryPage /> },
          { path: '/settings', element: <Page title={en.settings.title} /> },
        ],
      },
      // reader + PDF.js load on demand (NFR-PERF-08)
      { path: '/read/:documentId', lazy: async () => ({ Component: (await import('../features/reader/ReaderPage')).ReaderPage }) },
      { path: '/login', element: <Page title={en.auth.title} /> },
    ],
  },
]);

export function App() {
  useTheme();
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
      <UpdatePrompt />
    </>
  );
}
