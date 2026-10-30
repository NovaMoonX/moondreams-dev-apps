import { DreamerUIProvider } from '@moondreamsdev/dreamer-ui/providers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { AppCatalogContext } from '@hooks/useAppCatalog';
import { AuthContext } from '@hooks/useAuth';
import { APP_REGISTRY } from '@lib/app';
import { adminUsersQueryOptions } from '@lib/admin/adminQueries';
import { appUsageQueryKeys } from '@lib/appUsage/appUsageQueries';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';
import AdminDashboard from '@/screens/AdminDashboard';
import Home from '@/screens/Home';
import { store } from '@store/index';
import './index.css';

const params = new URLSearchParams(window.location.search);
const appCount = Number(params.get('apps') ?? APP_REGISTRY.length);
const isAdmin = params.get('admin') !== '0';
if (params.get('dark') === '1') document.documentElement.classList.add('dark');

const apps: AppMetadata[] = APP_REGISTRY.slice(0, appCount).map((app) => ({
  id: app.id,
  name: app.name,
  path: app.path,
  description: app.description,
  status: 'public',
  isRestricted: false,
  allowedUsers: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}));

const user = params.get('signedOut') === '1' ? null : ({
  uid: 'admin-uid',
  email: isAdmin ? 'nova@moondreams.dev' : 'sam@example.com',
  displayName: 'Nova',
  photoURL: null,
} as unknown as User);

const users: UserProfile[] = ['ava', 'ben', 'cleo', 'dev', 'eli'].map((name, index) => ({
  uid: `${name}-uid`,
  email: `${name}@example.com`,
  displayName: name[0].toUpperCase() + name.slice(1),
  photoURL: '',
  isAdmin: false,
  customPhotoURL: null,
  ...(index > 10 ? {} : {}),
})) as unknown as UserProfile[];

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
queryClient.setQueryData(adminUsersQueryOptions().queryKey, users);
queryClient.setQueryData(appUsageQueryKeys.siteVisits, []);
apps.forEach((app, index) =>
  queryClient.setQueryData(
    appUsageQueryKeys.forApp(app.id),
    users.slice(0, index + 1).map((profile) => ({
      uid: profile.uid,
      startedAt: Timestamp.fromMillis(Date.now() - 86_400_000 * 20),
      lastActiveAt: Timestamp.fromMillis(Date.now() - 86_400_000 * index),
    })),
  ),
);

const auth = {
  user,
  loading: false,
  isAdmin,
  signInWithGoogle: async () => undefined,
  logOut: async () => undefined,
  updateDisplayName: async () => undefined,
  updatePhotoURL: async () => undefined,
  setCurrentLocation: () => undefined,
  isDisplayNameUpdating: false,
};

const initialStarred = (params.get('starred') ?? '').split(',').filter(Boolean);

function Catalog({ children }: { children: React.ReactNode }) {
  const [starredAppIds, setStarredAppIds] = useState(initialStarred);
  const ordered = [
    ...starredAppIds.map((id) => apps.find((app) => app.id === id)).filter((app): app is AppMetadata => Boolean(app)),
    ...apps.filter((app) => !starredAppIds.includes(app.id)),
  ];
  const value = {
    ...catalog,
    apps: ordered,
    starredAppIds,
    setAppStarred: async (appId: string, isStarred: boolean) =>
      setStarredAppIds((current) => (isStarred ? [...current, appId] : current.filter((id) => id !== appId))),
  };
  return <AppCatalogContext.Provider value={value as never}>{children}</AppCatalogContext.Provider>;
}

const catalog = {
  apps,
  allApps: apps,
  appPathMap: Object.fromEntries(apps.map((app) => [app.path, app])),
  loading: false,
  updateAppMetadata: async () => undefined,
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <div className='bg-background/90 border-border fixed inset-x-0 top-0 z-40 flex h-16 items-center border-b px-4 text-sm font-semibold'>
        App header
      </div>
      {children}
    </NuqsAdapter>
  );
}

const router = createMemoryRouter([
  { path: '/admin', element: <Shell><AdminDashboard /></Shell> },
  { path: '*', element: <Shell><Home /></Shell> },
], { initialEntries: [params.get('path') ?? '/'] });

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <DreamerUIProvider>
        <AuthContext.Provider value={auth}>
          <Catalog>
            <RouterProvider router={router} />
          </Catalog>
        </AuthContext.Provider>
      </DreamerUIProvider>
    </QueryClientProvider>
  </Provider>,
);
