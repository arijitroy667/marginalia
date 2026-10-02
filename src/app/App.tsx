import { createBrowserRouter, RouterProvider } from 'react-router';
import { APP_NAME } from '../config';

const router = createBrowserRouter([
  { path: '/', element: <h1>{APP_NAME}</h1> },
  { path: '/login', element: <h1>Sign in</h1> },
  { path: '/read/:documentId', element: <h1>Reader</h1> },
  { path: '/settings', element: <h1>Settings</h1> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
