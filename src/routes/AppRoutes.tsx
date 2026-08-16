import { createBrowserRouter } from 'react-router-dom';

import Home from '@ui/Home';
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
          return { Component: WorthTheWait };
        },
      },
    ],
  },
]);
