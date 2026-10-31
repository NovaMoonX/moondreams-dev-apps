import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';
import { createBrowserRouter } from 'react-router-dom';

import ProtectedRoute from '@routes/ProtectedRoute';
import ErrorBoundary from '@screens/ErrorBoundary';
import Home from '@screens/Home';
import Layout from '@ui/Layout';
import Loading from '@ui/Loading';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <NuqsAdapter>
        <Layout />
      </NuqsAdapter>
    ),
    errorElement: <ErrorBoundary />,
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
        path: 'waypoint',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: Waypoint } = await import('@apps/waypoint/Waypoint');
          return { Component: Waypoint };
        },
      },
      {
        path: 'a-list',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: AList } = await import('@apps/a-list/AList');
          return { Component: AList };
        },
      },
      {
        path: 'pinch',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: Pinch } = await import('@apps/pinch/Pinch');
          return { Component: Pinch };
        },
      },
      {
        path: 'runway',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: RunwayPage } =
            await import('@apps/runway/RunwayPage');
          return {
            Component: () => (
              <ProtectedRoute appId='runway' allowSignedOut>
                <RunwayPage />
              </ProtectedRoute>
            ),
          };
        },
      },
      {
        path: 'a-list/shared/:shareId',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: SharedCalendar } =
            await import('@apps/a-list/SharedCalendar');
          return { Component: SharedCalendar };
        },
      },
      {
        path: 'pinch/shared/:shareId',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: SharedPinch } =
            await import('@apps/pinch/SharedPinch');
          return { Component: SharedPinch };
        },
      },
      {
        path: 'admin',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: AdminDashboard } =
            await import('@screens/AdminDashboard');
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
        path: 'account',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: Account } = await import('@screens/Account');
          return { Component: Account };
        },
      },
      {
        path: 'inbox',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: Inbox } = await import('@screens/Inbox');
          return { Component: Inbox };
        },
      },
      {
        path: 'unauthorized',
        HydrateFallback: Loading,
        lazy: async () => {
          const { default: Unauthorized } =
            await import('@screens/Unauthorized');
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
