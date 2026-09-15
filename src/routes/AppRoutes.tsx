import { createBrowserRouter } from 'react-router-dom';

import ProtectedRoute from '@routes/ProtectedRoute';
import Home from '@screens/Home';
import Layout from '@ui/Layout';
import Loading from '@ui/Loading';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'worth-the-wait',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: WorthTheWait } =
            await import('@apps/worth-the-wait');
          return {
            Component: () => (
              <ProtectedRoute appId='worth-the-wait'>
                <WorthTheWait />
              </ProtectedRoute>
            ),
          };
        },
      },
      {
        path: 'nine-lives',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: NineLives } = await import('@apps/nine-lives');
          return {
            Component: () => (
              <ProtectedRoute appId='nine-lives'>
                <NineLives />
              </ProtectedRoute>
            ),
          };
        },
      },
      {
        path: 'apps/waypoint',
        lazy: async () => {
          const { default: Waypoint } =
            await import('@apps/waypoint/Waypoint');
          return { Component: Waypoint };
        },
      },
      {
        path: 'admin',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: AdminDashboard } = await import('@screens/AdminDashboard');
          return {
            Component: () => (
              <ProtectedRoute requireAdmin>
                <AdminDashboard />
              </ProtectedRoute>
            ),
          };
        },
      },
      {
        path: 'unauthorized',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: Unauthorized } = await import('@screens/Unauthorized');
          return { Component: Unauthorized };
        },
      },
      {
        path: '*',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: NotFound } = await import('@screens/NotFound');
          return { Component: NotFound };
        },
      },
    ],
  },
]);
